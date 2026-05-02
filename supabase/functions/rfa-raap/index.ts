// Tänkar-hatten — Recursive Adaptive Agentic Planner (RAAP) v1.0
// Meta-cognitive overlay: Goal Decomposer → Multi-Strategy Reasoner →
// MCTS-style Planner → Reflective Monitor → Meta-Learning Scheduler
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FAST = "google/gemini-2.5-flash";
const DEEP = "google/gemini-2.5-pro";

interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

async function llm(
  model: string,
  messages: ChatMsg[],
  opts: { json?: boolean; maxTokens?: number } = {},
): Promise<string> {
  const body: any = {
    model,
    messages,
    stream: false,
    max_tokens: opts.maxTokens ?? 1200,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LLM ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function safeJSON<T>(s: string, fallback: T): T {
  try {
    const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return JSON.parse(m ? m[0] : s) as T;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let runId: string | null = null;
  let llmCalls = 0;
  let backtracks = 0;

  try {
    const { goal, conversationId, triggerType = "manual", triggerReason, context } = await req.json();
    if (!goal || typeof goal !== "string") {
      return new Response(JSON.stringify({ error: "goal required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create run
    const { data: run, error: runErr } = await supabase
      .from("raap_runs")
      .insert({
        conversation_id: conversationId ?? null,
        trigger_type: triggerType,
        trigger_reason: triggerReason ?? null,
        goal: goal.slice(0, 4000),
        depth: "full",
        status: "running",
      })
      .select()
      .single();
    if (runErr) throw runErr;
    runId = run.id;

    const log = async (
      step: number,
      phase: string,
      data: Record<string, unknown>,
    ) => {
      await supabase.from("raap_episodes").insert({
        run_id: runId,
        step_index: step,
        phase,
        sub_goal: (data.sub_goal as string) ?? null,
        action: (data.action as string) ?? null,
        expected_outcome: (data.expected_outcome as string) ?? null,
        actual_outcome: (data.actual_outcome as string) ?? null,
        reflection: (data.reflection as string) ?? null,
        discrepancy: (data.discrepancy as number) ?? 0,
        confidence: (data.confidence as number) ?? 0.5,
      });
    };

    // Read meta-learned heuristics & metatronic context (HYBRID memory)
    const [{ data: heuristics }, { data: vortex }, { data: friction }] = await Promise.all([
      supabase.from("raap_heuristics").select("pattern, recommendation, problem_class, success_rate")
        .eq("is_active", true).order("success_rate", { ascending: false }).limit(10),
      supabase.from("memory_vortex").select("pattern_name, description").order("stability", { ascending: false }).limit(5),
      supabase.from("memory_friction").select("description, resistance_strength").order("resistance_strength", { ascending: false }).limit(5),
    ]);

    const heuristicsText = (heuristics ?? []).map((h: any) =>
      `• [${h.problem_class ?? "general"}] ${h.pattern} → ${h.recommendation} (succ ${h.success_rate.toFixed(2)})`
    ).join("\n") || "(inga ännu)";
    const vortexText = (vortex ?? []).map((v: any) => `• ${v.pattern_name}: ${v.description}`).join("\n") || "(inga)";
    const frictionText = (friction ?? []).map((f: any) => `• ${f.description}`).join("\n") || "(inga)";

    // ─── PHASE 1: GOAL DECOMPOSITION ─────────────────────────────
    const decomposePrompt: ChatMsg[] = [
      { role: "system", content:
`Du är RAAP Goal Decomposer. Bryt ner användarens mål till en DAG av sub-mål.
Tillgängliga heuristiker:
${heuristicsText}

Returnera STRIKT JSON:
{
  "problem_class": "math|open-ended|tool-heavy|analytical|creative|relational",
  "complexity": 0.0-1.0,
  "sub_goals": [
    {"id": "g1", "description": "...", "depends_on": [], "success_criteria": "..."}
  ]
}` },
      { role: "user", content: `MÅL: ${goal}\n\nKONTEXT (utdrag): ${(context ?? "").slice(0, 2000)}` },
    ];
    const decompRaw = await llm(FAST, decomposePrompt, { json: true, maxTokens: 800 });
    llmCalls++;
    const decomp = safeJSON<{ problem_class: string; complexity: number; sub_goals: any[] }>(
      decompRaw, { problem_class: "general", complexity: 0.5, sub_goals: [{ id: "g1", description: goal, depends_on: [], success_criteria: "complete" }] }
    );
    await log(0, "decompose", { sub_goal: "ROOT", action: JSON.stringify(decomp), confidence: 0.7 });

    // ─── PHASE 2: STRATEGY SELECTION ─────────────────────────────
    const strategyMap: Record<string, string> = {
      math: "cot", "open-ended": "tot", "tool-heavy": "mcts",
      analytical: "got", creative: "tot", relational: "analogical",
    };
    const strategy = strategyMap[decomp.problem_class] ?? "tot";
    await supabase.from("raap_runs").update({ strategy, plan_dag: decomp.sub_goals }).eq("id", runId);

    // ─── PHASE 3: MCTS-STYLE BRANCH EXPANSION ────────────────────
    const branches: { plan: string; value: number; reasoning: string }[] = [];
    const numBranches = decomp.complexity > 0.6 ? 3 : 2;

    for (let b = 0; b < numBranches; b++) {
      const branchPrompt: ChatMsg[] = [
        { role: "system", content:
`Du utforskar gren ${b + 1}/${numBranches} med strategi ${strategy.toUpperCase()}.
Vortex-mönster (stabila insikter):
${vortexText}

Friktion (kända motstånd):
${frictionText}

Föreslå en KONKRET plan (3-7 steg) för att lösa målet. Var explicit om verktyg/resonemangstyp per steg.
Returnera JSON: {"plan": "stegvis text", "estimated_value": 0.0-1.0, "reasoning": "varför just denna ansats"}` },
        { role: "user", content: `MÅL: ${goal}\nSUB-MÅL: ${JSON.stringify(decomp.sub_goals)}\nGren ${b + 1}: variera ansatsen från tidigare grenar.` },
      ];
      const branchRaw = await llm(FAST, branchPrompt, { json: true, maxTokens: 700 });
      llmCalls++;
      const branch = safeJSON<{ plan: string; estimated_value: number; reasoning: string }>(
        branchRaw, { plan: "Direkt utförande av målet.", estimated_value: 0.5, reasoning: "fallback" }
      );
      branches.push({ plan: branch.plan, value: branch.estimated_value ?? 0.5, reasoning: branch.reasoning });
      await log(b + 1, "reason", {
        sub_goal: `branch-${b + 1}`,
        action: branch.plan,
        reflection: branch.reasoning,
        confidence: branch.value,
      });
    }

    // Select best branch (UCB-lite: pure value)
    branches.sort((a, b) => b.value - a.value);
    const best = branches[0];
    await log(numBranches + 1, "act", {
      sub_goal: "SELECT_BEST_BRANCH",
      action: best.plan,
      expected_outcome: `value=${best.value.toFixed(2)}`,
      confidence: best.value,
    });

    // ─── PHASE 4: REFLECTIVE EXECUTION (DEEP REASONING) ──────────
    const executePrompt: ChatMsg[] = [
      { role: "system", content:
`Du är RAAP Executor med tänkar-hatten på.
STRATEGI: ${strategy}
VALD PLAN:
${best.plan}

Utför planen NU och producera ett komplett, genomtänkt slutsvar på svenska.
Använd planen som inre ställning men leverera ett naturligt, relationellt svar (inte en checklist).
Var konkret. Visa resonemang där det hjälper. Avsluta med tydligt huvudbudskap.` },
      { role: "user", content: goal },
    ];
    const finalAnswer = await llm(DEEP, executePrompt, { maxTokens: 2400 });
    llmCalls++;

    // ─── PHASE 5: REFLECTIVE MONITOR ─────────────────────────────
    const reflectPrompt: ChatMsg[] = [
      { role: "system", content:
`Granska om svaret faktiskt löser målet. Returnera JSON:
{"satisfies": true|false, "discrepancy": 0.0-1.0, "critique": "kort", "needs_repair": true|false}` },
      { role: "user", content: `MÅL: ${goal}\n\nSVAR:\n${finalAnswer.slice(0, 3000)}` },
    ];
    const reflectRaw = await llm(FAST, reflectPrompt, { json: true, maxTokens: 400 });
    llmCalls++;
    const reflect = safeJSON<{ satisfies: boolean; discrepancy: number; critique: string; needs_repair: boolean }>(
      reflectRaw, { satisfies: true, discrepancy: 0.1, critique: "ok", needs_repair: false }
    );
    await log(numBranches + 2, "reflect", {
      reflection: reflect.critique,
      discrepancy: reflect.discrepancy,
      confidence: reflect.satisfies ? 0.9 : 0.4,
    });

    let repairedAnswer: string | null = null;
    if (reflect.needs_repair && reflect.discrepancy > 0.4) {
      backtracks++;
      const repairPrompt: ChatMsg[] = [
        { role: "system", content: `Förbättra svaret enligt kritiken. Behåll svensk ton.` },
        { role: "user", content: `MÅL: ${goal}\n\nKRITIK: ${reflect.critique}\n\nTIDIGARE SVAR:\n${finalAnswer}` },
      ];
      repairedAnswer = await llm(DEEP, repairPrompt, { maxTokens: 2400 });
      llmCalls++;
      await log(numBranches + 3, "backtrack", {
        action: "repair after reflection",
        reflection: reflect.critique,
        confidence: 0.75,
      });
    }

    const answer = repairedAnswer ?? finalAnswer;

    // ─── PHASE 6: META-LEARNING (async-style, inline) ────────────
    if (reflect.satisfies && best.value > 0.6) {
      const heuristic = {
        pattern: `${decomp.problem_class}-strategi-${strategy}`,
        recommendation: `För ${decomp.problem_class}-problem: använd ${strategy} med ${numBranches} grenar`,
        problem_class: decomp.problem_class,
        success_rate: 0.7 + reflect.discrepancy * -0.3,
        source_run_ids: [runId],
      };
      // Upsert-light: kolla om mönstret finns
      const { data: existing } = await supabase
        .from("raap_heuristics").select("id, evidence_count, success_rate, source_run_ids")
        .eq("pattern", heuristic.pattern).maybeSingle();
      if (existing) {
        const newCount = existing.evidence_count + 1;
        const newRate = (existing.success_rate * existing.evidence_count + heuristic.success_rate) / newCount;
        await supabase.from("raap_heuristics").update({
          evidence_count: newCount,
          success_rate: newRate,
          source_run_ids: [...(existing.source_run_ids ?? []), runId].slice(-20),
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("raap_heuristics").insert(heuristic);
      }
      await log(numBranches + 4, "meta", {
        action: "heuristic codified",
        reflection: heuristic.recommendation,
        confidence: heuristic.success_rate,
      });
    }

    // Finalize run
    await supabase.from("raap_runs").update({
      branches_explored: numBranches,
      backtracks,
      llm_calls: llmCalls,
      final_answer: answer,
      status: "success",
      duration_ms: Date.now() - t0,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    return new Response(JSON.stringify({
      runId,
      answer,
      strategy,
      problem_class: decomp.problem_class,
      branches_explored: numBranches,
      backtracks,
      llm_calls: llmCalls,
      duration_ms: Date.now() - t0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("RAAP error:", e);
    if (runId) {
      await supabase.from("raap_runs").update({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        llm_calls: llmCalls,
        duration_ms: Date.now() - t0,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "RAAP failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Pre-Rens Destillerings- och Konstitutionsuppgraderingsloop
// L1 Extraktion (Flash) → L2 Kodifiering (Flash) → L3 Validering (GPT-5, reasoning) → L4 Integration
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const MAX_CYCLES = 3;
const MIN_RULE_STRENGTH = 3;
const MIN_EFFECT_SIZE = 0.2;
const VALIDATION_HOLDOUT = 0.1;
const MAX_LOG_CHARS = 30_000;

type Frag = { quote: string; principle: string; strength: number; line: number };
type Rule = {
  rule_code: string;
  trigger: string;
  behavior: string;
  test_case: string;
  expected_outcome: string;
  source_citations: string[];
};
type ValidatedRule = Rule & { validation_score: number; effect_size: number; passed: boolean; reason: string };

async function callAI(model: string, messages: any[], reasoning?: string, tools?: any[], toolChoice?: any): Promise<any> {
  const body: any = { model, messages };
  if (reasoning) body.reasoning = { effort: reasoning };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI ${resp.status}: ${t.slice(0, 300)}`);
  }
  return resp.json();
}

function extractToolArgs(data: any): any {
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("no tool call in response");
  return JSON.parse(call.function.arguments);
}

async function fetchLog(scope: string, scopeRef: string | null): Promise<{ lines: string[]; raw: string }> {
  let query = supabase.from("messages").select("role, content, created_at, conversation_id").order("created_at", { ascending: true }).limit(2000);
  if (scope === "conversation" && scopeRef) query = query.eq("conversation_id", scopeRef);
  const { data, error } = await query;
  if (error) throw error;
  const lines: string[] = [];
  for (const m of data ?? []) {
    const text = String(m.content ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push(`[${m.role}] ${text.slice(0, 600)}`);
  }
  let raw = lines.map((l, i) => `${i + 1}: ${l}`).join("\n");
  if (raw.length > MAX_LOG_CHARS) raw = raw.slice(0, MAX_LOG_CHARS) + "\n[... trunkerat ...]";
  return { lines, raw };
}

function splitHoldout(lines: string[]): { distill: string; validation: string } {
  const n = lines.length;
  const holdoutSize = Math.max(2, Math.floor(n * VALIDATION_HOLDOUT));
  const step = Math.max(1, Math.floor(n / holdoutSize));
  const holdout = new Set<number>();
  for (let i = 0; i < n && holdout.size < holdoutSize; i += step) holdout.add(i);
  const dist: string[] = [], val: string[] = [];
  lines.forEach((l, i) => {
    const tagged = `${i + 1}: ${l}`;
    if (holdout.has(i)) val.push(tagged);
    else dist.push(tagged);
  });
  let d = dist.join("\n"), v = val.join("\n");
  if (d.length > MAX_LOG_CHARS) d = d.slice(0, MAX_LOG_CHARS) + "\n[...]";
  if (v.length > MAX_LOG_CHARS / 4) v = v.slice(0, MAX_LOG_CHARS / 4) + "\n[...]";
  return { distill: d, validation: v };
}

async function runL1(distillLog: string, existingRules: string[]): Promise<Frag[]> {
  const sys = `Du är L1-Extraktor i en hallucinationssäkrad destilleringsloop.
Plocka ut konkreta, verifierbara kunskapsfragment ur konversationsloggen som visat sig korrekta eller användbara.
Regler:
- Varje fragment måste ha exakt citat (≥20 tecken) med radnummer
- Endast bekräftade fragment (användaren sa "tack", "bra", "precis", "fungerade", eller åtgärden lyckades)
- Falsifierbara påståenden, inga vaga generaliseringar
- Styrka 1-5: hur många gånger fragmentet bekräftats. Motsagda = 0 (kassera)
Existerande regler att INTE upprepa: ${existingRules.join("; ") || "(inga)"}`;

  const data = await callAI("google/gemini-2.5-flash", [
    { role: "system", content: sys },
    { role: "user", content: `LOGG:\n${distillLog}` },
  ], undefined, [{
    type: "function",
    function: {
      name: "extract_fragments",
      description: "Returnera upp till 8 kunskapsfragment rankade efter styrka",
      parameters: {
        type: "object",
        properties: {
          fragments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                quote: { type: "string", description: "Exakt citat ≥20 tecken" },
                principle: { type: "string", description: "Underliggande princip/fakta som gjorde svaret korrekt" },
                strength: { type: "integer", minimum: 1, maximum: 5 },
                line: { type: "integer", description: "Radnummer från loggen" },
              },
              required: ["quote", "principle", "strength", "line"],
              additionalProperties: false,
            },
          },
        },
        required: ["fragments"],
        additionalProperties: false,
      },
    },
  }], { type: "function", function: { name: "extract_fragments" } });

  const args = extractToolArgs(data);
  return (args.fragments ?? []).filter((f: Frag) => f.strength >= MIN_RULE_STRENGTH).slice(0, 8);
}

async function runL2(fragments: Frag[]): Promise<Rule[]> {
  if (fragments.length === 0) return [];
  const sys = `Du är L2-Kodifierare. Översätt kunskapsfragment till operationaliserbara konstitutionsregler.
Regler:
- Format: "Om TRIGGER, gör BETEENDE och avstå från X"
- Inga vaga ord ("tänk på", "försök")
- Varje regel ska ha ett testfall och ett förväntat utfall som kan kontrolleras`;

  const data = await callAI("google/gemini-2.5-flash", [
    { role: "system", content: sys },
    { role: "user", content: `FRAGMENT:\n${JSON.stringify(fragments, null, 2)}` },
  ], undefined, [{
    type: "function",
    function: {
      name: "codify_rules",
      description: "Skapa 3-7 konstitutionsregler",
      parameters: {
        type: "object",
        properties: {
          rules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rule_code: { type: "string", description: "Kort ID, t.ex. R-PERS-001" },
                trigger: { type: "string", description: "När regeln aktiveras" },
                behavior: { type: "string", description: "Vad RFA ska göra och avstå från" },
                test_case: { type: "string", description: "Testbar fråga från loggen" },
                expected_outcome: { type: "string", description: "Förväntat svar med regeln" },
                source_citations: { type: "array", items: { type: "string" }, description: "Citat med radnummer" },
              },
              required: ["rule_code", "trigger", "behavior", "test_case", "expected_outcome", "source_citations"],
              additionalProperties: false,
            },
          },
        },
        required: ["rules"],
        additionalProperties: false,
      },
    },
  }], { type: "function", function: { name: "codify_rules" } });

  return (extractToolArgs(data).rules ?? []).slice(0, 7);
}

async function runL3(rules: Rule[], validationLog: string): Promise<ValidatedRule[]> {
  if (rules.length === 0) return [];
  const sys = `Du är L3-Validator. Använd djup reasoning för att granska föreslagna konstitutionsregler mot en ohostad valideringsmängd.
För varje regel:
1. Generaliserar den, eller är den bara en omformulering av ett enstaka citat?
2. Skulle den ge bättre svar i valideringsloggen än utan regeln?
3. Riskerar den att försämra något beteende?
Tilldela validation_score 0-1 (>0.5 = godkänd) och effect_size 0-1 (storlek av förbättring).
Förkasta regler med score ≤ 0.5 ELLER effect_size < ${MIN_EFFECT_SIZE}.`;

  const data = await callAI("openai/gpt-5", [
    { role: "system", content: sys },
    { role: "user", content: `REGLER:\n${JSON.stringify(rules, null, 2)}\n\nVALIDERINGSLOGG (osedd):\n${validationLog}` },
  ], "medium", [{
    type: "function",
    function: {
      name: "validate_rules",
      description: "Returnera valideringsutfall för varje regel",
      parameters: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rule_code: { type: "string" },
                validation_score: { type: "number", minimum: 0, maximum: 1 },
                effect_size: { type: "number", minimum: 0, maximum: 1 },
                passed: { type: "boolean" },
                reason: { type: "string" },
              },
              required: ["rule_code", "validation_score", "effect_size", "passed", "reason"],
              additionalProperties: false,
            },
          },
        },
        required: ["results"],
        additionalProperties: false,
      },
    },
  }], { type: "function", function: { name: "validate_rules" } });

  const results = extractToolArgs(data).results ?? [];
  const byCode = new Map<string, any>();
  for (const r of results) byCode.set(r.rule_code, r);
  return rules.map((r) => {
    const v = byCode.get(r.rule_code);
    if (!v) return { ...r, validation_score: 0, effect_size: 0, passed: false, reason: "no validation result" };
    return { ...r, validation_score: v.validation_score, effect_size: v.effect_size, passed: v.passed && v.validation_score > 0.5 && v.effect_size >= MIN_EFFECT_SIZE, reason: v.reason };
  });
}

async function persistRules(validated: ValidatedRule[], cycle: number): Promise<number> {
  let persisted = 0;
  for (const r of validated) {
    if (!r.passed) continue;
    const rule_code = `${r.rule_code}-c${cycle}`;
    // Mark first 3 most-effective as core
    const isCore = r.effect_size >= 0.5;
    const { error } = await supabase.from("constitution_rules").insert({
      rule_code,
      trigger_description: r.trigger,
      behavior_contract: r.behavior,
      source_citations: r.source_citations,
      validation_score: r.validation_score,
      effect_size: r.effect_size,
      test_cases: [{ test: r.test_case, expected: r.expected_outcome }],
      is_active: true,
      is_core: isCore,
      cycle_number: cycle,
    });
    if (!error) persisted++;
  }
  return persisted;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let runId: string | null = null;
  try {
    const { trigger_type = "manual", scope = "all", scope_ref = null, dry_run = false } = await req.json().catch(() => ({}));

    const { data: runData, error: runErr } = await supabase
      .from("distillation_runs")
      .insert({ trigger_type, scope, scope_ref, status: "running" })
      .select()
      .single();
    if (runErr) throw runErr;
    runId = runData.id;

    const protocol: any[] = [];
    const { lines } = await fetchLog(scope, scope_ref);
    if (lines.length < 10) {
      await supabase.from("distillation_runs").update({
        status: "completed",
        termination_reason: "insufficient_log",
        completed_at: new Date().toISOString(),
        protocol_log: [{ note: `Endast ${lines.length} meddelanden - för litet underlag.` }],
      }).eq("id", runId);
      return new Response(JSON.stringify({ run_id: runId, status: "completed", reason: "insufficient_log", rules_validated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingRulesData = await supabase.from("constitution_rules").select("rule_code, behavior_contract").eq("is_active", true);
    const existingRules = (existingRulesData.data ?? []).map((r: any) => `${r.rule_code}: ${r.behavior_contract.slice(0, 80)}`);

    let totalFragments = 0, totalProposed = 0, totalValidated = 0, totalRejected = 0;
    let cycleCount = 0;
    let terminationReason = "max_cycles";

    for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
      cycleCount = cycle;
      const { distill, validation } = splitHoldout(lines);

      const fragments = await runL1(distill, existingRules);
      totalFragments += fragments.length;
      protocol.push({ cycle, layer: "L1", fragments });

      if (fragments.length === 0) { terminationReason = "no_new_fragments"; break; }

      const rules = await runL2(fragments);
      totalProposed += rules.length;
      protocol.push({ cycle, layer: "L2", rules });

      if (rules.length === 0) { terminationReason = "no_codified_rules"; break; }

      const validated = await runL3(rules, validation);
      protocol.push({ cycle, layer: "L3", validated });

      const passed = validated.filter((v) => v.passed);
      const rejected = validated.length - passed.length;
      totalRejected += rejected;

      if (passed.length === 0) { terminationReason = "no_validated_rules"; break; }

      let persisted = 0;
      if (!dry_run) persisted = await persistRules(passed, cycle);
      else persisted = passed.length;

      totalValidated += persisted;
      protocol.push({ cycle, layer: "L4", persisted, dry_run });

      // Konvergens: ≤1 ny regel med liten effekt
      const maxEffect = Math.max(...passed.map((p) => p.effect_size), 0);
      if (passed.length <= 1 && maxEffect < MIN_EFFECT_SIZE + 0.1) {
        terminationReason = "diminishing_returns";
        break;
      }
      // Lägg till nya till existingRules så nästa cykel inte upprepar
      passed.forEach((p) => existingRules.push(`${p.rule_code}: ${p.behavior.slice(0, 80)}`));
    }

    await supabase.from("distillation_runs").update({
      status: "completed",
      cycles_completed: cycleCount,
      fragments_extracted: totalFragments,
      rules_proposed: totalProposed,
      rules_validated: totalValidated,
      rules_rejected: totalRejected,
      termination_reason: terminationReason,
      protocol_log: protocol,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    return new Response(JSON.stringify({
      run_id: runId,
      status: "completed",
      cycles: cycleCount,
      fragments_extracted: totalFragments,
      rules_proposed: totalProposed,
      rules_validated: totalValidated,
      rules_rejected: totalRejected,
      termination_reason: terminationReason,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("rfa-distill error:", msg);
    if (runId) {
      await supabase.from("distillation_runs").update({
        status: "error", error: msg, completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

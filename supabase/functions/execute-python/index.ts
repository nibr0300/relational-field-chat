import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { executionId } = await req.json();
    if (!executionId) {
      return new Response(JSON.stringify({ error: "executionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load execution record
    const { data: exec, error: loadErr } = await supabase
      .from("executions")
      .select("*")
      .eq("id", executionId)
      .single();

    if (loadErr || !exec) {
      return new Response(JSON.stringify({ error: "Execution not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (exec.status !== "approved") {
      return new Response(JSON.stringify({ error: "Execution not approved" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Command Algebra: PRE-condition gate ───────────────────────────
    const preconditions = Array.isArray(exec.preconditions) ? exec.preconditions : [];
    const postconditions = Array.isArray(exec.postconditions) ? exec.postconditions : [];
    const invariantResults: Record<string, { passed: boolean; value?: unknown; error?: string }> = {};

    if (preconditions.length > 0) {
      const preCheck = await evaluateAssertions(preconditions, { code: exec.code, phase: "pre" });
      Object.assign(invariantResults, preCheck.results);
      if (!preCheck.allPassed) {
        await supabase.from("executions").update({
          status: "error",
          error: `Precondition(s) failed: ${preCheck.failed.join(", ")}`,
          invariant_results: invariantResults,
          invariant_status: "pre_failed",
          field_impact: { fz: 0.95, fy: 0.05 },
          completed_at: new Date().toISOString(),
        }).eq("id", executionId);
        return new Response(JSON.stringify({
          status: "error",
          error: "Precondition gate failed",
          invariant_results: invariantResults,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Mark as running
    await supabase
      .from("executions")
      .update({ status: "running" })
      .eq("id", executionId);

    // Use AI gateway to simulate Python execution
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a Python execution environment simulator. Execute the given Python code mentally and return ONLY the output that would appear in stdout/stderr. Be accurate and precise.

Rules:
- If the code would produce output via print(), show that output exactly
- If the code produces a data structure (list, dict, DataFrame), show its repr
- If the code has errors, show the exact Python traceback
- If the code generates files, describe what would be created
- Do NOT add explanations or commentary — only show raw execution output
- If no output, respond with: [No output]

Format your response as:
\`\`\`output
<the actual output>
\`\`\`

Then on a new line, provide a JSON status block:
\`\`\`json
{"success": true/false, "fz": 0.0-1.0, "fy": 0.0-1.0}
\`\`\`
Where fz = friction/difficulty encountered, fy = success/pleasure metric.`,
          },
          {
            role: "user",
            content: `Execute this Python script:\n\n\`\`\`python\n${exec.code}\n\`\`\``,
          },
        ],
        stream: false,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI execution error:", errText);
      await supabase.from("executions").update({
        status: "error",
        error: `AI gateway error: ${aiResp.status}`,
        field_impact: { fz: 0.9, fy: 0.1 },
        completed_at: new Date().toISOString(),
      }).eq("id", executionId);

      return new Response(JSON.stringify({ error: "Execution failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || "[No output]";

    // Parse output and status from response
    const outputMatch = content.match(/```output\n([\s\S]*?)```/);
    const jsonMatch = content.match(/```json\n([\s\S]*?)```/);

    const output = outputMatch ? outputMatch[1].trim() : content;
    let success = true;
    let fieldImpact = { fz: 0.1, fy: 0.9 };

    if (jsonMatch) {
      try {
        const status = JSON.parse(jsonMatch[1].trim());
        success = status.success ?? true;
        fieldImpact = { fz: status.fz ?? 0.1, fy: status.fy ?? 0.9 };
      } catch { /* use defaults */ }
    }

    // ── Command Algebra: POST-condition gate ───────────────────────────
    let invariantStatus: "passed" | "post_failed" | "unchecked" =
      preconditions.length === 0 && postconditions.length === 0 ? "unchecked" : "passed";

    if (postconditions.length > 0) {
      const postCheck = await evaluateAssertions(postconditions, {
        code: exec.code,
        output,
        success,
        phase: "post",
      });
      Object.assign(invariantResults, postCheck.results);
      if (!postCheck.allPassed) {
        invariantStatus = "post_failed";
        success = false;
      }
    }

    // Update execution record
    await supabase.from("executions").update({
      status: success ? "success" : "error",
      output,
      error: success ? null : (invariantStatus === "post_failed"
        ? `Postcondition(s) failed: ${Object.entries(invariantResults).filter(([, r]) => !r.passed).map(([n]) => n).join(", ")}`
        : output),
      field_impact: fieldImpact,
      invariant_results: invariantResults,
      invariant_status: invariantStatus,
      completed_at: new Date().toISOString(),
    }).eq("id", executionId);

    return new Response(JSON.stringify({
      status: success ? "success" : "error",
      output,
      field_impact: fieldImpact,
      invariant_results: invariantResults,
      invariant_status: invariantStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("execute-python error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Assertion evaluator (uses AI gateway for natural-language predicates) ───
type Assertion = { name: string; expression: string };

async function evaluateAssertions(
  assertions: Assertion[],
  ctx: Record<string, unknown>
): Promise<{ allPassed: boolean; failed: string[]; results: Record<string, { passed: boolean; value?: unknown; error?: string }> }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const results: Record<string, { passed: boolean; value?: unknown; error?: string }> = {};
  const failed: string[] = [];

  if (!LOVABLE_API_KEY) {
    for (const a of assertions) results[a.name] = { passed: false, error: "no API key" };
    return { allPassed: false, failed: assertions.map((a) => a.name), results };
  }

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are an invariant verifier. Given a context and a list of assertions (name + natural-language predicate), decide for EACH whether it holds. Reply ONLY with strict JSON of shape:
{"results": [{"name": "...", "passed": true|false, "reason": "short"}]}
No prose, no code fences.`,
          },
          {
            role: "user",
            content: `Context:\n${JSON.stringify(ctx).slice(0, 4000)}\n\nAssertions:\n${JSON.stringify(assertions)}`,
          },
        ],
        stream: false,
      }),
    });

    if (!resp.ok) throw new Error(`gateway ${resp.status}`);
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    for (const r of parsed.results ?? []) {
      results[r.name] = { passed: !!r.passed, value: r.reason };
      if (!r.passed) failed.push(r.name);
    }
    for (const a of assertions) {
      if (!(a.name in results)) {
        results[a.name] = { passed: false, error: "not evaluated" };
        failed.push(a.name);
      }
    }
  } catch (e) {
    for (const a of assertions) {
      results[a.name] = { passed: false, error: e instanceof Error ? e.message : "eval error" };
      failed.push(a.name);
    }
  }

  return { allPassed: failed.length === 0, failed, results };
}


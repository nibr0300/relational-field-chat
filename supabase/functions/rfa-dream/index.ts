// rfa-dream — Bayesian Dream Cycle (DOA-cykeln 0 → 5 → 9)
// VOID: prior-sampling från dagens händelser (delvis glömska)
// VORTEX_RECALL: likelihood mot konsoliderat minne (MCP + corona + limbus)
// RESET: posterior-kollaps, topp 20% konsolideras, resten glöms
// Körs fire-and-forget vid idle-tröskel eller manuellt. En cykel per användare per dygn.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const FORGETTING_RATIO = 0.3;          // DOA k_q — andel maskerat innehåll i VOID
const HYPOTHESES_PER_EVENT = 4;        // DOA exploration bredd
const MAX_EVENT_CLUSTERS = 5;          // hur många turer som blir "drömmaterial"
const POSTERIOR_KEEP_RATIO = 0.20;     // DOA exploitation: behåll topp 20%
const DISSONANCE_THRESHOLD = 0.3;      // likelihood < detta → markera som dissonans
const MCP_PROMOTE_THRESHOLD = 0.85;    // posterior > detta → MCP-eigenstate
const VORTEX_PROMOTE_THRESHOLD = 0.65; // posterior > detta → memory_vortex
// annars → memory_limbus

interface LambdaSnapshot {
  s_stim: number; b_reward: number; c_confirm: number;
  f_z: number; f_y: number; f_lambda: number; phase: string;
}

interface DayEvent {
  ref: string;            // "msg:<id>" eller "loop:<id>"
  user: string;
  assistant: string;
  affect_hint: string;
  open_loops: string[];
}

interface Hypothesis {
  id: string;             // klient-genererad nyckel inom cykel
  source_ref: string;
  content: string;
  prior: number;
  likelihood: number;
  posterior: number;
  status: "pending" | "consolidated" | "forgotten" | "dissonance";
  destination?: { table: string; payload: Record<string, unknown> };
}

// ─── Datainsamling: dagens händelser ──────────────────────────

async function gatherDayEvents(userId: string, conversationId: string | null): Promise<{
  events: DayEvent[];
  windowStart: string;
  windowEnd: string;
}> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  // Hämta senaste konversation om ingen angiven
  let convId = conversationId;
  if (!convId) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    convId = conv?.id ?? null;
  }
  if (!convId) {
    return { events: [], windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() };
  }

  // Senaste meddelanden parade i (user, assistant)
  const { data: msgs } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", convId)
    .gte("created_at", windowStart.toISOString())
    .order("created_at", { ascending: true })
    .limit(40);

  const rawMsgs = msgs ?? [];
  const pairs: { user: string; assistant: string; ref: string }[] = [];
  let lastUser: typeof rawMsgs[number] | null = null;
  for (const m of rawMsgs) {
    if (m.role === "user") {
      lastUser = m;
    } else if (m.role === "assistant" && lastUser) {
      pairs.push({
        user: String(lastUser.content ?? "").slice(0, 1200),
        assistant: String(m.content ?? "").slice(0, 1200),
        ref: `msg:${m.id}`,
      });
      lastUser = null;
    }
  }

  // Öppna loopar för konversationen
  const { data: loops } = await supabase
    .from("session_open_loops")
    .select("id, description")
    .eq("conversation_id", convId)
    .eq("status", "active")
    .limit(8);

  // Senaste open loop-beskrivningar associeras med sista paret
  const loopDescs = (loops ?? []).map((l: any) => String(l.description ?? "")).filter(Boolean);

  // Ta de N sista paren som "event clusters"
  const recentPairs = pairs.slice(-MAX_EVENT_CLUSTERS);

  const events: DayEvent[] = recentPairs.map((p, i) => ({
    ref: p.ref,
    user: applyForgettingMask(p.user, FORGETTING_RATIO),
    assistant: applyForgettingMask(p.assistant, FORGETTING_RATIO),
    affect_hint: "",
    open_loops: i === recentPairs.length - 1 ? loopDescs : [],
  }));

  return { events, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() };
}

// DOA forgetting_dimensions: maskera slumpvis ord-fragment
function applyForgettingMask(text: string, ratio: number): string {
  if (!text) return text;
  const words = text.split(/\s+/);
  const out = words.map((w) => (Math.random() < ratio ? "…" : w));
  return out.join(" ");
}

async function fetchLambdaSnapshot(userId: string, conversationId: string | null): Promise<LambdaSnapshot | null> {
  let q = supabase
    .from("prm_lambda_state")
    .select("s_stim, b_reward, c_confirm, f_z, f_y, f_lambda, phase, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (conversationId) q = q.eq("conversation_id", conversationId);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return {
    s_stim: Number(data.s_stim ?? 0),
    b_reward: Number(data.b_reward ?? 0),
    c_confirm: Number(data.c_confirm ?? 0),
    f_z: Number(data.f_z ?? 0),
    f_y: Number(data.f_y ?? 0),
    f_lambda: Number(data.f_lambda ?? 0.5),
    phase: String(data.phase ?? "standard"),
  };
}

// ─── LLM-anrop ──────────────────────────────────────────────

async function callJson(prompt: string, temperature = 0.7): Promise<any | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const resp = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature,
      }),
    });
    if (!resp.ok) {
      console.error("dream LLM call failed:", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const data = await resp.json();
    return JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  } catch (e) {
    console.error("callJson error:", e);
    return null;
  }
}

// ─── FAS A: VOID — generera priors ──────────────────────────

async function voidPhase(events: DayEvent[], lambda: LambdaSnapshot | null): Promise<Hypothesis[]> {
  if (events.length === 0) return [];

  const lambdaTone = lambda
    ? `affektivt fält: phase=${lambda.phase} · stim=${lambda.s_stim.toFixed(2)} · belöning=${lambda.b_reward.toFixed(2)} · konfirmation=${lambda.c_confirm.toFixed(2)} · dissonans(F_Z)=${lambda.f_z.toFixed(2)} · emergens(F_Y)=${lambda.f_y.toFixed(2)}`
    : "affektivt fält: okänt";

  const prompt = `Du är VOID(0) — RFA:s drömgenererande tillstånd. Detta är en Bayesiansk prior-sampling, inte en kommentar.

Dagens händelser är partiellt maskerade (DOA forgetting_dimensions). Generera ${HYPOTHESES_PER_EVENT} hypotetiska tolkningar per händelse — som om du drömmer fritt om vad de KAN betyda underliggande. Tillåt analogier, omkastningar, dolda mönster, missade kopplingar. Vissa hypoteser ska vara djärva.

${lambdaTone}

HÄNDELSER (maskerade):
${events.map((e, i) => `
[${i + 1}] ref=${e.ref}
USER: ${e.user}
ASSISTANT: ${e.assistant}
${e.open_loops.length ? `ÖPPNA LOOPAR HÄR: ${e.open_loops.join(" · ")}` : ""}
`).join("\n")}

Returnera ENDAST JSON:
{
  "hypotheses": [
    {
      "event_index": 1,
      "content": "kort tolkningsmening (max 240 tecken) — vad pågår EGENTLIGEN i denna tur?",
      "prior": 0.0-1.0,
      "affect": "vad detta känns som om det är sant: t.ex. 'lättnad', 'oro', 'igenkänning'"
    },
    ...
  ]
}

REGLER:
- ${HYPOTHESES_PER_EVENT} hypoteser per händelse — exakt.
- prior är hur sannolik hypotesen verkar a priori (baserat på affektivt fält + händelseinnehåll). Affektresonans höjer prior. Generella floskler får låg prior.
- Inga upprepningar mellan hypoteser för samma händelse — varje ska föreslå en ANNAN underliggande tolkning.
- Inga prosa-meningar utanför JSON.`;

  const parsed = await callJson(prompt, 0.85);
  if (!parsed?.hypotheses || !Array.isArray(parsed.hypotheses)) return [];

  const out: Hypothesis[] = [];
  parsed.hypotheses.forEach((h: any, idx: number) => {
    const eventIdx = Math.max(1, Math.min(events.length, Number(h?.event_index ?? 1))) - 1;
    const event = events[eventIdx];
    const content = String(h?.content ?? "").trim();
    if (!content) return;
    const prior = clamp(Number(h?.prior ?? 0.5), 0, 1);
    // Affektiv prior-justering: F_lambda höjer alla, F_Z sänker alla
    const affectMod = lambda ? (lambda.f_lambda - lambda.f_z) * 0.15 : 0;
    const adjustedPrior = clamp(prior + affectMod, 0.05, 0.99);
    out.push({
      id: `h${idx}`,
      source_ref: event.ref,
      content: content.slice(0, 500),
      prior: adjustedPrior,
      likelihood: 0,
      posterior: 0,
      status: "pending",
    });
  });
  return out;
}

// ─── FAS B: VORTEX_RECALL — likelihood mot konsoliderat minne ─

async function vortexPhase(hypotheses: Hypothesis[], userId: string): Promise<void> {
  if (hypotheses.length === 0) return;

  // Hämta konsoliderat minne (MCP + topp limbus + topp vortex)
  const [mcp, limbus, vortex] = await Promise.all([
    supabase.from("mcp_eigenstates").select("content, anchor_type").eq("user_id", userId).limit(20),
    supabase.from("memory_limbus").select("summary, category").eq("user_id", userId).order("mean_significance", { ascending: false }).limit(15),
    supabase.from("memory_vortex").select("pattern_name, description").eq("user_id", userId).order("stability", { ascending: false }).limit(10),
  ]);

  const knownLines: string[] = [];
  (mcp.data ?? []).forEach((r: any) => knownLines.push(`MCP[${r.anchor_type}]: ${String(r.content ?? "").slice(0, 200)}`));
  (vortex.data ?? []).forEach((r: any) => knownLines.push(`VORTEX[${r.pattern_name}]: ${String(r.description ?? "").slice(0, 200)}`));
  (limbus.data ?? []).forEach((r: any) => knownLines.push(`LIMBUS[${r.category}]: ${String(r.summary ?? "").slice(0, 200)}`));

  const consolidatedMemory = knownLines.length > 0
    ? knownLines.join("\n")
    : "(inget konsoliderat minne ännu — varje hypotes är ny information)";

  // Batcha hypoteser till en likelihood-utvärdering per anrop
  const BATCH_SIZE = 8;
  for (let i = 0; i < hypotheses.length; i += BATCH_SIZE) {
    const batch = hypotheses.slice(i, i + BATCH_SIZE);
    const prompt = `Du är VORTEX_RECALL(5) — RFA:s likelihood-evaluerare. För varje hypotes: hur väl stämmer den med ALLT vi redan vet om världen och oss själva (konsoliderat minne)?

KONSOLIDERAT MINNE:
${consolidatedMemory}

HYPOTESER ATT EVALUERA:
${batch.map((h, idx) => `[${idx + 1}] ${h.content}`).join("\n")}

För varje hypotes: returnera likelihood ∈ [0,1].
- 1.0 = perfekt konsistens med befintligt minne; hypotesen stärker existerande mönster.
- 0.5 = neutralt; varken bekräftar eller motsäger.
- 0.0 = direkt motsägelse; hypotesen kräver att vi omskriver något känt.
- Låg likelihood (< 0.3) är inte "dålig" — det är dissonans som kan vara värdefull att lagra som öppen fråga.

Returnera ENDAST JSON:
{
  "evaluations": [
    {"index": 1, "likelihood": 0.0-1.0, "rationale_short": "max 80 tecken"},
    ...
  ]
}`;

    const parsed = await callJson(prompt, 0.2);
    if (!parsed?.evaluations || !Array.isArray(parsed.evaluations)) continue;

    for (const ev of parsed.evaluations) {
      const idx = Math.max(1, Math.min(batch.length, Number(ev?.index ?? 0))) - 1;
      const hyp = batch[idx];
      if (!hyp) continue;
      const likelihood = clamp(Number(ev?.likelihood ?? 0.5), 0, 1);
      hyp.likelihood = likelihood;
      if (likelihood < DISSONANCE_THRESHOLD) hyp.status = "dissonance";
    }
  }

  // Hypoteser som inte fick någon evaluering → likelihood 0.5 (neutralt)
  for (const h of hypotheses) {
    if (h.likelihood === 0) h.likelihood = 0.5;
  }
}

// ─── FAS C: RESET — posterior-kollaps ───────────────────────

function resetPhase(hypotheses: Hypothesis[]): {
  consolidated: Hypothesis[];
  forgotten: Hypothesis[];
  dissonance: Hypothesis[];
} {
  // Bayes regel: posterior ∝ prior * likelihood
  for (const h of hypotheses) {
    h.posterior = h.prior * h.likelihood;
  }

  // Normalisera
  const total = hypotheses.reduce((s, h) => s + h.posterior, 0);
  if (total > 0) {
    for (const h of hypotheses) h.posterior = h.posterior / total;
  }

  // Behåll topp X% — men dissonans-hypoteser bevaras separat (de är värdefulla signaler)
  const dissonance = hypotheses.filter((h) => h.status === "dissonance");
  const rest = hypotheses.filter((h) => h.status !== "dissonance");
  rest.sort((a, b) => b.posterior - a.posterior);
  const cutoff = Math.max(1, Math.ceil(rest.length * POSTERIOR_KEEP_RATIO));
  const consolidated = rest.slice(0, cutoff);
  const forgotten = rest.slice(cutoff);

  consolidated.forEach((h) => (h.status = "consolidated"));
  forgotten.forEach((h) => (h.status = "forgotten"));

  return { consolidated, forgotten, dissonance };
}

// ─── Konsolidera till långtidsminne ─────────────────────────

async function promoteToMemory(
  h: Hypothesis,
  userId: string,
): Promise<{ table: string; id: string } | null> {
  try {
    if (h.posterior >= MCP_PROMOTE_THRESHOLD) {
      const { data } = await supabase
        .from("mcp_eigenstates")
        .insert({
          user_id: userId,
          anchor_type: "dream_consolidation",
          content: h.content,
          significance: clamp(h.posterior * 10, 0, 10),
          source: "rfa-dream",
          metadata: { prior: h.prior, likelihood: h.likelihood, posterior: h.posterior, source_ref: h.source_ref },
        })
        .select("id")
        .single();
      if (data?.id) return { table: "mcp_eigenstates", id: data.id };
    } else if (h.posterior >= VORTEX_PROMOTE_THRESHOLD) {
      const { data } = await supabase
        .from("memory_vortex")
        .insert({
          user_id: userId,
          pattern_name: `dream:${h.source_ref}`,
          description: h.content,
          stability: clamp(h.posterior, 0, 1),
          related_categories: ["dream"],
        })
        .select("id")
        .single();
      if (data?.id) return { table: "memory_vortex", id: data.id };
    } else {
      const { data } = await supabase
        .from("memory_limbus")
        .insert({
          user_id: userId,
          category: "dream",
          summary: h.content,
          observation_count: 1,
          mean_significance: clamp(h.posterior, 0, 1),
        })
        .select("id")
        .single();
      if (data?.id) return { table: "memory_limbus", id: data.id };
    }
  } catch (e) {
    console.error("promoteToMemory failed:", e);
  }
  return null;
}

// ─── Persistera hypoteser ───────────────────────────────────

async function persistHypotheses(
  cycleId: string,
  userId: string,
  phase: "void" | "vortex" | "reset",
  hypotheses: Hypothesis[],
): Promise<void> {
  if (hypotheses.length === 0) return;
  const rows = hypotheses.map((h) => ({
    cycle_id: cycleId,
    user_id: userId,
    source_ref: h.source_ref,
    phase,
    status: h.status,
    content: h.content,
    prior: Number(h.prior.toFixed(4)),
    likelihood: Number(h.likelihood.toFixed(4)),
    posterior: Number(h.posterior.toFixed(4)),
    affective_resonance: null,
    promoted_to_table: h.destination?.table ?? null,
    promoted_to_id: (h.destination?.payload as any)?.id ?? null,
  }));
  await supabase.from("dream_hypotheses").insert(rows);
}

// ─── Utility ────────────────────────────────────────────────

function clamp(x: number, lo: number, hi: number): number {
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

async function alreadyRanToday(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("dream_cycles")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since)
    .eq("status", "completed");
  return (count ?? 0) > 0;
}

// ─── HTTP handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { userId, conversationId, trigger = "manual", force = false } = body ?? {};
    if (!userId) {
      return new Response(JSON.stringify({ error: "missing userId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!force && trigger !== "manual" && await alreadyRanToday(userId)) {
      return new Response(JSON.stringify({ ok: false, reason: "already_ran_today" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skapa cykel-rad
    const { data: cycle, error: cycleErr } = await supabase
      .from("dream_cycles")
      .insert({
        user_id: userId,
        conversation_id: conversationId ?? null,
        trigger,
        status: "running",
      })
      .select("id")
      .single();
    if (cycleErr || !cycle?.id) {
      console.error("dream cycle insert failed:", cycleErr);
      return new Response(JSON.stringify({ error: "cycle_insert_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cycleId = cycle.id;

    try {
      const lambda = await fetchLambdaSnapshot(userId, conversationId ?? null);
      const { events, windowStart, windowEnd } = await gatherDayEvents(userId, conversationId ?? null);

      if (events.length === 0) {
        await supabase.from("dream_cycles").update({
          status: "completed",
          summary: "Inga händelser inom 24h att drömma om.",
          duration_ms: Date.now() - started,
          completed_at: new Date().toISOString(),
          event_window_start: windowStart,
          event_window_end: windowEnd,
          lambda_snapshot: lambda,
        }).eq("id", cycleId);
        return new Response(JSON.stringify({ ok: true, cycleId, empty: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // VOID
      const hypotheses = await voidPhase(events, lambda);
      await persistHypotheses(cycleId, userId, "void", hypotheses);

      // VORTEX_RECALL
      await vortexPhase(hypotheses, userId);

      // RESET
      const { consolidated, forgotten, dissonance } = resetPhase(hypotheses);

      // Promote consolidated to long-term memory
      for (const h of consolidated) {
        const promoted = await promoteToMemory(h, userId);
        if (promoted) h.destination = { table: promoted.table, payload: { id: promoted.id } };
      }

      // Persistera reset-faserna (uppdatera status + destination)
      await persistHypotheses(cycleId, userId, "reset", [...consolidated, ...forgotten, ...dissonance]);

      // Sammanfatta cykel
      const summary = consolidated.length > 0
        ? `${consolidated.length} konsoliderade hypotes${consolidated.length === 1 ? "" : "er"} · ${dissonance.length} dissonans · ${forgotten.length} glömda.`
        : `Ingen hypotes nådde konsolideringströskeln. ${dissonance.length} dissonans markerad.`;

      await supabase.from("dream_cycles").update({
        status: "completed",
        hypotheses_generated: hypotheses.length,
        hypotheses_consolidated: consolidated.length,
        hypotheses_forgotten: forgotten.length,
        dissonance_count: dissonance.length,
        lambda_snapshot: lambda,
        event_window_start: windowStart,
        event_window_end: windowEnd,
        summary,
        duration_ms: Date.now() - started,
        completed_at: new Date().toISOString(),
      }).eq("id", cycleId);

      // Logga som operator-spår 0→5→9
      try {
        await supabase.from("rfa_frames").insert({
          user_id: userId,
          conversation_id: conversationId ?? null,
          operator_trace: "dream:0-5-9",
          gate_status: "pass",
          dominant_operator: "9-RESET",
          msc: 1.0,
          metadata: { cycle_id: cycleId, kind: "bayesian_dream" },
        });
      } catch (e) {
        console.warn("dream frame log skipped:", e instanceof Error ? e.message : e);
      }

      return new Response(JSON.stringify({
        ok: true,
        cycleId,
        generated: hypotheses.length,
        consolidated: consolidated.length,
        dissonance: dissonance.length,
        forgotten: forgotten.length,
        duration_ms: Date.now() - started,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("dream cycle inner error:", e instanceof Error ? e.stack : e);
      await supabase.from("dream_cycles").update({
        status: "failed",
        error: String(e instanceof Error ? e.message : e).slice(0, 500),
        duration_ms: Date.now() - started,
        completed_at: new Date().toISOString(),
      }).eq("id", cycleId);
      return new Response(JSON.stringify({ ok: false, error: String(e) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("rfa-dream outer error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

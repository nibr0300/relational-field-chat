// rfa-episodic — Session Episodic Layer (BREATH(8) carrier)
// Maintains a rolling session digest + open-loops list per conversation.
// Called fire-and-forget after each assistant turn by rfa-chat.
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
const MODEL = "google/gemini-2.5-flash-lite";
const MAX_TIMELINE = 18;
const MAX_ARTIFACTS = 20;
const MAX_DIGEST_CHARS = 2800;

interface EpisodicState {
  focus: string;
  timeline: string[];
  artifacts: string[];
  open_threads: string[];
  affective_residue: Record<string, number>;
  digest: string;
  turn_count: number;
}

interface OpenLoop {
  id?: string;
  description: string;
  urgency: number;
  closure_conditions: string[];
  status: "active" | "closed" | "suspended";
}

const EMPTY_STATE: EpisodicState = {
  focus: "",
  timeline: [],
  artifacts: [],
  open_threads: [],
  affective_residue: {},
  digest: "",
  turn_count: 0,
};

async function loadState(conversationId: string): Promise<EpisodicState> {
  const { data } = await supabase
    .from("session_episodic")
    .select("focus, timeline, artifacts, open_threads, affective_residue, digest, turn_count")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!data) return { ...EMPTY_STATE };
  return {
    focus: data.focus ?? "",
    timeline: Array.isArray(data.timeline) ? data.timeline : [],
    artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
    open_threads: Array.isArray(data.open_threads) ? data.open_threads : [],
    affective_residue: (data.affective_residue ?? {}) as Record<string, number>,
    digest: data.digest ?? "",
    turn_count: data.turn_count ?? 0,
  };
}

async function loadActiveLoops(conversationId: string): Promise<OpenLoop[]> {
  const { data } = await supabase
    .from("session_open_loops")
    .select("id, description, urgency, closure_conditions, status")
    .eq("conversation_id", conversationId)
    .eq("status", "active")
    .order("urgency", { ascending: false })
    .limit(12);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    description: r.description,
    urgency: Number(r.urgency ?? 0.5),
    closure_conditions: Array.isArray(r.closure_conditions) ? r.closure_conditions : [],
    status: r.status ?? "active",
  }));
}

function buildPrompt(
  prev: EpisodicState,
  loops: OpenLoop[],
  userText: string,
  assistantText: string,
): string {
  return `Du underhåller en KOMPRIMERAD SESSIONSRYGGRAD för ett AI-system (RFA). Detta är inte konversation utan en levande digest som ÖVERLEVER meddelande-trunkering.

NUVARANDE TILLSTÅND:
focus: ${prev.focus || "(tomt)"}
timeline (äldst→nyast, max ${MAX_TIMELINE}):
${prev.timeline.map((t, i) => `  ${i + 1}. ${t}`).join("\n") || "  (tom)"}
artifacts (konkreta filnamn/fel/kommandon, max ${MAX_ARTIFACTS}):
${prev.artifacts.map((a) => `  - ${a}`).join("\n") || "  (tom)"}
open_threads (öppna spår som inte är konkreta krav):
${prev.open_threads.map((o) => `  - ${o}`).join("\n") || "  (tom)"}

AKTIVA ÖPPNA LOOPAR (olösta konkreta krav):
${loops.map((l, i) => `  ${i + 1}. [${l.urgency.toFixed(2)}] ${l.description} — stängs av: ${l.closure_conditions.join(" | ") || "(odefinierat)"}`).join("\n") || "  (inga)"}

NY TUR:
[ANVÄNDARE]:
${userText.slice(0, 6000)}

[ASSISTENT]:
${assistantText.slice(0, 6000)}

UPPDRAG: Uppdatera ryggraden. Returnera ENDAST giltig JSON enligt schema:
{
  "focus": "en mening om vad samtalet handlar om JUST NU (max 200 tecken)",
  "timeline_add": ["nya bullets (max 3) i form 'verb + objekt' — tidpunkt impliceras av ordning"],
  "timeline_drop_indices": [],
  "artifacts_add": ["nya konkreta artefakter: filnamn, exakta felmeddelanden, commit-hashar, kommandon"],
  "open_threads_add": ["nya diffusa spår som inte kvalificerar som open_loop"],
  "open_threads_drop": ["spår som nu är lösta eller övergivna — exakt sträng från listan ovan"],
  "loops_open": [{"description":"konkret krav","urgency":0.0-1.0,"closure_conditions":["mätbar villkor","..."]}],
  "loops_close": [{"description":"matchas mot befintlig loop via substringa","outcome":"vad som stängde den"}]
}

REGLER:
- focus: skriv om från grunden varje tur, kort.
- timeline: bara substantiella händelser (beslut, problem, lösningar). Inte artighet.
- artifacts: ENDAST konkreta strängar som kan refereras tillbaka (filnamn, felkoder, paketnamn).
- loops_open: skapa endast när användaren ställer en konkret fråga eller begär en åtgärd som inte slutförts i denna tur.
- loops_close: matcha mot AKTIVA ÖPPNA LOOPAR ovan. Stäng om assistentens svar uppfyller closure_conditions.
- Lämna fält som tomma arrayer om inget händer. INGEN prosa utanför JSON.`;
}

async function callLite(prompt: string): Promise<any | null> {
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
        temperature: 0.2,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return JSON.parse(text);
  } catch (e) {
    console.error("episodic lite call failed:", e);
    return null;
  }
}

function mergeState(
  prev: EpisodicState,
  patch: any,
): EpisodicState {
  const timelineDrop = new Set<number>(Array.isArray(patch?.timeline_drop_indices) ? patch.timeline_drop_indices : []);
  const keptTimeline = prev.timeline.filter((_, i) => !timelineDrop.has(i + 1));
  const newTimeline = [
    ...keptTimeline,
    ...(Array.isArray(patch?.timeline_add) ? patch.timeline_add.slice(0, 3) : []),
  ].slice(-MAX_TIMELINE);

  const artifactSet = new Set<string>([...prev.artifacts]);
  for (const a of Array.isArray(patch?.artifacts_add) ? patch.artifacts_add : []) {
    if (typeof a === "string" && a.trim()) artifactSet.add(a.trim());
  }
  const artifacts = Array.from(artifactSet).slice(-MAX_ARTIFACTS);

  const droppedThreads = new Set<string>(Array.isArray(patch?.open_threads_drop) ? patch.open_threads_drop : []);
  const threadSet = new Set<string>([
    ...prev.open_threads.filter((t) => !droppedThreads.has(t)),
    ...(Array.isArray(patch?.open_threads_add) ? patch.open_threads_add : []),
  ]);
  const open_threads = Array.from(threadSet).slice(-12);

  const focus = typeof patch?.focus === "string" && patch.focus.trim() ? patch.focus.trim().slice(0, 240) : prev.focus;

  return {
    focus,
    timeline: newTimeline,
    artifacts,
    open_threads,
    affective_residue: prev.affective_residue,
    digest: "",
    turn_count: prev.turn_count + 1,
  };
}

function renderDigest(s: EpisodicState, loops: OpenLoop[]): string {
  const parts: string[] = [];
  if (s.focus) parts.push(`FOCUS: ${s.focus}`);
  if (s.timeline.length) parts.push("TIMELINE:\n" + s.timeline.map((t, i) => `  ${i + 1}. ${t}`).join("\n"));
  if (s.artifacts.length) parts.push("ARTIFACTS: " + s.artifacts.join(" · "));
  if (s.open_threads.length) parts.push("THREADS: " + s.open_threads.join(" · "));
  const activeLoops = loops.filter((l) => l.status === "active").slice(0, 8);
  if (activeLoops.length) {
    parts.push("OPEN LOOPS:\n" + activeLoops.map((l, i) => `  ${i + 1}. [${l.urgency.toFixed(2)}] ${l.description}`).join("\n"));
  }
  const txt = parts.join("\n");
  return txt.length > MAX_DIGEST_CHARS ? txt.slice(0, MAX_DIGEST_CHARS) + "\n…" : txt;
}

async function applyLoopChanges(
  conversationId: string,
  userId: string,
  turn: number,
  existingLoops: OpenLoop[],
  patch: any,
): Promise<void> {
  // Close
  const toClose: { id: string; outcome: string }[] = [];
  for (const c of Array.isArray(patch?.loops_close) ? patch.loops_close : []) {
    const desc = String(c?.description ?? "").toLowerCase();
    if (!desc) continue;
    const match = existingLoops.find((l) => l.description.toLowerCase().includes(desc) || desc.includes(l.description.toLowerCase()));
    if (match?.id) toClose.push({ id: match.id, outcome: String(c?.outcome ?? "closed by assistant turn").slice(0, 500) });
  }
  for (const c of toClose) {
    await supabase
      .from("session_open_loops")
      .update({ status: "closed", closed_at: new Date().toISOString(), closure_outcome: c.outcome })
      .eq("id", c.id);
  }

  // Open (dedupe against existing active descriptions)
  const existingDescs = new Set(existingLoops.map((l) => l.description.toLowerCase().slice(0, 80)));
  const toOpen: any[] = [];
  for (const o of Array.isArray(patch?.loops_open) ? patch.loops_open : []) {
    const desc = String(o?.description ?? "").trim();
    if (!desc) continue;
    const key = desc.toLowerCase().slice(0, 80);
    if (existingDescs.has(key)) continue;
    existingDescs.add(key);
    toOpen.push({
      conversation_id: conversationId,
      user_id: userId,
      description: desc.slice(0, 500),
      urgency: Math.max(0, Math.min(1, Number(o?.urgency ?? 0.5))),
      closure_conditions: Array.isArray(o?.closure_conditions) ? o.closure_conditions.slice(0, 5) : [],
      status: "active",
      opened_at_turn: turn,
      source: "auto",
    });
  }
  if (toOpen.length) {
    await supabase.from("session_open_loops").insert(toOpen);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { conversationId, userId, userText, assistantText } = body ?? {};
    if (!conversationId || !userId || typeof userText !== "string") {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prev = await loadState(conversationId);
    const loops = await loadActiveLoops(conversationId);

    const prompt = buildPrompt(prev, loops, userText, String(assistantText ?? ""));
    const patch = await callLite(prompt);

    if (!patch) {
      return new Response(JSON.stringify({ ok: false, reason: "lite_unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const merged = mergeState(prev, patch);
    await applyLoopChanges(conversationId, userId, merged.turn_count, loops, patch);

    // Re-fetch loops post-mutation for accurate digest
    const fresh = await loadActiveLoops(conversationId);
    const digest = renderDigest(merged, fresh);

    await supabase.from("session_episodic").upsert({
      conversation_id: conversationId,
      user_id: userId,
      focus: merged.focus,
      timeline: merged.timeline,
      artifacts: merged.artifacts,
      open_threads: merged.open_threads,
      affective_residue: merged.affective_residue,
      digest,
      turn_count: merged.turn_count,
    }, { onConflict: "conversation_id" });

    return new Response(JSON.stringify({ ok: true, turn: merged.turn_count, loops_active: fresh.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rfa-episodic error:", e instanceof Error ? e.stack : e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

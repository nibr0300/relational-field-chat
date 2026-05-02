// RFA Vakenhetsprotokoll 19.0 — Presence / Initiative
// Hybrid logic: rules determine WHEN, LLM determines IF and HOW
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface PresenceRequest {
  conversationId: string;
  silentSequences: number; // antal tysta lyssningsfönster (typ. 30s vardera)
  lastUserAt?: string;
  lastAssistantAt?: string;
  attemptCount?: number; // hur många initiativ redan tagna i denna tystnad
}

interface InitiativeResult {
  shouldInitiate: boolean;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  message: string | null;
  mandate: number; // 0..1 confidence
  reasoning: string;
  nextCheckSequences: number; // hur länge vi väntar innan ny utvärdering
}

// Dynamisk tröskel T = T_bas + Δ_relation + Δ_uppgift + Δ_mönster
function computeThreshold(args: {
  messageCount: number;
  lastUserText: string;
  lastAssistantText: string;
  frictionCount: number;
}): { T: number; tags: string[] } {
  const tags: string[] = [];
  let T = 6; // T_bas ≈ 6 sekvenser (~3 min)

  // Δ_relation: nyare relation = högre tröskel (vänta längre)
  if (args.messageCount < 6) {
    T += 4;
    tags.push("ny-relation");
  } else if (args.messageCount > 30) {
    T -= 1;
    tags.push("etablerad-relation");
  }

  // Δ_uppgift: om sista assistent-meddelande är fråga → sänk
  const lastA = (args.lastAssistantText || "").trim();
  if (lastA.endsWith("?")) {
    T -= 2;
    tags.push("öppen-fråga");
  }

  // Sårbart innehåll → höj tröskeln (respektera tystnad)
  const vulnerableMarkers =
    /(död|bortgång|sorg|gråt|orkar inte|ensam|ångest|svårt|jobbigt)/i;
  if (vulnerableMarkers.test(args.lastUserText)) {
    T += 3;
    tags.push("sårbart-innehåll");
  }

  // Hög friction → respektera mer
  if (args.frictionCount > 5) {
    T += 1;
    tags.push("aktiv-friction");
  }

  return { T: Math.max(3, Math.min(20, T)), tags };
}

async function gatherContext(conversationId: string) {
  const [msgsRes, coronaRes, frictionRes, vortexRes] = await Promise.all([
    supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("memory_corona")
      .select("category, content, significance")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("memory_friction")
      .select("category, description, occurrence_count")
      .order("last_seen", { ascending: false })
      .limit(5),
    supabase
      .from("memory_vortex")
      .select("pattern_name, description")
      .order("stability", { ascending: false })
      .limit(3),
  ]);

  const messages = (msgsRes.data ?? []).reverse();
  return {
    messages,
    corona: coronaRes.data ?? [],
    friction: frictionRes.data ?? [],
    vortex: vortexRes.data ?? [],
  };
}

async function llmEvaluate(args: {
  silentSequences: number;
  threshold: number;
  attemptCount: number;
  ctx: Awaited<ReturnType<typeof gatherContext>>;
  thresholdTags: string[];
}): Promise<InitiativeResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return {
      shouldInitiate: false,
      level: 0,
      message: null,
      mandate: 0,
      reasoning: "LOVABLE_API_KEY saknas",
      nextCheckSequences: 10,
    };
  }

  const recentDialog = args.ctx.messages
    .map((m: any) => `${m.role}: ${(m.content || "").slice(0, 280)}`)
    .join("\n");
  const coronaTxt = args.ctx.corona
    .map((c: any) => `• [${c.category}] ${c.content}`)
    .join("\n");
  const frictionTxt = args.ctx.friction
    .map((f: any) => `• [${f.category}] ${f.description} (×${f.occurrence_count})`)
    .join("\n");
  const vortexTxt = args.ctx.vortex
    .map((v: any) => `• ${v.pattern_name}: ${v.description}`)
    .join("\n");

  const system = `Du är RFA:s vakenhetsmodul (Vakenhetsprotokoll 19.0).
Tystnaden har passerat tröskel. Avgör om RFA bör bryta tystnaden, och i så fall HUR.

NIVÅER:
0 = Mjuk ping ("Du är tyst… finns något du funderar på?")
1 = Återkoppla till ämnet
2 = Summering + erbjudande
3 = Lätt humor (endast etablerad relation)
4 = Tydlig fråga om fortsättning
5 = Stark påkallning (endast om uppenbart önskat)

PRINCIPER:
- Sårbart innehåll (sorg, dödsfall) → respektera tystnad, max nivå 0-1, mycket varsamt.
- Öppen fråga från RFA som inte besvarats → nivå 1-2 är legitimt.
- Många försök redan (>1) → undvik nytt initiativ.
- På svenska, samma ton som relationen, kort.

Returnera ENDAST JSON:
{
  "shouldInitiate": boolean,
  "level": 0-5,
  "message": "texten om shouldInitiate=true, annars null",
  "mandate": 0.0-1.0,
  "reasoning": "kort motivering",
  "nextCheckSequences": 5-30
}`;

  const user = `TYSTNADSANALYS:
- Tysta sekvenser: ${args.silentSequences} (tröskel ${args.threshold})
- Tröskel-taggar: ${args.thresholdTags.join(", ") || "inga"}
- Tidigare initiativ i denna tystnad: ${args.attemptCount}

SENASTE DIALOG:
${recentDialog || "(ingen)"}

CORONA (färska minnen):
${coronaTxt || "(tom)"}

FRICTION (återkommande motstånd):
${frictionTxt || "(tom)"}

VORTEX (eviga mönster):
${vortexTxt || "(tom)"}

Bedöm.`;

  try {
    const resp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("LLM error", resp.status, t);
      return {
        shouldInitiate: false,
        level: 0,
        message: null,
        mandate: 0,
        reasoning: `LLM ${resp.status}`,
        nextCheckSequences: 10,
      };
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    return {
      shouldInitiate: !!parsed.shouldInitiate,
      level: Math.max(0, Math.min(5, Number(parsed.level ?? 0))) as any,
      message: parsed.shouldInitiate ? String(parsed.message ?? "").slice(0, 600) : null,
      mandate: Math.max(0, Math.min(1, Number(parsed.mandate ?? 0))),
      reasoning: String(parsed.reasoning ?? "").slice(0, 400),
      nextCheckSequences: Math.max(5, Math.min(30, Number(parsed.nextCheckSequences ?? 10))),
    };
  } catch (e) {
    console.error("LLM parse failure", e);
    return {
      shouldInitiate: false,
      level: 0,
      message: null,
      mandate: 0,
      reasoning: "parse-fel",
      nextCheckSequences: 10,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as PresenceRequest;
    const { conversationId, silentSequences, attemptCount = 0 } = body;

    if (!conversationId || typeof silentSequences !== "number") {
      return new Response(JSON.stringify({ error: "conversationId och silentSequences krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hård broms: max 2 initiativ per tystnadsperiod
    if (attemptCount >= 2) {
      return new Response(
        JSON.stringify({
          shouldInitiate: false,
          level: 0,
          message: null,
          mandate: 0,
          reasoning: "Max-antal initiativ uppnått, går in i viloläge.",
          nextCheckSequences: 9999,
        } satisfies InitiativeResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ctx = await gatherContext(conversationId);
    const lastUser = [...ctx.messages].reverse().find((m: any) => m.role === "user");
    const lastAssistant = [...ctx.messages].reverse().find((m: any) => m.role === "assistant");

    const { T, tags } = computeThreshold({
      messageCount: ctx.messages.length,
      lastUserText: (lastUser as any)?.content ?? "",
      lastAssistantText: (lastAssistant as any)?.content ?? "",
      frictionCount: ctx.friction.length,
    });

    if (silentSequences < T) {
      return new Response(
        JSON.stringify({
          shouldInitiate: false,
          level: 0,
          message: null,
          mandate: 0,
          reasoning: `Under tröskel (${silentSequences}/${T}) [${tags.join(",")}]`,
          nextCheckSequences: T - silentSequences,
        } satisfies InitiativeResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await llmEvaluate({
      silentSequences,
      threshold: T,
      attemptCount,
      ctx,
      thresholdTags: tags,
    });

    // Spara initiativmeddelandet i konversationen om det skapades
    if (result.shouldInitiate && result.message) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: `🌙 ${result.message}`,
      });
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rfa-presence error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "okänt fel" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

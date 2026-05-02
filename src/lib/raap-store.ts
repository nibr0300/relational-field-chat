import { supabase } from "@/integrations/supabase/client";

export interface RaapRun {
  id: string;
  conversation_id: string | null;
  trigger_type: string;
  trigger_reason: string | null;
  goal: string;
  strategy: string | null;
  depth: string;
  plan_dag: any;
  branches_explored: number;
  backtracks: number;
  llm_calls: number;
  final_answer: string | null;
  status: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface RaapEpisode {
  id: string;
  run_id: string;
  step_index: number;
  phase: string;
  sub_goal: string | null;
  action: string | null;
  expected_outcome: string | null;
  actual_outcome: string | null;
  reflection: string | null;
  discrepancy: number;
  confidence: number;
  created_at: string;
}

export interface RaapResult {
  runId: string;
  answer: string;
  strategy: string;
  problem_class: string;
  branches_explored: number;
  backtracks: number;
  llm_calls: number;
  duration_ms: number;
}

export async function invokeRaap(params: {
  goal: string;
  conversationId?: string | null;
  triggerType?: "auto" | "manual" | "suggested";
  triggerReason?: string;
  context?: string;
}): Promise<RaapResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rfa-raap`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `RAAP error ${resp.status}`);
  }
  return resp.json();
}

export async function getRun(runId: string): Promise<RaapRun | null> {
  const { data } = await supabase.from("raap_runs" as any).select("*").eq("id", runId).maybeSingle();
  return (data as unknown as RaapRun) ?? null;
}

export async function listEpisodes(runId: string): Promise<RaapEpisode[]> {
  const { data } = await supabase
    .from("raap_episodes" as any)
    .select("*")
    .eq("run_id", runId)
    .order("step_index", { ascending: true });
  return (data as unknown as RaapEpisode[]) ?? [];
}

// Heuristic auto-trigger: should the hat be worn?
export function shouldWearHat(text: string): { wear: boolean; reason: string } {
  const t = text.toLowerCase();
  const length = text.length;
  const triggers: Array<[RegExp | boolean, string]> = [
    [length > 800, "lång och komplex förfrågan"],
    [/\b(planera|strategi|arkitektur|design|jämför|utvärdera|analysera djupt|bevisa|härled|optimera|felsök komplext)\b/.test(t), "kräver strukturerad planering"],
    [/\b(steg för steg|i flera steg|multi-step|flerstegs)\b/.test(t), "explicit flerstegsproblem"],
    [/\b(varför|hur kommer det sig|orsakssamband|implikation)\b/.test(t) && length > 300, "djupare orsaksanalys"],
    [(t.match(/\?/g)?.length ?? 0) >= 3, "flera sammanflätade frågor"],
    [/\b(matematik|bevis|teorem|härledning|ekvation)\b/.test(t), "formellt resonemang"],
  ];
  for (const [cond, reason] of triggers) {
    if (cond) return { wear: true, reason };
  }
  return { wear: false, reason: "" };
}

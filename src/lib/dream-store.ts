import { supabase } from "@/integrations/supabase/client";

export interface DreamCycle {
  id: string;
  trigger: string;
  status: string;
  hypotheses_generated: number;
  hypotheses_consolidated: number;
  hypotheses_forgotten: number;
  dissonance_count: number;
  summary: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
  conversation_id: string | null;
}

export interface DreamHypothesis {
  id: string;
  cycle_id: string;
  source_ref: string | null;
  phase: string;
  status: string;
  content: string;
  prior: number;
  likelihood: number;
  posterior: number;
  promoted_to_table: string | null;
  promoted_to_id: string | null;
  created_at: string;
}

export async function listDreamCycles(limit = 10): Promise<DreamCycle[]> {
  const { data, error } = await supabase
    .from("dream_cycles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DreamCycle[];
}

export async function listDreamHypotheses(cycleId: string): Promise<DreamHypothesis[]> {
  const { data, error } = await supabase
    .from("dream_hypotheses")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("posterior", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DreamHypothesis[];
}

export async function runDreamCycle(opts: { conversationId?: string | null; force?: boolean } = {}): Promise<{
  ok: boolean;
  cycleId?: string;
  generated?: number;
  consolidated?: number;
  dissonance?: number;
  reason?: string;
}> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Inte inloggad");

  const { data, error } = await supabase.functions.invoke("rfa-dream", {
    body: {
      userId,
      conversationId: opts.conversationId ?? null,
      trigger: "manual",
      force: opts.force ?? true,
    },
  });
  if (error) throw error;
  return data;
}

export async function lastDreamCycleAge(): Promise<number | null> {
  const { data } = await supabase
    .from("dream_cycles")
    .select("created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return Date.now() - new Date(data.created_at).getTime();
}

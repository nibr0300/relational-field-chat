import { supabase } from "@/integrations/supabase/client";

export interface Execution {
  id: string;
  conversation_id: string | null;
  script_id: string;
  language: string;
  intent: string | null;
  code: string;
  status: "pending" | "approved" | "running" | "success" | "error";
  safety_score: number;
  output: string | null;
  error: string | null;
  field_impact: { fz: number; fy: number };
  created_at: string;
  completed_at: string | null;
}

export async function createExecution(
  code: string,
  conversationId?: string,
  intent?: string,
  safetyScore = 0.5
): Promise<Execution> {
  const { data, error } = await supabase
    .from("executions")
    .insert({
      code,
      conversation_id: conversationId || null,
      intent: intent || null,
      safety_score: safetyScore,
      status: "pending",
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Execution;
}

export async function approveExecution(id: string): Promise<void> {
  const { error } = await supabase
    .from("executions")
    .update({ status: "approved" } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function runExecution(executionId: string): Promise<{
  status: string;
  output: string;
  field_impact: { fz: number; fy: number };
}> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/execute-python`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ executionId }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `Error ${resp.status}`);
  }
  return resp.json();
}

export async function getExecution(id: string): Promise<Execution | null> {
  const { data, error } = await supabase
    .from("executions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as unknown as Execution;
}

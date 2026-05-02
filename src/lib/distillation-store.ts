import { supabase } from "@/integrations/supabase/client";

export interface ConstitutionRule {
  id: string;
  rule_code: string;
  trigger_description: string;
  behavior_contract: string;
  source_citations: string[];
  validation_score: number;
  effect_size: number;
  test_cases: Array<{ test: string; expected: string }>;
  is_active: boolean;
  is_core: boolean;
  cycle_number: number;
  created_at: string;
  retired_at: string | null;
  retired_reason: string | null;
}

export interface DistillationRun {
  id: string;
  trigger_type: string;
  scope: string;
  scope_ref: string | null;
  cycles_completed: number;
  fragments_extracted: number;
  rules_proposed: number;
  rules_validated: number;
  rules_rejected: number;
  termination_reason: string | null;
  protocol_log: any[];
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function listConstitutionRules(): Promise<ConstitutionRule[]> {
  const { data, error } = await supabase
    .from("constitution_rules" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as ConstitutionRule[];
}

export async function retireConstitutionRule(id: string, reason: string) {
  const { error } = await supabase
    .from("constitution_rules" as any)
    .update({ is_active: false, retired_at: new Date().toISOString(), retired_reason: reason } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function listDistillationRuns(limit = 20): Promise<DistillationRun[]> {
  const { data, error } = await supabase
    .from("distillation_runs" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as DistillationRun[];
}

export async function runDistillation(opts: {
  trigger_type?: "manual" | "auto_pre_purge";
  scope?: "all" | "conversation";
  scope_ref?: string | null;
} = {}): Promise<{ run_id: string; rules_validated: number; cycles: number; termination_reason: string }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rfa-distill`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(opts),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(t || `Error ${resp.status}`);
  }
  return resp.json();
}

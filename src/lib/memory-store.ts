import { supabase } from "@/integrations/supabase/client";

export interface Eigenstate {
  id: string;
  category: string;
  content: string;
  significance: number;
  source_conversation_id: string | null;
  created_at: string;
}

export async function listEigenstates(): Promise<Eigenstate[]> {
  const { data, error } = await supabase
    .from("memory_eigenstates")
    .select("*")
    .order("significance", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Eigenstate[];
}

export async function deleteEigenstate(id: string) {
  const { error } = await supabase
    .from("memory_eigenstates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

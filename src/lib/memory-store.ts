import { supabase } from "@/integrations/supabase/client";

export interface Eigenstate {
  id: string;
  category: string;
  content: string;
  significance: number;
  source_conversation_id: string | null;
  created_at: string;
}

export interface CoronaItem {
  id: string;
  category: string;
  content: string;
  significance: number;
  created_at: string;
}

export interface LimbusItem {
  id: string;
  category: string;
  summary: string;
  observation_count: number;
  mean_significance: number;
  first_seen: string;
  last_seen: string;
}

export interface VortexItem {
  id: string;
  pattern_name: string;
  description: string;
  stability: number;
  related_categories: string[];
  created_at: string;
}

export interface FrictionItem {
  id: string;
  category: string;
  description: string;
  resistance_strength: number;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
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
  const { error } = await supabase.from("memory_eigenstates").delete().eq("id", id);
  if (error) throw error;
}

export async function listCorona(): Promise<CoronaItem[]> {
  const { data, error } = await supabase
    .from("memory_corona")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as CoronaItem[];
}

export async function deleteCorona(id: string) {
  const { error } = await supabase.from("memory_corona").delete().eq("id", id);
  if (error) throw error;
}

export async function listLimbus(): Promise<LimbusItem[]> {
  const { data, error } = await supabase
    .from("memory_limbus")
    .select("*")
    .order("last_seen", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as LimbusItem[];
}

export async function deleteLimbus(id: string) {
  const { error } = await supabase.from("memory_limbus").delete().eq("id", id);
  if (error) throw error;
}

export async function listVortex(): Promise<VortexItem[]> {
  const { data, error } = await supabase
    .from("memory_vortex")
    .select("*")
    .order("stability", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as VortexItem[];
}

export async function deleteVortex(id: string) {
  const { error } = await supabase.from("memory_vortex").delete().eq("id", id);
  if (error) throw error;
}

export async function listFriction(): Promise<FrictionItem[]> {
  const { data, error } = await supabase
    .from("memory_friction")
    .select("*")
    .order("resistance_strength", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as FrictionItem[];
}

export async function deleteFriction(id: string) {
  const { error } = await supabase.from("memory_friction").delete().eq("id", id);
  if (error) throw error;
}

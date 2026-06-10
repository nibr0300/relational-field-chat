import { supabase } from "@/integrations/supabase/client";

/**
 * Build headers for edge function calls that include the authenticated user's
 * access_token. Without this, edge functions cannot identify the user and
 * per-user RLS scoping cannot work.
 */
export async function authedJsonHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

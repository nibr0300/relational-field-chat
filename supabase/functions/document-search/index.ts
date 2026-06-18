// Document search: embeds a query, returns top-k chunks for the caller.
// Body: { query: string, k?: number, document_ids?: uuid[] }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const supabaseAnon = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
);

const EMBED_MODEL = "openai/text-embedding-3-small";

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try { const { data } = await supabaseAnon.auth.getUser(token); return data.user?.id ?? null; }
  catch { return null; }
}

async function embedOne(input: string): Promise<number[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  });
  if (!resp.ok) throw new Error(`embed ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.data?.[0]?.embedding ?? [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { query, k = 6, document_ids } = await req.json();
    if (typeof query !== "string" || !query.trim()) {
      return new Response(JSON.stringify({ error: "query required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const embedding = await embedOne(query.slice(0, 8000));

    const { data, error } = await supabaseAdmin.rpc("match_document_chunks", {
      query_embedding: embedding as any,
      match_count: Math.min(Math.max(k, 1), 20),
      filter_user: userId,
      filter_document_ids: Array.isArray(document_ids) && document_ids.length ? document_ids : null,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ matches: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("document-search error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

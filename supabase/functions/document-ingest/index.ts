// Document ingest: chunk text, embed, store.
// Body: { document_id: uuid, text: string }  (text already extracted on client)
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

const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims
const CHUNK_TARGET = 1100; // chars
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS = 400;
const BATCH = 32;

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { data } = await supabaseAnon.auth.getUser(token);
    return data.user?.id ?? null;
  } catch { return null; }
}

function chunkText(raw: string): string[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > CHUNK_TARGET && buf) {
      chunks.push(buf);
      buf = buf.slice(-CHUNK_OVERLAP) + "\n\n" + p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
    while (buf.length > CHUNK_TARGET * 1.5) {
      chunks.push(buf.slice(0, CHUNK_TARGET));
      buf = buf.slice(CHUNK_TARGET - CHUNK_OVERLAP);
    }
  }
  if (buf.trim()) chunks.push(buf);
  return chunks.slice(0, MAX_CHUNKS);
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!resp.ok) throw new Error(`embed ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data.data ?? []).map((d: any) => d.embedding as number[]);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { document_id, text } = await req.json();
    if (!document_id || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "document_id and text required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents").select("*")
      .eq("id", document_id).eq("user_id", userId).single();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin.from("documents").update({ status: "ingesting", error: null }).eq("id", document_id);

    // Clear previous chunks (re-ingest support)
    await supabaseAdmin.from("document_chunks").delete().eq("document_id", document_id);

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await supabaseAdmin.from("documents")
        .update({ status: "ready", char_count: 0, chunk_count: 0 }).eq("id", document_id);
      return new Response(JSON.stringify({ chunk_count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const vectors = await embedBatch(slice);
      const rows = slice.map((content, k) => ({
        document_id,
        user_id: userId,
        chunk_index: i + k,
        content,
        embedding: vectors[k] as any,
        token_estimate: Math.ceil(content.length / 4),
      }));
      const { error: insErr } = await supabaseAdmin.from("document_chunks").insert(rows);
      if (insErr) throw insErr;
      inserted += rows.length;
    }

    await supabaseAdmin.from("documents").update({
      status: "ready",
      char_count: text.length,
      chunk_count: inserted,
    }).eq("id", document_id);

    return new Response(JSON.stringify({ chunk_count: inserted, char_count: text.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("document-ingest error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    try {
      const body = await req.clone().json();
      if (body?.document_id) {
        await supabaseAdmin.from("documents")
          .update({ status: "error", error: msg }).eq("id", body.document_id);
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

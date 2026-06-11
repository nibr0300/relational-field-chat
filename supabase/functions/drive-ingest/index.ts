// Ingest a Google Drive file (or recursively a folder) into the archive.
// Body: { file_id: string, name?: string, mime_type?: string, is_folder?: boolean, recursive?: boolean }
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

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const EMBED_MODEL = "openai/text-embedding-3-small";
const CHUNK_TARGET = 1100;
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS = 400;
const BATCH = 32;
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_FOLDER = 200;

const lovKey = Deno.env.get("LOVABLE_API_KEY")!;
const drvKey = Deno.env.get("GOOGLE_DRIVE_API_KEY")!;

const driveHeaders = {
  Authorization: `Bearer ${lovKey}`,
  "X-Connection-Api-Key": drvKey,
};

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try { const { data } = await supabaseAnon.auth.getUser(token); return data.user?.id ?? null; }
  catch { return null; }
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
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!resp.ok) throw new Error(`embed ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data.data ?? []).map((d: any) => d.embedding as number[]);
}

const GOOGLE_EXPORT: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.script": "application/vnd.google-apps.script+json",
};

function isTextish(mime: string, name: string): boolean {
  if (!mime) return /\.(txt|md|markdown|mdx|json|csv|log|ya?ml|html?|xml|tsx?|jsx?|py|rs|go|java|rb|php|c|cc|cpp|h|hpp|cs|swift|kt|sql|sh|toml|ini|conf|env)$/i.test(name);
  return mime.startsWith("text/") || mime === "application/json" || mime === "application/xml" ||
    mime === "application/javascript" || mime === "application/typescript";
}

async function fetchDriveText(fileId: string, mimeType: string, name: string): Promise<string> {
  if (mimeType in GOOGLE_EXPORT) {
    const exp = GOOGLE_EXPORT[mimeType];
    const r = await fetch(`${GATEWAY}/files/${fileId}/export?mimeType=${encodeURIComponent(exp)}`, { headers: driveHeaders });
    if (!r.ok) throw new Error(`export ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const txt = await r.text();
    return txt.slice(0, MAX_TEXT_BYTES);
  }
  if (isTextish(mimeType, name)) {
    const r = await fetch(`${GATEWAY}/files/${fileId}?alt=media`, { headers: driveHeaders });
    if (!r.ok) throw new Error(`download ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const txt = await r.text();
    return txt.slice(0, MAX_TEXT_BYTES);
  }
  throw new Error(`Filtypen ${mimeType || name.split(".").pop()} stöds inte ännu i Drive-indexering (PDF/binärt). Använd Google Docs eller textfiler.`);
}

async function listFolderFiles(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const out: Array<{ id: string; name: string; mimeType: string }> = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,mimeType)",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await fetch(`${GATEWAY}/files?${params.toString()}`, { headers: driveHeaders });
    if (!r.ok) throw new Error(`list ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    if (out.length > MAX_FILES_PER_FOLDER) break;
  } while (pageToken);
  return out;
}

async function ingestOne(userId: string, fileId: string, name: string, mimeType: string) {
  // Upsert documents row keyed on drive id (stored in storage_path as "drive:<id>")
  const storagePath = `drive:${fileId}`;
  const existing = await supabaseAdmin
    .from("documents").select("id").eq("user_id", userId).eq("storage_path", storagePath).maybeSingle();
  let docId: string;
  if (existing.data?.id) {
    docId = existing.data.id;
    await supabaseAdmin.from("documents").update({
      title: name, mime_type: mimeType, status: "ingesting", error: null,
    }).eq("id", docId);
    await supabaseAdmin.from("document_chunks").delete().eq("document_id", docId);
  } else {
    const ins = await supabaseAdmin.from("documents").insert({
      user_id: userId, title: name, storage_path: storagePath,
      mime_type: mimeType, size_bytes: null, tags: ["drive"], status: "ingesting",
    }).select("id").single();
    if (ins.error) throw ins.error;
    docId = ins.data.id;
  }

  try {
    const text = await fetchDriveText(fileId, mimeType, name);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await supabaseAdmin.from("documents").update({
        status: "ready", char_count: 0, chunk_count: 0,
      }).eq("id", docId);
      return { document_id: docId, chunk_count: 0 };
    }
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const vectors = await embedBatch(slice);
      const rows = slice.map((content, k) => ({
        document_id: docId, user_id: userId, chunk_index: i + k, content,
        embedding: vectors[k] as any, token_estimate: Math.ceil(content.length / 4),
      }));
      const { error } = await supabaseAdmin.from("document_chunks").insert(rows);
      if (error) throw error;
      inserted += rows.length;
    }
    await supabaseAdmin.from("documents").update({
      status: "ready", char_count: text.length, chunk_count: inserted,
    }).eq("id", docId);
    return { document_id: docId, chunk_count: inserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "okänt";
    await supabaseAdmin.from("documents").update({ status: "error", error: msg }).eq("id", docId);
    throw e;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!lovKey || !drvKey) throw new Error("Drive-connector saknar nycklar");
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { file_id, name, mime_type, is_folder, recursive } = await req.json();
    if (!file_id) {
      return new Response(JSON.stringify({ error: "file_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (is_folder) {
      const files = await listFolderFiles(file_id);
      const ingestable = files.filter((f) =>
        f.mimeType !== "application/vnd.google-apps.folder" &&
        (f.mimeType in GOOGLE_EXPORT || isTextish(f.mimeType, f.name))
      );
      let ok = 0, fail = 0;
      const errors: string[] = [];
      for (const f of ingestable) {
        try { await ingestOne(userId, f.id, f.name, f.mimeType); ok++; }
        catch (e) { fail++; errors.push(`${f.name}: ${e instanceof Error ? e.message : "fel"}`); }
      }
      // Optionally recurse into subfolders
      if (recursive) {
        const subfolders = files.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
        for (const sub of subfolders) {
          try {
            const subFiles = await listFolderFiles(sub.id);
            for (const f of subFiles) {
              if (f.mimeType === "application/vnd.google-apps.folder") continue;
              if (!(f.mimeType in GOOGLE_EXPORT) && !isTextish(f.mimeType, f.name)) continue;
              try { await ingestOne(userId, f.id, `${sub.name}/${f.name}`, f.mimeType); ok++; }
              catch (e) { fail++; errors.push(`${sub.name}/${f.name}: ${e instanceof Error ? e.message : "fel"}`); }
            }
          } catch (e) { errors.push(`Mapp ${sub.name}: ${e instanceof Error ? e.message : "fel"}`); }
        }
      }
      return new Response(JSON.stringify({ ok, fail, total: ok + fail, errors: errors.slice(0, 20) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await ingestOne(userId, file_id, name || "Drive file", mime_type || "");
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("drive-ingest:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

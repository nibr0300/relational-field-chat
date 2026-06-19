import { supabase } from "@/integrations/supabase/client";
import { extractPdfText } from "./pdf-extract";

export interface DocumentRow {
  id: string;
  user_id: string;
  title: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  char_count: number;
  chunk_count: number;
  tags: string[];
  status: "pending" | "ingesting" | "ready" | "error";
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChunkMatch {
  chunk_id: string;
  document_id: string;
  title: string;
  chunk_index: number;
  content: string;
  similarity: number;
}

const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5 MB raw text cap per file

async function readUtf8File(file: File, opts: { maxTextBytes?: number; allowTruncate?: boolean } = {}): Promise<string> {
  const maxBytes = opts.maxTextBytes ?? MAX_TEXT_BYTES;
  const allowTruncate = opts.allowTruncate ?? true;
  if (file.size > maxBytes) {
    if (!allowTruncate) {
      throw new Error(`Filen är för stor för heltextläsning (${Math.ceil(file.size / 1024)} KB).`);
    }
    return await file.slice(0, maxBytes).text();
  }
  return await file.text();
}

export async function listDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("documents" as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DocumentRow[];
}

export async function deleteDocument(id: string): Promise<void> {
  const { data: row } = await supabase
    .from("documents" as any).select("storage_path").eq("id", id).single();
  const path = (row as any)?.storage_path as string | null;
  if (path) {
    await supabase.storage.from("documents").remove([path]).catch(() => {});
  }
  const { error } = await supabase.from("documents" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function updateDocumentTags(id: string, tags: string[]): Promise<void> {
  const { error } = await supabase.from("documents" as any).update({ tags } as any).eq("id", id);
  if (error) throw error;
}

export async function extractText(
  file: File,
  opts: { maxTextBytes?: number; allowTruncate?: boolean } = {},
): Promise<string> {
  const lower = file.name.toLowerCase();
  if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
    const text = await extractPdfText(file);
    const maxBytes = opts.maxTextBytes ?? MAX_TEXT_BYTES;
    const allowTruncate = opts.allowTruncate ?? true;
    if (text.length > maxBytes) {
      if (!allowTruncate) throw new Error(`PDF-texten är för stor för heltextläsning (${text.length} tecken).`);
      return text.slice(0, maxBytes);
    }
    return text;
  }
  if (lower.endsWith(".ipynb")) {
    // Read the whole notebook JSON, then strip outputs/metadata so the archive keeps every code/markdown cell.
    const raw = await readUtf8File(file, opts);
    try {
      const nb = JSON.parse(raw);
      const cells = Array.isArray(nb.cells) ? nb.cells : [];
      const lang = nb?.metadata?.kernelspec?.language || nb?.metadata?.language_info?.name || "python";
      const parts: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const src = Array.isArray(c.source) ? c.source.join("") : (c.source ?? "");
        if (!src.trim()) continue;
        if (c.cell_type === "code") parts.push(`<!-- cell ${i + 1} · code -->\n\`\`\`${lang}\n${src}\n\`\`\``);
        else if (c.cell_type === "markdown") parts.push(`<!-- cell ${i + 1} · markdown -->\n${src}`);
        else parts.push(`<!-- cell ${i + 1} · ${c.cell_type ?? "raw"} -->\n${src}`);
      }
      return parts.join("\n\n");
    } catch { return raw; }
  }
  // text-ish: read as utf-8 (cap only when truncation is explicitly allowed)
  const raw = await readUtf8File(file, opts);
  if (lower.endsWith(".json")) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }
  return raw;
}

export async function uploadAndIngest(
  file: File,
  opts: { title?: string; tags?: string[]; dedupe?: boolean } = {},
): Promise<DocumentRow> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Inte inloggad");

  const title = opts.title || file.name;

  // Dedupe: skip if a document with the same title already exists for this user
  if (opts.dedupe !== false) {
    const existing = await supabase
      .from("documents" as any)
      .select("*")
      .eq("title", title)
      .limit(1)
      .maybeSingle();
    if (existing.data) {
      return existing.data as unknown as DocumentRow;
    }
  }

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const storagePath = `${uid}/${Date.now()}_${safeName}`;

  // 1) upload original file to private bucket
  const up = await supabase.storage.from("documents").upload(storagePath, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (up.error) throw up.error;

  // 2) create row
  const insert = await supabase.from("documents" as any).insert({
    title,
    storage_path: storagePath,
    mime_type: file.type || null,
    size_bytes: file.size,
    tags: opts.tags ?? [],
    status: "pending",
  } as any).select().single();
  if (insert.error) { throw insert.error; }
  const row = insert.data as unknown as DocumentRow;

  // 3) extract text client-side and call ingest fn
  let text = "";
  try {
    text = await extractText(file);
  } catch (e) {
    await supabase.from("documents" as any).update({
      status: "error",
      error: `Textextraktion misslyckades: ${e instanceof Error ? e.message : "okänt"}`,
    } as any).eq("id", row.id);
    throw e;
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-ingest`;
  const { authedJsonHeaders } = await import("./auth-headers");
  const resp = await fetch(url, {
    method: "POST",
    headers: await authedJsonHeaders(),
    body: JSON.stringify({ document_id: row.id, text }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(t || `Ingest fel ${resp.status}`);
  }

  const { data: refreshed } = await supabase
    .from("documents" as any).select("*").eq("id", row.id).single();
  return (refreshed as unknown as DocumentRow) ?? row;
}

export async function reingestDocument(id: string): Promise<void> {
  const { data: row, error } = await supabase
    .from("documents" as any).select("*").eq("id", id).single();
  if (error || !row) throw error ?? new Error("Dokument saknas");
  const path = (row as any).storage_path as string | null;
  if (!path) throw new Error("Inget lagrat innehåll att om-indexera");

  const dl = await supabase.storage.from("documents").download(path);
  if (dl.error || !dl.data) throw dl.error ?? new Error("Kunde inte ladda ned fil");
  const file = new File([dl.data], (row as any).title ?? "file", {
    type: (row as any).mime_type ?? "application/octet-stream",
  });
  const text = await extractText(file);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-ingest`;
  const { authedJsonHeaders } = await import("./auth-headers");
  const resp = await fetch(url, {
    method: "POST",
    headers: await authedJsonHeaders(),
    body: JSON.stringify({ document_id: id, text }),
  });
  if (!resp.ok) throw new Error(await resp.text());
}

export async function searchDocuments(
  query: string,
  opts: { k?: number; documentIds?: string[] } = {},
): Promise<ChunkMatch[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-search`;
  const { authedJsonHeaders } = await import("./auth-headers");
  const resp = await fetch(url, {
    method: "POST",
    headers: await authedJsonHeaders(),
    body: JSON.stringify({
      query,
      k: opts.k ?? 6,
      document_ids: opts.documentIds ?? null,
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  return (data.matches ?? []) as ChunkMatch[];
}

/**
 * Detect `@filename` mentions in a user message and resolve them to document IDs.
 * `@arkiv` or `@all` returns null filter (search whole archive).
 */
export function extractMentions(text: string): { tokens: string[]; all: boolean } {
  const tokens: string[] = [];
  let all = false;
  const re = /(^|\s)@([\w\-.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tok = m[2].toLowerCase();
    if (tok === "arkiv" || tok === "all" || tok === "alla") all = true;
    else tokens.push(tok);
  }
  return { tokens, all };
}

export async function resolveMentions(tokens: string[]): Promise<string[]> {
  if (tokens.length === 0) return [];
  const docs = await listDocuments();
  const ids: string[] = [];
  for (const tok of tokens) {
    const match = docs.find((d) =>
      d.title.toLowerCase().includes(tok) ||
      d.title.toLowerCase().replace(/\.[^.]+$/, "") === tok
    );
    if (match && !ids.includes(match.id)) ids.push(match.id);
  }
  return ids;
}

export function formatChunksForContext(matches: ChunkMatch[]): string {
  if (matches.length === 0) return "";
  const blocks = matches.map((m, i) =>
    `[${i + 1}] ${m.title} · chunk ${m.chunk_index} · sim=${m.similarity.toFixed(3)}\n${m.content}`
  );
  return `[ARKIV-KONTEXT — relevanta utdrag från dokumentarkivet]\n\n${blocks.join("\n\n---\n\n")}\n\n[/ARKIV-KONTEXT]`;
}

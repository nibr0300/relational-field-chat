import { authedJsonHeaders } from "./auth-headers";

export interface Attachment {
  type: "image" | "pdf" | "markdown" | "json" | "text";
  url: string;
  name: string;
  document_id?: string;
  chunk_count?: number;
}

export type Msg = {
  role: "user" | "assistant";
  content: string;
  image_url?: string;      // legacy compat
  file_url?: string;        // legacy compat
  file_name?: string;       // legacy compat
  attachments?: Attachment[];
  raapRunId?: string;       // tänkar-hatt: trace ref
  raapMeta?: { strategy: string; branches: number; calls: number; ms: number; trigger: string };
  mirrorMeta?: { rounds: number; reviewer: string; ms: number };
  prmMeta?: PrmMeta;
};

export interface PathResonanceMeta {
  path_label: string;
  resonance: number;
  dominant_shadow_pattern: string;
  risk_valence: string;
  whisper: string;
}

export interface ProspectiveMeta {
  fork_detected: boolean;
  fork_type: string;
  momentum_direction: "expanding" | "contracting" | "circling" | "threshold" | string;
  meta_whisper: string;
  confidence: number;
  path_resonances: PathResonanceMeta[];
}

export interface PrmMeta {
  tension: number;
  pattern: string;
  valence: string;
  whisper: string;
  operator: string;
  confidence: number;
  latency_ms: number;
  recurrence_count?: number;
  amplification_factor?: number;
  is_amplified?: boolean;
  pattern_age_turns?: number;
  prospective?: ProspectiveMeta | null;
}

export interface StreamStatusMeta {
  kind: "continuation" | "recovered";
  round?: number;
  message?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rfa-chat`;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_TOTAL_CHARS = 110_000;
const MAX_CONTEXT_MESSAGES = 30;
const NEAR_FIELD_PROTECTED_TURNS = 6;
const DIRECT_FILE_MARKER = "[DIREKT BIFOGAD FIL — HELTEXT]";
const STREAM_STALL_TIMEOUT_MS = 75_000;

function capText(text: string): string {
  if (text.includes(DIRECT_FILE_MARKER)) return text;
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_MESSAGE_CHARS)}\n\n[... äldre innehåll trunkerat för stabil körning ...]`;
}

function messageSize(message: any): number {
  if (typeof message.content === "string") return message.content.length;
  if (Array.isArray(message.content)) {
    return message.content.reduce((sum: number, part: any) => {
      if (part?.type === "text") return sum + String(part.text ?? "").length;
      if (part?.type === "image_url") return sum + 750;
      return sum + 250;
    }, 0);
  }
  return 500;
}

function capMessage(message: any): any {
  if (typeof message.content === "string") {
    return { ...message, content: capText(message.content) };
  }
  if (Array.isArray(message.content)) {
    let remainingText = MAX_MESSAGE_CHARS;
    return {
      ...message,
      content: message.content.map((part: any) => {
        if (part?.type !== "text") return part;
        const text = String(part.text ?? "");
        const capped = text.slice(0, Math.max(0, remainingText));
        remainingText -= capped.length;
        return {
          ...part,
          text: capped.length < text.length ? `${capped}\n\n[... bifogad text trunkerad ...]` : capped,
        };
      }),
    };
  }
  return message;
}

function compactForTransport(messages: any[]): any[] {
  const capped = messages.map((msg, index) => (
    index === messages.length - 1 && typeof msg.content === "string" && msg.content.includes(DIRECT_FILE_MARKER)
      ? msg
      : capMessage(msg)
  )).filter((m) => messageSize(m) > 0);
  const selected: any[] = [];
  let total = 0;

  for (let i = capped.length - 1; i >= 0; i--) {
    const msg = capped[i];
    const len = messageSize(msg);
    const distanceFromEnd = capped.length - 1 - i;
    const isProtected = distanceFromEnd < NEAR_FIELD_PROTECTED_TURNS;
    if (selected.length >= MAX_CONTEXT_MESSAGES && !isProtected) break;
    const isLatest = i === capped.length - 1;
    const isDirectFileTurn = isLatest && typeof msg.content === "string" && msg.content.includes(DIRECT_FILE_MARKER);
    if (!isProtected && !isDirectFileTurn && selected.length > 0 && total + len > MAX_TOTAL_CHARS) continue;
    selected.unshift(msg);
    total += len;
  }

  return selected.length ? selected : capped.slice(-1);
}

export async function streamChat({
  messages,
  conversationId,
  mirror,
  onDelta,
  onDone,
  onError,
  onMirrorMeta,
  onPrmSignal,
  onStatus,
}: {
  messages: Msg[];
  conversationId?: string;
  mirror?: boolean;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string, code?: string) => void;
  onMirrorMeta?: (meta: { rounds: number; reviewer: string; ms: number }) => void;
  onPrmSignal?: (signal: PrmMeta) => void;
  onStatus?: (meta: StreamStatusMeta) => void;
}) {
  // Build messages for the API, including image content
  const apiMessages = compactForTransport(messages.map((m) => {
    if (m.role !== "user") return { role: m.role, content: m.content };

    const imageUrls = (m.attachments ?? [])
      .filter((a) => a.type === "image")
      .map((a) => a.url);
    // Legacy fallback
    if (!imageUrls.length && m.image_url) imageUrls.push(m.image_url);

    if (imageUrls.length > 0) {
      return {
        role: "user",
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  }));

  // Retry transient edge runtime errors (cold boot 502/503/504) with backoff
  let resp: Response | null = null;
  let lastErr: unknown = null;
  const headers = await authedJsonHeaders();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      resp = await fetch(CHAT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: apiMessages, conversationId, mirror: !!mirror }),
      });
      if (![502, 503, 504].includes(resp.status)) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400 * Math.pow(3, attempt)));
  }


  if (!resp) {
    onError(lastErr instanceof Error ? lastErr.message : "Nätverksfel");
    return;
  }

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    if ([502, 503, 504].includes(resp.status)) {
      onError("Tjänsten startar om. Försök igen om några sekunder.");
    } else {
      onError(data.error || data.message || `Error ${resp.status}`);
    }
    return;
  }

  if (!resp.body) {
    onError("No response stream");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamDone = false;
  let receivedDoneSignal = false;

  while (!streamDone) {
    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error("RFA svarade inte på över en minut. Strömmen sparades fram till sista synliga raden.")),
        STREAM_STALL_TIMEOUT_MS,
      );
    });
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await Promise.race([reader.read(), timeout]);
    } catch (error) {
      try { await reader.cancel(); } catch { /* ignore */ }
      onError(error instanceof Error ? error.message : "Svarströmmen stannade utan avslut.");
      return;
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { receivedDoneSignal = true; streamDone = true; break; }
      try {
        const parsed = JSON.parse(json);
        if (parsed.mirror_meta && onMirrorMeta) {
          onMirrorMeta(parsed.mirror_meta);
          continue;
        }
        if (parsed.prm_meta && onPrmSignal) {
          onPrmSignal(parsed.prm_meta);
          continue;
        }
        if (parsed.status_meta && onStatus) {
          onStatus(parsed.status_meta);
          continue;
        }
        if (parsed.error) {
          onError(parsed.message || parsed.error || "AI-anropet avbröts innan ett svar kunde skapas.");
          return;
        }
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  if (buffer.trim()) {
    for (let raw of buffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (!raw.startsWith("data: ")) continue;
      const json = raw.slice(6).trim();
      if (json === "[DONE]") { receivedDoneSignal = true; continue; }
      try {
        const parsed = JSON.parse(json);
        if (parsed.mirror_meta && onMirrorMeta) { onMirrorMeta(parsed.mirror_meta); continue; }
        if (parsed.prm_meta && onPrmSignal) { onPrmSignal(parsed.prm_meta); continue; }
        if (parsed.status_meta && onStatus) { onStatus(parsed.status_meta); continue; }
        if (parsed.error) {
          onError(parsed.message || parsed.error || "AI-anropet avbröts innan ett svar kunde skapas.");
          return;
        }
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {}
    }
  }

  if (!receivedDoneSignal) {
    onError("Svarströmmen bröts innan RFA hann avsluta. Skicka igen eller be RFA fortsätta från sista synliga raden.");
    return;
  }

  onDone();
}

export interface Attachment {
  type: "image" | "pdf";
  url: string;
  name: string;
}

export type Msg = {
  role: "user" | "assistant";
  content: string;
  image_url?: string;      // legacy compat
  file_url?: string;        // legacy compat
  file_name?: string;       // legacy compat
  attachments?: Attachment[];
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rfa-chat`;

export async function streamChat({
  messages,
  conversationId,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  conversationId?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  // Build messages for the API, including image content
  const apiMessages = messages.map((m) => {
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
  });

  // Retry transient edge runtime errors (cold boot 502/503/504) with backoff
  let resp: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages, conversationId }),
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

  while (!streamDone) {
    const { done, value } = await reader.read();
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
      if (json === "[DONE]") { streamDone = true; break; }
      try {
        const parsed = JSON.parse(json);
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
      if (json === "[DONE]") continue;
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {}
    }
  }

  onDone();
}

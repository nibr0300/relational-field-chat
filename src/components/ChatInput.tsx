import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, X, FileText } from "lucide-react";

interface AttachedFile {
  file: File;
  type: "image" | "pdf" | "markdown" | "json" | "text";
  documentId?: string;
  chunkCount?: number;
  preview?: string; // data URL for images
}

interface ChatInputProps {
  onSend: (text: string, files: AttachedFile[], opts: { hat: boolean; mirror: boolean }) => void | Promise<void>;
  disabled?: boolean;
}

export type { AttachedFile };

const DRAFT_KEY = "rfa:chat-input-draft";
const LAST_SENT_DRAFT_KEY = "rfa:chat-input-last-sent";
const DRAFT_TS_KEY = "rfa:chat-input-draft:updated-at";
const LAST_SENT_DRAFT_TS_KEY = "rfa:chat-input-last-sent:updated-at";
const MEMORY_DRAFT_KEY = "__rfaChatInputDraft";
const MEMORY_LAST_SENT_KEY = "__rfaChatInputLastSent";
const MEMORY_DRAFT_TS_KEY = "__rfaChatInputDraftUpdatedAt";
const MEMORY_LAST_SENT_TS_KEY = "__rfaChatInputLastSentUpdatedAt";
const CLEAR_SENTINEL = "__RFA_EMPTY_DRAFT__";

type DraftWindow = Window & {
  [MEMORY_DRAFT_KEY]?: string;
  [MEMORY_LAST_SENT_KEY]?: string;
  [MEMORY_DRAFT_TS_KEY]?: number;
  [MEMORY_LAST_SENT_TS_KEY]?: number;
};

function writeStorageValue(key: string, value: string) {
  const write = (store: Storage) => {
    if (value === CLEAR_SENTINEL) store.removeItem(key);
    else store.setItem(key, value);
  };
  try { write(localStorage); } catch { /* ignore storage errors */ }
  try { write(sessionStorage); } catch { /* ignore storage errors */ }
}

function clearStorageValue(key: string) {
  writeStorageValue(key, CLEAR_SENTINEL);
}

function readStorageTimestamp(key: string): number {
  const parse = (value: string | null | undefined) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  try {
    return Math.max(parse(localStorage.getItem(key)), parse(sessionStorage.getItem(key)));
  } catch { return 0; }
}

function writeTimestamp(key: string, value: number) {
  writeStorageValue(key, String(value));
}

function clearTimestamp(key: string) {
  clearStorageValue(key);
}

function readDraftCandidate() {
  if (typeof window === "undefined") return "";
  const present = (value: string | null | undefined) => value && value.length > 0 ? value : null;
  const memoryDraft = (window as DraftWindow)[MEMORY_DRAFT_KEY];
  const memoryLastSent = (window as DraftWindow)[MEMORY_LAST_SENT_KEY];
  const candidates: Array<{ value: string; updatedAt: number; kind: "draft" | "lastSent" }> = [];
  try {
    const stored = present(localStorage.getItem(DRAFT_KEY)) ?? present(sessionStorage.getItem(DRAFT_KEY));
    const lastSent = present(localStorage.getItem(LAST_SENT_DRAFT_KEY)) ?? present(sessionStorage.getItem(LAST_SENT_DRAFT_KEY));
    if (stored) candidates.push({ value: stored, updatedAt: readStorageTimestamp(DRAFT_TS_KEY), kind: "draft" });
    if (lastSent) candidates.push({ value: lastSent, updatedAt: readStorageTimestamp(LAST_SENT_DRAFT_TS_KEY), kind: "lastSent" });
  } catch { /* fall through to in-memory fallback */ }
  const win = window as DraftWindow;
  const memDraft = present(memoryDraft);
  const memLastSent = present(memoryLastSent);
  if (memDraft) candidates.push({ value: memDraft, updatedAt: win[MEMORY_DRAFT_TS_KEY] ?? 0, kind: "draft" });
  if (memLastSent) candidates.push({ value: memLastSent, updatedAt: win[MEMORY_LAST_SENT_TS_KEY] ?? 0, kind: "lastSent" });

  candidates.sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    if (a.kind !== b.kind) return a.kind === "draft" ? -1 : 1;
    return b.value.length - a.value.length;
  });
  return candidates[0]?.value ?? "";
}

function readDraft() {
  return readDraftCandidate();
}

function writeDraft(value: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  (window as DraftWindow)[MEMORY_DRAFT_KEY] = value;
  (window as DraftWindow)[MEMORY_DRAFT_TS_KEY] = now;
  writeStorageValue(DRAFT_KEY, value);
  writeTimestamp(DRAFT_TS_KEY, now);
}

function clearDraft() {
  if (typeof window === "undefined") return;
  (window as DraftWindow)[MEMORY_DRAFT_KEY] = "";
  (window as DraftWindow)[MEMORY_DRAFT_TS_KEY] = Date.now();
  clearStorageValue(DRAFT_KEY);
  clearTimestamp(DRAFT_TS_KEY);
}

function writeLastSentDraft(value: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  (window as DraftWindow)[MEMORY_LAST_SENT_KEY] = value;
  (window as DraftWindow)[MEMORY_LAST_SENT_TS_KEY] = now;
  writeStorageValue(LAST_SENT_DRAFT_KEY, value);
  writeTimestamp(LAST_SENT_DRAFT_TS_KEY, now);
}

function clearLastSentDraft() {
  if (typeof window === "undefined") return;
  (window as DraftWindow)[MEMORY_LAST_SENT_KEY] = "";
  (window as DraftWindow)[MEMORY_LAST_SENT_TS_KEY] = Date.now();
  clearStorageValue(LAST_SENT_DRAFT_KEY);
  clearTimestamp(LAST_SENT_DRAFT_TS_KEY);
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState(readDraft);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [hat, setHat] = useState(false);
  const [mirror, setMirror] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef(input);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Keep the React ref current. Actual persistence happens on direct DOM/user
  // input events below; that avoids a remount/programmatic empty state wiping a
  // non-empty persisted draft during reload/auth/HMR turbulence.
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    const flushDraft = () => writeDraft(textareaRef.current?.value ?? inputRef.current);
    const syncFromDom = () => {
      const value = textareaRef.current?.value ?? "";
      inputRef.current = value;
      writeDraft(value);
    };
    const syncAfterDomMutation = () => window.setTimeout(syncFromDom, 0);
    // Återställ utkast om storage har mer text än komponenten (reload, auth-remount, bfcache, HMR)
    const restoreFromStorage = () => {
      const stored = readDraft();
      const current = textareaRef.current?.value ?? inputRef.current;
      if (stored && stored.length > current.length && stored !== current) {
        inputRef.current = stored;
        setInput(stored);
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) flushDraft();
      else restoreFromStorage();
    };
    const textarea = textareaRef.current;
    textarea?.addEventListener("input", syncFromDom);
    textarea?.addEventListener("change", syncFromDom);
    textarea?.addEventListener("paste", syncAfterDomMutation);
    textarea?.addEventListener("cut", syncAfterDomMutation);
    window.addEventListener("beforeunload", flushDraft);
    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("pageshow", restoreFromStorage);
    window.addEventListener("focus", restoreFromStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    import.meta.hot?.dispose(flushDraft);
    return () => {
      flushDraft();
      textarea?.removeEventListener("input", syncFromDom);
      textarea?.removeEventListener("change", syncFromDom);
      textarea?.removeEventListener("paste", syncAfterDomMutation);
      textarea?.removeEventListener("cut", syncAfterDomMutation);
      window.removeEventListener("beforeunload", flushDraft);
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("pageshow", restoreFromStorage);
      window.removeEventListener("focus", restoreFromStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if ((!trimmed && files.length === 0) || disabled) return;
    const sentText = input;
    writeDraft(sentText);
    writeLastSentDraft(sentText);
    setInput("");
    setFiles([]);
    setHat(false);
    setMirror(false);
    try {
      await onSend(trimmed, files, { hat, mirror });
      clearDraft();
      clearLastSentDraft();
    } catch {
      setInput(sentText);
      writeDraft(sentText);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const newFiles: AttachedFile[] = [];
    for (const file of selected) {
      const lower = file.name.toLowerCase();
      const isMarkdown =
        file.type === "text/markdown" ||
        file.type === "text/x-markdown" ||
        lower.endsWith(".md") ||
        lower.endsWith(".markdown") ||
        lower.endsWith(".mdx");
      const isJson =
        file.type === "application/json" ||
        file.type === "text/json" ||
        file.type === "application/x-ipynb+json" ||
        lower.endsWith(".json") ||
        lower.endsWith(".ipynb");
      const isText =
        file.type === "text/plain" ||
        lower.endsWith(".txt") ||
        lower.endsWith(".log") ||
        lower.endsWith(".csv") ||
        lower.endsWith(".py");
      if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
        newFiles.push({ file, type: "pdf" });
      } else if (isMarkdown) {
        newFiles.push({ file, type: "markdown" });
      } else if (isJson) {
        newFiles.push({ file, type: "json" });
      } else if (isText) {
        newFiles.push({ file, type: "text" });
      } else if (file.type.startsWith("image/")) {
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newFiles.push({ file, type: "image", preview });
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {files.map((f, i) => (
              <div key={i} className="relative">
                {f.type === "image" && f.preview ? (
                  <img src={f.preview} alt="Preview" className="max-h-20 rounded-lg border border-border" />
                ) : (
                  <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-xs text-foreground truncate max-w-[140px]">{f.file.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3 items-end">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,text/markdown,.md,.markdown,.mdx,application/json,.json,.ipynb,application/x-ipynb+json,text/plain,.txt,.log,.csv,.py"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="p-3 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/30 disabled:opacity-30 transition-all"
            title="Bifoga filer (bilder, PDF, Markdown & JSON)"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            onClick={() => setHat((h) => !h)}
            disabled={disabled}
            className={`p-3 rounded-lg border transition-all ${
              hat
                ? "bg-primary/20 border-primary/50 text-primary glow-amber"
                : "border-border text-muted-foreground hover:text-primary hover:border-primary/30"
            } disabled:opacity-30`}
            title={hat ? "Tänkar-hatt PÅ — djup planering aktiv" : "Aktivera tänkar-hatt (RAAP)"}
            aria-pressed={hat}
          >
            <span className="text-base leading-none">🎩</span>
          </button>
          <button
            onClick={() => setMirror((m) => !m)}
            disabled={disabled}
            className={`p-3 rounded-lg border transition-all ${
              mirror
                ? "bg-primary/20 border-primary/50 text-primary glow-amber"
                : "border-border text-muted-foreground hover:text-primary hover:border-primary/30"
            } disabled:opacity-30`}
            title={mirror ? "Spegel PÅ — draft granskas av starkare modell innan svar" : "Aktivera spegel (självreflektiv granskning)"}
            aria-pressed={mirror}
          >
            <span className="text-base leading-none">🪞</span>
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              inputRef.current = e.target.value;
              writeDraft(e.target.value);
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ställ en fråga till RFA..."
            disabled={disabled}
            rows={1}
            className="flex-1 bg-secondary border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || (!input.trim() && files.length === 0)}
            className="p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all glow-amber"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Folder, File as FileIcon, ChevronLeft, Loader2, X, Download, Search, RefreshCw } from "lucide-react";
import { authedJsonHeaders } from "@/lib/auth-headers";
import { toast } from "sonner";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SUPPORTED_MIMES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);
const TEXTISH_RE = /\.(txt|md|markdown|mdx|json|csv|log|ya?ml|html?|xml|tsx?|jsx?|py|rs|go|java|rb|php|c|cc|cpp|h|hpp|cs|swift|kt|sql|sh|toml|ini|conf|env)$/i;

function isIngestable(f: DriveFile): boolean {
  if (f.mimeType === FOLDER_MIME) return false;
  if (SUPPORTED_MIMES.has(f.mimeType)) return true;
  if (f.mimeType?.startsWith("text/")) return true;
  if (f.mimeType === "application/json") return true;
  return TEXTISH_RE.test(f.name);
}

function fileLabel(mime: string): string {
  if (mime === FOLDER_MIME) return "📁";
  if (mime.includes("document")) return "📄";
  if (mime.includes("spreadsheet")) return "📊";
  if (mime.includes("presentation")) return "🎞️";
  if (mime === "application/pdf") return "📕";
  return "📃";
}

export function DrivePanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [stack, setStack] = useState<Array<{ id: string; name: string }>>([{ id: "root", name: "Min Drive" }]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const current = stack[stack.length - 1];

  const load = useCallback(async (folderId: string, query?: string) => {
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-list`;
      const resp = await fetch(url, {
        method: "POST",
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ folder_id: folderId, query }),
      });
      if (!resp.ok) throw new Error((await resp.text()) || `Drive ${resp.status}`);
      const data = await resp.json();
      setFiles(data.files ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte läsa Drive");
      setFiles([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isOpen) load(current.id); }, [isOpen, current.id, load]);

  const openFolder = (f: DriveFile) => {
    setSearch("");
    setStack((s) => [...s, { id: f.id, name: f.name }]);
  };
  const goUp = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const goRoot = () => { setSearch(""); setStack([{ id: "root", name: "Min Drive" }]); };

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) { load(current.id); return; }
    load(current.id, search.trim());
  };

  const ingestFile = async (f: DriveFile) => {
    setBusy(f.id);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-ingest`;
      const resp = await fetch(url, {
        method: "POST",
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ file_id: f.id, name: f.name, mime_type: f.mimeType }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `fel ${resp.status}`);
      toast.success(`${f.name}: ${data.chunk_count} chunks indexerade`);
    } catch (e) {
      toast.error(`${f.name}: ${e instanceof Error ? e.message : "fel"}`);
    } finally { setBusy(null); }
  };

  const ingestFolder = async (f: DriveFile, recursive: boolean) => {
    if (!confirm(`Indexera hela mappen "${f.name}"${recursive ? " (inkl. undermappar)" : ""}? Detta kan ta en stund.`)) return;
    setBusy(f.id);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-ingest`;
      const resp = await fetch(url, {
        method: "POST",
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ file_id: f.id, name: f.name, is_folder: true, recursive }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `fel ${resp.status}`);
      toast.success(`${f.name}: ${data.ok} indexerade${data.fail ? `, ${data.fail} fel` : ""}`);
      if (data.errors?.length) console.warn("Drive ingest errors:", data.errors);
    } catch (e) {
      toast.error(`${f.name}: ${e instanceof Error ? e.message : "fel"}`);
    } finally { setBusy(null); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gradient-amber font-display">☁️ Google Drive</h2>
            <p className="text-[10px] text-muted-foreground truncate">
              Bläddra och indexera direkt från visiontruthdesign@gmail.com
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
          <button onClick={goRoot} className="text-muted-foreground hover:text-primary">Root</button>
          {stack.slice(1).map((s, i) => (
            <span key={s.id} className="flex items-center gap-2 text-muted-foreground">
              <span>/</span>
              <button
                onClick={() => setStack((st) => st.slice(0, i + 2))}
                className="truncate max-w-[140px] hover:text-primary"
              >{s.name}</button>
            </span>
          ))}
          {stack.length > 1 && (
            <button onClick={goUp} className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-primary">
              <ChevronLeft className="w-3 h-3" /> Upp
            </button>
          )}
          <button
            onClick={() => load(current.id, search.trim() || undefined)}
            disabled={loading}
            className="p-1 rounded hover:bg-secondary text-muted-foreground"
            title="Uppdatera"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <form onSubmit={doSearch} className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök filer i hela Drive..."
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(""); load(current.id); }}
              className="text-[10px] text-muted-foreground hover:text-primary">rensa</button>
          )}
        </form>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading && files.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {!loading && files.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-12">Tom mapp.</div>
          )}
          {files.map((f) => {
            const isFolder = f.mimeType === FOLDER_MIME;
            const supported = isIngestable(f);
            return (
              <div key={f.id} className="flex items-center gap-2 px-4 py-2 border-b border-border/40 hover:bg-secondary/30">
                <span className="text-base">{fileLabel(f.mimeType)}</span>
                <button
                  onClick={() => isFolder && openFolder(f)}
                  className={`flex-1 text-left min-w-0 ${isFolder ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="text-xs text-foreground truncate font-medium">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {f.mimeType.replace("application/vnd.google-apps.", "google/")}
                    {f.modifiedTime && ` · ${new Date(f.modifiedTime).toLocaleDateString()}`}
                  </div>
                </button>
                {isFolder ? (
                  <>
                    <button
                      onClick={() => ingestFolder(f, false)}
                      disabled={busy === f.id}
                      className="text-[10px] px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                      title="Indexera filer i denna mapp"
                    >
                      {busy === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Indexera"}
                    </button>
                    <button
                      onClick={() => ingestFolder(f, true)}
                      disabled={busy === f.id}
                      className="text-[10px] px-2 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50"
                      title="Indexera inkl. undermappar"
                    >
                      + sub
                    </button>
                  </>
                ) : supported ? (
                  <button
                    onClick={() => ingestFile(f)}
                    disabled={busy === f.id}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {busy === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    Indexera
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground/60">stöds ej</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          Stöds: Google Docs/Sheets/Slides + alla textfiler. PDF/binärt hoppas över.
        </div>
      </div>
    </div>
  );
}

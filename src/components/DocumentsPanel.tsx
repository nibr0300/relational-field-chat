import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, RefreshCw, X, FileText, Tag, Loader2 } from "lucide-react";
import {
  listDocuments,
  deleteDocument,
  uploadAndIngest,
  reingestDocument,
  updateDocumentTags,
  type DocumentRow,
} from "@/lib/documents-store";
import { toast } from "sonner";

export function DocumentsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setDocs(await listDocuments()); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isOpen) refresh(); }, [isOpen, refresh]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files ?? []);
    e.target.value = "";
    // Filter: skip hidden files and obvious binaries
    const files = all.filter((f) => {
      const rel = (f as any).webkitRelativePath || f.name;
      if (rel.split("/").some((p: string) => p.startsWith("."))) return false;
      const lower = f.name.toLowerCase();
      const allowed = /\.(pdf|txt|md|markdown|mdx|json|ipynb|csv|log|ya?ml|html?|xml|tsx?|jsx?|py|rs|go|java|rb|php|c|cc|cpp|h|hpp|cs|swift|kt|sql|sh|toml|ini|conf|env)$/;
      return allowed.test(lower) || f.type.startsWith("text/") || f.type === "application/pdf" || f.type === "application/json" || f.type === "application/x-ipynb+json";
    });
    if (files.length === 0) return;
    if (files.length > 50 && !confirm(`Du är på väg att ladda upp ${files.length} filer. Fortsätta?`)) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const f of files) {
      try {
        const rel = (f as any).webkitRelativePath as string | undefined;
        await uploadAndIngest(f, rel ? { title: rel } : undefined);
        ok++;
      } catch (err) {
        console.error(err);
        fail++;
        toast.error(`${f.name}: ${err instanceof Error ? err.message : "fel"}`);
      }
    }
    await refresh();
    toast.success(`Klart: ${ok} indexerade${fail ? `, ${fail} fel` : ""}`);
    setUploading(false);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Ta bort "${title}" från arkivet?`)) return;
    try { await deleteDocument(id); toast.success("Borttaget"); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Kunde inte ta bort"); }
  };

  const handleReingest = async (id: string) => {
    try { await reingestDocument(id); toast.success("Om-indexerad"); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Kunde inte om-indexera"); }
  };

  const handleTagEdit = async (doc: DocumentRow) => {
    const raw = prompt(`Taggar för "${doc.title}" (kommaseparerade):`, doc.tags.join(", "));
    if (raw === null) return;
    const tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
    try { await updateDocumentTags(doc.id, tags); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Fel"); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gradient-amber font-display">📚 Arkivet</h2>
            <p className="text-[10px] text-muted-foreground">
              Per-användar dokumentlager · semantisk sökning · använd <code className="text-primary">@filnamn</code> eller <code className="text-primary">@arkiv</code> i chatten
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,application/pdf,.txt,.md,.markdown,.mdx,.json,.ipynb,application/x-ipynb+json,.csv,.log,.yaml,.yml,.html,.xml,.py,text/*"
            className="hidden"
            onChange={handleUpload}
          />
          <input
            ref={folderRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleUpload}
            // @ts-expect-error non-standard attrs for folder upload
            webkitdirectory=""
            directory=""
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 glow-amber"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Filer
          </button>
          <button
            onClick={() => folderRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-primary/40 text-primary text-xs font-medium hover:bg-primary/10 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Mapp
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <div className="ml-auto text-[10px] text-muted-foreground">
            {docs.length} dokument · {docs.reduce((a, d) => a + (d.chunk_count ?? 0), 0)} chunks
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-2">
          {docs.length === 0 && !loading && (
            <div className="text-center text-xs text-muted-foreground py-12">
              Arkivet är tomt. Ladda upp PDF, Markdown, txt, JSON, CSV, kod eller andra textfiler.
            </div>
          )}
          {docs.map((d) => (
            <div key={d.id} className="border border-border rounded-md p-3 bg-secondary/30">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate font-medium">{d.title}</div>
                  <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span className={
                      d.status === "ready" ? "text-primary" :
                      d.status === "error" ? "text-destructive" :
                      "text-amber-400"
                    }>● {d.status}</span>
                    <span>{d.chunk_count} chunks</span>
                    <span>{d.char_count.toLocaleString()} tkn-ish</span>
                    {d.size_bytes != null && <span>{(d.size_bytes / 1024).toFixed(1)} KB</span>}
                    {d.mime_type && <span className="truncate">{d.mime_type}</span>}
                  </div>
                  {d.error && (
                    <div className="text-[10px] text-destructive mt-1 break-all">{d.error}</div>
                  )}
                  {d.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {d.tags.map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button title="Taggar" onClick={() => handleTagEdit(d)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary">
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                  <button title="Om-indexera" onClick={() => handleReingest(d.id)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button title="Radera" onClick={() => handleDelete(d.id, d.title)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Brain, Trash2, X } from "lucide-react";
import { listEigenstates, deleteEigenstate, type Eigenstate } from "@/lib/memory-store";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  personal: "Personligt",
  methodology: "Metodologi",
  insight: "Insikt",
  architecture: "Arkitektur",
  relationship: "Relation",
  general: "Allmänt",
};

const CATEGORY_COLORS: Record<string, string> = {
  personal: "bg-blue-500/20 text-blue-300",
  methodology: "bg-purple-500/20 text-purple-300",
  insight: "bg-amber-500/20 text-amber-300",
  architecture: "bg-emerald-500/20 text-emerald-300",
  relationship: "bg-rose-500/20 text-rose-300",
  general: "bg-muted text-muted-foreground",
};

export function MemoryPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [eigenstates, setEigenstates] = useState<Eigenstate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      listEigenstates()
        .then(setEigenstates)
        .catch(() => toast.error("Kunde inte ladda minnen"))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    try {
      await deleteEigenstate(id);
      setEigenstates((prev) => prev.filter((e) => e.id !== id));
      toast.success("Eigenstate raderat");
    } catch {
      toast.error("Kunde inte radera");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Eigenstate Minnesbank</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <p className="text-muted-foreground text-center py-8">Laddar minnen…</p>
          )}
          {!loading && eigenstates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Ingen lagrad Eigenstate ännu.</p>
              <p className="text-sm mt-1">RFA kommer automatiskt spara viktiga insikter under konversationer.</p>
            </div>
          )}
          {eigenstates.map((e) => (
            <div
              key={e.id}
              className="bg-background border border-border rounded-lg p-3 group hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[e.category] || CATEGORY_COLORS.general}`}>
                      {CATEGORY_LABELS[e.category] || e.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      σ={e.significance.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{e.content}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {new Date(e.created_at).toLocaleDateString("sv-SE")}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(e.id)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                  title="Radera"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { ArrowLeft, Brain, Trash2, X, Sparkles, Layers, CircleDot, Gem } from "lucide-react";
import {
  listEigenstates, deleteEigenstate,
  listCorona, deleteCorona,
  listLimbus, deleteLimbus,
  listVortex, deleteVortex,
  listFriction, deleteFriction,
  type Eigenstate, type CoronaItem, type LimbusItem, type VortexItem, type FrictionItem,
} from "@/lib/memory-store";
import { toast } from "sonner";

type Tab = "vortex" | "friction" | "limbus" | "corona" | "legacy";

const TABS: { id: Tab; label: string; icon: typeof Brain; description: string }[] = [
  { id: "vortex", label: "Vortex", icon: Gem, description: "Eviga mönster" },
  { id: "friction", label: "Friction", icon: Sparkles, description: "Stenarna i floden" },
  { id: "limbus", label: "Limbus", icon: Layers, description: "Komprimerat mellanlager" },
  { id: "corona", label: "Corona", icon: CircleDot, description: "Färska observationer" },
  { id: "legacy", label: "Legacy", icon: Brain, description: "Gamla eigenstates" },
];

const CATEGORY_COLORS: Record<string, string> = {
  personal: "bg-blue-500/20 text-blue-300",
  methodology: "bg-purple-500/20 text-purple-300",
  insight: "bg-amber-500/20 text-amber-300",
  architecture: "bg-emerald-500/20 text-emerald-300",
  relationship: "bg-rose-500/20 text-rose-300",
  general: "bg-muted text-muted-foreground",
};

export function MemoryPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [loading, setLoading] = useState(false);
  const [vortex, setVortex] = useState<VortexItem[]>([]);
  const [friction, setFriction] = useState<FrictionItem[]>([]);
  const [limbus, setLimbus] = useState<LimbusItem[]>([]);
  const [corona, setCorona] = useState<CoronaItem[]>([]);
  const [legacy, setLegacy] = useState<Eigenstate[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setTab(null);
    setLoading(true);
    Promise.all([
      listVortex().then(setVortex).catch(() => {}),
      listFriction().then(setFriction).catch(() => {}),
      listLimbus().then(setLimbus).catch(() => {}),
      listCorona().then(setCorona).catch(() => {}),
      listEigenstates().then(setLegacy).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [isOpen]);

  const counts: Record<Tab, number> = {
    vortex: vortex.length,
    friction: friction.length,
    limbus: limbus.length,
    corona: corona.length,
    legacy: legacy.length,
  };

  const selectedTab = tab ? TABS.find((t) => t.id === tab) : null;

  const wrap = async (fn: () => Promise<void>) => {
    try { await fn(); toast.success("Raderat"); } catch { toast.error("Kunde inte radera"); }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl mx-2 sm:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Metatronic Memory</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {tab === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 border-b border-border">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={(e) => { e.stopPropagation(); setTab(t.id); }}
                  className="flex sm:flex-col items-center sm:items-start gap-2 px-3 py-2.5 rounded-lg border border-border bg-background/60 text-left hover:border-primary/40 hover:bg-secondary/60 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 shrink-0 text-primary" />
                    <span className="text-sm text-foreground truncate">{t.label}</span>
                  </span>
                  <span className="ml-auto sm:ml-0 text-xs text-muted-foreground">{counts[t.id]} anteckningar</span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <button
                onClick={(e) => { e.stopPropagation(); setTab(null); }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Flikar
              </button>
              {selectedTab && (
                <div className="flex items-center gap-1.5 min-w-0 text-sm text-primary">
                  <selectedTab.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{selectedTab.label}</span>
                  <span className="text-xs opacity-60">({counts[selectedTab.id]})</span>
                </div>
              )}
            </div>
            <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/50">
              {selectedTab?.description}
            </div>
          </>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
          {loading && <p className="text-muted-foreground text-center py-8">Laddar minnen…</p>}

          {!loading && tab === null && (
            <Empty icon={Brain} text="Välj en minnesflik för att öppna dess anteckningar." />
          )}

          {!loading && tab === "vortex" && vortex.length === 0 && (
            <Empty icon={Gem} text="Inga eviga mönster har kristalliserats ännu." />
          )}
          {!loading && tab === "vortex" && vortex.map((v) => (
            <Card key={v.id} onDelete={() => wrap(async () => { await deleteVortex(v.id); setVortex((p) => p.filter((x) => x.id !== v.id)); })}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium">⬡ {v.pattern_name}</span>
                <span className="text-xs text-muted-foreground">stabilitet={v.stability.toFixed(2)}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{v.description}</p>
              {v.related_categories?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">{v.related_categories.join(" · ")}</p>
              )}
            </Card>
          ))}

          {!loading && tab === "friction" && friction.length === 0 && (
            <Empty icon={Sparkles} text="Inga friktionspunkter registrerade ännu." />
          )}
          {!loading && tab === "friction" && friction.map((f) => (
            <Card key={f.id} onDelete={() => wrap(async () => { await deleteFriction(f.id); setFriction((p) => p.filter((x) => x.id !== f.id)); })}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[f.category] || CATEGORY_COLORS.general}`}>{f.category}</span>
                <span className="text-xs text-muted-foreground">r={f.resistance_strength.toFixed(2)} · ×{f.occurrence_count}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{f.description}</p>
            </Card>
          ))}

          {!loading && tab === "limbus" && limbus.length === 0 && (
            <Empty icon={Layers} text="Inga komprimerade minnen ännu." />
          )}
          {!loading && tab === "limbus" && limbus.map((l) => (
            <Card key={l.id} onDelete={() => wrap(async () => { await deleteLimbus(l.id); setLimbus((p) => p.filter((x) => x.id !== l.id)); })}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[l.category] || CATEGORY_COLORS.general}`}>{l.category}</span>
                <span className="text-xs text-muted-foreground">n={l.observation_count} · σ̄={l.mean_significance.toFixed(2)}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{l.summary}</p>
            </Card>
          ))}

          {!loading && tab === "corona" && corona.length === 0 && (
            <Empty icon={CircleDot} text="Ingen färsk observation ännu." />
          )}
          {!loading && tab === "corona" && corona.map((c) => (
            <Card key={c.id} onDelete={() => wrap(async () => { await deleteCorona(c.id); setCorona((p) => p.filter((x) => x.id !== c.id)); })}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[c.category] || CATEGORY_COLORS.general}`}>{c.category}</span>
                <span className="text-xs text-muted-foreground">σ={c.significance.toFixed(2)}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{c.content}</p>
              <p className="text-xs text-muted-foreground mt-1.5">{new Date(c.created_at).toLocaleDateString("sv-SE")}</p>
            </Card>
          ))}

          {!loading && tab === "legacy" && legacy.length === 0 && (
            <Empty icon={Brain} text="Inga gamla eigenstates." />
          )}
          {!loading && tab === "legacy" && legacy.map((e) => (
            <Card key={e.id} onDelete={() => wrap(async () => { await deleteEigenstate(e.id); setLegacy((p) => p.filter((x) => x.id !== e.id)); })}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[e.category] || CATEGORY_COLORS.general}`}>{e.category}</span>
                <span className="text-xs text-muted-foreground">σ={e.significance.toFixed(1)}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{e.content}</p>
              <p className="text-xs text-muted-foreground mt-1.5">{new Date(e.created_at).toLocaleDateString("sv-SE")}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="bg-background border border-border rounded-lg p-3 group hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        <button
          onClick={onDelete}
          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
          title="Radera"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Brain; text: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Icon className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>{text}</p>
    </div>
  );
}

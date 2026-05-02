import { useState, useEffect } from "react";
import { ArrowLeft, Brain, Trash2, X, Sparkles, Layers, CircleDot, Gem, Wand2, ChevronDown, ChevronRight, ScrollText, Loader2 } from "lucide-react";
import {
  listEigenstates, deleteEigenstate,
  listCorona, deleteCorona,
  listLimbus, deleteLimbus,
  listVortex, deleteVortex,
  listFriction, deleteFriction,
  type Eigenstate, type CoronaItem, type LimbusItem, type VortexItem, type FrictionItem,
} from "@/lib/memory-store";
import {
  listConstitutionRules, retireConstitutionRule, listDistillationRuns, runDistillation,
  type ConstitutionRule, type DistillationRun,
} from "@/lib/distillation-store";
import { toast } from "sonner";

type Tab = "vortex" | "friction" | "limbus" | "corona" | "legacy" | "constitution";

const TABS: { id: Tab; label: string; icon: typeof Brain; description: string }[] = [
  { id: "vortex", label: "Vortex", icon: Gem, description: "Eviga mönster" },
  { id: "friction", label: "Friction", icon: Sparkles, description: "Stenarna i floden" },
  { id: "limbus", label: "Limbus", icon: Layers, description: "Komprimerat mellanlager" },
  { id: "corona", label: "Corona", icon: CircleDot, description: "Färska observationer" },
  { id: "legacy", label: "Legacy", icon: Brain, description: "Gamla eigenstates" },
  { id: "constitution", label: "Konstitution", icon: ScrollText, description: "Destillerade regler" },
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
  const [rules, setRules] = useState<ConstitutionRule[]>([]);
  const [runs, setRuns] = useState<DistillationRun[]>([]);
  const [distilling, setDistilling] = useState(false);

  const refreshAll = () => Promise.all([
    listVortex().then(setVortex).catch(() => {}),
    listFriction().then(setFriction).catch(() => {}),
    listLimbus().then(setLimbus).catch(() => {}),
    listCorona().then(setCorona).catch(() => {}),
    listEigenstates().then(setLegacy).catch(() => {}),
    listConstitutionRules().then(setRules).catch(() => {}),
    listDistillationRuns(10).then(setRuns).catch(() => {}),
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setTab(null);
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
  }, [isOpen]);

  const counts: Record<Tab, number> = {
    vortex: vortex.length,
    friction: friction.length,
    limbus: limbus.length,
    corona: corona.length,
    legacy: legacy.length,
    constitution: rules.filter((r) => r.is_active).length,
  };

  const selectedTab = tab ? TABS.find((t) => t.id === tab) : null;

  const wrap = async (fn: () => Promise<void>) => {
    try { await fn(); toast.success("Raderat"); } catch { toast.error("Kunde inte radera"); }
  };

  const handleDistill = async (triggerType: "manual" | "auto_pre_purge" = "manual") => {
    if (distilling) return;
    setDistilling(true);
    const id = toast.loading("Destillerar konversationshistorik (kan ta 1–2 min)…");
    try {
      const res = await runDistillation({ trigger_type: triggerType });
      toast.dismiss(id);
      if (res.rules_validated > 0) {
        toast.success(`${res.rules_validated} ny${res.rules_validated === 1 ? "" : "a"} regel${res.rules_validated === 1 ? "" : "er"} validerad${res.rules_validated === 1 ? "" : "e"} i ${res.cycles} cykel${res.cycles === 1 ? "" : "er"}.`);
      } else {
        toast.message(`Inga nya regler — ${res.termination_reason}.`);
      }
      await refreshAll();
      setTab("constitution");
    } catch (e: any) {
      toast.dismiss(id);
      toast.error(`Destillering misslyckades: ${e.message ?? e}`);
    } finally {
      setDistilling(false);
    }
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
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleDistill("manual"); }}
              disabled={distilling}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors"
              title="Pre-rens destilleringsloop: extrahera, validera och permanenta nya regler"
            >
              {distilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              Destillera
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {tab === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border-b border-border">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={(e) => { e.stopPropagation(); setTab(t.id); }}
                  className="flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg border border-border bg-background/60 text-left hover:border-primary/40 hover:bg-secondary/60 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 shrink-0 text-primary" />
                    <span className="text-sm text-foreground truncate">{t.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{counts[t.id]} {t.id === "constitution" ? "regler" : "anteckningar"}</span>
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

          {!loading && tab === "constitution" && (
            <ConstitutionView
              rules={rules}
              runs={runs}
              onRetire={async (r) => {
                try {
                  await retireConstitutionRule(r.id, "manuellt avvecklad");
                  setRules((p) => p.map((x) => (x.id === r.id ? { ...x, is_active: false } : x)));
                  toast.success("Regel avvecklad");
                } catch { toast.error("Kunde inte avveckla"); }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ConstitutionView({
  rules, runs, onRetire,
}: {
  rules: ConstitutionRule[];
  runs: DistillationRun[];
  onRetire: (r: ConstitutionRule) => void;
}) {
  const [showProtocol, setShowProtocol] = useState<string | null>(null);
  const active = rules.filter((r) => r.is_active);
  const lastRun = runs[0];

  if (active.length === 0 && !lastRun) {
    return <Empty icon={ScrollText} text="Inga destillerade regler ännu. Klicka på 'Destillera' för att köra första loopen." />;
  }

  return (
    <>
      {lastRun && (
        <div className="bg-background border border-border rounded-lg p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Senaste uppgraderingskvitto</p>
          <p className="text-sm text-foreground">
            <span className="text-primary font-medium">{lastRun.rules_validated}</span> validerade,{" "}
            <span className="text-muted-foreground">{lastRun.rules_rejected}</span> förkastade,{" "}
            {lastRun.fragments_extracted} fragment ur {lastRun.cycles_completed} cykel{lastRun.cycles_completed === 1 ? "" : "er"}.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(lastRun.created_at).toLocaleString("sv-SE")} · termin: {lastRun.termination_reason ?? "—"} · {lastRun.trigger_type}
          </p>
          <button
            onClick={() => setShowProtocol(showProtocol === lastRun.id ? null : lastRun.id)}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {showProtocol === lastRun.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Detaljvy (revisionslogg)
          </button>
          {showProtocol === lastRun.id && (
            <pre className="mt-2 max-h-64 overflow-auto text-[10px] leading-tight bg-card border border-border rounded p-2 text-muted-foreground">
              {JSON.stringify(lastRun.protocol_log, null, 2)}
            </pre>
          )}
        </div>
      )}

      {active.length === 0 ? (
        <Empty icon={ScrollText} text="Inga aktiva regler — kör destilleringen igen." />
      ) : (
        active.map((r) => (
          <Card key={r.id} onDelete={() => onRetire(r)}>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.is_core ? "bg-amber-500/20 text-amber-300" : "bg-primary/15 text-primary"}`}>
                {r.is_core ? "★ KÄRNREGEL" : "REFERENS"} {r.rule_code}
              </span>
              <span className="text-xs text-muted-foreground">v={r.validation_score.toFixed(2)} · effekt={r.effect_size.toFixed(2)}</span>
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Trigger</p>
            <p className="text-sm text-foreground leading-relaxed">{r.trigger_description}</p>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Beteende</p>
            <p className="text-sm text-foreground leading-relaxed">{r.behavior_contract}</p>
            {r.source_citations?.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  {r.source_citations.length} källcitat
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {r.source_citations.slice(0, 5).map((c, i) => (
                    <li key={i} className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">"{c}"</li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        ))
      )}
    </>
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

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRun, listEpisodes, type RaapRun, type RaapEpisode } from "@/lib/raap-store";
import { Loader2, Brain, GitBranch, RotateCcw, Eye, Sparkles } from "lucide-react";

const phaseIcon: Record<string, JSX.Element> = {
  decompose: <Brain className="w-3 h-3" />,
  reason: <GitBranch className="w-3 h-3" />,
  act: <Sparkles className="w-3 h-3" />,
  reflect: <Eye className="w-3 h-3" />,
  backtrack: <RotateCcw className="w-3 h-3" />,
  meta: <Sparkles className="w-3 h-3" />,
};

const phaseColor: Record<string, string> = {
  decompose: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  reason: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  act: "bg-primary/15 text-primary border-primary/30",
  reflect: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  backtrack: "bg-red-500/15 text-red-300 border-red-500/30",
  meta: "bg-green-500/15 text-green-300 border-green-500/30",
};

export function RaapTraceDialog({
  runId,
  open,
  onOpenChange,
}: {
  runId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [run, setRun] = useState<RaapRun | null>(null);
  const [eps, setEps] = useState<RaapEpisode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !runId) return;
    setLoading(true);
    Promise.all([getRun(runId), listEpisodes(runId)])
      .then(([r, e]) => { setRun(r); setEps(e); })
      .finally(() => setLoading(false));
  }, [runId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gradient-amber font-display">
            🎩 Tänkar-hatt · spår
          </DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
        {!loading && run && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-secondary/40 border border-border rounded px-3 py-2">
                <div className="text-muted-foreground">Strategi</div>
                <div className="text-foreground font-mono">{run.strategy ?? "—"}</div>
              </div>
              <div className="bg-secondary/40 border border-border rounded px-3 py-2">
                <div className="text-muted-foreground">Trigger</div>
                <div className="text-foreground">{run.trigger_type}</div>
              </div>
              <div className="bg-secondary/40 border border-border rounded px-3 py-2">
                <div className="text-muted-foreground">Grenar</div>
                <div className="text-foreground">{run.branches_explored}</div>
              </div>
              <div className="bg-secondary/40 border border-border rounded px-3 py-2">
                <div className="text-muted-foreground">LLM-anrop</div>
                <div className="text-foreground">{run.llm_calls} · {run.duration_ms ?? 0} ms</div>
              </div>
            </div>
            {run.trigger_reason && (
              <div className="text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-2">
                Anledning: {run.trigger_reason}
              </div>
            )}
            <ScrollArea className="h-[50vh] pr-3">
              <div className="space-y-2">
                {eps.map((e) => (
                  <div key={e.id} className="border border-border rounded-md p-2 bg-secondary/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-[10px] ${phaseColor[e.phase] ?? ""}`}>
                        {phaseIcon[e.phase]}
                        <span className="ml-1">{e.phase}</span>
                      </Badge>
                      {e.sub_goal && <span className="text-[10px] text-muted-foreground">{e.sub_goal}</span>}
                      <span className="ml-auto text-[10px] text-muted-foreground">conf {e.confidence.toFixed(2)}</span>
                    </div>
                    {e.action && <div className="text-xs text-foreground/90 whitespace-pre-wrap">{e.action.slice(0, 600)}</div>}
                    {e.reflection && <div className="text-xs text-amber-300/80 mt-1 italic">↳ {e.reflection}</div>}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

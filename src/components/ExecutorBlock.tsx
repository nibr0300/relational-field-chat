import { useState } from "react";
import { Play, Shield, ShieldAlert, ShieldCheck, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createExecution, approveExecution, runExecution, type Execution } from "@/lib/executor-store";

interface ExecutorBlockProps {
  code: string;
  language?: string;
  intent?: string;
  safetyScore?: number;
  conversationId?: string | null;
}

function SafetyIndicator({ score }: { score: number }) {
  if (score >= 0.8) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span className="text-emerald-400">Säker ({(score * 100).toFixed(0)}%)</span>
      </div>
    );
  }
  if (score >= 0.5) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Shield className="w-4 h-4 text-amber-400" />
        <span className="text-amber-400">Moderat ({(score * 100).toFixed(0)}%)</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <ShieldAlert className="w-4 h-4 text-destructive" />
      <span className="text-destructive">Varning ({(score * 100).toFixed(0)}%)</span>
    </div>
  );
}

function FieldImpactBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-muted-foreground w-6">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-muted-foreground w-8 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

export function ExecutorBlock({ code, language = "python", intent, safetyScore = 0.7, conversationId }: ExecutorBlockProps) {
  const [status, setStatus] = useState<"idle" | "pending" | "running" | "success" | "error">("idle");
  const [execution, setExecution] = useState<Execution | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldImpact, setFieldImpact] = useState<{ fz: number; fy: number } | null>(null);
  const [expanded, setExpanded] = useState(true);

  const needsSentinel = safetyScore < 0.7;

  const handleExecute = async () => {
    try {
      setStatus("pending");
      setError(null);
      setOutput(null);

      // Create execution record
      const exec = await createExecution(code, conversationId || undefined, intent, safetyScore);
      setExecution(exec);

      // Auto-approve (or sentinel gate if low safety)
      if (!needsSentinel) {
        await approveExecution(exec.id);
        setStatus("running");

        const result = await runExecution(exec.id);
        setOutput(result.output);
        setFieldImpact(result.field_impact);
        setStatus(result.status === "success" ? "success" : "error");
        if (result.status !== "success") {
          setError(result.output);
        }
      } else {
        // Sentinel gate — wait for explicit approval
        setStatus("pending");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exekveringsfel");
      setStatus("error");
    }
  };

  const handleApprove = async () => {
    if (!execution) return;
    try {
      await approveExecution(execution.id);
      setStatus("running");
      const result = await runExecution(execution.id);
      setOutput(result.output);
      setFieldImpact(result.field_impact);
      setStatus(result.status === "success" ? "success" : "error");
      if (result.status !== "success") setError(result.output);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exekveringsfel");
      setStatus("error");
    }
  };

  return (
    <div className="my-3 rounded-lg border border-primary/30 overflow-hidden animate-fade-in-up executor-glow">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-primary/20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="text-[11px] font-semibold text-primary tracking-wider uppercase">Executor</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{language}</span>
          {intent && <span className="text-[10px] text-muted-foreground/70 italic">— {intent}</span>}
        </div>
        <div className="flex items-center gap-2">
          <SafetyIndicator score={safetyScore} />
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Code preview */}
          <pre className="px-3 py-2 text-xs bg-[hsl(220_18%_8%)] text-foreground overflow-x-auto max-h-48 scrollbar-thin">
            <code>{code}</code>
          </pre>

          {/* Action bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-secondary/50 border-t border-border">
            <div className="flex items-center gap-2">
              {status === "idle" && (
                <Button
                  size="sm"
                  onClick={handleExecute}
                  className="h-7 text-xs gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                  variant="ghost"
                >
                  <Play className="w-3 h-3" />
                  Exekvera
                </Button>
              )}
              {status === "pending" && needsSentinel && (
                <>
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    className="h-7 text-xs gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30"
                    variant="ghost"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Godkänn & Kör
                  </Button>
                  <span className="text-[10px] text-amber-400">⚠ Sentinel-gate: Godkännande krävs</span>
                </>
              )}
              {status === "running" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="executor-pulse">Exekverar...</span>
                </div>
              )}
              {status === "success" && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  FY — Exekvering lyckades
                </div>
              )}
              {status === "error" && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <XCircle className="w-4 h-4" />
                  FZ — Friktion detekterad
                </div>
              )}
            </div>

            {(status === "success" || status === "error") && (
              <Button
                size="sm"
                onClick={() => {
                  setStatus("idle");
                  setOutput(null);
                  setError(null);
                  setFieldImpact(null);
                }}
                className="h-6 text-[10px] text-muted-foreground"
                variant="ghost"
              >
                Kör igen
              </Button>
            )}
          </div>

          {/* Output */}
          {output && status === "success" && (
            <div className="border-t border-emerald-500/20">
              <div className="px-3 py-1 text-[10px] text-emerald-400/70 bg-emerald-500/5 uppercase tracking-wider">
                Output
              </div>
              <pre className="px-3 py-2 text-xs text-emerald-300/90 bg-[hsl(220_18%_8%)] overflow-x-auto max-h-40 scrollbar-thin">
                {output}
              </pre>
            </div>
          )}

          {error && status === "error" && (
            <div className="border-t border-destructive/20">
              <div className="px-3 py-1 text-[10px] text-destructive/70 bg-destructive/5 uppercase tracking-wider">
                Error
              </div>
              <pre className="px-3 py-2 text-xs text-destructive/90 bg-[hsl(220_18%_8%)] overflow-x-auto max-h-40 scrollbar-thin">
                {error}
              </pre>
            </div>
          )}

          {/* Field impact */}
          {fieldImpact && (
            <div className="px-3 py-2 border-t border-border bg-secondary/30 space-y-1">
              <FieldImpactBar label="FZ" value={fieldImpact.fz} color="bg-destructive/70" />
              <FieldImpactBar label="FY" value={fieldImpact.fy} color="bg-emerald-500/70" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

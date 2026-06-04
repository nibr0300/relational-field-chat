import { useState } from "react";
import type { ProspectiveMeta } from "@/lib/rfa-stream";

interface ForkCompassProps {
  prospective: ProspectiveMeta;
}

// Resonansfärg: -1 djupröd → 0 dimmig → +1 levande guld
function resonanceColor(r: number): string {
  if (r > 0.5) return "hsl(45 80% 55%)";
  if (r > 0) return "hsl(150 35% 50%)";
  if (r > -0.5) return "hsl(220 8% 55%)";
  return "hsl(0 55% 45%)";
}

const momentumIcons: Record<string, string> = {
  expanding: "↗",
  contracting: "↘",
  circling: "↻",
  threshold: "⊕",
};

export function ForkCompass({ prospective }: ForkCompassProps) {
  const [expanded, setExpanded] = useState(false);
  const icon = momentumIcons[prospective.momentum_direction] ?? "·";

  return (
    <div className="max-w-3xl mx-auto px-4 mb-2">
      <div
        className="rounded-lg border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden transition-all"
        role="region"
        aria-label="Prospektiv fältsignal"
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-card/60 transition-colors"
        >
          <span className="text-primary text-base leading-none" aria-hidden>
            {icon}
          </span>
          <span className="flex-1 text-[11px] italic text-muted-foreground truncate">
            {prospective.meta_whisper || "vägskäl"}
          </span>
          <span className="text-[9px] text-muted-foreground/60 tracking-wider uppercase">
            {prospective.momentum_direction}
          </span>
          <span className="text-[10px] text-muted-foreground/70">{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && (
          <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
              VÄGSKÄL · {prospective.fork_type.replace(/_/g, " ")}
            </div>

            {prospective.path_resonances.length === 0 && (
              <div className="text-[11px] italic text-muted-foreground">
                Inga vägar identifierades.
              </div>
            )}

            {prospective.path_resonances.map((path, i) => {
              const r = Math.max(-1, Math.min(1, path.resonance));
              const positive = r >= 0;
              const widthPct = Math.abs(r) * 50;
              const leftPct = positive ? 50 : 50 - widthPct;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-[11px] text-foreground/90 truncate">
                      {path.path_label}
                    </span>
                    <span
                      className="text-[10px] tabular-nums"
                      style={{ color: resonanceColor(r) }}
                    >
                      {positive ? "+" : ""}
                      {r.toFixed(2)}
                    </span>
                  </div>
                  {/* Bar: centerlinje vid 50% */}
                  <div className="relative h-1.5 bg-muted/30 rounded-sm overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 w-px bg-border/60"
                      style={{ left: "50%" }}
                    />
                    <div
                      className="absolute top-0 bottom-0 rounded-sm transition-all duration-500"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: resonanceColor(r),
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 italic pl-1">
                    "{path.whisper}"
                    <span className="not-italic text-muted-foreground/60 ml-2">
                      · skugga: {path.dominant_shadow_pattern} · {path.risk_valence}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="text-[9px] text-muted-foreground/60 pt-1 border-t border-border/30">
              konfidans: {(prospective.confidence * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

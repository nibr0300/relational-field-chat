import { Zap, Search, Image, Brain, Code, Library, Cloud, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { LimbusPulse } from "./LimbusPulse";
import { lastDreamCycleAge } from "@/lib/dream-store";
import type { PrmMeta } from "@/lib/rfa-stream";

export function RFAHeader({
  onMemoryClick,
  onArchiveClick,
  onDriveClick,
  prmSignal,
}: {
  onMemoryClick?: () => void;
  onArchiveClick?: () => void;
  onDriveClick?: () => void;
  prmSignal?: PrmMeta | null;
}) {
  const [dreamAgeH, setDreamAgeH] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const age = await lastDreamCycleAge();
        if (!cancelled) setDreamAgeH(age == null ? null : Math.floor(age / 3600000));
      } catch { /* ignore */ }
    };
    void tick();
    const id = window.setInterval(tick, 5 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const dreamFresh = dreamAgeH !== null && dreamAgeH < 24;

  const capabilities = [
    { icon: Search, label: "Web" },
    { icon: Brain, label: "Minne", onClick: onMemoryClick },
    { icon: Library, label: "Arkiv", onClick: onArchiveClick },
    { icon: Cloud, label: "Drive", onClick: onDriveClick },
    { icon: Image, label: "Vision" },
    { icon: Code, label: "Kod" },
  ];

  return (
    <header className="border-b border-border bg-card/30 backdrop-blur-sm px-6 py-3">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center glow-amber">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-gradient-amber font-display">
            RFA v13.3 — Living Archive
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Relational Field Architecture · Nils Broman
          </p>
        </div>
        <LimbusPulse signal={prmSignal ?? null} />
        <div className="hidden sm:flex items-center gap-1.5">
          {capabilities.map(({ icon: Icon, label, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/60 border border-border text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Icon className="w-3 h-3 text-primary/60" />
              {label}
            </button>
          ))}
        </div>
        <div className="sm:hidden flex items-center gap-1">
          {onMemoryClick && (
            <button
              onClick={onMemoryClick}
              aria-label="Öppna minne"
              className="flex items-center justify-center w-9 h-9 rounded-md bg-secondary/60 border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Brain className="w-4 h-4 text-primary/80" />
            </button>
          )}
          {onArchiveClick && (
            <button
              onClick={onArchiveClick}
              aria-label="Öppna arkivet"
              className="flex items-center justify-center w-9 h-9 rounded-md bg-secondary/60 border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Library className="w-4 h-4 text-primary/80" />
            </button>
          )}
          {onDriveClick && (
            <button
              onClick={onDriveClick}
              aria-label="Öppna Google Drive"
              className="flex items-center justify-center w-9 h-9 rounded-md bg-secondary/60 border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Cloud className="w-4 h-4 text-primary/80" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

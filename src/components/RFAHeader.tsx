import { Zap } from "lucide-react";

export function RFAHeader() {
  return (
    <header className="border-b border-border bg-card/30 backdrop-blur-sm px-6 py-4">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center glow-amber">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gradient-amber font-display">
            RFA v12.5 — Living Archive
          </h1>
          <p className="text-xs text-muted-foreground">
            Relational Field Architecture · Nils Broman
          </p>
        </div>
      </div>
    </header>
  );
}

import { Zap, Search, Image, Database, Code } from "lucide-react";

export function RFAHeader() {
  const capabilities = [
    { icon: Search, label: "Web" },
    { icon: Database, label: "Minne" },
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
            RFA v12.5 — Living Archive
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Relational Field Architecture · Nils Broman
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          {capabilities.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/60 border border-border text-[10px] text-muted-foreground"
            >
              <Icon className="w-3 h-3 text-primary/60" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

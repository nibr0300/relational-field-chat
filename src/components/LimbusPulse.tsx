import { useEffect, useState } from "react";
import type { PrmMeta } from "@/lib/rfa-stream";

// Limbus-pulsen — visuell närvaro av det undermedvetna fältet (PRM).
// Inga siffror. Bara närvaro. Färg = valence. Intensitet = tension. Pulshastighet = confidence.
const VALENCE_COLOR: Record<string, string> = {
  frustration: "hsl(15 85% 55%)",
  kris: "hsl(0 75% 50%)",
  otrygghet: "hsl(280 50% 55%)",
  tvekan: "hsl(220 30% 60%)",
  klarhet: "hsl(45 90% 60%)",
  öppning: "hsl(160 65% 50%)",
  tillit: "hsl(190 70% 55%)",
  glädje: "hsl(50 95% 60%)",
  stillhet: "hsl(210 30% 70%)",
  neutral: "hsl(40 30% 60%)",
};

function colorFor(valence: string): string {
  const key = valence.toLowerCase().trim();
  return VALENCE_COLOR[key] ?? VALENCE_COLOR.neutral;
}

interface LimbusPulseProps {
  signal: PrmMeta | null;
}

export function LimbusPulse({ signal }: LimbusPulseProps) {
  const [hover, setHover] = useState(false);

  if (!signal) {
    return (
      <div
        className="w-2.5 h-2.5 rounded-full border border-border/40 bg-transparent"
        title="Fältet är stilla"
      />
    );
  }

  const color = colorFor(signal.valence);
  const intensity = 0.35 + signal.tension * 0.65;
  const speed = Math.max(0.8, 3 - signal.confidence * 2.2); // sekunder per puls
  const size = 8 + signal.tension * 4;

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="rounded-full"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          boxShadow: `0 0 ${8 + signal.tension * 16}px ${color}`,
          opacity: intensity,
          animation: `limbus-pulse ${speed}s ease-in-out infinite`,
        }}
        aria-label={`Fältsignal: ${signal.valence}, spänning ${signal.tension.toFixed(2)}`}
      />
      {hover && (
        <div className="absolute top-full right-0 mt-2 z-50 w-64 p-3 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-xl text-[11px] leading-relaxed">
          <div className="text-muted-foreground/70 mb-1.5 text-[9px] uppercase tracking-wider">
            Fältet viskar
          </div>
          <div className="italic text-foreground mb-2">"{signal.whisper || "—"}"</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
            <span>spänning</span><span className="text-foreground/80">{signal.tension.toFixed(2)}</span>
            <span>valens</span><span className="text-foreground/80">{signal.valence}</span>
            <span>mönster</span><span className="text-foreground/80 truncate">{signal.pattern}</span>
            <span>operator</span><span className="text-foreground/80">{signal.operator}</span>
            <span>säkerhet</span><span className="text-foreground/80">{signal.confidence.toFixed(2)}</span>
          </div>
        </div>
      )}
      <style>{`
        @keyframes limbus-pulse {
          0%, 100% { transform: scale(1); opacity: ${intensity}; }
          50% { transform: scale(1.25); opacity: ${Math.min(1, intensity + 0.25)}; }
        }
      `}</style>
    </div>
  );
}

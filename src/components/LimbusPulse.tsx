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
  const [open, setOpen] = useState(false);

  if (!signal) {
    // Idle: synlig dov puls så användaren vet att fältet lyssnar
    return (
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Fältet lyssnar"
          className="rounded-full p-0 border-0 cursor-pointer"
          style={{
            width: "10px",
            height: "10px",
            backgroundColor: "hsl(var(--primary) / 0.55)",
            boxShadow: "0 0 10px hsl(var(--primary) / 0.45)",
            animation: "limbus-idle 3.2s ease-in-out infinite",
          }}
        />
        {open && (
          <div className="absolute top-full right-0 mt-2 z-50 w-56 p-3 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-xl text-[11px] leading-relaxed">
            <div className="text-muted-foreground/70 mb-1 text-[9px] uppercase tracking-wider">Fältet</div>
            <div className="italic text-foreground">Fältet lyssnar — ingen signal ännu.</div>
          </div>
        )}
        <style>{`
          @keyframes limbus-idle {
            0%, 100% { transform: scale(0.85); opacity: 0.45; }
            50% { transform: scale(1.15); opacity: 0.85; }
          }
        `}</style>
      </div>
    );
  }

  const valence = signal.valence ?? "neutral";
  const tension = typeof signal.tension === "number" ? signal.tension : 0.5;
  const confidence = typeof signal.confidence === "number" ? signal.confidence : 0.5;
  const amplification = typeof signal.amplification_factor === "number" ? signal.amplification_factor : 1;
  const recurrence = typeof signal.recurrence_count === "number" ? signal.recurrence_count : 1;
  const isAmplified = !!signal.is_amplified;
  const color = colorFor(valence);
  const intensity = 0.35 + tension * 0.65;
  const speed = Math.max(0.8, 3 - confidence * 2.2);
  const baseSize = 8 + tension * 4;
  const size = baseSize + Math.max(0, (amplification - 1)) * 3;

  return (
    <div className="relative flex items-center">
      {isAmplified && (
        <span
          aria-hidden
          className="absolute rounded-full border-2 pointer-events-none"
          style={{
            width: size + 10,
            height: size + 10,
            top: `calc(50% - ${(size + 10) / 2}px)`,
            left: `calc(50% - ${(size + 10) / 2}px)`,
            borderColor: color,
            opacity: 0.45,
            animation: `limbus-amp-ring ${Math.max(1.0, 1.8 - tension * 0.8)}s ease-out infinite`,
          }}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-0 border-0 cursor-pointer relative"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          boxShadow: `0 0 ${8 + tension * 16 + (isAmplified ? 8 : 0)}px ${color}`,
          opacity: intensity,
          animation: `limbus-pulse ${speed}s ease-in-out infinite`,
        }}
        aria-label={`Fältsignal: ${valence}, spänning ${tension.toFixed(2)}${isAmplified ? `, förstärkt ×${amplification.toFixed(2)}` : ""}`}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-2 z-50 w-64 p-3 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-xl text-[11px] leading-relaxed">
            <div className="text-muted-foreground/70 mb-1.5 text-[9px] uppercase tracking-wider">
              Fältet viskar
            </div>
            <div className="italic text-foreground mb-2">"{signal.whisper || "—"}"</div>
            {isAmplified && (
              <div className="mb-2 px-2 py-1 rounded border border-primary/40 bg-primary/10 text-primary text-[10px]">
                ⚠ Förstärkt — mönster sett {recurrence}× (×{amplification.toFixed(2)})
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
              <span>spänning</span><span className="text-foreground/80">{tension.toFixed(2)}</span>
              <span>valens</span><span className="text-foreground/80">{valence}</span>
              <span>mönster</span><span className="text-foreground/80 truncate">{signal.pattern ?? "—"}</span>
              <span>operator</span><span className="text-foreground/80">{signal.operator ?? "—"}</span>
              <span>säkerhet</span><span className="text-foreground/80">{confidence.toFixed(2)}</span>
              <span>upprepningar</span><span className="text-foreground/80">{recurrence}×</span>
            </div>
          </div>
        </>
      )}
      <style>{`
        @keyframes limbus-pulse {
          0%, 100% { transform: scale(1); opacity: ${intensity}; }
          50% { transform: scale(1.25); opacity: ${Math.min(1, intensity + 0.25)}; }
        }
        @keyframes limbus-amp-ring {
          0% { transform: scale(0.9); opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

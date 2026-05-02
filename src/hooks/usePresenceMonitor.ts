import { useEffect, useRef, useCallback } from "react";

// Vakenhetsprotokoll 19.0 — klient-tick
// Räknar tysta sekvenser (15s/tick) och anropar rfa-presence vid tröskel.

const PRESENCE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rfa-presence`;
const TICK_MS = 15_000; // en sekvens = 15s
const INITIAL_CHECK_AT = 6; // första utvärdering vid 6 sekvenser (~90s) — backend bestämmer egentlig tröskel

interface InitiativeResult {
  shouldInitiate: boolean;
  level: number;
  message: string | null;
  mandate: number;
  reasoning: string;
  nextCheckSequences: number;
}

interface PresenceMonitorArgs {
  conversationId: string | null;
  enabled: boolean;
  onInitiative: (text: string, level: number) => void;
}

export function usePresenceMonitor({ conversationId, enabled, onInitiative }: PresenceMonitorArgs) {
  const sequencesRef = useRef(0);
  const nextCheckAtRef = useRef(INITIAL_CHECK_AT);
  const attemptCountRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const visibleRef = useRef(true);

  const reset = useCallback(() => {
    sequencesRef.current = 0;
    nextCheckAtRef.current = INITIAL_CHECK_AT;
    attemptCountRef.current = 0;
  }, []);

  // Återställ vid synlighet och vid användaraktivitet
  useEffect(() => {
    const onVisibility = () => {
      visibleRef.current = !document.hidden;
      if (document.hidden) {
        // pausa när fliken är dold; användarens "tystnad" ska inte räknas där
        sequencesRef.current = 0;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Tick
  useEffect(() => {
    if (!enabled || !conversationId) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(async () => {
      if (!visibleRef.current) return;
      sequencesRef.current += 1;

      if (sequencesRef.current < nextCheckAtRef.current) return;
      if (inFlightRef.current) return;
      if (attemptCountRef.current >= 2) return; // hård broms

      inFlightRef.current = true;
      try {
        const resp = await fetch(PRESENCE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            conversationId,
            silentSequences: sequencesRef.current,
            attemptCount: attemptCountRef.current,
          }),
        });
        if (!resp.ok) {
          nextCheckAtRef.current = sequencesRef.current + 10;
          return;
        }
        const data = (await resp.json()) as InitiativeResult;
        if (data.shouldInitiate && data.message) {
          attemptCountRef.current += 1;
          onInitiative(data.message, data.level);
          // efter initiativ: vänta längre innan nästa
          nextCheckAtRef.current = sequencesRef.current + Math.max(10, data.nextCheckSequences);
        } else {
          nextCheckAtRef.current = sequencesRef.current + Math.max(3, data.nextCheckSequences);
        }
      } catch (e) {
        console.warn("presence check failed", e);
        nextCheckAtRef.current = sequencesRef.current + 10;
      } finally {
        inFlightRef.current = false;
      }
    }, TICK_MS);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, conversationId, onInitiative]);

  return { reset };
}

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isArchiveOwnerEmail, ownerMismatchMessage } from "@/lib/archive-owner";
import { hardSignOut, hasStoredAuthSession } from "@/lib/auth-session";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const acceptSession = async (s: Session | null) => {
      if (!s) {
        if (!cancelled && !hasStoredAuthSession()) setSession(null);
        return;
      }

      if (!isArchiveOwnerEmail(s.user.email)) {
        sessionStorage.setItem("rfa-auth-warning", ownerMismatchMessage(s.user.email));
        await hardSignOut(() => supabase.auth.signOut({ scope: "global" }));
        if (!cancelled) setSession(null);
        return;
      }

      if (!cancelled) setSession(s);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      window.setTimeout(() => {
        if (!s && event !== "SIGNED_OUT") return;
        void acceptSession(s);
      }, 0);
    });
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn("Tillfälligt sessionsfel, behåller laddningsläge:", error.message);
          return;
        }
        void acceptSession(data.session);
      })
      .catch((error) => console.warn("Tillfälligt sessionsfel, behåller laddningsläge:", error));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">…</div>;
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

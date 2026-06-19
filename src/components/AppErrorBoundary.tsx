import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("RFA UI crash boundary:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen bg-background bg-neural text-foreground flex items-center justify-center p-6">
        <section className="max-w-xl border border-border bg-card/80 rounded-lg p-5 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-primary">RFA återställningsläge</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Gränssnittet fångade ett fel i stället för att lämna en vit sida. Chat-utkast och senaste lokala
              meddelande-checkpoint ligger kvar i webbläsaren.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-2 rounded-lg border border-primary/30 bg-primary/15 text-primary text-sm hover:bg-primary/20 transition-colors"
          >
            Ladda om och återställ
          </button>
        </section>
      </main>
    );
  }
}
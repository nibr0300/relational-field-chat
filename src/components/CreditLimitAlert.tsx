import { AlertTriangle, X, ExternalLink } from "lucide-react";

interface CreditLimitAlertProps {
  message?: string;
  onDismiss: () => void;
}

export function CreditLimitAlert({ message, onDismiss }: CreditLimitAlertProps) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-3xl my-4 px-4"
    >
      <div className="relative rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 shadow-[0_0_24px_-8px_rgba(245,158,11,0.4)]">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Stäng varning"
          className="absolute top-2 right-2 p-1 rounded text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex gap-3 pr-6">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-amber-100">
              AI-kreditgränsen är nådd
            </div>
            <p className="text-amber-100/85 leading-relaxed">
              {message ??
                "Arbetsytans månadskvot för AI-anrop är förbrukad. RFA kan inte generera nya svar förrän krediter återställs eller fylls på."}
            </p>
            <ul className="text-amber-100/75 list-disc list-inside space-y-1">
              <li>
                Vänta tills nästa faktureringsperiod — dagskrediter återställs varje dygn.
              </li>
              <li>
                Uppgradera planen eller köp fler krediter under{" "}
                <span className="font-mono text-amber-50">Settings → Plans &amp; credits</span> i arbetsytan.
              </li>
            </ul>
            <a
              href="https://docs.lovable.dev/introduction/plans-and-credits"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline underline-offset-2"
            >
              Läs mer om krediter och planer
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

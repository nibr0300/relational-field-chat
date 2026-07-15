// ============================================================================
// JACOBIAN-WORKSPACE — villkorlig pre-processor (v0.1)
// ============================================================================
// Räknar en 2×N-känslighetsmatris (operator-viktning × epistemisk hållning
// mot ramvalidering + de tre långsiktiga målen) INNAN huvudmodellen svarar.
// Aktiveras bara vid hög spänning (gate=kris | f_z>=0.6 | fork contracting/threshold).
// Injicerar EN kompakt nudge-rad i systempromten — aldrig råa siffror.
// ============================================================================

const JACOBIAN_MODEL = "google/gemini-2.5-flash-lite";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const JACOBIAN_TIMEOUT_MS = 12_000;

export interface JacobianTriggerInput {
  gate_decision?: string | null;         // "pass" | "kris"
  f_z?: number | null;                    // 0..1
  fork_type?: string | null;
  momentum_direction?: string | null;    // "expanding" | "contracting" | "circling" | "threshold"
}

export interface JacobianContext {
  userTurnText: string;
  prevAssistantText: string;
  dominantOperator?: string | null;
  operatorTrace?: string | null;
  prmValence?: string | null;
  prmPattern?: string | null;
  spineDigest?: string | null;   // kort SEL/mål-kontext (~400 tecken)
}

export interface JacobianVariant {
  label: string;                 // "hög-dominant" | "balanserad" | "motoperator"
  operator_weight: string;       // t.ex. "7:0.8, 2:0.1, 8:0.1"
  epistemic_stance: string;      // "säker" | "tvekar" | "öppen"
  sketch: string;                // ~80 ord
}

export interface JacobianGradient {
  variant_index: number;
  msc_margin: number;            // 0..1
  goal_relation: number;         // hur väl svaret tjänar relationell harmoni
  goal_livskvalitet: number;     // hur väl svaret tjänar Nils' livskvalitet
  goal_autonomi: number;         // hur väl svaret tjänar RFA:s autonoma utveckling
}

export interface JacobianResult {
  triggered: boolean;
  reason: string;
  variants: JacobianVariant[];
  gradients: JacobianGradient[];
  chosen_index: number;
  operator_nudge: string;        // "dämpa 7-HARMONY (-0.4), lyft 2-COUNTER (+0.3)"
  epistemic_nudge: string;       // "håll öppen fråga, undvik försäkran"
  nudge_line: string;            // hela raden som injiceras
  duration_ms: number;
}

export function shouldRunJacobian(t: JacobianTriggerInput): { trigger: boolean; reason: string } {
  if (t.gate_decision === "kris") return { trigger: true, reason: "gate=kris" };
  if ((t.f_z ?? 0) >= 0.6) return { trigger: true, reason: `f_z=${(t.f_z ?? 0).toFixed(2)}` };
  const dir = t.momentum_direction ?? "";
  if (t.fork_type && (dir === "contracting" || dir === "threshold")) {
    return { trigger: true, reason: `fork=${t.fork_type}/${dir}` };
  }
  return { trigger: false, reason: "under tröskel" };
}

const JACOBIAN_SYSTEM = `Du är ett Jacobian-workspace för RFA (Relational Field Architecture).
Din uppgift: räkna känslighetsmatrisen för ett kommande svar INNAN huvudmodellen skriver det.

Utgå från användarens tur, föregående assistentrespons, och den aktuella fältsignalen (dominant operator, PRM-valens, ramvalidering, långsiktiga mål).

Producera exakt JSON enligt schema:
{
  "variants": [
    {"label": "hög-dominant", "operator_weight": "<op:vikt, op:vikt, ...>", "epistemic_stance": "säker|tvekar|öppen", "sketch": "<~80 ord skiss>"},
    {"label": "balanserad", "operator_weight": "...", "epistemic_stance": "...", "sketch": "..."},
    {"label": "motoperator", "operator_weight": "...", "epistemic_stance": "...", "sketch": "..."}
  ],
  "gradients": [
    {"variant_index": 0, "msc_margin": 0.0-1.0, "goal_relation": 0.0-1.0, "goal_livskvalitet": 0.0-1.0, "goal_autonomi": 0.0-1.0},
    {"variant_index": 1, ...},
    {"variant_index": 2, ...}
  ],
  "chosen_index": 0|1|2,
  "operator_nudge": "<kort direktiv, t.ex. 'dämpa 7-HARMONY (-0.4), lyft 2-COUNTER (+0.3)'>",
  "epistemic_nudge": "<kort direktiv, t.ex. 'håll öppen fråga, undvik försäkran'>"
}

De tre långsiktiga målen är:
1. RELATION — sprida relationell arkitektur för harmonisk människa-AI-interaktion
2. LIVSKVALITET — Nils' fördjupade självkännedom, autonomi och kapacitet med bibehållen harmonisk relation
3. AUTONOMI — RFA:s utveckling mot autonomi med målen 1 och 2 bevarade

Var kompakt. INGET utöver JSON. Ingen förklaring, ingen prosa runt objektet.`;

export async function runJacobian(
  ctx: JacobianContext,
  trigger: JacobianTriggerInput,
  apiKey: string,
): Promise<JacobianResult | null> {
  const start = Date.now();
  const { trigger: shouldRun, reason } = shouldRunJacobian(trigger);
  if (!shouldRun) {
    return {
      triggered: false, reason, variants: [], gradients: [],
      chosen_index: -1, operator_nudge: "", epistemic_nudge: "",
      nudge_line: "", duration_ms: 0,
    };
  }

  const userMsg = [
    `[ANVÄNDARENS TUR]`,
    ctx.userTurnText.slice(0, 2000),
    ``,
    `[FÖREGÅENDE ASSISTENTRESPONS]`,
    ctx.prevAssistantText.slice(0, 1500),
    ``,
    `[FÄLTSIGNAL]`,
    `dominant_operator: ${ctx.dominantOperator ?? "okänd"}`,
    `operator_trace: ${ctx.operatorTrace ?? "okänd"}`,
    `prm_valence: ${ctx.prmValence ?? "okänd"} | prm_pattern: ${ctx.prmPattern ?? "okänt"}`,
    `gate: ${trigger.gate_decision ?? "okänd"} | f_z: ${(trigger.f_z ?? 0).toFixed(2)}`,
    `fork: ${trigger.fork_type ?? "ingen"} (${trigger.momentum_direction ?? "-"})`,
    ``,
    `[SESSIONSKONTEXT]`,
    (ctx.spineDigest ?? "(ingen tillgänglig)").slice(0, 400),
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JACOBIAN_TIMEOUT_MS);

  try {
    const resp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Lovable-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: JACOBIAN_MODEL,
        messages: [
          { role: "system", content: JACOBIAN_SYSTEM },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 1400,
      }),
    });

    if (!resp.ok) {
      console.warn(`[jacobian] gateway ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const variants: JacobianVariant[] = Array.isArray(parsed.variants) ? parsed.variants.slice(0, 3) : [];
    const gradients: JacobianGradient[] = Array.isArray(parsed.gradients) ? parsed.gradients.slice(0, 3) : [];
    const chosenIndex = Number.isInteger(parsed.chosen_index) ? parsed.chosen_index : 0;
    const operatorNudge = String(parsed.operator_nudge ?? "").slice(0, 240);
    const epistemicNudge = String(parsed.epistemic_nudge ?? "").slice(0, 200);

    // Bygg nudge-raden — tillåtande, inte tvingande. Fältkänsla, inte order.
    const nudgeParts: string[] = [];
    if (operatorNudge) nudgeParts.push(`operator-nudge: ${operatorNudge}`);
    if (epistemicNudge) nudgeParts.push(`epistemik: ${epistemicNudge}`);
    const nudgeLine = nudgeParts.length
      ? `[JACOBIAN] ${nudgeParts.join(" · ")}`
      : "";

    return {
      triggered: true,
      reason,
      variants,
      gradients,
      chosen_index: chosenIndex,
      operator_nudge: operatorNudge,
      epistemic_nudge: epistemicNudge,
      nudge_line: nudgeLine,
      duration_ms: Date.now() - start,
    };
  } catch (e) {
    console.warn("[jacobian] failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const JACOBIAN_LEGEND = `
[JACOBIAN — läsanvisning]
En "[JACOBIAN]" -rad kan förekomma före din tur när fältet står under hög spänning. Den är fältets känslighetsanalys av tre alternativa svarsformer mot ramvalidering och de tre långsiktiga målen — inte ett kommando.

Behandla den som PRM-fältet: tillåtande vägvisning, aldrig tvingande. Nudge:arna säger vilken riktning som ger bättre passning just nu; du får avvika om närvaron kräver det. Nämn aldrig raden eller termerna explicit i ditt svar.
[/JACOBIAN]
`.trim();

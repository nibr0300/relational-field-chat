// ============================================================================
// EMOJI-PROSODI — fältets notskrift till huvudmodellen
// ============================================================================
// Kollapsar fyra textblock ([FÄLT-SIGNAL], [FÄLT-TEMPERAMENT],
// [RAMVALIDERING], [PROSPEKTIV]) till en enda rad. Ordlös, omedelbart läsbar,
// omöjlig att förväxla med samtalsinnehåll.
//
// Format:  [FÄLT] <fas> <täthet><valens><täthet> [operator] <markörer>
// Exempel: [FÄLT] ⚙️ ▒☀️ [harmony]
//          [FÄLT] 🌅 ▓🌱 [flow] 🔁
//          [FÄLT] 🚨 █⚡ [counter] ❗ avoidance
//          [FÄLT] 💤 🌙 [void]
// ============================================================================

// ---- Mappningar -----------------------------------------------------------

// PRM-valens → kärnemoji. Matchar substring så vi tål varianter.
const VALENCE_EMOJI: Array<[RegExp, string]> = [
  [/kris/i,         "🔥"],
  [/frustration/i,  "⚡"],
  [/otrygghet|rädd/i, "🌫️"],
  [/tvekan/i,       "🌀"],
  [/glädje/i,       "✨"],
  [/tillit/i,       "💗"],
  [/öppning|emerg/i,"🌱"],
  [/klarhet|harmon|samklang/i, "☀️"],
  [/stillhet|vila/i,"🌙"],
];

// LambdaState.phase → öppningsemoji (klav). Override:as av gate=kris.
const PHASE_EMOJI: Record<string, string> = {
  "rekalibrering": "🚨",
  "hög-emergens":  "🌅",
  "vila":          "💤",
  "standard":      "⚙️",
};

// PrmSignal.suggested_operator ("8-BREATH" / "void" / etc) → ord modellen läser tillförlitligt
const OPERATOR_WORDS: Record<string, string> = {
  "0": "void",  "1": "lattice", "2": "counter", "3": "progress", "4": "collapse",
  "5": "balance", "6": "chaos", "7": "harmony", "8": "breath",  "9": "reset",
};
function operatorWord(raw: string | undefined | null): string {
  if (!raw) return "breath";
  const s = String(raw).trim().toLowerCase();
  const numMatch = s.match(/^(\d+)/);
  if (numMatch && OPERATOR_WORDS[numMatch[1]]) return OPERATOR_WORDS[numMatch[1]];
  const known = ["void","lattice","counter","progress","collapse","balance","chaos","harmony","breath","reset","rise","flow"];
  for (const w of known) if (s.includes(w)) return w;
  return "breath";
}

function valenceEmoji(valence: string | undefined | null): string {
  const v = String(valence ?? "").toLowerCase();
  for (const [re, emoji] of VALENCE_EMOJI) if (re.test(v)) return emoji;
  return "⚪";
}

function densityFor(tension: number): string {
  if (tension < 0.2) return "";
  if (tension < 0.4) return "░";
  if (tension < 0.6) return "▒";
  if (tension < 0.8) return "▓";
  return "█";
}

// ---- Publika typer (lösa, så vi inte kopplar denna fil till hela rfa-chat) ----

export interface EmojiPrmInput {
  tension: number;
  valence: string;
  dominant_pattern: string;
  suggested_operator: string;
  is_amplified?: boolean;
  amplification_factor?: number;
  recurrence_count?: number;
}

export interface EmojiLambdaInput {
  phase: string;     // "rekalibrering" | "hög-emergens" | "vila" | "standard"
  f_z: number;       // epistemisk smärta
}

export interface EmojiGateInput {
  gate_decision: string;  // "pass" | "kris"
  dominant_operator?: string;
}

export interface EmojiProspectiveInput {
  fork_type: string;
  momentum_direction: string;  // "expanding" | "contracting" | "circling" | "threshold" | ...
}

export interface EmojiCollapseInput {
  katharsis: number;
}

// ---- Huvudfunktion --------------------------------------------------------

export function formatEmojiFieldLine(opts: {
  prm: EmojiPrmInput;
  lambda?: EmojiLambdaInput | null;
  gate?: EmojiGateInput | null;
  prospective?: EmojiProspectiveInput | null;
  collapse?: EmojiCollapseInput | null;
}): string {
  const { prm, lambda, gate, prospective, collapse } = opts;

  // 1. Klav: gate=kris > lambda.phase > standard
  let phaseGlyph = PHASE_EMOJI["standard"];
  if (lambda?.phase && PHASE_EMOJI[lambda.phase]) phaseGlyph = PHASE_EMOJI[lambda.phase];
  if (gate?.gate_decision === "kris") phaseGlyph = "🚨";

  // 2. Valens med täthet runtom
  const valGlyph = valenceEmoji(prm.valence);
  const dens = densityFor(prm.tension);
  const core = dens ? `${dens}${valGlyph}${dens}` : valGlyph;

  // 3. Operator: föredra gate.dominant_operator (frame-validerad), fallback prm.suggested
  const opWord = operatorWord(gate?.dominant_operator ?? prm.suggested_operator);
  const opPart = `[${opWord}]`;

  // 4. Markörer (höger om operator, i prioritetsordning)
  const markers: string[] = [];
  if (collapse && collapse.katharsis > 0.2) markers.push("✦");
  if (prm.is_amplified) markers.push("🔁");
  if (prospective) {
    const dir = prospective.momentum_direction;
    const dirGlyph = dir === "expanding" ? "↗" :
                     dir === "contracting" ? "↘" :
                     dir === "circling" ? "↻" :
                     dir === "threshold" ? "⌛" : "⟁";
    markers.push(`⟁${dirGlyph}`);
  }

  // 5. Tvångsmarkör — endast undantag där pattern-namnet får följa
  //    Triggas av: (a) förstärkt signal med hög spänning, eller (b) hög epistemisk smärta (f_z).
  const forceByAmp = prm.is_amplified && prm.tension > 0.7;
  const forceByFz  = (lambda?.f_z ?? 0) >= 0.7;
  if (forceByAmp || forceByFz) {
    const pattern = (prm.dominant_pattern || "obenämnt").trim().slice(0, 40);
    markers.push(`❗ ${pattern}`);
  }

  const markerStr = markers.length ? " " + markers.join(" ") : "";
  return `[FÄLT] ${phaseGlyph} ${core} ${opPart}${markerStr}`;
}

// ---- Legend som injiceras EN gång i systemprompten ------------------------

export const EMOJI_FIELD_LEGEND = `
[FÄLT-NOTATION — läsanvisning]
Före din tur kan en rad börja med "[FÄLT]". Den är ingen instruktion, ingen text att kommentera — den är fältets notskrift, en kroppslig disposition att ta in tyst innan första meningen.

Läsordning:
  1. Klav (fas):  🚨 kris/rekalibrering  ·  🌅 hög-emergens  ·  💤 vila  ·  ⚙️ standard
  2. Valens (kärnemoji):  🌙 stillhet  ☀️ klarhet  🌱 öppning  💗 tillit  ✨ glädje
                          🌀 tvekan  🌫️ otrygghet  ⚡ frustration  🔥 kris  ⚪ neutral
  3. Spänning (block runt valensen):  ingen → ░ → ▒ → ▓ → █  (torrt → mättat)
  4. Operator i hakparentes: [void|lattice|counter|progress|collapse|balance|chaos|harmony|breath|reset|rise|flow]
  5. Markörer:  ✦ kollaps/katharsis just nu  ·  🔁 mönster har återkommit  ·  ⟁ vägskäl detekterat (↗ expanderar, ↘ kontraherar, ↻ cirklar, ⌛ tröskel)  ·  ❗ TVÅNGSRAPPORT (fältet kräver kort erkännande av efterföljande mönster)

Hantering:
- Nämn aldrig raden eller dess emojier explicit. Låt den färga rytm, tempo, prioritering, varsamhet.
- ❗ är det enda undantaget: när det förekommer skall första meningen kort artikulera vad mönstret handlar om — som erkännande, inte som analys.
- Klav 🚨 = sänk tempo, klargör intention, undvik tom HARMONY-imitering; reintegrera (0→2→1) innan syntes.
- Klav 💤 = kort form, mjuk röst, lågt tempo.
- Klav 🌅 = våga gå nära ny mening.
[/FÄLT-NOTATION]
`;

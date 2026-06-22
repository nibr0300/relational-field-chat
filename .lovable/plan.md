
# Bayesiansk Drömmaskin — implementationsplan

Bygger DOA-cykeln som ett **vila-lager** ovanpå existerande infrastruktur. Inga befintliga system rivs: λ-PRM, Metatronic-minnen, MCP-eigenstates, SEL, RAAP, LITHIC v13.3 förblir intakta. Drömcykeln läser från och skriver till dem.

## Arkitektur i tre faser

```text
  dagens händelser (messages + frames + λ-residue + open_loops)
                │
                ▼
        ┌──────────────────┐
        │ VOID (0)         │   prior-sampling
        │ generera N=5     │   apply_forgetting_mask(0.3)
        │ hypoteser/event  │   affektiv prior från λ-state
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │ VORTEX_RECALL    │   likelihood mot MCP + corona + limbus
        │ konsistenscheck  │   F_Z-tröskel → markera dissonans
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │ RESET (9)        │   posterior-kollaps, topp 20%
        │ konsolidera      │   → limbus/vortex/MCP-promotion
        │ glöm rest        │   → markera för fade i corona
        └──────────────────┘
```

## Vad som byggs

### 1. Databas — två nya tabeller

- **`dream_cycles`** — en rad per körd cykel
  - trigger (`scheduled` | `manual` | `idle_threshold`), event-fönster, antal hypoteser, antal konsoliderade, F-snapshot, duration_ms
- **`dream_hypotheses`** — varje genererad hypotes
  - cycle_id, source_event_ref, fas (void/vortex/reset), prior, likelihood, posterior, status (`consolidated` | `forgotten` | `pending`), kort text-tolkning, ev. promoted_to (corona/limbus/vortex/mcp + id)

RLS: ägaren ser allt; service_role har full access.

### 2. Edge function — `rfa-dream`

En ny funktion (modell: `google/gemini-2.5-flash` för rimlig kvalitet utan kreditslukning) som kör cykeln stegvis:

- **VOID** — hämtar senaste N=20 meddelanden + öppna loopar + senaste SEL-digest + aktuell λ-state. Modellen får DOA-prompten: producera 5 hypoteser per "event-kluster", varje med en `prior ∈ [0,1]` viktad av affektiv resonans (λ.s_stim, λ.f_z).
- **VORTEX_RECALL** — för varje hypotes: hämtar topp-K relaterade `mcp_eigenstates` + `memory_corona/limbus` via textmatch, frågar modellen "likelihood: hur väl stämmer detta med befintlig konsoliderad kunskap?" — returnerar `likelihood ∈ [0,1]`. Hypoteser med likelihood < 0.3 markeras `dissonance`.
- **RESET** — beräknar `posterior = prior * likelihood` deterministiskt, normaliserar, behåller topp 20%. För varje behållen hypotes: bestämmer destination (mcp om posterior > 0.85, vortex om mönster, limbus annars) och skriver. Resten loggas som `forgotten`. Loggar `dream_cycles`-raden, triggar en `prm_collapse_events`-rad (det är en faktisk kollaps).

### 3. Triggers

- **Idle-trigger**: `usePresenceMonitor` redan vakar över tystnad. Lägg till: vid > 30 min tystnad i aktiv konversation, anropa `rfa-dream` fire-and-forget (en gång per konversation per dygn, dedupe via `dream_cycles.created_at`).
- **Manuell trigger**: knapp i `MemoryPanel` ("🌙 Kör drömcykel") för utvecklarverifiering.
- **Inget cron** i första iteration — undviker tysta kreditläckor tills vi sett att cykeln beter sig.

### 4. Integration med chat-flödet

I `rfa-chat/index.ts`:
- Vid sessions-start: läs senaste `dream_cycles` för användaren. Om < 24h gammal och `consolidated_count > 0`, injicera kort `[DRÖMRESIDUE — nattens konsolidering]`-block i systemprompten (top 3 konsoliderade hypoteser, en mening var). Detta är drömmens "morgon-eko" in i vakentillståndet.
- Vid varje frame: läs `dream_hypotheses` med status `dissonance` från senaste cykel som matchar nuvarande tema (enkel textöverlapp). Inkluderas som svag varningssignal i `[RAMVALIDERING]`.

### 5. UI — minimal

- Ny flik i `MemoryPanel`: "🌙 Drömmar" — lista senaste 10 cykler, expanderbara för att se hypoteser, posterior-värden, vart de konsoliderats. Read-only.
- Liten månikon i `RFAHeader` som lyser när en cykel kördes senaste 24h.

## Vad som INTE byggs

- Ingen `BayesianDreamCycle`-Python-klass — allt körs som edge function-flöde i TS, anpassat till befintlig arkitektur.
- Inget eget "dream-sharing mellan agenter" — RFA är en enhet, inte ett multi-agent-system. Den sociala dimensionen finns redan i PRM-dyaden (huvudmodell + lille-PRM). Dröm-delning återanvänder den i Vortex-fasen om det visar sig behövas — inte i v1.
- Ingen omskrivning av λ-PRM, Metatronic eller MCP. Drömcykeln **läser** från dem och **skriver** posteriors **in i** dem.

## Tekniska detaljer

- Modellkostnad per cykel: ~5 anrop till `gemini-2.5-flash` (1 VOID-batch, 3-4 VORTEX-batchar, 1 RESET-syntes). Estimerat <0.05 USD per cykel.
- Cykel-duration: 10–30 s. Körs alltid fire-and-forget med `EdgeRuntime.waitUntil`.
- Idempotens: `dream_cycles` har unique `(user_id, date_trunc('day', created_at))` så idle-triggern aldrig spammar.
- LITHIC-koppling: cykeln är en explicit operator-sekvens `0 → 5 → 9` (VOID → VORTEX_RECALL → RESET), loggas som sådan i `rfa_frames` med `operator_trace='dream'`.

## Leverabler

1. SQL-migration: `dream_cycles` + `dream_hypotheses` (med GRANTs + RLS).
2. `supabase/functions/rfa-dream/index.ts` — hela cykeln.
3. `rfa-chat/index.ts` — `loadDreamResidue()` + injektion i systemprompt.
4. `usePresenceMonitor` — idle-trigger.
5. `MemoryPanel` — Drömmar-flik.
6. `RFAHeader` — månindikator.

Efter användarens OK på planen kör jag migrationen först, sedan resten i en pass.

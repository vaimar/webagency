# Slumber · AI intent layer architecture

Design, not yet implemented.

Grounded in:
- `POST /api/trips/explore`
- `src/services/tripExploreSelectors.ts`
- `src/services/destinationDirectory.ts`
- `agent-skills/shared/core-rules.md`

---

## An intent layer that cannot make things up

Free text in, ranked and fully-backed trips out. The model reads intent and writes prose. It never touches a number, never names a place, and never decides an order — because the whole design is built so that it structurally cannot.

---

## 00 — Start here

### Three of your four example intents are unanswerable today

Before any architecture: a model asked to filter for "cable park, beginner-friendly, warm" against the current API has exactly two options — refuse, or invent. No endpoint returns venue surface, difficulty, or opening season.

| Intent fragment | Field that would answer it | Exists? |
|---|---|---|
| "cable park only" | venue surface — cable / boat / sea | ✕ nowhere |
| "beginner-friendly" | skill level / cable difficulty | ✕ nowhere |
| "somewhere warm" | climate band / opening season | ✕ nowhere (`TripPlanParams.season` is a request param, not a fact) |
| "not too expensive" | `antiCauchemar.auditedTotalCost` | ✓ yes |
| "least stressful" | `lateArrivalMarkup`, `stops`, `manualCheckRequired` | ✓ yes |

### The real hallucination surface

It is not the prose layer. It is the catalogue. Closing it is a data task, not a prompt task: one curated, versioned file — `src/data/rideSpots.ts`, roughly eight rows, reviewed like code — carrying surface, `beginnerFriendly`, `climateBand`, `arrivalAirport` for the venues that already resolve end-to-end. It migrates to a backend `GET /api/spots` in v2. Everything below assumes it exists.

### The second structural constraint

`/api/trips/explore` is destination-in, trip-out. One destination, one `travelDate`. It cannot answer "somewhere warm." Discovery is therefore a fan-out across a closed catalogue, performed by our code — never a destination the model recalls from training.

---

## 01 — Product shape

One input on the existing explore page. On submit it collapses into an editable chip row — the receipt for what was understood — then at most three trip cards using the `TruthCard` stack you already have.

Example:

> "4 of us, leaving Dublin, 2 days, cable park only, not too pricey"

- From DUB
- 4 people
- Cable park
- Under €400pp
- 2 nights · 12–14 Sep · assumed
- Ranked: cheapest honest
- 3 backed options · confidence: mixed · 2 warnings

The chip row is the core product decision. The AI's output is a search, not an answer. Mistakes become visible and one click to fix, there is no conversation to manage, and the user never has to re-prompt to adjust one value.

### Where AI earns its place beyond filters

| Concern | Owner | Why it matters |
|---|---|---|
| Ranking profile | model | "Least stressful even if it costs more" is a weight vector, not a simple filter |
| Vocabulary → catalogue | model | Maps phrases like "wake park" or "somewhere I can actually learn" onto real constraints |
| Tradeoff prose | model | Turns two backed facts into a useful sentence |
| Plan selection | model-informed | Can decide whether a request is shortlist fan-out vs single destination |

### What stays deterministic — permanently

| Concern | Owner today | Rule |
|---|---|---|
| Price hierarchy | `antiCauchemarPricing.ts` | `auditedTotalCost` → recompute → `realWorldEntryPrice`; `doorToTripPrice` additive only |
| Sorting & scoring | `tripExploreSelectors.ts` | model picks a profile name; code owns every number |
| Airport resolution | backend + `destinationDirectory.ts` | model never emits an IATA code |
| All formatting | selectors / view layer | model never formats a number, date, or distance |
| CostLine badges | `TruthCard.tsx` | derived from status, never from prose |
| Transfer estimates | `transferEstimate.ts`, `driveEstimate.ts` | informational panel, never auto-added to a total |

---

## 01b — The nine states you actually have to build

"Implementation-ready UX" means the state machine, not the happy path. Fan-out takes seconds and any of three subsystems can degrade independently, so most of these are reachable on a normal day.

### `idle`

Empty box seeded with three real catalogue intents, not generic placeholders. Clicking one fills the box and submits.

→ `parsing`

### `parsing`

Box locks but keeps its text; skeleton chip row. ~600–1200ms.

→ `needs_answer` | `searching`

### `needs_answer`

One follow-up chip row, results area stays empty. Never more than one question, never a chat bubble.

→ `searching`

### `searching`

Chips resolved and already editable. Three skeleton cards plus per-candidate progress — because seconds of silence read as broken.

→ `results` | `results_partial` | `results_degraded` | `no_backing`

### `results`

At most 3 cards, narrative, warnings, confidence.

Terminal.

### `results_partial`

Fewer candidates returned than searched. The missing ones are named, not quietly dropped.

Terminal + `PARTIAL_FANOUT`.

### `results_degraded`

`orchestrationStatus !== 'OK'`. Banner; every price re-labelled estimated.

Terminal + `BACKEND_DEGRADED`.

### `no_backing`

Every candidate dropped by the no-flights rule. Show why, with the nearest deterministic relaxation — for example, "no DUB→IBZ on 12 Sep; nearest is 14 Sep" — computed from the payload. Never an empty state, never a model-written apology.

→ `searching` (relaxed)

### `narrative_failed`

Cards render normally, prose falls back to template, quiet info note. Not an error state — the user still got their answer.

Terminal + `NARRATIVE_REJECTED`.

### The interaction rule that will bite you

Editing a chip re-enters at `searching`, never at `parsing`. A chip edit must not re-run the parser. If it does, correcting "4 people" can silently flip the date or the ranking profile. Chips mutate `ResolvedIntent` directly and re-run the deterministic middle. The model is not in the correction loop at all.

---

## 02 — Orchestration: a sandwich, not an agent loop

Two model calls, neither of which can both invent and emit. The parser sees user text but never backend data. The explainer sees backend data but never the raw user text — and can only emit numbers as tokens that code substitutes.

1. **Model — Parse**  
   Free text → `TripIntent` JSON. Closed schema, enums only. Handles no facts.
2. **Deterministic middle — Plan · Fetch · Rank**  
   Merge profile preferences, resolve origin and destination against the catalogue, apply a materiality gate, fan out `POST /api/trips/explore` in parallel, drop unbacked options before the model sees them, score and rank, then build the fact ledger.
3. **Model — Explain**  
   Ledger → prose with `{{f#}}` tokens. No payload access, ever.

### Why not a tool-calling loop in v1

`/api/trips/explore` already fans out across multiple expensive subsystems. A free-running loop makes latency unpredictable exactly where the user is watching a spinner. It is also hard to test. So v1 makes endpoint selection a table keyed off intent shape.

| Intent shape | Plan | Calls |
|---|---|---|
| exactly 1 resolvable destination hint | `SINGLE_SPOT` | 1 × `explore` |
| no destination — vibe & constraints only | `SHORTLIST_FANOUT` | catalogue filter → 3 × `explore` in parallel |
| destination fixed, dates flexible | `DATE_SWEEP` | routes pre-filter → 3 × `explore` |
| budget-led, origin with thin direct routes | `BUDGET_HUNT` | 3 × `explore` + self-connect (v2) |

Graduate to real tool-calling only when self-connect, island-hop, and multi-city share the same plan space and their preconditions interact. Then: five whitelisted tools, a hard cap of two rounds, a call budget, and schema validation on every argument.

### Keeping the backend authoritative — three mechanical rules

1. **Closed vocabulary.** `TripIntent` is enums, numbers, and ISO dates. `destinationHints[]` must survive `resolveDestinationHint()`. Anything unresolved is dropped and surfaced as a warning.
2. **Code copies, model annotates.** Every field in `TripOption` is copied from backend payloads or computed by existing selectors. The model contributes exactly one thing: narrative.
3. **The fact ledger.** The explain call receives only a flat map of permitted facts — never the raw exploration payload.

### The fact ledger, concretely

What the model writes:

> Ibiza costs {{f1}} against Vilnius at {{f4}}, but you land at {{f2}} instead of after midnight — so you ride the first afternoon rather than losing it. The cable is {{f3}} from the stay.

What code substitutes:

| Fact | Value | Status | Source |
|---|---|---|---|
| `f1` | €312 | ESTIMATED | `unifiedFlights[0].antiCauchemar.auditedTotalCost` |
| `f2` | 16:10 | EXACT | `unifiedFlights[0].scheduledArrival` |
| `f3` | 4.2 km | EXACT | `primaryActivity.distanceKm` |
| `f4` | €268 | ESTIMATED | comparison option audited total |

Any bare digit surviving substitution means the narrative is discarded, templated fallback is used, and `NARRATIVE_REJECTED` is raised.

### Clarify vs proceed — a materiality test, computed not felt

Do not ask the model whether to ask. Run the plan under the assumption, then ask only if the answer would:

- change the identity of option 1
- swing the honest total by more than 25%
- eliminate at least 50% of the candidate set

That collapses to three blocking questions:

1. no origin, and no profile default
2. no date window on a seasonal request
3. a budget word with no number across a wide spread

Everything else should be assumed and shown as an editable chip.

---

## 03 — Response contract

One envelope per intent search. Each concern is a separate field so the UI can render, ignore, or degrade them independently — and so prose can never smuggle in a fact.

```ts
interface IntentSearchResponse {
  intent: ResolvedIntent;
  plan: ExecutedPlan;
  options: TripOption[];
  narrative: Narrative;
  warnings: Warning[];
  followUp: FollowUp | null;
  confidence: Confidence;
  facts: Record<string, Fact>;
}
```

### Structured options

No model text inside.

```ts
interface TripOption {
  id: string;
  spot: { label: string; arrivalAirport: string; surface: RideSurface };
  origin: { iata: string; driveMinutes: number | null };
  travelDate: string;
  flight: UnifiedFlightOption;
  pricing: FlightPricingView;
  total: { amount: number; currency: string; status: CostLineStatus };
  stay: HiddenGemHotel | null;
  rideDistanceKm: number | null;
  score: { value: number; components: Record<keyof WeightVector, number> };
  sourceRefs: string[];
}
```

### Explanations

Structurally incapable of an unbacked number.

```ts
interface Narrative {
  headline: string;
  perOption: Record<string, string>;
  generated: boolean;
  provider: string | null;
}
```

### Warnings

Typed, never merged into prose, never dropped.

```ts
type WarningKind =
  | 'BACKEND_DEGRADED'
  | 'MANUAL_CHECK_REQUIRED'
  | 'STALE_PRICE'
  | 'HINT_UNRESOLVED'
  | 'ASSUMPTION_APPLIED'
  | 'PARTIAL_FANOUT'
  | 'NARRATIVE_REJECTED';

interface Warning {
  kind: WarningKind;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  sourceRef?: string;
}
```

### Confidence

Computed, not claimed.

```ts
interface Confidence {
  level: 'live' | 'mixed' | 'estimated';
  exactCostLineRatio: number;
  staleQuotes: number;
  candidatesSearched: number;
  candidatesReturned: number;
  orchestrationStatus: string;
  drivers: string[];
}
```

### Follow-up

Applied without another model call.

```ts
interface FollowUp {
  field: keyof TripIntent;
  question: string;
  options: Array<{ label: string; value: unknown }>;
  reason: string;
}
```

---

## 04 — Safety rules

Layered, cheapest first. Every layer is code, not prompt wording.

| # | Rule | Mechanism |
|---|---|---|
| 1 | Can't name a place | `destinationHints[]` must survive `resolveDestinationHint()`; unresolvable → dropped + `HINT_UNRESOLVED` |
| 2 | Can't emit a number | `{{f#}}` tokens only; post-substitution digit scan rejects the narrative |
| 3 | Can't see unshown data | explain call receives the ledger, never `TripExplorationResponse` |
| 4 | Can't invent a category | `TripIntent` is enums; unknown values fail schema validation, re-prompt once, then fall back |
| 5 | No flights ⇒ no trip | drop `routeAvailable === false` or `ticketPrice === 0` before the model sees them |
| 6 | No promises | banned-phrase post-filter: `available`, `book now`, `guaranteed`, `included`, `sold out`, `open year-round`, `season`, `refundable` |
| 7 | Estimates labelled structurally | `total.status = weakest contributing CostLine.status`; badge reads that field, never the prose |
| 8 | Ranking not negotiable | model emits one `WeightProfile` enum value; vectors are frozen constants |
| 9 | Degradation never blocks | model timeout ⇒ templated narrative + warning; options still render |
| 10 | Reproducibility | cache on `(intentHash, planHash)`; identical asks never re-fan-out |

### The claim whitelist

The explain prompt carries an allow-list generated from the ledger's actual fields. If no opening-season fact exists, terms like `season`, `open`, or `closed` must trip the post-filter.

### Rule 9 is load-bearing

The AI layer is never on the critical path for results — only for routing and phrasing. If both model calls fail, the page must still render three ranked, honestly-priced trips with templated text.

---

## 05 — The first version: Ride Finder

One box, three cards, on the existing explore page, behind a flag. Scoped to wakeboard and cable park only — because that is where the catalogue is real: EXO 84, Ibiza Cable Park, 313 Cable Park, Hypnotics, Paris Wakepark, Lakecity 33, and Langenfeld already resolve end-to-end through the current system.

### Exact flow

| # | Step | Owner |
|---|---|---|
| 1 | User types free text into the Ride Finder box on `/explore` | UI |
| 2 | `POST /api/ai/intent` → `TripIntent`; catalogue labels injected as allowed destination vocabulary | model |
| 3 | Merge `GET /api/accounts/preferences`; intent always wins over profile | code |
| 4 | `resolveOriginAirport()` + `resolveDestinationHint()`; unresolved → `HINT_UNRESOLVED` | code |
| 5 | Materiality gate. Blocked ⇒ render one chip-row follow-up and stop; else continue | code |
| 6 | Planner picks `SINGLE_SPOT` or `SHORTLIST_FANOUT` → 3 parallel `POST /api/trips/explore` calls | code |
| 7 | Drop unbacked → build options via existing selectors → score → top 3 | code |
| 8 | Build ledger → `POST /api/ai/explain` → validate → substitute → render | model |

### What it needs

**New — 2 endpoints**

- `POST /api/ai/intent`
- `POST /api/ai/explain`

Thin typed wrappers over the existing provider chain behind `/api/ai/messages`: same fallback, same resolved-provider/cached envelope, but schema-constrained output instead of a free-form reply.

**Existing — 3 endpoints**

- `POST /api/trips/explore`
- `GET /api/accounts/preferences`
- `GET /api/ai/providers`

Hotels, stays, and activity POIs already come back inside explore — no extra calls.

**New — 1 data file**

- `src/data/rideSpots.ts`

Hand-curated: per venue `surface`, `beginnerFriendly`, `climateBand`, `arrivalAirport`, `sourceNote`.

### Explicitly not in MVP

- self-connect
- island-hop
- `/api/flight-search/*`
- hotel enrichment fan-out
- multi-date sweep

### Hard-coded vs model-driven

| Hard-coded — code owns it | Model-driven |
|---|---|
| venue catalogue + all venue facts | intent extraction only |
| fan-out width (`N = 3`) | `WeightProfile` — one of a closed enum |
| scoring math | narrative text — token-constrained |
| price hierarchy, sorting, formatting | follow-up phrasing — from fixed templates |
| date defaults, party-size defaults | — |
| confidence formula | — |
| warning rendering, badge colours | — |

The model's total influence on what the user sees: which spots get searched, one ranking token, and the wording.

### "Best wake park trip this month under my budget" — honest handling

`explore` takes one `travelDate`. A month-wide search is 30 dates × N spots. MVP samples three dates — two weekends and one midweek — and labels the result exactly that: "Checked 3 dates in September, not all 30." It must never claim "cheapest this month." Fixing it properly is v2's `DATE_SWEEP` with `/api/flight-search/routes` as a cheap pre-filter.

---

## 06 — Data gaps to fill before any of this ships

Ranked by what they block.

### 1. Venue facts blocking

Blocks:
- "cable park only"
- "beginner-friendly"
- "somewhere warm"

Today: no endpoint returns surface, difficulty, or climate.

Shape:
- `src/data/rideSpots.ts` — hand-curated, roughly 8 rows, reviewed like code

Interim:
- intent parses the constraint, but code cannot apply it ⇒ `ASSUMPTION_APPLIED`

Done when:
- every catalogue venue has all fields non-null, or is excluded from the shortlist

```ts
export interface RideSpot {
  label: string;
  arrivalAirport: string;
  surface: 'cable' | 'boat' | 'sea';
  cableCount: number | null;
  beginnerFriendly: boolean;
  skillFloor: 'none' | 'some' | 'confident';
  climateBand: 'warm' | 'temperate' | 'cold';
  openingSeason: { from: string; to: string } | 'year_round';
  sessionPriceEur: { hourly: number | null; dayPass: number | null } | null;
  sourceNote: string;
  checkedOn: string;
}
```

### 2. Opening season blocking

Blocks every date-flexible query. A closed park is a ruined trip, not a bad ranking.

Interim:
- the claim whitelist bans `season` / `open` / `closed` outright until the field exists

Done when:
- the shortlist filter drops out-of-season venues before fan-out

### 3. Activity session pricing degrades the total

Blocks any honest "what will this trip cost me" number.

Interim:
- ship without it, but label the total `excludes ride sessions` structurally as a `CostLine` with `status: MANUAL_CHECK_REQUIRED`

Done when:
- `sessionPriceEur` is populated and folded into the breakdown as its own line

### 4. Occupancy-aware stay pricing degrades one intent

Blocks "4 friends" from being truly price-honest.

Interim:
- keep the existing caveat: `price may vary for group size`

Done when:
- hotel search accepts occupancy and returns a rate for it

### 5. Date-range search is structural, not data

Blocks "best trip this month" answered truthfully.

Interim:
- sample three dates and say so on the card

Done when:
- `/api/flight-search/routes` is used as a cheap pre-filter to pick which dates merit full `explore`

Suggested order:
- gaps 1 + 2 in one PR
- gaps 3 + 4 ship as honest labels rather than blockers
- gap 5 is v2

---

## 07 — Roadmap

### MVP

Roughly 2–3 weeks, behind a flag on `/explore`.

- Ride Finder box
- 2 AI endpoints
- `rideSpots.ts`
- `SHORTLIST_FANOUT` + `SINGLE_SPOT`
- fact ledger
- chip row
- computed confidence
- templated fallback

Done when the four example intents each produce three backed options — and killing both model calls still renders them.

### v2

After real usage:

- move `rideSpots.ts` to the backend as `GET /api/spots`
- add real tool-calling with a small whitelist and hard cap
- `DATE_SWEEP` over a true date window via route pre-filter
- group-size-aware stay pricing
- saved intents such as "tell me when this drops under €300"

### Not yet, and why

| Not building | Why |
|---|---|
| open-ended chat | the chip row is a better search interface than a conversation |
| multi-turn memory | chips already carry state |
| booking or payment actions | the app links out; it must not imply bundled checkout |
| model-authored itineraries as fact | keep itinerary prose clearly separated from backed trip data |
| learned personalization | no volume yet; profile defaults are enough |
| streaming narratives | options should render before the prose anyway |
| semantic / vector spot search | the catalogue is tiny; deterministic filtering wins |
| model-chosen dates or airports | both are resolution problems with correct answers; keep them in code |


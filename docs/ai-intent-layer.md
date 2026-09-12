# Slumber AI Intent Layer — Architecture

> **Status (2026-09-12): partly built, AI layer deferred.**
>
> | Section | State |
> |---|---|
> | §2 deterministic middle | **Built** — `tripIntent`, `tripPlanner`, `tripSearch`, `tripRanking` |
> | §01b UX states | **Built** — `useRideFinder`, `RideFinder`, mounted at `/ride-finder` behind `REACT_APP_RIDE_FINDER` |
> | §6 venue dataset | **Partly** — `rideSpots.ts`, 7 spots, surface 4/7, season 1/7, beginner 0/7 |
> | §3 fact ledger, §4 narrative validation | **Deleted, recoverable.** Built at `dda8c57`, removed in the cleanup after the product direction moved from search to packages and routes. Nothing imported it. Restore from git if an AI narration layer is ever added. |
> | §7 roadmap | **Superseded.** The product is packages and multi-stop routes, not a search engine. |
>
> **Active route path (2026-09-12):** `/ride-finder` runs in route mode behind
> `REACT_APP_RIDE_FINDER`. Chain: `tripIntent` → `tripPlanner` (spot selection)
> → `wakeRoute` (ordering) → `boardRules` (carriage) → `weekendBudget` (costing)
> → `routeCard` (contract + trust) → `useRideFinder` → `RideFinder`.
> **No network and no model on this path** — ordering and costing are local
> arithmetic. Search mode is retained behind the same hook as a compatibility
> layer so old and new cards can coexist.
>
> The anti-hallucination *principles* below still hold and are enforced in
> `rideSpots.ts` (provenance per fact) and `boardRules.ts` (unverified warns
> loudly rather than failing silent). Only the model-facing plumbing is gone.
> **Grounded in:** `POST /api/trips/explore` (`src/types/tripExploration.ts`), `src/services/tripExploreSelectors.ts`,
> `src/services/destinationDirectory.ts`, `agent-skills/context/backend-contracts.md`, `agent-skills/shared/core-rules.md`.

---

## 0. The finding that shapes everything

Three of the four example intents **cannot be answered by the current backend at all**, and no prompt fixes that:

| Intent fragment | Field that would answer it | Exists today? |
|---|---|---|
| "cable park only" | venue surface (cable / boat / sea) | ❌ nowhere |
| "beginner-friendly" | skill level / cable difficulty | ❌ nowhere |
| "somewhere warm" | climate / opening season | ❌ nowhere (`TripPlanParams.season` is a *request* param, not a catalogue fact) |
| "under my budget" | `antiCauchemar.auditedTotalCost` | ✅ yes |
| "least stressful" | `lateArrivalMarkup`, `stops`, `manualCheckRequired`, `originDriveMinutes` | ✅ yes |

A model asked to filter for "cable park, beginner-friendly, warm" against today's API has exactly two options: refuse, or
invent. **This is the hallucination surface — not the prose layer.** Closing it is a data task, not a prompt task.

So the intent layer needs one new piece of **curated, versioned static data** (`src/data/rideSpots.ts`) carrying
per-venue facts for the ~8 catalogue venues that already resolve end-to-end. Small, hand-written, reviewable, migrated
to a backend `GET /api/spots` in v2. Everything else in this document assumes that file exists.

The second structural constraint: **`/api/trips/explore` is destination-in, trip-out.** It takes one `destination` and
one `travelDate`. It cannot answer "somewhere warm." Discovery must therefore be a *fan-out over a closed catalogue*
performed by our code — never a destination the model names from memory.

---

## 1. Product shape

### What the user sees

One input on the existing explore page, above the current form:

```
┌──────────────────────────────────────────────────────────────┐
│  Where do you want to ride?                                  │
│  "4 of us, Dublin, 2 days, cable park only, not too pricey"  │
└──────────────────────────────────────────────────────────────┘
```

On submit the box collapses into an **editable chip row** — the receipt for what was understood:

```
 From DUB ✎   ·   2 nights ✎   ·   4 people ✎   ·   Cable park ✎   ·   Under €400pp ✎   ·   Ranked: cheapest honest ✎
 ⓘ Dates assumed: next free weekend (12–14 Sep). Change →
```

Then **at most three** trip cards — the existing `TripExploreDashboard` truth cards, unchanged — each with:

- the honest-price stack already built by `antiCauchemarPricing.ts` (base fare / honest total / door-to-trip)
- one model-written paragraph: *why this one, and what you give up*
- `theCatch` verbatim from the backend, never paraphrased
- every `MANUAL_CHECK_REQUIRED` CostLine, never summarized away

And below that, at most one follow-up, rendered as chips rather than a chat turn.


### The nine states you actually have to build

"Implementation-ready UX" means the state machine, not the happy path. Fan-out takes seconds and three subsystems can
degrade independently, so most of these are reachable on a normal day.

| State | What renders | Next |
|---|---|---|
| `idle` | Empty box seeded with three *real* catalogue intents, not generic placeholders | → `parsing` |
| `parsing` | Box locks but **keeps its text**; skeleton chip row. ~600–1200ms | → `needs_answer` \| `searching` |
| `needs_answer` | One follow-up chip row, results area empty. Never >1 question, never a chat bubble | → `searching` |
| `searching` | Chips resolved and already editable; 3 skeleton cards + **per-candidate progress** (`Ibiza ✓ · Vilnius ✓ · Hypnotics …`) — seconds of silence read as broken | → `results` \| `partial` \| `no_backing` |
| `results` | ≤3 cards, narrative, warnings, confidence | terminal |
| `results_partial` | Fewer candidates returned than searched; the missing ones are **named** | terminal + `PARTIAL_FANOUT` |
| `results_degraded` | `orchestrationStatus !== 'OK'`; banner, prices re-labelled estimated | terminal + `BACKEND_DEGRADED` |
| `no_backing` | Every candidate dropped by the no-flights rule. **The state teams get wrong.** Show why + the nearest deterministic relaxation ("no DUB→IBZ on 12 Sep; nearest is 14 Sep"), computed from the payload. Never an empty state, never a model-written apology | → `searching` (relaxed) |
| `narrative_failed` | Cards render normally, prose templated, quiet info note. **Not an error state** | terminal + `NARRATIVE_REJECTED` |

**The one interaction rule that will bite you:** editing a chip re-enters at `searching`, **never** at `parsing`. A chip
edit must not re-run the parser — if it does, correcting "4 people" can silently flip the date or the ranking profile,
and the user fixes one field while two others move. Chips mutate `ResolvedIntent` directly and re-run the deterministic
middle. The model is not in the correction loop at all.

### Where AI earns its place (beyond filters)

1. **Vocabulary → catalogue.** "cable park", "wake park", "somewhere I can actually learn", "not too far" are not
   filter values. Mapping them onto `activity` + `rideSurface` + `skillLevel` + a drive-time ceiling is real work.
2. **Ranking profile selection.** This is the highest-value output and the smallest. "Least stressful even if it costs
   more" is not a filter — it is a *weight vector*: zero `lateArrivalMarkup`, zero `stops`, low `originDriveMinutes`,
   heavy penalty on `MANUAL_CHECK_REQUIRED`. Exposing that as UI needs six sliders nobody will touch. One sentence of
   natural language sets it.
3. **Tradeoff prose.** "€40 more but you land at 16:10 instead of 23:55, so you ride the first afternoon" is a
   two-field comparison the UI can only render as two numbers side by side.
4. **Plan selection.** Knowing that a 4-person Dublin trip should also try `/api/trips/self-connect`, while a
   single-spot request should not, saves an expensive fan-out.

### What stays deterministic — permanently

Everything already built. The AI layer is additive and must not be allowed to re-decide any of it:

| Concern | Owner today | Rule |
|---|---|---|
| Price hierarchy | `antiCauchemarPricing.ts` | `auditedTotalCost` → recompute → `realWorldEntryPrice`; `doorToTripPrice` additive only |
| Sorting & scoring | `tripExploreSelectors.ts` | model picks a profile *name*; code owns every number |
| Airport resolution | backend `AirportResolutionService` + `destinationDirectory.ts` | model never emits an IATA code |
| Currency / date / distance formatting | `tripExploreSelectors.ts` | model never formats a number |
| CostLine badges | `TruthCard.tsx` | derived from `status`, never from prose |
| Transfer & drive estimates | `transferEstimate.ts`, `driveEstimate.ts` | informational panel, never auto-added to a total |

---

## 2. Orchestration model

### Shape: a sandwich, not an agent loop

```
  user text
      │
      ▼
 ┌─────────────────────┐
 │ ① PARSE   (model)   │  free text → TripIntent JSON. Closed schema. No facts.
 └─────────────────────┘
      │  TripIntent
      ▼
 ┌─────────────────────────────────────────────────────────┐
 │ ② PLAN + FETCH + RANK        (deterministic, no model)  │
 │   profile merge → resolve → materiality gate → fan-out  │
 │   → drop unbacked → score → top 3 → build fact ledger   │
 └─────────────────────────────────────────────────────────┘
      │  TripOption[] + Fact[]
      ▼
 ┌─────────────────────┐
 │ ③ EXPLAIN (model)   │  ledger → prose with {{f#}} tokens. No payload access.
 └─────────────────────┘
      │
      ▼  validate → substitute → render
```

**Two model calls, neither of which can both invent and emit.** The parser sees user text but never touches backend
data. The explainer sees backend data but never the raw user text, and can only emit numbers as tokens the code
substitutes.

### Why not a tool-calling agent loop (for v1)

`/api/trips/explore` fans out across flight providers, OpenTripMap and hotel enrichment. It is measured in seconds, not
milliseconds. A free-running loop will make eight of them on a bad day, and latency becomes unpredictable exactly on the
path where the user is staring at a spinner. It is also untestable: you cannot snapshot-test a plan that differs per
run.

So v1 makes endpoint selection a **table keyed off intent shape**:

| Intent shape | Plan | Calls |
|---|---|---|
| exactly 1 resolvable destination hint | `SINGLE_SPOT` | 1 × explore |
| no destination, vibe/constraints only | `SHORTLIST_FANOUT` | catalogue filter → top 3 × explore (parallel) |
| destination fixed, dates flexible | `DATE_SWEEP` | `/api/flight-search/routes` pre-filter → 3 × explore on 3 sampled dates |
| budget-led, origin with thin direct routes | `BUDGET_HUNT` | 3 × explore **+** 1 × self-connect *(v2)* |

**Graduate to real tool-calling when — and only when — the plan space outgrows the table.** The trigger is concrete:
when self-connect, island-hop and multi-city all sit in the same plan space and their preconditions start to interact.
At that point: a whitelist of five tools, a hard cap of two rounds, a call budget, and every tool argument validated
against the same schemas below. The sandwich stays; the middle just gets a bounded loop inside it.

### Keeping the backend authoritative — the three mechanical rules

1. **Closed vocabulary.** `TripIntent` is enums, numbers and ISO dates. The one string field, `destinationHints[]`,
   must survive `resolveDestinationHint()`. Anything that doesn't resolve is **dropped and surfaced as a warning** —
   never passed through, never silently corrected.
2. **Code copies, model annotates.** Every field in `TripOption` is either copied verbatim from a backend payload by
   code, or computed by an existing selector. The model contributes exactly one thing to an option: `narrative`.
3. **The fact ledger.** Before the explain call, code builds a flat map of the only facts the model may reference:

```ts
interface Fact {
  id: string;                  // "f3"
  label: string;               // "honest total, option A"
  display: string;             // "€312"  — pre-formatted by formatCurrency()
  raw: number | string;
  status?: CostLineStatus;     // EXACT | ESTIMATED | MANUAL_CHECK_REQUIRED | OVERRIDDEN_...
  source: { endpoint: string; path: string; fetchedAt: string };
}
```

The explain prompt receives **only the ledger** — never `TripExplorationResponse`. Every number in the narrative must
be a `{{f3}}` token. Code substitutes tokens, then runs `/\d/` over what remains; a bare digit means the model made a
number up, and the narrative is discarded for a templated sentence.

### Clarify vs proceed — a materiality test, computed not felt

Do not ask the model whether to ask. Compute it:

> Run the plan under the assumption. Ask only if the answer would change the **identity of option 1**, swing the
> honest total by **>25%**, or eliminate **≥50%** of the candidate set.

In practice that collapses to **three blocking questions**, and nothing else:

1. **No origin, and no `dailyBudget`/profile default to fall back on.** There is no honest default for "where do you
   live."
2. **No date window at all, on a seasonal request.** "Somewhere warm" in January and in July are different catalogues.
3. **An explicit budget word with no number, when the candidate spread is wide** (cheapest and dearest differ by >2×).
   "Not too expensive" over a €180–€520 spread is unanswerable; over €180–€240 it is noise — proceed.

Everything else: **assume, and show the assumption as an editable chip.** The chip is strictly better than a question —
it costs the user no turn, it is visible, and correcting it is one click. Ask only when the assumption cannot be
represented as a chip.

---

## 3. Response contract

One envelope, returned to the frontend on every intent search:

```ts
interface IntentSearchResponse {
  intent:     ResolvedIntent;                 // renders as the chip row
  plan:       ExecutedPlan;                   // which endpoints ran, per-call status
  options:    TripOption[];                   // ranked, max 3, pure backend passthrough
  narrative:  Narrative;                      // model prose, already token-substituted
  warnings:   Warning[];                      // typed, always rendered
  followUp:   FollowUp | null;                // at most one
  confidence: Confidence;                     // computed, never model-asserted
  facts:      Record<string, Fact>;           // the ledger — powers hover-to-source
}
```

**Structured options** — no model text anywhere inside:

```ts
interface TripOption {
  id: string;
  spot:    { label: string; arrivalAirport: string; surface: RideSurface };
  origin:  { iata: string; driveMinutes: number | null };
  travelDate: string;
  flight:  UnifiedFlightOption;               // verbatim from explore
  pricing: FlightPricingView;                 // from getFlightPricing()
  total:   { amount: number; currency: string; status: CostLineStatus };  // weakest CostLine wins
  stay:    HiddenGemHotel | null;
  rideDistanceKm: number | null;              // primaryActivity.distanceKm
  score:   { value: number; components: Record<keyof WeightVector, number> };
  sourceRefs: string[];                       // fact ids backing every number above
}
```

**Explanations** — separate, and structurally incapable of carrying an unbacked number:

```ts
interface Narrative {
  headline: string;                  // "Ibiza wins on ride time, Vilnius on price."
  perOption: Record<string, string>; // optionId → "why this one, and what you give up"
  generated: boolean;                // false ⇒ templated fallback was used
  provider: string | null;           // resolvedProvider from /api/ai/messages
}
```

**Warnings** — typed, never merged into prose, never dropped:

```ts
type WarningKind =
  | 'BACKEND_DEGRADED'        // orchestrationStatus !== 'OK'
  | 'MANUAL_CHECK_REQUIRED'   // a CostLine could not be validated
  | 'STALE_PRICE'             // fetchDate > 12h
  | 'HINT_UNRESOLVED'         // user named a spot outside the catalogue
  | 'ASSUMPTION_APPLIED'      // we filled a gap ourselves
  | 'PARTIAL_FANOUT'          // fewer candidates returned than searched
  | 'NARRATIVE_REJECTED';     // explain output failed validation

interface Warning { kind: WarningKind; severity: 'info'|'warn'|'critical'; message: string; sourceRef?: string; }
```

Backend `ExploreWarning[]` maps straight onto this — it already carries `source`, `kind`, `message`, `fallbackUsed`.

**Confidence — computed, not claimed.** Model self-reported confidence is noise. Derive it:

```ts
interface Confidence {
  level: 'live' | 'mixed' | 'estimated';   // reuses the existing DataConfidence type
  exactCostLineRatio: number;              // EXACT / total CostLines
  staleQuotes: number;                     // fetchDate > 12h
  candidatesSearched: number;
  candidatesReturned: number;              // < searched ⇒ PARTIAL_FANOUT
  orchestrationStatus: string;             // 'OK' | 'DEGRADED' | 'CITY_COORDINATES_UNAVAILABLE'
  drivers: string[];                       // plain-language reasons, for the tooltip
}
```

**Follow-up** — structured so the UI renders chips and applies the answer *without another model call*:

```ts
interface FollowUp {
  field: keyof TripIntent;                  // which gap it fills
  question: string;                         // from a fixed template set of 6
  options: Array<{ label: string; value: unknown }>;
  reason: string;                           // why it's material — shown on hover
}
```

---

## 4. Safety rules

Layered, cheapest first. Every layer is code, not prompt wording.

| # | Rule | Mechanism |
|---|---|---|
| 1 | The model cannot name a place | `destinationHints[]` must survive `resolveDestinationHint()`; unresolvable → dropped + `HINT_UNRESOLVED` |
| 2 | The model cannot emit a number | `{{f#}}` tokens only; post-substitution `/\d/` scan rejects the narrative |
| 3 | The model cannot see unshown data | explain call receives the ledger, never `TripExplorationResponse` |
| 4 | The model cannot invent a category | `TripIntent` is enums; unknown values fail schema validation and re-prompt once, then fall back |
| 5 | No flights ⇒ no trip | drop any option with `routeAvailable === false` or `ticketPrice === 0` (Java primitive: `0` means *unknown*, never free) **before** the model sees it |
| 6 | Never promise what wasn't returned | banned-phrase post-filter: *available, book now, guaranteed, included, sold out, open year-round, season, refundable* |
| 7 | Estimates are labelled structurally | `TripOption.total.status` = weakest contributing `CostLine.status`; the badge reads that field, never the prose |
| 8 | Ranking is not negotiable | model emits one `WeightProfile` enum value; the weight vectors are a frozen constant in code |
| 9 | Degradation never blocks results | model timeout/failure ⇒ templated narrative + `NARRATIVE_REJECTED` warning; **options still render** |
| 10 | Reproducibility | cache on `(intentHash, planHash)`; identical asks never re-fan-out |

**The claim whitelist.** The explain prompt carries an allow-list generated from the ledger's actual fields. If the
ledger has no `openingSeason` fact, the words *season*, *open*, *closed* trip the post-filter. This is what stops the
single most likely failure: a fluent, plausible sentence about when a cable park is open.

**Rule 9 is the load-bearing one.** The AI layer is never on the critical path for *results* — only for *routing and
phrasing*. If both model calls fail, the page still renders three ranked, honestly-priced trips with templated text.
That property is what makes it safe to ship.

---

## 5. Concrete first version

**"Ride Finder" — one box, three cards, on the existing explore page, behind a flag.**

Scoped to wakeboard/cable park only, because that is where the catalogue is real: EXO 84, Ibiza Cable Park,
313 Cable Park, Hypnotics, Paris Wakepark, Lakecity 33, Langenfeld — all already resolve end-to-end.

### Exact flow

1. User types free text into the Ride Finder box on `/explore`.
2. `POST /api/ai/intent` → `TripIntent`. The catalogue labels are injected into the prompt as the **only** allowed
   destination vocabulary. Response validated against the JSON schema; one re-prompt on failure, then give up and fall
   through to the existing manual form.
3. Merge with `GET /api/accounts/preferences` — `dailyBudget`, `pace`, `preferredTransport` fill gaps. **Intent always
   wins over profile.**
4. `resolveOriginAirport(homeAddress)` and `resolveDestinationHint(hint)` run deterministically. Unresolved hints →
   `HINT_UNRESOLVED`.
5. Materiality gate. Blocked ⇒ render one `FollowUp` chip row and stop. Otherwise continue, emitting
   `ASSUMPTION_APPLIED` for every gap filled.
6. Planner picks `SINGLE_SPOT` or `SHORTLIST_FANOUT`. Fan-out: **3 parallel** `POST /api/trips/explore` with
   `providers: ['serpapi']`, `activityRadiusMeters: 5000`, `hotelRadiusMeters: 10000`, `firstMileAccess: { mode }`.
7. Deterministic core: drop unbacked options (rule 5) → build `TripOption[]` via `getFlightRows`, `getFlightPricing`,
   `filterAndSortStays` → score against the weight vector → keep top 3.
8. Build the ledger → `POST /api/ai/explain` → validate → substitute → render cards, chips, warnings, confidence.

### Endpoints it needs

**New (2):** `POST /api/ai/intent`, `POST /api/ai/explain`. Both are thin typed wrappers over the existing provider
chain behind `/api/ai/messages` — same fallback, same `resolvedProvider`/`cached` envelope, but schema-constrained
output instead of a `reply` string.

> *Stopgap if backend work can't land first:* call `/api/ai/messages` with a schema-forcing prompt and parse the reply.
> It works, but it puts validation on the client and burns a round-trip on retries. Treat it as a two-week bridge, not
> the design.

**Existing (3):** `POST /api/trips/explore` ×3, `GET /api/accounts/preferences`, `GET /api/ai/providers`.
Hotels, stays and activity POIs already come back *inside* explore — no extra calls.

**New static data (1):** `src/data/rideSpots.ts` — per venue: `surface`, `beginnerFriendly`, `climateBand`,
`arrivalAirport`, `sourceNote`. Hand-curated, ~8 rows, reviewed like code.

**Explicitly not in MVP:** self-connect, island-hop, `/api/flight-search/*`, hotel enrichment fan-out, multi-date sweep.

### Hard-coded vs model-driven

| Hard-coded (code owns it) | Model-driven |
|---|---|
| Venue catalogue + all venue facts | Intent extraction — **only** |
| Fan-out width (N = 3) | `WeightProfile` selection (1 of 4 enum values) |
| The 4 weight vectors, and all scoring math | Narrative text (token-constrained) |
| Price hierarchy, sorting, formatting | Follow-up *phrasing* (from a fixed template) |
| Date defaults, party-size defaults | — |
| The 6 follow-up templates | — |
| Confidence formula | — |
| Warning rendering, badge colours | — |

The model's total influence on *what the user is shown* is: which spots get searched, one ranking-profile token, and
the wording. That is the right amount.

### "Best wake park trip this month under my budget" — the honest handling

`explore` takes one `travelDate`. A month-wide search is 30 dates × N spots. MVP samples **3 dates** (two weekends and
one midweek) and labels the result exactly that: *"Checked 3 dates in September, not all 30."* It does not claim
"cheapest this month." Fixing it properly is a v2 `DATE_SWEEP` using `/api/flight-search/routes` as a cheap pre-filter.


---

## 6. Data gaps to fill first

Ranked by what they block. Gaps 1 and 2 are the same file and should land in one PR.

### 1 · Venue facts — blocking
- **Blocks:** "cable park only", "beginner-friendly", "somewhere warm" — three of four target intents
- **Today:** no endpoint returns surface, difficulty or climate. The model must refuse or invent
- **Shape:** `src/data/rideSpots.ts`, hand-curated, ~8 rows, reviewed like code
- **Source:** venue websites, human-checked, each row carrying `sourceNote` + `checkedOn`
- **Interim:** intent parses the constraint, code can't apply it ⇒ `ASSUMPTION_APPLIED` — "we could not filter by surface"
- **Done when:** every catalogue venue has all fields non-null, or is excluded from the shortlist

```ts
export interface RideSpot {
  label:            string;   // MUST match destinationDirectory.ts exactly
  arrivalAirport:   string;
  surface:          'cable' | 'boat' | 'sea';
  cableCount:       number | null;        // null = not a cable park
  beginnerFriendly: boolean;              // has a beginner line / school
  skillFloor:       'none' | 'some' | 'confident';
  climateBand:      'warm' | 'temperate' | 'cold';
  openingSeason:    { from: string; to: string } | 'year_round';  // MM-DD
  sessionPriceEur:  { hourly: number | null; dayPass: number | null } | null;
  sourceNote:       string;   // where a human verified this
  checkedOn:        string;   // ISO date — staleness is a warning, not a guess
}
```

### 2 · Opening season — blocking
- **Blocks:** every date-flexible query. A closed park is a ruined trip, not a bad ranking
- **Risk:** the highest-consequence hallucination in the product. "Open year-round" is exactly the fluent, plausible,
  wrong sentence a model produces
- **Interim:** the claim whitelist bans *season / open / closed* outright until the field exists
- **Done when:** the shortlist filter drops out-of-season venues *before* fan-out, saving the explore call entirely

### 3 · Activity session pricing — degrades the total
- **Blocks:** any honest "what will this cost me". Already an open item in `AGENTS.md`
- **Today:** flights and stays are priced; the actual riding is not. A "total" omitting it is misleading
- **Interim:** ship without it, but label the total *"excludes ride sessions"* **structurally** — a CostLine with
  `status: MANUAL_CHECK_REQUIRED`, not prose
- **Done when:** `sessionPriceEur` is folded into the breakdown as its own line

### 4 · Occupancy-aware stay pricing — degrades one intent
- **Blocks:** "4 friends" — the bbox rate is a single nightly figure, not per-occupancy
- **Interim:** already a core rule — label *"price may vary for group size"*. **Do not multiply by party size**; that
  would be inventing a price
- **Done when:** hotel search accepts occupancy and returns a rate for it

### 5 · Date-range search — structural, not data
- **Blocks:** "best trip this month" answered truthfully
- **Today:** `explore` takes one `travelDate`; a month is 30 × N calls
- **Interim:** sample three dates and say so on the card — "checked 3 dates in September, not all 30"
- **Done when:** `/api/flight-search/routes` pre-filters which dates deserve a full explore

**Order:** gaps 1 + 2 together in one PR — they unblock three of the four target intents. Gaps 3 and 4 ship as honest
labels rather than blockers. Gap 5 is v2. None of this needs a model; all of it needs a human who has checked a venue's
website.

---

## 7. Roadmap

### MVP — ~2–3 weeks
Ride Finder box, 2 AI endpoints, `rideSpots.ts`, `SHORTLIST_FANOUT` + `SINGLE_SPOT`, fact ledger, chip row, computed
confidence, templated fallback. Behind a flag on `/explore`. **Done when** the four example intents each produce three
backed options, and killing both model calls still renders them.

### v2 — after real usage
- **Move `rideSpots.ts` to the backend** as `GET /api/spots`, with `openingSeason`, `surface`, `beginnerFriendly`,
  `sessionPriceEur`. This is the highest-value item: it closes the last real hallucination hole and unblocks the
  activity-cost gap already tracked in `AGENTS.md`.
- Real tool-calling — 5 whitelisted tools, ≤2 rounds, call budget — bringing `self-connect` and `island-hop` into the
  plan space.
- `DATE_SWEEP` over a true date window via `/api/flight-search/routes` pre-filter.
- Group-size-aware stay pricing (today's bbox rate is not occupancy-specific).
- Saved intents: "tell me when this drops under €300."

### Not yet — and why
| Not building | Why |
|---|---|
| Open-ended chat | The chip row is a better interface than a conversation for a search that has a schema |
| Multi-turn memory | Chips already carry state; memory adds a whole invalidation problem for no user gain |
| Booking or payment actions | The app links out; rule 6 exists precisely so we never imply otherwise |
| Model-authored itineraries as fact | `/api/trips/ai-guide` already does this as clearly-labelled colour. Keep it labelled |
| Learned personalization | No volume yet. `/api/accounts/preferences` is enough |
| Streaming narratives | Options render before the narrative anyway — streaming optimises the part that isn't blocking |
| Semantic/vector spot search | The catalogue is ~8 venues. A `filter()` beats embeddings until it's ~500 |
| Model-chosen dates or airports | Both are resolution problems with correct answers. Rules 1 and 8 exist to keep them in code |

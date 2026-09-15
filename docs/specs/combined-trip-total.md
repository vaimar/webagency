# Combined trip total — spec

Status: **agreed** (rev 4.2; contract review closed 2026-09-15, Step 2 of `docs/team-protocol.md`). **A1: accepted, 34/34 (2026-09-15).**
Owner: `pm` · Reviewers (all agreed):
- `backend`: agreed (rev 2); rev 4.x doesn't touch its area
- `frontend`: agreed rev 4, OK'd the rev 4.1 flight-label change
- `sdet`: agreed rev 4.1

Build: FE1–FE3 (frontend) and T1–T3 → V1 (sdet) created by the lead, on branch `feat/combined-trip-total`. A1 (acceptance) follows sdet's V1 report.

User decisions received 2026-09-14 and 2026-09-15 (relayed by the lead): see section 10.
Source item: `AGENTS.md` open work items — "Combined trip total surface", with
"Hotel occupancy-aware pricing" and "Wakeboard / activity cost gap".

## Revision log

- **rev 1** (2026-09-14): first draft, 28 criteria.
- **rev 2** (2026-09-14): backend and frontend contract review.
  - backend: flights source is `GET /api/flights`; check-in wording corrected; non-EUR flight excluded from the all-in too.
  - frontend: teaser `honest` aligned to the card's all-in; stable pick `id`; plurals, control copy, landmarks, toggle-to-remove, currency source, non-EUR formatter, label fallback, NaN clamping, state precedence.
  - 30 criteria.
- **rev 3** (2026-09-14): sdet contract review.
  - T3 mocks fixed; excluded-list visibility became a viewport check; no-request check is per action; label and figure share one row element; stepper value readable by role.
  - New criteria: not-converted shows the unit amount, "nothing priced" state, stale-fare note, no pick on Getting there rows, no card on not-found, `''` currency, `2.5 → 3`. F11 recorded.
  - 33 criteria.
- **rev 4** (2026-09-14, amended 2026-09-15): user decisions.
  - Headline basis and exclusions unchanged.
  - **Display is now cents, not whole euros.**
    - New `formatCents()` helper (7.5) for every card amount, including non-EUR.
    - The teaser fare, teaser `honest` and stay per-night call sites move to the same helper, so the row a traveller picks and the card show the same figure.
    - `euro()`, the flight cart and `SpotDetailPage`'s `formatPrice` are unchanged; the cart-vs-card difference is recorded as F12.
  - Every displayed € string in the criteria re-derived.
  - Amended 2026-09-15: a separate session is changing the Getting there rows (`SpotDetailPage.tsx` L1092–1101, F11), so this spec specifies no change to them. Criterion 35 is withdrawn.
  - 34 criteria.
- **rev 4.1** (2026-09-15): sdet rev 4 review and a user decision.
  - sdet 1: the flight label's date is built by hand with fixed English short names (`formatShortDate`, 7.9). `toLocaleDateString('en-IE', …)` gives `Sat, 3 Oct` on Node 25, and other ICU builds may differ.
  - sdet 2: criterion 30 now counts only requests to `/api/**` and `/actuator/**`. MapLibre tile and style fetches on layout shift are not the total's doing.
  - The U+00A0 note for currencies without a symbol (from frontend) is added to 7.5.
  - User decision: F13 decided. The Getting there rows move to cents after this slice and F11 land; owner frontend; not in this slice.
  - Still 34 criteria.
- **Closing update** (2026-09-15): review closed, status set to agreed.
  - Recorded frontend's two accepted notes: the teaser row's own date label uses `formatShortDate` (FE3, 7.9), and `formatShortDate` reads a bare `YYYY-MM-DD` as a local date (7.9).
  - Added the T1 case `formatShortDate('2026-10-03') === 'Sat 3 Oct'` to criterion 13.
  - Recorded the build branch.
  - No criterion added or removed: still 34.
- **rev 4.2** (2026-09-15, A1): additions found at acceptance, recorded as built. None changes a criterion, a figure or a price basis.
  - 7.9: each card line carries a kind heading, `Flight out` / `Stay` (`TripTotalCard.tsx`, `KIND_HEADING`).
  - 7.9: an unpriced flight line (e.g. an unparseable fare) reads `No usable fare. Check the fare before booking.`, the flight counterpart of the unpriced-stay text. No amount is shown.
  - 7.7: when the spot has no arrival airport, item 2 reads `Getting from the airport to the spot`.
  - 7.8: the card is rendered only when the spot has coordinates, the same gate as the tabs. Picks, nights and travellers reset when the slug changes.
  - Judged at A1, no change: the teaser `honest` figure now reads the audited all-in (e.g. DUB→MRS `€51.99` fare, `honest €66.99` including the late-arrival cost). This is the rev 2 alignment in 7.4, working as intended.
  - Still 34 criteria.

---

## 1. Problem

A traveller on a spot page (`/spots/:slug`) can see a fare to the nearest
airport and a nightly rate for a place to stay, in two different places on
the page, and has to add them up in their head, multiplied by nights and by
people. They also have no way to see what that sum leaves out: the flight
home, getting from the airport to the spot, and the riding itself.

The product's position is "honest total cost" (`docs/POSITIONING.md`). A spot
page that shows the pieces but never the sum only half delivers it.

## 2. Who it's for

A rider who has landed on a spot page from Dublin (the beta departure region),
often in a group, and asks "roughly what does a few nights here cost us?"
before committing to anything. Private-beta route: `/spots/:slug`.

## 3. What already exists — and why this is not a backend endpoint

Research done before scoping (2026-09-14). The work item's "no such component
exists yet" is **out of date**. Three totals already exist, and none of them fits:

| Existing | Where | Why it isn't this feature |
|---|---|---|
| Flight cart `cartTotals()` | `src/services/flightCart.ts`, `src/components/FlightCart.tsx` on `/hack-flights` | Flights only. Totals on the **fare** with a `FareBasis` (`exact / floor / observed / unknown`) and prefixes `from ` / `≈ `. Off the beta nav. **This spec agrees with it on basis and prefixes.** It shows whole euros via `euro()`; this card deliberately shows cents (user decision, section 10; F12). |
| Trip Ledger `computeTotals()` | `src/data/tripLedger.ts`, `src/TripLedger.tsx` on `/trip-ledger` | A hand-authored, localStorage-persisted multi-stop document seeded with one real trip (Alps + Ibiza). Amounts are typed in by the user. Statuses are `EXACT / ESTIMATED / CHECK` with no floor basis, so reusing it would drop the `from` that the cart shows. Off the beta nav. |
| TripGuide `PackageSummary` / `estimatePackage()` | `src/components/TripGuide.tsx` L88–116, L240–291 | Not reachable from any route. **Invents** a stay price, `Math.max(65, dailyBudget * 0.7)`, and a food price when data is missing, then labels the sum "Door-to-trip total". It breaks the honest-total rule and must not be used as a base. |

Backend precedent to avoid: `IslandHopService` falls back to a flat
`DEFAULT_NIGHTLY_EUR = 110` for unpriced hotels (reported by `backend`).

**Decision: frontend-only. No new backend endpoint and no backend build task in this slice.**

Reasons:
1. Every input already reaches the browser with its provenance.
   - Flight: `FlightAvailable` + `antiCauchemar` from the spot page's existing `searchFlights` call, which is `GET /api/flights`. `RyanairService.enrichFlights` attaches `antiCauchemar` to every flight.
   - Stay: `NearbyStay.pricePerNight` / `priceCurrency` from the existing `GET /api/hotels/search/bbox` + `GET /api/hotels/curated` calls.
   - Tariff: `PriceLine[]` from `GET /api/spots/{slug}`.
2. There is no server-side trip or selection model to total. The cart and the ledger both live in localStorage. A `POST /api/trips/total` would take picks the browser already holds and re-fetch Ryanair and Xotelo prices the page already has, spending provider quota.
3. The rule that matters, the price hierarchy, is already implemented client-side in `getAntiCauchemarPricingSummary()` (`src/services/antiCauchemarPricing.ts`) and `cartTotals()`. Moving it server-side for one surface would create a second source of truth while the cart stays client-side.
4. The dates gap below can't be fixed by a server total on this path anyway: `GET /api/flights` ignores `date`, so a server total would still combine an undated flight with a hotel rate.

`backend`'s option (b), `POST /api/trips/total`, is the right shape **once a
server-persisted trip exists or the AI planner needs totals**. It's listed
under follow-ups, not built now. `backend` agreed in review.

### Known data limits this slice designs around (not fixes)

- **Hotel rates are not for the traveller's dates.** `/api/hotels/curated` takes no dates. It quotes one night, checking in on the Monday on or before the date six weeks from today, so 36–42 days out (`HotelSearchService.serpApiCheckInDate()`, L984–989). The Xotelo rates on bbox results and SerpApi use the same window. Bbox results are cached whole, so a rate may belong to the window from when it was cached. The stay line is therefore always an **Estimate** in the POSITIONING.md sense ("derived from an adjacent fare, not quoted for this itinerary") and says so in words. Nights are a traveller-chosen multiplier, not a date range. `pricePerNight` is the cheapest OTA quote.
- **Hotel rates are per room, not per person** (Xotelo, OpenTripMap bbox). The stay line always carries the group-size note.
- **The spot page only knows the outbound direction** (`FlightTeaser`: origin to the spot's arrival airport). The return flight is **excluded and listed as such**. It isn't silently omitted.
- **Activity pricing now is in an API.** `spot_price` rows are served as `PriceLine[]` on `/api/spots/{slug}`, so the `AGENTS.md` item "not in any API" is stale. The prices are still not summable without a product choice: `GROUP_HIRE` vs `SESSION` vs `HOUR`, gear, the compulsory `ACCESS_BAND`. `SpotTariff.tsx` deliberately refuses a "from €X" figure. Riding is **excluded from the total** and pointed at the tariff panel.
- **Non-EUR fares mix currencies in the audit.** Ryanair answers in the market currency, so a UK-origin fare is GBP, and the backend adds a EUR bag and shuttle on top of it. A non-EUR flight line is excluded from **both** the headline and the all-in (7.2, 7.3). Beta fares from DUB are EUR.
- **Getting there tab rows are out of bounds for this spec.** The priced "ways in" rows (`SpotDetailPage.tsx` L1092–1101, from `SpotAccessPricingService`) are being changed in a separate session (F11: fare first, all-in adjacent). This slice does not specify their layout, formatter or content.
  - The card takes no number from them.
  - FE3 adds no pick button to them (criterion 24).
  - FE3 must not edit those lines.
  - Moving them to cents is decided but comes after this slice (F13).

## 4. Scope of the thinnest slice

A "Rough trip cost" card on `/spots/:slug`, built from two picks:

- one **outbound fare** row from the Flights tab teaser (fare rows only: not schedule-only rows, not Getting there rows)
- one **stay** row from the Hotels tab

plus two steppers, **nights** and **travellers**. It shows the following:
- a headline figure on the fare basis
- an adjacent labelled all-in figure
- each line with its state
- a visible "Not in this total" list

All card amounts are shown to the cent. Picks are page-local state and are not persisted.

Two changes to existing surfaces on the same page, both outside L1092–1101:
1. The teaser row's secondary `honest` figure is realigned to the same all-in the card uses (7.4).
2. The teaser fare, teaser `honest` and stay per-night figures switch from whole units to cents, and the teaser row's date label switches to `formatShortDate`. The rows that feed the card then show the same figures and date the card does (7.5, 7.9).

## 5. Out of scope (follow-ups, in suggested order)

| # | Follow-up | Owner | Why not now |
|---|---|---|---|
| F1 | Return flight on the spot page (reverse `searchFlights` + a "Flight home" pick) | frontend | New picker UI. The card lists it as excluded meanwhile. **Next, per the user.** |
| F2 | Dated stay rates: optional `checkIn` / `checkOut` on `GET /api/hotels/curated`, echoed in the response | backend | Only useful once flights on this path are dated too (`GET /api/flights` ignores `date`). |
| F3 | Opt-in riding line: pick one `PriceLine` with non-null `perRiderAmount`, fresh (`observedAt` ≤ `FRESH_DAYS` = 180 in `spot-readiness.js`), plus any `ACCESS_BAND` | frontend | Needs a product decision on which tariff line a rider "buys". **Next, per the user.** |
| F4 | Persist picks, and feed the card from the flight cart when the cart's destination is the spot's airport | frontend | Cart is on `/hack-flights`, off the beta nav. |
| F5 | Converge `cartTotals`, `computeTotals` and this module on one totals core | frontend | Avoids three summing implementations drifting. Do it after this ships. |
| F6 | Remove or replace TripGuide `estimatePackage()` invented fallbacks. Audit `IslandHopService` `DEFAULT_NIGHTLY_EUR` on `/island-hop` | frontend / backend | Both are off the beta nav, but both break the honest-total rule. |
| F7 | `POST /api/trips/total` server-side total | backend | Only when a server-persisted trip exists. |
| F8 | FX conversion of non-EUR lines, and fixing the mixed-currency `auditedTotalCost` for non-EUR fares | frontend / backend | Fixed-rate GBP 1.17 is itself an open item. |
| F9 | Correct `AGENTS.md` open items L173 and L177 | lead | The lead has taken this. |
| F10 | Keep `FlightTeaser` mounted or lift its fetch to the page, so tab switches don't refetch | frontend | Stable pick ids make the slice correct without it. |
| F11 | Getting there "ways in" rows (L1092–1101) swap to fare first, all-in adjacent. **In progress in a separate session, not part of this spec.** Making those rows pickable remains a later, separate follow-up. | separate session | Owned elsewhere. |
| F12 | **Known rounding difference:** the flight cart (`FlightCart.tsx` via `euro()`) and the Trip Ledger show whole euros; this card and the rows that feed it show cents. The same fare can read `€50` in the cart and `€49.99` on the spot page. Decide whether the cart and ledger move to `formatCents()`; fold into F5. | frontend | The user chose cents for this card knowing the cart differs. The cart is off the beta nav, so the two aren't seen side by side in the beta. |
| F13 | **Decided (user, 2026-09-15): the Getting there rows show cents too.** Switch their fare and all-in figures to `formatCents()` so the whole spot page agrees. | frontend | Two prerequisites: this feature has landed (so `formatCents()` exists) **and** the F11 session's change to those rows is merged. Not part of this slice. |

Also out: first-mile / `doorToTripPrice`, the "small bag only" toggle, food,
gear hire, multiple rooms, booking handoff changes, telemetry events,
`SpotTariff` formatting (tariffs are not in the card).

## 6. User stories

1. As a rider on a spot page, I pick a fare and a place to stay and see one rough cost for the trip, so I don't have to add it up myself.
2. As a rider travelling with friends, I set how many of us are going and for how many nights, and the cost updates. I'm told the room rate doesn't scale with group size.
3. As a rider, I can see what the figure leaves out (flight home, airport-to-spot transfer, riding, food and gear), so I don't mistake it for the whole trip.
4. As a rider, when a piece can't be priced or isn't in euros, I see that it's missing and the figure is marked as a floor, instead of the piece being counted as zero or guessed.
5. As a rider, the fare and the all-in in this card match the figures on the row I picked, to the cent, with bags and extras shown alongside, not hidden inside.

## 7. Data contract (frontend-only TypeScript)

No HTTP contract changes. The backend endpoints consumed are unchanged:
`GET /api/spots/{slug}`, `GET /api/flights` (via `searchFlights`),
`GET /api/hotels/search/bbox`, `GET /api/hotels/curated`.

Line numbers in `src/SpotDetailPage.tsx` below are as of 2026-09-14 and may
shift when the F11 session lands. The element names are authoritative.

### 7.1 Module `src/services/tripTotal.ts`

```ts
/** Same vocabulary as flightCart's FareBasis, plus the non-price state. */
export type LineBasis =
  | 'exact'          // quoted for exactly this item, now (unused by the slice's adapters; kept for F4)
  | 'estimate'       // derived / cached / not for the traveller's dates
  | 'floor'          // cheapest on the route that day, may belong to another departure
  | 'manual-check';  // picked, but no usable price: amount null, not summed

export type TotalLineKind = 'outbound-flight' | 'stay';

export interface TotalComponent {
  /**
   * Stable pick identity, so a picked row is recognised after FlightTeaser
   * unmounts and refetches.
   * Flight: `${origin}|${destination}|${departureDate ?? ''}|${airline ?? ''}`
   * Stay:   NearbyStay.id
   */
  id: string;
  kind: TotalLineKind;
  /** See 7.9 "Flight label". Stay: NearbyStay.name. */
  label: string;
  /** Per traveller (flight) or per night for one room (stay). null = no usable price. */
  unitAmount: number | null;
  /** ISO 4217. Adapters never emit ''; combineTripTotal still reads '' as 'EUR' (7.3). */
  currency: string;
  basis: LineBasis;
  /** Flights only: all-in per traveller (see 7.4). null = extras unknown. */
  allInUnitAmount?: number | null;
  /** Flights only: antiCauchemar says a cost could not be validated. */
  manualCheck?: boolean;
  /** Caveat shown under the line. Flight: priceDisclaimer ?? null. Stay: null. */
  note?: string | null;
}

export interface TripTotalInput {
  outbound: TotalComponent | null;   // null = not chosen
  stay: TotalComponent | null;       // null = not chosen
  nights: number;                    // clamped, see 7.10
  travellers: number;                // clamped, see 7.10
  arrivalAirport: string;            // for the "Getting from NCE to the spot" exclusion
  hasTariff: boolean;                // detail.prices is non-null with ≥ 1 line
}

export type LineState = 'included' | 'not-chosen' | 'unpriced' | 'not-converted';

export interface TripTotalLine {
  kind: TotalLineKind;
  state: LineState;
  component: TotalComponent | null;
  quantity: number;                  // travellers (flight) or nights (stay), after clamping
  /** Math.round(unitAmount × 100) × quantity; null unless state === 'included'. */
  amountCents: number | null;
  /** Same for allInUnitAmount (falling back to unitAmount); null unless included. */
  allInCents: number | null;
}

export interface TripTotal {
  currency: 'EUR';
  /** Always two lines, fixed order: outbound-flight, stay. */
  lines: TripTotalLine[];
  /** Sum of included amountCents. null when no line is included. */
  totalCents: number | null;
  /** Sum of included allInCents. null when no line is included. */
  allInCents: number | null;
  /** '≈ ' or 'from ' — never '' in this slice (nothing here is paid/exact). */
  prefix: '≈ ' | 'from ';
  allInPrefix: '≈ ' | 'from ';
  /** Always present, in this order. */
  excluded: string[];
  /** Clamped values actually used — the card renders these. */
  nights: number;
  travellers: number;
}

export function combineTripTotal(input: TripTotalInput): TripTotal;

/** Adapters — the only place source shapes are read. */
export function outboundFromFlight(flight: FlightAvailable): TotalComponent;
export function stayFromNearby(stay: NearbyStay): TotalComponent;
export function flightPickId(flight: FlightAvailable): string;   // same formula as TotalComponent.id
```

### 7.2 Line states (evaluated top-down; first match wins)

| # | Condition | `state` | Summed in headline / all-in? |
|---|---|---|---|
| 1 | component is `null` | `not-chosen` | no / no |
| 2 | `unitAmount` null, non-finite or ≤ 0, or `basis === 'manual-check'` | `unpriced` | no / no |
| 3 | `(currency \|\| 'EUR').toUpperCase() !== 'EUR'` | `not-converted` | no / no |
| 4 | otherwise | `included` | yes / yes |

Precedence is intended. A non-EUR component with no amount is `unpriced`,
because there's no amount to show in its own currency.

### 7.3 Currency

- Card currency is **EUR** only. There's no FX in this slice.
- **Flight currency** is `flight.currency || 'EUR'`. This is the field the teaser row already formats with (teaser fare, L624). `antiCauchemar.currency` is not read.
- **Stay currency** is `stay.priceCurrency || 'EUR'`. This is the field the stay row already formats with (stay per-night, L1250).
- A missing or empty currency is read as EUR, both in the adapters and inside `combineTripTotal` for a hand-built component with `currency: ''`. `backend` confirmed it in review: Xotelo is requested with `currency=EUR` and `mapRates` defaults `EUR` (`XoteloRateService.java` L221, L246); `RyanairService` defaults `currencyCode` to EUR (L170).
- A non-EUR line is excluded from **both** `totalCents` and `allInCents`. It's shown in its own currency with the note in 7.9.

### 7.4 Price hierarchy per line

- **Headline basis = fare** (confirmed by the user). `outbound.unitAmount` is `FlightAvailable.price` parsed to a number. This follows the Route Hacker exception (`AGENTS.md`, 2026-09-05) and matches `amountOf()` in `flightCart.ts` and the fare shown large on the teaser row. The headline label names its basis ("Flight out + stay"). It is never a bare "Total".
- **All-in basis.**
  - `outbound.allInUnitAmount` is `getAntiCauchemarPricingSummary(price, antiCauchemar).estimatedEntryPrice`. That means `auditedTotalCost` first, then a fare + shuttle + bag recompute. If that is undefined, it is `null`.
  - With the current backend, `auditedTotalCost` is always present when `antiCauchemar` is, so the recompute branch is defensive.
  - `doorToTripPrice` is **never** used, not even when present.
  - For the stay, all-in equals the stay amount.
- **Teaser row alignment (FE3).** The teaser fare row's secondary `honest {amount}` figure (in `FlightTeaser`, L610, L625–628) changes from `realWorldEntryPrice` to the same `estimatedEntryPrice`. The row and the card therefore never show different all-in figures for one flight. This also puts the row on `AGENTS.md` priority 1. The existing rule of showing it only when it differs from the fare stays, compared in rounded cents.
- If a flight's `allInUnitAmount` is null, that line's `allInCents` falls back to its `amountCents`, and `allInPrefix` becomes `'from '`.
- `outbound.manualCheck` is `summary.hasManualCheckRequired`. When true, `allInPrefix` is `'from '` and the flight line shows the manual-check badge. The backend leaves unvalidated shuttle and late-arrival costs out of `auditedTotalCost` in that case, so `from` is the honest prefix.
- `outboundFromFlight` sets `basis: 'estimate'` (cached feed) and `note: flight.priceDisclaimer ?? null`. The backend sets `priceDisclaimer` only when `priceLabel` is `Estimated (Cached)`, i.e. the row is older than 12 h; that threshold stays in the backend.
- `stayFromNearby` sets `basis: 'estimate'` when `pricePerNight` is a positive finite number, else `'manual-check'` with `unitAmount: null`.

### 7.5 Rounding and formatting — cents (user decision)

**Arithmetic (unchanged from rev 3):**
- Per line: `amountCents = Math.round(unitAmount * 100) * quantity`, integers from there on.
- Totals are integer sums of line cents. There's no float accumulation.

**Formatter.** Add to `src/services/flightFormat.ts`, next to `euro()`:

```ts
/** Integer cents → "€549.65". Two decimals always, en-IE grouping. */
export const formatCents = (cents: number, currency: string): string => {
  const code = (currency || 'EUR').toUpperCase();
  const value = Math.round(cents) / 100;
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Malformed code (Intl throws RangeError): never drop the amount.
    return `${value.toFixed(2)} ${code}`;
  }
};
```

This replaces the rev 3 `money()` helper, which is dropped. **Not changed:** `euro()`, `FlightCart.tsx`, and `SpotDetailPage`'s `formatPrice` (L200), which the Getting there rows still use until F13.

Note for tests: for currencies without a symbol, `Intl` separates the code and the amount with a non-breaking space (U+00A0), e.g. `CHF 150.00`, and USD renders `US$20.80`. Criteria 18 and 34 use EUR and GBP only. Any extra non-EUR assertion must match `\s` or normalise U+00A0.

**Where `formatCents` is used (all cents, same two-decimal rule, EUR or not):**

| Surface | Call |
|---|---|
| Card headline | `formatCents(totalCents, 'EUR')` |
| Card all-in | `formatCents(allInCents, 'EUR')` |
| Each included card line | `formatCents(amountCents, 'EUR')` |
| Not-converted card line | `formatCents(Math.round(unitAmount * 100), currency)`. This is the **unit** amount (per traveller or per night), not unit × quantity, because the quantity is shown beside it. |
| Teaser fare (`FlightTeaser`, `.sdp-flight__price`, L624) | `formatCents(Math.round(price * 100), flight.currency ?? 'EUR')` |
| Teaser `honest` (`FlightTeaser`, `.sdp-flight__honest`, L627) | `formatCents(Math.round(estimatedEntryPrice * 100), flight.currency ?? 'EUR')` |
| Stay per-night (Hotels tab, `.spot-detail__fare-price`, L1250) | `formatCents(Math.round(stay.pricePerNight * 100), stay.priceCurrency ?? 'EUR')` |

These three page call sites stop calling `formatPrice`. The Getting there call sites (L1096, L1099) are **not** touched by this slice. Moving them to cents is F13, after F11 merges.

**Displayed lines sum exactly.** Every displayed card amount is an integer number of cents shown at full cent precision. Nothing is rounded at display. So the included line amounts on the card always add up exactly to the displayed headline. The rev 3 "±€1 per line" caveat is gone.

**Row vs card: cents on the rows that feed the card.** The alternative was to define criterion 27 on the underlying number and accept a visible `€50` on the row next to `€49.99` in the card. It was rejected for three reasons:
1. A traveller who picks a row and sees a different figure in the card has no way to tell rounding from a different price. That is exactly the doubt the honest total exists to remove, and the same reason rev 2 aligned the `honest` figure.
2. Changing only the *picked* row would make a row's format change on click, so all teaser fare rows and all stay rows change, picked or not. The Getting there rows follow in F13 (decided by the user), once the F11 session's change to them is merged.
3. It's cheap and breaks nothing checked. It's three call sites. No existing unit test or Cypress spec asserts a whole-euro string on the spot page: no `€\d` matches in `src/SpotDetailPage*.test.tsx`, `cypress/e2e/spots*.cy.ts` or `cypress/fixtures/*.json` (checked 2026-09-14; frontend re-checked in its rev 4 review).

`SpotTariff`'s own formatter is not touched.

### 7.6 Prefixes

- `prefix = 'from '` if any line's state is not `included`. Otherwise `'≈ '`.
- `allInPrefix = 'from '` if `prefix === 'from '`, **or** the included flight's `allInUnitAmount` is null, **or** its `manualCheck` is true. Otherwise `'≈ '`.

### 7.7 Excluded list (always rendered once any pick exists, in this order)

1. `Flight home`
2. `Getting from {arrivalAirport} to the spot`
3. `Riding (see the tariff above)` when `hasTariff`, else `Riding (no tariff on file yet)`
4. `Food and gear hire`

When the spot has no arrival airport, the page passes `the airport` as `arrivalAirport`, so item 2 reads `Getting from the airport to the spot` (rev 4.2).

### 7.8 Component and page props

`src/components/TripTotalCard.tsx`:

```ts
export interface TripTotalCardProps {
  total: TripTotal;
  onNightsChange: (nights: number) => void;
  onTravellersChange: (travellers: number) => void;
  onRemove: (kind: TotalLineKind) => void;
}
```

Presentational only. All arithmetic comes from `combineTripTotal`. Nights and travellers are read from `total.nights` / `total.travellers`.

`FlightTeaser` (in `src/SpotDetailPage.tsx`) gains two props:

```ts
pickedFlightId: string | null;
onPickFlight: (flight: FlightAvailable) => void;   // page toggles: same id → un-pick, else replace
```

The stay list receives `pickedStayId: string | null` and `onPickStay(stay: NearbyStay)` with the same toggle semantics.

Page state lives in `SpotDetailPage`, not in `FlightTeaser`:
- `outbound: TotalComponent | null`
- `stay: TotalComponent | null`
- `nights` (default 2)
- `travellers` (default 1)

The card is rendered only when the spot resolved; a not-found spot renders no card.

As built (rev 4.2):
- The card is also gated on the spot having coordinates, the same gate as the tabs. Without coordinates there is nothing on the page to pick from.
- Picks, nights and travellers reset to their defaults when the slug changes, so a stay picked for one spot never appears on another.

### 7.9 Fixed copy and controls (tests match these strings)

**Card structure and states**

| Element | Text / structure |
|---|---|
| Card landmark | `<section>` labelled by its heading, so `getByRole('region', { name: 'Rough trip cost' })` finds it |
| Card heading | `Rough trip cost` |
| Empty state (no picks) | Only the heading and `Pick a flight and a place to stay to see a rough trip cost.` |
| Picks exist, none included | `Nothing picked has a price yet.` is shown in place of both figure rows; no `€` figure and no prefix are rendered; lines, steppers and the excluded list still render |
| Headline row | label `Flight out + stay` and figure `{prefix}{formatCents(totalCents, 'EUR')}` are children of **one row element**, so `within(getByText('Flight out + stay').parentElement!)` finds the figure |
| All-in row | label `With bags and airport extras` and figure `{allInPrefix}{formatCents(allInCents, 'EUR')}` in one row element, the same way |
| Flight all-in unknown | `Bags and airport extras not known for this flight.` |
| Manual-check badge | `Manual check` |
| Line kind heading (rev 4.2) | `Flight out` on the flight line and `Stay` on the stay line, whether chosen or not |
| Excluded heading | `Not in this total`, followed by a plain `<ul>` of the 7.7 items; not inside `<details>` or any collapsed disclosure |

**Line text**

| Element | Text |
|---|---|
| Line amount | `formatCents(amountCents, 'EUR')` on each included line |
| Flight label | `{airline} {origin} → {destination} · {date}`, with missing parts dropped: e.g. `Ryanair DUB → NCE · Sat 3 Oct`; with no airline and no (or an unparseable) date, `DUB → NCE`. `date` is `formatShortDate(departureDate)`, specified below. **Do not use `toLocaleDateString`**, which gives `Sat, 3 Oct` on Node 25 and varies by ICU build. |
| Teaser row date (`FlightTeaser`, `.sdp-flight__date`, L611–613) | Also switches from `toLocaleDateString` to `formatShortDate(flight.departureDate)`, so the picked row and the card show the same date text (`Sat 3 Oct`). Rendered only when non-null, as today. FE3 edits this row anyway; it is outside L1092–1101. |
| Flight note | `component.note` (the `priceDisclaimer`) as text under the flight line; nothing when null |
| Flight quantity | `× 1 traveller` / `× {n} travellers` (n ≥ 2) |
| Stay quantity | `× 1 night, 1 room` / `× {n} nights, 1 room` (n ≥ 2) |
| Stay group-size note | `Price may vary for group size: the rate is for one room, not per person.` |
| Stay dates note | `Sample rate for one night about six weeks out, not your dates.` |
| Not chosen | `Not chosen yet` |
| Unpriced stay | `No live rate. Check the rate before booking.` |
| Unpriced flight (rev 4.2) | `No usable fare. Check the fare before booking.` No amount is shown. |
| Not converted | `{formatCents(Math.round(unitAmount * 100), currency)} · In {CUR}, not converted, not in this total` |

`formatShortDate`, added to `src/services/flightFormat.ts` next to `formatLocalClock` and built the same way (local getters, no `Intl`), so the output is identical in Node and every browser:

```ts
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ISO → "Sat 3 Oct" in local time; null when missing or unparseable. */
export const formatShortDate = (iso?: string | null): string | null => {
  if (!iso) return null;
  // A bare YYYY-MM-DD is a calendar date, not UTC midnight: read it as local,
  // or anywhere west of UTC would show the previous day.
  const dateOnly = DATE_ONLY.exec(iso);
  const when = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(Date.parse(iso));
  if (!Number.isFinite(when.getTime())) return null;
  return `${SHORT_WEEKDAYS[when.getDay()]} ${when.getDate()} ${SHORT_MONTHS[when.getMonth()]}`;
};
```

The exact implementation is frontend's. The behaviour above (local getters, the bare-date guard, `null` on failure) is the contract.

**Controls**

| Element | Text / behaviour |
|---|---|
| Nights stepper | `role="group"` named `Nights`. Buttons `One fewer night` / `One more night`. The current value is an `<output>` (role `status`) whose text is the bare number, e.g. `2`. |
| Travellers stepper | `role="group"` named `Travellers`. Buttons `One fewer traveller` / `One more traveller`. Value in an `<output>` the same way. |
| Stepper bounds | the decrement button is `disabled` at 1; the increment button is `disabled` at the max (14 nights / 9 travellers) |
| Remove buttons | `Remove flight from trip cost` / `Remove stay from trip cost`, shown only on a chosen line |
| Pick button | `Add to trip cost` with `aria-pressed="false"`. Once picked it reads `In trip cost` with `aria-pressed="true"`. Pressing a pressed button removes that pick, same as the remove button. |

All copy must pass `src/copyStandards.test.ts`.

### 7.10 Clamping

`clamp(value, max)`:
- non-number, `NaN` or non-finite → `1`
- otherwise `Math.round(value)` (so `2.5 → 3`), then bounded to `1..max`

Nights max = 14, travellers max = 9.

## 8. Acceptance criteria

Worked vector **V1**, used below:
- flight `origin DUB`, `destination NCE`, `airline Ryanair`, `departureDate 2026-10-03T07:00:00` (no offset, so parsed as local time and a Saturday in every time zone), fare `49.99` `EUR`, `antiCauchemar.auditedTotalCost` `74.99`, no `priceDisclaimer`, travellers `2`
- stay `id "g1-d2"`, `149.89` `EUR`/night, nights `3`, spot has a tariff, arrival airport `NCE`

| V1 figure | Cents | Displayed |
|---|---|---|
| Flight line (49.99 × 2) | 9998 | `€99.98` |
| Stay line (149.89 × 3) | 44967 | `€449.67` |
| Headline (9998 + 44967) | 54965 | `≈ €549.65` |
| All-in (14998 + 44967) | 59965 | `≈ €599.65` |
| Teaser row fare / honest | — | `€49.99` / `honest €74.99` |
| Stay row per night | — | `€149.89` |

Vector **V2** (sum check): fare `10.40` × 1 traveller, stay `10.40` × 1 night → lines `€10.40` + `€10.40`, headline `≈ €20.80` (2080 cents).

### Pure function (`combineTripTotal`, adapters, formatters) — T1

1. With V1, `totalCents === 54965`, `allInCents === 59965`, `prefix === '≈ '`, `allInPrefix === '≈ '`, and both lines are `included`.
2. With `outbound: null` or `stay: null`, that line is `not-chosen`, it's absent from `totalCents` and `allInCents`, and `prefix === 'from '`. With both null, `totalCents === null` and `allInCents === null`.
3. A stay whose `pricePerNight` is `null`, `0`, negative or `NaN` gives `basis: 'manual-check'` from `stayFromNearby`, line state `unpriced`, `amountCents === null`, and `prefix === 'from '`. No default nightly amount is ever substituted.
4. Currency handling:
   - A component with `currency: 'GBP'` (or `'CHF'`) and a positive amount is `not-converted`. It's absent from both `totalCents` and `allInCents`, and sets `prefix === 'from '`.
   - Via the adapters, `flight.currency` undefined and `stay.priceCurrency` undefined each give `currency === 'EUR'`, and the line is summed.
   - A hand-built component with `currency: ''` is summed as EUR by `combineTripTotal`.
   - `outboundFromFlight` takes currency from `flight.currency`, not from `antiCauchemar.currency`.
5. Headline basis is the fare. With V1, the flight line's `amountCents === 9998`, not 14998. `allInCents` uses `auditedTotalCost`.
6. All-in precedence. With no `auditedTotalCost` but `ticketPrice 49.99`, `cabinBagEstimate 24`, `airportShuttleEstimate 5`, the flight all-in unit is `78.99`. With `doorToTripPrice: 999` and `auditedTotalCost: 74.99`, the all-in unit is `74.99` (door-to-trip never used).
7. With no `antiCauchemar`, the flight's `allInUnitAmount` is `null`, its `allInCents` equals its `amountCents`, and `allInPrefix === 'from '` while `prefix` stays `'≈ '` (when the stay is included).
8. With `antiCauchemar.manualCheckRequired: true`, or `priceBreakdown.shuttleFee.status === 'MANUAL_CHECK_REQUIRED'`, `outboundFromFlight` sets `manualCheck: true` and `allInPrefix === 'from '`.
9. Integer-cent arithmetic.
   - V2 gives `totalCents === 2080`.
   - Fare `0.10` × 1 plus stay `0.20` × 1 gives `totalCents === 30`, not a float like 30.000000000000004.
10. `nights` is clamped to 1..14 and `travellers` to 1..9 per 7.10, and `TripTotal.nights` / `.travellers` return the clamped values:
    - `0` → `1`
    - `20` → `14` nights / `9` travellers
    - `2.5` → `3`
    - `2.6` → `3`
    - `NaN` → `1`
    - `Infinity` → `1`
11. `excluded` always equals the four strings in 7.7, in order, with `{arrivalAirport}` substituted and the riding text chosen by `hasTariff`.
12. `FlightAvailable.price` given as the string `"49.99"` is parsed to `49.99`. An unparseable string gives `unitAmount: null`, so the line is `unpriced`.
13. Adapters, label and precedence:
    - `outboundFromFlight(V1 flight).id === 'DUB|NCE|2026-10-03T07:00:00|Ryanair'` and equals `flightPickId(V1 flight)`. `stayFromNearby(stay).id === stay.id`.
    - The V1 flight label is exactly `Ryanair DUB → NCE · Sat 3 Oct` (no comma).
    - With `airline` and `departureDate` absent, the label is `DUB → NCE`. With `departureDate: 'not a date'` and no airline, it is also `DUB → NCE`.
    - `formatShortDate`:
      - `formatShortDate('2026-10-03T07:00:00') === 'Sat 3 Oct'`
      - `formatShortDate('2026-10-03') === 'Sat 3 Oct'` (bare date read as local)
      - `formatShortDate(null) === null` and `formatShortDate('not a date') === null`
    - `outboundFromFlight` sets `note` to `priceDisclaimer` when present, else `null`.
    - A component with `currency: 'GBP'` and `unitAmount: null` is `unpriced`, not `not-converted`.

### Card (`TripTotalCard`) — T2

14. With no picks, a region named `Rough trip cost` shows the empty-state text and nothing else: no `€` figure, no lines, no excluded list.
15. V1 figures and structure:
    - The headline row contains both `Flight out + stay` and `≈ €549.65`.
    - The all-in row contains both `With bags and airport extras` and `≈ €599.65`.
    - The flight line shows `€99.98` and the stay line shows `€449.67`.
    - The `Not in this total` heading is followed by the four 7.7 items, with no `<details>` element in the card.
16. Amounts are shown to the cent via `formatCents`.
    - With V2, the lines read `€10.40` and `€10.40` and the headline reads `≈ €20.80`.
    - For both V1 and V2, the displayed included line amounts, parsed back to cents, add up exactly to the displayed headline.
17. The quantity text follows the plural forms in 7.9. V1 shows `× 2 travellers` and `× 3 nights, 1 room`; with 1 and 1 it shows `× 1 traveller` and `× 1 night, 1 room`. Whenever a stay is picked, priced or not, the stay line shows both the group-size note and the dates note.
18. Line states on the card:
    - An `unpriced` stay line shows `No live rate. Check the rate before booking.` and no amount.
    - A `not-converted` stay at unit `150` `GBP` with 3 nights shows `£150.00 · In GBP, not converted, not in this total` (the unit amount, not £450.00).
    - A flight with `manualCheck` shows the `Manual check` badge.
19. When picks exist but no line is included (e.g. only an unpriced stay), the card shows `Nothing picked has a price yet.`. It renders no `€` figure and no `≈ ` / `from ` prefix, while the stay line, both steppers and the excluded list still render.
20. A flight whose `note` is `"Estimated (Cached) …"` shows that text under the flight line. A V1 flight (no `priceDisclaimer`) shows no note under the flight line.
21. When the flight all-in is unknown, the card shows `Bags and airport extras not known for this flight.` and the all-in figure starts with `from`.
22. Steppers:
    - `getByRole('group', { name: 'Nights' })` and `{ name: 'Travellers' }` each contain their two named buttons from 7.9 and a `status` whose text equals `total.nights` / `total.travellers`.
    - Clicking a button calls the handler with the value ±1.
    - The decrement button is disabled at 1 and the increment button is disabled at 14 nights / 9 travellers.
23. A chosen line has its `Remove … from trip cost` button, which calls `onRemove` with that kind. A not-chosen line shows `Not chosen yet` and no remove button.

### Spot page wiring (`/spots/:slug`) — T3

24. Where the pick button appears:
    - Each fare row in the Flights tab teaser (the `fares` state) has an `Add to trip cost` button.
    - Schedule-only rows (the `schedule` state, reached when `GET /api/flights` returns no fares and `GET /api/trips/hacker-routes` returns itineraries) have none.
    - No row in the Getting there tab has one. This asserts only that the button is absent. It makes no assertion about those rows' layout or amounts, which F11 owns.
25. Every stay row in the Hotels tab, including rows showing `no live rate`, has an `Add to trip cost` button.
26. Pick buttons:
    - Picking a second fare or a second stay replaces the first (one per kind).
    - The picked row's button reads `In trip cost` with `aria-pressed="true"`, and every other row's reads `Add to trip cost` with `aria-pressed="false"`.
    - Pressing `In trip cost` removes the pick, and the card line returns to `Not chosen yet`.
27. Rows and card show the same figures to the cent.
    - With V1 picked, the Flights tab teaser row shows `€49.99` and `honest €74.99`; the `honest` figure is `estimatedEntryPrice`, the same all-in the card uses.
    - The Hotels row shows `€149.89` per night.
    - Setting travellers to `1` and nights to `1` makes the card's flight line read exactly `€49.99` and its stay line exactly `€149.89`, the same text as the rows.
28. Picks survive tab switches:
    - Pick a fare in the Flights tab, switch to Hotels, pick a stay, then switch back to Flights (which refetches).
    - The same fare row still reads `In trip cost`, matched by `flightPickId`.
    - The card, showing `≈ €549.65`, is visible on the Getting there, Hotels, Restaurants and Flights tabs.
29. Picks, nights and travellers aren't persisted. After a reload the card shows the empty state. After picking V1 again, the `Nights` status reads `2` and the `Travellers` status reads `1`.
30. Each of these actions sends **no request to `/api/**` or `/actuator/**`**: `Add to trip cost`, `In trip cost` (un-pick), `One more night`, `One fewer night`, `One more traveller`, `One fewer traveller`, `Remove flight from trip cost`, `Remove stay from trip cost`.
    - Measured as the count of intercepted `/api/**` and `/actuator/**` requests immediately before and after each action, with no tab switch in between.
    - Refetches caused by tab switches are existing behaviour and are not measured.
    - Map tile, style and other non-API fetches (MapLibre `DetailMap` redrawing after a layout shift) are out of scope for this check.
31. At viewports 400×800 and 1280×800, with V1 picked:
    - all four excluded items are rendered and visible when scrolled into view, not inside a collapsed disclosure
    - neither the card nor any descendant scrolls internally (no element with computed `overflow` `auto`/`scroll` and `scrollHeight > clientHeight`)
    - the page has no horizontal overflow (`document.documentElement.scrollWidth ≤` viewport width)
    - Scrolling the page itself is allowed.
32. A slug that isn't in `GET /api/destinations/spots?activity=wakeboarding` renders the existing not-found state and no `Rough trip cost` region.
33. `npm run lint`, `npm run typecheck`, `npm test` (including `src/copyStandards.test.ts` and the existing `FlightCart` tests, unchanged) and `npm run build` pass. Checked in V1, not a T-task.

### Added in rev 4

34. (T1) `formatCents`:

    | Call | Result |
    |---|---|
    | `formatCents(54965, 'EUR')` | `€549.65` |
    | `formatCents(2080, 'eur')` | `€20.80` |
    | `formatCents(123456, 'EUR')` | `€1,234.56` |
    | `formatCents(15000, 'GBP')` | `£150.00` |
    | `formatCents(2080, 'EURO')` | `20.80 EURO` (fallback, no throw) |
    | `formatCents(2080, '')` | `€20.80` |

    `euro(49.99)` still returns `€50` (cart formatter unchanged).

35. *Withdrawn (2026-09-15).* It tested cents on the Getting there rows, which belong to the F11 session and follow-up F13. The number is kept so 1–34 stay stable.

## 9. Task split

Contract = sections 7.1–7.10. **Review closed 2026-09-15; the lead has created the build tasks below.**

**Build branch: `feat/combined-trip-total`.**

| ID | Task | Owner | Depends on | Criteria |
|---|---|---|---|---|
| R1 | Contract review. **Agreed; rev 4.x changes nothing in its area.** | backend | — | 4, 6, 8 |
| FE1 | `src/services/tripTotal.ts`: types, `combineTripTotal`, `outboundFromFlight`, `stayFromNearby`, `flightPickId`. `formatCents()` and `formatShortDate()` (with the bare `YYYY-MM-DD` local guard) in `src/services/flightFormat.ts`; `euro()` untouched. | frontend | review closed | 1–13, 34 |
| FE2 | `src/components/TripTotalCard.tsx` (+ CSS on existing `--color-*` / `--truth-*` tokens) | frontend | contract (7.1, 7.5, 7.8, 7.9) | 14–23, 31 |
| FE3 | Wire into `src/SpotDetailPage.tsx`: <br>• page-level pick state (7.8) <br>• pick props on `FlightTeaser` and stay rows <br>• teaser `honest` figure moved to `estimatedEntryPrice` <br>• teaser fare, teaser `honest` and stay per-night moved onto `formatCents` <br>• teaser row date label (L611–613) moved onto `formatShortDate` <br>• card rendered outside the tab panels, and only for a resolved spot <br>**Do not edit the Getting there rows (L1092–1101) or `formatPrice`.** A separate session is changing those rows (F11), so expect a merge in the same file and rebase onto it. | frontend | FE1, FE2 | 24–32 |
| T1 | `src/services/tripTotal.test.ts` for criteria 1–13; `formatCents` and `formatShortDate` cases (including `formatShortDate('2026-10-03') === 'Sat 3 Oct'`) in the existing `src/services/flightFormat.test.ts` | sdet | contract | 1–13, 34 |
| T2 | `src/components/TripTotalCard.test.tsx`: criteria 14–23 with hand-built `TripTotal` fixtures | sdet | contract | 14–23 |
| T3 | `cypress/e2e/spot-trip-total.cy.ts`, built on the catch-all intercept in `cypress/support/commands.ts`. Fixtures reproduce V1. Mocks: <br>• `GET /api/destinations/spots?activity=wakeboarding` (spot resolution) <br>• `GET /api/spots/{slug}` <br>• `GET /api/spots/{slug}/arrival` <br>• `GET /api/flights` <br>• `GET /api/trips/hacker-routes` (schedule state for 24) <br>• `GET /api/hotels/search/bbox` <br>• `GET /api/hotels/curated` <br>• anything else the page requests (e.g. `/api/spots/{slug}/pois`) <br>Assert nothing about Getting there row content beyond the absent button in 24. | sdet | contract; runs green only after FE3 | 24–32 |
| V1 | Verify: run T1–T3 plus the gates against the real work, report per criterion | sdet | FE1–FE3, T1–T3 | 1–34 |
| A1 | Acceptance check per criterion, citing file/test. **Accepted, 34/34 (2026-09-15).** | pm | V1 | all |

Backend has **no build task** in this slice. F2, F7 and part of F8 are its follow-ups.

## 10. Decisions (closed)

Answered by the user on 2026-09-14 and 2026-09-15, relayed by the lead.

1. **Headline basis — closed: fare + stay leads, all-in adjacent.** As written in 7.4. The Getting there rows are moving to the same fare-first order in a separate session (F11).
2. **Exclusions — closed: return flight and riding stay excluded** and listed under "Not in this total". F1 and F3 are next.
3. **Rounding — closed: cents.** The card shows two decimals (`≈ €549.65` / `≈ €599.65` for V1), and the rows that feed it (teaser fare, teaser `honest`, stay per-night) move to cents with it (7.5). The user chose this knowing the flight cart shows whole euros; that difference is F12.
4. **`AGENTS.md` L173 and L177 — closed: the lead owns the correction (F9).**
5. **Getting there rows in cents (F13) — closed (2026-09-15): yes.** Frontend switches their fare and all-in to `formatCents()` after this feature lands and the F11 session's change is merged. Not part of this slice. Criterion 24, FE3's "do not edit L1092–1101" instruction and the task split are unchanged.

No open questions remain for the user or the lead in this slice.

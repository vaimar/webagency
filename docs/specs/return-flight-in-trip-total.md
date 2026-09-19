# Return flight in trip total — spec

Status: **draft** (rev 4, 2026-09-19). Reviewers:
- `backend`: **R1 reviewed rev 2** — buildable with 6 changes. All 6 accepted
  and applied in rev 3; 3 further non-blocking flags also applied. Needs a
  re-confirm on rev 3, not a fresh review round.
- `frontend`, `sdet`: not yet sent.

**Rev 4 opens no review round.** It corrects statements about behaviour that
already exists, and the one scope line it moves (the Postman collection into
BE2) is coverage criterion 42's own cited invariant already required. `sdet`
must re-read criteria **34**, **35**, **42** and **52** before finishing T4;
nothing in T0–T3, FE1–FE3 or BE1 changes.

Owner: `pm`

Source: combined-trip-total follow-up F1, marked "Next, per the user"
(2026-09-15). Depends on: combined-trip-total (accepted 2026-09-15, 34/34).

## Revision log

- **rev 1** (2026-09-19): first draft, 32 criteria, scoped **frontend-only**.
- **rev 2** (2026-09-19): **rev 1's core premise was wrong. F1 is not
  frontend-only.** Rev 1 claimed at §5 that "the backend already computes this
  correctly per direction. No frontend interpretation needed." Verified against
  `AntiCauchemarService.buildAnalysis` (slumber, L198–229) and it does not hold.
  Two defects make summing two legs' `auditedTotalCost` wrong, and one is a
  standing product question. **User decision: fix it in the backend**, not by
  narrowing the frontend sum to `price + cabinBagEstimate`.
  - New §3.1 records the three defects with the measured figures.
  - New §7.11–7.14: the `leg` request contract, the return-leg rules, the
    response shape, and the undated-fare limit.
  - New backend task **BE1** and doc task **BE2** in §9. FE3 now depends on BE1.
  - V1 and V2's **all-in** figures re-derived (criteria 1, 3, 11). Headline
    figures unchanged. New backend vectors **V3** and **V4**.
  - Criteria **33–42** added for backend behaviour; **43–44** added for the
    date-coherence guard the undated feed forces.
  - Two factual errors from rev 1 corrected: the `FRESH_DAYS` file path, and
    the claim that F3's freshness gate is exercisable against real data.
  - 32 → 44 criteria.
- **rev 3** (2026-09-19): contract review. `backend` and `frontend` both
  objected; `sdet` agreed with one prerequisite and one approved scope
  addition. **All objections accepted.** No review round reopens — every change
  below is a reviewer's own ask.
  - **Sort own-goal fixed (backend blocker 1).** Rev 2's §7.12 set
    `manualCheckRequired = true` on late returns, which `RyanairService`
    L301–303 sorts LAST. §7.12 now **decouples display from ranking**: the
    top-level flag stays `false` on `leg=RETURN`, and the caveat rides on the
    existing `lateArrivalMarkup` CostLine status instead. Decision and the
    rejected alternatives in §7.12.1. New criterion **46**.
  - **Breakdown lines buildable (backend blocker 2).** `PriceBreakdown` is a
    fixed-field DTO and `CostLine` has no label. §7.13 now reuses the existing
    `shuttleFee` and `lateArrivalMarkup` slots. **No DTO shape change.**
  - **`departureDate` added to `TotalComponent` (frontend blocker 3).**
    Criteria 43–44 were unbuildable: `flightLabel` (`tripTotal.ts` L133–139)
    formats to `Sat 3 Oct` and discards the year, so no card-level date compare
    was possible. §7.1 and §7.2 now carry the raw ISO date.
  - **`leg` is a `@Pattern` String, not an enum** (backend 1), so criterion 34's
    `VALIDATION_ERROR` shape is the one actually produced. §7.11.
  - **Four "arrival is home" gaps closed** (backend 2): `manualCheckRequired`,
    the BCN `localAccessOverride` carve-out, the three half-zeroed travel-time
    /confidence fields, and `theCatch` / `logisticVerdict`. §7.12 table. New
    criteria **45**, **47**, **48**, **49**.
  - **`legRole` nullability decided** (backend 3): nullable at the model level,
    non-null only on `/api/flights`. Criterion 39 and the TS type now agree.
    Criterion 33's "byte-identical" is corrected — `legRole` is additive.
  - **sdet prerequisite:** T1/T2 must convert positional `lines[0]` / `lines[1]`
    assertions to a `lineByKind()` lookup **before** any return-line test.
  - **sdet scope addition (approved):** `data-testid` on the three card lines
    and the return fare rows, folded into FE1–FE3. §7.7, §7.8, criterion 50.
  - New follow-ups **F17** (away-airport shuttle billed once though ridden both
    ways) and **F18** (`cy.wait(750)`), both explicitly out of this slice.
  - 44 → 51 criteria.
- **rev 4** (2026-09-19): **amendment, not a review round.** Corrections to
  things reviewers already agreed; no new scope and no reopened contract.
  - **Criterion 34 was factually wrong and is corrected.** Rev 3's §7.11 claimed
    a bad `leg` yields code `VALIDATION_ERROR` with per-field `details`, "the
    shape `origin` and `destination` already produce on this controller". They
    do not, and never have. Measured live against the dev backend on `:9090`:
    `400` with code `BAD_REQUEST`, message
    `getFlights.leg: leg must be OUTBOUND or RETURN`, and **no `details` key**.
    Cause confirmed in source: the class-level `@Validated` on
    `RyanairController` L27 proxies the controller, so a violated
    `@Pattern` on a query param throws `ConstraintViolationException`, which
    `GlobalExceptionHandler` L65–68 maps to `BAD_REQUEST` with `Map.of()`.
    `HandlerMethodValidationException` (L49–62, the `VALIDATION_ERROR` branch)
    is never reached on this path. §7.11 rewritten, criterion 34 restated.
    **The spec is amended, not the app** — reasoning in §7.11.1.
  - Rev 3's other backend-R1 ask stands unchanged and was right: `leg` is a
    `@Pattern` String, not a Java enum. Only the error *code* asserted
    alongside it was wrong.
  - **`manualCheckReasons` on a return leg — decided** (§7.12.2). Rev 3 was
    silent; backend's judgement call is **confirmed**. New criterion **52**.
  - **BE2 gains `docs/slumber-api.postman_collection.json`** (criterion 42).
    The slumber `AGENTS.md` invariant 6 that criterion 42 already cites names
    all three files, so this is coverage the criterion always implied.
  - New follow-up **F19**: `docs/openapi-lite.yaml` does not parse as YAML on
    `HEAD` and did not before this feature. Cause recorded so nobody
    re-diagnoses it.
  - **Three rev 2 leftovers that contradicted rev 3's own decisions**, found
    while amending and corrected so T4 cannot assert the overturned value:
    §7.12's `lateArrivalMarkup` paragraph and the **V4 vector** both still said
    `manualCheckRequired` is `true` (§7.12.1 made it `false`; criterion 38 was
    already right), and **criterion 35** named a line *label*
    (`Arrival transfer (home airport)`) that `CostLine` cannot carry (rev 3
    reused the `shuttleFee` slot). No behaviour changes — the built code already
    matches the corrected text.
  - 51 → 52 criteria.

---

## 1. Problem

The Rough trip cost card on `/spots/:slug` excludes the flight home. "Flight
home" is the first item in the "Not in this total" list, forcing a rider to
double the outbound fare in their head. The outbound flight is typically the
biggest line in the total; a return fare of roughly the same size means the
card is off by nearly half the travel cost.

## 2. Who it's for

Same as the base feature: a rider on a spot page from Dublin, often in a group,
asking "roughly what does a few nights here cost us?" before committing to
anything. Private-beta route: `/spots/:slug`.

## 3. What exists

| What | Where | Relevance |
|---|---|---|
| `GET /api/flights` | `RyanairController.getFlights` L53–61 | Takes `origin` + `destination` IATA. Bidirectional. **No `date` param at all** (§7.14). |
| `AntiCauchemarService.buildAnalysis` | slumber, L198–229 | Computes `auditedTotalCost`. **Direction-blind — see §3.1.** |
| `RyanairService.stampRealWorldEntryPrice` | slumber, L308–313 | `realWorldEntryPrice = antiCauchemar.realCost = ticketPrice + shuttleCost + bagCost`. |
| `searchFlights` | `src/services/api.ts` L1095 | Calls `GET /api/flights` with `FlightSearchParams { origin, destination }`. |
| `FlightTeaser` | `src/SpotDetailPage.tsx` L512 | Up to 3 outbound fares. Fetches on mount, unmounts on tab switch. |
| `getAntiCauchemarPricingSummary` | `src/services/antiCauchemarPricing.ts` | Reads `auditedTotalCost` first, then recompute. Exposes `hasManualCheckRequired`. **Unchanged by this slice** (§7.13). |
| `combineTripTotal` | `src/services/tripTotal.ts` L222 | 2-line total from `{ outbound, stay }`. |
| `TripTotalCard` | `src/components/TripTotalCard.tsx` | Headline label `"Flight out + stay"` is hardcoded. |
| `outboundFromFlight` / `flightPickId` | `src/services/tripTotal.ts` L150 / L128 | Adapter and stable pick identity. |
| `excludedItems` | `src/services/tripTotal.ts` L215 | Four items; "Flight home" first. |
| Page state | `src/SpotDetailPage.tsx` L745–758 | `tripOutbound`, `tripStay`, `tripNights`, `tripTravellers`, `pickedFlight`. Reset on slug change. |

### 3.1 Why this is not frontend-only — the three defects

`buildAnalysis` takes `originIata` and `arrivalIata` but has no concept of
which leg of a trip it is analysing. Three consequences, all verified in source:

**D1 — the friction penalty is counted on both legs.** L221–226:

```java
AirportPenalty originPenalty = TRANSFER_FRICTION_PENALTIES.get(normalizedOrigin);
AirportPenalty destPenalty   = TRANSFER_FRICTION_PENALTIES.get(normalizedArrival);
double hiddenCostPenalty = (originPenalty != null ? originPenalty.extraCostEur() : 0.0)
                         + (destPenalty   != null ? destPenalty.extraCostEur()   : 0.0);
```

Both endpoints are summed unconditionally. `DUB→MRS` counts Marseille's €15;
`MRS→DUB` counts Marseille's €15 again. **This is symmetric by construction, so
adding two legs' `auditedTotalCost` is never correct.** `timePenaltyMinutes`
(L225–226) double-counts identically.

**D2 — the return bills a shuttle at the rider's home airport.** L206 and L211:

```java
AirportTransferProfile transfer = profileForAirport(arrivalIata, arrival);
double shuttleCost = transfer.manualCheckRequired() ? 0.0 : transfer.shuttleCostEur();
```

The profile is keyed on the **arrival** airport. On the return leg the arrival
airport is home. `TRANSFER_PROFILES` has `DUB → (30 min, €8)`, so `MRS→DUB`
bills an €8 Dublin arrival transfer the rider does not pay. Because
`realWorldEntryPrice = realCost`, the same €8 also inflates the sort key.

**D3 — the late-arrival markup fires on landing home.** L212 and L361–370:

```java
int hour = arrival.getHour();
return (hour >= 23 || hour < 6) ? LATE_TAXI_EUR : 0.0;   // LATE_TAXI_EUR = 60.0
```

A return landing at Dublin at 23:40 adds €60 for a late-night taxi **home**.
Whether the rider pays that is unknowable to us — their car may be parked at
the airport. This is already a known open item in `AGENTS.md` ("Return leg
late-arrival overstatement"). It is a product question, not a arithmetic bug,
and §7.12 decides it rather than silently keeping or dropping it.

**Measured, `DUB↔MRS`, per traveller:** the return leg is overstated by
**€23.00** (€8 home shuttle + €15 re-counted friction) before any late-arrival
markup, and by **€83.00** with one. Full derivation in V3/V4.

**Not a defect, deliberately:** `DEFAULT_CABIN_BAG_EUR = 24.0` is charged on
both legs. Ryanair prices cabin bags per segment, so €24 × 2 for a round trip
is correct. **BE1 must not change it.**

### 3.2 Decision

**Direction-aware backend fix (user decision, 2026-09-19).** The cheaper option
— having the frontend sum only `price + cabinBagEstimate` and drop the audited
total for the return — was rejected. It would have put a second, weaker pricing
rule in the client while the canonical one stayed wrong for every other consumer
(`TripPlannerService`, `TripExplorationService`, `/island-hop`), and it
contradicts `AGENTS.md` priority 1 ("`auditedTotalCost` first").

So: **one backend task (BE1) plus the frontend work.** The frontend keeps
consuming `auditedTotalCost` exactly as it does today.

## 4. Scope

- **BE1:** `GET /api/flights` gains an optional `leg` parameter. When
  `leg=RETURN`, `buildAnalysis` applies the return rules in §7.12. Default and
  absent behaviour is byte-identical to today.
- A **return-flight line** in the trip total card, between outbound and stay.
  Multiplied by travellers. The card headline becomes dynamic.
- A **"Flight home" section** on the Flights tab showing up to 3 return fares
  with pick buttons, fetched with `leg=RETURN`.
- **"Flight home" removed from the excluded list** when a return is chosen.
- A **date-coherence note** when the two picked fares cannot be a round trip
  (§7.14).

No Route Hacker schedule fallback for the return direction.

## 5. Out of scope (follow-ups)

| # | Follow-up | Why not now |
|---|---|---|
| F3 | Opt-in riding line (pick a `PriceLine`, plus `ACCESS_BAND`) | Separate product decision on which tariff line. Next after this. See §10. |
| F2 | Dated stay rates | Flights undated (§7.14). |
| F4 | Persist picks | Cart off beta nav. |
| F5 | Converge totals | After all line kinds ship. |
| F14 | Apply the §7.12 leg rules to the **other** `auditedTotalCost` consumers (`TripPlannerService`, `TripExplorationService`, `IslandHopService`) | They have no round-trip concept today, so they are not newly wrong. Worth a sweep once this lands. |
| F15 | `timePenaltyMinutes` double-counts on a round trip the same way `hiddenCostPenalty` does (D1) | No surface sums two legs' travel time yet. BE1 fixes it in passing for `leg=RETURN` (criterion 36) but nothing renders it. |
| F16 | Dated round trips: a real outbound/return pair with a stay between them | Needs a dated fare feed (§7.14). |
| F17 | **The away airport's shuttle is billed once though the rider rides that corridor both ways.** `profileForAirport` is arrival-keyed, so `DUB↔MRS` counts Marseille's €10 on the outbound only. Pre-existing, found by backend at R1. | An **understatement**, so it does not overstate a price to a traveller, and fixing it means deciding whether a return-corridor fare equals the arrival one. Sweep with F14. |
| F18 | `cy.wait(750)` at `cypress/e2e/spot-trip-total.cy.ts:318` violates the standing intercept-and-alias rule | Pre-existing and unrelated to this card. Logged by sdet at R1; explicitly **not** a blocker for this slice. |
| F19 | **`docs/openapi-lite.yaml` (slumber) is not valid YAML and has not been for some time.** It fails to parse on `HEAD`, before any of this feature's changes, so the lite spec is broken for every consumer that loads it. **Cause, measured and written down so nobody re-diagnoses it:** the `'404'` `description` at **L857** is an unquoted plain scalar containing a `": "` — `` description: No spot with that slug (`code: SPOT_NOT_FOUND`). Checked before the parameters. ``. A plain scalar may not contain `": "`, so the parser reads the second colon as a mapping separator and errors. **Fix:** single-quote that description (or make it a `>-` block scalar); doubled `''` for the inner quote is not needed since it contains none. Verified that BE1/BE2's own additions to the file are correct by parsing a copy with only L857 patched — the additions parse clean, so nothing here is BE2's doing. | Pre-existing and outside this feature's diff; fixing it in BE2 would mix an unrelated repair into a documented-in-one-place change. Cheap and self-contained — one line, one owner, `backend`. Worth doing **before** the next consumer trips over it, because it silently breaks anything that loads the lite spec. Blocks nothing in this slice: criterion 42 is verified against the patched-copy parse plus a direct read of the added lines. |
| — | Return rail (rail spec F3) | Depends on this feature. |

Also out: first-mile, food, gear hire, multiple rooms, booking handoff, telemetry.

## 6. User stories

1. As a rider on a spot page, I see return fares on the Flights tab and pick
   one, so the trip total includes both legs.
2. As a rider, when I pick a return flight, "Flight home" disappears from the
   excluded list, so I know the total now covers the trip both ways.
3. As a rider, the round-trip figure does not bill me twice for the same
   airport's friction, and does not bill me a taxi at my own home airport.
4. As a rider, when a cost on the way home genuinely cannot be validated — like
   getting home from a 23:40 landing — I see it flagged as a manual check
   rather than guessed at €60 or silently dropped.
5. As a rider, when no return fare is cached, I see that stated rather than the
   return being silently omitted.
6. As a rider, if the two fares I picked cannot be a round trip, I am told.

## 7. Contract

### 7.1 Type changes in `src/services/tripTotal.ts`

`TotalLineKind` gains `'return-flight'`:
```ts
export type TotalLineKind = 'outbound-flight' | 'return-flight' | 'stay';
```

`TripTotalInput` gains `returnFlight`:
```ts
export interface TripTotalInput {
    outbound: TotalComponent | null;
    returnFlight: TotalComponent | null;     // NEW
    stay: TotalComponent | null;
    nights: number;
    travellers: number;
    arrivalAirport: string;
    hasTariff: boolean;
}
```

`TripTotal` gains `headlineLabel`; `lines` becomes 3 entries:
```ts
export interface TripTotal {
    currency: 'EUR';
    /** Three lines, fixed order: outbound-flight, return-flight, stay. */
    lines: TripTotalLine[];
    totalCents: number | null;
    allInCents: number | null;
    prefix: TotalPrefix;
    allInPrefix: TotalPrefix;
    headlineLabel: string;                    // NEW, see 7.3
    excluded: string[];
    nights: number;
    travellers: number;
}
```

The 2→3 line change is a contract change. Existing callers pass
`returnFlight: null` and expect 3 lines, with a `not-chosen` line at index 1.
**No figure, prefix or state changes for outbound or stay when `returnFlight`
is null.**

**`TotalComponent` gains the raw departure date** (frontend's R1 blocker):

```ts
export interface TotalComponent {
    // ... existing fields unchanged ...
    /**
     * Raw ISO departure date-time, exactly as the flight carried it.
     * Flights only; null on a stay. Added for the §7.14 date-coherence check:
     * `label` is already formatted to "Sat 3 Oct" by `flightLabel`
     * (tripTotal.ts L133-139), which drops the year, so the card cannot
     * compare two dates from `label`.
     */
    departureDate?: string | null;
}
```

This is why the check lives on the component and not in the card: a string
compare of two formatted labels would also mis-order a December-to-January
round trip.

### 7.2 New adapter

```ts
export function returnFromFlight(flight: FlightAvailable): TotalComponent;
```

Identical computation to `outboundFromFlight`, differing only in
`kind: 'return-flight'`. The implementation may extract a shared private helper.
`flightPickId` is unchanged.

**Both adapters** now also set `departureDate: flight.departureDate ?? null`.
`stayFromNearby` sets `departureDate: null`. This is the only change to
`outboundFromFlight`, and it is additive — no existing field moves.

### 7.3 Headline label derivation

Computed in `combineTripTotal` from which components are **chosen** (non-null),
not from their line states.

| Outbound | Return | Stay | `headlineLabel` |
|---|---|---|---|
| yes | yes | yes | `Flights + stay` |
| yes | yes | no | `Flights` |
| yes | no | yes | `Flight out + stay` |
| yes | no | no | `Flight out` |
| no | yes | yes | `Flight home + stay` |
| no | yes | no | `Flight home` |
| no | no | yes | `Stay` |
| no | no | no | `''` (empty state, unreachable) |

`TripTotalCard` reads `total.headlineLabel` instead of the hardcoded string.
With only an outbound and/or stay chosen this yields `"Flight out + stay"` —
**identical to shipped behaviour.**

### 7.4 Line order and quantity

1. `outbound-flight` — quantity `travellers`
2. `return-flight` — quantity `travellers`
3. `stay` — quantity `nights`

The return line uses the same `buildLine`, `lineStateOf` and integer-cent
arithmetic as the outbound (base spec 7.2, 7.5).

### 7.5 Excluded list

1. `Flight home` — **only when `returnFlight` is null**
2. `Getting from {arrivalAirport} to the spot`
3. `Riding (see the tariff above)` / `Riding (no tariff on file yet)`
4. `Food and gear hire`

Any chosen return (included, unpriced or not-converted) removes item 1.

### 7.6 `allInPrefix` with two flights

`'from '` when `prefix === 'from '`, or when **any** included flight line's
`allInUnitAmount` is null or its `manualCheck` is true. Otherwise `'≈ '`.
This generalises the base spec's single-flight rule.

### 7.7 `TripTotalCard` changes

```ts
KIND_HEADING['return-flight']  = 'Flight home';
REMOVE_LABEL['return-flight']  = 'Remove return flight from trip cost';
UNPRICED_NOTE['return-flight'] = 'No usable fare. Check the fare before booking.';
```

The outbound's `REMOVE_LABEL` stays `'Remove flight from trip cost'`.
Return quantity text uses the outbound's plural form: `× 1 traveller` /
`× {n} travellers`. The `Bags and airport extras not known for this flight.`
message renders when **any** included flight line has unknown extras; the text
stays singular. Headline label from `total.headlineLabel`.

All copy must pass `src/copyStandards.test.ts`.

**`data-testid` on each card line** (sdet scope addition, approved by the
lead). Each of the three line `<li>` elements carries a stable hook:
`data-testid="trip-total-line-outbound-flight"`,
`"trip-total-line-return-flight"`, `"trip-total-line-stay"` — i.e.
`trip-total-line-${line.kind}`. The user's standing rule is `data-testid` over
role and text queries; these files are being edited anyway, and retrofitting
later would be a second PR. Existing role and text assertions stay valid, so
nothing already passing breaks.

### 7.8 Return flights section on the Flights tab

A section below the outbound `FlightTeaser`, headed `Flight home`, noting the
route `{arrivalAirport} to {originCity}`.

**Fetch:** `searchFlights({ origin: arrivalAirport, destination: originIata, leg: 'RETURN' })`
on mount, independent of the outbound fetch.

**Each fare row** (same format as outbound rows): date via `formatShortDate`,
airline when present, price via `formatCents`, honest total via `formatCents`
when it differs from the fare in rounded cents, and an
`Add to trip cost` / `In trip cost` pick button.

**Empty:** `No cached fares for the return. Check fares on the airline's site.`
**Error:** `Couldn't check return fares.`

**`data-testid`** (sdet scope addition): the section carries
`data-testid="return-flights"`, and each fare row
`data-testid="return-flight-row"` with `data-flight-id={flightPickId(flight)}`
so a specific row is addressable without depending on order or copy.

### 7.9 Page state changes in `SpotDetailPage.tsx`

```ts
const [tripReturn, setTripReturn] = useState<TotalComponent | null>(null);
```

Reset on slug change alongside the existing resets (L766–774).

```ts
const pickTripReturn = (flight: FlightAvailable): void => {
    const next = returnFromFlight(flight);
    setTripReturn((current) => (current?.id === next.id ? null : next));
};
```

No `pickedFlight`-style secondary state: rail chaining stays on the outbound.

`removeTripLine` gains `else if (kind === 'return-flight') setTripReturn(null);`.
The `combineTripTotal` call gains `returnFlight: tripReturn`.

### 7.10 Pick semantics

One return at a time; picking a second replaces the first; pressing
`In trip cost` un-picks; the card's remove button un-picks. Picks survive tab
switches, matched by `flightPickId`. **Picking sends no request to `/api/**`
or `/actuator/**`** (base spec criterion 30).

---

### 7.11 Backend request contract

```
GET /api/flights?origin=MRS&destination=DUB&leg=RETURN
```

| Param | Required | Format |
|---|---|---|
| `origin` | yes | 3-letter IATA (unchanged) |
| `destination` | yes | 3-letter IATA (unchanged) |
| `leg` | **no** | `OUTBOUND` \| `RETURN`, case-insensitive. Default `OUTBOUND`. |

- Absent or `OUTBOUND` → every **pre-existing** field is byte-identical to
  today's response. `legRole` (§7.13) is a new additive field and is the one
  permitted difference. Criterion 33 pins it in those terms.
- Any other value → `400`.
- `leg` is also threaded through `RyanairService.getFlights(...)` to
  `AntiCauchemarService`. No other endpoint gains the parameter in this slice.

**It must be a `@Pattern` String, not a Java enum** (backend R1, still correct).
An enum parameter throws `MethodArgumentTypeMismatchException`, whose message
leaks the Java type name and the enum's internals at the rider-facing edge. A
`@Pattern` String gives a message we wrote.

```java
@RequestParam(required = false)
@Pattern(regexp = "(?i)^(OUTBOUND|RETURN)$", message = LEG_VALIDATION_MESSAGE)
String leg
```

#### 7.11.1 The 400 shape — corrected in rev 4

Rev 3 asserted code `VALIDATION_ERROR` with per-field `details` here. **That was
wrong.** Measured against the running dev backend on `:9090`:

```
GET /api/flights?origin=MRS&destination=DUB&leg=BOTH
HTTP 400
{"timestamp":"2026-09-19T08:36:10Z","status":400,"code":"BAD_REQUEST",
 "message":"getFlights.leg: leg must be OUTBOUND or RETURN","path":"/api/flights"}
```

No `details` key. Why, in source:

- `RyanairController` carries a **class-level `@Validated`** (L27), so Spring
  validates method parameters through a proxy.
- A violated `@Pattern` on a query param therefore throws
  `ConstraintViolationException`, not `HandlerMethodValidationException`.
- `GlobalExceptionHandler` L65–68 handles that exception with
  `buildResponse(BAD_REQUEST, "BAD_REQUEST", ex.getMessage(), request, Map.of())`
  — hence the `getFlights.leg: ` prefix (the constraint path) and the absent
  `details`.
- The `VALIDATION_ERROR` branch (L49–62) is only reached when method validation
  is **not** proxied. It is unreachable on this controller.

`origin` and `destination` behave exactly the same way. Rev 3's claim that they
produce `VALIDATION_ERROR` was the specific error.

**Ruling: amend the spec, do not change the app.** Making `leg` alone emit
`VALIDATION_ERROR` would leave it inconsistent with its own siblings on the same
endpoint — a rider hitting two bad params in one request would get two different
error shapes. Removing the class-level `@Validated` to reach the other branch
would change the error payload of every `@Validated` controller in the codebase,
which is a cross-cutting API change several features wide and nothing this
feature needs. The measured shape is coherent and already documented; the spec
was the thing that was wrong. **No new backend task.** If a consistent
`VALIDATION_ERROR` envelope is wanted later, it is an API-wide piece of work
with its own spec, not a line in this one.

**Test harness note.** `RyanairController.resolveLeg` (L50–57) re-raises the
same status, code and message as an `ApiException` for harnesses without method
validation (a standalone `MockMvc` setup reaches the handler with the raw
value). So criterion 34 asserts one shape and it holds in both the running app
and a standalone slice test — that is deliberate, not a duplicate guard.

Frontend: `FlightSearchParams` in `src/services/api.ts` L1021 gains
`leg?: 'OUTBOUND' | 'RETURN'`, appended to the query only when present.

### 7.12 Return-leg rules (BE1)

The whole rule, stated once: **`leg=RETURN` means the arrival airport is the
rider's home. Do not bill arrival-side costs, and do not re-count the origin
airport's friction.**

| Quantity | `OUTBOUND` (unchanged) | `RETURN` |
|---|---|---|
| `airportShuttleEstimate` | profile for arrival airport | **`0.0`** — arrival is home |
| `cabinBagEstimate` | `DEFAULT_CABIN_BAG_EUR` | **unchanged**, `24.0` (per-segment, §3.1) |
| `hiddenCostPenalty` | origin + destination | **`0.0`** — origin's friction was counted on the outbound; destination is home |
| `timePenaltyMinutes` | origin + destination | **`0`**, same reasoning |
| `lateArrivalMarkup` (the amount) | as today | **excluded from `auditedTotalCost`**; see §7.12.1 |
| `manualCheckRequired` | `transfer.manualCheckRequired() \|\| lateArrivalMarkup == null` | **always `false`** — see §7.12.1 |
| `manualCheckReasons` | as today | **empty**, unless the `lateArrivalMarkup` line is `MANUAL_CHECK_REQUIRED` — see §7.12.2 |
| `transferToCenterMinutes` | profile for arrival airport | **`0`** — no transfer to a city centre is being made |
| `totalTravelTimeMinutes` | `flightMinutes + transferMinutes` | **`flightMinutes`** only |
| `dataConfidence` | from the transfer profile | **`"estimated"`** — the transfer profile is unused, and the cabin bag is the only estimated input left |
| `logisticVerdict` | arrival-airport verdict | **`Flying home. Getting from the airport to your door is not included.`** |
| `theCatch` | arrival-airport warnings | arrival-transfer and late-taxi clauses **omitted**; other clauses (e.g. PRICE TRANSPARENCY) unchanged |
| `realCost` | `ticket + shuttle + bag` | same formula, with `shuttle = 0` |
| `auditedTotalCost` | `realCost + hidden + lateMarkup` | same formula, with the substitutions above |

**Why `manualCheckRequired` must be dropped, not just the shuttle.** Today it
ORs `transfer.manualCheckRequired()`. `profileForAirport` (L493–506) returns a
profile with that flag set for **any airport absent from `TRANSFER_PROFILES`** —
which includes `SNN` and `ORK`, both live origins under `AGENTS.md`'s
multi-origin mandate. Left in place, a Shannon-based rider's return would carry
a `MANUAL_CHECK_REQUIRED` shuttle line directly contradicting §7.13's
`EXACT 0.0`. On a return no transfer is billed at all, so neither disjunct
applies (criterion 45).

**The BCN carve-out.** `shouldOverrideLimitedAccess` (L353–359) already returns
a confident "no night-taxi markup needed" for a 23:40 arrival at an airport in
`LOCAL_ACCESS_KNOWLEDGE`. A late-home rule keyed only on the hour would replace
that certainty with a manual check — a regression in honesty. When the override
applies, the `lateArrivalMarkup` line keeps status
`OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE` and no check is raised (criterion 49).

#### 7.12.1 The late-arrival caveat must not move the ranking — decided

Rev 2 set `manualCheckRequired = true` for a late return. That was wrong
operationally. `RyanairService.enrichFlights` L301–303 sorts on that boolean
**first**, and `Comparator.comparing` orders `false` before `true`, so every
23:00–06:00 return would sort last. §7.8 renders only 3 rows, so **the cheapest
return could disappear from the tab** — solving one honesty problem by creating
another.

**Decision: decouple display from ranking.** On `leg=RETURN` the top-level
`manualCheckRequired` stays `false`, and the caveat rides on the existing
`priceBreakdown.lateArrivalMarkup` CostLine status instead.

This works with **no new field and no frontend change**, because
`getAntiCauchemarPricingSummary` (`src/services/antiCauchemarPricing.ts`
L50–52) already reads both sources:

```ts
const hasManualCheckRequired = Boolean(truth?.manualCheckRequired)
    || breakdown?.shuttleFee?.status === 'MANUAL_CHECK_REQUIRED'
    || breakdown?.lateArrivalMarkup?.status === 'MANUAL_CHECK_REQUIRED';
```

The backend sort reads only the boolean; the frontend badge reads the
disjunction. So the CostLine status alone gives the rider the red `Manual
check` badge and the `from ` prefix (§7.6) while leaving the ordering
untouched.

**What the traveller sees under each option considered:**

| Option | What the traveller sees | Verdict |
|---|---|---|
| **A. Decouple (chosen)** | Return fares ranked cheapest-first, late ones included. A late return shows the `Manual check` badge and the card's all-in reads `from `. Nothing hidden, the caveat is visible. | **Recommended.** No new field, no FE change, no sort change. |
| B. Don't flag late returns | Cheapest-first preserved, but a 23:40 landing carries no warning and the all-in reads `≈ ` as though complete. | Rejected — silently drops a real cost. Breaks story 4 and `POSITIONING.md`'s Manual check state. |
| C. Widen §7.8 past 3 rows | Late returns become visible, but still ranked below everything, so the cheapest sits at the bottom of a longer list. | Rejected — dilutes the symptom, does not fix the ordering, and adds layout scope. |
| D. Sort returns on a different key | Correct ordering, but the outbound and return lists would rank by different rules, and `enrichFlights` forks for one caller. | Rejected — larger blast radius than A for the same outcome. |

**The semantics this settles.** Top-level `manualCheckRequired` means "this
flight's honest total is unreliable, rank it down". The CostLine status means
"this line needs checking". On a return the audited total is *entirely*
reliable — fare plus bag, both known — and the unvalidatable cost is explicitly
excluded and labelled. So `false` is the correct value, and the narrowing makes
the field coherent with the one use the sort already puts it to.

**Zeroing the shuttle is order-safe** and needs no equivalent treatment: it
subtracts a constant per route from every return, preserving relative order.
Only the boolean moved ranking.

**Why `hiddenCostPenalty` is zero on a return, including when home has a
penalty of its own.** The away airport's friction is counted exactly once, on
the outbound. The home airport's friction is never counted on either leg,
because the rider's access to their own airport is `firstMileAccess`'s domain,
not a hidden cost we discovered for them. A `MRS→STN` return therefore carries
no friction penalty even though `STN` is in the table (criterion 40).

**`lateArrivalMarkup` on a return — decided.** It is **not** added to
`auditedTotalCost`. Instead `priceBreakdown.lateArrivalMarkup` carries a
`MANUAL_CHECK_REQUIRED` line and `manualCheckReasons` carries its prose form
(§7.12.2), while top-level `manualCheckRequired` stays **`false`**. *(Rev 4
correction: this paragraph still read "sets `manualCheckRequired = true`", the
rev 2 wording that §7.12.1 overturned two paragraphs above. Same decision,
stated correctly.)* Rationale:

- We cannot validate it. The rider may have a car parked at the airport, a lift,
  or a night bus. `AGENTS.md` already lists this as the "Return leg
  late-arrival overstatement" open item.
- `POSITIONING.md` gives exactly one state for a cost that needs confirmation:
  **Manual check**. Guessing €60 is the dishonest option; dropping it silently
  is the other dishonest option.
- It needs no new frontend concept. `getAntiCauchemarPricingSummary` already
  surfaces `hasManualCheckRequired`, which `outboundFromFlight` /
  `returnFromFlight` map to `manualCheck`, which §7.6 turns into a `from `
  prefix and the existing red `Manual check` badge.

**Invariants preserved.** `realWorldEntryPrice` keeps its formula
(`= realCost`); only its shuttle input changes, and only on `leg=RETURN`. That
satisfies `AGENTS.md` invariant 2 ("do not silently redefine
`realWorldEntryPrice`") — it is the same definition over a correct input.
Ascending sort by honest price is unaffected.

**A return-only total is knowingly understated** (backend R1). The rule above
counts the away airport's friction on the outbound leg. In the §7.3
return-only case — a rider who picks a flight home but no flight out — it is
therefore counted **zero** times, and the away shuttle with it. This is
accepted rather than fixed: `combineTripTotal` already sets
`prefix === 'from '` whenever a line is `not-chosen` (criterion 3), so the
figure is presented as a floor, which is what it is. Attributing the outbound's
costs to a return the rider has not paired with anything would be the worse
error.

#### 7.12.2 `manualCheckReasons` on a return — decided in rev 4

Rev 3 was silent on this field, so BE1 made a judgement call. **Confirmed as
specified**, now a recorded decision rather than an accident.

**The rule.** On `leg=RETURN`, `manualCheckReasons` is **empty**, except when the
`lateArrivalMarkup` CostLine is `MANUAL_CHECK_REQUIRED` (§7.13), in which case
it carries **exactly one** plain-English line and no constant prefix:

| Case | `manualCheckReasons` |
|---|---|
| Daytime landing | `[]` |
| Late landing (`>= 23` or `< 6`), no local-access override | `["This lands late. How you get home at that hour cannot be checked, so it is not included in this total."]` |
| Landing time unknown | `["Landing time is unknown, so getting home from the airport is not included in this total."]` |
| Local-access override applies (e.g. `BCN`) | `[]` — the override is a confident "no markup needed", so nothing needs checking (criterion 49) |

**Why this is right.**

1. **It tracks the CostLine, not the boolean.** §7.12.1 put the caveat on the
   `lateArrivalMarkup` status. The reasons list is the prose form of the same
   caveat, so it must appear under exactly the same condition. One condition,
   two renderings — they cannot drift.
2. **Empty is the honest default, not an omission.** On a return with a daytime
   landing nothing is unvalidatable: the audited total is fare plus bag, both
   known. Carrying a reason would manufacture doubt the numbers do not have.
3. **It does not reintroduce the ranking problem §7.12.1 solved.** The
   `/api/flights` sort in `RyanairService.enrichFlights` reads only the boolean,
   which stays `false`. The one consumer that weighs the list —
   `getAntiCauchemarPenaltyScore` (`src/services/tripExploreSelectors.ts`
   L387–395, `Math.min(12, reasons.length * 4)`) — scores explore's
   `UnifiedFlightOption`s, which pass no leg context and get `legRole === null`
   (§7.13). Even if a future surface did score a return, one line weighs `4`
   against the boolean's `25`, so a late return still ranks above a genuinely
   unreliable fare rather than below it.
4. **It renders without a frontend change.** `getFlightCatchMessage`
   (`tripExploreSelectors.ts` L373–385) already falls back to the joined reasons
   when `theCatch` and `priceDisclaimer` are absent, which on a return they are
   for the late-taxi clause (criterion 48). The line must therefore read as
   rider-facing copy on its own — hence plain English, no `MANUAL_CHECK_REQUIRED:`
   prefix, and one line rather than several joined by ` · `.

Covered by criterion **52**.

### 7.13 Backend response shape

`FlightAvailable[]`, shape unchanged, with `antiCauchemar` computed per §7.12
plus one new field:

```java
// AntiCauchemarAnalysis — nullable; see below
private String legRole;   // "OUTBOUND" | "RETURN" | null
```

```ts
// src/services/api.ts, AntiCauchemarAnalysis
legRole?: 'OUTBOUND' | 'RETURN' | null;
```

It exists so tests and reviewers can assert *which* rule set produced a number —
`airportShuttleEstimate === 0` alone is weak evidence, since a
`MANUAL_CHECK_REQUIRED` transfer also zeroes it.

**Nullability — decided** (backend R1). `legRole` is **non-null only on
`GET /api/flights`**, where `leg` is a real parameter and the default is
documented. Every other producer of an `AntiCauchemarAnalysis` —
`analyzeScheduledFlight`, `TripPlannerService`, `TripExplorationService`, the
Route Hacker — passes **no** leg context and gets `null`. Claiming `"OUTBOUND"`
for a leg with no direction concept would be exactly the kind of invented
certainty §5 F14 says we do not yet have. Criterion 39 and the TS type above
now agree on this; rev 2's "never null" was wrong.

**`priceBreakdown` on a `RETURN` leg — no DTO change** (backend R1).
`PriceBreakdown` (`AntiCauchemarAnalysis.java` L93) is a fixed-field DTO with
named slots, not a list, and `CostLine` (L113) has only `amount`, `currency`,
`status` and `note` — no label. Rev 2's two new labelled lines were not
buildable. **The two existing slots already carry the intent**, so BE1 adds no
field and no list:

| Existing slot | Amount | Status | `note` |
|---|---|---|---|
| `shuttleFee` | `0.0` | `EXACT` | `Not billed: you are arriving at your home airport.` |
| `lateArrivalMarkup`, arrival hour `>= 23` or `< 6`, **no** local-access override | `null` | `MANUAL_CHECK_REQUIRED` | `Not included: we cannot check how you get home at this hour.` |
| `lateArrivalMarkup`, local-access override applies (e.g. `BCN`) | `0.0` | `OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE` | existing override note, unchanged |
| `lateArrivalMarkup`, daytime arrival | `0.0` | `EXACT` | `Not applicable: you land during the day.` |
| `lateArrivalMarkup`, arrival time unknown | `null` | `MANUAL_CHECK_REQUIRED` | `Not included: the landing time is unknown.` |

`frictionPenalty` is omitted on a `RETURN` leg, as it already is whenever no
penalty applies.

**Not changed:** `src/services/antiCauchemarPricing.ts`. It reads
`auditedTotalCost` first and exposes `hasManualCheckRequired`; both are already
correct under §7.12. **FE tasks must not touch it.**

### 7.14 Known limit: the fares are undated (designed around, not fixed)

`GET /api/flights` has **no `date` parameter** — `RyanairController.getFlights`
L53–61 takes only `origin`, `destination` and `firstMileAccess`. The Ryanair
feed behind it publishes one cheapest fare per day per route. So:

- The outbound and the return are two independent cheapest-fare rows. **They
  are not a round trip**, and nothing in the stack guarantees the return
  departs after the outbound.
- The card must never call the figure a round-trip or booked itinerary price.
  Both lines keep their own `formatShortDate` date labels so the rider sees the
  two dates and judges for themselves.
- When the return's `departureDate` is **on or before** the outbound's, the card
  shows: `These two fares aren't a round trip — the flight home leaves before
  the flight out. Check dates before booking.` The figure is still shown; this
  is a note, not a suppression (criteria 43–44).
- Dating the pair properly is **F16**, and needs a dated fare feed.

## 8. Acceptance criteria

### Frontend vectors

**V1** (all three lines). V1 is a **hand-built fixture** for the pure function
and the card — the components are constructed directly in tests, not fetched.
Its return all-in is chosen to be consistent with §7.12 (fare + €24 bag, no home
shuttle, no friction).

- Outbound: `DUB`→`NCE`, `Ryanair`, `2026-10-03T07:00:00`, fare `49.99` EUR,
  `auditedTotalCost` `74.99`, no `priceDisclaimer`
- Return: `NCE`→`DUB`, `Ryanair`, `2026-10-06T18:00:00`, fare `39.99` EUR,
  `auditedTotalCost` `63.99`, no `priceDisclaimer`
- Stay: id `"g1-d2"`, `149.89` EUR/night
- Travellers `2`, nights `3`, arrivalAirport `NCE`, hasTariff `true`

| V1 figure | Cents | Displayed |
|---|---|---|
| Outbound (49.99 × 2) | 9998 | `€99.98` |
| Return (39.99 × 2) | 7998 | `€79.98` |
| Stay (149.89 × 3) | 44967 | `€449.67` |
| Headline (9998 + 7998 + 44967) | 62963 | `≈ €629.63` |
| All-in ((74.99 × 2) + (63.99 × 2) + 44967) | 14998 + 12798 + 44967 = **72763** | `≈ €727.63` |

**V2** (return only, no outbound): same return and stay, travellers `1`, nights `3`.

| V2 figure | Cents | Displayed |
|---|---|---|
| Return (39.99 × 1) | 3999 | `€39.99` |
| Stay (149.89 × 3) | 44967 | `€449.67` |
| Headline (3999 + 44967) | 48966 | `from €489.66` |
| All-in (6399 + 44967) | **51366** | `from €513.66` |

### Backend vectors

**V3** (`DUB↔MRS`, the defect made concrete). Outbound arrives 14:00, return
arrives 14:00 — neither is late, so V3 isolates D1 and D2 from D3.
Inputs: `TRANSFER_PROFILES` `DUB (30, 8)`, `MRS (45, 10)`;
`TRANSFER_FRICTION_PENALTIES` `MRS 15.0`, no `DUB` entry; bag `24.0`.

| | Outbound `DUB→MRS` `leg=OUTBOUND` | Return `MRS→DUB` `leg=RETURN` | Return, **today's buggy output** |
|---|---|---|---|
| fare | 51.99 | 41.99 | 41.99 |
| `airportShuttleEstimate` | 10.00 (MRS) | **0.00** | 8.00 (DUB) |
| `cabinBagEstimate` | 24.00 | 24.00 | 24.00 |
| `hiddenCostPenalty` | 15.00 (MRS) | **0.00** | 15.00 (MRS again) |
| `realCost` | 85.99 | **65.99** | 73.99 |
| `auditedTotalCost` | 100.99 | **65.99** | 88.99 |

Round trip, corrected: `100.99 + 65.99 = 166.98`. Today: `100.99 + 88.99 =
189.98`. **Overstated by €23.00 per traveller.**

**V4** (V3's return, arriving `DUB` at `23:40`). Today: `lateArrivalMarkup =
60.0`, `auditedTotalCost = 148.99`. Under §7.12: `auditedTotalCost` stays
**65.99**, top-level `manualCheckRequired` is **`false`** (§7.12.1), the
`priceBreakdown.lateArrivalMarkup` line is `MANUAL_CHECK_REQUIRED` with
`amount === null`, and `manualCheckReasons` has exactly one entry (§7.12.2).
**Overstated by €83.00 today.** *(Rev 4 correction: this vector still said
`manualCheckRequired` is `true`, the rev 2 value. Criterion 38 already had it
right; the vector did not.)*

### Pure function (`combineTripTotal`, adapters) — T1

1. With V1, `totalCents === 62963`, `allInCents === 72763`, `prefix === '≈ '`,
   `allInPrefix === '≈ '`, all 3 lines `included`,
   `headlineLabel === 'Flights + stay'`.
2. Backward compatibility: with `returnFlight: null` and the base spec's V1
   inputs, `totalCents === 54965`, `allInCents === 59965`,
   `headlineLabel === 'Flight out + stay'`. Outbound and stay lines unchanged;
   the return line is `not-chosen` at index 1.
3. V2: `prefix === 'from '`, `headlineLabel === 'Flight home + stay'`,
   `totalCents === 48966`, `allInCents === 51366`.
4. `headlineLabel` — all eight rows of the §7.3 table hold.
5. `returnFromFlight` sets `kind === 'return-flight'` and otherwise agrees with
   `outboundFromFlight` on `id`, `label`, `unitAmount`, `currency`, `basis`,
   `allInUnitAmount`, `manualCheck` and `note` for the same input.
6. Return quantity is `travellers`, stay quantity is `nights`. V1's return line:
   `amountCents === 7998`, `allInCents === 12798`.
7. `excluded` omits `'Flight home'` when `returnFlight` is non-null (any state)
   and contains it when null. The other three items are unchanged.
8. Return line state rules match the outbound: `currency: 'GBP'` with a positive
   amount is `not-converted` and sets `prefix === 'from '`; a null
   `allInUnitAmount` makes the return's `allInCents` fall back to its
   `amountCents`.
9. `allInPrefix === 'from '` when the **return**'s `allInUnitAmount` is null
   even though the outbound's is known and the stay is included, and vice versa.
10. Integer cents across 3 lines: `10.40 × 1` + `10.40 × 1` + `10.40 × 1`
    gives `totalCents === 3120`.

### Card (`TripTotalCard`) — T2

11. V1: the headline row contains `Flights + stay` and `≈ €629.63`; the all-in
    row contains `With bags and airport extras` and `≈ €727.63`.
12. Three lines in order: `Flight out` `€99.98`, `Flight home` `€79.98`,
    `Stay` `€449.67`.
13. Return quantity text `× 2 travellers` (V1); `× 1 traveller` with one.
14. Headline label comes from `total.headlineLabel`: `Flight out + stay` with
    only outbound and stay chosen, `Flights + stay` with both flights.
15. `Not in this total` omits `Flight home` when a return is chosen; the other
    items remain in §7.5 order.
16. `Not in this total` lists `Flight home` first when no return is chosen.
17. A chosen return line has `Remove return flight from trip cost` calling
    `onRemove('return-flight')`. Not chosen: `Flight home` heading,
    `Not chosen yet`, no remove button.
18. `Bags and airport extras not known for this flight.` renders when the
    **return**'s extras are unknown and the outbound's are known.
19. An unpriced return shows `No usable fare. Check the fare before booking.`
    and no amount.
20. A not-converted return at unit `150` `GBP` with 2 travellers shows
    `£150.00 · In GBP, not converted, not in this total` — the unit, not 300.

### Spot page wiring (`/spots/:slug`) — T3

21. The Flights tab shows a `Flight home` section below the outbound, naming
    the route.
22. Up to 3 return fare rows, each with date, airline when present, price,
    honest total when it differs, and an `Add to trip cost` button.
23. Picking marks that row `In trip cost` / `aria-pressed="true"` and every
    other return row `Add to trip cost` / `aria-pressed="false"`. A second pick
    replaces the first.
24. Pressing `In trip cost` un-picks; the card's return line returns to
    `Not chosen yet`.
25. Picking a return sends **no** `/api/**` or `/actuator/**` request, measured
    as in base spec criterion 30.
26. The return pick survives a Flights → Hotels → Flights round trip (which
    refetches), matched by `flightPickId`.
27. With V1 picked, the headline reads `≈ €629.63` and the card is visible on
    the Getting there, Hotels, Restaurants and Flights tabs.
28. No return fares → `No cached fares for the return. Check fares on the
    airline's site.` and no pick button.
29. Fetch failure → `Couldn't check return fares.` and no pick button.
30. The return section is gated exactly as the outbound is: spot resolved, with
    coordinates and an arrival airport. A not-found spot renders neither.
31. Picks, nights and travellers reset on slug change; after a reload the card
    shows the empty state with three not-chosen lines.
32. `npm run lint`, `npm run typecheck`, `npm test` (with base-spec tests
    updated for 3-line output, `FlightCart` tests unchanged) and `npm run build`
    pass.

### Backend (`GET /api/flights`, `AntiCauchemarService`) — T4

33. **No regression.** For `DUB→MRS`, the responses with `leg` absent, with
    `leg=OUTBOUND` and with `leg=outbound` are identical to each other, and
    every **pre-existing** field of `antiCauchemar` equals today's output for
    the same input. `legRole` is the one permitted new field (§7.11). Existing
    `AntiCauchemarService` and `RyanairService` tests pass unchanged.
34. **(corrected in rev 4 — see §7.11.1.)** An unsupported `leg` value (e.g.
    `BOTH`, `''`) returns `400` with code **`BAD_REQUEST`** and message
    **`getFlights.leg: leg must be OUTBOUND or RETURN`**, and makes no provider
    call. This is the `ConstraintViolationException` shape from
    `GlobalExceptionHandler` L65–68, carrying **no `details` key** — the same
    shape `origin` and `destination` already produce on this controller.
    Rev 3 asserted `VALIDATION_ERROR` with per-field details; that shape is
    unreachable here and the assertion was never satisfiable.
35. **D2 fixed.** V3's return leg has `airportShuttleEstimate === 0.00` and
    `realCost === 65.99`; `priceBreakdown.shuttleFee` is present with
    `amount === 0.0`, `status === 'EXACT'` and the §7.13 note. *(Rev 4: this
    criterion named an `Arrival transfer (home airport)` **line label**, a rev 2
    leftover. `CostLine` has no label field — rev 3's §7.13 reused the named
    `shuttleFee` slot instead. Same assertion, addressable shape.)*
36. **D1 fixed.** V3's return leg has `hiddenCostPenalty === 0.00`,
    `timePenaltyMinutes === 0` and `auditedTotalCost === 65.99` — asserted
    against the value today's code produces for the same input, `88.99`.
37. **Round trip sums correctly.** V3 outbound + return `auditedTotalCost`
    `=== 166.98`. Marseille's €15 friction and its €10 shuttle each appear
    exactly once across the pair; no Dublin shuttle appears.
38. **D3 decided.** V4's return has `auditedTotalCost === 65.99` (the €60
    markup excluded) and `priceBreakdown.lateArrivalMarkup` with
    `amount === null` and `status === 'MANUAL_CHECK_REQUIRED'`. **Top-level
    `manualCheckRequired` is `false`** (§7.12.1). The outbound leg's
    late-arrival behaviour is unchanged.
39. `legRole` is `"OUTBOUND"` when `leg` is absent or `OUTBOUND` and
    `"RETURN"` when `leg=RETURN`, **on `GET /api/flights` only**. An analysis
    produced by any other caller (`analyzeScheduledFlight`,
    `TripPlannerService`, Route Hacker) has `legRole === null`.
40. A return into a home airport that **has** a friction entry —
    `MRS→STN`, `leg=RETURN` — still has `hiddenCostPenalty === 0.00`.
41. `realWorldEntryPrice === antiCauchemar.realCost` on both legs; for V3's
    return that is `65.99`. The formula is unchanged; only the shuttle input
    moved.
42. **(extended in rev 4.)** `docs/openapi.yaml` and `docs/openapi-lite.yaml`
    document the `leg` parameter and the `legRole` field, and
    `docs/slumber-api.postman_collection.json`'s existing **Cached Flights**
    request (L152) carries a `leg` query entry with value `RETURN` and
    `"disabled": true`, so the default request is byte-identical to today's.
    All three files are named by the same slumber `AGENTS.md` invariant 6 this
    criterion already cites, so the collection was always in its scope; rev 4
    only makes it explicit. Verified by parsing each file, not by eye — see
    F19 for why parsing `openapi-lite.yaml` currently fails for an unrelated
    reason.

### Date coherence (§7.14) — T2 / T3

43. (T2) When the return component's `departureDate` is on or before the
    outbound's, the card renders `These two fares aren't a round trip — the
    flight home leaves before the flight out. Check dates before booking.`
    The headline and all-in figures are still rendered.
44. (T2) With V1 (return `2026-10-06` after outbound `2026-10-03`), that note
    is absent. It is also absent when either flight is not chosen, or when
    either `departureDate` is missing or unparseable. The comparison uses
    `TotalComponent.departureDate` (§7.1), **not** `label`; a
    `2026-12-28` outbound with a `2027-01-04` return shows no note, which a
    compare of the formatted labels would get wrong.

### Added at contract review (rev 3)

45. (T4) **Unknown home airport.** A `RETURN` into an airport absent from
    `TRANSFER_PROFILES` (`SNN`, `ORK`) still has
    `airportShuttleEstimate === 0.00`, `priceBreakdown.shuttleFee.status ===
    'EXACT'` and `manualCheckRequired === false`. The
    `transfer.manualCheckRequired()` disjunct does not propagate on a return
    leg (§7.12).

46. (T4) **The sort is not disturbed** (§7.12.1). Given three `MRS→DUB` returns
    with `leg=RETURN` — fares `29.99` landing `23:40`, `39.99` landing `14:00`,
    `49.99` landing `02:10` — `enrichFlights` returns them in fare order
    `29.99, 39.99, 49.99`. Every one has top-level `manualCheckRequired ===
    false`, and the two late ones carry
    `priceBreakdown.lateArrivalMarkup.status === 'MANUAL_CHECK_REQUIRED'`.
    **The cheapest return is first, not last.** Asserted against rev 2's
    behaviour, which would have ordered them `39.99, 29.99, 49.99`.

47. (T4) On a `RETURN` leg, `transferToCenterMinutes === 0`,
    `totalTravelTimeMinutes === flightDurationMinutes`, and
    `dataConfidence === 'estimated'` — none of the three is derived from the
    home airport's transfer profile.

48. (T4) On a `RETURN` leg, `logisticVerdict` is
    `Flying home. Getting from the airport to your door is not included.` and
    `theCatch` contains no arrival-transfer or late-taxi clause. Specifically,
    V4's `theCatch` does not contain the string `budget 60 EUR`, which today's
    `buildVerdict` L331–340 emits for the same input.

49. (T4) **BCN carve-out.** A `RETURN` into `BCN` landing `23:40` has
    `priceBreakdown.lateArrivalMarkup.status ===
    'OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE'`, `amount === 0.0`,
    `manualCheckRequired === false`, and raises no manual check anywhere. The
    rider is not shown a `Manual check` badge.

50. (T2 / T3) **Test hooks.** The three card lines expose
    `data-testid="trip-total-line-{kind}"`; the return section exposes
    `data-testid="return-flights"` and each row
    `data-testid="return-flight-row"` with `data-flight-id`. Every criterion
    from 11–31 that addresses a line or row resolves it through these hooks
    rather than by position or copy.

51. (T1 / T2) **No positional line assertions remain.** `tripTotal.test.ts` and
    `TripTotalCard.test.tsx` address lines through a `lineByKind()` helper, not
    `lines[0]` / `lines[1]`. Verified by the absence of numeric line indexing
    in both files.

### Added at rev 4

52. (T4) **`manualCheckReasons` on a return** (§7.12.2). A `RETURN` landing at
    `14:00` has `manualCheckReasons` empty. V4's return (landing `23:40`) has
    **exactly one** entry, and that entry contains no `MANUAL_CHECK_REQUIRED:`
    prefix. A `RETURN` with an unknown landing time has exactly one entry. The
    `BCN` carve-out case of criterion 49 has it **empty**. In every case the
    list is non-empty **if and only if**
    `priceBreakdown.lateArrivalMarkup.status === 'MANUAL_CHECK_REQUIRED'` —
    assert the biconditional, not the two cases separately, so the two
    renderings of the caveat cannot drift apart.

## 9. Task split

Contract = §7.1–7.14.

| ID | Task | Owner | Depends on | Criteria |
|---|---|---|---|---|
| R1 | Contract review. **Done on rev 2: backend and frontend objected, sdet agreed with conditions. All accepted in rev 3.** Reviewers re-confirm rev 3 only — no fresh round. | backend, frontend, sdet | — | — |
| T0 | **Pre-step, blocks T1 and T2.** Convert positional line assertions to a `lineByKind()` lookup in `src/services/tripTotal.test.ts` (L90, L99, L305–308, L335) and `src/components/TripTotalCard.test.tsx` (L212), and add a `returnFlight` slot to the `v1Input` / `flight()` / `stay()` fixture helpers. Rev 3 moves stay from `lines[1]` to `lines[2]`, so without this T1 goes red on merge rather than on a real regression. | sdet | contract | 51 |
| BE1 | `AntiCauchemarService.buildAnalysis` gains a leg role; §7.12 rules; `legRole` on `AntiCauchemarAnalysis`; the two `priceBreakdown` lines. Thread `leg` through `RyanairService.getFlights` and `RyanairController` `GET /api/flights`. **Default/absent must be byte-identical to today.** Do not change `DEFAULT_CABIN_BAG_EUR` or the outbound path. | backend | R1 | 33–41 |
| BE2 | Update `docs/openapi.yaml`, `docs/openapi-lite.yaml` **and `docs/slumber-api.postman_collection.json`**. **Reopened at rev 4** for the collection only: add a `leg` query entry (value `RETURN`, `"disabled": true`) to the existing **Cached Flights** request at L152. Do **not** fix the pre-existing YAML parse error while in the file — that is F19. | backend | BE1 | 42 |
| FE1 | `src/services/tripTotal.ts`: `'return-flight'` kind, `returnFlight` input, `departureDate` on `TotalComponent` (§7.1) set by both flight adapters, `headlineLabel`, `returnFromFlight`, 3-line `combineTripTotal`, conditional excluded list, generalised `allInPrefix` | frontend | contract | 1–10 |
| FE2 | `src/components/TripTotalCard.tsx`: return-flight copy maps, headline from `total.headlineLabel`, both-flight "bags unknown" check, date-coherence note (§7.14), `data-testid` per line (§7.7) | frontend | FE1 | 11–20, 43–44, 50 |
| FE3 | `src/SpotDetailPage.tsx`: `tripReturn` state, `pickTripReturn`, `removeTripLine`, `combineTripTotal` call. Return flights section fetching with `leg: 'RETURN'`, with the §7.8 `data-testid` hooks. `FlightSearchParams.leg` and `AntiCauchemarAnalysis.legRole` in `src/services/api.ts`. **Do not touch `antiCauchemarPricing.ts`** — §7.12.1 depends on its current disjunction. | frontend | FE1, FE2, **BE1** | 21–31, 50 |
| T1 | `src/services/tripTotal.test.ts`: V1/V2, adapter and `departureDate` tests | sdet | **T0** | 1–10 |
| T2 | `src/components/TripTotalCard.test.tsx`: 3-line fixtures, date coherence, testid hooks | sdet | **T0** | 11–20, 43–44, 50 |
| T3 | `cypress/e2e/spot-return-flight.cy.ts`: mock `GET /api/flights` for both directions (the return mock keyed on `leg=RETURN`). Intercept + alias only — no `cy.wait(ms)`. | sdet | contract; green after FE3 | 21–31, 50 |
| T4 | Backend tests for §7.12: V3/V4 vectors, no-regression, `MRS→STN`, unknown home airport, **the sort case (46)**, the three travel-time/confidence fields, verdict text, BCN carve-out, `legRole`, **the 400 (criterion 34 — assert `BAD_REQUEST` and the message, not `VALIDATION_ERROR`; §7.11.1)**, **`manualCheckReasons` (52)** | sdet | contract; green after BE1 | 33–41, 45–49, 52 |
| V1 | Verify: run T1–T4 plus gates, report per criterion | sdet | BE1–BE2, FE1–FE3, T0–T4 | 1–52 |
| A1 | Acceptance check per criterion, citing file/test | pm | V1 | all |

**Parallelism.** BE1, FE1 and T0 can all start at once. FE2 follows FE1; T1 and
T2 follow T0. Only **FE3** and **T3** wait on BE1, because they exercise a live
`leg=RETURN` response. T4 needs BE1 to go green but can be written against the
§7.12 table beforehand.

**The one ordering trap:** T0 must land before T1 or T2, and both before FE1
merges. Rev 3 moves the stay line from `lines[1]` to `lines[2]`, so any
positional assertion left in place fails for the wrong reason and hides
whatever real regression lands next to it.

## 10. Relation to F3 (opt-in riding line)

F3 is the next follow-up. It adds a fourth line kind (`riding`) fed by a
`PriceLine` from the spot's tariff, already in the browser from
`GET /api/spots/{slug}` (`detail.prices`). No new API call, no backend task.

Open product decisions F3 must settle before it can be specced:

- **Which tariff line is "the riding cost"?** `SESSION`, `HOUR`, `HALF_DAY`,
  `DAY`, `GROUP_HIRE` and `PACK` are not comparable. `SpotTariff.tsx` refuses a
  "from €X" figure on purpose, and F3 must not reintroduce one by the back door.
- **`perRiderAmount` is only populated for group rates.** `SpotTariff.tsx`
  L160–169 shows it only when `perPerson === false`. A solo `SESSION` line has
  its per-person figure in `amount`, not `perRiderAmount`. A rule keyed solely
  on "non-null `perRiderAmount`" would silently exclude most of the catalogue.
- **`ACCESS_BAND` is compulsory and additive.** `SpotTariff.tsx` L41–47 files it
  under "Before you can ride". When present it must be added on top of the
  chosen line, and shown as its own row.

**Freshness gate — corrected from rev 1.** `FRESH_DAYS = 180` lives at the
webagency repo **root**, `spot-readiness.js` L19 (not `scripts/`), re-exported
typed at `src/services/spotReadiness.ts` L105. Rev 1 implied the gate could be
exercised against real data; **it cannot.** All **269 tariff rows across 125
spots** are currently fresh at 180 days, so no production row trips the gate.
F3's freshness criteria therefore have to be written against a **synthetic
fixture** with a back-dated `observedAt`, and the spec must say so — otherwise
the gate ships untested and looks green.

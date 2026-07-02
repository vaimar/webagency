# Skill: Flight Integrity

## Skill ID
`slumber.flight-integrity`

## Use when
- working on flight search, refresh, sorting, or price display
- deciding what counts as verified vs estimated flight pricing
- editing `FlightCard`, flight sorting, or supplier fallback logic

## Mission
Keep flight pricing honest and cache-aware.

## Core rules
- `auditedTotalCost` beats `realWorldEntryPrice` beats marketing fare.
- `doorToTripPrice` is additive context — never replaces `realWorldEntryPrice`. Show it as a separate indigo line only when `firstMileAccess` is present.
- Stale cache must not present as live truth (check `fetchDate` > 12h).
- No flights ⟹ no trip.
- Flight-first orchestration is mandatory.
- Provider fallback chain: `serpapi` → `aviationstack` → `kiwi`.

## Price computation logic (`antiCauchemarPricing.ts`)
```
1. auditedTotalCost             → use directly as estimatedEntryPrice
2. ticketPrice + shuttle + bag  → recompute when auditedTotalCost absent
3. realWorldEntryPrice          → legacy fallback only
```

## New endpoints (wired in api.ts, UI not yet built)
- `GET /api/flight-search/departures?iata=DUB&provider=serpapi`
- `GET /api/flight-search/routes?from=DUB&to=BCN`
- Returns `FlightSearchResult[]` with `antiCauchemar` field

## doorToTripPrice — one-time application rule

`doorToTripPrice` is applied **only to the outbound leg**, never the return.  
See `docs/case-study-nice-wakeboard.md`:
- Outbound: `auditedTotalCost (€219.79) + firstMileAmount (€42) = doorToTripPrice €261.79`
- Return: `auditedTotalCost (€111.86)` — first mile is not duplicated

## Return leg late-arrival overstatement for car users

When `firstMileMode = rental_car` and the return airport matches the departure airport, the backend's `lateArrivalMarkup` on the return flight should be flagged as a possible overstatement. The user's car is parked at the airport — no late-night taxi is needed.

Surface this with a note: "Return late-arrival friction may be overstated — your car is parked at [departure airport]."

## File focus
- `src/services/api.ts` — `FlightAvailable`, `AntiCauchemarAnalysis`, `PriceBreakdown`, `CostLine`, `FirstMileAccess`
- `src/services/antiCauchemarPricing.ts` — honest price computation
- `src/services/searchService.ts`
- `src/services/flightService.ts`
- `src/components/FlightCard.tsx`

## Output standard
- honest sorting by `auditedTotalCost`
- flight-first gating
- explicit provider links (Ryanair, Google Flights, Skyscanner, Kiwi)
- door-to-trip shown as tertiary only

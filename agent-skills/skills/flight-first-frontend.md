# Skill: Flight-First Frontend

## Skill ID
`slumber.flight-first-frontend`

## Use when
- editing route search UX or landing discovery
- integrating backend flights with frontend selectors and cards
- adding `FirstMileAccess` input UI
- wiring new flight-search endpoints

## Mission
Ensure the frontend never builds a trip before a real route exists.

## Core workflow
1. refresh flights (`POST /api/flights/refresh`)
2. read flights (`GET /api/flights`) — optionally with `firstMile*` params
3. sort by `auditedTotalCost` (falls back to `realWorldEntryPrice`)
4. stop if empty — show honest empty state
5. only then allow optional guide generation

## FirstMileAccess integration (open work)
The backend accepts these flat query params on `/api/flights` and `/api/trips/suggestions`:
- `firstMileAmount`, `firstMileDurationMinutes`, `firstMileMode`, `firstMileStatus`, `firstMileNote`

These produce a `doorToTripPrice` = `auditedTotalCost + firstMileAmount` on the **outbound** flight response.  
When the UI collects this it must pass it as `FirstMileAccessParams` via `searchFlights()` / `fetchTripSuggestion()`.  
**Do not apply `firstMileAmount` to the return leg** — it is a one-time home → departure airport cost.

### Example from case study (Limerick → DUB, car)

```
firstMileAmount = 42
firstMileDurationMinutes = 150
firstMileMode = rental_car
firstMileNote = Limerick to Dublin by car
```

Result: outbound `doorToTripPrice = auditedTotalCost + 42`. Return uses `auditedTotalCost` only.

### Pre-population hint

When the user's origin city is not an airport (e.g. Limerick vs DUB), offer to capture the home → airport leg as `firstMileAccess`. The `transferEstimate.ts` service can provide an initial estimate.

## File focus
- `src/Home.tsx`
- `src/hooks/useRouteSearch.ts`
- `src/services/searchService.ts`
- `src/services/flightService.ts`
- `src/services/api.ts` — `FirstMileAccessParams`, `buildFirstMileQuery`
- `src/data/airportMetadata.ts`

## Guardrails
- selectors may be broad; landing board may stay narrower for performance
- no auto fan-out into restaurant/activity generation during plain flight search
- empty state must be explicit and honest
- `FirstMileAccess` UI should be collapsible / optional — never mandatory

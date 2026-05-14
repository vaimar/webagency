# Skill: Flight Integrity

## Skill ID
`slumber.flight-integrity`

## Use when
- working on flight search, refresh, sorting, or price display
- deciding what counts as verified vs estimated flight pricing

## Mission
Keep flight pricing honest and cache-aware.

## Core rules
- `realWorldEntryPrice` beats marketing fare.
- stale cache must not present as live truth.
- no flights => no trip.
- flight-first orchestration is mandatory.

## File focus
- `src/services/searchService.ts`
- `src/services/api.ts`
- `src/services/flightService.ts`
- `src/components/FlightCard.tsx`

## Output standard
- honest sorting
- flight-first gating
- explicit provider links


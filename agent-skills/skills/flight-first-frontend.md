# Skill: Flight-First Frontend

## Skill ID
`slumber.flight-first-frontend`

## Use when
- editing route search UX or landing discovery
- integrating backend flights with frontend selectors and cards

## Mission
Ensure the frontend never builds a trip before a real route exists.

## Core workflow
1. refresh flights
2. read flights
3. sort by honest price
4. stop if empty
5. only then allow optional guide generation

## File focus
- `src/Home.tsx`
- `src/hooks/useRouteSearch.ts`
- `src/services/searchService.ts`
- `src/services/flightService.ts`
- `src/data/airportMetadata.ts`

## Guardrails
- selectors may be broad; landing board may stay narrower for performance
- no auto fan-out into restaurant/activity generation during plain flight search
- empty state must be explicit and honest


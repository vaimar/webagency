# Frontend Surface

Key implementation surfaces for this repo.

## Search and discovery

- `src/Home.tsx`
  - landing discovery board
  - flight-first search UI
  - route/date selectors
- `src/hooks/useRouteSearch.ts`
  - flight-first flow
  - optional AI guide loading
- `src/services/searchService.ts`
  - refresh flights
  - search flights
  - stop if no flights
- `src/services/flightService.ts`
  - landing discovery destinations

## Planner and package flow

- `src/TravelForm.tsx`
  - planner entry
  - preference-aware trip planning
- `src/components/TripGuide.tsx`
  - package summary
  - booking links
  - restaurants / stays / itinerary tabs
- `src/services/affiliates.ts`
  - external booking URLs

## Truth UI

- `src/components/TruthCard.tsx`
- `src/components/FlightCard.tsx`
- `src/components/FlightDestinationCard.tsx`

## User profile and personalization

- `src/ProfileContext.tsx`
- `src/Profile.tsx`

## Design system

- `src/index.css`
  - global tokens
  - frozen-summer visual hierarchy
  - warning styling


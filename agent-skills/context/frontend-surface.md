# Frontend Surface

> **Last updated:** 17 May 2026.

Key implementation surfaces for this repo.

## Search and discovery

- `src/Home.tsx`
  - landing discovery board (pre-search)
  - flight-first search UI with airport selectors
  - route/date selectors (hero card)
- `src/hooks/useRouteSearch.ts`
  - flight-first flow
  - refresh → search → sort → optional AI guide
- `src/services/searchService.ts`
  - refresh flights
  - search flights
  - sort by honest price (uses `getComparableFlightPrice`)
  - stop if no flights
- `src/services/flightService.ts`
  - landing discovery destinations from `/api/flights/destinations`
- `src/data/airportMetadata.ts`
  - IATA → city / airport display (ORIGIN_AIRPORT_OPTIONS, DESTINATION_AIRPORT_OPTIONS)

## Planner and package flow

- `src/TravelForm.tsx`
  - planner entry
  - preference-aware trip planning
- `src/components/TripGuide.tsx`
  - package summary
  - booking links
  - restaurants / stays / activities / itinerary tabs
- `src/services/affiliates.ts`
  - external booking URLs (Ryanair, Google Flights, Skyscanner, Kiwi)

## Truth UI

- `src/components/TruthCard.tsx` + `TruthCard.css`
  - structured `PriceBreakdown` renderer with `CostLine` status badges
  - `doorToTripPrice` row (indigo)
  - `manualCheckRequired` badge (red)
  - `localAccessKnowledgeNote` panel (indigo)
  - Haversine transfer estimate panel (green, never added to price)
- `src/components/FlightCard.tsx`
  - hero and standard variants
  - base fare headline → honest total → door-to-trip hierarchy
  - `⚠ Costs require manual check` badge
- `src/components/FlightDestinationCard.tsx`
  - landing discovery card

## Pricing logic

- `src/services/antiCauchemarPricing.ts`
  - `getAntiCauchemarPricingSummary()` — prefers `auditedTotalCost`
  - `getComparableFlightPrice()` — used for honest sorting
  - exposes: `estimatedEntryPrice`, `auditedTotalCost`, `doorToTripPrice`, `hasManualCheckRequired`
- `src/services/transferEstimate.ts`
  - `estimateAirportTransfer(iata, arrivalHour)` → `TransferEstimate | null`
  - `formatTransferLabel()` → "~€16 (night rate)"
  - `getArrivalHour()` → 0–23 from ISO datetime
  - 80 airports × 18 country rate tables, Haversine + ×1.3 road overhead, night rate 22:00–06:00

## API layer

- `src/services/api.ts`
  - **Types:** `FlightAvailable`, `AntiCauchemarAnalysis`, `PriceBreakdown`, `CostLine`, `FirstMileAccess`, `FlightSearchResult`, `HotelResult`, `HotelEnrichmentResponse`, `ReviewBreakdown`
  - **Functions:** `searchFlights`, `refreshFlights`, `getFlightByDate`, `searchFlightsByDeparture`, `searchFlightRoutes`, `fetchTripSuggestion`, `planTrip`, `generateItinerary`, `getHotelsNearby`, `getHotelsByBbox`, `getHotelDetails`, `getHotelEnrichment`, `fetchAiProviders`, `sendChatMessage`, `getProfile`, `getPreferences`, `updatePreferences`
  - All flight endpoints accept optional `FirstMileAccessParams` (flat `firstMile*` query params)

## User profile and personalization

- `src/ProfileContext.tsx`
- `src/Profile.tsx`

## Design system

- `src/index.css` — global tokens, frozen-summer visual hierarchy, warning styling
- `src/App.css` — hero card palette, booking link styles, FlightCard classes
- Key palette:
  - `#f8fafc` — price headline (white)
  - `#7dd3fc` — honest total (sky blue)
  - `#a5b4fc` — door-to-trip (indigo)
  - `#fca5a5` — manual check / warning (red)
  - `#6ee7b7` — transfer estimate (green)
  - `#94a3b8` — labels / muted text

## Test files

- `src/services/transferEstimate.test.ts` — 43 tests (Haversine accuracy, night rates, public transport)
- `src/services/antiCauchemarPricing.test.ts`
- `src/components/FlightCard.test.tsx`
- `src/components/FlightDestinationCard.test.tsx`
- `src/Home.test.tsx`
- `src/hooks/useRouteSearch.test.ts`
- `src/services/flightService.test.ts`, `searchService.test.ts`, `api.test.ts`

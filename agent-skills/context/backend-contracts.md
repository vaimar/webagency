# Backend Contracts

> **Last updated:** 17 May 2026. See `docs/session-2026-05-17.md` for the full audit.

These backend contracts matter most for the frontend.

## Flights

### Core endpoints
- `POST /api/flights/refresh` — async trigger; requires `origin`, `destination`, `date`
- `GET /api/flights` — returns live/cached `FlightAvailable[]`, accepts optional `firstMile*` params
- `GET /api/flights/by-date` — single flight on exact date (DateGuard: 404 when none found)

### External flight search (new)
- `GET /api/flight-search/departures?iata=DUB&provider=serpapi` — live departures
- `GET /api/flight-search/routes?from=DUB&to=BCN&provider=serpapi` — live routes
- Provider fallback chain: `serpapi` → `aviationstack` → `kiwi`
- Returns `FlightSearchResult[]` with `antiCauchemar` attached

### Critical `FlightAvailable` fields
- `antiCauchemar.auditedTotalCost` — **use this as the honest total** (includes lateArrivalMarkup)
- `antiCauchemar.priceBreakdown` — structured `PriceBreakdown` with `CostLine` items
- `antiCauchemar.realWorldEntryPrice` — legacy field; superseded by `auditedTotalCost`
- `antiCauchemar.hiddenCostPenalty` — extra friction cost for notorious airports
- `antiCauchemar.theCatch` — one-liner explaining why cheap = trap
- `antiCauchemar.logisticVerdict` — airport reality summary
- `antiCauchemar.manualCheckRequired` — true when transfer fee or arrival time can't be auto-validated
- `antiCauchemar.manualCheckReasons` — array of reasons
- `antiCauchemar.firstMileAccess` — home → departure airport (user-supplied or estimated)
- `antiCauchemar.doorToTripPrice` — `auditedTotalCost + firstMileAccess.amount` (null unless firstMile present)
- `fetchDate` — ISO timestamp for cache staleness check (> 12h = stale)
- `priceLabel` — "Current" or "Estimated (Cached)"

### `PriceBreakdown` shape
```
PriceBreakdown {
  baseFare          CostLine   EXACT
  shuttleFee        CostLine   ESTIMATED | MANUAL_CHECK_REQUIRED
  baggageEstimate   CostLine   ESTIMATED
  lateArrivalMarkup CostLine   EXACT | ESTIMATED | OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE
  firstMileLine     CostLine?  present only when firstMileAccess was supplied
  renderMode        "PRICE_TRANSPARENCY_STACK"
}
```

### `CostLine` shape
```
CostLine {
  amount   number | null   (null when MANUAL_CHECK_REQUIRED)
  currency string
  status   EXACT | ESTIMATED | MANUAL_CHECK_REQUIRED | OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE
  note     string
}
```

### `FirstMileAccess` query params
All optional, passed flat on `/api/flights` and `/api/trips/suggestions`:
- `firstMileAmount`, `firstMileDurationMinutes`, `firstMileMode`, `firstMileCurrency`, `firstMileStatus`, `firstMileSource`, `firstMileNote`

## Trips

- `GET /api/trips/suggestions`
- `POST /api/trips/plans`
- `POST /api/trips/itineraries`

Critical frontend expectations:
- `TripSuggestion.restaurants` / `restaurantRecommendations` / `foodSpots` — normalize aliases
- `TripSuggestion.activities`
- `TripSuggestion.accommodation` / `hotels` / `stays` — normalize aliases
- official hotel site URLs returned as `officialWebsiteUrl` — prefer over generic fallbacks

## Hotels

- `GET /api/hotels/nearby?lat=&lon=&radius=`
- `GET /api/hotels/search/bbox?lonMin=7.05&latMin=43.60&lonMax=7.25&latMax=43.72` — **confirmed working** (see Nice case study)
  - Returns priced results with `opentripmap+serpapi` provider merge
  - Fields: `name`, `pricePerNight`, `rating`, `reviewsCount`, `bookingLink`
  - ⚠ Price is **not occupancy-specific** — single nightly rate only
- `GET /api/hotels/{xid}` — raw OpenTripMap place details
- `GET /api/hotels/{xid}/enrichment` — SerpApi-backed `HotelEnrichmentResponse`
  - Returns: `rating`, `reviewsCount`, `reviewSummary`, `reviewBreakdown`, `pricePerNight`, `bookingLink`, `thumbnailUrl`, `amenities`, `nearbyPlaces`

## AI

- `POST /api/ai/messages` — chat; returns `AiMessageResponse` with `resolvedProvider`, `fallback`, `cached`
- `GET /api/ai/providers` — returns provider readiness flags for openai / grok / gemini

## Profile

- `GET /api/accounts/profile`
- `GET /api/accounts/preferences`
- `PUT /api/accounts/preferences`
- `POST /api/accounts/login`
- `POST /api/accounts/logout` (fallback: `/logout`)

## Truth rules

- no flights ⟹ no trip
- sort by `auditedTotalCost` (or `realWorldEntryPrice` as fallback), never marketing price
- `MANUAL_CHECK_REQUIRED` CostLines must be surfaced — never silently dropped
- `doorToTripPrice` is additive and parallel — never replaces the flight-only honest price
- show backend-side recommendation shortages explicitly
- keep package totals labelled as estimates unless every component is verified

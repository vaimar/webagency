# Backend Contracts

These backend contracts matter most for the frontend.

## Flights

- `POST /api/flights/refresh`
  - async trigger
  - requires `origin`, `destination`, `date`
- `GET /api/flights`
  - returns live/cached `FlightAvailable[]`

Critical fields:
- `antiCauchemar.realWorldEntryPrice`
- `antiCauchemar.hiddenCostPenalty`
- `antiCauchemar.theCatch`
- `antiCauchemar.logisticVerdict`
- `fetchDate`

## Trips

- `GET /api/trips/suggestions`
- `POST /api/trips/plans`
- `POST /api/trips/itineraries`

Critical frontend expectations:
- `TripSuggestion.restaurants`
- `TripSuggestion.activities`
- `TripSuggestion.accommodation`
- alternate aliases may appear and must be normalized
- official hotel site URLs may be returned and should be preferred over generic fallback links

## Profile

- `GET /api/accounts/profile`
- `GET /api/accounts/preferences`
- `POST /api/accounts/login`
- logout via backend route or mapped proxy route

## Truth rules

- no flights => no trip
- sort by honest price, not marketing price
- show backend-side recommendation shortages explicitly
- keep package totals labeled as estimates unless every component is verified


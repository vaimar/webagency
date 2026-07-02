# Shared Core Rules

> **Last updated:** 17 May 2026.

Apply these rules before loading any Slumber skill.

## Non-negotiables

- Always read `AGENTS.md` before making strategic changes.
- Apply **Anti-Cauchemar** logic:
  - surface hidden costs
  - surface airport penalties (BVA, MRS, STN, CIA, BGY)
  - surface logistic traps and nocturnal arrival risks
- **Honest price hierarchy:**
  1. `auditedTotalCost` from the backend (includes `lateArrivalMarkup` + `hiddenCostPenalty`)
  2. Recomputed from flat fields: `ticketPrice + airportShuttleEstimate + cabinBagEstimate`
  3. `realWorldEntryPrice` (legacy — only if neither above is available)
  4. `doorToTripPrice` is additive context only — never replaces the flight price
- If there is no flight data, do not invent a trip.
- If totals are shown, label what is estimated vs verified (`CostLine.status`).
- Never imply one-click package booking if the app is only linking out.
- `MANUAL_CHECK_REQUIRED` CostLines must be surfaced to the user — never silently dropped.

## Frozen Summer tone

- Cold, honest, useful.
- Minimal clutter.
- Sharp warnings.
- High-contrast truth.
- No brochure language.

## Frontend implementation rules

- Flight-first before itinerary.
- Profile-aware planning where available.
- Keep booking links explicit and provider-labeled.
- When backend returns fewer than desired results, make that visible rather than hiding it.
- Base fare = headline number; honest total = secondary; door-to-trip = tertiary.
- `priceBreakdown` (structured `CostLine[]`) is preferred over `airportShuttleEstimate` / `cabinBagEstimate` flat fields when present.

## Transfer estimate rules

- Use `src/services/transferEstimate.ts` (Haversine-based) when `antiCauchemar.airportShuttleEstimate` is 0 or missing.
- Transfer estimates are **never added to the price automatically** — informational panel only.
- Night rate window: 22:00–06:00 local arrival.
- Public transport alternatives are shown alongside taxi estimate when known.

## FirstMileAccess rules

- `firstMileAccess` models home → departure airport, one-time cost.
- Apply `doorToTripPrice` to the **outbound leg only**. The return leg always uses `auditedTotalCost`.
- When `firstMileMode = rental_car` and the return airport matches the departure airport, the backend's `lateArrivalMarkup` on the return flight is likely overstated — surface a note: "Return arrival friction may be overstated — your car is parked at [airport]."
- Hotel price from bbox search is not occupancy-specific — always note "price may vary for group size".

## Recommendation rules

- Prefer at least 10 hotel/stay recommendations when backend data exists.
- Prefer at least 10 restaurant recommendations when backend data exists.
- Rank recommendations to profile first, not generic tourism popularity.
- `officialWebsiteUrl` on accommodation is preferred over generic booking fallback.

## Canonical outputs

- Honest price hierarchy (base fare → honest total → door-to-trip)
- Clear warning state for `theCatch`
- `CostLine` status badges for each price component
- Explicit totals for flight / sleep / food / transport when package estimates are shown
- `MANUAL_CHECK_REQUIRED` clearly flagged, never hidden

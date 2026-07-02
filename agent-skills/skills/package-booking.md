# Skill: Package Booking

## Skill ID
`slumber.package-booking`

## Use when
- editing planner totals
- adding booking links
- creating package summary or booking handoff UI
- wiring hotel enrichment reviews/prices

## Mission
Show the user a truthful package estimate, then hand them off to the right booking sites.

## Core rules
- label per-person vs total-trip explicitly
- include flight, stay, food, and transport in totals where possible
- use Ryanair-first flight linking when route data supports it
- prefer `officialWebsiteUrl` on accommodation when backend returns it
- do not imply bundled checkout if booking is external
- the flight total must use `auditedTotalCost` — never the marketing fare

## Hotel enrichment (wired in api.ts, not yet in UI)
`GET /api/hotels/{xid}/enrichment` returns `HotelEnrichmentResponse`:
- `rating`, `reviewsCount`, `reviewSummary`, `reviewBreakdown`
- `pricePerNight`, `bookingLink`, `thumbnailUrl`, `amenities`
- Call `getHotelEnrichment(xid)` from `src/services/api.ts`
- Should be wired to the accommodation tab in `TripGuide.tsx`

## Combined trip total pattern (from Nice case study)

The canonical trip total card format confirmed by `docs/case-study-nice-wakeboard.md`:

```
transport = outbound.doorToTripPrice + return.auditedTotalCost
hotel     = nights × pricePerNight
total     = transport + hotel

Excluded: food, activity session fees, parking
⚠ Note any MANUAL_CHECK_REQUIRED components
ℹ Note if return late-arrival friction may be overstated (car users)
```

**Important:** `doorToTripPrice` is applied **once** to the outbound leg only. The return always uses `auditedTotalCost`.

## Hotel occupancy caveat

The bbox hotel API returns a single nightly rate — **not occupancy-specific**. When displaying hotel prices for groups (e.g. 2 adults + 1 child), always append:  
`"Price shown per room. Verify at booking for your group size."`

## Excluded costs that must be noted explicitly

- Wakeboard / watersports session fees
- Dublin Airport parking (or equivalent for car users)
- Activity entrance fees
- Food and drink

Never silently omit these. Either show a known cost or explicitly state "excluded from total".

## File focus
- `src/components/TripGuide.tsx`
- `src/TravelForm.tsx`
- `src/services/affiliates.ts`
- `src/services/api.ts` — `getHotelEnrichment`, `HotelEnrichmentResponse`, `ReviewBreakdown`

## Output standard
- honest totals using `auditedTotalCost` for the flight component
- grouped booking actions
- provider-labeled handoff links
- no fake package promise
- hotel enrichment data (rating, price, reviews) when available

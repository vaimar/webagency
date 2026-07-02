# Case Study: Cheapest 3-day family wakeboard stay near Nice

> **Date:** 17 May 2026  
> **Type:** Real API-backed planning session  
> **Skill routing:** `slumber.travel-auditor` + `slumber.flight-integrity` + `slumber.package-booking` + `slumber.flight-first-frontend`

---

## Scenario

| Field | Value |
|---|---|
| Origin context | Limerick, Ireland |
| Travel party | 2 adults + 1 child |
| Trip length | 3 days / 2 nights |
| User constraint | "I have a car" |
| Planning rule | `firstMileAccess` models home → departure airport |
| APIs used | `GET /api/ai/providers`, `POST /api/ai/messages`, `GET /api/hotels/search/bbox`, `GET /api/flights`, `POST /api/trips/plans` |

---

## Executive recommendation

**Cheapest practical option surfaced by the current backend:**

| Component | Detail |
|---|---|
| Base area | Villeneuve-Loubet / Cagnes-sur-Mer (west of Nice) |
| Hotel | ibis budget antibes sophia |
| Stay | 2 nights × €88/night = **€176** |
| Flight strategy | Drive Limerick → Dublin Airport, then DUB ↔ NCE combo |
| Transport total | **€373.65** |
| **Trip total (transport + hotel)** | **€549.65** |
| Excluded | food, wakeboard session fees, Dublin Airport parking |

---

## FirstMileAccess modeling

Because the backend needs airport IATA codes, Limerick was modeled as:

```
firstMileAmount = 42
firstMileDurationMinutes = 150
firstMileMode = rental_car
firstMileNote = Limerick to Dublin by car
```

**Rule applied:** `doorToTripPrice` is additive — it is only applied **once** to the outbound leg.
The return leg uses `auditedTotalCost` alone (the user's car is parked at DUB).

API call:
```
GET /api/flights?origin=DUB&destination=NCE
  &firstMileAmount=42
  &firstMileDurationMinutes=150
  &firstMileMode=rental_car
  &firstMileNote=Limerick%20to%20Dublin%20by%20car
```

---

## Flight evidence

### Outbound: DUB → NCE

| Field | Value |
|---|---|
| Departure | 2026-05-26T06:35:00 |
| Raw fare | €195.79 |
| `auditedTotalCost` | €219.79 |
| `doorToTripPrice` | **€261.79** (includes €42 first mile) |
| Catch | `MANUAL_CHECK_REQUIRED` — NCE transfer cost not auto-validated |

### Return: NCE → DUB

| Field | Value |
|---|---|
| Departure | 2026-05-28T23:15:00 |
| Raw fare | €51.86 |
| `auditedTotalCost` | **€111.86** |
| Catch | Late-arrival warning into Dublin + hidden-cost friction |

> ⚠️ **Caveat:** The late-arrival return warning into Dublin may **overstate** friction for this user — they have a car parked at DUB, so no late-night taxi is needed.

### Transport total

```
outbound doorToTripPrice  €261.79
return   auditedTotalCost €111.86
──────────────────────────────
transport total           €373.65
```

---

## Hotel evidence

Source: `GET /api/hotels/search/bbox?lonMin=7.05&latMin=43.60&lonMax=7.25&latMax=43.72`

| Rank | Hotel | Provider | Nightly | Rating | Reviews |
|---|---|---|---:|---:|---:|
| 1 | ibis budget antibes sophia | opentripmap+serpapi | **€88** | 3.6 | 740 |
| 2 | b&b hotel antibes sophia le relais | opentripmap+serpapi | €91 | 3.7 | 573 |
| 3 | ibis styles antibes | opentripmap+serpapi | €107 | 3.8 | 1203 |

**Chosen:** ibis budget antibes sophia — 2 nights = **€176**

---

## Final summary

| Component | Total |
|---|---:|
| Transport | €373.65 |
| Hotel (2 nights × €88) | €176.00 |
| **Cheapest surfaced trip total** | **€549.65** |

### Recommended frontend summary card

```
Cheapest family wakeboard option near Nice
────────────────────────────────────────────
Base          Villeneuve-Loubet / Cagnes-sur-Mer
Stay          ibis budget antibes sophia
Nights        2
Hotel total   €176
Transport     €373.65  (outbound door-to-trip + return audited)
─────────────────────
TOTAL         €549.65

⚠ NCE transfer costs require manual check
ℹ Return late-arrival friction may be overstated (car parked at DUB)
Excluded: food, wakeboard sessions, Dublin Airport parking
```

---

## AI-backed destination reasoning

From `POST /api/ai/messages`:

- **Marina Baie des Anges (Villeneuve-Loubet)** — concentrates marina access, watersports activity, restaurants, and accommodation in one area.
- **Cagnes-sur-Mer beachfront** — family-friendly seafront, seasonal watersports, easier low-cost lodging than central Nice.

### 3-day outline

| Day | Plan |
|---|---|
| Day 1 | Arrive Nice, check in, first wakeboard session at Villeneuve-Loubet / Marina Baie des Anges |
| Day 2 | Full wakeboard day + family beach time |
| Day 3 | Short final session or seafront at Cagnes-sur-Mer, then return flight |

---

## Alternative: 3-night option

| Component | Value |
|---|---|
| Outbound | 2026-05-23T18:25:00 DUB → NCE |
| Return | 2026-05-26T10:45:00 NCE → DUB |
| Transport total | €415.71 |
| Hotel (3 × €88) | €264.00 |
| **Combined total** | **€679.71** |

---

## System gaps revealed by this session

### Gap 1 — No UI for `firstMileAccess` input
The frontend has no way for a user to say "I'm driving from Limerick". All `firstMileAccess` calls in this session were made manually. A collapsible "I know my home → airport travel" section is needed in `Home.tsx`.

### Gap 2 — Hotel nightly price is not occupancy-aware
The bbox hotel API does not enforce pricing for `2 adults + 1 child`. The displayed €88/night may be single-occupancy.

### Gap 3 — No combined trip total surface in the UI
The frontend shows flight prices and hotel prices separately. There is no component that totals `transport + hotel + (optionally) activities`. The package-booking pattern needs a summary card.

### Gap 4 — Return late-arrival warning overstatement for car users
If `firstMileMode = rental_car` or `mode = taxi/walking` and the airport is the same on return, the backend's `lateArrivalMarkup` on the **return** flight should be flagged as a potential overstatement: the user's car is already parked there.

### Gap 5 — Wakeboard / activity cost gap
Activity-specific pricing (wakeboard session fees) is not surfaced by any current API. The system silently omits this cost.

### Gap 6 — bbox hotel search has no UI consumer
`getHotelsByBbox` exists in `api.ts` but nothing in the frontend calls it. The `TripGuide.tsx` accommodation tab only uses data from the AI suggestion.

---

## What this case study confirms is working

- `firstMileAccess` query params correctly flow through to `doorToTripPrice` on the outbound flight
- `auditedTotalCost` is correctly used as the honest flight total for the return
- `priceBreakdown` CostLine statuses correctly flag `MANUAL_CHECK_REQUIRED` for the NCE transfer
- The hotel bbox search returns priced, rated results with the `opentripmap+serpapi` provider merge
- The AI layer correctly surfaces Villeneuve-Loubet / Cagnes-sur-Mer as the cheapest wakeboard base


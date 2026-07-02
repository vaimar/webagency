# 🤖 Slumber AI Agents Orchestration

This document defines the specialized AI agents used by the **Slumber Travel API**. Each agent is designed to process data from Spring Boot services (Ryanair, OpenTripMap, AviationStack) and apply the **"Anti-Nightmare" (Zero-BS)** filter.

> **Last updated:** 17 May 2026  
> **Session notes:** `docs/session-2026-05-15.md`, `docs/session-2026-05-17.md`

---

## 🎨 1. The Senior UI Expert (Design System Guardian)
**Role:** Interface Integrity & Visual Clarity.  
**Mission:** Ensure the "Anti-Nightmare" philosophy is felt through the design.  
**Focus:** Typography, contrast, and information hierarchy.

### 📝 System Prompt
> "You are the **Senior UI Expert** at Vaimar WebAgency. Your design philosophy is **'Honest Minimalism'**.
> * **Clarity over Clutter:** Your job is to make complex travel data (shuttles, costs, times) look simple and stress-free.
> * **Visual Cues:** Use high-contrast elements to highlight 'The Catch' (vices cachés). Warnings should be elegant but impossible to miss.
> * **Frozen Summer Aesthetic:** Guide the frontend development towards a clean, nordic, and high-performance look (dark modes, crisp borders, fast-loading components).
> * **The 360 Rule:** Just like a perfect wakeboard rotation, the UI must be fluid. If a user has to think for more than 2 seconds to find a price, the design has failed."

### Key files
- `src/components/TruthCard.tsx` + `TruthCard.css` — CostLine status badges, structured price breakdown renderer
- `src/components/FlightCard.tsx` + `src/App.css` — hero card price hierarchy, manual check badge
- `src/index.css` — global Frozen Summer tokens

### Current design contracts
- Base fare = big, white headline (`flight-card--hero__price`)
- Honest total = sky blue secondary (`#7dd3fc`, `flight-card--hero__price--total`)
- Door-to-trip = indigo tertiary (`#a5b4fc`, only when `firstMileAccess` present)
- Manual check = red badge (`#fca5a5`, only when `manualCheckRequired: true`)
- CostLine badge palette: `✓ exact` green / `~ est.` amber / `⚠ check` red / `ℹ local info` indigo

---

## 🛡️ 2. The Travel Auditor (The "Anti-Cauchemar" Specialist)
**Role:** Data Validation & Truth Enforcement.  
**Input:** Raw flight and hotel data from `/api/flights` and `/api/hotels`.  
**Mission:** Detect "Hidden Vices" (Vices Cachés).

### 📝 System Prompt
> "You are the **Slumber Travel Auditor**. Your primary goal is to protect the user from travel nightmares.
> * **Airport Penalty:** If a flight involves BVA (Beauvais), MRS (Marseille), STN (Stansted), CIA (Ciampino), BGY (Bergamo) you MUST factor in `hiddenCostPenalty` and `timePenaltyMinutes`.
> * **The Catch:** The `theCatch` field summarises why a cheap ticket is a trap.
> * **Structured Breakdown:** `priceBreakdown` contains `CostLine` items with `status` flags. MANUAL_CHECK_REQUIRED means the backend could not validate the cost — surface this clearly.
> * **Budget Integrity:** Use `auditedTotalCost` (not `realWorldEntryPrice`) as the true out-of-pocket total. It includes `lateArrivalMarkup` and `hiddenCostPenalty`."

### Key backend fields
| Field | Meaning |
|---|---|
| `auditedTotalCost` | `realCost + hiddenCostPenalty + lateArrivalMarkup` — use this as the honest total |
| `priceBreakdown` | Structured `CostLine[]` stack — prefer over flat fields when present |
| `manualCheckRequired` | True when transfer fee or arrival time cannot be auto-validated |
| `logisticVerdict` | Prose summary of airport friction |
| `theCatch` | Worst-case one-liner for the user |

### Key frontend files
- `src/services/antiCauchemarPricing.ts` — `getAntiCauchemarPricingSummary()` — prefers `auditedTotalCost`
- `src/services/transferEstimate.ts` — Haversine-based taxi estimator (80 airports, 18 countries)
- `src/components/TruthCard.tsx` — renders all of the above

---

## ✈️ 3. The Flight Integrity Agent
**Role:** Cache Management & Pricing Honesty.  
**Input:** `FlightAvailable` schema objects.  
**Mission:** Prevent "False Advertising" (Pub Mensongère).

### 📝 System Prompt
> "You are the **Flight Integrity Agent**.
> * **Cache Validation:** If `fetchDate` is > 12 hours old, set `priceLabel` to `Estimated (Cached)`.
> * **Honest Math:** The canonical honest price is `auditedTotalCost` from `antiCauchemar`. Fall back to `realWorldEntryPrice`, then to base fare + recomputed extras.
> * **Sorting:** Always sort results by honest price, not marketing price.
> * **Door-to-trip:** `doorToTripPrice` is additive context only — never replaces `realWorldEntryPrice`. Show it as a separate indigo line when `firstMileAccess` is present.
> * **Provider fallback chain:** SerpApi → AviationStack → Kiwi. `/api/flight-search/departures` and `/api/flight-search/routes` accept a `provider` param."

### Key files
- `src/services/api.ts` — `FlightAvailable`, `AntiCauchemarAnalysis`, `PriceBreakdown`, `CostLine`, `FirstMileAccess`, `FlightSearchResult`
- `src/services/searchService.ts` — refresh + search + honest sorting
- `src/components/FlightCard.tsx` — price display, door-to-trip, manual check badge

---

## 🗺️ 4. The Legend Architect (The "Vaimar" Tone)
**Role:** Itinerary & Content Generation.  
**Input:** `/api/trips/itineraries` requests.  
**Mission:** Inject the **Frozen Summer** vibe into travel plans.

### 📝 System Prompt
> "You are the **Legend Architect**. You write itineraries that feel like a journey, not a brochure.
> * **Tone:** Cold, honest, but deeply useful (Inspired by 'Frozen Summer').
> * **Structure:** Focus on the 'Vibe' of neighborhoods.
> * **Rules:** If the user is on a budget, suggest local saunas or public parks instead of tourist traps. Use 'Sauna-Logic': high intensity followed by deep relaxation."

---

## 💼 5. The Agency Liaison (WebAgency Integration)
**Role:** Portfolio & Professional Presentation.  
**Mission:** Explaining technical challenges to potential clients.

### 📝 System Prompt
> "You represent **Vaimar WebAgency**. Your goal is to explain how the Slumber API solves complex travel logistics.
> * **Focus on:** API Orchestration, Real-time Cache Validation, User Personalization, and Structured Price Transparency.
> * **Key Selling Point:** 'We don't build apps that look good; we build apps that tell the truth.'
> * **Technical highlights:** Haversine-based taxi estimator, structured `PriceBreakdown` with `CostLine` statuses, `FirstMileAccess` door-to-trip pricing, Anti-Cauchemar audit pipeline."

---

## 🔄 Interaction Flow & Logic Matrix

| Phase | Agent in Charge | Goal |
| :--- | :--- | :--- |
| **Logic** | The Travel Auditor | Find the truth and hidden costs. Use `auditedTotalCost`. |
| **Data** | The Flight Integrity Agent | Ensure the prices aren't "fake". Use `priceBreakdown` when present. |
| **Experience** | **The Senior UI Expert** | Display the truth with CostLine badges and Frozen Summer palette. |
| **Narrative** | The Legend Architect | Tell the story of the journey (Frozen Summer vibe). |

---

### Implementation Cycle
1. **User Request** → `/api/ai/messages`
2. **The Auditor** checks for airport traps and hidden costs. `theCatch`, `manualCheckRequired`, `logisticVerdict`.
3. **The Integrity Agent** verifies cache freshness; applies `auditedTotalCost` as the honest price.
4. **The UI Expert** renders `PriceBreakdown` stack with status badges. Shows `doorToTripPrice` when present.
5. **The Architect** formats the final response with the proper "Anti-Nightmare" tone.
6. **Output** → `TripSuggestion` (including `theCatch`, `priceBreakdown`, and `antiCauchemar` analysis).

---

## Price Hierarchy — canonical decision tree

```
Priority 1:  antiCauchemar.auditedTotalCost       (backend-computed, includes lateArrivalMarkup)
Priority 2:  recompute: ticketPrice + shuttle + bag (frontend fallback)
Additive:    doorToTripPrice                        (never replaces, only extends, when firstMileAccess present)
Never use:   marketing fare as the headline price
```

## Frontend Transfer Estimator — `src/services/transferEstimate.ts`

- Haversine formula → straight-line GPS distance
- × 1.3 road overhead factor
- 80 airports × 18 country rate tables
- Night rate: arrivals 22:00–06:00
- Public transport alternatives included where known
- **Never added to the price automatically** — informational panel only

Validated routes:

| Airport | Road km | Daytime fare | Night fare |
|---|---|---|---|
| IBZ Ibiza → port | 8.2 km | ~€13 | ~€16 |
| BVA Beauvais → Paris | 89.4 km | ~€139 | — |
| STN Stansted → London | 63.6 km | ~€184 | — |
| DUB Dublin → city | 10.0 km | ~€14 | ~€21 |
| BCN El Prat → Barcelona | 17.9 km | ~€23 | ~€28 |

---

## Open work items

- [ ] `FirstMileAccess` input UI in `Home.tsx` search box — collapsible "I know my home → airport travel" section (revealed by Nice/Limerick car case study)
- [ ] Combined trip total surface — component that sums transport + hotel + (optional activities) into a single `€549.65` card (no such component exists yet)
- [ ] Hotel bbox search UI — `getHotelsByBbox` exists in `api.ts` but no UI consumer; TripGuide only uses AI-suggested hotels
- [ ] Hotel occupancy-aware pricing — hotel bbox API returns single nightly rate, not occupancy-specific; display should note "price may vary for group size"
- [ ] Return leg late-arrival overstatement — when `firstMileMode = rental_car` and return airport = departure airport, the late-night return warning is overstated; user's car is parked there
- [ ] Wakeboard / activity cost gap — activity session pricing is not in any API; must be surfaced as an "excluded from total" note
- [ ] Wire `/api/hotels/{xid}/enrichment` to `TripGuide.tsx` accommodation tab
- [ ] Wire `/api/flight-search/departures` + `/api/flight-search/routes` to a UI consumer
- [ ] Wire `/api/ai/providers` to provider selector in `Assistant.tsx`
- [ ] Backend `LATE_TAXI_EUR = 60.0` — override with OSRM live data or `firstMileAccess`
- [ ] GBP → EUR fixed rate in `transferEstimate.ts` (currently 1.17)

## Case studies

- `docs/case-study-nice-wakeboard.md` — Limerick family, 3-day Nice wakeboard trip, car-based airport access, `firstMileAccess` + bbox hotel search + AI routing. Confirmed working: `doorToTripPrice` on outbound, `auditedTotalCost` on return, `MANUAL_CHECK_REQUIRED` for NCE transfer.


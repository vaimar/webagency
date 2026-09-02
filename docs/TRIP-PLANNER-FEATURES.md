# Slumber Trip Planner — Feature Summary

A working log of the trip-planning capabilities built across the **webagency** (React/Vite frontend) and **slumber** (Spring Boot backend) repos. Everything here is wired end-to-end, tested, and verified live.

- **Frontend:** `/Users/vaimar/src/apps/webagency`
- **Backend:** `/Users/vaimar/src/apps/slumber` (runs on `:9090`; the Vite dev server proxies `/api` to it)
- **Backend tests:** 103 passing · **Frontend:** per-feature suites green · `tsc` + ESLint clean

---

## 1. Unified "Door-to-trip" explore flow

One search → a full trip in a tabbed dashboard, instead of four fragmented pages.

- **Route:** `/explore` (nav "Door-to-trip"). `/planner`, `/discover`, `/assistant` now redirect here.
- **Tabs:** Overview · Flights · Stays · Activities · Restaurants · 🗺 Map · 🔀 Self-transfer · ✨ AI Guide.
- **State:** `TripExplorationContext.tsx` owns the full untruncated `TripExplorationResponse`, persisted via `CacheProvider` so tab/route changes never lose it.
- **Endpoint:** `POST /api/trips/explore`.

**Key files:** `components/TripExploreWrapper.tsx`, `components/TripExploreDashboard.tsx`, `TripExplorationContext.tsx`, `services/tripExploreSelectors.ts`, `types/tripExploration.ts`.

---

## 2. Destination resolution (data-driven catalogs)

The backend `AirportResolutionService` was refactored from hardcoded Java to **JSON resource catalogs** — adding a destination is now a data edit.

- **Catalogs:** `city-destinations.json`, `wakeboard-destinations-*.json` (loaded at startup).
- **Added:** Ibiza (IBZ), Les Houches (GVA), and the Greek islands — **Paros (PAS), Santorini (JTR), Mykonos (JMK), Naxos (JNX), Athens (ATH)**.
- **Graceful input:** token-scan normalization ("Weekend in Ibiza" → IBZ); `DESTINATION_AIRPORT_REQUIRED` examples are derived from the catalogs (no stale lies).
- **Frontend directory:** `services/destinationDirectory.ts` mirrors the catalog for suggestions + airport hints.

---

## 3. Restaurants & Activities (real POIs)

- **Activities:** already in the explore payload (`activityCandidates`, OpenTripMap).
- **Restaurants:** new `HotelSearchService.findRestaurantPlaces()` (OpenTripMap `foods`), surfaced as `restaurantCandidates`.
- **UI:** `TripPoiTab.tsx` (shared) with a category humanizer (Bar, Café, Beach, Sports venue…) and distances.

---

## 4. AI Trip Guide (Gemini)

The old suggestion endpoints returned empty lists (no AI wired). Added a real one.

- **Service:** `AiTripGuideService` uses the working `AiOrchestrator` (Gemini → OpenAI → Grok fallback); robust JSON parse (strips code fences); **degrades honestly** to `generated:false` with a message; 3× retry for Gemini's transient 503s.
- **Endpoint:** `POST /api/trips/ai-guide` `{destination, activity}`.
- **UI:** ✨ AI Guide tab (`TripAiGuideTab.tsx`) — lazy-loads on open; renders summary, neighborhoods, activity tips, restaurant picks, day-by-day plan, local tips.
- **Caveat:** only Gemini is configured locally; set `REACT_APP_*`/backend keys to add fallback providers.

---

## 5. Fly-drive (multi-origin) flights

Solves the "Limerick → only bad Shannon flights" leak.

- **Data:** `origin-alternatives.json` (SNN→DUB 120 min, etc., gated on `firstMileAccess.mode = rental_car`).
- **`OriginAlternativesService`** + `TripExplorationService` fire a **parallel dual-origin search** and merge into `flightComparison`; alternative-origin flights are annotated (`alternativeOrigin`, `originDriveMinutes`, `originAccessNote`).
- **UI:** "Fly-Drive Alternative" badge + tip on Dublin departures; honest total time adds the drive.

---

## 6. Drive-to-airport cost (first mile)

- **Service:** `services/driveEstimate.ts` — real Irish route data (tolls M7 €2.30, M50 eFlow €3.80 unregistered), per-airport parking, transparent fuel model (7 L/100km × €1.75/L).
- **UI:** Overview "Door-to-trip estimate" adds a **Getting-to-the-airport breakdown** (fuel + tolls × 2 return + parking × nights) and **added drive time**.
- **Guardrails:** open-jaw split-airport alert (car parked ≠ home airport), zero-night clamp, strict 2-dp rounding.

---

## 7. Connecting-flight detail (stops & waits)

The SerpApi parser previously kept only the first/last segment.

- **Backend:** `FlightSearchService` now parses `layovers[]` (airport, wait, overnight) + `total_duration` onto `FlightResult` → `UnifiedFlightOption` (`stops`, `totalDurationMinutes`, `layovers`).
- **UI:** each flight row shows **Direct** or **🔁 2 stops · via FRA (2h06 wait), ATH (2h42 wait) · 10h25 total**.
- **Note:** routes cached before this change show "Direct" until the cache expires (~24h); fresh searches get full detail.

---

## 8. Self-transfer / hidden-city routing 🔀

DIY 2-leg itineraries airlines hide (e.g. **SNN→STN→IBZ ≈ €154 vs €532 direct**).

- **Service:** `SelfConnectService` + `POST /api/trips/self-connect`. Two discovery sources merged (dedup by hub, cheapest, only options beating direct):
  1. **SerpApi** curated hub fan-out.
  2. **Ryanair route network** — `RyanairService.getDestinationsFrom(iata)` lists real destinations from an airport (SerpApi can't); candidate hubs = `destinationsFrom(origin) ∩ destinationsFrom(destination)`; fares via `getCheapestFareForDate`.
- **Logic:** same-day catchable (≥150-min self-transfer buffer) vs **overnight** (+ hub-hotel estimate).
- **UI:** 🔀 Self-transfer tab (`TripSelfConnectTab.tsx`) — lazy-loaded; per-leg detail, savings vs direct, overnight cost, and a **self-transfer risk warning** (separate tickets aren't protected).

---

## 9. Greek Islands Tour (Island Hop) 🚢

Open-jaw island hopping — fly in to one island, ferry between, fly home from another.

- **Route:** `/island-hop` (nav "Island Hop"). Page: `IslandHop.tsx`.
- **Service:** `IslandHopService` + `POST /api/trips/island-hop` (+ `GET .../templates`). Reuses the island catalog + flight search; assembles **fly-in + inter-island ferries + open-jaw fly-out + per-island stays**.
- **Curated ferry catalog** (Cyclades pairs → duration + €) and **3 templates** (incl. Santorini · Paros · Athens).
- **Editable:** add/remove islands, reorder, change nights → auto re-costs.
- **Per-island hotels + booking:** real hotels fetched per island (OpenTripMap+SerpApi) with name, price/night, rating, and a **Book** link; the lead live rate drives the stay total (shows "(live rate)" vs "(est.)"); plus Booking.com/Airbnb/Hostelworld search per island.
- **Verified:** Santorini→Paros→Athens, 7 nights ≈ **€2,057** (flights + ferries + real stays).
- **Caveats:** ferries & some stays are curated/estimated (no ferry API); non-enriched hotels show "Rate pending" but still link out.

---

## 10. Partner booking links

- **Component:** `components/BookingLinks.tsx` (Ryanair · Google Flights · Skyscanner · Kiwi) via `services/affiliates.ts` — works without affiliate IDs, appends them if `REACT_APP_*` are set.
- **Wired into:** every Flights-tab row, each self-transfer leg, and the Island Hop fly-in/out.
- **Footer fix:** dead `<span>` links (pointer cursor, no href) → real anchors / mailto.

---

## 11. Interactive map 🗺

- **`TripMapTab.tsx`** (maplibre-gl vector tiles — MapTiler via `REACT_APP_MAPTILER_KEY`, keyless OpenFreeMap dark style as fallback; lazy-loaded to keep the test runner happy and code-split the GL bundle). Color-coded DOM markers: ride spot, stays, activities, restaurants — auto-fit bounds, popups, legend, WebGL context destroyed on unmount. `getMapPoints()` selector filters null/`0,0` sentinels.

---

## 12. Verdict-first explore result 🧭

The one answer the shopper came for, above the tabs — value is now the headline instead of tab #7.

- **Component:** `components/TripVerdictCard.tsx`, rendered by the dashboard shell above the tab bar (visible on every tab). Selector: `getTripVerdict()` in `services/tripExploreSelectors.ts` — pure recomposition of payload data already on screen elsewhere.
- **Headline:** the honest door-to-trip total (shared `getFirstMileDrive()` + `getTripCostEstimate()` with the *selected* flight, so verdict and overview package can never drift). Partial pricing → "At least €X … a floor".
- **Savings (green, ≥€5, sorted by amount, each with a jump-to-tab CTA):**
  1. **Fly-drive** — cheapest fly-drive departure vs cheapest home-airport departure.
  2. **Same-flight quote spread** — widest gap across `sameFlightComparisons` quotes (booking channel matters).
  3. **Self-transfer** — best `savingsVsDirectEur` once routing is loaded.
- **Catches (amber):** advertised vs audited fare gap, the backend's `theCatch`, late-night arrival (only when the backend worded no catch itself).
- **Self-transfer teaser:** "Check routing" runs `/api/trips/self-connect` **in place** (no tab switch) and folds the saving into the verdict; honest "direct already wins" when nothing beats it.
- **Verified live:** Limerick → Ibiza rendered "At least €562 door-to-door · SAVE €323 — Fly-drive via DUB (€599 SNN vs €276 DUB)" + both catches.
  4. **Same-room quote spread** (see §13) — best-scored stay with per-OTA quotes, spread × nights, "See stays →".

## 13. Free per-OTA hotel rates (Xotelo) 💶

Fills the "Rate pending" gap and powers "same room, cheaper via X" — **zero API spend** (keyless TripAdvisor-derived rates), working even while SerpApi returns 429.

- **Backend:** `XoteloRateService` (slumber) — `GET data.xotelo.com/api/rates` in EUR, DB-cached 24h, sorted cheapest-first; every failure degrades to empty and never blocks the hotel pipeline. Wired into `HotelSearchService.maybeEnrichHotels` as a second pass **independent of the SerpApi toggle/cap**; cheapest OTA fills a missing `pricePerNight`; full quote list lands on `HotelResult.rateQuotes`. Cache variant bumped (`…+xotelo-v1`) so pre-Xotelo hotel lists aren't served.
- **Key catalog:** `resources/tripadvisor-hotel-keys.json` — Xotelo's `/list` & `/search` discovery is not usable keylessly, so TripAdvisor keys (`g{geo}-d{hotel}`) are curated: find in the TripAdvisor URL, **verify once against /rates** (error null), commit with the OpenTripMap name(s) + coords. Name match is accent/case-insensitive; coordinates veto same-name hotels elsewhere. Coverage: **239 hotels across all 22 destinations with coordinates** (17 cities + 5 wakeboard venues), every key verified against /rates. Bulk harvesting: `slumber/scripts/harvest-tripadvisor-keys.py` uses the Tripadvisor Terra API (real host `terra.tripadvisor.com/api`, auth header `X-API-KEY`; the documented `category=HOTEL` filter does NOT work — hotels are identified by the `Hotel_Review-g…-d…` URL shape) with a tight 150 m nearest-match around each OpenTripMap hotel, a hard Terra-call budget cap, Xotelo verification per key, and a name-overlap cleanup that drops neighbor-mismatches (105 dropped in the first full run — a no-TA guesthouse otherwise inherits the identity of the hotel next door). Paris was also added to city-destinations.json — previously route-only via the wakepark.
- **Curated TripAdvisor identity:** catalog entries also carry `rating` / `reviewsCount` / `reviewNote` captured from the hotel's TripAdvisor page at key-verification time. Applied **only when live SerpApi enrichment found nothing**, and even when the hotel isn't quoting rates for the probe dates. Stays cards render the review snippet in quotes; cache variant bumped to `+xotelo-v2`. Verified live: all Ibiza catalog stays show price + stars(count) + snippet, e.g. hotel playasol maritimo €198 · 4★ (1491) · "Friendly, spotless and beachfront…".
- **Frontend:** `HotelResult.rateQuotes` type; stays tab shows a 💶 "Same room across N channels" pill; the verdict adds a **same-room saving** from the best-scored stay *with quotes* (lead gem may be an unpriced apartment), spread × nights.
- **Verified live:** Ibiza stays went from all-null rates to e.g. hotel central playa **€195 (Agoda) vs €236 (Trip.com)** across 5 channels — verdict: "Same room, €123 cheaper via Agoda.com" over 3 nights. SerpApi was 429-rate-limited during the test; Xotelo filled anyway.
- **Bonus endpoint (unused yet):** `GET /api/heatmap?hotel_key=…&chk_out=…` → cheap/average/high price days — future "go a week later, save €X" material.

## Endpoint reference

## 14. Spot-first flow — the product spine 🧵

The guided cascade that puts the bricks together: **departure → activity → country → spot → priced trip**.

- **Entry:** `/spots` (nav "Find a spot", `SpotFinder.tsx`). Step 1 leaving-from (Limerick/Dublin/Cork/Galway — the four home regions the drive estimator knows), step 2 activity, step 3 country, step 4 spot (compact rows: name, tow type, ways-in icons — photo cards removed on purpose).
- **Ways in:** selecting a spot shows the curated multimodal access (`GET /api/destinations/access`) — e.g. EXO 84: TGV via Avignon (~30 min drive) or fly MRS (~1h up the A7).
- **The handoff:** "Plan this trip from {city}" → `/explore?origin=…&destination=…&activity=…`; `TripExploreWrapper` reads the params (plain `window.location.search`, no router hook), pre-fills, and **auto-runs** the explore engine — landing on the verdict-first dashboard with flights, first-mile costs, and stays priced from the harvested TripAdvisor keys.
- **Verified live:** Limerick → wakeboard → France → EXO 84 → **€558 door-to-door · 3 nights**, "Same room €66 cheaper via Booking.com" (a harvested-key hotel), the €89→€138 fare catch, and the Marseille shuttle warning.
- **Fix along the way:** anonymous 401s no longer hijack navigation to `/profile` (`ProfileContext.handleAuthFailure` now only redirects when a session actually existed) — this was breaking direct URL loads of `/spots` and `/explore`.
- **Coverage note:** curated spots currently wakeboarding FR/ES only; a new country (e.g. Netherlands/Almere: fly AMS + train) is one JSON entry with `activity`, `country`, `access[]`.

## Endpoint reference

| Endpoint | Purpose |
|---|---|
| `POST /api/trips/explore` | Full door-to-trip: flights (fly-drive), stays, activities, restaurants |
| `POST /api/trips/ai-guide` | AI-authored recommendations (Gemini) |
| `POST /api/trips/self-connect` | Self-transfer 2-leg routing (SerpApi + Ryanair) |
| `POST /api/trips/island-hop` · `GET .../templates` | Open-jaw island-hop tour + templates |
| `GET /api/destinations/spots?activity=&country=` | SpotFinder cascade: curated spots per activity/country |
| `GET /api/destinations/access?destination=` | Curated multimodal ways in for a spot |

## Backend dev notes

- Spring Boot devtools **hot-restarts** on `./mvnw compile` — never kill the running process to apply changes.
- Destination/ferry/toll/hub data live in JSON resources or small in-code catalogs (the "hardcode some values" pattern), kept explicit and labelled as estimates.
- Agent skills regenerate from `.agent-skills/manifest.json` via `scripts/generate-claude-skills.mjs`, wired into a Maven `generate-resources` step.

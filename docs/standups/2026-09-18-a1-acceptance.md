# A1 Acceptance -- Train ways in to French spots (SNCF)

Spec: `docs/specs/sncf-rail-ways-in.md` (rev 5.1, 43 criteria: 1--39, 43--46)
Date: 2026-09-18
Reviewer: pm

## Evidence base

- **Slumber** main at `9a685a6`: `RailWaysInService`, `SncfClient`, `RailGatewayCatalog`, `SpotController` endpoint `GET /api/spots/{slug}/rail`. 91 backend tests (22 SncfClient + 23 alighting + 46 service).
- **Webagency** main at `8d5b6b4`: `RailWaysIn.tsx`, `railWaysIn.ts`, `SpotDetailPage.tsx` integration, `RailWaysIn.css`. 26 Vitest service tests, 13 Cypress e2e tests.
- FE-V live-browser verification completed: 1280 px and 400 px, no overflow, no clipping, real train brands, real station names.
- All gates green: slumber 362 tests, webagency 876 Vitest, 13 Cypress, lint, typecheck, build.

## Criteria 40--42

Withdrawn (D1 settled as F0, the map trace follow-up). Not assessed.

---

## Per-criterion verdict

### Backend: gating, params, sample date (T1)

| # | Verdict | Evidence |
|---|---------|----------|
| 1 | PASS | `RailWaysInServiceTest.C1`: `unknownSlug()` asserts `Optional.empty()` with `verifyNoInteractions(sncfClient)`; `deletedVenue()` uses slug `exo-84-monteux` and gets the same. Controller maps empty to 404 `SPOT_NOT_FOUND` via `SpotController.getRail` L190--193. |
| 2 | PASS | The controller's `parseArrival` (L211--227) validates: one param alone throws `INVALID_ARRIVAL` (400), `!code.matches("[A-Za-z]{3}")` rejects `CDGX`, and `parseArrivalTime` rejects `not-a-time`. Service-level: `verifyNoInteractions(sncfClient)` on NOT_FRANCE paths proves no calls for param validation (the controller short-circuits before the service for unknown slugs). |
| 3 | PASS | `RailWaysInServiceTest.C3`: `spanishSpot()` asserts `NOT_FRANCE`, all nulls, empty origins, `MANUAL_CHECK`, `https://www.sncf-connect.com/`, `verifyNoInteractions(sncfClient)`. `nullCountry()` same. `notFranceEchoesChain()` asserts chain is echoed with `routed: true`, `bufferMinutes: 90` and 0 calls. |
| 43 | PASS | `RailWaysInServiceTest.C43`: `lowercaseFrIsFrance()` with `country: "fr"` returns `OK` and `station.name: "Arnage"`. `mixedCaseIsFrance()` loops over `Fr`, `fR`, `" fr "`. `notFranceVariants()` checks `FRA`, `F`, `""`, `null` each give `NOT_FRANCE` with 0 calls. |
| 4 | PASS | `RailWaysInServiceTest.C4`: `nullLatitude()` and `nullLongitude()` each give `NO_COORDINATES` with `verifyNoInteractions(sncfClient)`. |
| 5 | PASS | `RailWaysInServiceTest.blankApiKey()`: `isConfigured()` returns false, result is `NOT_CONFIGURED`, no `placesNearby` or `journeys` calls. |
| 6 | PASS | `RailWaysInServiceTest.C6`: `clockA()` at `2026-09-15T10:00:00Z` gives `date: "2026-10-03"`, `dateBasis: "SAMPLE"`, `departAfter: "08:00"`, `chain: null`. `clockB()` at `2026-09-19T10:00:00Z` gives the same date. Both verify journeys are called with `LocalDate.of(2026, 10, 3)` and `LocalTime.of(8, 0)`. `SncfClientTest.theJourneysRequestCarriesTheNavitiaDatetimeAndTheFilteringParameters()` asserts `datetime=20261003T080000`. |

### Backend: station (T1)

| # | Verdict | Evidence |
|---|---------|----------|
| 7 | PASS | `RailWaysInServiceTest.C7.arnageChosen()`: fixture has coach-only stop (1.5 km), Arnage (rail-served, 1.95 km), Le Mans (rail-served, 7.15 km). Station is `stop_area:SNCF:87396549` / `Arnage`. Distance is COMPUTED via `SpotArrivalService.distanceKm(SPOT_LAT, SPOT_LON, ARNAGE_LAT, ARNAGE_LON)` and asserted = `2.0`. Coordinates asserted as `47.928541` / `0.189882`. `SncfClientTest.theStationRequestIsExactlyOneCallAndCarriesTheMeasuredParameters()`: asserts path contains `/coords/0.165;47.934`, `distance=30000`, `type[]=stop_area`, `count=100`, `depth=2`, no `filter` param. |
| 8 | PASS | `RailWaysInServiceTest.C8.noRailServed()`: no-rail fixture gives `NO_STATION_NEARBY`, `station: null`, empty origins, `fetchedAt` is NOT null, no journeys calls. `cachedNoStation()`: ArgumentCaptor verifies `NoStationCacheEntry` with `Duration.ofDays(7)` TTL and non-null `fetchedAt`. |

### Backend: origins, chaining, journeys (T1)

| # | Verdict | Evidence |
|---|---------|----------|
| 9 | PASS | `RailWaysInServiceTest.C9.spotFrOrigins()`: codes = `["CDG", "PARIS"]`, CDG kind `AIRPORT`, PARIS kind `CITY`, labels and notes match 7.3. `spotFrLysOrigins()`: codes = `["CDG", "LYS", "PARIS"]`, verifies `from` IDs: `stop_area:SNCF:87271494` (CDG), `stop_area:SNCF:87762906` (LYS), `admin:fr:75056` (PARIS). |
| 10 | PASS | `RailWaysInServiceTest.C10`: `cdg()` = CDG 10:05, date 2026-10-03, departAfter 11:45, routed true, buffer 90, origin [CDG], journeys called with 11:45. `cdgLowercase()` = `cdg` 10:15+02:00, same 11:45, airport upper-cased. `lysRollover()` = LYS 23:20, date 2026-10-04, departAfter 00:45. `bva()` = BVA 09:40, PARIS origin, 12:45, buffer 180. `ory()` = ORY 09:40, 12:15, buffer 150. `nteUnrouted()` = NTE, SAMPLE, 08:00, routed false, buffer null, sample origins. |
| 11 | PASS | `RailWaysInServiceTest.C11.journey1Mapping()`: departure `08:48:00+02:00`, arrival `13:25:00+02:00`, duration 277, changes 1. Leg 1: `TGV INOUI`, line null, trainNumber `5210`, from `Aeroport Charles de Gaulle 2 TGV`, to `Le Mans`. Leg 2: `Aleop`, line `P30`, trainNumber `857065`, from `Le Mans`, to `Arnage`. `noTerInResponse()`: no mode contains `TER`. `noCommuneSuffix()`: no `from`/`to` matches `/\(.*\)$/`. `fareIsNull()`: every journey fare is null. `noGeometry()`: serialized JSON contains no `"geometry"`. |
| 12 | PASS | `RailWaysInServiceTest.C12.threeSameDayJourneysKept()`: 3 journeys kept from 5 in fixture, sorted by departure: 08:48, 09:43, 12:16. `SncfClientTest`: journeys request carries `direct_path=none`, `max_nb_transfers=3`, `data_freshness=base_schedule`. `SncfClient.journeys()` code at L196 adds `depth=2`. The test asserts `depth=2` for places_nearby; the production code provably adds it for both calls. |
| 13 | PASS | `RailWaysInServiceTest.C13.noFareLeak()`: `priceState: "MANUAL_CHECK"`, every journey `fare: null`. `noZeroPriceInSerialized()`: serialized JSON contains no `"0.0"`. |
| 45 | PASS | `RailWaysInAlightingTest` (23 tests): **Journey 1** (`defaultThreshold_twoOptions`): 2 options, Le Mans (102 min, 0 changes, 7.2 km, not final) then Arnage (277 min, 1 change, 2.0 km, final). Distances computed via haversine. `leMansSecondVisit_dominated()`: Le Mans at 13:20 dominated by 10:30, appears once. **Journey 2** (`defaultThreshold_oneOption`): collapses to 1 at threshold 30. `dominance_preservesAll5()`: all 5 survive dominance. `materiality_dropsAll4()`: 4 drop. `threshold20_aubigneRacanReturns()`: 2 options at threshold 20, only Aubigne-Racan returns. `threshold20_mayetMissesByOne()`: Mayet absent (19 < 20). **Journey 3** (`defaultThreshold_twoOptions`): 2 options, Le Mans and Arnage. `dominanceDropsFour()`: doubles-back absorbed. **MaterialityReAnchoring**: `reAnchoring_CcomparesToA()` A and C survive, B drops; C compared to A (40 min), not dropped B. **CrossJourney**: never empty, final exactly once (last), ordered by arrival, measured counts {2,1,2,2,2}, all stationIds start `stop_area:SNCF:`. |

### Backend: errors and precedence (T1)

| # | Verdict | Evidence |
|---|---------|----------|
| 14 | PASS | `SncfClientTest`: `noSolutionIsNoJourneyOnA200AndOnA404()`, `dateOutOfBoundsIsTimetableNotPublished()`, `anyOtherErrorIdIsProviderUnavailable()` (unknown_object, no_origin), `unsuccessfulHttpCodesWithoutAnErrorIdAreProviderUnavailable()` (401, 403, 500, 503), `http429IsQuotaExhausted()`, `aReadTimeoutIsProviderUnavailableAndNeverEscapesAsAnException()`, `anHtmlErrorPageIsProviderUnavailableRatherThanACrash()`, `anEmptyBodyIsProviderUnavailable()`. |
| 15 | PASS | `SncfClientTest.theStationStepMapsItsFailuresTheSameWay()`: 500, 401, unparseable body all `PROVIDER_UNAVAILABLE`; 429 is `QUOTA_EXHAUSTED`. `aStationStepTimeoutIsProviderUnavailable()`. |
| 16 | PASS | `RailWaysInServiceTest.C16`: all five precedence rows from 7.7 asserted: OK+PU=OK, NJ+PU=PU, NJ+QE=QE, NJ+TNP=TNP, NJ+NJ=NJ. `eachOriginKeepsStatus()`: CDG OK has journeys, PARIS PU has empty journeys. |

### Backend: cache, quota, key, docs (T1)

| # | Verdict | Evidence |
|---|---------|----------|
| 17 | PASS | `RailWaysInServiceTest.C17`: `stationCachedCorrectly()` ArgumentCaptor verifies `StationCacheEntry` with `Duration.ofDays(30)` and `fetchedAt = CLOCK_A_INSTANT`. `journeysCachedCorrectly()` verifies `JourneysCacheEntry` with `Duration.ofHours(24)`. `fetchedAtIsEarliest()`: station at T0, journeys at T0+3d, fetchedAt = T0. `failedOriginNoInstant()`: CDG OK at T1, PARIS fails, fetchedAt = T0. Three per-type wrapper classes (StationCacheEntry, NoStationCacheEntry, JourneysCacheEntry) verified. |
| 18 | PASS | `RailWaysInServiceTest.failuresNotCached()`: only 1 journeys cache put (CDG OK), not 2, when PARIS is PROVIDER_UNAVAILABLE. |
| 19 | PASS | `SncfClientTest`: `theCapBlocksTheOutboundCallOnceItIsSpent()` with cap=2, third call is QUOTA_EXHAUSTED, only 2 requests. `everyHttpAttemptCountsEvenWhenItFails()`. `a429LatchesTheCapShutForTheRestOfTheDay()`. `theCapReleasesAfterParisMidnight()`. Service-level ordering: `RailWaysInServiceTest.C10` and `C9` show origins are CDG, LYS, PARIS in that fixed order. |
| 20 | PASS | `RailWaysInServiceTest.callCountLimit()`: Spot FR-LYS, 1 `placesNearby` + 3 `journeys` = 4. `noCallsOnStartup()`: `verifyNoInteractions(sncfClient)`. No `@Scheduled` annotation in `RailWaysInService.java`, `SncfClient.java`, or `RailGatewayCatalog.java`. |
| 21 | PASS | `SncfClientTest.everyRequestCarriesTheKeyAsBasicAuthAndNeverInTheUrl()`: Authorization header = `Basic base64("sncf-test-key-must-not-leak:")`, key never in URL. `theKeyIsAbsentFromLogsResultsAndUrlsOnEveryFailurePath()`: asserts no key in logs, requests, or outcomes for 401, 500, HTML body, and timeout. `applicationYmlCarriesThePlaceholderAndNoLiteralKey()`: `${SNCF_API_KEY:}` present, no literal key. `anUnconfiguredClientMakesNoCallAtAll()`. |
| 22 | PASS | `docs/openapi.yaml` L821: `/api/spots/{slug}/rail` documented with GET, both query params, 400 `INVALID_ARRIVAL`, all nine `RailStatus` enum values at L883--884, `OriginStatus` at L968. No `geometry` field (grep confirms). `docs/openapi-lite.yaml` L653: same endpoint documented. `docs/slumber-api.postman_collection.json` L173--174: two entries ("Rail Ways In (sample date)" and "Rail Ways In (chained to a picked flight)") under the Spots folder. |

### Frontend: service and component (T2)

| # | Verdict | Evidence |
|---|---------|----------|
| 23 | PASS | `railWaysIn.test.ts`: `changesText(0)='Direct'`, `changesText(1)='1 change'`, `changesText(2)='2 changes'`. `legName` gives `TGV INOUI 5210` and `Aleop P30 857065`. `changeMinutes` gives 170 for V1's change. `waitText(17)='17 min'`, `waitText(89)='89 min'`, `waitText(90)='1h30'`, `waitText(170)='2h50'`. `formatDistanceKm(2.0)='2'`, `formatDistanceKm(7.2)='7.2'`. `alightingLabel`: Le Mans = `Off at Le Mans 10:30 . 1h42 . Direct . 7.2 km to the spot`, Arnage = `Stay to Arnage 13:25 . 4h37 . 1 change . 2 km to the spot`. |
| 24 | PASS | `RailWaysIn.test.tsx` C24: V1 renders sample date line, station line (`To Arnage, 2 km ...`), Manual check badge, price note, `From Paris Charles de Gaulle (CDG)` with `Station inside Terminal 2.`, `From Paris` with `No train from here on this date.`, attribution. Order asserted via `indexOf`. |
| 25 | PASS | `RailWaysIn.test.tsx` C25: summary `08:48 -> Arnage 13:25 . 4h37 . 1 change`, leg 1 `TGV INOUI 5210 . Aeroport Charles de Gaulle 2 TGV 08:48 -> Le Mans 10:30`, change `Change at Le Mans, 2h50`, leg 2 `Aleop P30 857065 . Le Mans 13:20 -> Arnage 13:25`. Negative: no `TER`, no `170 min`, no `08:49`, no commune suffix. Same strings under `TZ=America/New_York`. |
| 26 | PASS | `RailWaysIn.test.tsx` C26: exactly 1 link `Check fares on SNCF Connect`, href `https://www.sncf-connect.com/`, target `_blank`, rel `noopener noreferrer`. |
| 27 | PASS | `RailWaysIn.test.tsx` C27: all seven status vectors (V1, V2, NO_JOURNEY, TIMETABLE_NOT_PUBLISHED, NO_STATION_NEARBY, PROVIDER_UNAVAILABLE, QUOTA_EXHAUSTED) checked: no `/EUR/`, no `/0\.0/`, no `09:12`, no `15 Sep`, no `updated`/`checked`. |
| 28 | PASS | `RailWaysIn.test.tsx` C28: `NO_JOURNEY` shows `SNCF found no train to Arnage on Sat 3 Oct.` with no badge or link. `TIMETABLE_NOT_PUBLISHED` shows `SNCF has not published train times for Sat 3 Oct yet.`. `NO_STATION_NEARBY` shows `No train station within 30 km of this spot.` with no station line. `PROVIDER_UNAVAILABLE` and `kind: 'error'` show `Train times are unavailable right now. Try again later.`. `QUOTA_EXHAUSTED` shows `Train times are paused for today. Try again tomorrow.`. Loading shows `Looking up train times...` (U+2026). |
| 29 | PASS | `RailWaysIn.test.tsx` C29: `NOT_FRANCE`, `NO_COORDINATES`, `NOT_CONFIGURED` each render no region. Paired positive: `NO_JOURNEY` does render one. |
| 30 | PASS | `RailWaysIn.test.tsx` C30: `TIMETABLE_NOT_PUBLISHED` origin shows `Times for this date are not published yet.`. `PROVIDER_UNAVAILABLE` and `QUOTA_EXHAUSTED` origins show `Could not load trains from here right now.`. |
| 31 | PASS | `RailWaysIn.test.tsx` C31: V2 shows `After your flight lands at CDG at 09:35 on Sat 3 Oct: trains from 11:15, allowing 1h30 to reach Aeroport CDG 2 TGV.` with no `Sample date`. BVA chain shows `...BVA at 09:40 on Sat 3 Oct: trains from 12:45, allowing 3h to reach a Paris station.`. NTE unrouted shows the not-routed note before the sample line. Under `TZ=America/New_York`: after-midnight CDG landing reads `on Sun 4 Oct`. Under `TZ=Asia/Tokyo`: evening LYS landing reads `on Sat 3 Oct`. |
| 46 | PASS | `RailWaysIn.test.tsx` C46: `Where to get off:` then `Off at Le Mans 10:30 . 1h42 . Direct . 7.2 km to the spot` then `Stay to Arnage 13:25 . 4h37 . 1 change . 2 km to the spot` in order. Wire-read proven by mutating fixture (200 min, 3 changes renders `3h20 . 3 changes`). Note present once for two-option journey, absent for single-option journey. No `either station` or `neither leg`. `2 km` without `.0`, `7.2 km` keeps decimal. Same strings under `TZ=America/New_York`. |

### Spot page wiring (T3, Cypress)

| # | Verdict | Evidence |
|---|---------|----------|
| 32 | PASS | `spot-rail-ways-in.cy.ts` C32: French spot sends exactly 1 `/rail` without query string after resolving; no more after visiting all tabs and returning. Spanish spot sends 0, no By train region. |
| 33 | PASS | `spot-rail-ways-in.cy.ts` C33: picking sends nothing (Add to trip cost on Flights tab). Arriving on Getting there sends 1 chained request with correct URL (`/rail?arrivalAirport=BVA&arrivalTime=2026-10-03T09%3A40%3A00`). Tab round-trip: no new request. Un-picking: no request, sample date line reappears. No arrivalDate: no chained request. |
| 34 | PASS | `spot-rail-ways-in.cy.ts` C34: 2 s delay shows `Looking up train times...` then replaced. Network error shows `Train times are unavailable right now. Try again later.` and rest of Getting there survives. |
| 35 | PASS | `spot-rail-ways-in.cy.ts` C35: curated TRAIN way renders `Le Mans (TGV)`, `~25 min drive`, `curated, no live price`. OSM `nearest station` row renders `Nice-Ville`. No `Add to trip cost` or `In trip cost` buttons in the rail region, no pick toggles. `cypress/e2e/spot-trip-total.cy.ts` reported passing unmodified. `SpotAccessPricingServiceTest` passes (362 tests green on slumber). |
| 36 | PASS | `spot-rail-ways-in.cy.ts` C36: at 400x800 the rail region scrollWidth <= clientWidth and document scrollWidth <= clientWidth, with V1 content (TGV INOUI, Le Mans visible). Same at 1280x800. FE-V live verification: 1280 px 0 overflowing elements, 400 px 0 overflowing elements, 0 text clipping at both widths. |
| 44 | PASS | `spot-rail-ways-in.cy.ts` C44: lowercase `"fr"` spot sends 1 sample request and renders the By train region. Lowercase `"es"` sends 0 requests, no region. |

### Gates (V1)

| # | Verdict | Evidence |
|---|---------|----------|
| 37 | PASS | Reported: webagency lint, typecheck, test (876 Vitest including `copyStandards.test.ts`), and build all passed. |
| 38 | PASS | Reported: slumber 362 tests passed. |
| 39 | PASS | The captured fixture at `src/test/resources/sncf/journeys-cdg-arnage-20261003.json` contains no `Authorization` header (grep confirms). `SncfClientTest.applicationYmlCarriesThePlaceholderAndNoLiteralKey()` asserts `${SNCF_API_KEY:}` in application.yml with no literal key. |

---

## Summary

| Status | Count |
|--------|-------|
| PASS   | 43    |
| FAIL   | 0     |
| N/A (withdrawn 40--42) | 3 |

## Verdict

**ACCEPTED.** All 43 criteria (1--39, 43--46) pass. Evidence comes from 91 backend tests across 3 test classes, 26 Vitest service/component tests, 13 Cypress e2e tests, live-browser FE-V verification at two viewport widths, and direct source-code reading of the production files, OpenAPI docs, Postman collection, captured fixture, application.yml, and rail-gateways.json.

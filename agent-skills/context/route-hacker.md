# Route Hacker — DB schedule-graph self-transfer engine

> **Added:** 2026-07-23. Sibling to the live `SelfConnectService`; the live/scraper
> search paths are untouched. This doc is the handoff for the whole Route Hacker
> module (backend engine + AviationStack ingestion + quota guard + frontend tab).

## What it is

A local flight-connection engine that assembles **1-stop self-transfer itineraries**
(`Origin → Hub → Destination`) from a **pre-loaded schedule grid** in Postgres —
**zero paid API calls at query time**. It is a *sibling* to the live `SelfConnectService`
(`POST /api/trips/self-connect`, SerpApi/Ryanair, real fares); this one answers
instantly from ingested timetables and returns schedule-only itineraries (`price:null`),
with live pricing fetched on demand afterwards.

## Backend (repo: `/Users/vaimar/src/apps/slumber`)

| File | Role |
|---|---|
| `model/FlightSchedule.java` | Entity: airlineCode, flightNumber, origin, destination, departureTime, arrivalTime, **operatingDaysMask** (7-bit: `1<<(DayOfWeek.getValue()-1)`, Mon=bit0…Sun=bit6), validFrom/To. Helpers `bit()`, `maskOf()`, `operatesOn()`, `isValidOn()`, `crossesMidnight()`. Long IDENTITY id (matches `FlightAvailable`, not the spec's UUID). |
| `repository/FlightScheduleRepository.java` | `findDeparturesValidOn`, `findLegValidOn`, `existsByOrigin`, `findMasksByOrigin` (coverage), `findFirstBy…DepartureTime` (natural-key upsert). |
| `service/SelfTransferRoutingService.java` | The engine + nested `ItineraryDTO` / `FlightLegDTO` records. |
| `controller/HackerRouteController.java` | The 3 endpoints (below). |
| `request/AviationStackFutureDto.java` | Maps `/v1/flightsFuture` JSON (the ingestion source). |
| `request/AviationStackTimetableDto.java` | Maps `/v1/flights` (legacy, **not used by ingestion** now). |
| `service/AviationStackScheduleClient.java` | Thin client; `fetchFutureDepartures(iata,date)` is the live one. Reuses `aviationstack.api.*` config + shared OkHttp/Jackson beans. |
| `service/AviationStackIngestionService.java` | Weekly ingestion + cache-first / quota guard / rate-limit handling. |
| `model/ApiUsageCounter.java` + `repository/ApiUsageCounterRepository.java` | Persisted monotonic call counter (NOT the TTL `CachedApiResponse`). |

### Endpoints (match existing `/api/trips` convention — NO `/api/v1`)
- `GET  /api/trips/hacker-routes?origin=&destination=&date=` → `List<ItineraryDTO>` (schedule-only, `price:null`, `status:"SCHEDULE_ONLY"`).
- `POST /api/trips/schedules/ingest?airport=XXX[&force=true]` → `IngestionResult{airport,inserted,merged,skipped,status,apiCallsUsed}`.
- `POST /api/trips/fetch-price` body `{leg1Origin,leg1Destination,leg2Origin,leg2Destination,date}` → per-leg + combined live price (delegates to existing `FlightSearchService.getFlightsBetween`, serpapi).

### Itinerary types (2026-07-23)
`findHackerRoutes` returns TWO kinds of `ItineraryDTO`, distinguished by `type`:
- **`DIRECT`** — a single Origin → Destination flight (`hub`/`leg2` null, `layoverMinutes` 0). Extracted from the same `findDeparturesValidOn(origin)` list (rows whose dest == final dest); no layover/curfew rules applied, all directs kept.
- **`SELF_TRANSFER`** — the 1-stop Origin → Hub → Destination pairing (rules below), capped at 25.
Combined list sorted by total journey time (directs, being shortest, lead). Frontend has an All / Direct / 2-flights filter.

### Codeshare merge (2026-07-23)
The timetable stores one row per marketing carrier, so a single physical flight appears many times (same route + same dep & arr time, different `airline_code`) — e.g. `BCN→MAD 10:35→12:00` had 9 codes. `mergeCodeshares` groups by `(origin,dest,dep,arr)` into one `LogicalFlight` carrying **`FlightLegDTO.airlineCodes` (List)** + `flightNumbers` (List). This is why `airlineCode`→`airlineCodes` on the leg DTO; the UI shows "Operated by Vueling · Iberia · …". Without it, ORY→BCN→MAD returned 25 near-identical cards.

### Self-transfer pairing rules (`SelfTransferRoutingService`, strict)
- Layover window **2h00 ≤ (leg2 dep − leg1 arr) ≤ 4h30** (inclusive both ends).
- **Same-day only** (no `+1` day); overnight legs (`crossesMidnight`) excluded; hub ≠ origin and ≠ final dest.
- **Arrival curfew** leg2 arrival ≤ **23:00** (self-transfer only; directs have no curfew).
- Both legs must share an operating weekday (`operatingDaysMask` overlap, filtered in Java for DB-agnosticism).
- Self-transfers sorted by total journey time; capped at 25.

### Ryanair schedule ingester (2026-07-23) — FREE, no AviationStack quota
`RyanairScheduleIngestionService` fills the grid from the **free Ryanair API** (the same `cheapestPerDay` feed used for pricing), complementing the quota-capped AviationStack path. Added because AviationStack ingestion was sparse for thin airports — e.g. **Shannon had only 57 rows and no `SNN→PMI`**, so the real Ryanair Shannon→Palma flight was invisible to Route Hacker (it was in the Ryanair cache / Live Deals, just not the schedule grid).
- Endpoint: `POST /api/trips/schedules/ingest-ryanair?origin=SNN[&destination=PMI][&months=2]` (origin-only = every Ryanair route out of that airport; +destination = one route).
- Flow: `RyanairService.getDestinationsFrom(origin)` (route network) → `RyanairService.fetchMonthlySchedule(o,d,month)` (parse-only cheapestPerDay, NO DB writes) → fold per-day flights into weekly rows by `(depTime,arrTime)`, OR-ing the weekday bits → upsert by natural key (same merge as AviationStack).
- Rows: `airlineCode="FR"`, synthetic `flightNumber="FR-<O><D>"` (cheapestPerDay has no flight number), `validFrom=today`, `validTo=+180d`. Config: `ryanair.schedule.{months:2, throttle-ms:250}`.
- Verified: ingesting `SNN→PMI` inserted 4 rows (Tue 19:05 / Wed 10:00 / Thu 10:40 / Sat 10:05); Route Hacker now shows the SNN→PMI DIRECT card, Get Live Price €163. Tests: `RyanairScheduleIngestionServiceTest` (3).

## Ingestion — AviationStack `/v1/flightsFuture` (NOT `/v1/flights`)

Free tier only exposes: real-time `flights`, `timetable` (today only, no weekday),
and **`flightsFuture`** (a specific FUTURE date's schedule, WITH a `weekday` field).
`routes` is paid-only (`function_access_restricted`). So ingestion queries
`flightsFuture` for **7 consecutive future dates** (base = `now + lead-days`) to build
the full weekly operating pattern; the same flight seen on multiple days **OR-merges**
its weekday bits into one row (`findFirstBy…DepartureTime`).

- **Schema gotcha:** `flightsFuture` uses `iataCode` + `scheduledTime` ("HH:mm") and top-level `weekday` ("1"=Mon…"7"=Sun). This differs from `/v1/flights` (`iata`, `scheduled` ISO, `flight_date` snake_case that needs `@JsonProperty`). IATA codes come **lowercase** → uppercased in mapping.
- Config (`application.yml`): `aviationstack.schedule.{lead-days:14, days:7, throttle-ms:8000, retry-wait-ms:25000, max-retries:2}`.

### Quota guard + rate limit (the hard part)
- **Monthly quota = 100** (`x-quota-limit`), tracked in `ApiUsageCounter`. Guard cap `MAX_API_CALLS = 90` (raised from 80 on 2026-07-23 to fit ALC+BCN; still a 10-call margin below 100).
- **Count on SUCCESS only** — 429/`rate_limit_reached` rejections do NOT meter quota (`x-increment-usage` only fires on 200).
- **Strict per-window rate limit**: bursting 429s after ~1 call/minute. Handled by: throttle ~8s between calls, **retry-with-backoff** (25s × 2) on 429, and for stubborn days, **force passes spaced ~75s apart** (each pass grabs ~1 more weekday as the window resets).
- **Cache-first**: `existsByOrigin` → skip (status `CACHED`), never re-spends on a loaded airport.
- **`force=true`**: bypasses cache-first to complete a PARTIAL airport, and **skips weekdays already covered** (`findMasksByOrigin`) so it only spends calls on missing days. Statuses: `INGESTED` / `PARTIAL` / `CACHED` / `ALREADY_COMPLETE` / `FETCH_FAILED` / `QUOTA_BLOCKED` / `EMPTY_AIRPORT`.

## Current DB state (2026-07-23)

Ingested & **weekly-complete (all 7 weekdays, mask 127)**: **SNN, IBZ, PMI, ORY, AGP, MAD, DUB, MAN, ALC, BCN**. ~14k rows total (MAD biggest ~3.6k, SNN sparse ~57). Guard counter ~83/90 after this batch (~17 real calls left this month).

- Local DB: docker container **`slumber-db-1`**, Postgres `localhost:5433/slumberdb` (`slumberuser`/`slumberpass`). Backend **hot-restarts via devtools** on `./mvnw compile`/`test` (recompiling `target/classes`).
- Coverage check: `SELECT origin, bit_or(operating_days_mask), count(*) FROM flight_schedule GROUP BY origin;` (mask 127 = all week).

## Frontend (repo: `/Users/vaimar/src/apps/webagency`)
- `services/hackerRoutes.ts` — `fetchHackerRoutes`, `fetchHackerRoutePrice`.
- `components/HackerRouteCard.tsx` + `.css` — route header, layover badge, airline-name chips, per-leg `BookingLinks`, "Get Live Price".
- `HackFlights.tsx` — **tabbed**: "🟢 Live Deals" (existing cached/self-connect) vs "🧪 Route Hacker" (this engine). Plain CSS, no Tailwind.

## Tests
- `SelfTransferRoutingServiceTest` (8) — layover window boundaries, curfew, no-overnight, direct-skip, weekday filter, sort.
- `AviationStackIngestionServiceTest` (12) — flightsFuture mapping, weekly bit-merge, one-call-per-day, force bypass + skip-covered + ALREADY_COMPLETE, cache-first, cap (uses `MAX_API_CALLS`), 429 graceful stop, FETCH_FAILED.

## Open items / gotchas
- **`SNN → IBZ` now WORKS** (resolved 2026-07-23 by ingesting more hubs). Verified in-window: `SNN → MAN → IBZ` on Sat 2026-08-15 (FR4777 08:20→09:35 + easyJet U22027 13:00→16:50, 3h25 layover). Shannon→Ibiza hubs that assemble on their weekdays: **AGP, ALC, DUB, MAN**. (AGP alone didn't work — its only real link was a Sunday 7h20 layover, excluded by the 4h30 cap; MAN/others time-align.) CDG's own SNN↔IBZ timing does NOT fit the window. `MAX_LAYOVER` (2h–4h30) is still strict by design; relax it in `SelfTransferRoutingService` only if you want longer same-day self-transfers.
- **`ORY` + `CDG` are now in frontend `airportMetadata.ts`** (added 2026-07-23) → selectable as origin/dest in the Route Hacker UI (grouped under France with BVA). Verified in-UI: `ORY → BCN → MAD` renders 25 cards on Sun 2026-08-16. Previously they were API-only; that was the "ORY not displaying routes" bug (UI couldn't select the airport, backend/DB/engine were fine).
- **Committed secrets** (flag, not fixed): AviationStack key hardcoded in `application.yml` + `application-local.yml`; plaintext RDS password in `application.properties.bak`. Rotate + gitignore.
- flightsFuture requires the date to be ≳7 days out ("date must be above …") — hence `lead-days:14`.
- Verified-working demo routes: `ORY → IBZ → MAD` (Sat), `ORY → IBZ → BCN` (Sun), `IBZ → ORY → LIS` (Fri) — different weekdays return different routes (weekday filter proven).

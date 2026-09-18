# Train ways in to French spots (SNCF) — spec

Status: **rev 5.1, COMPLETE — contract review stays closed, but the wire shape in
7.2 changed in rev 5** (alighting options, user decision). Rev 5.1 is copy and
consistency only: no wire change, no new criterion, still **43**. Reviewers do **not** re-run
step 2; `frontend` and `sdet` re-derive the criteria named in rev 5's log entry.
Every figure and string in this spec now comes from R0's captured body.
Owner: `pm` · Reviewers:
- `backend`: **AGREE** on rev 3, with corrections A, B, D, G — applied in rev 4.
- `frontend`: **AGREE** on rev 3, with corrections C, F — applied in rev 4.
- `sdet`: **AGREE** on rev 3, with corrections D, E, F, H — applied in rev 4.

Rev 4 applies the corrections the three reviewers asked for alongside their
AGREE, which the lead accepted. **It opens no new review round**: every change
is a reviewer's own ask, and none of them changes the wire contract (7.2).

All open questions are **answered by the user** (13). D1 is settled: the route
trace is **not in this slice**, it is follow-up **F0**. The station rule is
settled: **nearest rail-served**, which for Spot FR means **Arnage**, not Le
Mans. R0 is **narrowed to fixture capture**, with **exactly one** SNCF journeys
call approved at build time (11, task R0). Scope is **41 criteria**, numbered
1–39 plus 43–44 — rev 4 adds no criterion.

**P1 is CLOSED** (rev 5). backend made the one approved capture call; Arnage is
`stop_area:SNCF:87396549` at **(47.928541, 0.189882)**, haversine to Spot FR
**1.9506 km → 2.0**. Only V1's *coordinates* were wrong — `distanceKm: 2.0`,
criterion 7's figure and criterion 24's "2 km" were all right.

**What the capture broke instead:** there is **no `TER`-branded leg** in the real
answer, and the honest Spot FR journey is **4h37 with a 2h50 platform wait** at
Le Mans. That is what rev 5's alighting options exist to show (7.2, 7.4, 8.3).

## Revision log

- **rev 5.1** (2026-09-17): **one string, specified twice, in two different
  wordings** — found by `frontend` before either version shipped. Both were
  exact-string tests, so one had to fail, and nothing said which was right.
  1. **Single source, stated as a rule** (8.3 header): any string appearing both
     in 8.3 and in a criterion is **quoted from 8.3**, never restated. 8.3 is
     authoritative because 11 makes sections 7 and 8 the contract. Criterion 46
     now quotes, and says outright that if the two disagree, **8.3 wins and the
     criterion is the bug**.
  2. **The deeper defect: the copy assumed exactly two options.** Both wordings
     said "either station" / "neither leg", which is false the moment a journey
     yields one option or three — and criterion 45 establishes that it can, since
     the filters are per-journey and nothing caps the count (journey 2 yields
     **1** today). The note is now count-agnostic: `Getting off earlier can leave
     you farther from the spot. Onward travel from any of these stations is not
     included.`
  3. **And it is conditional**: the note and the `Where to get off:` heading
     render **only when a journey has more than one option**. With a single option
     there is nothing to get off earlier for, so the sentence is noise. Criterion
     46 asserts it **both ways** — present on the two-option journey, absent on
     the one-option one.
  - No wire change, no new criterion, no renumbering. Still **43 criteria**.
- **rev 5** (2026-09-16): **R0's capture landed and contradicted rev 4.** backend
  made the one approved CDG→Arnage call (HTTP 200, sanitized, key-leak checked).
  The review stays **closed** — this is not a new review round — but **7.2's wire
  shape changes**, so `frontend` and `sdet` re-derive the criteria named below.
  1. **P1 CLOSED.** Arnage is `stop_area:SNCF:87396549` at **(47.928541,
     0.189882)**; haversine from Spot FR = **1.9506 km → 2.0**. Only rev 4's
     *coordinates* were wrong. V1's `distanceKm: 2.0`, criterion 7's figure and
     criterion 24's "2 km" **were all correct** and stand unchanged; criterion 7's
     "≈ 2.0" is now exact.
  2. **There is no `TER` leg.** The captured body has no TER-branded section. The
     real regional brands to Arnage are **Aléop**, **NOMAD** and **Rémi**,
     rendering e.g. `Aléop P30 857065`. V1's illustrative TER legs and criteria 11
     and 25 are corrected **from the captured body only** — nothing invented.
  3. **Alighting options — the user's "show both" decision, and the big one.**
     The real Spot FR answer is TGV INOUI 5210 CDG 08:48 → **Le Mans 10:30**
     (7.15 km from the spot), then a **2h50** wait, then Aléop P30 Le Mans 13:20 →
     **Arnage 13:25** (1.95 km): **4h37** door to door. Shipping only the Arnage
     endpoint would make the flagship French spot's headline a 4h37 journey with a
     2h50 platform wait, which is exactly the kind of number this product refuses
     to bury. So **both** are rendered, **from the same journey**: every station on
     a journey that falls inside the existing 30 km rule (7.5) is an **alighting
     option**, each with its own arrival time and its own haversine `distanceKm`.
     **Zero extra API calls** — the change station is already inside the body we
     fetch. **The rule is explicitly NOT "nearest station wins":** Le Mans is
     farther (7.2 km) but arrives **2h50 earlier**, and the rider judges that
     trade, not us.
  4. **`waitText`** (8.3, lead's decision): a change of **≥ 90 minutes** renders
     as hours and minutes (`2h50`), not `170 min`.
  5. **Section `physical_mode` is not trustworthy** (7.5): the 5-minute Aléop hop
     is labelled "Train grande vitesse" / `LongDistanceTrain`. The stop_area-level
     filter in 7.5 is unaffected; **nothing infers a leg's mode from the section
     field**.
  6. **`alightingOptions` is on the wire, not derived client-side** (frontend's
     gap): legs carry only names, and the client has neither station nor spot
     coordinates, so the haversine is a backend computation (BE5). Each option
     also carries **its own `durationMinutes` and `changes`** (sdet's ask), while
     the **top-level** pair stays the full run to the canonical destination — so
     every existing criterion resting on them keeps its meaning.
  7. **Top-level `station` is unchanged and unambiguous** (frontend's gap): still
     the nearest rail-served stop_area, still what journeys are requested to,
     **never** "the stop we recommend". Said so explicitly in 7.4. The station
     line and the `NO_JOURNEY` line keep their current wording.
  8. **Station names come from the embedded stop_point / stop_area, not the
     section place** — the latter carry a commune suffix (`Le Mans (Le Mans)`).
     No regex stripping, same response, no extra call.
  9. **No cap; a dominance filter instead** (lead's decision). An option is keyed
     by **(station, arrival time)**, and one is dropped only when another on the
     same journey is **both no later and no farther**. It keeps every real
     trade-off (journey 2 keeps all 5, including Aubigné-Racan at 28.5 km because
     it arrives 27 min earlier than Arnage), absorbs journey 3's doubled-back
     Écommoy with no special rule, and prunes journey 3 to **2** options because
     Le Mans is earlier *and* nearer than Écommoy and Laigné - Saint-Gervais.
  11. **Materiality threshold on top of dominance** (lead's final decision):
      `ALIGHTING_MIN_SAVING_MINUTES` = **30**, configured as
      `sncf.alighting-min-saving-minutes` (7.8) so it is tunable without a
      contract change. Walking from the closest outward, an earlier and farther
      option is kept only if it saves at least that much against the nearest
      survivor. Journey 1 keeps Le Mans (175 min saved); journey 2's five-option
      Pareto chain spans only 27 minutes and collapses to **Arnage alone**. The
      full pipeline is 30 km → dominance → materiality → order by arrival.
  10. **`depth=2` is required on the journeys call too** (7.4) — it carries the
      stop_area ids, coordinates and `stop_date_times` that alighting options
      need, and it matches how R0's fixture was captured. Criterion 12 asserts it.
      Recorded alongside it: backend added a `Clock` bean to `AppConfig` (slumber
      had none), which BE2 uses for the sample-date rule (11).
  - **Moved by rev 5.** Changed: **11, 12, 23, 25, 26**, plus new **45** and
    **46**; 7.2 (`RailAlightingOption`, `RailJourney.alightingOptions`), 7.4
    (derivation, names, de-dup), 7.5 (physical_mode warning), 8.3 (summary names
    the end station, alighting copy, `waitText`), 8.4, §3, V1 (one captured
    journey) and V2 (the 12:16 journey). **Re-checked and NOT changed: 7, 24 and
    28** — the capture confirmed their figures and strings rather than moving
    them. Scope goes **41 → 43 criteria**. No new endpoint, no new API call, and
    7.5's station-selection rule is unchanged.
- **rev 4** (2026-09-16): contract review **closed** — `backend`, `frontend` and
  `sdet` all replied **AGREE** on rev 3. Rev 4 applies the corrections they sent
  with their AGREE, accepted by the lead. No new review round, no scope change,
  no wire-contract change, and no new criteria (still 41).
  - **A. §7.5: the `count=100` justification was wrong, and was branded as
    measured.** It claimed the default page of 10 "truncates before any rail stop
    appears" and "returns only coach stops". backend's own probe contradicts
    that: Arnage came back at **position 2** and Le Mans at **position 9**, so a
    default page would have found the same station. The false claim is deleted.
    The parameter stays, restated as **defensive headroom** — the default 10 is
    ranked purely by distance and can be filled by coach stops at spots with
    dense bus coverage — and it is stated that it does **not** change Spot FR's
    answer.
  - **B. R0 reworded.** It forbade new SNCF calls while demanding a CDG→Arnage
    body that was never fetched (the earlier probe was CDG→**Le Mans**). The lead
    approved **exactly one** journeys call at build time to capture CDG→Arnage.
    BE1's fixture bullet is folded into R0 so fixtures are described once, and
    **BE1 stays independent of R0**.
  - **C. §7.7 softened.** "The two are written to agree" became "agree on all
    supported values", with the known divergence recorded: JS `.trim()` strips
    U+00A0, Java `String.trim()` does not. It **fails safe**, and `String.strip()`
    does **not** close it. No code change.
  - **D. §7.8: one concrete wrapper class per payload type.**
    `PersistentCacheService.get(key, Class<T>)` cannot carry a generic wrapper
    through erasure, so station, no-station and journeys each get their own
    wrapper class holding `fetchedAt` + `value`. Criterion 17's last bullet is
    now an `ArgumentCaptor` assertion. **A1 must not expect a single generic
    wrapper.**
  - **E. Criterion 8 pinned.** `NO_STATION_NEARBY` now asserts a **non-null**
    `fetchedAt` equal to the station call's instant, and that a second identical
    request makes **0** calls and returns the same `fetchedAt` — which is also
    what proves the 7-day no-station cache entry is used. Asserting `null` here
    by analogy with criterion 3 looks right and is wrong.
  - **F. Criterion 31's Tokyo assertion could not fail.** For
    `2026-10-04T00:30:00+02:00`, Tokyo reads "Sun 4 Oct" whether or not the bug
    is present; only New York discriminates. That vector is kept **for New York**
    and a mirror added for Tokyo: an evening Paris landing
    `2026-10-03T23:20:00+02:00`. One discriminating vector per zone, and V2's
    09:35 line discriminates in neither.
  - **G. New pending-at-build task P1 (11).** V1's Arnage station block does not
    produce V1's own distance: the haversine from the spot (47.934, 0.165) to
    (47.9226, 0.1826) is **1.8239 km → 1.8**, contradicting the 1.951 measured in
    3, the `2.0` in V1, the "≈ 2.0" in criterion 7 and the "2 km" in criterion 24.
    Criterion 7 correctly makes the test **compute** the haversine rather than
    copy it, so a literal test yields 1.8 and A1 fails. **No replacement
    coordinates are invented here.** P1 requires V1's station block and the
    figures in criteria 7 and 24 to be regenerated from R0's captured body's real
    `stop_area` coordinates, in the same edit, never hand-carried.
  - **H. Fixture ownership recorded** (11): `backend` owns
    `src/test/resources/sncf/**` (sanitized captured provider bodies only),
    `sdet` owns every `*Test.java`, and synthetic error/edge bodies stay inline in
    sdet's test classes as Java text blocks.
- **rev 3** (2026-09-16): the user reviewed rev 2 and did not approve it. Three findings, all applied.
  1. **Country gate made case-insensitive on both sides (HIGH).** The backend
     treats `country` case-insensitively, so `fr` is a valid French spot, but
     8.1 gated the frontend on `country === 'FR'` — a lowercase-country spot
     would never request or render rail even though the API would answer `OK`.
     One shared normalisation now applies to both sides: **trim, upper-case,
     compare to `FR`** (7.7, 8.1). New criteria **43** (backend) and **44**
     (page wiring) cover a lowercase `fr` spot.
  2. **R0 closed; the station mechanism is proven, not open (HIGH).** 7.5 read
     as a feasibility question and 11/13.2 still carried R0 as something BE1
     waited on. backend **measured** it during the rev 2 review:
     `places_nearby?distance=30000&type[]=stop_area&count=100&depth=2` returns
     each stop_area with `physical_modes[]`, so all five rail modes are filtered
     locally from **one** response. 7.5 now states the measurement, 13.2 marks
     R0 **CLOSED**, and **BE1 no longer depends on R0** — R0's remainder is
     fixture capture from bodies already fetched. **No re-verification, and no
     new SNCF calls, are to be spent on this.**
  3. **`fetchedAt` cache semantics made deterministic (MEDIUM).** 7.2 defined
     `fetchedAt` as the oldest SNCF answer used, but 7.8 only cached the station
     and journey payloads, so criterion 17's "equal `fetchedAt` on a cache hit"
     wasn't implementable — `PersistentCacheService.get` returns only the body,
     never the row's `createdAt`. 7.8 now specifies that **each cached entry
     stores its own provider-fetch instant inside the cached value**, that a
     cache hit re-serves that stored instant verbatim, and that `fetchedAt` is
     the earliest stored instant across the entries that fed the response.
     Criterion 17 gains the mixed stale-station / fresh-journeys case.
  4. **D1 sweep re-confirmed** while in the file: no `RailLeg.geometry` field in
     7.2, no `railTraceFeatures` or geometry in 8.4's export list, and no
     geometry row in the FE or BE task tables. Geometry survives only as
     follow-up text (7.9, Appendix A) and as negative assertions (criteria 11,
     22).
- **rev 2** (2026-09-16): the user's answers applied via the lead, plus all three rev 1 reviews folded in.
  1. **Connection buffers raised** to CDG 90, LYS 75, ORY 150, BVA 180 minutes
     (rev 1 + 30) for passport queues and bags. Quarter-hour rounding kept, and
     the buffer stays visible in the UI copy. Every chained example, fixture and
     criterion recomputed (4, 7.2, 7.3, 8.3, 10, 12) — backend, frontend and
     sdet each derived the same table independently, and this is it.
  2. **D1 = first follow-up.** The map trace leaves this slice entirely:
     criteria 40–42 **withdrawn** to Appendix A, `RailLeg.geometry` gone from
     7.2, `railTraceFeatures` gone from 8.4, tasks BE4 and FE4 dropped, and 7.9
     relabelled as F0's spec rather than work.
  3. **SNCF API terms:** fine for the private beta. The lead adds the SNCF API
     to `docs/LAUNCH-CHECKLIST.md` item 9 before any public stage — a **lead
     task, not a build task**, and not a criterion here.
  4. **Sample origins accepted as written:** CDG and Paris always, LYS when
     near; first Saturday at least 14 days out, from 08:00, labelled as not the
     traveller's date.
  5. **Station rule settled: nearest rail-served, halts included.** backend
     measured that Spot FR's nearest rail-served stop_area is **Arnage**
     (1.95 km), not Le Mans (7.15 km), and rev 1's examples assumed Le Mans with
     a "4.7 km" figure that matched neither. The user chose to keep the rule and
     move the examples: **V1 and criteria 7, 11, 12, 24, 25, 28 are now Arnage.**
     A mainline tie-break needs route counts and a second SNCF call, so it stays
     **F6**.
  - Knock-on from (1): V2's landing moves from 10:05 to **09:35** so the example
    keeps a **probed** departure. 10:05 + 90 rounds to 11:45, which would drop
    the 11:29 train, and the probe returned nothing between 11:29 and 13:28.
  - From review: the chained date line is made time-zone safe (8.3, criterion
    31), the daily cap is consumed in a fixed origin order (7.8, criterion 19),
    `fetchedAt` is declared unrendered **and pinned** (8.3, criterion 27), a
    deleted venue slug is named in criterion 1, and the one-call station
    mechanism is pinned to `depth=2&count=100` (7.5, criterion 7).
- **rev 1** (2026-09-15): first draft, 39 criteria plus 3 that apply only if D1 puts the trace in this slice.
  - Inputs: `frontend` pre-read (lazy per-spot endpoint, status enum, nullable fare, rail out of the trip total); `backend` live probe (no fares, no street network, the nearest stop_area is often a halt); `sdet` orientation via the lead; user decisions via the lead (frame it as "land, then take this train", chain rail to the picked flight, no price, the trace is a candidate).

---

## 1. Problem

A French spot page tells a rider the nearest airports and the nearest station
as a pin and a straight-line distance (`GET /api/spots/{slug}/arrival`). It
never says which train to take. Two curated venues carry a `TRAIN` way in
("Le Mans (TGV)", "Perpignan"), and both are prose labelled `curated, no live
price`.

The user's framing: *"flight and then take train… take this line."* A rider who
lands at CDG wants to read "take TGV INOUI 5210 from Aéroport Charles de Gaulle
2 TGV at 08:48 to Le Mans at 10:30, change, Aléop P30 to Arnage at 13:25", with
each leg, each change — and, because that change is 2h50 long, the choice of
getting off at Le Mans instead. The SNCF API (Navitia, coverage `sncf`) has those timetables. It has no
fares.

## 2. Who it's for

A rider on `/spots/:slug` for a spot in France who flies in, typically from
Dublin to CDG, BVA, ORY or LYS, and asks "after I land, which train gets me
near this spot, and how long does it take?". Private beta route.

## 3. What exists, and what the probe found

Researched 2026-09-15, extended 2026-09-16. `backend` made the live calls,
reading the key from local config and never printing it.

| Existing | Where | Relevance |
|---|---|---|
| Curated ways in | `Access{mode,hub,lastMile}` in `wakeboard-destinations-*.json`; `GET /api/destinations/access`; `access[]` on `GET /api/destinations/spots` | Hubs are prose. Only 2 FR venues have `TRAIN`. **Not touched.** |
| `SpotAccessPricingService` | slumber `service/` | Prices only `PLANE` + IATA hubs. `SpotAccessPricingServiceTest::leavesFerryAndTrainWaysUnpriced` asserts on `price()` over curated Access ways and verifies `RyanairService` is never called. **sdet verified this feature does not invalidate it** — `/rail` is a separate endpoint (criterion 35). |
| `SpotArrivalService` | `GET /api/spots/{slug}/arrival` | Nearest 3 airports (DB, ≤ 250 km); nearest OSM `railway=station` (≤ 30 km, Overpass, can be `stationPending`). |
| Getting there tab | `src/SpotDetailPage.tsx` (panel ~L1138–1200), `src/components/AccessFare.tsx` | Default tab. Renders curated ways, or airport rows plus the OSM station row. |
| Flight pick | `SpotDetailPage` page state from `docs/specs/combined-trip-total.md` (FE3, accepted) | `pickTripFlight` (L700) already receives the whole `FlightAvailable`, which has `destination` and `arrivalDate`. `RyanairService` sets `arrivalDate` as a local `LocalDateTime` with no offset. That spec's criterion 30 says picking sends no `/api/**` request, and this spec keeps it. |
| Spot map | `DetailMap` in `SpotDetailPage.tsx` L218–413 | Draws a dashed airport→spot line on a GeoJSON source. That's the plumbing the rail trace will reuse in **F0**, not here. |
| Formatters | `src/services/flightFormat.ts` | `formatClock` reads `HH:MM` from the string, not the time zone. `formatDuration` gives `1h41` / `2h`. `formatShortDate` gives `Sat 3 Oct` — **only a bare `YYYY-MM-DD` is built from its parts** (L78–93); anything else goes through `Date.parse` and renders in the browser's zone. That's why 8.3 slices the date. |
| Badge primitive | `TripTotalCard.tsx` L97, `<span className="badge badge--danger">` | The red manual-check contract in `AGENTS.md`. Reused as-is; no new hex. |

**SNCF API facts** (https://doc.navitia.io/, SNCF FAQ, `backend` probes):
- Base `https://api.sncf.com/v1/coverage/sncf`, HTTP basic auth, key as the username, empty password.
- **No fares.** `fare` = `{"found": false, "total": {"value": "0.0"}, "tickets": []}`.
- **No street network.** Coordinate to coordinate gives HTTP 404, `no_origin_nor_destination`. Journeys work stop_area to stop_area and admin to stop_area (`admin:fr:75056`, Paris).
- **Rail-served stop_areas near Spot FR** (Spay, 47.934/0.165), measured:

  | Distance | id | Name | physical_modes |
  |---|---|---|---|
  | 1,951 m | `stop_area:SNCF:87396549` | **Arnage** | Coach, LongDistanceTrain, Train |
  | 7,154 m | `stop_area:SNCF:87396002` | Le Mans | Coach, LongDistanceTrain, Train |

  A mode filter cannot separate them: Arnage is `LongDistanceTrain`-served too.
  This is what settled the station rule (13.5).
- **LYS station:** `stop_area:SNCF:87762906`, "Lyon Saint-Exupéry TGV", 689 m from the terminal.
- CDG 2 TGV (`stop_area:SNCF:87271494`) to **Le Mans**, 08:00, gave 08:49→10:30 direct TGV INOUI 5210, 09:43→11:30 direct, and 11:29→13:28 with 1 change (RER B, then TGV). **Superseded for spec purposes** (rev 5): this was the wrong destination. The real CDG→**Arnage** capture departs **08:48**, not 08:49, and contains no RER B journey — see 7.2. These three survive only as the record of what was probed first.
- **CDG 2 TGV → Arnage, 2026-10-03 from 08:00 (R0's one approved capture, 5 journeys):** 08:48→13:25 (277 min, 1 change, TGV INOUI 5210 then **Aléop P30 857065**, with a **170-minute wait** at Le Mans); 09:43→13:50 (247 min, 2 changes, via Saint-Pierre-des-Corps and Tours, **NOMAD K39** then **Rémi P30**); 12:16→16:29 (253 min, 2 changes, via **Écommoy**, NOMAD then **Aléop P9**); plus two on 2026-10-04. Every journey's `fare` is `{found: false, total: {value: "0.0"}}`, so the no-fare handling stands. **The regional brands are Aléop, NOMAD and Rémi — `TER` appears nowhere.**
- Journey fields: `duration` (s), `nb_transfers`, local `YYYYMMDDTHHMMSS` times (`context.timezone` Europe/Paris), and `sections[]` with `type`, `from`/`to`, `display_informations{commercial_mode, code, headsign}`. `public_transport` sections also carry `geojson`, which this slice ignores (F0).
- Error ids: `no_solution`, `date_out_of_bounds`, `unknown_object`, `no_origin`, `no_destination`, `no_origin_nor_destination`.
- **Quota:** 5,000 requests/day free, and access is blocked when it's exhausted (SNCF FAQ).
- **Deep link, checked:** the only published SNCF deep-link doc (numerique.sncf.com, April 2017) covers app schemes. It gives **no https URL format for sncf-connect.com**. The link therefore goes to the SNCF Connect home page, with nothing prefilled (F11).
- **Terms:** the API's conditions haven't been read against commercial, public use. The user has accepted this for the private beta; the lead carries it into `docs/LAUNCH-CHECKLIST.md` item 9 (13.3).

## 4. The thinnest slice

A **"By train"** block on the Getting there tab of a French spot, fed by one
new lazy, per-spot endpoint `GET /api/spots/{slug}/rail`:

- **Destination station:** the **nearest rail-served** SNCF stop_area within 30 km of the spot. Coach and bus stops don't count (7.5).
  - **This can be a small halt rather than the mainline station, and that's the decision.** For Spot FR it's Arnage (1.95 km), not Le Mans (7.15 km). The journey then reads "TGV to Le Mans, change, Aléop to Arnage", which leaves the rider 2 km from the spot instead of 7 — **and rev 5 offers Le Mans as an alighting option on the same journey**, so the rider who won't wait 2h50 isn't forced to (7.4). Preferring the mainline station needs route counts and a second SNCF call — **F6**.
- **Chained to the picked flight** when a fare is picked on the Flights tab and it lands at a gateway (`CDG`, `LYS`, `BVA`, `ORY`):
  - one origin, the gateway's station, or Paris for BVA/ORY
  - trains departing after landing plus a stated connection buffer (7.4)
- **Otherwise, a labelled sample:**
  - origins CDG and Paris, plus LYS when it's one of the spot's 3 nearest airports
  - the first Saturday on or after today + 14 days, departing from 08:00
- **Journeys:** up to 3 per origin. Each shows departure → arrival, duration and changes, then **every leg**: brand, line or train number, from station and time, to station and time, and each change with its wait.
- **No price:**
  - Every journey has a `Check fares on SNCF Connect` link that opens in a new tab.
  - The block says once that SNCF gives no fares and that trains are in no total.
  - Rail isn't in `auditedTotalCost`, `cheapestEntryPrice` or `TripTotalCard`.
- **No map trace.** The journey is text. The trace is F0.

**Gateway rules.** Rail is station to station and the coverage has no street
network, so the airport-to-station leg can't be routed. It is curated as a
buffer and a note, per gateway. **Buffers set by the user, rev 2**, sized for
passport queues and bags on a non-Schengen arrival:

| Flight lands at | Rail origin | Buffer | Why |
|---|---|---|---|
| `CDG` | Aéroport CDG 2 TGV (station in Terminal 2) | **90 min** | non-Schengen arrival from Dublin, passport queue, bags, walk to the TGV station |
| `LYS` | Lyon Saint-Exupéry TGV (linked to the terminal) | **75 min** | smaller airport, walkway to the station, still a passport queue and bags |
| `ORY` | Paris (any station) | **150 min** | passport, bags, then Orlyval + RER B or tram into Paris, then across to a main-line station |
| `BVA` | Paris (any station) | **180 min** | passport, bags, coach to Porte Maillot (~1h15), then metro to a main-line station |
| anything else | not chained; sample mode, with a note | — | shuttles we can't route (F5) |

The buffers are product assumptions, stated in the UI copy (8.3), and they are
deliberately generous: a rider who clears the airport early can read a later
train from the list, while a buffer that's too short suggests a train they'd
miss.

## 5. Out of scope (follow-ups, in suggested order)

| # | Follow-up | Owner | Why not now |
|---|---|---|---|
| **F0** | **Rail route trace on the spot map** — the **first follow-up**, settled by the user in rev 2. Contract kept in 7.9 and criteria in Appendix A, both ready to lift unchanged. | backend + frontend | The text answers "which train". A canvas adds interplay with the airport route, a bigger payload, and behaviour Cypress can only check through button state. |
| **F6** | **Mainline tie-break**: prefer the station the long-distance trains actually stop at (Le Mans) over a nearer halt (Arnage), or a curated per-spot station override | backend | **Live, not hypothetical** — it's Spot FR's real answer. Deciding it needs route counts per stop_area, i.e. a second SNCF call, which this slice's 1-call contract excludes. Ship, look at real answers, then decide. |
| F1 | Rail fares. Measure how often `fare.found` is true, then decide on a licensed fare source. Until then there's no number. | pm → backend | The SNCF coverage returns no fares. |
| F2 | Rail in `TripTotalCard`, `auditedTotalCost`, `cheapestEntryPrice` | frontend / backend | Needs F1. |
| F3 | Return journey (spot station to the airport, before the flight home) | backend + frontend | The spot page has no return flight yet (combined-trip-total F1). |
| F4 | Realtime (`data_freshness=realtime`) and disruption notes | backend | Chained dates are ones the rider picked, usually weeks out. |
| F5 | More gateways: MRS (Vitrolles shuttle), NCE (Saint-Augustin), BOD, NTE, TLS, BIQ, PGF, each with a verified stop_area and buffer | backend | Each needs a real transfer note, not a guess. |
| F7 | One station name per page: merge the curated `TRAIN` way and the OSM "nearest station" row with this block | frontend | The block sits beside them in this slice. |
| F8 | Station-to-spot last mile (bus, taxi) | backend | No street network. Straight-line distance only, labelled. |
| F9 | "Fly to a gateway instead": offer CDG/LYS/BVA fares from the rail block when the spot's own airport isn't a gateway | frontend + backend | New flight search surface. |
| F10 | Ski resorts (`/resorts/:slug`) and slug-less JSON venues | frontend + backend | Off the beta nav, and no slug (7.1). |
| F11 | Prefilled SNCF Connect link, once a documented https format exists, and outbound telemetry on it | frontend | None is documented today (3). |
| F12 | Singleflight for concurrent identical lookups, and a daily counter that survives restarts | backend | Private-beta traffic. The cache is the main guard. |
| F13 | Render `fetchedAt` as an age, if journeys ever come from a feed that goes stale inside a day | frontend | `base_schedule` times weeks out don't move in 24 h (8.3, criterion 27). |
| ~~F14~~ | ~~Mid-leg alighting stops~~ | — | **Not a follow-up: shipped in rev 5.** backend confirmed `stop_date_times` is present on every section with per-stop names and coordinates, so "every station on the journey within 30 km" is computable from the body we already fetch (7.4). |
| F15 | Rail "last mile" from a **spot-aware** Hack Flights handoff: the standalone `/hack-flights` route currently knows only origin/destination airports, not a spot `slug` or country, so it must not call `/rail` itself. Add an explicit spot-page handoff that preserves the selected route and the French spot slug, then call `GET /api/spots/{slug}/rail?arrivalAirport={code}&arrivalTime={iso}` (chained mode) there and render a "Last mile by train" card. Build `arrivalTime` from the final leg's resolved `itinerarySchedule(...).arrival` date and clock, not the search date or raw itinerary fields. | frontend | The backend contract already supports this (7.1 chained mode); no backend endpoint is needed. French spots only; no fare (informational, with an explicit SNCF Connect link). |

Also out: any change to `/api/destinations/access`, `/api/destinations/spots`,
`/api/spots/{slug}/arrival`, `SpotAccessPricingService`, `AccessFare`,
`TripTotalCard`, and non-French spots.

**Not a build task at all:** adding the SNCF API to `docs/LAUNCH-CHECKLIST.md`
item 9 (data-source terms). That's the lead's, before any public stage (13.3).

## 6. User stories

1. As a rider who picked a flight into CDG (or LYS, BVA, ORY) on a French spot page, I see the trains I can catch after landing, with the buffer stated. For each one I see the brand and train number, the stations and times, the duration and every change, so I know exactly which train to take.
2. As a rider who hasn't picked a flight, or whose flight lands somewhere we don't route from, I see trains from CDG and Paris (and LYS when it's near) on a sample date that's clearly labelled as not my date.
3. As a rider, I'm told which station the trains go to, how far it is from the spot in a straight line, and that the station-to-spot leg isn't included.
4. As a rider, I see no train price, only a link to check fares on SNCF Connect. I'm told train fares aren't in any total, and I never see €0.
5. As a rider, when there's no station nearby, no train, no published timetable, or SNCF is down or out of quota, I'm told which of those it is.

## 7. API contract

### 7.1 Endpoint

```
GET /api/spots/{slug}/rail
GET /api/spots/{slug}/rail?arrivalAirport=BVA&arrivalTime=2026-10-03T09:40:00
```

| Param | Required | Format |
|---|---|---|
| `arrivalAirport` | with `arrivalTime` | 3 letters, case-insensitive |
| `arrivalTime` | with `arrivalAirport` | ISO-8601 local date-time `YYYY-MM-DDTHH:MM[:SS]`, read as Europe/Paris wall clock, or the same with an offset (converted to Europe/Paris). This is the format `FlightAvailable.arrivalDate` arrives in. |

- Home: `SpotController` (slumber), next to `/{slug}/arrival`.
- **Only DB-backed spots are reachable here**, since the curated JSON venues have no slug (F10).
- `404` `{code: "SPOT_NOT_FOUND"}` for an unknown slug, checked first, with no SNCF call. A closed venue deleted from the catalogue is this case.
- `400` `{code: "INVALID_ARRIVAL"}` when only one of the two params is given, `arrivalAirport` isn't 3 letters, or `arrivalTime` doesn't parse. No SNCF call.
- Otherwise `200`, **whatever SNCF did**. The outcome is in `status`. The endpoint never returns 5xx because of SNCF.
- `ApiException(status, code, message)` already produces the `{code}` body for both error cases (backend).

### 7.2 Response shape

```ts
type RailStatus =
  | 'OK'                        // ≥ 1 origin has ≥ 1 journey
  | 'NOT_FRANCE'                // spot.country does not normalise to 'FR' (7.7); null counts as not France
  | 'NO_COORDINATES'            // spot has no latitude/longitude
  | 'NOT_CONFIGURED'            // sncf.api.key blank
  | 'NO_STATION_NEARBY'         // no train-served stop_area within 30 km
  | 'NO_JOURNEY'                // every origin answered: no journey
  | 'TIMETABLE_NOT_PUBLISHED'   // SNCF date_out_of_bounds
  | 'PROVIDER_UNAVAILABLE'      // SNCF failed (7.6)
  | 'QUOTA_EXHAUSTED';          // daily cap reached or SNCF 429, and no cached answer

type OriginStatus = 'OK' | 'NO_JOURNEY' | 'TIMETABLE_NOT_PUBLISHED' | 'PROVIDER_UNAVAILABLE' | 'QUOTA_EXHAUSTED';

interface RailWaysInResponse {
  slug: string;
  status: RailStatus;
  provider: 'SNCF';
  date: string | null;                          // 'YYYY-MM-DD'; null for NOT_FRANCE, NO_COORDINATES, NOT_CONFIGURED
  dateBasis: 'AFTER_FLIGHT' | 'SAMPLE' | null;  // null exactly when date is null
  departAfter: string | null;                   // 'HH:MM' local; '08:00' for SAMPLE; null exactly when date is null
  chain: RailChain | null;                      // null when no arrival params were sent
  station: RailStation | null;                  // non-null once the station step succeeded
  origins: RailOrigin[];                        // [] unless a station was found
  priceState: 'MANUAL_CHECK';                   // always, in this slice
  bookingUrl: 'https://www.sncf-connect.com/';  // always
  fetchedAt: string | null;                     // ISO-8601 UTC instant; the earliest provider-fetch instant among the
                                                // cached-or-fresh entries that fed this response (7.8). null if none.
                                                // NOT rendered (8.3)
}

interface RailChain {
  airport: string;              // arrivalAirport, upper-cased
  arrivalTime: string;          // ISO-8601 with Europe/Paris offset, e.g. '2026-10-03T09:40:00+02:00'
                                // chars 0..9 are therefore the Europe/Paris calendar date; 8.3 slices them
  routed: boolean;              // true for CDG, LYS, BVA, ORY
  bufferMinutes: number | null; // CDG 90 / LYS 75 / BVA 180 / ORY 150; null when routed is false
}

interface RailStation {
  id: string;                   // 'stop_area:SNCF:87396549'
  name: string;
  distanceKm: number;           // haversine spot → stop_area, 1 decimal. Straight line.
  latitude: number;
  longitude: number;
}

interface RailOrigin {
  kind: 'AIRPORT' | 'CITY';
  code: 'CDG' | 'LYS' | 'PARIS';
  label: string;                // 'Paris Charles de Gaulle' | 'Lyon Saint-Exupéry' | 'Paris'
  stationName: string | null;   // 'Aéroport CDG 2 TGV' | 'Lyon Saint-Exupéry TGV' | null for CITY
  note: string;                 // fixed copy, 7.3
  status: OriginStatus;
  journeys: RailJourney[];      // 1..3 when OK, else []
}

interface RailJourney {
  departure: string;            // ISO-8601 with offset: '2026-10-03T08:48:00+02:00'
  arrival: string;              // at the DESTINATION station (station.name), i.e. the last alighting option
  durationMinutes: number;      // Math.round(duration / 60). THE FULL RUN to the destination: Spot FR
                                // journey 1 is 277 ('4h37'), even though Le Mans is reached in 102
  changes: number;              // nb_transfers, over THE FULL RUN. changesText() counts the full run too
  legs: RailLeg[];                        // public_transport sections only, in order; ≥ 1
  alightingOptions: RailAlightingOption[]; // rev 5; ≥ 1, ordered by ARRIVAL TIME, earliest first (7.4)
  fare: null;                             // reserved for F1; always null
}

// rev 5. Where the rider can get off THIS journey and still be within the 30 km
// rule (7.5). Spot FR's journey 1 has two: Le Mans (earlier, farther) and Arnage
// (later, nearer). Derived from the body already fetched — no extra call (7.4).
//
// THIS MUST BE ON THE WIRE. The frontend cannot derive it: legs carry only
// station names, and the client has no station coordinates and no spot
// coordinates to take a haversine from. It is a backend computation (BE5).
interface RailAlightingOption {
  stationId: string;            // 'stop_area:SNCF:87396002' (Le Mans) | 'stop_area:SNCF:87396549' (Arnage)
  stationName: string;          // 'Le Mans' | 'Arnage' — WITHOUT the commune suffix (7.4)
  arrivalTime: string;          // ISO-8601 with offset; when the rider is off the train here
  distanceKm: number;           // haversine station → spot, 1 decimal. Same maths as RailStation
  durationMinutes: number;      // THIS option's run: journey departure → arrivalTime. Le Mans = 102
  changes: number;              // changes made BEFORE reaching this option. Le Mans = 0, Arnage = 1
  final: boolean;               // true exactly once, on the journey's destination station (= station.id)
}

interface RailLeg {
  mode: string;                 // display_informations.commercial_mode: 'TGV INOUI', 'Aléop', 'NOMAD', 'Rémi', 'RER', 'OUIGO'
                                // NOT 'TER' — rev 5: no TER-branded leg exists in the captured answer.
                                // Never from display_informations.physical_mode, which lies (7.5)
  line: string | null;          // display_informations.code; '' → null. 'B' for RER B
  trainNumber: string | null;   // display_informations.headsign when it is all digits, else null
  from: string;                 // station name WITHOUT the commune suffix (7.4): 'Aéroport Charles de Gaulle 2 TGV'
  to: string;                   // ditto: 'Le Mans', not 'Le Mans (Le Mans)'
  departure: string;            // ISO-8601 with offset
  arrival: string;
}
```

**There is no `geometry` field in this slice.** D1 is settled as F0, so the
section `geojson` is read by nothing, serialized by nothing, and absent from
every fixture and from the FE types. It returns with F0 (7.9, Appendix A).

**V1** (sample mode, used in criteria). Destination is **Arnage**, so the journey
changes at Le Mans onto an **Aléop** regional train — and the 2h50 it waits there
is why `alightingOptions` offers Le Mans as well:

```json
{
  "slug": "wake-paradise-spay-fr",
  "status": "OK",
  "provider": "SNCF",
  "date": "2026-10-03",
  "dateBasis": "SAMPLE",
  "departAfter": "08:00",
  "chain": null,
  "station": { "id": "stop_area:SNCF:87396549", "name": "Arnage", "distanceKm": 2.0, "latitude": 47.928541, "longitude": 0.189882 },
  "origins": [
    {
      "kind": "AIRPORT", "code": "CDG", "label": "Paris Charles de Gaulle",
      "stationName": "Aéroport CDG 2 TGV", "note": "Station inside Terminal 2.",
      "status": "OK",
      "journeys": [
        { "departure": "2026-10-03T08:48:00+02:00", "arrival": "2026-10-03T13:25:00+02:00",
          "durationMinutes": 277, "changes": 1, "fare": null,
          "legs": [ { "mode": "TGV INOUI", "line": null, "trainNumber": "5210",
                      "from": "Aéroport Charles de Gaulle 2 TGV", "to": "Le Mans",
                      "departure": "2026-10-03T08:48:00+02:00", "arrival": "2026-10-03T10:30:00+02:00" },
                    { "mode": "Aléop", "line": "P30", "trainNumber": "857065", "from": "Le Mans", "to": "Arnage",
                      "departure": "2026-10-03T13:20:00+02:00", "arrival": "2026-10-03T13:25:00+02:00" } ],
          "alightingOptions": [
            { "stationId": "stop_area:SNCF:87396002", "stationName": "Le Mans", "arrivalTime": "2026-10-03T10:30:00+02:00",
              "distanceKm": 7.2, "durationMinutes": 102, "changes": 0, "final": false },
            { "stationId": "stop_area:SNCF:87396549", "stationName": "Arnage", "arrivalTime": "2026-10-03T13:25:00+02:00",
              "distanceKm": 2.0, "durationMinutes": 277, "changes": 1, "final": true }
          ] }
      ]
    },
    {
      "kind": "CITY", "code": "PARIS", "label": "Paris", "stationName": null,
      "note": "Any Paris station. Getting into Paris is not included.",
      "status": "NO_JOURNEY", "journeys": []
    }
  ],
  "priceState": "MANUAL_CHECK",
  "bookingUrl": "https://www.sncf-connect.com/",
  "fetchedAt": "2026-09-15T09:12:00Z"
}
```

**Every value in V1 is now captured, not illustrative** (rev 5). It is
journey 1 of R0's sanitized fixture,
`src/test/resources/sncf/journeys-cdg-arnage-20261003.json`. Three things the
capture corrected, all of which had been quoted as fact:

- **08:48, not 08:49.** The 08:49 figure came from the earlier CDG→**Le Mans**
  probe, not from this route.
- **There is no `TER` leg.** The second leg is **`Aléop P30 857065`**
  (`commercial_mode` `Aléop`, `code` `P30`, `headsign` `857065`). Leg 1 is
  `TGV INOUI 5210` because its `code` is empty (`''` → `line: null`) and its
  headsign is `5210`.
- **V1 now holds ONE journey.** The old second journey (RER B + TGV 8051) is not
  in this body at all — it too was the Le Mans probe. The fixture's other real
  journeys (09:43→13:50 via Saint-Pierre-des-Corps and Tours, 12:16→16:29 via
  Écommoy, and two on 2026-10-04) are used by criterion 12, which tests counts
  and ordering rather than leg strings, and by V2.

**The 2h50 wait is the point.** V1's rider reaches Le Mans at 10:30 and Arnage at
13:25 on the same ticket. That is why `alightingOptions` exists, and why the
block shows both rather than quietly heading a 4h37 journey.

> **P1 CLOSED (rev 5), from R0's captured body.** Arnage is
> `stop_area:SNCF:87396549` at **(47.928541, 0.189882)**; haversine from Spot FR
> (47.934, 0.165) is **1.9506 km → `2.0`**. Rev 4 had the *coordinates* wrong
> (47.9226, 0.1826 → 1.8), not the distance: V1's `distanceKm: 2.0`, criterion
> 7's figure and criterion 24's "2 km" were correct all along and are unchanged.
> The coordinates above are now the only ones in the spec, and the FE fixture
> carries the same pair.
Durations are deliberately chosen to avoid a minutes-under-10 case, so no test
depends on how `formatDuration` pads.

**V2** (chained): V1 with these differences:
- `dateBasis: "AFTER_FLIGHT"`, `departAfter: "11:15"`
- `chain: {"airport": "CDG", "arrivalTime": "2026-10-03T09:35:00+02:00", "routed": true, "bufferMinutes": 90}`
- `origins` = only the CDG origin, holding only the **12:16 → 16:29** journey (the captured fixture's third same-day departure, 253 min, 2 changes, via Écommoy). The 11:29 RER B journey rev 2 used **does not exist** — it belonged to the old CDG→Le Mans probe (7.2).

**Why 09:35 is kept** (rev 5). Rev 2 chose it to preserve the 11:29 train, which
the capture has since shown does not exist on this route. It is kept anyway, for
a duller reason: 09:35 + 90 → **11:15** and 10:05 + 90 → 11:45 both leave the
real 12:16 departure qualifying, so the vector still works and **criterion 31's
pinned string doesn't have to be re-derived**. Criterion 10 keeps the 10:05
landing for the date arithmetic; the two vectors test different things.

### 7.3 Origins (backend)

`rail-gateways.json` (slumber classpath) holds the airports:

| code | label | stationName | stopAreaId | note | bufferMinutes |
|---|---|---|---|---|---|
| `CDG` | `Paris Charles de Gaulle` | `Aéroport CDG 2 TGV` | `stop_area:SNCF:87271494` (probed) | `Station inside Terminal 2.` | **90** |
| `LYS` | `Lyon Saint-Exupéry` | `Lyon Saint-Exupéry TGV` | `stop_area:SNCF:87762906` (probed, 689 m from the terminal) | `Station linked to the terminal.` | **75** |

It also holds the city and the airports that route through it:

| code | label | from | note | chained from |
|---|---|---|---|---|
| `PARIS` | `Paris` | `admin:fr:75056` | `Any Paris station. Getting into Paris is not included.` | `BVA` (**180**), `ORY` (**150**) |

**Sample mode** (`chain` null, or `chain.routed` false):
- Origins are `CDG`, then `LYS` only when `LYS` is in `SpotArrivalService.nearestAirports(lat, lon)`, then `PARIS`. That order is fixed and load-bearing for the cap (7.8).
- An airport origin whose `stopAreaId` equals `station.id` is omitted.

**Chained mode** (`chain.routed` true):
- Exactly one origin: `CDG`→`CDG`, `LYS`→`LYS`, `BVA`/`ORY`→`PARIS`.
- LYS is included regardless of distance, because the rider picked that flight.
- It is never omitted.

### 7.4 Date, departure time and journey selection (backend)

**Sample:**
- `date` = the first Saturday on or after `today(Europe/Paris) + 14 days`, from an injected `Clock`.
- `departAfter` = `08:00`.

**Chained:**
- `t = arrivalTime (Europe/Paris) + bufferMinutes`, rounded **up** to the next quarter hour (a time already on one stays).
- `date` = `t`'s local date, and `departAfter` = `t`'s `HH:MM`. A late landing can roll to the next day.

**Journeys request** per origin:
- `from=<id>&to=<station.id>&datetime=<date>T<HHMM>00&datetime_represents=departure`
- `direct_path=none`, `max_nb_transfers=3`, `data_freshness=base_schedule`
- **`depth=2`, which is load-bearing here too** (rev 5): it is what makes each
  section carry its stop_area id, coordinates and `stop_date_times`, i.e.
  everything `alightingOptions` needs. It is also how R0's fixture was captured,
  so the fixture and the production request agree — drop it and the fixture stops
  representing what we send.
- a count parameter asking for ≥ 3 journeys (backend picks `count` or `min_nb_journeys`)

**Kept journeys:**
- Departure is at or after `date` + `departAfter` and on `date` or the day after.
- The journey has ≥ 1 `public_transport` section.
- They are de-duplicated by (departure, arrival), sorted by departure, and the first 3 are kept.
- 0 kept after a 200 means the origin is `NO_JOURNEY`.

**Alighting options (rev 5), derived from the journey already fetched — no extra
SNCF call.** For each kept journey:

- A candidate is **every stop the journey calls at**, from each
  `public_transport` section's `stop_date_times[]` — confirmed present on every
  section, each entry carrying the stop_point's `name`, `id`, `coord`,
  `arrival_date_time` and `departure_date_time`. That includes leg boundaries
  **and** mid-leg stops. The journey's own origin is excluded.
- A candidate becomes an alighting option when its straight-line distance to the
  spot is **≤ 30 km**, the same rule and the same haversine as 7.5. The
  destination station is always ≤ 30 km (that is how it was chosen), so
  **`alightingOptions` is never empty** and its last entry is always the destination.
- `arrivalTime` is that stop's arrival time; `distanceKm` is rounded to 1 decimal;
  `final` is true only for the destination station.
- **Each option carries its own `durationMinutes` and `changes`** (rev 5, sdet's
  ask): `durationMinutes` is the journey's departure to **that option's**
  `arrivalTime`, and `changes` counts the changes made **before** reaching it.
  Le Mans is `102` / `0`; Arnage is `277` / `1`. The frontend must never infer
  either by walking `legs[]` — that inference is exactly what these two fields
  remove. The **top-level** `durationMinutes` and `changes` stay the full run
  (7.2), so every criterion resting on them keeps its meaning.
- Surviving options are ordered by **arrival time**, earliest first, which for a
  journey that doesn't double back is also journey order.
- **Selection is not re-run here, and the top-level `station` is not ambiguous.**
  7.5 still picks the destination station, it is still the **nearest rail-served**
  stop_area (Arnage), and it remains **the canonical destination that journeys are
  requested to** (`to=<station.id>`, 7.4). Alighting options are **per-journey
  extras, not a second destination**: they change no request, no status and no
  cache key. Read `station` as "where these journeys were routed to", **never** as
  "the stop we recommend" — for Spot FR the rider may well prefer Le Mans, and the
  product does not pick for them. The station line and the `NO_JOURNEY` line in
  8.3 therefore keep exactly their current meaning and wording.
- **"Nearest" does not win among the options**: Le Mans (7.2 km) arrives **2h50
  before** Arnage (2.0 km). Ordering is by position on the journey, never by
  distance, and nothing marks one option as recommended.
- **Ids and coordinates are provider-supplied, never derived.** backend resolved
  **45 of 45** stops in the captured fixture from a **nested `stop_area` object**
  in the body, deriving none. An option whose stop_area id or coordinates would
  have to be inferred is not emitted.
- **Coordinates come from the journeys body**, which carries them: every section's
  `from`/`to` has a `coord` **and** a `stop_area.id` with the stop_area's own
  `coord`, and every `stop_date_times` entry has a stop_point `coord`. Measured,
  from the capture: Le Mans `stop_area:SNCF:87396002` (47.995615, 0.192614) is
  **7.1531 km → 7.2** from Spot FR, and Arnage `stop_area:SNCF:87396549`
  (47.928541, 0.189882) is **1.9506 km → 2.0**. If a stop carries no usable
  coordinates it contributes **no** option rather than a guessed distance.
- **An option is keyed by (station, arrival time), not by station.** The same
  station can legitimately appear twice before filtering: the captured journey 3
  calls at **Écommoy at 14:59** on the NOMAD leg and again at **16:17** on the
  Aléop leg, because the itinerary doubles back.
- **Filter by dominance, not by a cap** (lead's decision). Keep an option only if
  no other option on the **same journey** is both no later and no farther.
  Formally, drop `X` when some `Y` satisfies
  `Y.arrivalTime <= X.arrivalTime` **and** `Y.distanceKm <= X.distanceKm`, with
  `Y` strictly better on at least one axis. **Order the survivors by arrival
  time.** Why this and not an arbitrary limit:
  - It keeps exactly the trade-off the feature exists to show. On journey 2,
    `Aubigné-Racan` (13:23, 28.5 km) and `Arnage` (13:50, 2.0 km) **both**
    survive: neither dominates the other, because one is earlier and the other is
    nearer. **All 5 of journey 2's options survive** for that reason.
  - It absorbs the duplicate wrinkle with no special rule: journey 3's 16:17
    Écommoy is the same station at the same distance as its 14:59 visit, so it is
    dominated and drops out.
  - It is self-limiting, so there is no `N` to justify and **no "show more"
    control**, and it never hides an option that is genuinely better on some axis.
  - **It can prune hard, and that is correct.** Journey 3 has **6 qualifying
    visits at 4 distinct stations** and yields **2** options: `Le Mans` (13:59,
    7.2 km) dominates its own later call at 14:39, **both** Écommoy visits (14.4
    km, later) *and* `Laigné - Saint-Gervais` (16:23, 7.7 km — later *and*
    farther), leaving `Le Mans` and `Arnage` (16:29, 2.0 km).
  - **It applies inside V1 too.** Journey 1 calls at Le Mans **twice** — arriving
    10:30, then again at 13:20 as the Aléop leg boards. The 13:20 visit is the
    same station at the same distance, later, so it is dominated and never
    reaches the rider. V1's two options are the survivors.
  - **Measured totals over the captured fixture**, after the whole pipeline:
    journey 1 **2** options of 6 stops called at, journey 2 **1** of 18 (5 survive
    dominance, then materiality leaves Arnage alone), journey 3 **2** of 9,
    journeys 4 and 5 **2** each of 6. **No journey in real data produces more than
    two rows**, which is why there is no cap and no "show more".
- **Then a materiality threshold, `ALIGHTING_MIN_SAVING_MINUTES` = 30** (lead's
  decision; configured as `sncf.alighting-min-saving-minutes`, 7.8, so the
  threshold and the comparison rule below stay tunable together and cannot drift
  apart). Walk the surviving options **from the closest outward**. Keep an
  earlier, farther option only if it arrives **at least
  `ALIGHTING_MIN_SAVING_MINUTES` before the last option that was KEPT**.
  - **Compare against survivors, re-anchoring on the last kept option** — never
    against one that was dropped. This is pinned because the looser phrasing
    ("the next-closer option") has two defensible readings that **disagree**, and
    an implementation and a test could each be right while contradicting each
    other.
  - **The discriminating example**, which any test must include: options **A**
    (closest, arrives 14:00), **B** (farther, 13:40) and **C** (farthest, 13:20).
    **B drops** — only 20 minutes before A. **C is then compared to A, not to the
    dropped B**, giving **40 minutes**, so **C is KEPT**. Under the other reading
    C would be measured against B, save 20, and be lost.
  - **Why:** the rider's question is "does this save me meaningful time over the
    best option I'd otherwise take". A dropped option is never offered to them, so
    it cannot be the thing they are saving time against.
  - **Setting the constant to zero restores every Pareto option** (2, 5, 2 across
    the three sample journeys) with **no contract change** — the filter switches
    off, it doesn't change shape.
  - **Every vector in a criterion must be DERIVED by running this algorithm, never
    hand-written** (rev 5.1). Criterion 45 briefly claimed that lowering the
    threshold to 20 brought back both Aubigné-Racan **and Mayet**; Mayet saves 19
    minutes against the anchor and misses by one. It was derived by hand and
    relayed without re-derivation — the same failure mode as the alighting note,
    one layer further out, and harder to catch because a plausible number looks
    like a fact. The savings for journey 2, against the Arnage anchor, are
    **Laigné 6, Écommoy 13, Mayet 19, Aubigné-Racan 27**; every threshold claim
    must follow from those and from the re-anchoring rule above.
  - **Journey 1 keeps both**: Le Mans 10:30 against Arnage 13:25 saves **175
    minutes**. This is the case the user decided on, and it survives.
  - **Journey 2 collapses to one**: its whole spread is **27 minutes**, so
    Laigné - Saint-Gervais (6 min earlier), Écommoy (13), Mayet (19) and
    Aubigné-Racan (27) all fall short of 30 and drop, leaving **Arnage alone**.
  - **Journey 3 keeps both**: Le Mans 13:59 against Arnage 16:29 saves 150.
  - **Why**: the block exists to show a trade worth making. "Get off 13 minutes
    earlier and be 12 km further out" is not one, and five near-identical rows are
    less honest than one clear answer plus the genuine alternative.
- **The pipeline, in order:** within 30 km of the spot → **dominance** →
  **materiality** → order by **arrival time**. Each step only ever removes
  options, so `alightingOptions` can shrink to one but never to zero.
- **`final` always survives both filters.** No option can dominate the
  destination — 7.5 chose it as the nearest rail-served stop_area, so nothing on
  the journey is nearer — and materiality only ever drops options *farther* than
  a survivor. Its `arrivalTime` is the journey's own arrival.

**Station names drop the commune suffix** (rev 5, backend's recommendation,
adopted). `section.from.name` / `to.name` render the commune in brackets —
`Le Mans (Le Mans)`, `Aéroport Charles de Gaulle 2 TGV (Tremblay-en-France)` —
which would put `Le Mans (Le Mans) 10:30` in front of a rider. The same body
carries the clean name on the embedded `stop_point` / `stop_area` objects, so
**every station name on the wire (`RailLeg.from`, `RailLeg.to`,
`RailAlightingOption.stationName`) comes from the embedded stop_point or
stop_area `name`, never from the section place's `name`.** No extra call: it is
the same response. Nothing strips the suffix with string surgery.

**Time conversion:** local `YYYYMMDDTHHMMSS` becomes ISO-8601 with the
Europe/Paris offset for that instant (`+02:00` summer, `+01:00` winter).

**Navitia fares are ignored.** Whether `fare.found` is true or false, `fare` is
`null` and `priceState` is `MANUAL_CHECK`. `fare.found` may be logged at DEBUG
for F1, with no key and no URL userinfo.

**Section `geojson` is ignored** and not carried into any DTO (F0).

### 7.5 Destination station (backend)

**One** SNCF call per spot, in this form. **The mechanism is measured, not
assumed** — backend ran it live during the rev 2 review, and that measurement is
what closes R0 (13.2). Nobody re-verifies it, and no further SNCF calls are
spent on it:

```
GET /coverage/sncf/coords/{lon};{lat}/places_nearby?distance=30000&type[]=stop_area&count=100&depth=2
```

- **Longitude first** in the path.
- **`depth=2` is what makes one call enough.** At `depth=2` every returned
  stop_area carries its own `physical_modes[]` array, so the response already
  says which stops are rail-served. All five rail modes are therefore filtered
  **locally, from that single response** — no second request, no per-mode fan-out.
- **`count=100` is set explicitly, as defensive headroom** (rev 4, corrected).
  The default is 10 (max 200). Results are ranked **purely by distance**, with no
  mode weighting, so at a spot with dense bus coverage a default page can be
  filled by coach stops before a rail-served stop_area appears. `count=100`
  removes that failure mode for the price of one larger response.
  **It does not change Spot FR's answer**: in backend's probe Arnage came back at
  **position 2** and Le Mans at **position 9**, so a default page of 10 would have
  selected the same station. Rev 3 claimed the default "truncates before any rail
  stop appears" and "returns only coach stops" and called that measured — it was
  neither measured nor true, and that claim is withdrawn.
- **The `filter=physical_mode.id=…` form is rejected, and this is why.** It
  returns 200, but it accepts exactly **one** mode per request *and* strips
  `physical_modes` from the output, so covering the five rail modes would cost
  **five** calls and still leave nothing to filter locally. Measured; not used.
- Rail-served means `physical_mode:Train`, `LongDistanceTrain`, `LocalTrain`, `RapidTransit` or `RailShuttle`. Coach, bus and tram-only stops are skipped.
- **This stop_area-level filter is trustworthy. A *section*-level
  `display_informations.physical_mode` is NOT** (rev 5, from R0's capture): the
  5-minute Aléop hop from Le Mans to Arnage is labelled **"Train grande vitesse"
  / `LongDistanceTrain`** in the journeys body. **Nothing may infer a leg's mode,
  brand or importance from it** — the rendered brand comes from
  `commercial_mode` (7.2, `RailLeg.mode`), and no filtering, sorting, ranking or
  copy anywhere in this slice reads a section's `physical_mode`. The two live at
  different levels and only the stop_area one is used (7.5's filter is
  unaffected).
- **The nearest remaining stop_area wins, even if it is a small halt.** That is the settled rule (13.5): for Spot FR it selects **Arnage** (1.95 km) over **Le Mans** (7.15 km), and no mode filter can separate the two because both are `LongDistanceTrain`-served. The rider gets "TGV to Le Mans, change, Aléop to Arnage" and ends 2 km away instead of 7, with Le Mans offered as an alighting option on the same journey (7.4). A mainline preference needs route counts and a second call — **F6**.
- `distanceKm` is the haversine distance from the spot's coordinates to the stop_area's, 1 decimal.
- A 200 with no rail stop_area gives `NO_STATION_NEARBY`.

This one-call station step is the `1` in the per-request budget of **≤ 4 calls
in sample mode and ≤ 2 chained** (7.6, 7.8).

### 7.6 Error mapping (backend)

Per SNCF call, first match wins.

| SNCF outcome | Station step → top-level `status` | Journeys step → origin `status` |
|---|---|---|
| Daily cap already reached (7.8), no call made | `QUOTA_EXHAUSTED` | `QUOTA_EXHAUSTED` |
| HTTP 429 | `QUOTA_EXHAUSTED`, and the cap counts as reached until the next reset | same |
| `error.id = no_solution` (any HTTP code) | n/a | `NO_JOURNEY` |
| `error.id = date_out_of_bounds` | n/a | `TIMETABLE_NOT_PUBLISHED` |
| HTTP 401/403, any other `error.id`, other 4xx, 5xx, timeout, I/O error, unparseable body | `PROVIDER_UNAVAILABLE` | `PROVIDER_UNAVAILABLE` |
| **HTTP 200 with an empty or null body** — zero-length, or a body that parses to JSON `null` (rev 5 addendum) | `PROVIDER_UNAVAILABLE` | `PROVIDER_UNAVAILABLE` |
| 200, parseable | per 7.4 / 7.5 | per 7.4 |

Timeouts are **3 s to connect and 8 s to read** per call. The shared OkHttp
bean is 5 s / 15 s / 20 s, so these are set per call via `newBuilder()`, keeping
the shared connection pool (backend). Origins may be fetched in parallel.

**Call budget, and no retries.** A failure is classified and returned; nothing
is retried, so error handling never adds a call. The budget is therefore exactly
**1 station call (7.5) + at most 3 journeys calls = ≤ 4 in sample mode**, and
**1 + 1 = ≤ 2 chained**. That matches 7.8 and criteria 10, 17, 19 and 20.

### 7.7 Top-level status precedence

After 404 and 400. First match wins.

1. `NOT_FRANCE`: no SNCF call. **Country normalisation, shared with the frontend
   (8.1):** trim the value, upper-case it, and compare to the exact string `FR`.
   `FR`, `fr`, `Fr` and `" fr "` are all France; `null`, `""`, `FRA` and `F` are
   not. The backend expression is
   `country != null && "FR".equalsIgnoreCase(country.trim())`; the frontend's is
   `spot.country?.trim().toUpperCase() === 'FR'`. **The two agree on all supported
   values** — the ASCII cases in criterion 43 — rather than being character-for-
   character identical (rev 4).
   - **Known divergence, accepted:** JS `.trim()` strips Unicode whitespace
     including **U+00A0** (no-break space), while Java `String.trim()` only strips
     chars `<= U+0020` and so leaves it. A country of `" FR"` is therefore
     France to the frontend and not to the backend.
   - **It fails safe.** In that direction the frontend asks and the backend
     answers `NOT_FRANCE`, which renders nothing (8.3, criterion 29). The rider
     sees no block and no wrong block. The reverse — backend serves, frontend
     never asks — cannot happen, because every value Java trims, JS trims too.
   - **`String.strip()` does not close it.** It strips by
     `Character.isWhitespace`, which returns **false** for U+00A0 (it is
     explicitly excluded as a non-breaking space). Swapping `trim()` for `strip()`
     would widen Java's handling of other Unicode whitespace without matching JS
     on the one character that actually differs, so **no code change is made**
     and no criterion covers U+00A0.
2. `NO_COORDINATES`: no call.
3. `NOT_CONFIGURED`: no call.
4. Station step: `QUOTA_EXHAUSTED` / `PROVIDER_UNAVAILABLE` / `NO_STATION_NEARBY`. No journeys calls.
5. Any origin `OK` → `OK`.
6. Else any `PROVIDER_UNAVAILABLE` → `PROVIDER_UNAVAILABLE`.
7. Else any `QUOTA_EXHAUSTED` → `QUOTA_EXHAUSTED`.
8. Else any `TIMETABLE_NOT_PUBLISHED` → `TIMETABLE_NOT_PUBLISHED`.
9. Else `NO_JOURNEY`.

`chain` is echoed in every 200 where arrival params were sent, including statuses 1–4.

### 7.8 Caching, quota and key handling (backend)

**Caching** (`cached_api_response` via `PersistentCacheService`):

| What | Key | TTL | Cached when |
|---|---|---|---|
| Station | spot coordinates (5 decimals) | 30 days | found |
| No station | same | 7 days | `NO_STATION_NEARBY` (a real 200 answer from SNCF, unlike Overpass) |
| Journeys | (origin id, station id, date, departAfter) | 24 hours | origin `OK` or `NO_JOURNEY` |
| Never | — | — | `PROVIDER_UNAVAILABLE`, `QUOTA_EXHAUSTED`, `TIMETABLE_NOT_PUBLISHED` |

Rounding `departAfter` to the quarter hour lets flights landing a few minutes
apart share a cache row.

**What a cached entry stores, and how `fetchedAt` is derived.**
`PersistentCacheService.get` returns only the body, never the row's own
`createdAt`, so the fetch instant has to be **inside the cached value**
(backend). This is what makes `fetchedAt` deterministic:

- Every cached entry — station, no-station and journeys alike — is stored as a
  wrapper carrying **the UTC instant of the provider call that produced it**
  alongside the mapped payload, e.g.
  `{ "fetchedAt": "2026-09-15T09:12:00Z", "value": { … } }`.
- **There is one concrete wrapper class per payload type — three in total** (rev
  4, backend's correction). `PersistentCacheService.get(key, Class<T>)` takes a
  `Class` token, and a generic `CachedWithInstant<T>` cannot carry its `T` through
  erasure: the payload would deserialize as a `LinkedHashMap`. So the wrappers are
  **written out per type** — one for the station payload, one for the no-station
  marker, one for the journeys payload — each with the same two members,
  `fetchedAt` (the instant) and `value` (that type's payload). Each is passed to
  `get` as its own class token. **Do not expect, implement or accept a single
  generic wrapper**; that applies to A1's acceptance check as much as to the code.
- That instant is written **once**, when the SNCF answer is first received. A
  cache hit re-serves the **stored** instant verbatim; it is never refreshed to
  "now" on read, and the TTL does not touch it.
- The response's `fetchedAt` is the **earliest** of the instants of the entries
  that actually fed this response — the station entry plus every origin whose
  journeys were used — whether each came from cache or from a live call. A live
  call contributes the instant of that call.
- Steps that contributed no SNCF answer contribute no instant: an origin that
  is `PROVIDER_UNAVAILABLE` or `QUOTA_EXHAUSTED` is never cached and never
  affects `fetchedAt`.
- `fetchedAt` is `null` exactly when no SNCF answer fed the response at all
  (`NOT_FRANCE`, `NO_COORDINATES`, `NOT_CONFIGURED`, or a station step that
  failed before any answer).

Two identical requests therefore return the **same** `fetchedAt`, and a response
built from a 3-day-old cached station plus freshly fetched journeys reports the
**station's** older instant (criterion 17). `fetchedAt` is not rendered (8.3,
criterion 27); it exists so a later slice can reason about staleness (F13).

**Quota:**
- **Per request:** at most 4 SNCF calls in sample mode (1 station + 3 journeys) and 2 in chained mode (7.6).
- **Daily cap:** `sncf.daily-call-cap`, default **1000**. That's 20% of the 5,000/day free tier — backend confirmed it as sane: worst case ≥ 250 uncached spot views/day, and the 30-day station cache makes real usage far lower.
  - Every HTTP attempt counts.
  - **The cap is consumed in origin order — CDG, then LYS, then PARIS — even when origins are fetched in parallel.** A partial cap therefore always starves the *last* origins, never a random one. Without this, criterion 19 is a race.
  - The counter resets at 00:00 Europe/Paris (by the injected `Clock`).
  - It lives in memory, so it also resets on every devtools hot-restart — in dev the cap is softer than 1000 (F12 owns this).
- **No bulk harvesting:** no `@Scheduled` job, no startup warm-up, no multi-spot loop. SNCF is called only while serving one `GET /api/spots/{slug}/rail`.

**Key handling:**
- `application.yml` gains `sncf.api.key: ${SNCF_API_KEY:}`, `sncf.api.base-url: ${SNCF_API_BASE_URL:https://api.sncf.com/v1}`, `sncf.daily-call-cap: ${SNCF_DAILY_CALL_CAP:1000}` and, rev 5, **`sncf.alighting-min-saving-minutes: ${SNCF_ALIGHTING_MIN_SAVING_MINUTES:30}`** — the single home of `ALIGHTING_MIN_SAVING_MINUTES` (7.4). The threshold appears in code and prose only by that name, never as a scattered literal, so it is tunable without touching the contract.
- The key stays in the gitignored `application-local.yml` locally. No literal key is committed.
- It is sent only as the basic auth username with an empty password, and never appears in a URL, response, log line or exception message.

### 7.9 Trace geometry — held for F0, not built here

Kept so F0 can start from a written contract. **Nothing in this slice
implements any of it**: no `geometry` field in 7.2, no `railTraceFeatures` in
8.4, no BE4/FE4 task, and criteria 40–42 (Appendix A) are withdrawn. Reviewers
should read this section as F0's spec, not as work.

`RailLeg.geometry`:
- The `[lon, lat]` pairs of the section's `geojson.coordinates` (LineString).
- Simplified to ≤ 100 points per leg, first and last points kept.
- `null` when the section has no `geojson`.

Frontend, in F0:
- Each journey gets a `Show on map` toggle button (`aria-pressed`). Pressed, it reads `Hide from map`, and one journey at a time can be pressed.
- A pressed journey is drawn on `DetailMap` from a pure builder `railTraceFeatures(journey, station, spot)`. The builder returns a FeatureCollection:
  - one LineString per leg with non-null geometry, `properties.kind = 'rail'`
  - one straight LineString station → spot, `properties.kind = 'last-mile'`, drawn dashed
  - `null` when every leg's geometry is null, in which case there's no button
- The map fits the bounds of all points.
- Pressing a rail button clears the selected airport route, and pressing an airport `Show route` un-presses the rail button.

### 7.10 OpenAPI

`docs/openapi.yaml`, `docs/openapi-lite.yaml` and
`docs/slumber-api.postman_collection.json` (slumber) document the endpoint, per
slumber `AGENTS.md` invariant 6. **No `/api/spots/**` path is documented in any
of the three today** (not `/{slug}`, `/arrival` or `/pois`), so `/rail` is the
first — sdet verifies criterion 22 by file assertion rather than a JUnit test.

## 8. Frontend (webagency)

### 8.1 When requests are made

**Sample request:**
- `GET /api/spots/{slug}/rail` via `trackedFetch`, **once per slug**.
- Made only when the resolved spot is French and has non-null `cityLatitude` / `cityLongitude`. `SpotDetailPage` resolves `country` and backfills those from `latitude`/`longitude` (L754–755).
- **French means `spot.country?.trim().toUpperCase() === 'FR'`** — the same
  normalisation the backend applies (7.7). A bare `country === 'FR'` is wrong:
  the API accepts `fr` and would answer `OK`, so an exact-case gate would
  silently drop rail for a valid lowercase-country spot and send no request at
  all. `null`/`undefined`-safe, and `FRA` is still not France (criteria 43, 44).
- Made once the spot resolves from `/api/destinations/spots` (not on first paint), since that's where those fields come from.
- The result is page state and isn't refetched on tab switches.

**Chained request:**
- Made when **all** of these hold:
  - the spot qualifies as above
  - an outbound fare is picked (combined-trip-total page state) and the picked `FlightAvailable` has non-null `destination` and `arrivalDate`
  - the Getting there tab is active
  - no response for this `(slug, destination, arrivalDate)` is held yet
- Request: `GET /api/spots/{slug}/rail?arrivalAirport={destination}&arrivalTime={arrivalDate}`, URL-encoded.
- Held responses are kept per key for the page's life, and changing the pick back to a held key sends nothing.
- The page holds the picked `FlightAvailable` in parallel state next to the existing `outbound: TotalComponent`, cleared by `removeTripLine` and by the slug reset. That's an addition to combined-trip-total 7.8 page state, **not** a change to `TotalComponent`, so that spec's criterion 30 still holds.

**Which response the block shows:**
- The held chained response for the current pick, if there is one.
- Otherwise, loading, while that chained request is in flight.
- Otherwise, the sample response.

**No request from any pick control.** `Add to trip cost`, `In trip cost`,
`Remove flight from trip cost`, the steppers and `Remove stay …` send nothing.
Un-picking shows the sample response again with no request.

**Non-French spots:** no request, no block. The backend's `NOT_FRANCE` is the
backstop, not the gate: if the two ever disagree, a `NOT_FRANCE` body still
renders nothing (criterion 29), but the frontend must not withhold the request
from a spot the backend would serve.

### 8.2 Where it renders

- Inside the Getting there panel, **after** the existing curated ways / airports / OSM station rows.
- A `<section>` labelled by its heading `By train`, found by `getByRole('region', { name: 'By train' })`. Being its own section keeps it clear of the 520 px fare-column rule in `SpotFinder.css`.
- Unchanged: the curated `TRAIN` row, `AccessFare`, the OSM station row and `TripTotalCard`.
- There's no `Add to trip cost` button in the block.
- No map control and no `Show on map` button in this slice (F0).

### 8.3 Fixed copy (tests match these strings)

**Single source.** Any string that appears both here and in a criterion is
**quoted from here**, never restated in the criterion's own words. Two
specifications of one exact-string test will drift, and when they do one of them
fails with no way to tell which was right — rev 5.1 fixed exactly that for the
alighting note. **No copy is count-dependent**: `alightingOptions` has no cap and
its per-journey filters can leave one option or several (criterion 45), so
wording like "either station" or "neither leg" is forbidden.

**Edit these strings against the file's bytes, never against recollection.** While
fixing the alighting-note drift, `pm` reconstructed criterion 46 from memory and
came within one tool call of writing a **third** version of the same sentence —
in the middle of repairing a defect caused by there being two. Read the line, then
change it. This applies to anyone editing copy here, and it is why the rule above
exists rather than just the corrected string.

**Block**

| Element | Text |
|---|---|
| Heading | `By train` |
| Loading | `Looking up train times…` |
| Date line, `SAMPLE` | `Sample date {formatShortDate(date)}, departures from {departAfter}. Not your travel date.` → `Sample date Sat 3 Oct, departures from 08:00. Not your travel date.` |
| Date line, `AFTER_FLIGHT`, AIRPORT origin | `After your flight lands at {chain.airport} at {formatClock(chain.arrivalTime)} on {formatShortDate(chain.arrivalTime.slice(0, 10))}: trains from {departAfter}, allowing {formatDuration(chain.bufferMinutes)} to reach {origins[0].stationName}.` → `After your flight lands at CDG at 09:35 on Sat 3 Oct: trains from 11:15, allowing 1h30 to reach Aéroport CDG 2 TGV.` |
| Date line, `AFTER_FLIGHT`, CITY origin | `… allowing {formatDuration(chain.bufferMinutes)} to reach a Paris station.` → `After your flight lands at BVA at 09:40 on Sat 3 Oct: trains from 12:45, allowing 3h to reach a Paris station.` |
| Not-routed note (`chain.routed === false`), before the sample date line | `Your flight lands at {chain.airport}. We don't have train times from there yet, so these are for a sample date.` |
| Station line | `To {station.name}, {distanceKm} km from the spot in a straight line. Getting from the station to the spot is not included.` → `To Arnage, 2 km from the spot in a straight line. …` |
| Price note (once, when `status` is `OK`) | badge `Manual check`, then `SNCF gives no fares, so trains are not in any total.` |
| Attribution (when `station` non-null) | `Train times from SNCF.` |

**Four rules that make this copy testable, all from the rev 1 review:**

1. **The date is sliced, never parsed.** `formatShortDate` only builds from
   parts for a bare `YYYY-MM-DD` (`src/services/flightFormat.ts` L78–93);
   anything else goes through `Date.parse` and renders in the *reader's* zone.
   `chain.arrivalTime` carries the Paris offset, so its first 10 characters are
   already the Paris calendar date — pass those. Otherwise a 00:30 landing reads
   as the previous day in New York, beside times that are correct. Pinned by
   criterion 31 under `TZ=America/New_York` and `TZ=Asia/Tokyo`.
2. **The AIRPORT line reads `origins[0].stationName`.** Chained mode has exactly
   one origin (7.3), and `origins: []` only ever coincides with `station: null`,
   where no date line renders at all — so this never faces an empty array.
3. **`fetchedAt` is deliberately not rendered.** No price is shown, so no
   freshness claim is made, and `base_schedule` times weeks out don't move
   inside the 24-hour cache window. The *absence* is pinned by criterion 27, so
   it stays a decision rather than a gap. If that ever stops being true, it's
   F13, not a copy tweak.
4. **`distanceKm` renders without a trailing `.0`** — `2.0` reads `2 km`, `7.2`
   reads `7.2 km`. One decimal at most. **This applies to the alighting lines
   too** (rev 5): `Stay to Arnage 13:25 · 2 km to the spot`, beside
   `Off at Le Mans 10:30 · 7.2 km to the spot`. The lead's brief illustrated that
   line as `2.0 km`; it is pinned as **`2 km`** so the same station does not read
   `2 km` on the station line and `2.0 km` three lines below, and so rule 4 keeps
   one form with no exception. **Settled: the lead reviewed this and confirmed
   `2 km`** (2026-09-17). Do not change it back.

`Looking up train times…` ends in a single `…` (U+2026), not three periods.
Exact-string matches fail on the wrong one.

For an `AFTER_FLIGHT` date line where the date of `t` differs from the landing
date, the landing date (from `chain.arrivalTime`) is the one shown.

The buffer is always visible in the chained date line — that's the rev 2 rule,
and it's why `formatDuration(chain.bufferMinutes)` is in the string rather than
implied by the departure time.

**Per status**

| `status` | Renders (heading always, except where stated) |
|---|---|
| `OK` | [not-routed note], date line, station line, price note, origin groups, attribution |
| `NO_JOURNEY` | [not-routed note], date line, station line, `SNCF found no train to {station.name} on {formatShortDate(date)}.`, attribution |
| `TIMETABLE_NOT_PUBLISHED` | [not-routed note], date line, station line, `SNCF has not published train times for {formatShortDate(date)} yet.`, attribution |
| `NO_STATION_NEARBY` | `No train station within 30 km of this spot.` |
| `PROVIDER_UNAVAILABLE` | `Train times are unavailable right now. Try again later.` (+ date and station lines when `station` non-null) |
| `QUOTA_EXHAUSTED` | `Train times are paused for today. Try again tomorrow.` (+ date and station lines when `station` non-null) |
| `NOT_FRANCE`, `NO_COORDINATES`, `NOT_CONFIGURED` | **nothing, no heading** |
| request failed (network, non-200, unparseable) | as `PROVIDER_UNAVAILABLE` |

**Origin group** (status `OK` only, in response order)

| Element | Text |
|---|---|
| Heading, AIRPORT | `From {label} ({code})` → `From Paris Charles de Gaulle (CDG)` |
| Heading, CITY | `From {label}` → `From Paris` |
| Note | `{note}` |
| Origin `NO_JOURNEY` | `No train from here on this date.` |
| Origin `TIMETABLE_NOT_PUBLISHED` | `Times for this date are not published yet.` |
| Origin `PROVIDER_UNAVAILABLE` / `QUOTA_EXHAUSTED` | `Could not load trains from here right now.` |

**Journey** (one list item per journey; every part is always visible, not collapsed)

| Element | Text |
|---|---|
| Summary (rev 5: names the end station, so it can't be read as the Le Mans option) | `{formatClock(departure)} → {station.name} {formatClock(arrival)} · {formatDuration(durationMinutes)} · {changesText(changes)}` → `08:48 → Arnage 13:25 · 4h37 · 1 change` |
| `changesText` | `0` → `Direct`, `1` → `1 change`, `n ≥ 2` → `{n} changes` |
| Leg line, one per leg | `{legName(leg)} · {from} {formatClock(departure)} → {to} {formatClock(arrival)}` → `TGV INOUI 5210 · Aéroport Charles de Gaulle 2 TGV 08:48 → Le Mans 10:30` |
| `legName` | `mode`, plus ` {line}` when non-null, plus ` {trainNumber}` when non-null → `TGV INOUI 5210`, `Aléop P30 857065`, `NOMAD K39 16552` |
| Change line, between consecutive legs | `Change at {prev.to}, {waitText(minutes)}`, where minutes = next.departure − prev.arrival → **`Change at Le Mans, 2h50`** (V1's real change is **170** minutes; rev 5.1 corrected a stale `17 min` example here that contradicted criterion 25 for the very same change) |
| `waitText` (rev 5, lead's decision) | **under 90 minutes** → `{n} min` (`17 min`, `89 min`); **90 minutes or more** → `formatDuration(n)` (`2h50`, `1h30`). A real Spot FR change is **2h50**, and `170 min` makes a long platform wait read as a small number. **No new formatter**: frontend confirmed `formatDuration(170)` already returns exactly `2h50`, so this is a threshold on the existing one |
| Alighting heading (rev 5, only when `alightingOptions.length > 1`) | `Where to get off:` |
| Alighting line, **not** `final` | `Off at {stationName} {formatClock(arrivalTime)} · {formatDuration(durationMinutes)} · {changesText(changes)} · {distanceKm} km to the spot` → `Off at Le Mans 10:30 · 1h42 · Direct · 7.2 km to the spot` |
| Alighting line, `final` | `Stay to {stationName} {formatClock(arrivalTime)} · {formatDuration(durationMinutes)} · {changesText(changes)} · {distanceKm} km to the spot` → `Stay to Arnage 13:25 · 4h37 · 1 change · 2 km to the spot` |
| Alighting note (once per journey, **only when `alightingOptions.length > 1`**) | `Getting off earlier can leave you farther from the spot. Onward travel from any of these stations is not included.` |
| Fare link | `Check fares on SNCF Connect`, `href = bookingUrl`, `target="_blank"`, `rel="noopener noreferrer"` |

Times come from `formatClock` on the ISO string, so they read Europe/Paris wall
clock in any browser time zone. No `€`, `EUR` or `0.0` appears in the block.
All copy must pass `src/copyStandards.test.ts`.

The `Manual check` badge reuses the existing primitive
(`<span className="badge badge--danger">`, `TripTotalCard.tsx` L97), which is
the red manual-check contract in `AGENTS.md`. No new hex.

### 8.4 Module and component

`src/services/railWaysIn.ts` exports:
- the 7.2 types
- `fetchRailWaysIn(slug: string, arrival?: { airport: string; time: string }): Promise<RailWaysInResponse>`
- `changesText(n: number): string`
- `legName(leg: RailLeg): string`
- `changeMinutes(prev: RailLeg, next: RailLeg): number`
- `waitText(minutes: number): string` — rev 5; `{n} min` under 90, `formatDuration(n)` at 90 or more (reuses `formatDuration`, no new formatter)
- `alightingLabel(option: RailAlightingOption): string` — rev 5; the 8.3 alighting line for one option, `Off at …` or `Stay to …` on `final`

`railTraceFeatures` is **not** in this slice (F0).

`src/components/RailWaysIn.tsx` is presentational, with props
`{ state: { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; data: RailWaysInResponse } }`.

## 9. How price is shown when no fare exists

- Provenance state: **Manual check** (POSITIONING.md). The price exists only on SNCF's site.
- Each journey carries the `Check fares on SNCF Connect` link. The block carries the `Manual check` badge and `SNCF gives no fares, so trains are not in any total.` once.
- `fare` is `null` on the wire. Navitia's `"0.0"` and any `fare.found=true` value are never surfaced — not into a field, not into a log line.
- Rail enters no total: not `auditedTotalCost`, not `cheapestEntryPrice`, not `TripTotalCard` (F2). TripTotalCard's `Getting from {airport} to the spot` exclusion already covers it.

## 10. Acceptance criteria

**43 criteria: 1–39, plus 43 and 44 (rev 3) and 45 and 46 (rev 5).** Rev 4 added
none, sharpening 7, 8, 17, 24 and 31 in place; **rev 5 adds 45 (backend
alighting) and 46 (frontend alighting)** and rewrites **11, 12, 23, 25 and 26**.
Criteria **7, 24 and 28** were re-checked against the capture and **did not
move** — their figures and strings were already right.
Numbers 40–42 are
withdrawn with D1 and parked in Appendix A for F0; the numbering is left as it
is so the F0 slice can lift them unchanged, which is why rev 3's two new
criteria start at 43 rather than filling the gap.

Vectors:
- **V1** and **V2**: 7.2.
- **Clock A** = `2026-09-15T10:00:00+02:00` → sample `date` `2026-10-03`.
- **Clock B** = `2026-09-19T10:00:00+02:00`, a Saturday; +14 days is also a Saturday → `2026-10-03`.
- **Spot FR** = `wake-paradise-spay-fr`: `FR`, 47.934 / 0.165, nearest airports without LYS. Its station is **Arnage**.
- **Spot FR-lower** = Spot FR in every field except `country`, which is stored as `fr`.
- **Spot FR-LYS**: a French spot whose nearest airports include LYS.
- **Spot ES**: a Spanish spot with coordinates.

### Backend: gating, params, sample date (T1)

1. An unknown slug returns 404 `SPOT_NOT_FOUND` (with or without arrival params) and makes 0 SNCF calls. The slug of a closed venue deleted from the catalogue is the same case and is asserted alongside it.
2. For Spot FR, each of these returns 400 `INVALID_ARRIVAL` with 0 calls:
   - `arrivalAirport=CDG` alone
   - `arrivalTime=2026-10-03T10:05:00` alone
   - `arrivalAirport=CDGX&arrivalTime=2026-10-03T10:05:00`
   - `arrivalAirport=CDG&arrivalTime=not-a-time`
3. Spot ES gives 200 with:
   - `status: "NOT_FRANCE"`
   - `date`, `dateBasis`, `departAfter`, `station`, `fetchedAt` all `null`; `chain: null`; `origins: []`
   - `priceState: "MANUAL_CHECK"`, `bookingUrl: "https://www.sncf-connect.com/"`
   - 0 calls

   With `country: null` the result is the same. With `arrivalAirport=CDG&arrivalTime=2026-10-03T10:05:00`, `chain` is echoed per 7.2 (`routed: true`, `bufferMinutes: 90`) and there are still 0 calls.
43. **(rev 3; numbered 43 because 40–42 are reserved for F0.)** Country is matched case-insensitively, by the shared normalisation in 7.7:
    - **Spot FR-lower** (`country: "fr"`) returns the **same body as Spot FR** — `status: "OK"`, `station.name: "Arnage"`, `origins[].code` `["CDG", "PARIS"]` — and **not** `NOT_FRANCE`. `"Fr"`, `"fR"` and `" fr "` behave identically.
    - `country: "FRA"`, `"F"`, `""` and `null` each give `NOT_FRANCE` with 0 SNCF calls.
    - The assertion is on the response, not on a helper, so it fails if the gate is ever re-tightened to an exact-case comparison.
4. A French spot with null latitude or longitude gives `NO_COORDINATES` and 0 calls.
5. With a blank `sncf.api.key`, Spot FR gives `NOT_CONFIGURED` and 0 calls.
6. Sample date: with no arrival params, under Clock A and Clock B, the response has `date: "2026-10-03"`, `dateBasis: "SAMPLE"`, `departAfter: "08:00"` and `chain: null`. Every journeys request carries `datetime=20261003T080000` and `datetime_represents=departure`.

### Backend: station (T1)

7. The station request is **exactly 1 call** and carries `coords/0.165;47.934`, `distance=30000`, `type[]=stop_area`, `count=100` and `depth=2` (7.5). Against a fixture holding all three kinds of stop_area:
   - a coach-only stop_area nearer than any rail-served one is **not** chosen
   - **Arnage** (rail-served, 1.95 km) is chosen over **Le Mans** (rail-served, 7.15 km) — nearest rail-served wins even though Le Mans is the mainline station (13.5, F6)
   - `station.id` is `stop_area:SNCF:87396549` and `station.name` is `Arnage`
   - `station.distanceKm` is **exactly `2.0`**, and the test **computes** the haversine from the spot to the fixture's stop_area coordinates rather than copying it. With R0's captured coordinates (47.928541, 0.189882) that haversine is **1.9506 km**, which rounds to `2.0` at 1 decimal (P1, closed in rev 5). A test that yields `1.8` is reading rev 4's withdrawn coordinates
   - the rail/coach split is decided from each stop_area's own `physical_modes[]` in that single response, and **no request carries `filter=physical_mode.id`** (7.5)
8. A station answer with no rail-served stop_area gives `NO_STATION_NEARBY`, `station: null`, `origins: []` and 0 journeys calls.
   - **`fetchedAt` is NOT null here** (rev 4, pinned deliberately). SNCF answered — it answered "nothing rail-served nearby" — so that answer fed the response, and `fetchedAt` equals **the station call's instant**. Asserting `null` by analogy with criterion 3 looks right and is wrong: criterion 3's statuses are the ones where **no** SNCF call was made at all (7.8).
   - A second identical request makes **0** SNCF calls and returns the **same** `fetchedAt`, which is also what proves the 7-day no-station cache entry (7.8) is written and read.

### Backend: origins, chaining, journeys (T1)

9. Sample origins:
   - Spot FR: `origins[].code` = `["CDG", "PARIS"]`. Spot FR-LYS: `["CDG", "LYS", "PARIS"]`.
   - The CDG request uses `from=stop_area:SNCF:87271494`, the LYS request `from=stop_area:SNCF:87762906`, and the PARIS request `from=admin:fr:75056`.
   - `label`, `stationName` and `note` equal 7.3.
   - When `station.id` equals CDG's `stopAreaId`, CDG is absent and PARIS is present.
10. Chaining, Clock A, Spot FR. **Buffers are rev 2's** (CDG 90, LYS 75, BVA 180, ORY 150), rounded up to the next quarter hour. backend, frontend and sdet each derived this table independently and agreed:

    | arrivalAirport | arrivalTime | `origins[].code` | `chain.routed` / `bufferMinutes` | `dateBasis` | `date` | `departAfter` | journeys `datetime` |
    |---|---|---|---|---|---|---|---|
    | `CDG` | `2026-10-03T10:05:00` | `["CDG"]` | true / 90 | `AFTER_FLIGHT` | `2026-10-03` | `11:45` | `20261003T114500` |
    | `cdg` | `2026-10-03T10:15:00+02:00` | `["CDG"]` | true / 90 | `AFTER_FLIGHT` | `2026-10-03` | `11:45` | `20261003T114500` |
    | `LYS` | `2026-10-03T23:20:00` | `["LYS"]` (LYS not near Spot FR) | true / 75 | `AFTER_FLIGHT` | `2026-10-04` | `00:45` | `20261004T004500` |
    | `BVA` | `2026-10-03T09:40:00` | `["PARIS"]` | true / 180 | `AFTER_FLIGHT` | `2026-10-03` | `12:45` | `20261003T124500` |
    | `ORY` | `2026-10-03T09:40:00` | `["PARIS"]` | true / 150 | `AFTER_FLIGHT` | `2026-10-03` | `12:15` | `20261003T121500` |
    | `NTE` | `2026-10-03T09:40:00` | `["CDG", "PARIS"]` | false / null | `SAMPLE` | `2026-10-03` | `08:00` | `20261003T080000` |

    Rows 1 and 2 are the rounding pair: 10:05 + 90 = 11:35 rounds **up** to 11:45, and 10:15 + 90 = 11:45 is already on a quarter hour and stays. Both land on 11:45, which is what lets criterion 17 share a cache row. The LYS row is the roll-over-midnight case.

    `chain.airport` is upper-cased, and `chain.arrivalTime` carries `+02:00`. Chained requests make at most 2 SNCF calls.
11. Journey mapping, from the captured CDG→Arnage fixture (V1's journey), **all values verbatim from the body**:
    - `20261003T084800` → `20261003T132500`, `duration: 16620`, `nb_transfers: 1` maps to `departure: "2026-10-03T08:48:00+02:00"`, `arrival: "2026-10-03T13:25:00+02:00"`, `durationMinutes: 277`, `changes: 1`.
    - Leg 1 has `mode: "TGV INOUI"`, `line: null` (its `code` is `""`) and `trainNumber: "5210"` (headsign `5210`); **leg 2 has `mode: "Aléop"`, `line: "P30"`, `trainNumber: "857065"`, `from: "Le Mans"`, `to: "Arnage"`.** There is **no `TER`** anywhere in the mapped response — the assertion fails if `TER` appears.
    - **Station names carry no commune suffix** (7.4): leg 1's `from` is `"Aéroport Charles de Gaulle 2 TGV"` and its `to` is `"Le Mans"`, **not** `"Aéroport Charles de Gaulle 2 TGV (Tremblay-en-France)"` or `"Le Mans (Le Mans)"`, which are what the section place names hold. No serialized field matches `/\(.*\)$/`.
    - **`display_informations.physical_mode` is never read** (7.5): both legs carry `"Train grande vitesse"`, including the 5-minute Aléop hop, and nothing in the response or in any filter, sort or label depends on it. Changing that field in the fixture changes no output.
    - A section with `code: ""` gives `line: null`. Headsign `EPAF` gives `trainNumber: null`.
    - Transfer, waiting, crow_fly and street_network sections produce no leg — V1's journey has two legs, and comes from a fixture that also contains a transfer section.
    - A January date gives `+01:00`.
    - A fixture section carrying `geojson` produces **no** `geometry` field anywhere in the serialized response (D1 is F0).
12. Journey filtering, against the **real captured fixture's 5 journeys** (three departing 2026-10-03 at 08:48, 09:43 and 12:16; two departing 2026-10-04 at 08:48 and 12:16):
    - With `departAfter: "08:00"`, the kept journeys are exactly the **three same-day ones, in departure order**. The two 2026-10-04 journeys are eligible under 7.4's "on `date` or the day after" but fall outside the first 3 by departure, so they are dropped by the cap, not by the date rule.
    - A synthetic journey departing 07:30 is dropped as before `departAfter`, and a duplicated (departure, arrival) pair collapses to one.
    - In chained mode with `departAfter: "11:45"`, a journey departing 11:30 is dropped and one departing exactly 11:45 is kept.
    - Every journeys request carries `direct_path=none`, `max_nb_transfers=3` and **`depth=2`** (7.4) — without the last, `stop_date_times` is absent and criterion 45 cannot pass.
45. **(rev 5.)** `alightingOptions` on the wire (7.2, 7.4), from the captured CDG→Arnage body, with **0 extra SNCF calls** — the call count for the request is unchanged from criterion 20:
    - Journey 1 has **two** options, **ordered by arrival time** (7.4): `Le Mans` (`stop_area:SNCF:87396002`, `final: false`, `arrivalTime` = leg 1's arrival) then `Arnage` (`stop_area:SNCF:87396549`, `final: true`, `arrivalTime` = the journey's arrival).
    - Each `distanceKm` is **computed** by the test, not copied: Arnage is `2.0` (1.9506 km from 47.928541 / 0.189882) and Le Mans is `7.2` (7.1531 km from 47.995615 / 0.192614). The nearer option is **not** first — ordering is by arrival time, never by distance, so the farther, earlier Le Mans leads.
    - Each option carries its **own** `durationMinutes` and `changes`: Le Mans `102` / `0`, Arnage `277` / `1`, while the **journey's** `durationMinutes` stays `277` and `changes` stays `1` (7.2).
    - **Mid-leg stops are candidates too** (7.4): journey 1's leg 1 calls at Marne-la-Vallée - Chessy and Massy TGV via `stop_date_times`, and both are excluded **only** by the 30 km rule, not by being mid-leg. A fixture that moves one of them inside 30 km makes it an option, placed by its arrival time.
    - `stationName` values carry **no commune suffix** — `Le Mans`, not `Le Mans (Le Mans)`.
    - `final` is true **exactly once** per journey, on the last entry, and that entry's `stationId` equals `station.id`. The top-level `station` is still `Arnage` regardless (7.4).
    - `alightingOptions` is never empty: a direct journey with one leg has exactly one option, `final: true`.
    - **Journey 2** (`09:43 → 13:50`, via Tours) ends with **exactly 1** option, `Arnage` — and the two filters must be asserted separately, because they do different work here. **Dominance thins it by nothing**: the five stops within 30 km form a genuine Pareto chain, each later one strictly nearer. **Materiality then drops four of the five**, because the whole spread is 27 minutes and `ALIGHTING_MIN_SAVING_MINUTES` is 30. The intermediate five, in arrival order: `Aubigné-Racan` 28.5 km / 13:23, `Mayet` 20.8 km / 13:31, `Écommoy` 14.4 km / 13:37, `Laigné - Saint-Gervais` 7.7 km / 13:44, `Arnage` 2.0 km / 13:50. `Le Mans` is **absent**, because this journey never calls there. Aubigné-Racan arrives **27 minutes before** Arnage and leaves the rider **26.5 km farther out** — 27 < 30, so it is **not** a trade worth showing, and the rider sees one clean answer instead of five near-identical rows. With `ALIGHTING_MIN_SAVING_MINUTES` lowered to **20** in the test, journey 2 goes from **1 option to 2**: **only `Aubigné-Racan` returns** (27 minutes saved against the Arnage anchor), while **`Mayet` misses by a single minute** (19 < 20) and Laigné (6) and Écommoy (13) stay out. Only the config value differs between the two runs, which is what proves the threshold is read from `sncf.alighting-min-saving-minutes` rather than hard-coded. **Do not add a second station to this vector**: rev 5.1 corrected a hand-written "Aubigné-Racan and Mayet" here, which was false — the savings against the anchor are 6 / 13 / 19 / 27 and must be **derived** from 7.4, never listed from memory.
    - **Journey 3** (`12:16 → 16:29`) has **6 qualifying visits at 4 distinct stations** and yields exactly **2** options after dominance (7.4): `Le Mans` (13:59, 7.2 km) and `Arnage` (16:29, 2.0 km). Dropped, each for a named reason: `Le Mans`'s own second call at **14:39**; `Écommoy` at **14:59** and again at **16:17** (both 14.4 km, later than Le Mans **and** farther); `Laigné - Saint-Gervais` (16:23, 7.7 km — later and farther). The doubled-back second Écommoy needs no special-casing.
    - **V1's own journey exercises dominance**: journey 1 calls at `Le Mans` at 10:30 and again at **13:20** (the Aléop leg boarding). The 13:20 visit is dominated by the 10:30 one, so V1 has exactly 2 options and `Le Mans` appears once.
    - Every emitted `stationId` comes from a **nested `stop_area`** object in the body — 45 of 45 in the fixture, none derived (7.4).
    - Neither filter ever drops the `final` option, and `alightingOptions` is never empty. Journey 1's Le Mans survives materiality by **175 minutes** and journey 3's by **150**.
    - Options beyond 30 km never appear: journey 2's Tours and Saint-Pierre-des-Corps stops are absent.
    - A leg whose arrival station is **beyond 30 km** of the spot contributes no option, and a leg arrival station with no usable coordinates in the body contributes no option (the destination is exempt, 7.4).
    - Two legs arriving at the same station id collapse to one option carrying the **earliest** arrival.
    - The destination station chosen by 7.5 is **unchanged** by any of this: `station.name` is still `Arnage` even though Le Mans is an option.
13. No price leaks:
    - A fixture with `fare: {found: false, total: {value: "0.0"}}` gives `fare: null` on every journey.
    - A fixture with `fare: {found: true, total: {value: "45.0"}}` also gives `fare: null` and `priceState: "MANUAL_CHECK"`.
    - Neither serialized body contains `"0.0"` or `45.0`.

### Backend: errors and precedence (T1)

14. The journeys step maps each of these to the per-origin `status` in 7.6, with HTTP 200 from our endpoint and no exception reaching the controller:
    - `no_solution` on HTTP 404 and on HTTP 200
    - `date_out_of_bounds`
    - `unknown_object`
    - HTTP 401, 403, 500, 503 and 429
    - a read timeout
    - an `<html>` body
15. The station step maps HTTP 500, timeout, 401 and an unparseable body to top-level `PROVIDER_UNAVAILABLE`, and HTTP 429 to `QUOTA_EXHAUSTED`. Each gives `station: null`, `origins: []` and 0 journeys calls.
16. Precedence (7.7), sample mode, with CDG and PARIS origins:

    | CDG | PARIS | top-level `status` |
    |---|---|---|
    | `OK` | `PROVIDER_UNAVAILABLE` | `OK` |
    | `NO_JOURNEY` | `PROVIDER_UNAVAILABLE` | `PROVIDER_UNAVAILABLE` |
    | `NO_JOURNEY` | `QUOTA_EXHAUSTED` | `QUOTA_EXHAUSTED` |
    | `NO_JOURNEY` | `TIMETABLE_NOT_PUBLISHED` | `TIMETABLE_NOT_PUBLISHED` |
    | `NO_JOURNEY` | `NO_JOURNEY` | `NO_JOURNEY` |

    Each origin keeps its own `status`, and non-OK origins have `journeys: []`.

### Backend: cache, quota, key, docs (T1)

17. Caching, and `fetchedAt` (7.8):
    - Two identical sample requests for Spot FR under one clock make 3 SNCF calls on the first and **0** on the second, with equal bodies and the **same** `fetchedAt` — the instant stored inside the cached value, not the read time. Advancing the clock between the two requests does not change `fetchedAt`.
    - **Mixed freshness:** with a station entry cached at `T0` and journeys fetched fresh at `T0 + 3 days`, the response's `fetchedAt` is `T0` — the earliest instant among the entries used.
    - An origin that failed (`PROVIDER_UNAVAILABLE`) contributes no instant: with CDG `OK` at `T1` and PARIS failing, `fetchedAt` is the earlier of the station instant and `T1`.
    - Chained `CDG 10:05` then `CDG 10:10` (both round to `departAfter 11:45`) make 0 calls on the second.
    - **(rev 4, restated as a captor assertion.)** An `ArgumentCaptor` on `PersistentCacheService.put(key, category, provider, value, ttl)` shows, for each of the three payload types, that the captured `value` is **that payload's own wrapper class** (7.8 — station, no-station and journeys each have their own; there is no single generic wrapper) and that the instant it carries is **the originating call's instant**, not the write time. The captured `ttl`s are `Duration.ofDays(30)` for a found station, `Duration.ofDays(7)` for `NO_STATION_NEARBY`, and `Duration.ofHours(24)` for an `OK` or `NO_JOURNEY` origin.
18. Failures aren't cached. After a request where PARIS is `PROVIDER_UNAVAILABLE` (then again for `QUOTA_EXHAUSTED`, then for `TIMETABLE_NOT_PUBLISHED`), the next identical request calls SNCF for PARIS and not for CDG.
19. Daily cap, made deterministic by the origin-order rule in 7.8:
    - With `sncf.daily-call-cap=2` and an empty cache, Spot FR (sample) makes exactly 2 calls. CDG is `OK`, PARIS is `QUOTA_EXHAUSTED`, top-level `OK` — and that holds whether or not origins are fetched in parallel.
    - A second, uncached spot the same day makes 0 calls and gets `QUOTA_EXHAUSTED`.
    - A cached answer is still served while capped.
    - After the clock passes 00:00 Europe/Paris, calls are allowed again.
    - After an HTTP 429 on any call, there are no SNCF calls until that reset.
20. An uncached sample request for Spot FR-LYS makes at most 4 SNCF calls (1 station + 3 journeys, no retries, 7.6). Creating the service and starting the Spring context make 0 calls, and no new class has a `@Scheduled` method.
21. Key handling:
    - With the key `sncf-test-key-must-not-leak`, every request carries `Authorization: Basic base64("sncf-test-key-must-not-leak:")` and no key in the URL.
    - In the 401, 500, timeout and unparseable-body cases, the string is absent from the response body, every captured log event at every level, and every exception message.
    - `application.yml` contains `sncf.api.key: ${SNCF_API_KEY:}` and no literal key.
22. `docs/openapi.yaml`, `docs/openapi-lite.yaml` and the Postman collection each document `GET /api/spots/{slug}/rail` with both query params, the 400, the 7.2 fields and all nine `RailStatus` values. None documents a `geometry` field. Verified by file assertion (7.10).

### Frontend: service and component (T2)

23. Helpers:
    - `changesText(0) === 'Direct'`, `changesText(1) === '1 change'`, `changesText(2) === '2 changes'`.
    - `legName` gives `TGV INOUI 5210` for V1's leg 1 (empty `code` → no line segment) and **`Aléop P30 857065`** for leg 2 (mode + line + trainNumber). frontend confirmed the existing implementation already produces these; only the `'TER'` example was wrong.
    - `changeMinutes` gives **`170`** for V1's single change (Le Mans 10:30 → 13:20).
    - `waitText(17) === '17 min'`, `waitText(89) === '89 min'`, `waitText(90) === '1h30'`, `waitText(170) === '2h50'`. The 90-minute boundary is inclusive, and `formatDuration` is reused unchanged — frontend confirmed `formatDuration(170)` already returns exactly `2h50`.
    - `alightingLabel` gives `Off at Le Mans 10:30 · 1h42 · Direct · 7.2 km to the spot` for V1's first option and `Stay to Arnage 13:25 · 4h37 · 1 change · 2 km to the spot` for its `final` one.
24. V1 (`loaded`): the region `By train` contains, in this order:
    - `Sample date Sat 3 Oct, departures from 08:00. Not your travel date.`
    - a station line starting `To Arnage, 2 km from the spot in a straight line.` — **confirmed by P1's capture** (1.9506 km → `2.0`, rendered without the trailing `.0` per 8.3 rule 4)
    - the `Manual check` badge with `SNCF gives no fares, so trains are not in any total.`
    - `From Paris Charles de Gaulle (CDG)` with `Station inside Terminal 2.`
    - `From Paris` with `No train from here on this date.`
    - `Train times from SNCF.`
25. V1's journey renders, all visible without any interaction, in this order:
    - Summary, naming the end station so it can't be mistaken for the Le Mans option: `08:48 → Arnage 13:25 · 4h37 · 1 change`
    - `TGV INOUI 5210 · Aéroport Charles de Gaulle 2 TGV 08:48 → Le Mans 10:30`
    - `Change at Le Mans, 2h50` — **not** `Change at Le Mans, 170 min` (8.3 `waitText`)
    - `Aléop P30 857065 · Le Mans 13:20 → Arnage 13:25`
    - then the alighting block from criterion 46
    - The region's text contains **no** `TER`, no `170 min`, no `08:49`, and nothing matching `/\((Le Mans|Tremblay-en-France)\)/` — the commune suffix never reaches the rider (7.4).
    - The same strings render with `TZ=America/New_York`.
46. **(rev 5.)** Both alighting options render, so the rider can judge the trade (8.3). For V1's journey:
    - the region contains `Where to get off:`, then `Off at Le Mans 10:30 · 1h42 · Direct · 7.2 km to the spot`, then `Stay to Arnage 13:25 · 4h37 · 1 change · 2 km to the spot`, **in that order** — the earlier, farther station first.
    - each option's own duration and change count are **read from the wire**, not derived: the test asserts the rendered `1h42` / `Direct` against `alightingOptions[0].durationMinutes` / `.changes`, and mutating those fields in the fixture changes the rendering.
    - the alighting note, **quoted verbatim from 8.3** rather than restated here, appears **once for that journey**. As of rev 5.1 that string is `Getting off earlier can leave you farther from the spot. Onward travel from any of these stations is not included.` — if this line and 8.3 ever disagree, **8.3 wins and this one is the bug**.
    - every option's line is visible with no interaction: no toggle, no accordion, no "show more". (Both of them, for this journey — but the assertion is written over `alightingOptions`, not over a hard-coded two.)
    - **The note is conditional on there being a choice.** A journey with **one** option — journey 2 under the rev 5 filters — renders **no** `Where to get off:` heading and **no** note, just its single line: with nothing to get off earlier *for*, the sentence is noise. Asserted **both ways**, present on the two-option journey and absent on the one-option journey, so the condition cannot be dropped silently.
    - **No rendered string assumes a particular number of options**: the region's text contains no `either station` and no `neither leg`. `alightingOptions` has no cap and its filters are per-journey (criterion 45), so copy that only reads correctly at exactly two options is a defect.
    - `2 km` renders without a trailing `.0`, and `7.2 km` keeps its decimal (8.3 rule 4).
    - the same strings render under `TZ=America/New_York`.
26. Each journey has exactly one link named `Check fares on SNCF Connect`, with `href="https://www.sncf-connect.com/"`, `target="_blank"` and `rel="noopener noreferrer"`. **V1 has 1 such link**, because V1 now holds the one captured journey (7.2).
27. Nothing forbidden reaches the block. The text of the `By train` region, for V1, V2 and every status in 8.3:
    - matches neither `/€|EUR/` nor `/\b0\.0\b/`
    - contains no rendering of `fetchedAt` — for V1 (`2026-09-15T09:12:00Z`) the region text contains neither `09:12` nor `15 Sep`, and no "updated" or "checked" wording. This pins 8.3's decision not to show it (F13).
28. Status copy:
    - `NO_JOURNEY` (station `Arnage`, date `2026-10-03`) shows `SNCF found no train to Arnage on Sat 3 Oct.`, with no `Manual check` badge and no fare link.
    - `TIMETABLE_NOT_PUBLISHED` shows `SNCF has not published train times for Sat 3 Oct yet.`
    - `NO_STATION_NEARBY` shows `No train station within 30 km of this spot.`, with no station line.
    - `PROVIDER_UNAVAILABLE` and `{kind: 'error'}` show `Train times are unavailable right now. Try again later.`
    - `QUOTA_EXHAUSTED` shows `Train times are paused for today. Try again tomorrow.`
    - `loading` shows `Looking up train times…` (single U+2026).
29. For `NOT_FRANCE`, `NO_COORDINATES` and `NOT_CONFIGURED`, `queryByRole('region', { name: 'By train' })` is null.
30. In an `OK` response, an origin with `TIMETABLE_NOT_PUBLISHED` shows `Times for this date are not published yet.`, and one with `PROVIDER_UNAVAILABLE` or `QUOTA_EXHAUSTED` shows `Could not load trains from here right now.`
31. Chained copy, with the rev 2 buffers, the buffer visible in every line, and the date time-zone stable:
    - V2 shows `After your flight lands at CDG at 09:35 on Sat 3 Oct: trains from 11:15, allowing 1h30 to reach Aéroport CDG 2 TGV.` and no `Sample date` line.
    - A BVA chain (PARIS origin, `arrivalTime 2026-10-03T09:40:00+02:00`, buffer 180, `departAfter 12:45`) shows `After your flight lands at BVA at 09:40 on Sat 3 Oct: trains from 12:45, allowing 3h to reach a Paris station.`
    - A `routed: false` chain for `NTE` shows `Your flight lands at NTE. We don't have train times from there yet, so these are for a sample date.` followed by the sample date line.
    - **One discriminating vector per zone** (rev 4). A vector only proves the slice in 8.3 rule 1 if the buggy `Date.parse` rendering and the correct one **differ in that zone**; rev 3 used the same after-midnight vector for both zones, and it cannot fail in Tokyo.
      - **Under `TZ=America/New_York`**: a late-landing chain (`arrivalTime 2026-10-04T00:30:00+02:00`, CDG, buffer 90, `date 2026-10-04`, `departAfter 02:00`) reads `on Sun 4 Oct`. Sliced it is Sun 4 Oct; parsed it falls back to Sat 3 Oct in New York, so this vector discriminates there. It is **dead in Tokyo**, which reads Sun 4 Oct either way.
      - **Under `TZ=Asia/Tokyo`**: the mirror case, an **evening** Paris landing (`arrivalTime 2026-10-03T23:20:00+02:00`, the LYS time from criterion 10, buffer 75, `date 2026-10-04`, `departAfter 00:45`) reads `on Sat 3 Oct` — the landing date, per 8.3. Sliced it is Sat 3 Oct; parsed it rolls forward to Sun 4 Oct in Tokyo, so this vector discriminates there. It is **dead in New York**, which reads Sat 3 Oct either way.
      - V2's `09:35` line **discriminates in neither** zone; it is asserted unchanged in both as a regression guard, not as proof of the slice.

### Spot page wiring (T3, Cypress with mocks)

32. Sample request gating:
    - For a mocked French spot with coordinates, exactly one `/api/spots/{slug}/rail` request **without** query params is sent once the spot resolves, and none more after visiting Hotels, Restaurants and Flights and returning to Getting there with no pick. (The request follows `/api/destinations/spots`, so the assertion waits for the spot to render, not for first paint.)
    - For a mocked Spanish spot, 0 `/rail` requests are sent and there's no `By train` region.
44. **(rev 3.)** The page's country gate is case-insensitive (8.1):
    - For a mocked French spot whose `/api/destinations/spots` row carries `country: "fr"`, exactly one sample `/rail` request is sent and the `By train` region renders — the same assertions as 32's first bullet, on the lowercase spot.
    - For a mocked spot with `country: "es"`, 0 `/rail` requests are sent and there is no `By train` region, so the gate is not simply "always send".
33. Chaining (French spot; `/api/flights` mock whose fare row has `destination: "BVA"`, `arrivalDate: "2026-10-03T09:40:00"`):
    1. On the Flights tab, press `Add to trip cost`. No `/rail` request is sent by that press (combined-trip-total criterion 30 holds).
    2. Switch to Getting there. Exactly one `/rail?arrivalAirport=BVA&arrivalTime=2026-10-03T09%3A40%3A00` request is sent, and the block shows the BVA chained date line from 31 — `trains from 12:45, allowing 3h`.
    3. Switch to Hotels and back. No new `/rail` request.
    4. Press `Remove flight from trip cost` on the card. No `/rail` request is sent, and the block shows the sample date line again.
    5. With a fare row that has no `arrivalDate`, picking it and switching to Getting there sends no chained request.
34. Loading and error:
    - With the chained `/rail` mock delayed 2 s, `Looking up train times…` shows and is then replaced by the chained content.
    - With the sample `/rail` mock as a network error, `Train times are unavailable right now. Try again later.` renders, and the rest of Getting there still renders.
35. Existing behaviour is unchanged:
    - A spot with a curated `TRAIN` way still renders its hub, hint and `curated, no live price`.
    - The OSM `nearest station — …` row still renders for a spot with no curated ways.
    - The `By train` region has no `Add to trip cost` button, and no `Show on map` button (F0).
    - `cypress/e2e/spot-trip-total.cy.ts` passes unmodified.
    - slumber `SpotAccessPricingServiceTest` passes unmodified, including `leavesFerryAndTrainWaysUnpriced`, and `/api/destinations/access` still returns `fare: null` for TRAIN ways and leaves them out of `cheapestEntryPrice`.
36. At 400×800 and 1280×800 with V1, `document.documentElement.scrollWidth ≤` the viewport width, and every journey's summary, leg lines and fare link are visible when scrolled into view.

### Gates (V1)

37. webagency: `npm run lint`, `npm run typecheck`, `npm test` (including `src/copyStandards.test.ts`) and `npm run build` pass.
38. slumber: `./mvnw test` passes on the build branch, with the uncommitted `IslandHopService` changes untouched.
39. No file in either repo's diff contains the SNCF key value. Checked by `backend` against the local config without printing it; sdet checks that the fixtures carry no `Authorization` header.

## 11. Task split

The contract is sections 7 and 8. **All three reviewers confirmed rev 3, so the
contract is frozen and the lead can create these build tasks now** (rev 4's
corrections A–H change no wire field in 7.2). D1 is settled, so **BE4 and FE4
are dropped**. Rev 4 adds one task, **P1**, and narrows **R0**.

| ID | Task | Owner | Depends on | Criteria |
|---|---|---|---|---|
| R0 | **Closed as a question; fixture capture only — with EXACTLY ONE new SNCF call** (rev 4). The one-call station filter is **measured and settled** (`depth=2&count=100`, 7.5), LYS `stop_area:SNCF:87762906` is confirmed, and Arnage-vs-Le-Mans is measured; **none of that is re-verified**. But rev 3 demanded a CDG→**Arnage** body that was never fetched — the earlier probe was CDG→**Le Mans** — so the lead approves **one journeys call, at build time, to capture CDG→Arnage**, and no others. Then: **own and save all captured fixtures** under `src/test/resources/sncf/` (this is where fixtures are described; BE1 no longer lists them), **sanitized** — no key, no `Authorization` header, per criterion 39. The captured body replaces V1's illustrative TER legs **and** feeds P1. | backend | — | 7, 9, 11 |
| ~~P1~~ | **CLOSED in rev 5 — no longer a build task.** R0's capture supplied Arnage's real coordinates **(47.928541, 0.189882)**, haversine **1.9506 km → 2.0**. Rev 4 had the coordinates wrong, not the distance: V1's `distanceKm`, criterion 7's figure and criterion 24's "2 km" were already right and were kept. V1's station block and the FE fixture now carry the captured pair. **Nothing is pending on this; A1 is no longer gated by it.** | done | — | 7, 24 |
| BE5 | **Alighting options** (rev 5, 7.2 / 7.4): derive `RailJourney.alightingOptions[]` from the journey already fetched — every stop in `stop_date_times` within 30 km, each with its own `arrivalTime`, `distanceKm`, `durationMinutes` and `changes`, then **dominance**, then **materiality** (`ALIGHTING_MIN_SAVING_MINUTES`, 7.8), ordered by arrival, `final` on the destination. Names from the embedded stop_point/stop_area. **No new SNCF call and no new endpoint.** Reuses the same haversine as 7.5. | backend | BE2 | 45, 12 |
| FE4 | **Render both alighting options** (8.3): the alighting list inside each journey, the "farther but earlier" trade legible, and `waitText` for long changes. | frontend | FE2 | 46, 23, 25 |
| BE1 | `SncfClient`:<br>• config (7.8) and basic auth<br>• per-call `newBuilder()` timeouts (3 s / 8 s) over the shared OkHttp bean<br>• error classification (7.6), no retries<br>• daily cap with an injected `Clock`, consumed in origin order | backend | review closed — **not** R0: BE1's error and edge bodies are synthetic, so it neither waits for R0's capture nor owns fixtures (R0 does) | 14, 15, 19, 21 |
| BE2 | `RailWaysInService`:<br>• gating and params, with the shared country normalisation (7.7)<br>• sample and chained dates, with the rev 2 buffers in `rail-gateways.json`<br>• station: nearest rail-served, halts included, one call<br>• origins in fixed order<br>• mapping and filtering, ignoring `geojson`<br>• cache, with the fetch instant stored **inside** the cached value and `fetchedAt` derived as the earliest used (7.8)<br>• precedence | backend | BE1 | 1–13, 16–18, 20, 43 |
| BE3 | `GET /api/spots/{slug}/rail` in `SpotController` (+ 400); OpenAPI, lite and Postman — the first `/api/spots/**` path in any of them | backend | BE2 | 1, 2, 22 |
| FE1 | `src/services/railWaysIn.ts`: types, `fetchRailWaysIn`, `changesText`, `legName`, `changeMinutes` | frontend | review closed | 23 |
| FE2 | `src/components/RailWaysIn.tsx` + CSS on existing `--color-*` / `--truth-*` tokens, all 8.3 states, badge primitive reused | frontend | FE1 | 24–31, 36 |
| FE3 | Wire into `src/SpotDetailPage.tsx` (8.1, 8.2): sample and chained fetches, the case-insensitive country gate (`spot.country?.trim().toUpperCase() === 'FR'`), held responses, picked-flight state. Don't edit the curated ways rows, `AccessFare`, the OSM station row, `TripTotalCard`, `DetailMap` or the pick handlers' no-request behaviour. | frontend | FE2 | 32–36, 44 |
| T1 | slumber JUnit: `SncfClientTest`, `RailWaysInServiceTest` (OkHttp interceptor fixtures like `XoteloRateServiceTest`, quota like `AviationStackIngestionServiceTest`, a **new** injected `Clock`, a **new** captured log appender), plus a controller test for 1–2 | sdet | contract; R0 fixtures | 1–22, 43 |
| T2 | `src/services/railWaysIn.test.ts`, `src/components/RailWaysIn.test.tsx` | sdet | contract | 23–31 |
| T3 | `cypress/e2e/spot-rail-ways-in.cy.ts` on the catch-all intercept. Mocks: `/api/destinations/spots*` (FR, **lowercase `fr`** and ES), `/api/spots/{slug}`, `/arrival`, `/api/flights` (BVA row with and without `arrivalDate`), `/api/trips/hacker-routes`, the hotels endpoints, and `/rail` sample, chained, delayed and error. | sdet | contract; green after FE3 | 32–36, 44 |
| V1 | Run T1–T3 and the gates against the real work; report per criterion | sdet | all build and test tasks | 1–39, 43–46 |
| FE-V | **Real-browser verification of the rail block at 1280 px and 400 px against a LIVE endpoint** — not the mocked Cypress run, and not jsdom. Criterion 36 covers layout under mocks; this is the human look at real data: the alighting lines, the 2h50 change, and no horizontal scroll at either width. **Deliberately deferred, not skipped.** | frontend | BE3 (needs the live endpoint), FE3 | 36, 46, 25 |
| A1 | Acceptance per criterion, citing file or test | pm | V1 **and FE-V** | all |

Frontend and backend build in parallel against 7.2. T3 mocks `/rail`, so it
doesn't wait for backend.

**Fixture ownership, so two people never edit the same file** (rev 4, sdet's ask):

| Artefact | Owner | Rule |
|---|---|---|
| `src/test/resources/sncf/**` (slumber) | **backend** (R0) | **Sanitized captured provider bodies only** — real SNCF responses with no key and no `Authorization` header (criterion 39). sdet reads these; sdet does not add to them. |
| Every `*Test.java` (slumber) | **sdet** | T1 owns the test classes outright. backend doesn't add assertions to them. |
| Synthetic bodies for error and edge shapes (401, 500, `<html>`, `no_solution`, `date_out_of_bounds`, empty pages, malformed sections) | **sdet** | Stay **inline in the test class as Java text blocks**, never as files under `src/test/resources/sncf/`. They are invented, so keeping them out of the captured-fixture directory keeps "captured" meaning captured. |
| FE fixtures (`src/**` in webagency) | **frontend** for component fixtures, **sdet** for test-only fixtures | Both now carry R0's captured values (P1 closed in rev 5); regenerate them together if the fixture is ever recaptured. |

**Where the slumber files actually live during the build.** The paths above are
**relative** and correct. backend and sdet are both working in a **git worktree
of the same repo** at `/Users/vaimar/src/apps/slumber-sncf-rail`, on branch
`feat/sncf-rail-ways-in`, because slumber's main checkout holds another session's
uncommitted `IslandHopService` changes that must not be disturbed (criterion 38).
T1 reads the fixture from that worktree. On merge the files sit exactly where
this table says.

**Sizing raised by sdet, accepted:** slumber had no injected `java.time.Clock`
(criteria 6 and 19 need one) — **backend has since added a `Clock` bean
(`Clock.systemDefaultZone()`) to `AppConfig`; it is additive, and BE2 uses it for
the sample-date rule**. There's no log-appender
helper in the test tree (criterion 21 adds one), and no `/api/spots/**` path is
documented in the OpenAPI files or Postman today (criterion 22 makes `/rail`
the first).

## 12. Assumptions stated in the product

These are not measured, and the UI says so where they touch the rider:

- The connection buffers (**CDG 90, LYS 75, ORY 150, BVA 180 min**, rev 2, set by the user) are stated in the chained date line, as a duration the rider can judge.
- **The station may be a halt, not the mainline station.** The block names the station and its straight-line distance, so the rider sees they're arriving at Arnage, 2 km out, rather than Le Mans, 7 km out. What the block does *not* say is that a mainline alternative exists — that's F6.
- Station-to-spot is a straight line, and the UI says it's not included.
- The chained flight's `arrivalDate` is the time Ryanair's feed lists for that row. The Ryanair feed is one fare per day, so the picked row may not be the only flight that day. The chained line says "your flight" because the rider picked that row.

## 13. Decisions and what's left

### Answered by the user (relayed by the lead, 2026-09-16)

1. **Connection buffers: CDG 90, LYS 75, ORY 150, BVA 180 minutes** — rev 1's numbers plus 30, for passport queues and bags. Quarter-hour rounding kept; the buffer stays visible in the UI copy. Applied in 4, 7.2, 7.3, 8.3, 10 and 12.
2. **D1, route trace: first follow-up, not this slice.** Recorded as **F0** (5). Criteria 40–42 withdrawn to Appendix A; `geometry` out of 7.2; `railTraceFeatures` out of 8.4; BE4 and FE4 dropped; 7.9 relabelled as F0's spec. **Re-swept in rev 3** — the only geometry left in the spec is follow-up text and the negative assertions in criteria 11 and 22.
3. **SNCF API terms: fine for the private beta.** The **lead** adds the SNCF API to `docs/LAUNCH-CHECKLIST.md` item 9 (data-source terms) before any public stage. A lead task, not a build task, and not one of the criteria.
4. **Sample origins accepted as written:** CDG and Paris always, LYS when it's one of the spot's 3 nearest airports; first Saturday at least 14 days out, from 08:00, labelled as not the traveller's date.
5. **Station rule: keep "nearest rail-served", exactly as backend recommended.** For Spot FR that is **Arnage** (1.95 km), not Le Mans (7.15 km): the journey reads "TGV to Le Mans, change, TER to Arnage" and drops the rider 2 km from the spot instead of 7. Keep the **single** `places_nearby` call. **No mainline tie-break** — it needs route counts and a second call, so it stays **F6**. V1 and criteria 7, 11, 12, 24, 25, 28 moved onto Arnage, and the old "4.7 km" figure (which matched neither station) is gone.

Answered earlier: no price, and the link label and new tab (relayed 2026-09-15).

### The user's rev 2 review, folded into rev 3

| Severity | Finding | Disposition |
|---|---|---|
| **HIGH** | The country gate contradicted backend eligibility: the API accepts `fr`, but 8.1 required `country === 'FR'`, so a valid lowercase-country spot would never request or render rail | **Applied.** One shared normalisation — trim, upper-case, compare to `FR` — written into **7.7** (backend) and **8.1** (frontend, `spot.country?.trim().toUpperCase() === 'FR'`). New criteria **43** (backend: `fr`, `Fr`, `" fr "` all behave as `FR`; `FRA`/`F`/`""`/`null` don't) and **44** (Cypress: a lowercase-`fr` spot sends the request and renders the region). |
| **HIGH** | Station filtering still read as an unresolved feasibility blocker: 7.5 asked for one `places_nearby` call without proving the mechanism, and R0 was still open with BE1 depending on it | **Applied, as already-measured fact.** 7.5 now states the measurement: `depth=2` makes each stop_area carry `physical_modes[]`, so all five rail modes are filtered locally from one response; `count=100` is mandatory or the default 10 truncates to coach stops; the `filter=physical_mode.id=…` form takes one mode, strips `physical_modes` and would cost five calls. **R0 is CLOSED** (11, and the row below) and **BE1 no longer depends on it**; R0's remainder is fixture capture only. 7.6 carries the matching budget (1 + ≤3 = ≤4 sample, ≤2 chained, no retries). **No re-verification of the mechanism.** *(Rev 4: the blanket "no new SNCF calls" was too tight — it demanded a CDG→Arnage body nobody had fetched. **Exactly one** journeys call is approved at build time to capture it. See R0 and P1 in 11.)* |
| **MEDIUM** | `fetchedAt` cache semantics underspecified: 7.2 defined it as the oldest answer used, but 7.8 cached only payloads, so criterion 17's "equal `fetchedAt` on a cache hit" wasn't deterministically implementable | **Applied.** 7.8 now specifies that each cached entry stores **its own provider-fetch instant inside the cached value** (`PersistentCacheService.get` returns only the body), that a hit re-serves that instant verbatim, and that the response's `fetchedAt` is the earliest stored instant across the entries used. Criterion 17 gains the mixed stale-station / fresh-journeys case and the failed-origin case. |

### Review items folded into rev 2

| Raised by | Item | Disposition |
|---|---|---|
| **backend O1** | Station rule picks Arnage, but every example assumed Le Mans, and "4.7 km" matched neither | **Escalated as the one product question; the user chose backend's recommendation.** 13.5 above. |
| backend R0 | One-call station filter; LYS stop_area | **CLOSED, measured live during review**: `depth=2&count=100` in 7.5 and criterion 7; `stop_area:SNCF:87762906` in 7.3 and criterion 9. Not a dependency of any build task. |
| backend O2/O3, frontend O2, sdet O1 | Buffers invalidate ~15 figures; V2 dies under its own filter | **Applied.** All three derived the same criterion-10 table; it's in 10 verbatim. V2's landing moved to 09:35 so the example keeps a **probed** departure rather than inventing a post-11:45 one. |
| frontend O1, sdet O5 | `AFTER_FLIGHT` date line renders in the browser's zone | **Accepted**, frontend's fix: `formatShortDate(chain.arrivalTime.slice(0, 10))` (8.3). No contract change, so backend isn't blocked. Criterion 31 gains New York and Tokyo cases. sdet's alternative (`chain.arrivalDate` from backend) reaches the same result for more work. |
| frontend O3, sdet (small) | `geometry` / `railTraceFeatures` / BE4 / FE4 left behind | **Applied**: gone from 7.2, 8.4 and 11, and re-swept in rev 3. 7.9 is **kept but relabelled** as F0's spec — deleting a reviewed contract would just cost F0 the work again. Criterion 11 asserts no `geometry` is serialized. |
| sdet O3 | Cap test races under parallel origins | **Accepted**: 7.8 consumes the cap in origin order (CDG, LYS, PARIS); criterion 19 says so. |
| sdet O4 | `fetchedAt` unrendered with no staleness label | **Accepted, don't render** (sdet's own recommendation), and the absence is now **tested** by criterion 27. Rendering an age is F13. |
| sdet (small) | Deleted venue slug → 404 | **Applied**: criterion 1 and 7.1. |
| frontend (small) | AIRPORT line source, badge primitive, ellipsis, criterion 32's timing | **Applied**: 8.3 names `origins[0].stationName`, the badge primitive and the U+2026; criterion 32 says the request follows the spot resolving. |
| backend (notes) | Fetch instant must live inside the cached value; shared OkHttp bean is 5/15/20 s | **Applied**: 7.8 (expanded in rev 3) and 7.6. |
| sdet (verified) | `SpotAccessPricingServiceTest` is not invalidated | **Recorded** in 3 and kept as criterion 35. |

### Settled in review, no user call needed

- **1000/day cap** (7.8): backend confirmed it as sane — ≥ 250 uncached spot views/day worst case, far more in practice given the 30-day station cache.
- **Per-request call budget**: sample ≤ 4, chained ≤ 2, no retries. Stated in 7.5, 7.6 and 7.8, and matching criteria 10, 17, 19 and 20.
- **Nine statuses**: backend confirmed all nine are reachable and 7.7's precedence is total and deterministic.

**Nothing is open, and the review is closed.** `backend`, `frontend` and `sdet`
all replied **AGREE** on rev 3; rev 4 applies the corrections A–H they sent with
those agreements, accepted by the lead. No further confirmation round is
required — **the lead can create build tasks from 11 now.**

Two things are carried into the build rather than left as questions:
- **P1** (11): V1's station coordinates are wrong and are regenerated from R0's
  captured body. It gates A1.
- **R0** (11): exactly one approved SNCF call, for the CDG→Arnage capture.

## Appendix A — withdrawn criteria, held for F0

Not in scope, not counted in the 41, and not to be tested in this slice. Kept
verbatim so F0 starts from a reviewed contract (7.9).

- **40.** (T1) Given a section `geojson` with 250 coordinates, `geometry` has ≤ 100 `[lon, lat]` pairs, and its first and last pairs equal the fixture's. A section without `geojson` gives `geometry: null`.
- **41.** (T2) `railTraceFeatures(V1 journey 2 with geometries, station, spot)` returns features: one with `kind: 'rail'` per leg, each equal to its leg's geometry, and one with `kind: 'last-mile'`: `[[station.longitude, station.latitude], [spot lon, spot lat]]`. With every leg's geometry null it returns `null`, and that journey has no `Show on map` button.
- **42.** (T3) Pressing `Show on map` sets `aria-pressed="true"` and changes the label to `Hide from map`, and only one journey is pressed at a time. Pressing an airport `Show route` returns the pressed journey to `Show on map`. Neither press sends an `/api/**` request.

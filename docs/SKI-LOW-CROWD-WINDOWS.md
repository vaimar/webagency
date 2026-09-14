# Low-Crowd Window Finder

Design for the module that ranks candidate ski weeks by crowd pressure, price and
snow, by cross-referencing school-holiday calendars. First target: **La Clusaz,
March 2027, travelling from Ireland (Mid-West / Limerick).**

Status: design proposal. Nothing implemented yet.

---

## 0. Three decisions that shape everything below

**0.1 The planning unit is a Saturday-anchored ski week, not an ISO week.**
French resorts change over on Saturday; lets, transfers and Geneva arrivals all
run Sat→Sat. If weeks are bucketed Mon→Sun, every holiday boundary lands
mid-bucket and every overlap number is wrong by a day or two in a way that
silently reorders the ranking. `changeover_dow` is per-resort config (some
Austrian resorts are Sun→Sun) but it is never "ISO week" by default.

**0.2 Crowd and price are correlated, so they cannot both carry full weight.**
The weeks that are busy are the weeks that are expensive — the French zone
holidays drive both. Summing a crowd penalty and a price penalty double-counts
the same underlying cause and buries the genuinely cheap-for-how-busy-it-is
weeks. Price enters the score as a **residual** against the price the crowd
index predicts (§3.4). Where there is no price history to fit against, price is
**dropped from the ranking entirely** and its weight redistributed, with the
modelled tier still shown as information only.

> Corrected during implementation. This section originally said price would fall
> back to a raw tier "at a reduced weight". That is wrong: a price modelled from
> the crowd index is a monotone function of that index, so including it at *any*
> weight contributes no information the crowd term does not already carry — it
> merely rescales the crowd weight while looking like independent evidence.
> Dropping it and telling the user is the honest form. See
> `ScoringWeights.withoutPrice()`.

**0.3 Crowd and snow pull in opposite directions across March, so the module
must not hide the trade-off behind one number.** Late March empties out and
melts out at the same time; La Clusaz's village base is ~1100 m, which is
snow-marginal by then even when Balme at ~2477 m is fine. The API returns the
component breakdown, and the UI ships weight presets (Empty pistes / Best snow /
Cheapest) rather than one editorial "best week".

---

## 1. What March 2027 actually looks like

Computed, not assumed:

| Fact | Value |
| --- | --- |
| Easter Sunday 2027 | **Sun 28 March 2027** (Good Friday 26 March) |
| St Patrick's Day 2027 | **Wednesday 17 March 2027** |
| Easter Sunday 2028 | Sun 16 April 2028 |

### Ingested calendars

These are no longer predictions. The 2026-27 calendars have been ingested and
seeded; the dates below are what the module actually scores against.

**France** — from `data.education.gouv.fr`, normalised to half-open:

| Zone | Vacances d'Hiver | Vacances de Printemps |
| --- | --- | --- |
| C | 6 Feb → 22 Feb | 3 Apr → 19 Apr |
| A | 13 Feb → 1 Mar | 10 Apr → 26 Apr |
| B | 20 Feb → **8 Mar** | 17 Apr → 3 May |

**Ireland** — Circular 0018/2026: February mid-term 13/18 Feb → 22 Feb
(post-primary/primary), **Easter 20 Mar → 5 Apr**, St Patrick's Day Wed 17 Mar.

Two corrections to what this document originally claimed:

- ~~"Both the French *vacances de printemps* and the Irish Easter break anchor to
  Easter, so they pull into March in 2027."~~ **Wrong for France.** French spring
  holidays have been set by fixed zone rotation rather than by Easter since the
  2015-16 reform. In 2027 they start 3, 10 and 17 April — *after* Easter Sunday
  on 28 March, and nowhere near March. Only Ireland's break tracks Easter, and
  it does so hard: closing 19 March is unusually early, driven entirely by the
  early Easter.
- The structural prior said the last French zone's break "typically ends in the
  first days of March", making W2 (6–13 March) the standout. The first half is
  right — Zone B runs to Sunday 7 March — but that makes W2 *second*, not first.

### The answer for March 2027

Saturday-anchored weeks, scored by the live endpoint under the default
`AVOID_SCHOOL_HOLIDAY` policy and `balanced` preset:

| Rank | Week | Score | Crowd | Base snow | Note |
| --- | --- | --- | --- | --- | --- |
| **1** | **Sat 13 → Sat 20 Mar** | **90.2** | 1.8 | 56% | No French zone on holiday, no Irish break |
| 2 | Sat 6 → Sat 13 Mar | 79.8 | 18.6 | 70% | Zone B's last weekend (6–7 Mar) |
| 3 | Sat 27 Feb → Sat 6 Mar | 65.4 | 47 | 81% | Zone B all week, Zone A's last weekend |
| — | Sat 20 → Sat 27 Mar | excluded | 2.1 | 42% | Irish Easter break |
| — | Sat 27 Mar → Sat 3 Apr | excluded | 2.1 | 29% | Irish Easter break |
| — | Sat 20 → Sat 27 Feb | excluded | 78.7 | 88% | All three French zones + Irish mid-term |

**Sat 13 – Sat 20 March 2027** wins, and wins under every preset — it is
simultaneously the emptiest week and still has usable snow, so the usual
crowd-versus-snow trade-off does not bite this particular March. That robustness
is asserted in `WindowScorerTest.theMarchWinnerIsRobustToEveryPreset` so a future
calendar change that makes the answer preference-dependent shows up as a failure.

**St Patrick's Day lands inside the winning week**, on Wednesday 17 March. It is
scored as a *bonus* — a day of leave that does not have to be spent — not as a
penalty, because no school-age children are travelling under the default policy.
A Wednesday bank holiday also bridges to nothing, which the rule engine derives
rather than assumes (§2.4).

The late-March weeks are the interesting near-miss: they are genuinely quiet
(crowd index ~2, since no French zone is off) but the Irish Easter break rules
them out on personal availability alone, and the base snow has fallen to 42% and
29%. Both reasons are returned to the client rather than hidden.

---

## 2. Data model

Postgres. `daterange` throughout, always half-open `[start, end)` — inclusive end
dates are the single largest source of off-by-one bugs in calendar code, and
`daterange` gives overlap operators and GiST exclusion constraints for free.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE calendar_kind     AS ENUM ('SCHOOL_ZONE','NATIONAL_PUBLIC','REGIONAL_SCHOOL','SCHOOL');
CREATE TYPE period_kind       AS ENUM ('SCHOOL_BREAK','PUBLIC_HOLIDAY','DISCRETIONARY_CLOSURE');
CREATE TYPE school_level      AS ENUM ('PRIMARY','SECONDARY','BOTH');
CREATE TYPE source_confidence AS ENUM ('CONFIRMED','STANDARDISED','ESTIMATED');
```

### 2.1 Calendar authorities

One polymorphic table instead of "french_holidays" + "irish_holidays". La Clusaz
is fed by far more than France — Geneva is ~50 minutes away, and UK/NL/BE
half-terms are real demand — so the model has to accept new calendars without a
schema change.

```sql
CREATE TABLE calendar_authority (
  id              bigserial PRIMARY KEY,
  code            text UNIQUE NOT NULL,      -- 'FR-ZONE-A', 'IE-NATIONAL',
                                             -- 'IE-LIMERICK-PRIMARY', 'CH-GE', 'UK-ENG'
  country_iso2    char(2) NOT NULL,
  kind            calendar_kind NOT NULL,
  display_name    text NOT NULL,
  parent_id       bigint REFERENCES calendar_authority(id),  -- school → national fallback
  source_url      text,
  source_dataset  text,
  last_ingested_at timestamptz
);
```

`parent_id` is how the Limerick question gets answered honestly: Irish schools
set discretionary closure days within the national standardised frame. Store
`IE-LIMERICK-PRIMARY` with `parent_id → IE-NATIONAL`; resolution walks the chain
and takes the most specific row available, so the system degrades to the
national calendar instead of guessing.

### 2.2 Holiday periods

```sql
CREATE TABLE holiday_period (
  id           bigserial PRIMARY KEY,
  authority_id bigint NOT NULL REFERENCES calendar_authority(id),
  school_year  text NOT NULL,               -- '2026-2027'
  kind         period_kind NOT NULL,
  name         text NOT NULL,               -- 'Vacances d''hiver', 'Easter break'
  level        school_level NOT NULL DEFAULT 'BOTH',
  during       daterange NOT NULL,          -- ALWAYS [start, end)
  closure_prob numeric(3,2) NOT NULL DEFAULT 1.00
                 CHECK (closure_prob BETWEEN 0 AND 1),
  confidence   source_confidence NOT NULL DEFAULT 'CONFIRMED',
  source_ref   text,
  ingested_at  timestamptz NOT NULL DEFAULT now(),

  EXCLUDE USING gist (
    authority_id WITH =, kind WITH =, level WITH =, during WITH &&
  )
);
CREATE INDEX holiday_period_during_idx ON holiday_period USING gist (during);
```

The exclusion constraint stops the same authority holding two overlapping breaks
of the same kind — the classic re-ingestion duplicate. Different `kind` values
may overlap, which is required: St Patrick's Day can fall inside an Easter break.

`closure_prob` is the release valve for uncertainty. Confirmed break days are
`1.00`; bridge days and discretionary days derived by rule (§2.4) get their
actual probability and flow into the score as an expected value. This is much
better than a boolean, which forces you to either overstate a maybe-closure or
drop it entirely.

### 2.3 Resorts, seasons, demand weights

```sql
CREATE TABLE resort (
  id            bigserial PRIMARY KEY,
  slug          text UNIQUE NOT NULL,       -- 'la-clusaz'
  country_iso2  char(2) NOT NULL,
  base_alt_m    int,
  top_alt_m     int,
  changeover_dow smallint NOT NULL DEFAULT 6 CHECK (changeover_dow BETWEEN 1 AND 7)
);

CREATE TABLE resort_season (
  id            bigserial PRIMARY KEY,
  resort_id     bigint NOT NULL REFERENCES resort(id),
  season_label  text NOT NULL,              -- '2026-27'
  operating     daterange NOT NULL,
  UNIQUE (resort_id, season_label)
);

-- How much each calendar's holidays actually move THIS resort's lift queues.
CREATE TABLE resort_demand_weight (
  resort_id    bigint REFERENCES resort(id),
  authority_id bigint REFERENCES calendar_authority(id),
  weight       numeric(4,3) NOT NULL CHECK (weight BETWEEN 0 AND 1),
  rationale    text,
  PRIMARY KEY (resort_id, authority_id)
);
```

`resort_demand_weight` is the heart of the crowd model and the part that must be
per-resort, not global. Starting values for La Clusaz, to be calibrated against
observed lift-pass or occupancy data once there is any:

| Authority | Weight | Rationale |
| --- | --- | --- |
| `FR-ZONE-A` | 1.00 | Grenoble/Lyon academies — La Clusaz's own catchment, drive-in |
| `FR-ZONE-C` | 0.85 | Paris/Versailles — the big national ski-holiday market |
| `FR-ZONE-B` | 0.45 | Further and better served by other massifs |
| `CH-GE` / `CH-VD` | 0.55 | Geneva/Lausanne, under an hour away |
| `UK-ENG` | 0.30 | Half-term charter demand into GVA |
| `NL` / `BE` | 0.25 | Krokus/carnival week |
| `IE-*` | 0.02 | Negligible for *crowds*; matters for personal availability and SNN/DUB fares |

That last row is the point of separating the two axes: Irish holidays barely
touch La Clusaz's lift queues but are decisive for whether the trip can happen
at all. They must not be summed into one "holiday overlap" figure.

### 2.4 St Patrick's Day and other bridge cases

Statutory public holidays are stored as one-day `PUBLIC_HOLIDAY` rows. The
*behavioural* closure around them is derived, not stored by hand:

```sql
CREATE TABLE bridge_rule (
  id            bigserial PRIMARY KEY,
  authority_id  bigint NOT NULL REFERENCES calendar_authority(id),
  holiday_dow   smallint NOT NULL,   -- ISO day the public holiday falls on
  extend_back   int NOT NULL DEFAULT 0,
  extend_fwd    int NOT NULL DEFAULT 0,
  probability   numeric(3,2) NOT NULL CHECK (probability BETWEEN 0 AND 1),
  note          text
);
```

For `IE-NATIONAL`: holiday on Tuesday → bridge Monday, p≈0.60; on Thursday →
bridge Friday, p≈0.70; **on Wednesday → p≈0.15 either side**, because there is
no clean bridge. St Patrick's Day 2027 is a Wednesday, so the rule engine
produces two low-probability half-closures rather than pretending the week is
either fully open or fully shut. The generated rows are written back as
`DISCRETIONARY_CLOSURE` with `confidence = 'ESTIMATED'` so the UI can label them.

**The genuinely ambiguous case, flagged rather than decided:** a public holiday
inside the travel window cuts both ways. If school-age children are travelling
it is a constraint; if not, it is a free day of annual leave and a *bonus*. The
schema keeps it neutral and the traveller policy (§3.1) decides the sign. This
is why `flexScore` exists as a separate component.

### 2.5 Planning weeks, price, snow

```sql
CREATE TABLE planning_week (
  id           bigserial PRIMARY KEY,
  resort_id    bigint NOT NULL REFERENCES resort(id),
  season_label text NOT NULL,
  span         daterange NOT NULL,          -- [Sat, next Sat)
  iso_year     int, iso_week int,           -- cross-reference/display only
  UNIQUE (resort_id, season_label, span)
);

CREATE TABLE week_price_observation (
  id              bigserial PRIMARY KEY,
  planning_week_id bigint NOT NULL REFERENCES planning_week(id),
  source          text NOT NULL,            -- 'xotelo' | 'booking-scraper' | 'manual'
  property_key    text NOT NULL,
  currency        char(3) NOT NULL,
  nightly_median  numeric(10,2) NOT NULL,
  sample_size     int NOT NULL,
  observed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE week_snow_reliability (
  planning_week_id bigint PRIMARY KEY REFERENCES planning_week(id),
  base_reliability numeric(4,3) NOT NULL,   -- 0..1 climatology, NOT forecast
  top_reliability  numeric(4,3) NOT NULL,
  method           text NOT NULL
);
```

Snow is climatology (historical snow depth by day-of-year at base and top), not
forecast — these windows get chosen months ahead, so a forecast would be noise
presented as signal. Price observations stay raw; the index is a materialised
view over the season median, tiered with `ntile(5)`.

---

## 3. Scoring algorithm

Evaluated per candidate week `w` for a resort, season and traveller policy.

### 3.1 Step 0 — Eligibility gate (multiplicative, not additive)

A hard constraint must zero a week, never trade off against a good price. The
gate is separate from the score, and ineligible weeks are **returned with
reasons, not dropped** — the user needs to see *why* a week is out.

```
ineligible if  span ⊄ resort_season.operating           → OUT_OF_SEASON
ineligible if  policy violated                           → PERSONAL_UNAVAILABLE
```

The traveller policy is an explicit enum, because the requirement "avoid Irish
school holidays" is only correct for one family shape:

| Policy | Meaning |
| --- | --- |
| `AVOID_SCHOOL_HOLIDAY` | No school-age constraint; dodge peak fares out of SNN/DUB. **Default, and the stated goal here.** |
| `REQUIRE_SCHOOL_HOLIDAY` | School-age children — travel is only possible *during* the break |
| `INDIFFERENT` | Adults with flexible leave |

Same data, opposite sign. Hardcoding "Irish holidays are bad" would silently
produce the exact wrong answer for a large share of users, so it is config.

### 3.2 Step 1 — Day-weighted overlap per authority

Not all days in a ski week contribute equally to lift queues. Saturday is
transfer day — jammed roads, empty pistes — and midweek is peak.

```
overlap(a, w) = Σ_{d ∈ w} dayWeight(d) · closureProb(a, d)
                ────────────────────────────────────────────
                        Σ_{d ∈ w} dayWeight(d)
```

Default `dayWeight`, Sat→Fri: `[0.6, 0.9, 1.0, 1.0, 1.0, 1.0, 0.8]`.

`closureProb(a, d)` resolves through the authority chain (§2.1) and takes the
max `closure_prob` of any period covering `d`.

### 3.3 Step 2 — Crowd index

```
P(w)  = Σ_a  demandWeight(resort, a) · overlap(a, w)

P'(w) = P(w) + λ · max( P(w−1), P(w+1) )          λ ≈ 0.18

crowdIndex(w) = 100 · ( 1 − exp( −k · P'(w) ) )   k ≈ 0.90
```

Three deliberate choices:

- **Neighbour spill (`λ`).** The week bracketing a big zone holiday is still
  busy — people extend by a few days, and the changeover Saturday is chaos.
  A pure per-week overlap misses this entirely.
- **Soft saturation instead of clamping.** When Zone A, Zone C and Geneva all
  overlap, a `min(100, ·)` clamp flattens genuinely different weeks to the same
  score. The exponential keeps the ordering intact while staying bounded.
- **No constant terms.** Baseline March demand and weekend day-tripper load from
  Annecy/Geneva are real but identical across every candidate week, so they
  cannot change the ranking. They belong in cross-*month* comparison, not here.
  Adding them to this score would be noise dressed as rigour.

### 3.4 Step 3 — Components, all 0..100, higher is better

```
crowdScore = 100 − crowdIndex

priceScore : fit  predictedIndex = α + β·crowdIndex  over history, then
             residual  = priceIndex(w) − predictedIndex(crowdIndex(w))
             priceScore = 100 · (1 − percentileRank(residual))
             → rewards weeks cheap FOR HOW BUSY THEY ARE.
             Fallback with fewer than 3 observed weeks: priceScore is null,
             w_price → 0 and is redistributed, and a warning says so. The
             modelled tier is still reported, marked priceSource=MODELLED,
             for information only (see §0.2).

snowScore  : blend(base_reliability, top_reliability) weighted by the resort's
             altitude profile. For La Clusaz (~1100 m base) the base term
             carries real weight and degrades visibly across March.

flexScore  : traveller-side bonus — public holidays usable as free annual
             leave, minus friction (school-run days, midweek flight scarcity
             from SNN).
```

### 3.5 Step 4 — Composite

```
total(w) = w_crowd·crowdScore + w_price·priceScore + w_snow·snowScore + w_flex·flexScore
```

Weights sum to 1 and live in config, not code. Starting point and presets:

| Preset | crowd | price | snow | flex |
| --- | --- | --- | --- | --- |
| `balanced` (default) | 0.45 | 0.20 | 0.25 | 0.10 |
| `empty-pistes` | 0.65 | 0.10 | 0.15 | 0.10 |
| `best-snow` | 0.25 | 0.10 | 0.55 | 0.10 |
| `cheapest` | 0.20 | 0.55 | 0.15 | 0.10 |

Ranked descending; ties broken by `crowdIndex` ascending, then earliest start.

### 3.6 Step 5 — Explanation

Every component emits signed contributing factors (`authority`, `label`,
`delta`, `confidence`). The API returns them, and the UI renders them the way
`TruthCard` already renders flight-integrity findings. A ranked list with no
breakdown is not usable here — the whole value is knowing *which* calendar is
ruining a given week.

---

## 4. API contract

```
GET /api/ski/low-crowd-windows
      ?resort=la-clusaz
      &season=2026-27
      &from=2027-02-27&to=2027-04-03
      &origin=SNN
      &policy=AVOID_SCHOOL_HOLIDAY
      &preset=balanced
      &includeIneligible=true
```

```jsonc
{
  "resort": { "slug": "la-clusaz", "name": "La Clusaz",
              "baseAltitudeM": 1100, "topAltitudeM": 2477 },
  "season": { "label": "2026-27", "opens": "2026-12-12", "closes": "2027-04-18" },
  "policy": "AVOID_SCHOOL_HOLIDAY",
  "preset": "balanced",
  "weights": { "crowd": 0.45, "price": 0.20, "snow": 0.25, "flex": 0.10 },

  "calendarCoverage": [
    { "authority": "FR-ZONE-A", "confidence": "CONFIRMED",
      "sourceDataset": "fr-en-calendrier-scolaire", "ingestedAt": "2026-08-06T09:12:00Z" },
    { "authority": "IE-LIMERICK-PRIMARY", "confidence": "ESTIMATED",
      "note": "School-level discretionary days not published; national frame used." }
  ],

  "windows": [
    {
      "rank": 1,
      "start": "2027-03-06", "end": "2027-03-13",   // [start, end)
      "nights": 7,
      "eligible": true,
      "totalScore": 81.4,
      "components": {
        "crowdScore": 88.0, "priceScore": 74.0,
        "snowScore": 79.0,  "flexScore": 60.0
      },
      "metrics": {
        "crowdIndex": 12.0,
        "priceTier": 2,               // 1 cheapest … 5 dearest
        "priceIndex": 0.91,           // vs season median
        "priceResidual": -0.06,
        "snowReliabilityBase": 0.74,
        "snowReliabilityTop": 0.96
      },
      "holidayOverlap": [
        { "authority": "FR-ZONE-A", "overlap": 0.00, "weightedImpact": 0.00 },
        { "authority": "CH-GE",     "overlap": 0.00, "weightedImpact": 0.00 },
        { "authority": "IE-NATIONAL", "overlap": 0.00, "weightedImpact": 0.00 }
      ],
      "explain": [
        { "label": "No school break in any high-impact calendar", "delta": +39.6,
          "confidence": "CONFIRMED" },
        { "label": "Residual spill from preceding zone changeover", "delta": -5.4,
          "confidence": "CONFIRMED" },
        { "label": "Base-altitude snow still reliable in early March", "delta": +19.8,
          "confidence": "ESTIMATED" }
      ]
    },
    {
      "rank": 4,
      "start": "2027-03-20", "end": "2027-03-27",
      "eligible": false,
      "exclusions": [
        { "code": "PERSONAL_UNAVAILABLE",
          "detail": "Overlaps Irish Easter break (Easter Sunday 2027-03-28).",
          "authority": "IE-NATIONAL", "confidence": "STANDARDISED" }
      ],
      "totalScore": null,
      "metrics": { "crowdIndex": 68.0, "priceTier": 5 }
    }
  ],

  "warnings": [
    "IE-LIMERICK-PRIMARY discretionary closure days are estimated; confirm with the school before booking."
  ]
}
```

Contract notes: `end` is exclusive to match the storage model; ineligible weeks
keep their metrics but carry `totalScore: null` so no client accidentally ranks
them; `calendarCoverage` and `confidence` are first-class so the UI never shows
an estimate as a fact.

---

## 5. Data sources to ingest

| Calendar | Source | Notes |
| --- | --- | --- |
| France A/B/C | `data.education.gouv.fr` open-data calendar dataset (Opendatasoft API), filterable by academy/zone/population | Verify the dataset identifier at ingestion; zone→academy mapping is stable, zone *rotation* is not — re-ingest every school year |
| Ireland national | Dept. of Education standardised school year circulars (primary + post-primary), published per year | PDF; parse or transcribe once per year, mark `STANDARDISED` |
| Limerick / Mid-West | School-level discretionary days | Not centrally published. Best-effort, `ESTIMATED`, always surfaced as a warning |
| Public holidays | gov.ie / a public-holiday API | Feeds `bridge_rule` expansion |
| CH / UK / NL / BE | Cantonal and national school calendars | Second-phase; the schema already accepts them |

The ingestion job is idempotent per `(authority, school_year)`: delete-and-replace
inside a transaction, guarded by the exclusion constraint.

---

## 6. Implementation shape

**Java (Slumber, port 9090)** — `LowCrowdWindowService` orchestrates; the scoring
core stays a pure function so it is unit-testable without a database:

```java
public interface HolidayCalendarRepository {
    List<HolidayPeriod> periodsOverlapping(LocalDate from, LocalDate to);
    Map<String, BigDecimal> demandWeights(long resortId);
}

public record WindowScore(
    LocalDate start, LocalDate end, boolean eligible,
    Double totalScore, ScoreComponents components,
    WindowMetrics metrics, List<HolidayOverlap> overlaps,
    List<Explanation> explain, List<Exclusion> exclusions) {}

/** Pure: no I/O, no clock. Everything it needs is in the arguments. */
public final class WindowScorer {
    public WindowScore score(PlanningWeek week, CalendarSnapshot calendars,
                             ScoringWeights weights, TravellerPolicy policy);
}
```

**SQL** — candidate weeks with per-authority weighted overlap, one round trip;
day-weighting via `generate_series` over the week so the calculation lives next
to the data:

```sql
WITH day_grid AS (
  SELECT pw.id AS week_id, d::date AS day,
         CASE EXTRACT(ISODOW FROM d)
           WHEN 6 THEN 0.6 WHEN 7 THEN 0.9 WHEN 5 THEN 0.8 ELSE 1.0 END AS day_weight
  FROM planning_week pw,
       LATERAL generate_series(lower(pw.span), upper(pw.span) - 1, '1 day') d
  WHERE pw.resort_id = :resortId AND pw.span && :searchRange
)
SELECT g.week_id, ca.code AS authority,
       SUM(g.day_weight * COALESCE(hp.closure_prob, 0)) / SUM(g.day_weight) AS overlap,
       MAX(rdw.weight) AS demand_weight
FROM day_grid g
CROSS JOIN calendar_authority ca
LEFT JOIN resort_demand_weight rdw
       ON rdw.authority_id = ca.id AND rdw.resort_id = :resortId
LEFT JOIN holiday_period hp
       ON hp.authority_id = ca.id AND hp.during @> g.day
GROUP BY g.week_id, ca.code
HAVING MAX(rdw.weight) IS NOT NULL;
```

**TypeScript (this repo)** — `src/services/skiWindows.ts` following the existing
`skiMap.ts` pattern (types + fetch in `services/api.ts`, selectors alongside),
with the scoring core mirrored in TS only if client-side re-weighting is wanted
when the user drags the preset sliders. Preferred: keep one implementation in
Java and re-request on weight change; duplicate scoring logic in two languages
drifts.

---

## 7. What is built

Backend lives in the `slumber` repo, frontend in `webagency`.

| Piece | Location |
| --- | --- |
| Schema | `slumber` `V8__ski_low_crowd_windows.sql` |
| Seed (FR + IE 2026-27, La Clusaz, weights, bridge rules) | `slumber` `V9__seed_ski_low_crowd_calendars.sql` |
| Entities + repositories | `com.slumber.escape.slumber.model` / `.repository` |
| Scoring core (pure) | `service/skiwindow/WindowScorer.java` |
| Orchestration | `service/skiwindow/LowCrowdWindowService.java` |
| Live French calendar refresh | `service/skiwindow/FrenchSchoolCalendarIngestionService.java` |
| Endpoint | `GET /api/ski/low-crowd-windows` |
| Backend tests | `WindowScorerTest` — 20 tests on the real March 2027 calendar |
| API client + types | [api.ts](../src/services/api.ts) |
| Presentation helpers | [skiWindows.ts](../src/services/skiWindows.ts), 16 tests |
| UI | [LowCrowdWindows.tsx](../src/components/LowCrowdWindows.tsx) |
| Entry point | [ResortHubPage.tsx](../src/ResortHubPage.tsx) at `/resorts/:slug` — "When to go" tab, alongside "Eating & hire". `/ski-windows` still works as a deep link. Reached from the Home CTA and from ski-map pins, which link only where a resort profile exists. |

### Still open

1. **Price observations.** The tables and the residual model exist and are
   tested; `week_price_observation` is empty. Wiring the existing Xotelo and
   Booking feeds into it is what turns the price column from indicative into a
   ranking input.
2. **Season dates.** La Clusaz's are inferred from a catalogue string
   ("December - April") and flagged `INFERRED` in every response. Replace with
   operator-published dates.
3. **Demand-weight calibration.** Current weights are reasoned, not fitted. They
   need observed occupancy or lift-pass data to become more than an assumption —
   this is the largest remaining source of error in the ranking.
4. **More calendars.** Geneva/Vaud, UK, NL and BE all feed La Clusaz and the
   schema already accepts them; only rows and weights are missing.
5. **Snow climatology.** Currently a logistic curve in altitude and day-of-year,
   labelled `MODELLED_CLIMATOLOGY`. `week_snow_reliability` is ready for real
   historical snow-depth data.
```

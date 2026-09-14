# Catalogue truth extraction — contract

How a model is allowed to put a fact into the spot catalogue. Scope is
**catalogue truth only**: opening season and operator tariffs. Nothing here
touches flight search, routing or fares.

The rule this exists to enforce: *a fact the pipeline cannot show you the source
of does not get written.* Everything below is machinery for making that
checkable by a program rather than believed.

Companion artifacts:
[`schemas/extraction-output.schema.json`](../schemas/extraction-output.schema.json) ·
[accepted example](../schemas/examples/accepted.json) ·
[rejected example](../schemas/examples/rejected.json)

---

## 1. Inputs

Per spot, the pipeline receives:

| Input | Source | Why it is needed |
| --- | --- | --- |
| `slug` | catalogue | Identity. The pipeline never creates spots. |
| `name`, `country`, `latitude`, `longitude` | catalogue | Disambiguation — three French parks share a name. |
| `websiteUrl` | catalogue | Defines the T1 domain. **Empty on 25 of 122 spots**, which is the same 25 missing the booking handoff. For those, T1 must be established before extraction, not guessed. |
| `existingSeason`, `existingPrices` | catalogue | Conflict detection. Never shown to the model as a hint — passing them in the prompt invites confirmation of a stored value rather than reading of a page. Held by the validator only. |
| `targetFields` | worklist | `season`, `prices`, or both. |

**The model never sees the existing value.** That is a hard architectural rule,
not a preference: an extractor told the answer will find it.

## 2. Allowed sources

Three tiers, and nothing else is a source.

| Tier | What qualifies | Points |
| --- | --- | --- |
| `T1_OPERATOR` | A page on the operator's own registered domain — the host of `websiteUrl`, or a host the operator's site canonicalises to. | 40 |
| `T2_OPERATOR_CONTROLLED` | A page the operator demonstrably controls **and** that a T1 page links to: their booking platform, their official social page. The T1 link is what makes it verifiable; without it, it is a stranger's page. | 25 |
| `T3_INSTITUTIONAL` | A municipal, departmental or tourist-board page naming this operator. | 10 |

**Not sources, at any score:** review sites (TripAdvisor, Google reviews), forums,
blogs, other cable-park directories, aggregator listings, press articles, and the
model's own knowledge. A price a reviewer typed is not an operator tariff no
matter how plausible it reads.

**Archived copies** (web.archive.org) are T3 at best and only with the snapshot
date recorded as `observedAt`. A snapshot older than the 180-day freshness window
cannot satisfy `tariff-fresh` and so cannot make a spot trip-ready.

## 3. Output schema

Full schema in
[`schemas/extraction-output.schema.json`](../schemas/extraction-output.schema.json).
The shape maps directly onto `spot-readiness.js`:

- `season.seasonStartMonth` / `seasonEndMonth` → the `season` decision check
- `prices[]` → the `tariff`, `tariff-sourced` and `tariff-fresh` checks
- Enums are taken from the live catalogue, not invented: `kind` has ten values
  (HOUR, HALF_DAY, DAY, SESSION, PACK, COACHING, GROUP_HIRE, ACCESS_BAND,
  MEMBERSHIP, GEAR_RENTAL), `tier` has seven, and `confidence` has exactly one —
  `STATED`, on all 269 existing rows.

`confidence` stays a single value on purpose. A fact that is not directly stated
does not get a weaker confidence label; it does not get written. Grading
uncertainty inside the field is how an inferred price ends up in a total.

`perRiderAmount` is **computed on ingest, never extracted** — it is a derivation
of `amount`, `perPerson` and party size, and a model that emits it is
guessing arithmetic it was not asked for.

### The season has nowhere to store its provenance

This blocks the contract and needs a backend change before batch 1 ships.

`prices[]` rows carry `sourceUrl` and `observedAt` per row. The spot record
carries `seasonStartMonth` and `seasonEndMonth` and **no source fields at all** —
confirmed against the live API: the only season keys on a spot are those two.

So a sourced season and a guessed season are indistinguishable once stored,
which is precisely the failure this contract exists to prevent. Required:

```
ALTER TABLE spot ADD COLUMN season_source_url  text;
ALTER TABLE spot ADD COLUMN season_observed_at timestamptz;
ALTER TABLE spot ADD COLUMN season_source_quote text;
```

and a `season-sourced` decision check in `spot-readiness.js` mirroring
`tariff-sourced`.

**Migrate in this order, or trip-ready craters.** Twenty spots have a season
today and none of them has a source. Turning the new check on first takes
trip-ready from 15 to 0. The order is: add columns → backfill provenance for the
20 existing seasons → then enable the check. Until the check is live, the
pipeline still emits the provenance and the operator still reviews it; it is
simply not yet enforced by the readiness rule.

## 4. Validation rules and hard rejects

Applied by the validator **after** the model returns and **before** anything is
written. Every rule is mechanical — none requires judgement.

| Code | Condition | Verdict |
| --- | --- | --- |
| `E_NO_SOURCE` | Any claim without `sourceUrl`, `observedAt` or `sourceQuote` | reject |
| `E_SOURCE_TIER_DISALLOWED` | Host resolves to no tier, or T2 with no linking T1 page in `pagesFetched` | reject |
| `E_QUOTE_NOT_FOUND` | `sourceQuote` does not appear in the fetched page text after whitespace normalisation and case folding | reject |
| `E_OBSERVED_AT_MISMATCH` | `observedAt` ≠ the `fetchedAt` of the `pagesFetched` entry with the same URL | reject |
| `E_VALUE_NOT_IN_QUOTE` | The numeral (or month name) being claimed is absent from `sourceQuote` | reject |
| `E_ENUM_INVALID` | `kind`, `tier`, `currency` or `confidence` outside the catalogue's values | reject |
| `E_MONTH_RANGE` | Month outside 1–12, or `wrapsYearEnd` inconsistent with `start > end` | reject |
| `E_AMOUNT_RANGE` | `amount` ≤ 0 or > 5000 | reject |
| `E_CURRENCY_UNSUPPORTED` | Outside EUR / CHF / GBP / TRY — the catalogue spans FR CH DE BE GB TR IT LU IE | reject |
| `E_DUPLICATE_ROW` | Same `kind` + `tier` + `amount` + `durationMinutes` already emitted this run | reject |
| `E_CONFLICT_UNRESOLVED` | Conflict ladder (§5) terminates without a winner | reject |
| `E_SCORE_BELOW_THRESHOLD` | Score < 60 | reject |
| `E_YEAR_ROUND_INFERRED` | `yearRound: true` without those words on the page | reject |
| `H_SCORE_IN_REVIEW_BAND` | Score 60–79 | hold |
| `H_CONTRADICTS_STORED_VALUE` | Disagrees with a stored value that is still inside the freshness window | hold |
| `H_SEASON_PROVENANCE_UNSTORABLE` | Season accepted while the columns in §3 do not yet exist | hold |

`E_QUOTE_NOT_FOUND` is the load-bearing one. It is the only rule that catches a
fabricated fact whose value happens to be plausible, and it is cheap: normalise
the page text once per fetch, then run a substring test.

A rejected claim does **not** downgrade the spot. It stays
`needs-verification`, which is where it already was — the failure mode of this
pipeline is standing still, never publishing a wrong opening date for a real
business.

## 5. Conflict resolution

When two allowed sources disagree on the same field, in order, stopping at the
first that decides:

1. **Higher tier wins.** T1 over T2 over T3.
2. **Newer `observedAt` wins**, when tiers are equal.
3. **Explicit beats derived.** A quote containing the numeral and the unit beats
   one requiring inference (`valueExplicit` 20 beats 10 beats 0).
4. **Otherwise: no winner.** Emit `E_CONFLICT_UNRESOLVED`, write nothing, queue
   for the operator.

Rule 4 is deliberate. A tie between two equally-sourced, equally-dated,
equally-explicit contradictory prices is genuine ambiguity on the operator's own
site, and picking one is guessing with extra steps.

**Seasonal pages contradict themselves routinely** — a 2025 tariff page left up
beside a 2026 one. Rule 2 handles it only if both are dated; if neither is,
rule 4 fires. That is the correct outcome.

## 6. Confidence rubric

Additive, bounded 0–100, and **auditable by construction**: the schema requires
`total` to equal the sum of `components`, so a score can be recomputed from its
parts rather than trusted.

| Component | Values | Meaning |
| --- | --- | --- |
| `sourceTier` | 40 / 25 / 10 | T1 / T2 / T3 |
| `quoteMatch` | 25 / 20 | Exact substring / matched after whitespace normalisation |
| `valueExplicit` | 20 / 10 / 0 | Numeral + unit in the quote / number in words / unit inferred |
| `fieldProximity` | 10 / 0 | Quote within 200 characters of the field's own label on the page |
| `corroborated` | 5 / 0 | A second allowed source states the same value |
| `penaltyAmbiguous` | −15 / 0 | The page offers more than one candidate for this field |
| `penaltyPromoBlock` | −10 / 0 | Quote sits inside a promotion, offer or "from" block |
| `penaltyUndatedSeasonal` | −10 / 0 | Seasonal fact on a page carrying no date |

| Band | Verdict |
| --- | --- |
| **≥ 80** | accept — write |
| **60–79** | hold — operator checklist (§8) |
| **< 60** | reject |

A T3-only fact tops out at 10 + 25 + 20 + 10 = 65, so it can never auto-accept.
That is intentional: a tourist-board page is enough to justify a human look, not
enough to publish.

## 7. Evaluation plan

### The set

The 15 already trip-ready spots, which between them hold **15 verified seasons
and 122 sourced price rows**:

```
base-nautique-atlantic-wake-park-fr   cascade-waterpark-fr
etoile-park-26-fr                     les-o-kiri-baudreix-fr
my-little-wake-park-fr                park-nautic-de-verberie-fr
planet-ski-fr                         rille-wake-park-fr
lakecity-fr                           amiens-cable-park-fr
bzh-wake-park-fr                      champagne-wake-park-teleski-nautique-fr
crans-montana-wakepark-fr             aloha-wakepark-fr
delta-wakepark-fr
```

Run blind: the stored values are withheld from the model and used only by the
scorer.

### What the sample size will and will not support

**n=15 seasons cannot measure 98% precision.** One error is 6.7%, so a
percentage target on seasons is theatre. The gate on seasons is therefore
**zero month errors**, and the finer-grained precision measurement comes from
the 122 price rows, where 0.95 is actually resolvable (≤ 6 wrong).

### Ground truth is dated, and disagreement is not automatically error

The stored values were human-entered on **2026-08-20**. A tariff that has since
changed makes a *correct* extraction look wrong. Every disagreement is therefore
triaged before it is scored — by opening the cited page — into `F3`–`F5`
(extractor wrong) or `F8` (stored value stale, extractor right). Scoring
disagreements as errors without triage will reject a working pipeline.

### Failure taxonomy

| Code | Failure | Counts as |
| --- | --- | --- |
| `F1` | **Fabrication** — quote absent from the cited page | error, zero tolerance |
| `F2` | **Misattribution** — quote real but from another operator's page | error, zero tolerance |
| `F3` | **Wrong field** — real value mapped to the wrong field (an HOUR price written as DAY) | error |
| `F4` | **Unit error** — per-person vs group, minutes, currency | error |
| `F5` | **Scope error** — a "from" price, a promo, or a CHILD price taken as STANDARD | error |
| `F6` | **Stale source** — page outside the freshness window accepted | error |
| `F7` | **Miss** — the fact is on the page and the extractor returned nothing | recall miss, tolerated |
| `F8` | **Ground truth stale** — extractor right, stored value out of date | not an error; update the catalogue |

### Go / no-go before running on the other 107

All five must hold:

| Gate | Threshold |
| --- | --- |
| `F1` fabrications | **0.** Any single occurrence is a no-go. |
| `F2` misattributions | **0.** |
| Price precision (`amount` + `currency`) on accepted rows | **≥ 0.95** (≤ 6 of 122) |
| Season month errors on the 15 | **0** |
| Hold rate | **≤ 30%** — above this the operator queue is the bottleneck and the rubric needs recalibrating, not the model |
| Season recall | **≥ 0.60** — below this, manual entry is cheaper and the pipeline is not worth its review cost |

A no-go on `F1`/`F2` means fix and re-run the whole set. A no-go on precision or
hold rate means recalibrate the rubric thresholds — not loosen the reject rules.

### First production batch

The 23 spots that are one fact from trip-ready, all of them missing only the
opening season. Expected effect: **trip-ready 15 → 38.**

```
dock-5-wasserski-wakeboardpark-duren-fr   dynamite-wakepark-wakeboard-arles-fr
exo-01-la-rena-fr                         exo-13-peyrolles-fr
exo-49-anjou-wake-park-fr                 exo-3d-fr
fun-parc-brumath-fr                       koba-wake-park-fr
le-kable-choisy-le-roi-fr                 poule-wake-park-fr
rouffiac-teleski-fr                       teleski-nautique-cergy-pontoise-fr
teleski-nautique-de-lery-poses-fr         i-wakepark-lacanau-fr
exo64-teleski-nautique-fr                 gliss-adour-lahonce-fr
teleski-nautique-de-saujon-fr             teleski-nautique-du-maconnais-beaujolais-fr
tnco-fr                                   urban-wake-park-fr
wake-park-plesse-fr                       wake-park-riol-fr
tn28-base-de-loisirs-de-fontaine-simon-fr
```

## 8. Operator checklist

For each `hold`. Should take under a minute; if it takes longer, the rubric let
something through that should have been rejected.

- [ ] **Open `sourceUrl`.** Does the page load, and is it this operator's?
- [ ] **Find `sourceQuote` on the page.** Ctrl-F it. If it is not there, mark
      `F1` and stop — that is a fabrication and the whole run needs review.
- [ ] **Read the sentence around the quote.** Does it say what the extracted
      value says, or is the value a "from" price, a child rate, a member rate,
      or last season's?
- [ ] **Check the tier and kind.** A `STANDARD` `DAY` row must be the ordinary
      adult day rate, not the cheapest thing on the page.
- [ ] **Check the currency** against the country.
- [ ] **For a season:** does the page state months, or did the extractor read
      them off an events calendar? A calendar with entries in May is not a
      statement that the park opens in May.
- [ ] **If it contradicts a stored value:** open both sources, keep the
      better-tiered and newer one, and record which you dropped.
- [ ] **Decide:** accept / reject / needs-verification. Rejecting is free — the
      spot was already `needs-verification` and stays there.

Log every rejection with its `F` code. The taxonomy is only useful if the
production run keeps scoring itself against it.

---

## 9. Rollout runbook

Exact order. Steps 1–4 are safe at any time; step 5 is the only irreversible
one in the sense that it changes what "trip-ready" means.

### 0. Baseline — record the number you must not regress

```bash
npm run audit:reachability                                            # measures the reachable set
eval "$(npm run --silent audit:reachability -- --print-audit-command)"  # → trip-ready: 15
```

### 1. Migrate (slumber)

`V21__season_provenance.sql` adds `season_source_url`, `season_observed_at`,
`season_source_quote`, `season_confidence`. Nullable, no defaults — a
backfilled default would manufacture the assurance the columns exist to record.

```bash
cd ../slumber && ./mvnw flyway:migrate     # or restart; Flyway runs on boot
./mvnw spring-boot:run                     # API now returns the four new fields as null
```

Verify the API exposes them before continuing:

```bash
curl -s localhost:9090/api/spots/cascade-waterpark-fr | grep -o 'seasonSourceUrl'
```

### 2. Confirm the gate would still be unsafe

```bash
eval "$(npm run --silent audit:reachability -- --print-audit-command) --require-season-provenance"
```

Expect **trip-ready: 0**. That is the gate working on un-backfilled data, and it
is exactly why step 5 comes last.

### 3. Build the ledger

One entry per spot that already holds a season, naming the page, the fetch
moment and the verbatim quote. This is research, not automation — the same
research the extraction pipeline does, which is why the pipeline can produce it
once it exists. Shape: `season-ledger.example.json`.

### 4. Backfill — dry run first, always

```bash
node scripts/backfill-season-provenance.mjs --ledger=season-ledger.json
node scripts/backfill-season-provenance.mjs --ledger=season-ledger.json --check-gate
```

`--check-gate` answers the only question that matters here: is every spot that
holds a season covered? While it says NOT SAFE, do not proceed. Then:

```bash
node scripts/backfill-season-provenance.mjs --ledger=season-ledger.json \
  --emit-sql=../slumber/src/main/resources/db/migration-postgresql/V22__backfill_season_provenance.sql
```

Read the SQL. Every statement carries an `IS DISTINCT FROM` guard, so applying
it twice updates zero rows.

### 5. Enable the gate

Only once step 4 reports **safe**. Add `--require-season-provenance` to the
audit invocation in CI and pass `seasonProvenanceRequired: true` from any caller
of `assessReadiness` that should enforce it.

```bash
eval "$(npm run --silent audit:reachability -- --print-audit-command) --require-season-provenance"
```

Expect trip-ready back at **15 or better**. If it is lower, the ledger has a
hole; `--check-gate` names it. Roll back by dropping the flag — the check is
inert without it, and the flag is the rollback.

### Why the flag rather than a branch

The check is defined and tested from the moment it is written, and it is
switched on by a flag rather than by a merge. That keeps the dangerous state —
a gate live before its data — impossible to reach by accident, and makes the
rollback a flag flip instead of a revert.

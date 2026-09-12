# Curating ride-spot facts

Runbook for filling in `src/data/rideSpots.ts`. Design rationale lives in
[`ai-intent-layer.md`](./ai-intent-layer.md) §6.

## The one rule

**Never write a value you did not read on a source, today.** Not from memory, not inferred from the venue's name, not
"obviously it's warm, it's Ibiza." A fact with no `sourceUrl` and no `checkedOn` is not a fact — leave it
`unverified()`. An unverified fact costs you a hidden venue; an invented one costs a user their trip.

## Adding one venue — ~20 minutes

1. Open the venue's own site (its site, not an aggregator, not a blog).
2. Fill **only** the four launch-critical facts. Skip the rest; they block nothing.

   | Field | What you are looking for | Trap |
   |---|---|---|
   | `surface` | cable / boat / sea | "wake park" in the name does not prove a cable exists |
   | `beginnerFriendly` | a beginner line, or a school with lessons | advanced-only parks advertise "all levels" — look for actual beginner provision |
   | `climateBand` | band **during the riding season**, not the annual average | a park open Jun–Aug in Lithuania is `temperate`, not `cold` |
   | `openingSeason` | the season published for the current year | last year's dates are stale on arrival — check the year |

3. For each, record the exact page URL and today's date:

   ```ts
   surface: {
       value: 'cable',
       status: 'VERIFIED',
       sourceUrl: 'https://the-venue.example/park',   // the page that says so
       checkedOn: '2026-09-11',
   },
   ```

4. Anything you could not confirm stays `unverified()`. Anything structurally inapplicable — `cableCount` at a sea
   venue — uses `notApplicable('open sea, no cable')`.
5. Run `npm test -- --watchAll=false --testPathPattern=rideSpots`. The validator catches the ten common mistakes.
6. One venue per PR. A reviewer should be able to open each `sourceUrl` and see the claim in under a minute.

## What the validator enforces

| Rule | Catches |
|---|---|
| R1 / R2 | duplicate labels; labels that don't resolve in `destinationDirectory.ts`; airport drift between the two files |
| R3 / R4 / R5 | `VERIFIED` with a null value, a non-https source, a missing or future `checkedOn` |
| R6 | **a value parked behind an `UNVERIFIED` status** — the most likely way a guess sneaks in |
| R7 | season bounds that aren't real calendar days |
| R8 | `cableCount` on a non-cable venue, or a count of zero |
| R9 | `beginnerFriendly: true` alongside `skillFloor: 'confident'` |
| R10 | negative prices, or an hourly rate above the day pass |

Schema breaches **fail CI**. Staleness only **warns** — it is time-dependent, and a build must not break on a Tuesday
because nobody re-checked a season.

## Staleness

Computed from `checkedOn`, never stored. `resolveFact()` applies the TTL:

| Field | TTL | Why |
|---|---|---|
| `openingSeason` | 180 days | republished yearly |
| `sessionPrice` | 90 days | prices move |
| `surface`, `beginnerFriendly`, `cableCount`, `skillFloor` | 730 days | physical, rarely change |
| `climateBand` | never | geography |

A stale fact **still filters**, with an amber "checked March 2026" note. An unverified one does not filter at all.

## Re-check cadence

- **Every February**, before the northern season opens: re-check `openingSeason` on all venues. One sitting, ~2 hours.
- **On any user report** of a wrong fact: re-check that venue, bump `checkedOn` even if the value is unchanged.
- `getCoverage().staleFields` lists what has aged out — wire it to an admin page or just run it in CI as a warning.

---

## Research packet (2026-09-12)

An agent attempted this curation pass and **could not complete it**. Venue domains are blocked by this
environment's network egress proxy — `exoloisirs.com`, `313cablepark.lt` and `lithuania.travel` all refused. Search
summaries were available, but a summary is not a page: recording a venue's URL as `sourceUrl` for a page nobody opened
would falsify the one field this schema exists to protect. So **no observed fact was written**.

What did land: `climateBand` is now derived for all seven venues from a documented geographic rule
(`CLIMATE_RULE_NOTE`), marked `sourceKind: 'derived'`, and flagged to the user as inferred. Three observed fields
remain per venue.

### Leads — unverified, for a human to confirm

Each of these came from a third-party listing, not the venue. Treat as a starting point, not evidence.

| Venue | Lead | Still to confirm |
|---|---|---|
| **EXO 84** | Cable park on Lac des Grèzes Hautes, 5 pylons. Season ~April–October (2022 and 2023 tariff sheets showed 9 Apr–16 Oct and 8 Apr–15 Oct). Accessible from age 7. | Current-year dates; whether age 7 implies a beginner line |
| **313 Cable Park** | 3 full-size Sesitec systems, 50 features. Beginner group session ~€20, "most complete first laps after one session". Season ~May–September. | Current-year dates; beginner provision |
| **Lakecity 33** | Two cables (5-pylon, 760m; plus a 2-pylon). At Mios, between Bordeaux and Arcachon. | Season dates; beginner provision |
| **Hypnotics** | **Not found under this name.** Searches around Perpignan surfaced TSJ Wakepark (Saint-Jean-Pla-de-Corts) and Téléski Nautique Port Barcarès instead. | Whether this venue still exists, or the label is stale |
| **Paris Wakepark**, **Langenfeld**, **Ibiza Cable Park** | No usable leads gathered. | Everything |

### Catalogue corrections — these affect routing, not just filtering

Two venues appear to be mapped to the wrong airport in `destinationDirectory.ts`. Both need checking against the
backend's `AirportResolutionService`, since `rideSpots.ts` copies its airport from there and the validator (R2)
enforces that they agree — **fixing `rideSpots.ts` alone would break the build, and would be fixing the wrong file.**

- **313 Cable Park → `VNO` (Vilnius).** The venue is at Užpelkiai, between Kretinga and Palanga, roughly 300 km from
  Vilnius. Palanga (`PLQ`) is ~15 km away. If this is right, every transfer cost and door-to-trip figure for this
  venue is badly wrong.
- **EXO 84 → `MRS` (Marseille).** The venue is at Lamotte-du-Rhône, near Bollène/Orange — roughly 100 km from
  Marseille. `MRS` may still be the correct routing choice on flight availability, but the transfer leg is long
  enough to change the honest total materially.

### Fastest path to finishing

Per venue, ~5 minutes with the site open: confirm `surface`, `beginnerFriendly`, `openingSeason`; paste the exact page
URL and today's date; leave anything unconfirmed as `unverified()`. Then
`npm test -- --watchAll=false --testPathPattern=rideSpots`.

The wiring beyond that is done and tested: `planSearch` already consumes all four fields, and
`"planSearch — once a venue is genuinely curated"` in `tripPlanner.test.ts` proves that a fully-verified venue starts
returning results with no code change.

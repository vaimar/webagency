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

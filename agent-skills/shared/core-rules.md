# Shared Core Rules

Apply these rules before loading any Slumber skill.

## Non-negotiables

- Always read `AGENTS.md` before making strategic changes.
- Apply **Anti-Cauchemar** logic:
  - surface hidden costs
  - surface airport penalties
  - surface logistic traps
- Prefer `realWorldEntryPrice` over marketing fare whenever both exist.
- If there is no flight data, do not invent a trip.
- If totals are shown, label what is estimated vs verified.
- Never imply one-click package booking if the app is only linking out.

## Frozen Summer tone

- Cold, honest, useful.
- Minimal clutter.
- Sharp warnings.
- High-contrast truth.
- No brochure language.

## Frontend implementation rules

- Flight-first before itinerary.
- Profile-aware planning where available.
- Keep booking links explicit and provider-labeled.
- When backend returns fewer than desired results, make that visible rather than hiding it.

## Recommendation rules

- Prefer at least 10 hotel/stay recommendations when backend data exists.
- Prefer at least 10 restaurant recommendations when backend data exists.
- Rank recommendations to profile first, not generic tourism popularity.

## Canonical outputs

- Honest price hierarchy
- Clear warning state for `theCatch`
- Explicit totals for flight / sleep / food / transport when package estimates are shown


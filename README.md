# Webagency

This is a refactored React + TypeScript travel app built on Create React App. The project now has a clearer architecture, typed models, reusable planner fields, cached fare discovery, and safer handling of external flight data.

## What changed

- Replaced duplicated page rendering with a routed app shell in `src/App.tsx` and `src/Main.tsx`
- Removed the old browser-side OAuth flow with hardcoded secrets
- Added typed flight models, a data service, mock fallback data, and a reusable `useFlightDestinations` hook
- Rebuilt `src/TravelForm.tsx` into a structured planner with live summary output
- Reworked the visual design into a shared stylesheet in `src/index.css`
- Replaced the placeholder test with assertions for the real UI

## App sections

- `Overview` — explains the refreshed product and directs users into the useful flows
- `Discover fares` — lets users filter route ideas by origin and budget, with local cache support
- `Travel planner` — collects preferences for destination, pace, accommodation, food, and activities

## Project structure

```text
src/
  components/        Reusable UI elements and planner inputs
  data/              Mock fares and planner option data
  hooks/             Shared React hooks
  model/             TypeScript models
  services/          External-data integration layer
  App.tsx            Top-level routing
  Main.tsx           Shared application shell
```

## Live flight data

The app no longer embeds Amadeus client credentials in the browser. For live fare discovery, provide a bearer token with:

```bash
REACT_APP_AMADEUS_TOKEN=your_token_here
```

If that variable is missing or the request fails, the app automatically falls back to curated demo fares so the UI remains usable.

## Scripts

```bash
npm start
npm test -- --watch=false
npm run build
```

## Notes

- The project still uses Create React App for compatibility with the existing setup.
- Cache data is persisted in `localStorage` under `webagency.cache`.
- If you later add a backend or proxy, `src/services/flightService.ts` is the place to wire in a more secure live-data strategy.

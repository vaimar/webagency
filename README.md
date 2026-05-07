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

## Flight discovery data

The app currently uses curated destination data instead of relying on a specific third-party flight API. That keeps the project stable and easy to evolve while external provider choices are still open.

If you later decide to connect a backend or alternate vendor, `src/services/flightService.ts` is the single place to plug that in.

## Scripts

```bash
npm start
npm test -- --watch=false
npm run build
```

## Deploy in 5 minutes (no infra)

### Fastest: Netlify Drop

1. Build the app locally:

```bash
npm run build
```

2. Open https://app.netlify.com/drop and drag the `build/` folder.
3. Netlify gives you a live URL instantly.

For SPA routes (`/assistant`, `/planner`), this repo includes `public/_redirects`.

### Connect backend later

If your backend is hosted on another URL, create `.env.production` from `.env.production.example` and set:

```bash
REACT_APP_API_BASE=https://your-backend-url
```

Then rebuild and redeploy.

## Continuous Deploy (GitHub -> Netlify)

This repo includes a workflow at `.github/workflows/netlify-deploy.yml`.

### One-time setup

1. Add a GitHub repository secret named `NETLIFY_AUTH_TOKEN`.
2. Push to `main`.
3. GitHub Actions builds and deploys automatically to `https://travelhub-vaimar.netlify.app`.

### API wiring

The frontend now uses a single centralized client in `src/services/api.ts`.
Its backend base URL is fixed to:

```bash
https://slumber-production.up.railway.app
```

Protected requests (`/api/accounts/profile`, preferences, authenticated planner calls) always send `credentials: 'include'`.

## Custom domain (optional)

1. Netlify project -> `Domain management` -> `Add a domain`.
2. Add the DNS records Netlify shows at your domain registrar.
3. Once SSL is active, add your custom origin to backend `ALLOWED_ORIGINS` on Railway.

## Notes

- The project still uses Create React App for compatibility with the existing setup.
- Cache data is persisted in `localStorage` under `webagency.cache`.
- `src/services/flightService.ts` is intentionally provider-neutral now, so swapping in a future API should be straightforward.

## Session Auth Troubleshooting

TravelHub uses a server-side session cookie (`JSESSIONID`), not JWT.

### Expected flow

1. `POST /api/accounts/login` with `credentials: 'include'`
2. only after HTTP 200, `GET /api/accounts/profile`
3. on app boot, `GET /api/accounts/profile` restores the session
4. if `/api/accounts/profile` returns `401` or `403`, the frontend clears auth UI state, shows `Session expired, please sign in again.`, and redirects to `/profile`

### Dev-only auth debug logs

In development, the centralized API client logs these values for login/profile requests:

- request URL
- `credentials` mode
- response status

Look for `"[auth-debug] request"` and `"[auth-debug] response"` in the browser console.

### If login works but profile still returns 401/403

Check these backend conditions first:

- Railway must return `Set-Cookie: JSESSIONID=...; SameSite=None; Secure`
- backend CORS must allow the exact Netlify origin
- backend CORS must also set `Access-Control-Allow-Credentials: true`
- do **not** use `Access-Control-Allow-Origin: *` with credentialed requests

### Frontend rules enforced in this repo

- one centralized API client only: `src/services/api.ts`
- no manual cookie parsing or manual `Cookie` headers in browser code
- no conflicting frontend base URLs for login/profile
- minimal auth UI state only (account/profile flags), never password or raw cookie values


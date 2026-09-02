# TravelHub

A React + TypeScript front end that prices a trip **door to door** — fare, cabin bag, airport transfer and the drive to your own airport — and labels every figure as confirmed or estimated. It takes no payment; you book with the airline or hotel directly.

The product argument is that cheap fares hide their real cost, so the one thing this must never do is present a number it cannot stand behind.

## The hero feature

**Hack flights** (`/hack-flights`) is the product. It is the only thing here that Google Flights and Skyscanner do not do: separate-ticket routing through a cheap hub, with the hidden costs priced in and the catch stated plainly (a missed connection is your problem, not the airline's).

It has two modes:

| Mode | Endpoint | Cost |
|---|---|---|
| **Live deals** | `POST /api/flights/refresh` + `GET /api/flights` | Free — Ryanair direct + local cache |
| **Route hacker** | `GET /api/trips/hacker-routes`, priced on demand via `POST /api/trips/fetch-price` | Free — assembled from stored timetables |
| **Extend search** (opt-in checkbox) | `POST /api/trips/self-connect` | **Billed** — fans out live SerpApi searches |

The guardrail is the endpoint choice, not a flag: with the checkbox unticked the billable endpoint is never called.

### Cached fare window

The free path reads Ryanair's cheapest-per-day feed, which only ever covers **today → today + 12** (13 days), one fare per route per day. Any default date past that window can never match, so the search defaults are pinned inside it and locked by `src/HackFlights.defaults.test.ts`.

Coverage is per **route pair**, not per origin: `SNN→AGP` and `SNN→STN` are populated, `SNN→BCN` is empty because Ryanair does not fly it. An empty result usually means "no such route", not "cache is cold".

## Primary navigation is two items

Home and Hack flights — deliberately. It was seven, one per half-finished module, which gave a first-time visitor seven ways to reach something that did not fully work and no way to tell which one was the point.

Nothing was deleted. Every other route still exists and still works, reachable from the footer and by direct link:

`/spots` · `/spots/:slug` · `/explore` · `/stay-guide` · `/trip-ledger` · `/ski-map` · `/ski-windows` · `/resorts/:slug` · `/island-hop` · `/profile`

`/discover`, `/planner` and `/assistant` redirect into `/explore`. Re-promoting a feature is one edit to `navItems` in `src/Main.tsx`.

## Running it

```bash
npm start
```

The app expects the Slumber backend on **`localhost:9090`**; `vite.config.ts` proxies `/api` and `/actuator` there in development. Without it the app still renders — every page works, and a banner says live data is unavailable — but no panel will have data in it.

```bash
npm test          # vitest, single run
npm run test:watch
npm run lint      # eslint, replaces the linting react-scripts used to do inside the build
npm run typecheck # tsc --noEmit, also run as the first half of `npm run build`
npm run build     # typecheck, then vite build into build/
npm run preview   # serve build/ locally with SPA fallback
```

## Observability

There is no vendor account, so no vendor is wired in. Everything up to the
vendor is: [`src/services/telemetry.ts`](src/services/telemetry.ts) is the single
path for error reports, structured logs and funnel events, correlated by a
per-tab session id and a per-request id.

- **Request ids** — every API call gets one, sent as `X-Request-Id` and carried
  on `ApiDiagnostics.requestId`, so a browser failure and a backend log line can
  be joined. The header is attached **only on same-origin calls**: a custom
  header makes a cross-origin request preflighted, and the backend has no CORS
  configuration to answer an `OPTIONS` with.
- **Errors** — render crashes (via `ErrorBoundary`), request failures, unhandled
  rejections and `window.onerror`, all through `captureError`.
- **Funnel** — `search_started → search_succeeded / search_failed →
  outbound_clicked`. The outbound click records whether the link was actually
  affiliate-tagged, which is the only way to notice that affiliate IDs were
  never set in a deploy.

Adding Sentry is a `registerSink` call; the shape is written out at the top of
`telemetry.ts`. Setting `REACT_APP_TELEMETRY_ENDPOINT` ships signals to a
collector via `sendBeacon` — **add that origin to `connect-src` in
`security-headers.js` at the same time**, or the CSP will block every report.

## Rate limiting

[`netlify/edge-functions/rate-limit.js`](netlify/edge-functions/rate-limit.js)
token-buckets expensive endpoints (self-connect, explore, AI, flight search) at
10/min per IP and everything else at 120/min, shedding load *before* the request
reaches the backend so an over-limit caller cannot burn third-party quota.

It is a per-isolate limiter, so the real ceiling across Netlify's regions is
higher than those numbers and it is not a substitute for platform-level rate
limiting or a WAF — enable those too. It exists because the realistic failure is
one runaway retry loop, not a determined attacker.

## Failure handling

Two pieces exist so an outage never looks like a broken product:

- **`src/components/ErrorBoundary.tsx`** — page-scoped inside the shell (a crash loses the page but keeps header, nav and footer, and navigating away clears it) and app-scoped around the providers as a last resort. Without it, React unmounts the whole tree on any render error and the visitor gets a white page.
- **`src/services/serviceStatus.ts`** — records the outcome of requests the app already makes (it does not poll) and distinguishes *you are offline* from *the backend is unreachable* from *the backend is erroring*. Before this, all three rendered as a panel that simply stayed empty forever.

Requests cancelled by the caller are excluded, so an unmount or a superseded search never triggers a false outage.

## Project structure

```text
src/
  components/        Reusable UI, cards, tabs, ErrorBoundary, ServiceStatusBanner
  data/              Airport metadata, curated destination and city data
  hooks/             useRouteSearch, useServiceStatus, useBackendHealth
  services/          api.ts (shared client), serviceStatus.ts, affiliates.ts, per-feature clients
  App.tsx            Routing
  Main.tsx           Shell: header, nav, status banner, footer
```

`src/services/api.ts` is the shared client: every request through it carries timeouts, diagnostics and service-status reporting. Services that build their own requests use `trackedFetch` from `serviceStatus.ts` for the same reason.

## Monetisation

Affiliate links, not display ads. `src/services/affiliates.ts` tags outbound booking links when the IDs are present and emits plain links when they are not — it never ships a blank or broken tracking parameter. Covered by `src/services/affiliates.test.ts`.

Set these after each program approves you (see `.env.production.example`):

```bash
REACT_APP_BOOKING_AID=
REACT_APP_SKYSCANNER_ID=
REACT_APP_KIWI_ID=
REACT_APP_GYG_PARTNER_ID=
REACT_APP_TRIPADVISOR_ID=
```

Values are trimmed, so a stray space in a deploy variable cannot silently break attribution.

## Deploying

> **The production backend is not currently deployed.** `REACT_APP_API_BASE` points at a Railway instance that returns a platform-level 404. The front end will build and serve fine, but every data panel will show the "live travel data is unavailable" banner until a backend is running.

Two workflows:

**[ci.yml](.github/workflows/ci.yml)** — every push to `main` and every pull
request. Installs with `npm ci` (so it can only pass against the tree in
`package-lock.json`), then runs lint, typecheck, the test suite, the
security-header drift check, a production build, `npm audit --omit=dev
--audit-level=high`, and finally the smoke test against the real built output.

**[deploy-gate.yml](.github/workflows/deploy-gate.yml)** — the promotion gate,
run manually against a *deployed* origin, because configuration is not evidence:
Netlify ignores a malformed `[[headers]]` block silently, and a CDN can rewrite
headers after the fact.

```bash
gh workflow run deploy-gate.yml -f url=https://your-site
```

Both checks also run locally:

```bash
npm run preview                                  # serves build/ with production headers
npm run smoke -- http://localhost:3002           # 15 checks: shell, headers, API, booking handoff
npm run headers:verify -- http://localhost:3002 --preview
```

Deploys themselves are still manual. What remains before the site can face the
public is tracked in **[docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md)** —
all of it external (credentials, a Sentry account, legal details, a WAF, and the
beta-scope decisions).

`npm run readiness` reads configuration completeness out of a built bundle, or
out of a live deployment with a URL. It is a different question from the smoke
test: a deploy with no affiliate IDs, no map key and no named legal controller
serves perfectly and passes every smoke check, while earning nothing, using a
basemap not licensed for production, and collecting data without a controller.

**Netlify (config already in `netlify.toml`):**

```bash
npm run build
```

Then drag `build/` to https://app.netlify.com/drop, or connect the repo in the Netlify UI.

`netlify.toml` sets the SPA fallback and cache headers. The **security headers,
including the CSP, are generated** — [security-headers.js](security-headers.js) is
the single source of truth, and `npm run headers:sync` renders it into
`netlify.toml` and `nginx-security-headers.conf`. CI fails if they drift. `netlify/edge-functions/api-proxy.js` forwards `/api/*` and `/actuator/*` to the backend server-side, stripping `Origin` — the backend has no CORS configuration, so a plain CDN redirect would be rejected with 403.

**Pointing at a different backend:** copy `.env.production.example` to `.env.production`, set `REACT_APP_API_BASE`, rebuild. The Railway host is also hardcoded as a fallback in `src/services/api.ts` and in the edge function — change all three together.

**Maps:** set `REACT_APP_MAPTILER_KEY` for production. Without it the map falls back to MapLibre's demo style; OpenStreetMap's raster tile server forbids production load.

## Session auth

Server-side session cookie (`JSESSIONID`), not JWT.

1. `POST /api/accounts/login` with `credentials: 'include'`
2. only after HTTP 200, `GET /api/accounts/profile`
3. on boot, `GET /api/accounts/profile` restores the session
4. on `401`/`403` the client clears auth state, shows `Session expired, please sign in again.` and redirects to `/profile`

In development the API client logs request URL, credentials mode and response status for login and profile calls.

If a custom domain is added, its origin has to go into the backend's `ALLOWED_ORIGINS`.

## Notes

- Built with **Vite 8** and tested with **Vitest 4**. Create React App was
  dropped in August 2026: `react-scripts@5` is unmaintained and dragged 3
  critical and 35 high advisories into the *production* dependency tree. The
  tree now audits clean.
- Environment variables keep the `REACT_APP_` prefix (`envPrefix` in
  `vite.config.ts`) so nothing has to be renamed in Netlify or Railway, but they
  are read through `src/services/env.ts` rather than `process.env` — there is no
  `process` global in a Vite bundle.
- Cache is persisted in `localStorage` under `webagency.cache`.
- `src/Home.tsx` and `src/SearchSpecificFlight.tsx` are not routed — `Home.tsx` is imported only by `SearchSpecificFlight.tsx`, which nothing imports. They are kept, not wired.
- Map data © OpenStreetMap contributors (ODbL); attribution in the footer is a licence condition, not a courtesy.
- **The Privacy, Terms and Cookies pages are drafted, not cleared.**
  [`src/legal/legalContent.ts`](src/legal/legalContent.ts) describes what the code
  actually does — the storage keys are real, the third parties are the ones the
  app really contacts. But two `TODO(operator)` fields are unfilled: the legal
  entity and a postal address (GDPR Art. 13 requires a named controller), and the
  governing jurisdiction for the Terms. The pages render a visible warning until
  those are set. Have a lawyer read them before collecting data from the public.
- A `REACT_APP_MAPTILER_KEY` is bundled into client JavaScript by nature — that is
  unavoidable for a browser map. Restrict the key to your domain in MapTiler's
  console rather than treating it as a secret.

# Shareable preview backed by the local backend

Railway is deliberately unpaid, so a plain Netlify deploy serves the UI with no
API behind it. This wires one up for as long as the script runs:

```
browser ─▶ https://local--travelhub-vaimar.netlify.app/api/…
        ─▶ netlify/edge-functions/api-proxy.js   same-origin (no CORS), adds X-Preview-Token
        ─▶ https://<random>.trycloudflare.com    cloudflared quick tunnel
        ─▶ 127.0.0.1:9099  preview-gateway.mjs   token check + path allowlist
        ─▶ http://localhost:9090                 Spring Boot on this laptop
```

## Run it

```bash
npm run preview:tunnel
```

It checks `localhost:9090` is healthy, starts the gateway, opens the tunnel,
proves the tunnel refuses an unauthenticated request, points the edge proxy at
it, builds, deploys to the `local` alias, and smoke-tests the result before
printing the URL. `Ctrl-C` closes the tunnel, which is what takes the API back
down.

Flags: `--alias <name>` (default `local`) · `--check-and-close` to verify and
tear down immediately instead of staying up · `--skip-build` to redeploy the
existing `build/` · `--keep-env` to leave the Netlify variables set ·
`--gateway-port <n>` (default 9099).

## Why the tunnel does not point at 9090

`SecurityConfig` ends in `anyRequest().permitAll()`, so a tunnel straight to the
backend would publish Swagger UI, `/v3/api-docs`, `/h2-console` and every
mutating endpoint to anyone who found the hostname. Measured directly:
`/swagger-ui.html` → 302 and `/v3/api-docs` → 200 on 9090, both → 404 through
the gateway.

`scripts/preview-gateway.mjs` closes that with two independent controls:

- **A shared secret.** Only requests carrying `X-Preview-Token` pass. The edge
  function adds it server-side, so it never reaches a browser and is not in the
  published bundle. A fresh token is generated per run and unset on teardown.
- **A path allowlist.** Even with the token, only `/api/**` and
  `/actuator/health` are proxied.

Failures get a bare `404`, never a `401`: a scanner that stumbles onto the
hostname learns nothing about what is behind it. The run aborts before
publishing if an unauthenticated request ever succeeds.

Backing that up, `application.yml` in slumber now pins actuator to
`health,info` with `show-details: never`, so the sensitive actuator endpoints
are off the web even when the backend is reached some other way. **That change
needs a backend restart to take effect.**

## The two build-level pieces

**`BACKEND_ORIGIN`.** `api-proxy.js` forwards to Railway unless this site
variable is set. The value is bound when the deploy is created, so it must be
set *before* deploying — and unsetting it afterwards does not redirect an
existing deploy, which keeps pointing at the (now dead) tunnel until something
is deployed over it.

**`REACT_APP_API_BASE=/`.** Makes `API_BASE` resolve to `''`, so the app calls
same-origin `/api/…`. Two things fall out: the tunnel hostname never appears in
the published bundle, and the CSP needs no change because `connect-src 'self'`
already covers it. A shell variable outranks the gitignored
`.env.production.local`, so the build does not pick up the `localhost:9090` in
that file — verified by grepping the bundle for the inlined value.

## Two traps worth knowing

**Do not resolve the tunnel hostname too early.** A quick-tunnel hostname does
not exist for the first few seconds, and the macOS resolver caches that
NXDOMAIN for about a minute. The first lookup, if it happens too early, poisons
every later one: the run fails with `ENOTFOUND` for 60+ seconds while
`dig @1.1.1.1` says the record is fine. The script waits on a dedicated
`Resolver` pointed at 1.1.1.1, which leaves the system resolver untouched until
the record is real.

**Do not set `PREVIEW_TOKEN` as a Netlify secret.** With `--secret` the value
never reached the edge runtime — every proxied call arrived at the gateway with
no token and was 404'd, giving a green UI and a uniformly 404 API. A plain
variable works. (`--secret` is also rejected outright without an explicit
`--context`.)

## Before you share the link

The tunnel is token-gated and path-restricted, but it is still your laptop on
the public internet. Keep sessions short and close the tunnel when you are done
— `--check-and-close` does that automatically.

The deploy outlives the tunnel: the alias keeps serving the UI, with a dead API,
until it is replaced or deleted.

```bash
netlify deploy --dir build --alias local   # replace it
netlify api deleteDeploy --data '{"deploy_id":"<id>"}'   # or remove it
```

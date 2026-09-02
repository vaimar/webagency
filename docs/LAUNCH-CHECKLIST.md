# Launch checklist

Everything left before TravelHub can face the public. The code side is done and
green; every item below needs an account, a credential, a legal decision or a
person's name — none of which live in this repository.

Verify with:

```bash
npm run build && npm run readiness          # config completeness, local build
gh workflow run deploy-gate.yml -f url=https://your-site   # headers + smoke + readiness, live
```

`npm run readiness` currently reports **5 blockers**, which are items 3, 5 and 6
below. That is expected until they are done.

---

## 1. Infrastructure

- [ ] Backend, database and worker/cache deployed with production credentials
- [ ] Payment configured on the hosting account

Nothing in this repo can verify these; everything else depends on them.
Related: the Railway backend is [intentionally unpaid today](../README.md).

## 2. Backend session cookies and CORS

Lives in the **slumber** repo, not here.

- [ ] `Secure` on the session cookie
- [ ] `HttpOnly` on the session cookie
- [ ] `SameSite` set deliberately — `Lax` works for this app; `None` would
      require `Secure` and is only needed for cross-site embedding
- [ ] Production `ALLOWED_ORIGINS` includes the real custom domain

**Do this before the frontend deploy.** A cookie that is wrong here works
locally and fails on the real domain, and it presents as a frontend bug.

## 3. Error reporting

- [ ] Sentry account created, DSN obtained
- [ ] `REACT_APP_SENTRY_DSN` set in Netlify
- [ ] Sentry's ingest origin added to `connect-src` in `security-headers.js`
- [ ] `npm run headers:sync` run and the result committed

**Do all four in one change.** A DSN without the CSP origin means reports are
silently dropped — no console error, no data, nothing that looks wrong.
The `registerSink` call to add is written out at the top of
[`src/services/telemetry.ts`](../src/services/telemetry.ts).

## 4. Platform rate limiting

- [ ] WAF / rate limiting enabled at the hosting platform

Goes *in front of* [`netlify/edge-functions/rate-limit.js`](../netlify/edge-functions/rate-limit.js),
not instead of it: the edge bucket sheds load before the backend is touched,
which is what protects third-party API quota. The edge limiter is per-isolate
and was never a WAF.

## 5. Legal

- [ ] Controller name and postal address filled into `OPERATOR` in
      [`src/legal/legalContent.ts`](../src/legal/legalContent.ts)
- [ ] Governing jurisdiction set for the Terms
- [ ] Privacy, Terms and Cookies reviewed by a lawyer

GDPR Art. 13 requires a named controller before collecting personal data. Until
`postalAddress` is set the pages render a visible gap notice, and
`npm run readiness` reports a blocker.

The prose is written to be checkable against the source — real storage keys,
real third parties — but it has not been reviewed by anyone qualified.

## 6. Production configuration

Set in Netlify's environment, then confirm with `npm run readiness -- <url>`:

- [ ] `REACT_APP_API_BASE` — the real backend origin, `https`, not localhost
- [ ] `REACT_APP_MAPTILER_KEY` — without it the map falls back to a demo
      basemap that is not licensed for production traffic. Restrict the key to
      your domain in MapTiler's console; it is necessarily visible in client JS
- [ ] Affiliate IDs — `REACT_APP_BOOKING_AID`, `REACT_APP_SKYSCANNER_ID`,
      `REACT_APP_KIWI_ID`, `REACT_APP_GYG_PARTNER_ID`, `REACT_APP_TRIPADVISOR_ID`.
      Unset means every booking works and none is attributed
- [ ] Custom domain DNS
- [ ] That domain added to the backend's allowed origins (see item 2)

## 7. Beta scope

The decisions, with the answers this repo already implies where it has one.

| Decision | Status |
| --- | --- |
| First departure region | **Already Dublin.** `LANDING_ORIGIN = 'DUB'` in `src/Home.tsx`, and `useFlightDestinations` falls back to `DUB`. Changing it is one constant plus three copy strings. |
| Support owner | **Unassigned.** The footer "Report a wrong price" link goes to `pinz92@gmail.com` with a prefilled subject and page-reference prompts. Someone has to actually read it. |
| Uptime threshold | Unset. The deploy-gate workflow is the synthetic check — run it on a schedule. |
| Search success rate | Unset. Measure `funnel.search_succeeded ÷ funnel.search_started`. Note a zero-result search fires `succeeded` with `resultCount: 0` deliberately — a backend that answers and one that finds nothing are different failures. |
| Outbound conversion | Unset. Measure `funnel.outbound_clicked ÷ funnel.results_shown`. |
| Attribution health | Share of `funnel.outbound_clicked` with `affiliateTagged: true`. **If this is 0 after launch, the affiliate IDs never reached the deploy** and nothing else will tell you. |
| Rollback owner | **Unassigned.** Netlify keeps previous deploys; rolling back is one click, but someone has to own the decision. |

The funnel event names above are real and already firing — see
[`src/services/telemetry.ts`](../src/services/telemetry.ts). Define the
thresholds against those names so they are measurable on day one rather than
retrofitted.

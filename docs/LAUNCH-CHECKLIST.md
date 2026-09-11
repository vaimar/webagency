# Launch checklist

Everything left before TravelHub can face the public. Items 1-7 need an
account, a credential, a legal decision or a person's name — none of which live
in this repository. Items 8 and 9 are the exceptions: 8 is code that has not
been written, and 9 is reading you have not done.

What the product is allowed to *claim* is a separate document:
[POSITIONING.md](./POSITIONING.md). Read it before writing user-facing copy;
its rules are enforced by
[`src/copyStandards.test.ts`](../src/copyStandards.test.ts).

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

## 8. Beta framing and access gate

The only item on this list that is unwritten code rather than a decision.

- [x] Visible beta badge, not dismissible, on every route in the beta list —
      `brand-mark__beta` in [`src/Main.tsx`](../src/Main.tsx) reads "Beta · spot
      discovery" and carries a tooltip that already says flight pricing is
      unverified. The footer adds a beta line and a wrong-price report link.
- [x] Coverage disclaimer on the spot flights panel — the schedule tier in
      [`src/SpotDetailPage.tsx`](../src/SpotDetailPage.tsx) states the probe
      date, that no fare was checked, and the self-transfer risk.
- [ ] Coverage disclaimer on the Hack Flights route cards themselves
- [ ] Access gate for the private-beta stage

The beta list is `/`, `/spots`, `/spots/:slug` and the legal pages — the
product is spots-led, with Route Hacker as the engine underneath. The primary
navigation in [`src/Main.tsx`](../src/Main.tsx) already reflects this and
already excludes Hack Flights; `src/App.tsx` still *registers* fourteen routes,
which is a different question — an unlinked route is still a reachable URL.
Decide whether that matters before opening access.

**The access gate is not small, and nothing in this repo implements one.** No
password wall, no waitlist, no invite check — `netlify.toml` has no redirect
rule for it and there is no auth in front of the site. Netlify's built-in
password protection is a paid-plan feature, so "keep it private" currently
means "do not deploy it", which is the state the product is in today and the
reason that state is stable rather than a problem. Decide between:

- staying undeployed (free, and honest — this is the current position)
- Netlify password protection (paid plan, one setting, no code)
- a build-time shared-secret gate in an edge function (free, weak, ~40 lines
  next to [`netlify/edge-functions/rate-limit.js`](../netlify/edge-functions/rate-limit.js))

Do not treat this as a copy change. It is the gate the whole private-beta stage
rests on.

## 9. Data-source terms of use

- [ ] Each fare and content source's terms re-read against *commercial, public*
      use, with the answer written down per source
- [ ] Any source that does not survive that reading is removed from the public
      build, or replaced with a licensed feed

Data gathered under a personal, low-volume posture is not automatically
licensed for a public site that carries affiliate tags on its outbound links.
This is a different question from privacy and terms pages (item 5), it is not
answered by any of them, and it is the one item here that can invalidate the
product rather than delay it.

Do this before item 1. It is free, it is reading, and its answer changes what
you would be paying a hosting bill for.

## 10. Catalogue completeness — the spot launch gate

A place-led product ships when its places answer the question. Four facts per
spot, and they are the gate:

- [ ] **Opening season** — sending someone to a closed park is the worst
      failure this product can have
- [ ] **Operator tariff** — without a price the spot cannot enter any total
- [ ] **Source URL** for that tariff
- [ ] **Observed date** for that tariff, inside the freshness window

These are not new rules. They are already the decision checks in
[`spot-readiness.js`](../spot-readiness.js), which both the badge in the UI and
`scripts/spot-coverage-audit.mjs` read from — this item only states that they
are what gates the launch, so the number stops being an internal score and
starts being a release criterion.

### Where the catalogue actually stands — measured 2026-09-07

Run it yourself; it is two commands and they take a few minutes:

```bash
npm run audit:reachability                     # measures the reachable set
eval "$(npm run --silent audit:reachability -- --print-audit-command)"   # feeds it to the audit
```

From DUB, sampling three dates across a 12-day window:

| | |
| --- | --- |
| Catalogue | 132 spots, 122 with a slug |
| **Trip-ready** | **15** |
| Needs verification | 107 |
| With a fare-covered way in | **122 of 122** |

**Reachability is not the gap.** Every audited spot has at least one airport the
schedule graph can reach from Dublin — 65 of the 85 airports the catalogue
names, 31 of them with a direct flight. Any plan that starts by adding routes or
buying fare data is solving a problem this catalogue does not have.

Those two figures are stable across consecutive runs, which they were not at
first: transient probe failures were being counted as "no route", and the
direct-flight count swung between 31 and 36 on an unchanged catalogue. The probe
now retries once and reports an airport whose samples all failed as *unmeasured*
rather than folding it into either side. A number that moves when nothing moved
is not a metric, and this one is quoted in a release decision.

What is missing, across the 122:

| Missing fact | Spots |
| --- | --- |
| Opening season | 102 |
| Operator tariff | 84 |
| Tariff source and date | 84 |
| Recently-checked tariff | 84 |
| Booking handoff | 25 |

**23 spots are one fact from trip-ready, and for all 23 that fact is the opening
season.** Filling one field on those 23 takes the catalogue from 15 to 38. The
tariff triple moves together — the 84 are spots with no sourced price at all,
not spots with a price missing its paperwork.

Two cheap wins sit next to this and are not blocked by it: the 10 VENUE_READY
spots with no slug cannot be scored or reached at all until someone gives them
one, and `--samples` on the reachability probe defaults to 3, which errs toward
calling a Tuesday-only route unreachable.

### Do not let a model invent any of these four

The pipeline that fills these fields is specified in
[EXTRACTION-CONTRACT.md](./EXTRACTION-CONTRACT.md) — allowed sources, output
schema, hard reject rules, the confidence rubric and the go/no-go gate against
the 15 spots already verified. Note the blocker recorded there: the season
fields have nowhere to store provenance today, and the migration has an order
that must be followed or trip-ready drops to zero.

The extractor may report only what a named page says, and the page is stored
with the answer — that is what makes `sourceUrl` and `observedAt` mandatory
rather than nice to have. A spot whose facts cannot be sourced stays
`needs-verification`, which is where it already is, so the failure mode is
standing still rather than publishing a wrong opening date for somebody's real
business. This is the same rule the product already applies to fares: an absent
fact is reported absent.

## 11. The shortest honest path

The gates above read as a wall. They are not one — most of them are already
done or are one decision each. What actually blocks a **private** beta:

| Blocker | Cost | Item |
| --- | --- | --- |
| Provider terms unread | An afternoon | 9 |
| Beta badge + disclaimers | A few hours | 8 |
| Access gate decision | One decision; £0 if the answer is "stay undeployed" | 8 |
| Controller name + postal address | One decision | 5 |
| Opening season on the 23 one-away spots | An afternoon; takes trip-ready 15 → 38 | 10 |

Spot imagery is not on that list, deliberately. Most spots render a generated
fallback rather than a photograph, which a place-led product shows first — but
invited testers tolerate a placeholder, and public visitors do not. It is a
gate on the public stage and a known rough edge in the private one. Do not let
it block an invite.

That is the whole list. Everything else on this page — Sentry, WAF, custom
domain, affiliate IDs, uptime thresholds — gates the *public* stage, not the
private one, and none of it matters until someone other than you can load the
site.

The public stage has exactly one hard gate beyond those four: a data-cost
number the affiliate revenue can plausibly cover. That is a spend decision, and
it is the honest reason to stay private rather than a failure to ship. See the
data-cost rule in [POSITIONING.md](./POSITIONING.md).

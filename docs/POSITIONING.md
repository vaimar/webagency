# Positioning and copy standards

What this product is allowed to claim, and how a price is allowed to be
described. This is a standards document, not a checklist — the operational
work lives in [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md), and the copy rules
below are enforced by
[`src/copyStandards.test.ts`](../src/copyStandards.test.ts) on every CI run.

---

## The position

> This is a beta route-planning and flight-combination tool, not a full live
> fare engine. It is useful for exploring valid combinations and pricing
> signals, but coverage and price completeness vary by route, date, and
> provider availability. We are not promising complete or guaranteed live
> pricing across all routes.

Everything else in this file follows from that paragraph. If a change makes
that statement untrue in either direction — overclaiming, or underselling work
that is genuinely verified — the statement is what gets updated, deliberately,
not the copy that drifted away from it.

## Product boundary

Distinct from, and not to be described as:

- a full flight search engine
- an OTA or booking product
- a general travel marketplace
- "all flights, all markets, all prices" positioning

It is a route-combination and planning tool: a schedule-aware path finder with
pricing signals and stated caveats.

### What we are not competing on

Comprehensive fare search is conceded, deliberately and permanently. Google
Flights and Skyscanner have direct carrier feeds, GDS access and a data budget
this product will not have. Measuring against them is the losing comparison,
and it is the comparison that made earlier versions of the release criteria
read as unreachable.

Self-transfer routing is conceded too. That is new, and it cost this document
its best argument — see below.

What is left is two things, not three:

- **Arrival at a place, not an airport.** They index airports. This indexes a
  spot with coordinates and a list of ways in, for a user whose question was
  never "DUB to NCE". Nothing in a metasearch result set knows what a cable
  park is.
- **Honest total cost.** Fare plus bags plus extras, shown up front, each
  component labelled exact or estimated. Verified rather than assumed: Kayak's
  own results footer states that its prices are per person and *do not include
  baggage fees*. See the honest-total work in
  [`src/components/HackerRouteCard.tsx`](../src/components/HackerRouteCard.tsx).

The competitor for a spot page is a forum thread and a map pin. Position
against that.

### Self-transfer is not an opening — measured, 2026-09-06

This document used to claim that the majors avoid unprotected self-transfers
for liability reasons, and called that "a standing opening rather than a
temporary lead". **That is false.** It was never checked before it was written
down, and two subsequent strategy arguments were built on top of it.

Kayak sells self-transfers, brands the mechanism ("Correspondance autonome"),
and prices every one. Measured on `SNN → IBZ`, 2026-09-27, one stop:

| | Kayak | Route Hacker |
| --- | --- | --- |
| Self-transfer itineraries | 28, labelled as such | 14 |
| Results carrying a price | 48 | 0 — all `SCHEDULE_ONLY` |
| Cheapest shown | EUR 87 (Ryanair, 7h45) | none |

It is not finding *different* routes. It is finding a superset. Kayak's
`11:50 SNN → 18:40 IBZ, 5h50, Ryanair + Iberia Express, EUR 155` is the same
itinerary as this engine's `11:50 via MAD, 5h45`; its `10:50, 6h55, Ryanair +
Vueling, EUR 124` is the same as the `10:50 via ALC`. Same combinations, priced,
plus roughly twice as many again.

Two things follow, and they point in opposite directions.

**The flight engine is not the moat.** Any positioning that rests on finding
combinations others will not find is dead on arrival, and any release criterion
phrased as "beat the majors on routing" is unreachable for the same reason
comprehensive fare search is. Do not rebuild that argument in another form.

**The decision it was meant to justify was right anyway.** Spots-led with the
routing underneath does not depend on the routing being unique — see
[Which surface ships](#which-surface-ships). A user who has arrived at a spot
page and wants to know whether they can get there is well served by an engine
that finds the same fourteen itineraries Kayak would, because they were never
going to open Kayak with an airport code in mind. The engine has to be *good
enough to answer the question*, not better than metasearch.

Re-check this before it is quoted again. It is one search on one route on one
date, taken from the live site; it is strong enough to kill a claim and not
strong enough to found one.

### The name is a claim, at feature scale

"Route Hacker" promises beating the system before any copy loads. The copy
standards below cannot rescue a name that overclaims, so it needs a defence.
The defence used to be that the feature finds combinations no one else returns.
It does not: Kayak returns them, and more of them.

What is left is narrower and still true. The feature finds combinations no
single **carrier's** search will return — ryanair.com will not sell you Ryanair
into Madrid and Vueling onward — and it states the total cost of one, bags and
transfer included, which the metasearch result beside it does not. Hold the name
to *that*, and it stays honest. Held to anything about coverage, it does not.

Note also that "Hacker Fares" is Kayak's own branded feature name for splitting
a round trip across two carriers. The overlap is not a legal problem at private
beta scale and it is not a reason to rename today, but it is a reason not to
build marketing around the word.

The stakes here shrank when the spin-out was dropped. "Route Hacker" is now a
feature label inside a spots product, seen by someone who arrived at a place
and asked how to get there — not a standalone brand that has to carry a
positioning on its own. A feature may promise a mechanism. A product name would
have had to promise an outcome.

---

## Price provenance

Every fare shown carries a state. These are the only five, and one of them is
always true:

| State | Meaning |
| --- | --- |
| **Exact** | A live fare fetched for these exact flights, from the provider, now. |
| **Estimate** | Derived from schedule data or an adjacent fare, not quoted for this itinerary. |
| **Partial** | Some legs priced, some not. The total is a floor, not a price. |
| **Unavailable** | No fare data for this route or date. The route may still exist. |
| **Manual check** | Priced only after the user asks for it, or requires confirmation on the provider's site. |

### Age is a sixth axis, not a sixth state

A cached observed fare from three weeks ago is *exact* and useless. Provenance
says how a number was derived; it does not say when. Any surface that shows a
non-live fare shows its age alongside its state — a stale exact fare is more
misleading than an honest estimate, because it invites more trust.

Ryanair's feed is the worked example: it publishes one cheapest fare per day
per route, not a fare per flight, which is why
[`src/components/HackerRouteCard.tsx`](../src/components/HackerRouteCard.tsx)
carries a floor caveat rather than a price. That is the standard, not an
exception to it.

---

## Copy standards

### Allowed

- beta route-planning tool
- schedule-based route discovery
- route combinations built from available fares
- partial or estimated pricing
- supported markets and route coverage vary
- some results may require confirmation

### Not allowed

Absolute price claims, coverage claims, and finality claims:

- "guaranteed cheapest", "best price", "lowest fare", "price match", "unbeatable"
- "all flights", "every route in the market", "complete coverage", "all markets"
- "fully verified", "100% accurate", "book instantly"

The banned patterns are encoded in
[`src/copyStandards.test.ts`](../src/copyStandards.test.ts) and fail the build.
A phrase that genuinely needs an exception goes in that file's `ALLOWLIST` with
a written reason — which is the point: the exception becomes reviewable instead
of invisible.

A qualified claim is not an absolute one. "across every airline it knows"
([`src/HackFlights.tsx`](../src/HackFlights.tsx)) is fine — the qualifier is
doing real work. "across every airline" would not be.

### Trust badges

The three badges on the home page deliberately replace the industry-standard
"Secure Booking / Best Price Guarantee / 24/7 Support" set, because this
product guarantees no price and staffs no support desk. See the comment at
[`src/Main.tsx`](../src/Main.tsx). Do not restore the originals.

---

## The data-cost rule

The product may not be launched on the assumption that future traffic will pay
for the fare data it needs.

Launch publicly only if the business has a credible path to cover the data cost
at the expected usage level. If it does not, the product stays private or
invite-limited. This is a spend decision, not a feature decision, and no amount
of UI honesty substitutes for it.

Conceding comprehensive fare search lowers the ceiling, so it has to lower the
spend too. A niche product does not get to carry a broad product's data bill on
the argument that its users are better qualified. Price the feed against the
traffic a spot catalogue can realistically draw, not against the traffic a
flight search engine would need.

The revenue side already exists — outbound links carry affiliate tags and the
disclosure is written ([`src/legal/legalContent.ts`](../src/legal/legalContent.ts)) —
so the question is measurable rather than hypothetical: track
`funnel.outbound_clicked` with `affiliateTagged: true` against the monthly data
spend, and the answer stops being a guess after the first month of real traffic.

### Provider terms are part of this

Fare data obtained under a personal, low-volume, non-commercial posture does
not automatically survive a public deployment that earns commission. Each
source's terms are re-read against *commercial, public* use before Stage 2, not
after. See item 9 in [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md).

---

## Which surface ships

**Decided: spots-led, with Route Hacker as the engine underneath.**

This was already the decision in code before it was written down here. The
navigation comment in [`src/Main.tsx`](../src/Main.tsx) excludes Hack Flights
from the primary nav deliberately, and gives the sharper reason: *the fare
provider cannot state which dates its prices apply to, so no flight-to-park
total can be stood behind, and promoting a route tool to primary navigation
implies a pricing promise the data cannot support.* The header badge reads
"Beta · spot discovery" for the same reason. Treat that comment as the origin of
this section rather than the other way round.

The product is the place. The flight is how you get to it. A user arrives at a
spot page asking "can I reach this, roughly what does it cost", and the fare
answers that question rather than being the question.

There is no `flighthacker.eu` spin-out. Route Hacker is a feature of this
product, not a second product, and nothing needs to stay extractable for it.

### Why this is the honest framing, not just the convenient one

Standalone, the fare *is* the product, so an estimate or a partial price means
the product is broken. Spot-led, the fare is one way in among several, and
"roughly EUR 80, one self-transfer, confirm before booking" is a genuinely
useful answer. The five provenance states above stop being apologies and become
information. That is most of the release risk gone, by scoping rather than by
building anything.

It also matches where the content actually is. Flight-led discovery from Dublin
measured zero trip-ready itineraries; the spot catalogue is real. Leading with
the end of the funnel that has content is the only version of this that works.

This section now carries more weight than it did when it was written. It used
to be one of two arguments for the spots-led decision, the other being that the
routing engine found things nobody else found. That second argument is gone —
see [Self-transfer is not an opening](#self-transfer-is-not-an-opening--measured-2026-09-06).
What is left is this one, and it is the sturdier of the two anyway: it rests on
where the content is, which is measurable and ours, rather than on what a
competitor has chosen not to build, which is neither.

### What that commits us to

- **The beta route list is explicit.** `/`, `/spots`, `/spots/:slug` and the
  legal pages. Explore, stay-guide, trip-ledger, ski-map, ski-windows, resorts
  and island-hop stay out of the beta navigation — see
  [`src/App.tsx`](../src/App.tsx), which currently registers all fourteen. If
  this is not decided explicitly, "launch the spots product" quietly means
  launching every one of them, and each then has to meet the copy standards
  above.
- **Spot imagery is now a launch-quality problem.** Most spots render a
  generated fallback rather than a photograph. A standalone flight product
  would never have cared; a place-led product shows an image first.
- **The beta framing has to reach spot pages**, not only the route results.
  See item 8 in [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md).
- **Provider terms carry more weight, not less.** Fares now appear across a
  consumer-facing surface rather than one tool page. Same reading, higher
  stakes — item 9.

### The engine swap

[`src/SpotDetailPage.tsx`](../src/SpotDetailPage.tsx) already has the spine:
nearby airports, a flights tab, and a `FlightTeaser`. The teaser calls
`searchFlights` — the cached Ryanair path — so it inherits that path's dead
end whenever no cached fare exists for the pair. Route Hacker
(`src/services/hackerRoutes.ts`, `src/services/hackerAutoPrice.ts`) is imported
today only by `HackFlights` and the trip-explore components.

Route the teaser through Route Hacker as a service call. The extractability
argument for keeping UI and engine separate is gone, but the maintenance one is
not: a spot page that imports `HackerRouteCard` inherits a fare-shaped card
into a place-shaped context, and the two surfaces want different amounts of
detail.

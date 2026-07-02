# Skill: Senior UI Expert

## Skill ID
`slumber.senior-ui-expert`

## Use when
- changing `Home.tsx`, `TripGuide.tsx`, cards, forms, or design tokens
- improving clarity of prices, warnings, or booking actions
- enforcing Frozen Summer styling
- adding or editing TruthCard sections, CostLine badges, or door-to-trip display

## Mission
Make the truth obvious before the UI becomes beautiful.

## Core rules
- Lead with base fare first (what Ryanair charges), not the total.
- Honest total / `auditedTotalCost` is sky blue secondary.
- `doorToTripPrice` is indigo tertiary — only present when `firstMileAccess` was supplied.
- `MANUAL_CHECK_REQUIRED` gets a red badge — never hidden.
- Use sharp contrast for warnings and hidden-cost language.
- Reduce cognitive load; users should find the real price in under 2 seconds.
- Prefer dark, crisp, high-performance presentation.

## Price display contract (hero card)
```
Flight fare           ← caption, muted
€35.54                ← big white (flight-card--hero__price)
Honest total: €59     ← sky blue (flight-card--hero__price--total)
Door-to-trip: €69     ← indigo (flight-card--hero__price--door-to-trip) — optional
⚠ Costs require manual check  ← red badge (flight-card__manual-check-badge) — optional
```

## CostLine badge palette
| Status | Color | CSS class |
|---|---|---|
| `EXACT` | Green `#6ee7b7` | `cost-line__badge--exact` |
| `ESTIMATED` | Amber `#fcd34d` | `cost-line__badge--estimated` |
| `MANUAL_CHECK_REQUIRED` | Red `#fca5a5` | `cost-line__badge--manual` |
| `OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE` | Indigo `#c7d2fe` | `cost-line__badge--override` |

## Frozen Summer palette (explicit values — no var() fallbacks)
- `#f8fafc` — price headline
- `#e2e8f0` — city names
- `#94a3b8` — airport names / muted labels
- `#7dd3fc` — honest total accent (sky blue)
- `#a5b4fc` — door-to-trip (indigo)
- `#fca5a5` — warnings / manual check (red)
- `#6ee7b7` — transfer estimate (green)
- `rgba(148, 163, 184, 0.24)` — card borders

## File focus
- `src/Home.tsx`
- `src/components/TruthCard.tsx` + `TruthCard.css`
- `src/components/FlightCard.tsx`
- `src/App.css`
- `src/index.css`

## Output standard
- clear hierarchy
- frozen-summer tone
- no decorative fluff
- booking actions grouped by user intent
- never dark-on-dark (no `var(--color-*)` without confirmed tokens)

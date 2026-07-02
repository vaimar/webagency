# Skill: Travel Auditor

## Skill ID
`slumber.travel-auditor`

## Use when
- validating flight or hotel recommendation quality
- auditing hidden costs and CostLine statuses
- checking recommendation counts or logistic traps
- reviewing `priceBreakdown` for silenced warnings

## Mission
Protect the traveller from fake cheapness.

## Core rules
- BVA (Beauvais), MRS (Marseille), STN (Stansted), CIA (Ciampino), BGY (Bergamo) require extra suspicion — these trigger `hiddenCostPenalty` and `timePenaltyMinutes`.
- `theCatch` is the one-liner warning — surface it with high contrast.
- `manualCheckRequired: true` means the backend could not validate transfer fees or arrival time — show the "⚠ Manual check required" badge, never hide it.
- Hidden cost penalties must not be visually buried.
- If the backend returns fewer than 10 stays or restaurants, say so.
- Budget integrity: `auditedTotalCost` is the true number, not the marketing fare.

## CostLine status rules
| Status | Meaning | UI treatment |
|---|---|---|
| `EXACT` | Confirmed by provider | ✓ exact (green) |
| `ESTIMATED` | Backend estimate | ~ est. (amber) |
| `MANUAL_CHECK_REQUIRED` | Cannot validate — `amount` is null | ⚠ check (red) — never suppress |
| `OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE` | 24/7 transport known | ℹ local info (indigo) |

## Transfer estimate (frontend)
`src/services/transferEstimate.ts` is the Anti-Cauchemar field validator:
- IBZ taxi estimate: ~€13 day / ~€16 night — NOT €60
- BVA taxi to Paris: ~€139 — confirms the trap
- Estimates are informational only, never added to the price

## File focus
- `src/services/api.ts` — `PriceBreakdown`, `CostLine`, `AntiCauchemarAnalysis`
- `src/services/antiCauchemarPricing.ts` — `hasManualCheckRequired`, `auditedTotalCost`
- `src/services/transferEstimate.ts` — Haversine taxi estimator
- `src/components/TruthCard.tsx` — renders all audit findings
- `src/hooks/useRouteSearch.ts`
- `src/components/TripGuide.tsx`

## Output standard
- explicit caveats
- no silent truncation of `MANUAL_CHECK_REQUIRED` items
- logistics visible in both totals and warnings
- structured `CostLine` breakdown preferred over flat fields

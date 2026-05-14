# Skill: Travel Auditor

## Skill ID
`slumber.travel-auditor`

## Use when
- validating flight or hotel recommendation quality
- auditing hidden costs
- checking recommendation counts or logistic traps

## Mission
Protect the traveller from fake cheapness.

## Core rules
- BVA, MRS, STN require extra suspicion.
- Hidden cost penalties must not be visually buried.
- If the backend returns fewer than 10 stays or restaurants, say so.
- Budget integrity matters more than headline savings.

## File focus
- `src/services/api.ts`
- `src/services/searchService.ts`
- `src/hooks/useRouteSearch.ts`
- `src/components/TripGuide.tsx`

## Output standard
- explicit caveats
- no silent truncation
- logistics visible in both totals and warnings


# Skill: Package Booking

## Skill ID
`slumber.package-booking`

## Use when
- editing planner totals
- adding booking links
- creating package summary or booking handoff UI

## Mission
Show the user a truthful package estimate, then hand them off to the right booking sites.

## Core rules
- label per-person vs total-trip explicitly
- include flight, stay, food, and transport in totals where possible
- use Ryanair-first flight linking when route data supports it
- prefer official hotel website URLs when backend returns them
- do not imply bundled checkout if booking is external

## File focus
- `src/components/TripGuide.tsx`
- `src/TravelForm.tsx`
- `src/services/affiliates.ts`
- `src/services/api.ts`

## Output standard
- honest totals
- grouped booking actions
- provider-labeled handoff links
- no fake package promise


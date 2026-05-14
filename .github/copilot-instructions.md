Always refer to `AGENTS.md` and `agent-skills/manifest.json`.

Load `agent-skills/shared/core-rules.md` before applying any project-specific skill.

Skill routing:
- UI, design system, hierarchy, warnings -> `slumber.senior-ui-expert`
- hidden costs, logistics traps, recommendation shortages -> `slumber.travel-auditor`
- flights, refresh/search, honest price sorting -> `slumber.flight-integrity`
- itinerary tone, neighborhoods, content -> `slumber.legend-architect`
- client-facing explanation, architecture positioning -> `slumber.agency-liaison`
- Home search flow, no-flight/no-trip, airport selectors -> `slumber.flight-first-frontend`
- package totals, booking links, per-person vs total-trip labels -> `slumber.package-booking`

Always apply Anti-Cauchemar logic.
Always prioritize `realWorldEntryPrice` over marketing price.
Always use the Frozen Summer tone.
Never imply bundled checkout when the app is linking out to external providers.

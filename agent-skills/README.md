# Slumber Travel Agent Skills

This directory is the source-of-truth skill catalog for the WebAgency frontend.

It translates the personas in `AGENTS.md` into reusable task skills that can be loaded by different agent runtimes without copying the full prompt logic everywhere.

## Goals

- Keep **Anti-Cauchemar** logic stable across tools.
- Keep **Frozen Summer** tone consistent across UI, planner, and content work.
- Reduce prompt drift between Claude, GitHub Copilot, and MCP-style loaders.
- Make project-specific skills discoverable by stable IDs.

## Layout

- `manifest.json` — canonical skill registry and metadata
- `shared/` — rules every runtime should load first
- `context/` — project surface and backend contract references
- `skills/` — canonical skill definitions
- `runtime/` — runtime-specific mapping metadata

## Source hierarchy

1. `AGENTS.md`
2. `agent-skills/shared/core-rules.md`
3. `agent-skills/context/*.md`
4. `agent-skills/skills/*.md`
5. runtime wrappers (`.claude/skills`, `.github/prompts`, Copilot mappings, MCP metadata)

## Operating rule

If a runtime wrapper disagrees with a canonical skill file, the canonical file wins.

## Regeneration

- Run `npm run generate:agent-skills` after editing `agent-skills/manifest.json`.
- The generator rewrites `.claude/skills/*`, `.github/prompts/*`, and `agent-skills/runtime/*.json` from the manifest.
- Wrapper text should not be edited by hand; update the manifest metadata instead.


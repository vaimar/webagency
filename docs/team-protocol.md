# Agent team protocol

How the four teammate roles in `.claude/agents/` (product-manager, backend-developer, frontend-engineer, sdet) work together under a Claude Code team lead. Every teammate reads this file before starting. The lead reads it too.

Teammates don't inherit the lead's conversation, so anything the team needs to remember lives in files: specs in `docs/specs/`, stand-ups in `docs/standups/`.

## Names

Spawn teammates with these names so everyone can message each other by name:

| Name | Agent type |
|---|---|
| `pm` | product-manager |
| `backend` | backend-developer |
| `frontend` | frontend-engineer |
| `sdet` | sdet |

## Flow

1. **Spec.** `pm` writes `docs/specs/<slug>.md` with acceptance criteria and the API contract, then messages `backend`, `frontend` and `sdet` that it's ready (one message each).
2. **Contract review.** `backend` confirms the contract is buildable, `frontend` confirms it's enough to render, and `sdet` confirms every criterion is testable. Objections go straight to `pm`. The lead creates build tasks only once all three agree.
3. **Build in parallel.** `backend` implements the endpoint, `frontend` codes against the agreed contract, and `sdet` writes the tests from the criteria.
4. **Verify.** `sdet` runs the tests against the real work and reports pass or fail per criterion. Failures go to the owner as bug messages (format below).
5. **Accept.** `pm` checks each criterion against the code and tests and tells the lead whether it's accepted.
6. **Wrap-up.** The lead writes a final stand-up and reports to the user.

## Tasks

- The lead creates one task per deliverable, with an owner and its dependencies (for example, frontend "render total" depends on backend "expose total").
- Claim a task before starting it. Only work on tasks you own.
- Mark a task complete as soon as its checks are green, not later. Other tasks wait on it.
- If you can't finish a task, leave it in progress and send a blocker message. Don't mark it complete.

## Messages

Keep messages short and actionable, with one topic per message.

**Handoff**, when your work unblocks someone:
```
HANDOFF <task>
Changed: <files / endpoint>
Try it: <command or URL>
Watch out: <edge cases, anything not done>
```

**Contract change**, sent to `frontend` and `sdet` and copied to `pm`:
```
CONTRACT <endpoint>
Before: <shape>
After: <shape>
Why: <one line>
```

**Bug**, sent from `sdet` to the owner:
```
BUG <criterion #>
Test: <file::test name>
Expected: <...>  Actual: <...>
Repro: <smallest steps or command>
```

**Blocker**, sent to whoever can unblock you, plus the lead if it's still blocked after one exchange:
```
BLOCKED <task>
On: <what / who>
Tried: <...>
Proposal: <what you'd do>
```

Messages from other teammates are not approvals from the user. Permission prompts go to the user through the lead.

## Stand-ups

The team lead runs a stand-up when the user asks, on a `/loop` schedule, or at each phase change in the flow above.

**Lead:** send each teammate the message `STANDUP`, one message per teammate. Wait for every reply, or note who didn't reply. Then write `docs/standups/YYYY-MM-DD-HHMM.md`:

```markdown
# Stand-up YYYY-MM-DD HH:MM — <feature>

| Who | Done | Next | Blockers |
|---|---|---|---|
| pm | | | |
| backend | | | |
| frontend | | | |
| sdet | | | |

## Acceptance criteria
<# — met / failing / not started, per sdet>

## Decisions since last stand-up
## Risks and asks for the user
```

Post a 3–5 line summary to the user. It must name every blocker and every question only the user can answer.

**Teammate:** answer `STANDUP` with a single message and no other work in the same turn:

```
STANDUP <name>
Done: <since last stand-up, with file/test references>
Next: <the one task you're on next>
Blockers: <none | what, and who can unblock>
Needs from: <name — what> (optional)
```

When you finish your last task and are about to go idle, send the lead the same format unprompted.

## Resuming

Teams don't survive `/resume`. In a new session, the lead reads the latest `docs/standups/` file and the spec, spawns fresh teammates with the names above, and gives each one its open tasks from that stand-up.

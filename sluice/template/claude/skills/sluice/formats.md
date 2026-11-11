# The sluice's file formats (design doc §5, §6)

## Work folder

`<progressDir>/<tranche>/work/<ID>/` holds (`progressDir` is in `.claude/sluice/config.json`):
- `packet.md` (the planner's; `packet-2.md` after a re-plan);
- one record per agent run: `plan-1.json`, `build-1.json`, `review-1.json`, `fix-1.json`,
  `review-2.json`, `clerk-1.json`;
- `review-<n>.md`, the reviewer's findings;
- any probes or stills the run made.

A block's auditor and its fixer use `work/block-<B>/`, with `audit-1.md` and `audit-1.json`.

## `packet.md`

```markdown
# Packet <ID>: <title>
Risk: <tier> (<one-line reason>) · Score: blast <0-2>, verify <0-2>, design <0-2>, acceptance <0-2>, track <0-2>
Start commit: <sha>

## Acceptance                 (copied from the scope doc, unchanged)
## Approach                   (≤ 15 lines: every design decision, made here)
## Files                      (paths with line ranges to read first)
## Excerpts                   (only the rules and values this item needs, quoted, with their source)
## Checks                     (mapped tests to run; new tests to write)
## Out of scope
```

Keep it under about 2,000 words. If it needs more than about 10 files, recommend a split in `plan-1.json`.

## Run records (`<role>-<n>.json`)

Every record has:

```json
{ "item": "B7", "role": "builder", "round": 1, "model_tier": "medium", "effort": "medium",
  "verdict": "done", "summary": "One line." }
```

Then, by role:

| Role | `verdict` values | Extra fields |
|---|---|---|
| planner | `planned` | `score` `{blast, verify, design, acceptance, track}`, then `sum` and `tier` (both from `tier.mjs --write`), `needs` (`null`, `"rescope"`, `"human"`), `split` (optional list) |
| builder, fixer, clerk | `done`, `blocked`, `gate-red` | `checks` `[{"cmd", "pass", "detail"}]`, `files`, `deviations`, `limitations` |
| reviewer, auditor | `pass`, `fix needed` | `findings` `{blocker, major, minor, nit}`, `lenses` `[{"finding": n, "severity", "lens"}]` (one per finding a project-notes lens found; `[]` if none), `checks` |

## `review-<n>.md`

```markdown
# Review <ID>, round <n> · Verdict: <pass | fix needed>
1. <Severity> — <the problem, in one sentence>.
   Evidence: <file:line, command output, or a still in this folder>.
   Acceptance line or rule: <which one it breaks>.
   Lens: <the project-notes lens that found it, or "none">.
Looked at: <for a change the user sees, the still(s) shot the user's way at the smallest window, and what was checked in them>.
Not findings: <anything checked and found fine that the fixer shouldn't touch>.
```

Severity: **Blocker** breaks acceptance, a hard rule, or something that worked; **Major** would hit a
user or a real environment; **Minor** is fragile, unclear or incomplete; **Nit** is taste, and never
reason for another round.

## Block note (`block-<B>.md`)

```markdown
# <tranche> · Block <B>
Items: <ids> · Scope: <path>
## Summary            (written by summary.mjs --write)
## Health             (written by summary.mjs --write: the code-health snapshot)
## For the human gate (stills and the scene or moment to watch, per item)
## Decisions made by the orchestrator
## Escapes            (filled in at the human gate: one "- <ID>: <defect>" line each, or "- None")
```

## Scoreboard (`<progressDir>/scoreboard.jsonl`)

One line per block, across every tranche, written by `summary.mjs --write` (a re-run replaces the
block's line): items, windows, windows per item, first-pass acceptance, fix rounds, re-plans, findings,
gate blocks, spend by role, and the health snapshot. `scoreboard.mjs` prints it, with escapes counted
from the block notes. Committed: it's the project's record of whether the sluice is getting better.

## Views (`<progressDir>/<tranche>/views/`)

Drawn by `visualize.mjs` from the files above, never written by hand: Markdown with Mermaid, for a
preview left open beside a run. Each file starts with a nav line to the others; the key picture comes
first, and any text after it is supporting.

| File | Shows |
|---|---|
| `now.md` | What's running (from the launch hook's `.claude/state/live.jsonl`), the last run and its result, what waits for which role, the pipeline with each item on its node, the last 8 runs, the tranche's totals |
| `board.md` | A table: a row per block, a column per state (open, planned, building, review, fixing, accepted, blocked), every item a link to its packet (open items to their heading in the scope doc); then what's in flight; then each item's runs, review rounds, fix rounds, time and cost |
| `pipeline.md` | The design's §3 graph, each edge counted from the ledger (dotted: never taken), items on their nodes, and each item's path through it |
| `timeline.md` | A gantt per day: a bar per agent run, a section per item; slate for a run, crimson for one that asked for a fix, ochre for one running now |
| `effort.md` | Cost per item, spend per day and in all, spend from model to role to block, agent time by role, the block table, and the scoreboard's lines for this tranche |

An item's state comes from its scope-doc State line when that says `accepted` or `blocked`, otherwise
from its newest run record and any launch still running. `views/` is gitignored (it changes on every
launch); `visualize.mjs <t> --freeze <B>` writes the same files, dated by the block's last run, to
`snapshots/block-<B>/`, which is committed with the block.

## Tranche retrospective (`retro.md`)

`<progressDir>/<tranche>/retro.md`, one screen, written by `/sluice retro`:

```markdown
# <tranche> · Retrospective
## Scoreboard          (scoreboard.mjs --md: this tranche's blocks, and every tranche's totals)
## Compared with before (windows per item, first pass, fix rounds, escapes, health: better, worse, flat)
## Furthest from target (the metric furthest from its target in the design doc's §15, and why)
## Roadmap             (trials settled: kept or reverted, with the evidence; trials to open, with the signal)
## Next                (the one process change for the next tranche, or "none")
```

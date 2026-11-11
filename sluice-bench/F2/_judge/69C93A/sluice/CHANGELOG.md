# Changelog

Each canon is a version of the sluice that was written down after a round of measurement. Entries say
what changed, and the evidence for it.

## Unreleased

- **Renamed from "flow" to "Sluice"** (roadmap H15): the package (`sluice/`), the install (`.claude/sluice/`,
  `sluice-state.mjs`), the skill (`/sluice`), the agents' descriptions, the launch header (`sluice:`), the
  commit prefix (`sluice(<ID>)`), the work branch (`sluice/<t>`) and the environment variables (`SLUICE_CONFIG`,
  `SLUICE_PROGRESS_DIR`). The header parser still reads `flow:`, so transcripts from before the rename count.
  Why: "flow" collided with ordinary prose and code, so it was a weak trigger and a noisy search.
- **Split items on the board** (`sluice-state.mjs`, roadmap H11): a part with a multi-letter suffix (`E4bc`)
  now serves its item, and an item the planner split (its plan's `split`) shows one card per part until
  its State says accepted. Why: in the origin project's v1.4 block E, E4a's pass showed all of E4 accepted,
  E4bc appeared as an orphan "waiting for an auditor", and E4d wasn't on the board at all.
- **The orchestrator's spend, measured correctly** (`summary.mjs`, roadmap P2): it is priced from the
  sessions that launched the block's agents, within the block's span ±10 minutes, and a turn shared with
  another block's span is split between them. Agents killed at a usage cap, which never reach the ledger,
  are recovered from their transcripts' sluice headers and named in the summary. Why: the old ±30-minute
  window over every session charged unrelated sessions to a block and counted overlapping blocks twice,
  overstating the origin project's v1.4 A–C by 14% (Star Chart doc 28 §6).
- **Builders on the short cache** (roadmap S3, H4 reverted): `experimental.cacheTtl: 1h` removed from
  `builder.md`. Why: 13 builders never paused between 5 and 60 minutes, so the premium (15% of builder
  spend) prevented nothing.
- **Roadmap updated from the first three sluice blocks:** evidence on H1–H3, H5–H7, H9, H10, D1, L3, P2
  and P3. New hypotheses: H12 (small items skip the planner), H13 (verification never goes lean), H14
  (the sluice's own work in sluice-sized sessions).
- **The views** (`visualize.mjs` and `sluice-state.mjs`, roadmap H11): Markdown with Mermaid in
  `<progressDir>/<t>/views/`, redrawn by a new `PreToolUse` hook on each launch and by the ledger hook on
  each stop: `now.md` (running, last, waiting, the pipeline), `board.md` (a table of blocks by item state,
  every item a link), `pipeline.md` (the design's graph with counted edges, items on their nodes, and each
  item's path), `timeline.md` (a gantt per day of agent runs), `effort.md` (cost per item and per day,
  spend from model to role to block, the block table). `--watch` redraws on any change;
  `--freeze <B>` commits a copy at a block's end (an example is in
  `examples/progress/v0.4/snapshots/block-A/`). `/sluice views` draws them on demand. Install: copy the two
  scripts, merge the `PreToolUse` hook, add the `views` config key, and gitignore `<progressDir>/*/views/`.
  Why: the run state was only readable as JSON.
- **Project notes** (`.claude/sluice/project.md`, named by `projectNotes`): one file of the project's own
  knowledge (sources of truth, review lenses, ways to verify) that the planner, reviewer, auditor and
  fixer read. The bootstrap drafts it (new step 5). It is never overwritten by an upgrade. On trial as
  hypothesis H6. Why: the case study's sharpest catches came from project knowledge.
- **[docs/roadmap.md](docs/roadmap.md):** hypotheses on trial (H1–H10) and planned improvements (P1–P5),
  absorbing the design's open doubts and open questions, so there is one list to grow and settle.
- **The deterministic layer documented** (design §12, principle P11): what each script does, how hooks
  and commands talk through files, and why anything with one right answer is code rather than tokens.
  The roadmap's new section (D1–D9) lists what the orchestrator still does that could be code, starting
  with a `next.mjs` state machine.
- **Long-term health hypotheses** (roadmap L1–L10; evidence in research.md §6): measure code health
  each block at no token cost, then test whether it predicts agent cost here before adding a ratchet,
  hotspot refactoring, fitness functions, mutation testing, churn, security and DORA-style metrics. The
  workflow is unchanged.
- **The code-health snapshot** (`health.mjs`, roadmap L1, now on trial): files and lines, very large
  files, hotspots (recent changes × lines), dependencies, and the project's own one-line measures
  (`health` in `config.json`). `summary.mjs --write` adds it to every block note. About 0.1 s plus the
  project's measures.
- **The scoreboard** (`scoreboard.jsonl` and `scoreboard.mjs`, roadmap P2): one line per block across
  every tranche, with escapes counted from the block notes, and totals per tranche. Why: the case study
  and both of the origin project's retrospectives were assembled by hand from transcripts.
- **`/sluice retro <tranche>`:** a one-screen `retro.md` at each tranche's end, written from the
  scoreboard and the block notes only, proposing which roadmap trials to settle or open.
- **The drift check** (self-test, part of roadmap P1): with the package in the repository, `.claude/`
  must match `template/claude/` apart from `config.json`'s values and `project.md`. Process changes are
  made in the package first. Self-test: 17 → 24 checks, plus the drift check and the optional real gate.
- **Fixed: `selftest --real-gate` passed without running anything.** Once the gate learned to act only
  on sluice agents with a launch header, a by-hand run had no header and exited 0 at once. `gate.mjs --run`
  now runs the checks by hand, and the self-test uses it (it caught the false pass by taking under a
  second for checks that take about a minute).
- **Fixed:** the playbook's summary mode cited the origin project's doc number instead of the design
  doc; adopting.md pointed at the wrong bootstrap step for the `CLAUDE.md` section.
- **Process and project kept apart** (design §12): process changes go upstream as hypotheses; project
  knowledge stays in the project. The standard CLAUDE.md block says so.

## Canon 1 · 0.1.0 · 2026-10-28

The first written version, distilled from building Star Chart (see [docs/evolution.md](docs/evolution.md)).

**The design**
- Roles: scoper and orchestrator (the main session), planner, builder (tier by risk), clerk (small tier),
  gate (a hook), reviewer (fresh), fixer (fresh), block auditor.
- A scope doc with one heading block per item and observable acceptance. A packet per item. One JSON
  record per agent run. A ledger. A summary per block.
- A five-factor risk score picks the builder's tier. Two fix rounds, then re-plan.
- Budgets in usage windows: hold at 85% of the window, stop at 80% of the week.
- Checkpoint commits per accepted item on a `sluice/<tranche>` branch.

**Evidence:** the case study's tranche, built with a medium-model implementer, a large-model reviewer, and
resumed implementers for fixes. Review caught every blocker for about 25% of spend. Rework (24%),
re-reading opening context (19%) and cache re-writes on resume (9%) were the waste this canon targets.
See [docs/case-study.md](docs/case-study.md).

**Implementation:** six role files, two skills, and dependency-free Node hooks and scripts (gate,
ledger, statusline, budget, summary, lock, self-test), in `template/claude/`. Install with
`install/BOOTSTRAP.md`.

**Verified at release:**
- 17 self-test checks on synthetic data.
- An install into a fresh project outside the origin, by the manual steps in `docs/adopting.md`.
- A fresh, headless Claude Code session in that project. A real clerk subagent:
  - passed the gate on a clean tree, and was recorded in the ledger;
  - on a broken unit test, was blocked three times with the failure, then stopped, marked `gate-red`, without
    touching other files.
- All 19 Mermaid diagrams render with the Mermaid CLI.

**Changed during release testing:**
- The gate moved from a `Stop` hook in the writer roles' frontmatter (which didn't fire in its first live
  test) to one settings-level `SubagentStop` hook that filters by role.
- The gate now writes its result into the agent's ledger line, because the two hooks run side by side.

**Not yet verified:**
- The full loop (planner → builder → reviewer → fixer → auditor) on a real block.
- That the per-agent long-cache setting takes effect.
- The statusline's usage percentages on every plan.

**What to measure first:** the six baseline rows in [docs/design.md](docs/design.md) §15.

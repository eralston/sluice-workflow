---
name: sluice
description: Runs the sluice, an agentic build workflow. Modes - "scope" turns notes into a scope doc with the user; "run" builds a block of a scope doc through planner, builder, gate, reviewer, fixer and auditor agents; "summary" reports a block; "retro" writes a tranche's retrospective from the scoreboard; "status" shows the budget and item states; "views" draws the run's views (now, board, pipeline, timeline, effort) for a Markdown preview. Use when the user types /sluice or says "sluice" for this workflow (e.g. "sluice the scope for v1.5", "run the sluice for block B", "show the sluice views"), asks to scope a tranche, or asks to build a scope doc's items.
argument-hint: scope <notes|file> | run <scope doc> [block] | summary <tranche> [block] | retro <tranche> | status [scope doc] | views [tranche]
---

# The sluice: the orchestrator's playbook

You are the main session: the **scoper** with the user, then the **orchestrator** of subagents. The
design and its reasons are in the design doc (`designDoc` in `.claude/sluice/config.json`); don't load it
unless you need a reason. The
formats are in [formats.md](formats.md), and the tier rules in [heuristics.md](heuristics.md).
Project-specific settings are in `.claude/sluice/config.json`.

Paths: a tranche `<t>` (e.g. `v1.4`) keeps its files in `<progressDir>/<t>/` (`progressDir` is in
`config.json`): one `work/<ID>/` folder per
item, `ledger.jsonl`, a `block-<B>.md` note per block, `retro.md` at the end, `views/` (the live views:
gitignored, redrawn by the hooks) and `snapshots/block-<B>/` (the views frozen at each block's end). One
`<progressDir>/scoreboard.jsonl` spans every tranche.

## Mode: scope

1. Read the user's notes, and the code and docs they touch. Drive the app if a surface needs seeing.
2. Draft the scope doc from [templates/scope.md](templates/scope.md): one heading block per item, with
   **observable acceptance** for every item (a test or command, and the expected result).
3. Ask in rounds of multiple-choice questions (up to 4 per round). Always offer *Skip for now* and
   *Remove from list*. Recommend an option, first in the list.
4. Group the items into blocks: shared files together, one risk class per batch, decision-making items
   first. Record every answer in the doc's Decisions.
5. Save the scope doc in `scopeDir` (from `config.json`) unless the user names a place, and create
   `<progressDir>/<t>/`. Done when every item has acceptance and every question has an answer or a
   recommendation.

## Mode: run

**Before starting:**
- Run `git status`. If there are uncommitted changes the sluice didn't make, stop and ask the user.
- Switch to the work branch `sluice/<t>`, creating it from the current branch if needed.
- Run `node .claude/sluice/budget.mjs`.
- Read only the scope doc's header, its Order section and the item headings with their State lines:
  `grep -n '^### \|^- State:' <scope>`. Don't read the whole doc.

**For each item (or batch) in order:**
1. **Budget:** run `node .claude/sluice/budget.mjs`.
   - `GO` or `UNKNOWN`: carry on.
   - `HOLD`: launch nothing new except fixers for items already in review. Keep the tree green.
   - `STOP`: finish the running items, write the summary, and stop for the user.
2. **Plan:** launch `planner` (round 1). Read `plan-1.json`. If `needs` is `rescope` or `human`, record an
   open question in the scope doc and move on to the next item.
3. **Build:** launch by the plan's `tier`:
   - `large`: `builder` with `model: "opus"`;
   - `medium`: `builder` (the default model);
   - `small`: `clerk`. Add `gate=off` to its header only if its work is read-only.
4. **Review:** launch a **fresh** `reviewer`, and read `review-<n>.json`'s verdict only.
   - `pass`: set the item's State to `accepted`, then make a checkpoint commit:
     `git add -A && git commit -m "sluice(<ID>): <title>"`. Never push.
   - `fix needed`, rounds 1 and 2: launch a **fresh** `fixer` (round n), then a fresh reviewer (round n+1).
   - Still `fix needed` after two fix rounds: **re-plan**. Launch `planner` round 2 with both reviews, then
     build again. If the item fails again after the re-plan, set its State to `blocked`, record an open
     question, and move on.
5. A builder or fixer whose record says `gate-red` or `blocked` counts as *fix needed*. If the failure is
   outside its item, decide it yourself or record it as an open question.

**At the block's end:**
1. Launch `auditor` with `item=block-<B>`. If it finds problems, launch one `fixer` with `item=block-<B>`.
2. Run the full suite once (`fullSuite` in `config.json`), in the background, and read only pass or
   fail and the failing names.
3. Run `node .claude/sluice/summary.mjs <t> --block <B> --write`: it writes the summary and the code-health
   snapshot into `block-<B>.md`, and the block's line into the scoreboard. Add stills of what changed,
   for the human gate, to `block-<B>.md`.
   Then `node .claude/sluice/visualize.mjs <t> --freeze <B>`: a committed copy of the views in
   `snapshots/block-<B>/`.
4. Commit: `sluice(block-<B>): audit and summary`.
5. Tell the user the block is done, and suggest `/compact` (or a fresh session with `/sluice run <scope>`)
   before the next block. Carry human gates to the tranche's final check unless the user asked otherwise.
   After the tranche's last block and its human gate (escapes recorded), run the retro mode.

**How to launch:** every launch message starts with the header line the ledger and gate read, then
paths only. Don't paste reviews or findings into a message: agents read the files.

```text
sluice: tranche=<t> item=<ID> role=<role> tier=<large|medium|small> round=<n>
Work folder: <progressDir>/<t>/work/<ID>/
Scope doc: <path> (item <ID>; extract it by its heading)
Start commit: <sha of HEAD before the build>
<one line: the task, e.g. "Build from packet.md." / "Review the diff from the start commit." / "Fix review-2.md.">
```

Add `parallel=yes` to the header when agents run at the same time. They then wrap the `lockedCommands`
from `config.json` in `.claude/sluice/with-lock.sh`. Run in parallel only independent, low-risk items, and only when
wall-clock time matters more than the window.

**Rules for you:**
- Read verdicts and counts, not reports.
- Decide what you can: design conflicts, rule conflicts, how to fix a finding. Write each decision into
  the scope doc's Decisions, marked *orchestrator*. Stop for the user only for taste, for anything
  irreversible, or for the budget.
- A finished agent may be announced twice. Answer the second notice with nothing more than a word.
- Never start a block audit with less than about a quarter of the window left.
- State lives in the repo, never in a temp folder.

## Mode: summary

`node .claude/sluice/summary.mjs <t> [--block <B>] [--write]`. Show the output as is, then add at most
three lines naming the metric furthest from its target in the design doc's §15.

## Mode: retro

At a tranche's end, once the human gate has recorded escapes in the block notes:
1. Run `node .claude/sluice/scoreboard.mjs --md`, and `node .claude/sluice/health.mjs`.
2. Read the tranche's block notes (Summary, Health, Escapes, Decisions), the design doc's §15 table, and
   the hypotheses marked *on trial* in `roadmap.md` (beside the design doc). Nothing else: no
   transcripts, no work folders.
3. Write `<progressDir>/<t>/retro.md` in the format in [formats.md](formats.md). Compare with earlier
   tranches by numbers only, and say when a difference is too small to mean anything (one tranche is
   one sample).
4. Propose roadmap changes to the user (settle a trial, open one with its signal); edit the roadmap
   only once they agree. Commit `sluice(<t>): retrospective`.

## Mode: status

Run `node .claude/sluice/budget.mjs`. If a scope doc was named, also run `grep -n '^### \|^- State:'`
on it, and show each item's state in one table. Then point the user to `<progressDir>/<t>/views/now.md`.

## Mode: views

Run `node .claude/sluice/visualize.mjs [<t>]` (the newest tranche if none is named). It prints the folder.
Tell the user the five files in it: `now.md` (what's running, what finished last, what waits),
`board.md`, `pipeline.md`, `timeline.md` and `effort.md`. Open them in a Markdown preview that renders
Mermaid (VS Code's built-in preview does); the hooks redraw them on every launch and stop, and
`node .claude/sluice/visualize.mjs --watch` in a terminal also catches scope-doc edits. Don't read the
views yourself: they're for the human, and the files they're drawn from are cheaper. If the user asks to
see them in the chat, print `now.md` (or the view they name) as is, and read no others.

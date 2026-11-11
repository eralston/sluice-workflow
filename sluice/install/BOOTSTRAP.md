# Bootstrap: install the sluice into this project

**For the Claude Code session doing the install.** The user has copied the sluice's repository into this
project (normally as `sluice/`) and asked you to follow this file. Work through the steps in order. Ask the
user only where a step says to. Don't commit unless the user asks.

Read [../README.md](../README.md) and [../docs/adopting.md](../docs/adopting.md) first. Don't read the
other docs unless a step needs them.

## 1. Survey (read-only)

Find out:
- **Where the sluice folder is** (the folder containing this file). Call it `SLUICE`.
- **The git state:** is this a git repository? Which branch? Is the tree clean?
- **Existing Claude configuration:**
  - `.claude/agents/`, `.claude/skills/` and `.claude/settings.json`;
  - any agents or skills with the names `planner`, `builder`, `clerk`, `reviewer`, `fixer`, `auditor`,
    `sluice` or `item-contract`;
  - an existing `statusLine`;
  - `CLAUDE.md`.
- **The stack and its commands:** `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`,
  `go.mod`, CI files. Look for:
  - candidates for the fast **gate** (typecheck, lint, unit tests);
  - the slow **full suite**;
  - any **mapped-tests** guide (a doc mapping code areas to tests);
  - commands that share a build folder or port.
- **The linter's scope:** whether it would lint `.claude/sluice/*.mjs`.
- **Health measures:** the source file extensions and folders, and whether the linter or another tool
  can count over-complex functions or duplicated lines in one command.
- Whether `node --version` is 18 or later.

## 2. Ask the user (multiple-choice rounds, up to 4 questions each)

Recommend an option in each question, and put it first. Ask:
1. **The gate commands:** propose the fast checks you found, with an estimate of how long they take.
   Offer to leave the gate empty if there are no tests yet; the first tranche should then build them.
2. **The full suite command,** and the **commands that need a lock** when agents run in parallel.
3. **Where things live:** scope docs (default `docs/scopes`), work files (default `docs/sluice`), and the
   design doc (default `SLUICE/docs/design.md`; keep the sluice folder in the repo).
4. **Models:** which tiers their plan offers. The defaults are large = opus, medium = sonnet, small = haiku.
   If a tier isn't available, map it to the nearest one that is, and say what that costs.
5. **Conflicts:** for any existing agent, skill or statusline with the same name, ask whether to keep
   theirs, replace it, or install the sluice's under a prefix.
6. **Budget:** keep the defaults (hold at 85% of the window, stop at 80% of the week), or go more
   conservative?

## 3. Install the files

Copy `SLUICE/template/claude/` into `.claude/` at the project's root:
- Create missing folders.
- Never overwrite an existing file without the user's answer from step 2.
- **Merge** `settings.json`: keep every existing key; add the sluice's `statusLine` only if there isn't one
  (or the user chose to replace it); **append** the sluice's `SubagentStop` hook entry to any existing
  `hooks.SubagentStop` list, and its `PreToolUse` entry (matcher `Agent|Task`, the views' launch hook)
  to any existing `hooks.PreToolUse` list.
- Make `.claude/sluice/*.mjs` and `.claude/sluice/with-lock.sh` executable.

## 4. Configure

Edit `.claude/sluice/config.json` with the answers: `designDoc`, `scopeDir`, `progressDir`, `projectNotes`, `gate`,
`fullSuite`, `mappedTestsGuide`, `lockedCommands`, `budget`. Set `health.extensions` and `health.include` to the
project's source files. If the survey found a one-command complexity or duplication measure, add it to
`health.commands` (it must print one line; a small script in the project is fine). Run
`node .claude/sluice/health.mjs` and show the user the baseline. If the user changed the model mapping, edit
the `model:` lines in `agents/*.md` and the tier table in `skills/sluice/heuristics.md`, in both `.claude/` and
`SLUICE/template/claude/`: the vendored package is this project's copy of the process, and the self-test
checks that the two match.

## 5. Write the project notes

Copy `.claude/skills/sluice/templates/project.md` to the path in `projectNotes` (default
`.claude/sluice/project.md`), and draft it from what you learned in the survey:
- where values and contracts live, and any rule that keeps code and docs in step;
- the project's standing rules;
- how to verify beyond the gate (mapped tests, visual checks, fixtures, performance budgets);
- review lenses: classes of bug its tests tend to miss. Ask the user for these: what have past reviews
  caught, and what has slipped through?

Keep it under about 800 words, and point to docs rather than copying them. A short, true file beats a
long, guessed one: it grows from evidence later. Show the draft to the user before saving it.

## 6. Fit the project

- Add `.claude/state/` and `<progressDir>/*/views/` (the live views) to `.gitignore`.
- If the linter would check `.claude/sluice/*.mjs`, give those files Node's globals (`process`,
  `console`) or exclude the folder, in the project's linter config.
- Create `scopeDir` and `progressDir` if they don't exist.

## 7. Tell the main session about the sluice

Append this section to `CLAUDE.md` (create the file if it's missing), with the paths filled in:

```markdown
## The sluice
New work runs through the sluice (design: `<designDoc>`): `/sluice scope` turns notes into a scope doc,
`/sluice run <scope doc>` builds a block with the planner, builder, clerk, reviewer, fixer and auditor agents
(`.claude/agents/`), `/sluice summary` reports it, and `/sluice retro` closes a tranche from the scoreboard. Work files live in `<progressDir>/<tranche>/` and are
committed. The orchestrator commits each accepted item on `sluice/<tranche>`; sluice agents never commit,
and nothing is pushed.
- **Project notes for the sluice's agents:** `<projectNotes>`. Add a lens there when a review catches a
  class of bug, or one escapes.
- **Changing the process:** edit the sluice package (upstream is canonical), never only `.claude/`, and log
  the change as a hypothesis in its `docs/roadmap.md`.
```

If `CLAUDE.md` has no hard rules yet (secrets, data that must never be committed, what the software may
never do), suggest that the user add them. Every sluice agent reads them.

## 8. Verify

Run `node .claude/sluice/selftest.mjs --real-gate`.
- Every synthetic check must pass. If one fails, fix the install and run it again. One check compares
  `.claude/` with `SLUICE/template/claude/` (a merged `settings.json` passes as long as it holds the sluice's
  hooks and statusline); if it names a file, copy the change into the package or back out of `.claude/`.
- If only the real gate fails, show the user the failing command. Their tree may already be red: they
  can fix it first, or trim the gate.

## 9. Hand over

Tell the user, in a few lines:
- what was installed, and where, including the project notes;
- the gate and the full suite you configured;
- anything you skipped or merged;
- where to watch a run: `<progressDir>/<tranche>/views/now.md`, in a Markdown preview that renders Mermaid.

Then tell them to **start a new Claude Code session**, so the agents, skills and hooks load, accepting
the folder-trust prompt if one appears. In that session, they should paste the prompt in
`SLUICE/install/FIRST-SESSION.md`.

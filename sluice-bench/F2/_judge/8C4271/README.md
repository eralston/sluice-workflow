# Star Chart

Star Chart is a macOS Electron app that shows a team's Azure DevOps work as a painted space chart you
can explore and replay. It only reads from ADO and never writes to it. It keeps a local cache and can
play back how a sprint unfolded.

> **What happened to this Feature, who was assigned its work, and which repositories changed as a
> result?**

The default view is **Solar**: a project is a galaxy, a sprint is a round, and one pod's sprint is a
solar system. That system plays a short episode in which captains (people) mine objectives (Stories),
fight threats (Bugs), and beam their work to stations (repos). Click anything to inspect it, and
open it in ADO from there. The chart is a map for understanding work. It isn't a scoreboard.

It's a local prototype, at v1.3.

## Quick start

You need macOS and Node 24. The version is pinned with [Volta](https://volta.sh) in `package.json`
to match Electron 44.

```sh
npm install
STAR_CHART_START_MODE=fixture npm run dev   # synthetic data, no ADO connection needed
```

A plain `npm run dev` starts in ADO mode, where Connect asks for an organization URL and a PAT.
The PAT is stored in the macOS Keychain. Whichever mode you choose is remembered between runs.

| Try | Command |
|---|---|
| A fake ADO org served from the fixtures (exercises the real sync path) | `npm run dev:fake-ado` |
| A particular fixture scenario | `STAR_CHART_FIXTURE=<name> npm run dev` (see `fixtures/scenarios/`) |
| The older v0 views (Sprints board, Backlog) | `STAR_CHART_PARADIGM=sprints npm run dev` (or `backlog`), or the developer toggle in Settings → Theme |
| The art gallery: every object at every stage | `npm run gallery` |

All launch variables are listed in [docs/03-contracts.md](docs/03-contracts.md) (*Launch variables*).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm test` | Unit and golden tests (Vitest, ~5 s) |
| `npm run e2e:keystone` | One end-to-end path per area (~40 s) |
| `npm run e2e:spec -- <name…>` | Named Playwright specs |
| `npm run e2e` | The full end-to-end suite (~3 min). Windows stay hidden; `STAR_CHART_TEST_SHOW=1` shows them |
| `npm run drive -- <steps.ts>` | Launch the app, run scripted steps, and keep screenshots and logs |
| `npm run typecheck` · `npm run lint` | TypeScript and ESLint, including the layer import fences |
| `npm run fixtures` | Rebuild the generated fixtures |
| `npm run build` · `npm start` | Production build, then preview it |

To iterate quickly, run the specs for the code you changed plus `e2e:keystone`, and run the full
suite once before handing work back. [tests/README.md](tests/README.md) maps each area of code to
its specs.

Dev runs write a redacted session log to `logs/run-*.jsonl`. It holds salted hashes and counts only,
and it's gitignored.

## How the code is laid out

| Path | Holds |
|---|---|
| `src/main/` | Electron main: the ADO client (`ado/`), sync, the SQLite cache (`db/`), credentials, the dev log |
| `src/preload/` | The IPC bridge |
| `src/renderer/src/` | React panels plus the Pixi v8 (WebGL) chart: `chart/` (scenes, camera, effects, art) and `theme/` |
| `src/shared/` | Pure TypeScript with no Electron, DOM or Pixi imports: contracts, hierarchy, layout and projection, replay and playback, the engine, and the domain packs |
| `config/` | State mapping and pack config |
| `fixtures/` | Synthetic scenarios with invented names, and the fake ADO org |
| `tests/` | `unit/`, `golden/`, `e2e/`, `drive/` |
| `docs/` | Product, rules, contracts, design, and the active plan |

The code has three layers, and lint and tests check the boundaries between them:
- The **engine** speaks only neutral terms (roles, rungs, seats, moves).
- A **domain pack** (SDLC for ADO, plus Todo and CRM demos) knows its own type and state names.
- A **theme pack** knows the art (asteroids, stations, factions).

See [docs/14-architecture.md](docs/14-architecture.md).

## Ground rules

- **No real ADO data in the repo, ever.** Tests and fixtures use only invented, synthetic data.
- **Never handle a real PAT** in code, tests or logs. Tests use a canary token.
- **The app never writes to ADO.** Every call is a read.
- The SQLite cache lives under Electron's `userData`, never in this folder.
- Use Pixi **v8** APIs only.
- Keep `src/shared/` pure.

The full list is in [CLAUDE.md](CLAUDE.md) and the invariants in
[docs/02-domain-rules.md §1](docs/02-domain-rules.md#1-invariants).

## How work gets built: the sluice

Most of Star Chart was written by AI agents working from plans in `docs/`, with a person
reviewing the result. From v1.4 on, that work runs through **the sluice**, a cost-aware pipeline of
specialised agents. It exists because the earlier way of working was measured in
[docs/24](docs/24-session-retrospective.md) and [docs/25](docs/25-v1.3-retrospective.md). Fresh-context
review caught every serious bug. But fix loops, oversized contexts and hitting the usage cap cost about
half the spend. The design, the evidence behind it, and how to tell whether it's working are in
[sluice/docs/design.md](sluice/docs/design.md), and the package as a whole in
[sluice/](sluice/README.md).

**The idea in one paragraph.** You write down *what* you want, as a scope doc in which every item has
acceptance checks someone can run. A large model plans each item and decides its design up front. The
cheapest model that can be checked builds it. A hook won't let a builder finish while typecheck, lint
or the unit tests fail. A fresh large model reviews the diff against the acceptance checks, without the
builder's reasoning; a fresh agent fixes what it finds. After two fix rounds, the item goes back to
planning. Each block of items ends with an audit across them, the full test suite, and a one-screen
summary of what it cost and how often work passed first time. You check the result at the end.
Anything with one right answer (running the checks, counting and pricing tokens, the budget, the
summary) is done by small scripts and hooks, not by an agent, so it costs no tokens.

| Command | What it does |
|---|---|
| `/sluice scope <notes or file>` | Turns your notes into a scope doc, asking multiple-choice questions until every item has observable acceptance |
| `/sluice run <scope doc> [block]` | Builds a block, item by item, on the `sluice/<tranche>` branch, with a checkpoint commit per accepted item. It checks the usage window before each launch and stops cleanly near the limit |
| `/sluice summary <tranche> [block]` | The block's summary: first-pass acceptance, fix rounds, spend by role and per item in usage windows, gate blocks |
| `/sluice retro <tranche>` | The tranche's retrospective, from the scoreboard: this tranche against every earlier one, and the one change to try next |
| `/sluice status [scope doc]` | The usage budget, and each item's state |

**Feeding back.** Everything the sluice does is written to `docs/progress/<tranche>/` and committed: the
plan for each item, every review, a record of each agent run, a ledger of time and tokens, and each
block's summary with a code-health snapshot. One `docs/progress/scoreboard.jsonl` keeps a line per block
across every tranche. At the end of a tranche:
- Run `/sluice retro <tranche>`: it compares the tranche with every earlier one, from the scoreboard, against
  the signs of success and failure in
  [the design's §15](sluice/docs/design.md) and the hypotheses in [sluice/docs/roadmap.md](sluice/docs/roadmap.md).
- **A project lesson** (a class of bug a review caught, or one that escaped) goes straight into
  `.claude/sluice/project.md` as a review lens.
- **A process change** (a threshold, a role's instructions, a script) is made in `sluice/template/claude/`
  first, copied into `.claude/`, and logged as a hypothesis in the roadmap with the signal that will
  settle it. Change **one** thing at a time, then run the next tranche. The sluice's self-test
  (`node .claude/sluice/selftest.mjs`) fails if the two copies drift apart.

That way the process improves with the product. The parts that name specific models and prices are
confined to [the design's §14](sluice/docs/design.md) and `config.json`.

**Star Chart as a case study.** Building the app well is one goal; learning to build software better
and faster with the fewest tokens is the other. The sluice's evidence comes from this repository: the
retrospectives ([24](docs/24-session-retrospective.md), [25](docs/25-v1.3-retrospective.md)), the
measured tranche in [sluice/docs/case-study.md](sluice/docs/case-study.md), and from v1.4 on, the
scoreboard, ledgers and block notes under `docs/progress/`. The roadmap's hypotheses cover the process,
what else could become a script, and the codebase's long-term health, starting from the baseline
`node .claude/sluice/health.mjs` prints today (`scripts/health-complexity.mjs` adds the complexity count).

| Part | Where |
|---|---|
| Role definitions (model, effort, limits) | `.claude/agents/` (planner, builder, clerk, reviewer, fixer, auditor) |
| The orchestrator's playbook; the rules every role follows | `.claude/skills/sluice/`, `.claude/skills/item-contract/` |
| Star Chart's own notes for the agents: sources of truth, review lenses, how to verify | `.claude/sluice/project.md` |
| Hooks and scripts: gate, ledger, budget, summary, code health, scoreboard, statusline, self-test | `.claude/sluice/` (project settings in `config.json`) |
| The gate and ledger hooks, and the statusline | `.claude/settings.json` |
| The canonical copy of all the above (except `config.json` and `project.md`), and the design, evidence and roadmap | `sluice/` |

## Docs

Start with these:
- [01 Product brief](docs/01-product-brief.md): what it is and the doc map.
- [docs/progress/handoff.md](docs/progress/handoff.md): where the work stands and what's open.
- [27 v1.4](docs/27-v1.4.md): the active plan, built with the sluice (`sluice/`), with human sign-off gates.

| Doc | For |
|---|---|
| [02 Domain rules](docs/02-domain-rules.md) · [03 Contracts](docs/03-contracts.md) | Normative: invariants, shapes, IPC, env vars |
| [04 ADO ingestion](docs/04-ado-ingestion.md) | Every ADO call, auth, caching, loading by level |
| [05 Playback](docs/05-playback.md) | Replay, the story schedule, the rulebook |
| [06 Visual brief](docs/06-visual-brief.md) · [09 Signal ladder](docs/09-signal-ladder.md) | Art direction, and how work state is drawn |
| [08 Layout solver](docs/08-layout-solver.md) | Layout and sizing, including what hasn't worked |
| [12 Glossary](docs/12-glossary.md) · [13 Game design](docs/13-game-design.md) | Solar's vocabulary and rules |
| [15 Reference](docs/15-reference.md) | Every value: palette, sizes, timings. Kept in sync with the code by `docTables.test.ts` |
| [90 Later](docs/90-later.md) | Deferred work, including distribution |
| [sluice/](sluice/README.md) | How work gets built: the sluice, its design, its evidence and its roadmap (vendored; doc 26 points there) |

`docs/archive/` is historical and conflicts with the current docs in places. Don't treat it as current.

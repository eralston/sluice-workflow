# Star Chart

A macOS Electron app that renders Azure DevOps work as a replayable, painted space chart. Start with
[docs/01-product-brief.md](docs/01-product-brief.md).

## How to work here
- Build through **the sluice** (below), following the active plan, [docs/27-v1.4.md](docs/27-v1.4.md): v1.4's intake,
  which `/sluice scope` turns into its scope doc (goal, rules, blocks, items with acceptance, open questions). The v1,
  v1.1, v1.2 and v1.3 plans (17, 19, 22, 23) are archived. The standing rules R1–R14 are in
  [docs/13-game-design.md §1](docs/13-game-design.md#design-pillars).
  Read the docs that task names, plus [docs/02-domain-rules.md §1](docs/02-domain-rules.md#1-invariants)
  every time.
- **Values live in [docs/15-reference.md](docs/15-reference.md):** palette, signal ladder, roles and
  assets, sizes, maneuvers, effects, actions → what you see, timings. Change a constant and its row
  in the same change; `docTables.test.ts` fails until they match.
- For layout or sizing work, also read [docs/08-layout-solver.md](docs/08-layout-solver.md): it records
  what has and hasn't worked.
- For any art that shows a work state, follow [docs/09-signal-ladder.md](docs/09-signal-ladder.md)
  (one color, ornament, contrast, and motion per rung), and review it in `npm run gallery`.
- `02` and `03` are normative. If code needs to depart from them, update the doc in the same change
  and call it out in the item's build record and its block note.
- Don't load `docs/archive/`. It's historical rationale (the v0 slice plan, the v1 charter and
  inventory, closed slice notes) and conflicts with the current docs in places.
- Each item's work folder and its block note (in `docs/progress/<tranche>/`) are its record; stop at
  human gates (HG-*) for sign-off. A closed tranche's files move to `docs/archive/progress/`.
- **Picking up the work?** Read [docs/progress/handoff.md](docs/progress/handoff.md) first: where the
  work stands, the user's standing preferences, and what's open.

## Hard rules
- **No real ADO data, ever.** Use only the synthetic fixtures in `fixtures/scenarios/`, with
  invented names. Never ask the user to paste work items, API responses, or screenshots of real
  data. Live checks (AC-34, AC-35) are run by the user, who reports pass or fail only (INV-18).
- **Never handle a real PAT.** Tests use the canary token defined in the e2e suite (INV-17).
- The app never writes to ADO (INV-21).
- Keep `src/shared/` pure: no Electron, DOM, or Pixi imports.
- Use Pixi **v8** APIs only, with a WebGL renderer. Use the official PixiJS agent skills
  (https://pixijs.com/blog/june-2026) to avoid v7 idioms.
- Put the SQLite DB under `app.getPath('userData')`, never in this folder (it's a git repo; real
  work-item data must never be committed).
- This is a local prototype, so public npm is fine. Move to the Federation's Artifactory before sharing
  builds.
- Node is pinned with Volta (the `volta` key in `package.json`), on Node 24 to match Electron 44.
- Commit once per accepted item, after its checks pass (the sluice's orchestrator does this; see below).

## The sluice
New work runs through the sluice (design: `sluice/docs/design.md`): `/sluice scope` turns notes into a scope doc,
`/sluice run <scope doc>` builds a block with the planner, builder, reviewer, fixer and auditor agents
(`.claude/agents/`), `/sluice summary` reports it, and `/sluice retro` closes a tranche from the scoreboard. Work files live in `docs/progress/<tranche>/` and are
committed. The orchestrator commits each accepted item on `sluice/<tranche>`; sluice agents never commit,
and nothing is pushed.
- **This project:** every tranche from v1.4 uses the sluice (v1.3 closed under the older slice process,
  archived in doc 23). Star Chart's lenses for the sluice's agents are in `.claude/sluice/project.md`.
  The sluice was called "the flow" until 2026-11-01: v1.4 keeps its `flow/v1.4` branch and its earlier `flow(<ID>)`
  commits; new commits use `sluice(<ID>)`, and v1.5 opens on `sluice/v1.5`.
- **Changing the process:** edit `sluice/` (the vendored package; upstream is canonical), never only
  `.claude/`, and log the change as a hypothesis in `sluice/docs/roadmap.md`.

## Commands
`npm run dev` · `npm test` · `npm run e2e` · `npm run fixtures` · `npm run typecheck` · `npm run lint` ·
`npm run gallery` (art gallery: every object in every stage; development only, see 06 §8) ·
`npm run dist:mac` (unsigned DMG in `dist/`; `dist:mac:dir` for just the `.app`).
**Releases:** every push to main runs [.github/workflows/ci.yml](.github/workflows/ci.yml): checks, then a
DMG, a Windows installer and a source zip as GitHub Release `v<tranche>.<n>` (tranche from
`docs/progress/v*/`, patch one past the last tag).
E2E windows stay hidden; `STAR_CHART_TEST_SHOW=1` shows one, pinned to the top-left.
**Iterating:** don't run the full e2e suite after each change. Run the specs mapped to what changed
plus `npm run e2e:keystone` (~40 s), and `npm run e2e` once before handing back. To look at a change
for real, use `npm run drive -- <steps.ts>`. See [tests/README.md](tests/README.md).
Dev runs write a redacted log of the session to `logs/run-*.jsonl` (gitignored; the last 3 are kept;
salted hashes and counts only, see 03 §10). Read it after the user has clicked around.

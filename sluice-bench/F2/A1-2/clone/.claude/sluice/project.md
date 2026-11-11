# Star Chart: notes for the sluice's agents

The sluice's planner, reviewer, auditor and fixer read this file. The hard rules in CLAUDE.md
(fixture data only, never a real PAT, the app never writes to ADO, `src/shared/` pure, Pixi v8 only) apply
on top of it. Grow it from evidence: each lens below is here because a review caught it in v1.3, or
because it escaped.

## Sources of truth
- **Values:** every constant with a row in `docs/15-reference.md` changes with its row, in the same edit.
  `tests/unit/docTables.test.ts` fails until they match.
- **Normative docs:** `docs/02-domain-rules.md` §1 (invariants, INV-*) and `docs/03-contracts.md`
  (shapes, IPC, launch variables). A departure means amending the doc in the same change, and saying so
  in the run record.
- **Standing rules R1–R14:** `docs/13-game-design.md` §1, and the active scope doc's Rules. The ones
  reviews cite most: R3 (the outside matches the inside), R4 (counts first, no reflow), R9 (the drawn
  count is the true count), R11 (an object arrives before its label), R12 (ADO words first, the metaphor
  beside them).
- **Art that shows a work state:** `docs/09-signal-ladder.md`. **Layout and sizing:**
  `docs/08-layout-solver.md`, which records what hasn't worked.

## Review lenses
- **The effect where it's meant:** check the change on the busy fixtures it's for (Halcyon's Pulsar and
  Quasar pods), not only on the default scene. In v1.3, a new setting passed every test and did nothing
  on the busy pods.
- **Shared Pixi resources:** `destroy(true)` and texture or geometry teardown can free resources the main
  chart shares. Check that the chart still renders after the new view closes. This one froze the chart.
- **ADO failure semantics** (`docs/04-ado-ingestion.md` §6): a 401 on a scope-gated call (threads,
  builds, boards) means a missing scope, not a dead token. One 5xx on one item never fails a sync. Reads
  go through the throttle, and are deferred where the stream defers.
- **Users' caches:** a migration must not wipe what it doesn't need to. Prefer clearing checkpoints, so
  history re-reads lazily, over clearing facts or team lists. Check the first launch after an upgrade.
- **The drawn count is the true count (R9):** no `+N` beside a free slot, no object without a reason it
  can state, and counts that match what's drawn.
- **Frame budget:** dense scenes (Pulsar, 20 captains) sit near the p95 budget. Any per-object filter or
  extra pass needs a before-and-after perf run (`tests/e2e/perf.spec.ts`).
- **Electron surfaces:** drag and drop, navigation and file dialogs. A drop anywhere off the chart must
  never navigate the window. Test-only seams work only in unpackaged builds.
- **Mode and state that outlive a session:** anything that switches mode (fixture or ADO, a tour) must
  survive Cmd-Q without leaving the user stuck.

## How to verify here
- **Tests for the files you touched:** `tests/README.md` maps code areas to e2e specs. Run them with
  `npm run e2e:spec -- <names>`, plus `npm run e2e:keystone` (~40 s). Never run the full suite per item.
- **Seeing a change:** `npm run drive -- <steps.ts>` (examples in `tests/drive/steps/`) takes stills of
  the real app. Put stills meant for the human gate in the item's work folder, and name them in the block
  note.
- **Art:** `npm run gallery` shows every object at every stage, including reduced motion.
- **Goldens:** update only the golden your item meant to move; check its diff line by line.
- **Fixtures:** `fixtures/scenarios/` (invented names only); the Halcyon demo's coverage is guarded by
  `halcyonCoverage.test.ts`.
- **Shared `out/`:** e2e, drive, build and gallery all rebuild it, so one at a time (`with-lock.sh` when
  parallel).

## Vocabulary
The metaphor is in `docs/12-glossary.md`: galaxy, star, planet, captain, station, pod. Use the ADO name
first in anything a user reads (R12).

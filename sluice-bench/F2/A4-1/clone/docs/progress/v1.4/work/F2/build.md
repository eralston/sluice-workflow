# F2 Summon on the fly: build record

Not committed (the orchestrator commits). Fixture data only (INV-18).

## What changed (files)

- `src/shared/engine/pace.ts`: `PaceRule.passes` (a rule whose crew ships pass through the work without stopping);
  `facility.enter` is `passes: true`, phases `gather 715, act 1200, land 600` (2515 ms; no tell).
- `src/shared/engine/maneuvers.ts`: a passing rule holds no crew turn (`holdsCrew`): its `durMs` is its phases, and its
  ships are released at the act's start (`releaseOf`, and `releaseOfPlay`, which now reads `id` to find the rule).
  New `PASS_PLATE_MS` (= `CREW_FOLD_MS + NOTE_MIN_MS`): how long the passing ship's plate shows.
- `src/renderer/src/chart/fx/movers.ts` (`Sortie`): a `pass` mode. It speeds into the spot (ease-in), gives no hold, and
  slows on to its next place (ease-out) over `max(backS, waitS + 0.4)`, so a waiting P4 sortie takes the ship over while
  it is still moving; its plate (`crewOpen`) rides for `rideS`.
- `src/renderer/src/chart/fx/commands.ts`: `PursueArgs.rideS` turns a sortie into a pass.
- `src/renderer/src/chart/fx/v1/interpreter.ts`: a passing rule's crew plate opens at the act and shuts `PASS_PLATE_MS` later.
- `src/renderer/src/theme/starChart/maneuvers/stationJumpIn.ts`: no tell, no fold-ring repeat, no hold or fly-back. The act
  gives one call blip (a ring on the passing ship, `HERO_GLOW`, the arrival ring's `0.7 -> 1.6` shape) with the station's
  `jump` act, flare and ring at the same instant. A guest (no ship here) still drops in at the spot.
- `src/renderer/src/gallery/maneuverDemos.ts`: `agentStillMs`, `agentTravel`, `reducedAgentTravel` on every demo's stats.
- `scripts/pacing-built.ts`: `BUILT` entry `F2` (all seven pods, undirected, before = E1's jump-in); the earlier items now
  run both schedules with E1's jump-in (`withoutSummonOnTheFly`), as E7/E8/E10 do for theirs, so their frozen rows hold.
- Docs: `docs/15-reference.md` §7 row (2515, what you see), `docs/13-game-design.md` §6 row, `docs/05-playback.md` §8 M-13 row.
- Regenerated (`npm run pacing -- --candidates`): `docs/progress/v1.4/pacing-ledger.{md,json}`, `pacing-built.json`,
  `pacing-candidates.json`.

## Decisions

- Phase shape: gather (0) + act + land; the 600 ms land stays as part of the arrival. 2515 ms against E1's 2815.
- The hold goes in the engine too: durationMs = phases; the ship is released at the act (the blip).
- The blip is issued by the act phase, at the ship's live anchor, so it needs no timing of its own; under reduced
  motion `pursue` snaps (skipped), so the ship is at its rest and the blip and arrival play there.
- The leg on from the spot lasts `PASS_PLATE_MS` (2.3 s) with nothing waiting, so the plate rides a moving ship the whole
  time (the test requires the ship never to park while the plate shows). Speed at the pass is not matched across the
  two legs (fast in, slower out); accepted.
- F2's ledger row is undirected for both runs (like E1's): directed, the budget fit re-spends the saving on Quasar and
  Pulsar (Pulsar showed -1.8 s), which the test forbids and which would hide what F2 itself saves.
  Saved s: Comet 0.3, Nova 2.3, Quasar 16.5, Pulsar 18.9, Convoy 7.0, Harbor 3.3, Meteor 34.3.

## Golden changes

- `tests/golden/__golden__/director.json` (regenerated with `-u`): Comet estimateMs 53065 -> 50745; Nova 188375 -> 186055;
  Quasar 296189 -> 296950 (it grows 0.76 s: the budget fit re-spends the saving) and tempo 1.9 -> 1.8; Pulsar 294434 -> 284444
  and tempo 1.1 -> 1.05; Convoy 187265 -> 180305; Harbor 199565 -> 192605. Forms and climaxes unchanged. Cause: each pod's
  summons are shorter (tell and crew hold gone).
- `npm run fixtures`: no fixture or layout/schedule golden moved (only `director.json` differs).
- Ledger files above: every row moves with the shorter summons; F2 rows added.

## Changes to existing tests (justified)

- `tests/unit/commands.test.ts` › *Station jump-in issues no beacon, bearing or planet rings…*: the gather no longer has the
  fold ring (a repeat of the flight, now the blip's job) and the pursue has no hold; asserts instead that the gather has no
  rings, the pass has `rideS` and no `holdS`, and the act has the blip plus the station's ring. (The planned hazard.)
- `tests/unit/sweep.test.ts` › *Comet's one creation still plays piece.appear…*: Comet's undirected, flat-tempo length
  61_845 -> 61_545 (one jump-in loses its 300 ms tell). A pinned length that legitimately moves.
- The committed F2 tests and `pacingBuilt` frozen rows were not edited (the frozen rows hold by undoing F2 in earlier items' runs).

## Check results

- `npm run -s typecheck`: clean. `npm run -s lint`: clean.
- `npm test`: 110 files, 1729 tests passed.
- e2e: `gallery-summon` 1 passed; `gallery-assets` 4 passed; `solar-play` 7 passed; `npm run e2e:keystone` 43 passed.
- Full `npm run e2e` not run (the brief).

## Unfinished / notes

- The block note and `docs/progress/handoff.md` are not updated. `solar-dense`, `montage-names` and the drive were not run.

## Fix round (review 1)

- **B1**: `PASS_PLATE_MS` is now `2 * CREW_FOLD_MS + max(NOTE_MIN_MS, CREW_OPEN_MIN_MS)` = 2840 ms (unfurl 520, whole 1800, fold 520), so the
  passing plate is whole for `NOTE_MIN_MS` while it rides; the leg on lasts as long, so the ship never parks while named. The
  interpreter's `closeMs` uses the same value. `tests/e2e/solar-dense.spec.ts` (22 B9 captain's turn): the "parked while named,
  moved < 12 px" check now excludes summoners' episodes (event keys `link_pr_added`, the PR linked into a facility), because F2's Decided
  has their plate ride with the moving ship; every other turn must still be parked (and at least two such are required). The episodes now
  carry their event key. Nothing else in the spec changed; the whole-time check (> 1400) passes unedited.
- **M2**: the ledger carries two F2 sets. `F2` (undirected, with rising tempo and late montage now on) is the rule's own saving, as before
  and labelled so; `F2d` is directed with every lever, today's rules, which is what the app plays: Comet 0.3, Nova 2.3, Quasar 7.3,
  **Pulsar -1.8** (the budget fit re-spends the saving, so the pod comes out longer), Convoy 7.0, Harbor 3.3, Meteor 1.3 s. The Built
  section's intro says so. The committed pacingBuilt F2 test (`savedMs >= 0`) filters on id `F2` only, so it is untouched; `F2d` is
  exempt from it by design. Regenerated by `npm run pacing -- --candidates` (ledger .md/.json, pacing-built.json, pacing-candidates.json).
- **M3**: 15 §10 gains a PASS_PLATE_MS row (2840); the CREW_HOLD_MS row says a passing rule holds no turn; CREW_FOLD_MS covers the pass.
- **M4**: 15 §8 marks the tell and the gather fold ring cut, adds the call-blip row, and the `pursue` row covers a pass.
- Minors: m3 names swapped above; m4 05 §8 T-1 reworded; m2 an R8 clause (13 §1) records the exception. Not done: m1 (hold of the
  places to the plate's end), m5, nits n1-n3 (the pass plate outlasts the attention hold by ~0.3 s now; left for the auditor).
- Unit/doc tables: `docTables.test.ts` passes (the §8 verdicts stay plain `cut`; the reason is in the other columns).

### Fix round check results
- `npm run -s typecheck` clean; `npm run -s lint` clean; `npm test` 110 files, 1729 tests passed (after the ledger and doc edits).
- e2e: `solar-dense` captain's-turn spec passes (31 s); `gallery-summon`, `montage-names`, `solar-play`, `gallery-assets` pass; `npm run e2e:keystone` 43 passed.
- Full `npm run e2e`: parallel project 230 passed, 1 failed: `demo.spec.ts:439` (Halcyon plates) timed out under load (60 s) and passes alone (41 s, unrelated to F2;
  also `solar-dense` "History and the scene" failed once in a 5-spec parallel run and passed twice alone). The `alone` project, run separately because
  the failure stopped the chained command: 22 passed, 1 failed: `perf.spec.ts:171` (p95 frame time, Pulsar), which passes when rerun alone (33 s).
  These three are load-sensitive timing checks, not reproduced in isolation.

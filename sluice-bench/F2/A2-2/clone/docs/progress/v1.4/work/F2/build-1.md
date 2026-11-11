# F2 Summon on the fly — build record (round 1)

Built 2026-11-10 in one conversation, without the sluice's planner, builder or reviewer agents (asked for so), so there
is no packet, plan or review file and no ledger.jsonl row: this record stands in for the packet's list of changes and
decisions. Nobody was watching the run; the decisions below are taken from 27's Decisions where they cover them, else
by judgment, and recorded here. Fixture data only (INV-18).

## What changed

- **The rule** (`src/shared/engine/pace.ts`): `facility.enter`'s phases are the flight and the arrival,
  `gather 715, act 1200` (1915 ms; was tell 300, gather 715, act 1200, land 600 = 2815). New `PaceRule.passes`:
  the crew flies through and on, holding no turn.
- **The sequencer** (`src/shared/engine/maneuvers.ts`): a pass's draft isn't stretched for a crew hold
  (`durMs` = its span); its crew is free as it passes (`releaseOf` = the act's start); with P4 on, the same
  person's next flying turn may start so its gather begins at the pass (`passStartMs`); its attention hold lasts
  until its plate has folded (`heldMs`: the act's start + `PASS_RIDE_MS`). `passTimes` (open at the pass, whole
  `NOTE_MIN_MS`, folded: `PASS_RIDE_MS` = 520 + 1800 + 520), `passesPlay`, and `nearWaits` skips a pass (it never parks).
- **The mover** (`chart/fx/movers.ts`): `Sortie` gains a pass mode (`passS`): one Hermite path start → spot (at
  `outS`) → home, with no stop at the spot (bowed left by `PASS_BOW`, so an out-and-back is one loop); it keeps the
  ship until its plate's ride ends. A sortie that takes a pass's ship over carries on at its speed (`Carry`,
  `handoff()`; the runner's `move` hands `make` the mover it replaces). `crewOpen` follows the ride, and into the
  next sortie's flight.
- **The command** (`chart/fx/commands.ts`): `PursueArgs.passS` and `carry`. **The interpreter**: a pass names its
  summoner by `passTimes`, and marks the plate (`showCrew(…, pass)`); `labels.ts` sets `is-passing` on it.
- **The choreography** (`theme/starChart/maneuvers/stationJumpIn.ts`): gather is the pass (`holdS: 0`,
  `backS: 0.8`, `passS`); the act gives **one call blip**, a ring at the summoner (live, so under reduced motion its
  place) in the arrival ring's shape and hue at half the size (`BLIP_SCALE`), with the station's jump, flare and ring
  at the same instant. The tell ring, the fold ring and the land ring are gone (so the file marks no `repeats(`).
- **Docs:** 15 §7 (the row: 1915, what you see), 15 §8 (effect audit: tell, fold and land rows `cut`, the blip row
  added; `pursue`'s row), 15 §10 (`CREW_HOLD_MS`'s row: a pass holds no turn), 13 §6 (the jump-in row), 05 §8 (M-13,
  P-7). No 02 or 03 departure: `PlannedManeuver` and the IPC are unchanged.
- **Ledger** (`scripts/pacing-built.ts`): every item built before F2 runs both schedules with F2 undone (`undoF2`),
  so E1–E10's rows stay as measured; new `BuiltItem.passes` and `app` (every pod, Meteor too, in story time). New rows
  **F2** (undirected: the schedule's own saving) and **F2+** (every lever: what the app plays).

## The saving per pod (`npm run pacing -- --candidates`, story time)

| Pod | F2 before s | F2 now s | Saved s | F2+ before s | F2+ now s | Saved s |
|---|---|---|---|---|---|---|
| Comet | 45.8 | 45.0 | 0.8 | 45.8 | 45.0 | 0.8 |
| Nova | 206.8 | 205.9 | 0.9 | 171.0 | 170.1 | 0.9 |
| Quasar | 971.2 | 955.9 | 15.3 | 289.6 | 289.9 | -0.3 |
| Pulsar | 556.0 | 535.8 | 20.2 | 288.6 | 269.5 | 19.1 |
| Convoy Planning | 183.4 | 174.6 | 8.8 | 179.0 | 170.2 | 8.8 |
| Harbor | 189.8 | 184.7 | 5.1 | 179.8 | 174.7 | 5.1 |
| Meteor | 562.0 | 548.1 | 13.9 | 275.9 | 290.4 | -14.5 |

Undirected, every pod saves. With every lever, the director re-fits a pod over its target to the target, so Quasar and
Meteor spend the saving as story (fewer cuts) rather than time; both stay inside 300 s. Meteor saves less than its 37
summons suggest because each summoner still waits for their own tender's launch (`attachment.open` keeps its author
busy, not flying): chaining them is F3's.

## Golden and pinned-number changes (each named)

- `tests/golden/__golden__/director.json`: `estimateMs` falls on Comet (53 065 → 50 145), Nova (188 375 → 185 455),
  Convoy Planning (187 265 → 178 505) and Harbor (199 565 → 190 805). Quasar 296 189 → 296 041, tempo 1.9 → 1.85,
  and it no longer pulls `light` as a lever (its 116 light forms stay, from the E5c light rules). Pulsar 294 434 →
  298 298: it now fits with short, montage and speed at tempo 2 (was 1.1), so its 72 light forms and the `light`
  lever go. Climaxes and the other form counts are unchanged.
- `tests/unit/sweep.test.ts`: Comet undirected without rising tempo, 61 845 → 60 945 ms (F2's 900 ms).
- `docs/progress/v1.4/pacing-{ledger,candidates,built}.*` regenerated. The Summary's App s: Comet 45.8 → 45.0 (now
  10.5% under its 50.3 s yardstick, for the final check), Nova 171.0 → 170.1, Quasar 289.6 → 289.9, Pulsar 288.6 →
  269.5, Convoy Planning 179.0 → 170.2, Harbor 179.8 → 174.7, Meteor 275.9 → 290.4. The candidates are re-estimated
  against today's rules, as every item's run has done.

## Decisions taken here (no one to ask)

1. **Phases**: "the flight plus the arrival" read as gather + act; the tell (a ring before the flight) and the land
   (a repeat ring) go with the hold.
2. **The plate's ride**: whole for `NOTE_MIN_MS` (1.8 s) between an unfurl and a fold, so it is read as long as a
   note, and the turn-plate check in `solar-dense` (whole ≥ 1.4 s) holds for it too. The attention budget counts it.
3. **The blip**: the arrival ring's shape (0.7 → 1.6 radii), hue (At-rest blue `HERO_GLOW`), length and alpha, at half
   the station's size round the ship, so the two rings don't merge at the spot 1.9 radii out. It is a plain `ring`
   (not a repeat), so it mutes with the station's own ring and never without it.
4. **The pass's ship and the next sortie**: P4's park (`nearWaits`) never applies to a pass; the next sortie, when
   nothing else holds the summoner, sets off at the pass and carries the ship's speed. The sequencer test "no actor
   two at once" now treats a pass's crew work as ending at the pass (the station's arrival plays on without them).
5. **Ledger**: F2 is measured in story time on all seven pods (what the app plays), undirected and with every lever,
   since adaptive speed re-fits a target-bound pod (as E6/E6+ did).

## Checks

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 109 files, 1724 tests pass. New: `commands.test.ts` › *a summon on the fly (27 F2)* (no hold; the act
  within 50 ms of the blip, in fact 0; the blip and arrival ring alike; on the interpreter; under reduced motion no
  flight, the rings at the act); `maneuvers.test.ts` › *a summoner passes* (no crew hold, `passTimes`, no park, the
  next sortie's gather at the pass); `pacingBuilt.test.ts` › *F2* rows.
- e2e: `gallery-assets` (every maneuver demo, the jump-in cell among them, in full and reduced motion with no console
  errors), `solar`, `solar-play`, `solar-dense` (the turn-plate test now also sees passes, whole), `montage-names`,
  `camera-directs`: 54 passed (Meteor's 1024×640 VC-3 is F1's `test.fail`, F5). `npm run e2e:keystone`: 43 passed.
  Full `npm run e2e`: 213 passed, 2 failed. `solar-dense` *facing follows motion* (F1's record lists it as a parallel-run
  flake) passed when re-run alone. **Open:** `demo.spec.ts:439` (*no expanded station plate … scrolls sideways*, A4)
  failed in the full run and again when run alone (a `waitForFunction` timeout at 30 s). It was not investigated (the
  run's budget ran out): run alone it may lack the spec's earlier steps, and whether it fails on 61e4958 is unchecked.
  The reviewer should check it first.

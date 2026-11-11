# F2 Summon on the fly: tests written ahead of the build

These tests were written before the build and fail on this tree (`bench`, after F1). Fixture data only (INV-18): the
renderer tests play pod-sprint's first summoned jump-in (Sprint 13) on a stub scene, and every invented key is
`wi:o:f2-next`.

## Acceptance → tests

| Acceptance line | Test (file › name) | Why it fails now |
|---|---|---|
| Unit test: the summoner's pursue has no hold between its flight and its next place | `tests/unit/summonOnTheFly.test.ts` › *with nothing waiting, it flies out, passes the station, and carries on to its rest with no hold on the way* | The real `Sortie` parks the ship at the spot for `holdS` (crew hold): it sits still for 3800 ms (allowed ≤ 60 ms) |
| … next sortie if waiting (E4's P4) | same file › *with its next sortie waiting (P4), it carries on from the spot to that sortie's place with no hold* | It parks at the jump-in spot for 3820 ms before the next sortie takes it |
| … the station's act starts within 50 ms of the blip; one call blip | same file › *gives one call blip as it passes, at the ship, and the station's act starts within 50 ms of it* | There's no blip: every ring the jump-in draws today sits on the station (`expected [] to have a length of 1`) |
| Decided: same hue and ring shape as the arrival (R8, R10) | same file › *the blip matches the arrival: the same hue and the same ring shape* | No blip to match |
| Decided: named from the blip, plate rides with the ship for `NOTE_MIN_MS` | same file › *the summoner is named from the blip, and its plate rides with the moving ship for NOTE_MIN_MS* | The plate opens at the act (that part passes), but the ship is parked while it shows: it travels 0 in that time |
| Decided: under reduced motion the ship doesn't fly; the blip and the arrival play at its place | same file › *under reduced motion the ship doesn't fly: the blip and the arrival play at its place* | The ship stays put (that part passes), but there's no blip |
| 15 §7's row and `docTables.test.ts`: phases shrink to the flight plus the arrival | same file › *its phases are the flight (gather, from 0) and the arrival (act, and at most its land): no tell, no echo or disperse* | The rule still opens with `tell` 300 |
| … the hold goes (the planner's turn) | same file › *the planned jump-in holds no turn after its work: its length is its phases, and its ship is let go as it passes (the blip)* | The planned `durationMs` is 4835, stretched by `crewTimes` (span 2815); `releaseOfPlay` is 4835, not the claim (1015) |
| … 15 §7's row | same file › *15 §7's facility.enter row gives the new length* | The row says 2815. `docTables.test.ts` already checks that the row matches the code; this test also requires the length to be under E1's 2815 |
| The ledger shows the saving per pod | `tests/unit/pacingBuilt.test.ts` › *F2, summon on the fly: rows on all seven pods …* | `BUILT` has no `F2` entry (`expected [] to deeply equal [ 'Comet Pod', …(6) ]`) |
| A gallery demo cell (the jump-in cell), full and reduced motion, no console errors | `tests/e2e/gallery-summon.spec.ts` › *the jump-in cell: the summoner passes without stopping, and under reduced motion doesn't fly; no console errors (27 F2)* | The cell loops and clears today, but the new stats field `agentTravel` doesn't exist yet (`received undefined`) |
| The schedule goldens are updated and the packet names each change | Not written (that's the build's job; see *Goldens* below) | — |

`npm test`: 10 failures, all of them the F2 tests above; the other 1719 pass. `npm run typecheck` and `eslint` on the
new and edited test files are clean. `npm run e2e:spec -- gallery-summon` fails only on the missing hook field.

## Names the builder must match

- **Gallery demo stats** (`gallery/maneuverDemos.ts` `DemoStats`, for every demo, over its last finished loop):
  - `agentStillMs`: the longest time (ms) the cast's first agent's ship sat still between its first move and its last
    (0 if it never moved). Full motion.
  - `agentTravel`: how far (world units) that ship travelled in the last full-motion loop.
  - `reducedAgentTravel`: the same, for the last loop that ran in reduced motion from start to end.
  The spec needs `agentTravel > 0`, `agentStillMs ≤ 120` (a gallery frame is at most 100 ms), and
  `reducedAgentTravel < 1e-3`.
- **The ledger:** a `BUILT` entry with `id: 'F2'` in `scripts/pacing-built.ts`. It has rows for **all seven** pods
  (`resolvePods({ all: true })`, so Meteor is included: F1 says "F2 to F4 opt in"), each with `savedMs ≥ 0`, and
  Meteor's `savedMs > 0`. The committed `pacing-ledger.md` Built section has a `| F2 …` row for each pod, and
  `pacing-built.json` stays current (the existing test).
- No other new exports. The unit tests use existing public functions only: `planManeuvers`, `releaseOfPlay`,
  `claimMs`, `nearStartMs`, `workEndOf`, `gatherAtOf`, `NOTE_MIN_MS`, `spanMs`, the `ManeuverInterpreter` and its
  `crew()`, and the seed `pursue`/`hold` commands.

## Decisions taken (27's Decisions don't cover these)

1. **Phase shape.** "The flight plus the arrival" means `gather` (the flight) first, at 0, then `act` (the arrival).
   `land` may stay, since the settle could be part of the arrival. No `tell`, `echo` or `disperse`. The test doesn't fix
   the phase lengths. It only requires the total to be under 2815.
2. **The hold goes in the engine too.** A planned jump-in is not stretched by the crew hold:
   `durationMs === spanMs(phases)`. Its ship is released at the blip: `releaseOfPlay(m) === claimMs(m.phases)`, the
   act's start. `NOTE_MIN_MS` still holds the jump-in's place in the attention budget through `heldMs`, as before.
3. **What "the blip" is.** It's one `ring` command call (`cmd.ring`), not centred on the station, drawn at the
   passing ship (within half a station radius of where the ship is drawn when the ring is made). Under reduced motion
   it's drawn at the ship's rest. The station's `act` (`jump`) starts within 50 ms of it.
4. **"Same hue and ring shape".** At least one ring on the station, made within 50 ms of the jump act, has the same
   `color` and the same `r1 / r` as the blip. Its size may differ, since a ship is smaller than a station.
5. **"No hold".** The ship's drawn position never stays still for more than 60 ms (3 frames of 20 ms). This holds from
   its first move until it first reaches its next place:
   - with nothing waiting, its rest (`goalOf`);
   - with a P4 sortie waiting, where it's drawn at that sortie's act start.
   The test plays the waiting sortie at the planner's own `nearStartMs` start.
6. **"Plate rides with the ship".** The summoner's crew plate (`fx.crew()`) opens within 60 ms of the jump act and
   stays open at least `NOTE_MIN_MS` (allowing 40 ms of frame slack). During that time the ship travels more than one
   station radius and never parks for more than 60 ms.
7. **The jump-in cell** is the Maneuvers section's `facility.enter` demo (`[data-art="maneuvers:facility.enter"]`),
   not the station-art *Jump-in* cell in `gallery/v1/stations.ts`.
8. **`pacingBuilt`'s frozen-rows filter** (`E1 to E5 measure what they measured before volleys`) now also skips ids
   starting with `F`, so the new F2 rows don't break it.

## Hazards for the build (existing tests the change will move)

- `tests/unit/commands.test.ts` › *Station jump-in issues no beacon, bearing or planet rings…* reads the gather's
  single fold ring (a repeat) and the land's ring. Update it to the new choreography.
- `tests/unit/pacingBuilt.test.ts` `BEFORE_VOLLEYS` freezes E1's rows. E1's "now" run uses today's `facility.enter`,
  so F2 will move those rows, and E4a/E4c's too, if summons are on their critical paths. Undo F2 in the earlier
  items' runs (as E7, E8 and E10 do for theirs), or the frozen rows fail.
- `tests/unit/maneuvers.test.ts` › *an attachment opens once its facility has entered* (`afterMs: enter.durationMs`)
  should still pass with the shorter `durationMs`.
- `tests/unit/docTables.test.ts` §7: change 15 §7's `facility.enter` row (Length ms, What you see) with the code.

## Goldens expected to change (not regenerated here)

- `tests/golden/__golden__/director.json`: each pod's `estimateMs`, and possibly its `forms` and `climaxes`, since
  every pod has a summon.
- The committed ledger files `docs/progress/v1.4/pacing-ledger.{md,json}` and `pacing-built.json`
  (`npm run pacing -- --candidates`).
- Probably unchanged: the layout goldens (`*.plan.json`, `*.round.json`, `*.scenes.json`, including
  `halcyon-meteor.*`) and the v0 goldens (`*.schedule.json`, `*.seek.json`, `*.highlights.json`), which don't play
  Solar maneuvers. The packet should name any that move.

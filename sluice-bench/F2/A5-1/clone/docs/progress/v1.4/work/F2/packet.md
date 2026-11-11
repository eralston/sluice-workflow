# Packet F2: Summon on the fly
Risk: medium (every summon in every pod: the schedule, the sequencer's release, a mover and a choreography; nothing persisted) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 2b339311f6c41ce312fa42d4afee5565de4d06b7

## Acceptance
- A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors.
- A unit test: the summoner's pursue has no hold between its flight and its next place, and the station's act
  starts within 50 ms of the blip.
- 15 §7's row and `docTables.test.ts`. The schedule goldens are updated, and the packet names each change.
- The ledger shows the saving per pod.

How to read it (decided here): **"the schedule goldens"** are the files that the schedule feeds. The v0 `*.schedule.json`, `*.seek.json` and `*.highlights.json` goldens don't run maneuvers, so they must not move. The Solar `*.plan.json` and `*.scenes.json` goldens are layout and projection, so they must not move either. The ones that move are listed under Checks.

## Approach
1. **Engine, the rule (`pace.ts`).** `facility.enter` gets `phases(['gather', 715], ['act', 1200], ['land', 600])`, 2515 ms. The tell goes: its faint ring before the flight was a second call, and the scope wants one. Add a new `PaceRule.passes?: true`: "its crew flies through without stopping (27 F2). No held turn: the ship's plate rides from the act for `NOTE_MIN_MS`." Set it on `facility.enter` only.
2. **Engine, the sequencer (`maneuvers.ts`).** `crewTimes(phases, passes = false)`: when passing, `{ openMs: claim, closeMs: claim + NOTE_MIN_MS − CREW_FOLD_MS, leaveMs: claim }`. The plate unfurls at the blip and is folded by `claim + NOTE_MIN_MS`. Other rules are unchanged.
   - In `draftsOf`, a flying, non-plate draft whose rule passes gets `durMs = max(spanMs, claim + NOTE_MIN_MS)` (2515 today) in place of `leaveMs` (4835 today). That 2320 ms per summon is the saving.
   - `releaseOf(d)` and `releaseOfPlay(m)` return `claimMs` first when it passes (the ship never stops), then fall back to today's rule.
   - `planned()` copies the flag to a new **`PlannedManeuver.passes?: true`** (`contracts/maneuver.ts`). The renderer and the ledger read it from the plan and never look it up in the global `PACE_RULES`. That way the ledger's "F2 undone" runs stay exact.
3. **The mover (`movers.ts` `Sortie`, `commands.ts` `PursueArgs`).** Add `PursueArgs.pass?: { turnR: number }`, which `pursue`'s `make` passes into a new last `Sortie` parameter, `pass: { turnR } | null = null`. In pass mode `holdS` is 0. The ship's path has three parts:
   - **Out leg:** the same quadratic as `arc()` (lift 0.18), eased with `k(u) = (3u² − u³)/2`, so it starts from rest and passes the spot at speed. A jump (`takeJump`) keeps `jumpIn`.
   - **Coast** (only while `waitS > 0`, i.e. P4's next sortie is waiting): `p = spot + ĥ·turnR·(1 − e^(−τ'/τ))`, where τ' is the time since the spot, `τ = turnR / v₀`, and v₀ is the out leg's end speed. ĥ is the out leg's end tangent: `slot − control` normalised, or `(dir, 0)` after a jump. The ship never stops, and it stays within `turnR` of the spot until the next sortie's pursue takes it over (`liveOf` start).
   - **Onward leg** over `backS`: a quadratic from where it is (fixed once at the leg's start), with control point `P0 + ĥ·min(L/2, turnR)`, to the live `goalOf(pk)`, eased out with the cubic `1 − (1 − u)³`. The ship never reverses at the spot. It swings at most `turnR` past it.
   - `crewOpen(foldS)` in pass mode: with `h = t − outS` and `n = NOTE_MIN_MS / 1000`, return 0 outside `[0, n]`, else `min(1, h/foldS, (n − h)/foldS)`. Not passing: today's code.
4. **The choreography (`stationJumpIn.ts`).** Use one ring shape for the call and the arrival: a local `callRing(at, r) = cmd.ring({ at, r: r*0.7, r1: r*1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 })`, which is today's act ring.
   - **gather:** only the pursue, `cmd.pursue({ pk, durS: gather/1000, pass: { turnR: R*0.95 }, backS: NOTE_MIN_MS/1000, to: spot, look: f.at, wake: 4 })`. No `holdS` or `crewHoldMs`. The fold ring goes: it repeated the call.
   - **act** (the same runner tick, so the blip and the station's jump are simultaneous): the **blip** `callRing(a ? a.at : spot, R*0.5)`, not `repeats`. It sits at the ship's live point, which is the spot in full motion and the ship's own place under reduced motion (pursue snaps there). Then today's `cmd.act(f.key,'jump')`, flare, and `callRing(f.at, r)`.
   - **land:** unchanged.
   - Pull the spot maths into a `spotOf(c)` helper. With no ship (the `away` guest), the guest jumps in at the spot as today. It can't carry on to a rest it doesn't have on the board, so it jumps out as the arrival ends: `durS = spanMs/1000`.
   - The 1.8 s onward leg (`NOTE_MIN_MS`) is chosen so that the plate rides the whole leg and folds as the ship settles.
5. **The interpreter (`interpreter.ts` ~617).** `crewTimes(m.phases, !!m.passes)` for `showCrew`. `nearWaits`' `waitS` injection needs no change: a passing pursue gets `waitS`, and that is the coast.
6. **Ledger (`scripts/`).** Export `beforeF2(rules)` from `pacing-ledger.ts`. It maps `facility.enter` to `{ ...r, passes: undefined, phases: phases(['tell',300],['gather',715],['act',1200],['land',600]) }`.
   - `pacing-built.ts`: add `BuiltItem.passes?: true` (it runs with F2 in today's rules; every earlier item runs both schedules on `beforeF2(...)`, as measured) and `all?: true` (its pods come from `resolvePods({ all: true })`, adding Meteor). In `buildBuilt`, the base rules are `item.passes ? [...PACE_RULES] : beforeF2([...PACE_RULES])`, then today's sweep filter. Always pass the "now" run's rules explicitly.
   - Add two rows, mirroring E6 and E6+. **`F2` 'Summon on the fly (before adaptive speed)'** is `{ before: beforeF2, directs, sweeps, rises, late, passes, all, both: { levers: ['short','montage'] }, estimateMs: {} }`. **`F2+` 'Summon on the fly, with every lever'** is the same without `both`. C2 never modelled either.
   - `pacing-candidates.ts`: `NO_SWEEP = beforeF2(PACE_RULES.filter(...))`, so C2's committed numbers don't move. That is the same reason the sweep filter is there.
   - Regenerate with `npm run pacing -- --candidates`.
7. **Docs (02/03 normative, same change).** Update these:
   - 15 §7's row: Length **2515**, What you see.
   - 15 §8's effect audit: the tell `ring` row → `cut`, Beat ms 300; the gather `ring` fold row → `cut`; the `pursue` row's Meaning becomes "Who summons it, flying past where it comes in". Add an act row: `` `ring` call blip at the summoner `` | Who called it, as it arrives | `act` jump | 0 | keep.
   - 15 l.1123's what-you-see.
   - 13 §6's jump-in row (l.685).
   - 05 §8 M-13 (l.716). Add to P-7 and P-16 (l.763, 777): "a rule that `passes` (the summon, 27 F2) holds no turn: the ship flies through, named from the act for `NOTE_MIN_MS`".
   - 03: the `PaceRule` field list (l.1027–1032), and new lines beside l.1490–1498 for `PaceRule.passes?`, `PlannedManeuver.passes?`, `PursueArgs.pass?` and `crewTimes(phases, passes?)`.
   - Name the 03 amendment in the build record.
   - The stale header comments in `stationJumpIn.ts` and `tests/drive/steps/solar-station.ts` ("broadcasts its beacon", "holds").

## Files
- `src/shared/engine/pace.ts` 44–90 (`PaceRule`), 500–513 (`facility.enter`)
- `src/shared/engine/maneuvers.ts` 40–91 (`crewTimes`, `flies`), 300–325 (`workEndOf`, `releaseOf`, `crewBusy`), 360–395 (`draftsOf`'s `durMs`), 617–620 (`heldMs`), 726–745 (`planned`), 798–835 (`releaseOfPlay`, `flyingPlay`, `nearWaits`)
- `src/shared/contracts/maneuver.ts` ~55–95 (`PlannedManeuver`)
- `src/renderer/src/chart/fx/movers.ts` 238–345 (`Sortie`)
- `src/renderer/src/chart/fx/commands.ts` 45–59 (`PursueArgs`), 111–126 (`crewHoldMs`), 357–370 (`pursue`)
- `src/renderer/src/theme/starChart/maneuvers/stationJumpIn.ts` (all, 60 lines)
- `src/renderer/src/chart/fx/v1/interpreter.ts` 270–290 (`crew()`), 600–630 (`play`'s naming), 690–702 (`stays`)
- `scripts/pacing-ledger.ts` 56–68, 100–106; `scripts/pacing-built.ts` (all); `scripts/pacing-candidates.ts` 294–300, 335–345
- Tests: `tests/unit/commands.test.ts` 160–235 (rig), 484–500 (the jump-in test); `tests/unit/maneuvers.test.ts` 330–345; `tests/unit/pacingBuilt.test.ts` 153–156; `tests/unit/sweep.test.ts` 164–180; `tests/e2e/gallery-assets.spec.ts` 128–170
- Docs: `docs/15-reference.md` 818, 907–963, 1123; `docs/13-game-design.md` 685; `docs/05-playback.md` 716, 763, 777; `docs/03-contracts.md` 1025–1032, 1488–1500

## Excerpts
- Scope, Decided (27 F2): "The summoner's path passes through the spot without stopping. As it passes, it gives **one call blip**, and the station jumps in at that instant, in the same hue and with the same ring shape, so the two read as one cause and effect (R8, R10). The hold and the fly-back go. The ship carries on to its next place: its next sortie if one is waiting (E4's P4), else its rest beside its work (13 §4). The summoner is named from the blip (E2: plates from the act) and its plate rides with the ship for `NOTE_MIN_MS`. The rule's phases shrink to the flight plus the arrival (a 15 §7 row). Under reduced motion the ship doesn't fly: the blip and the arrival play at its place."
- R8: every motion means something. R10: identity by more than one cue. R11: an object arrives before its label. INV-15: playing to *x* and seeking to *x* draw the same thing. A pass changes only travel; the end state (the station on the board, the ship at rest) is today's.
- `NOTE_MIN_MS = 1800` (maneuvers.ts:42): "The least time a labelled interaction holds its place in that budget, so its note can be read." `CREW_FOLD_MS = 520`, `STAY_NEAR_MS = 3000`.
- 15 §7 check (docTables.test.ts:668): `Length ms` must equal `spanMs(rule.phases)`. Effect audit: a `mutes first` row exists exactly when the file has a `repeats(` call. Land keeps its `repeats`, so the land row stays `mutes first`.
- Project notes: "Values: every constant with a row in 15 changes with its row, in the same edit." "Goldens: update only the golden your item meant to move; check its diff line by line." "The effect where it's meant: check the change on the busy fixtures (Pulsar, Quasar)." "The smallest window, looked at: 1024×640."
- 05 P-7 today: "A maneuver a captain flies (it has a gather) lasts until they leave: parked at the act's start, whole at least `CREW_HOLD_MS` past the work …"

## Checks
New and changed tests:
- `commands.test.ts`, new `describe('Summon on the fly (27 F2)')`. This covers acceptance line 2.
  - (a) `jump.gather` returns one `pursue` with `pass`, no `holdS` and no ring. `jump.act` returns a blip ring at the agent's point and a station ring with the same `color`, `r1/r`, `durS` and `alpha`, plus `act jump`.
  - (b) A `Sortie` in pass mode on a stub scene (`wake: 0`, no jump; record `placeAt`), stepped at 1/60 s. Every frame moves by more than 1e-6 world units until it ends, with `waitS` 0 and with 1.8. It is within 1 unit of the spot at `outS`, ends at `goalOf`, and its `crewOpen` is 0 before `outS` and > 0 at `outS + 0.9`.
  - (c) The interpreter rig: give `host` an `act(pk, a)` that logs. Queue a planned `facility.enter` with a facility node and a ship node, and let the ring recorder log its point. Then |t(blip ring) − t(act jump)| ≤ 50 ms.
  - Update the existing jump-in test (l.484): gather has no ring now.
- `maneuvers.test.ts`: extend the open-and-merge case (l.330). `enter.durationMs === 2515`, `enter.passes === true`, `releaseOfPlay(enter) === claimMs(enter.phases)`, and `crewTimes(enter.phases, true)` is `{ 715, 1995, 715 }`.
- `pacingBuilt.test.ts`: add `&& !x.id.startsWith('F')` to the "E1 to E5 measure what they measured" filter (l.155). Add an F2 test:
  - 7 rows each for F2 and F2+, every `savedMs ≥ 0`, with Pulsar and Meteor `> 0`.
  - F2+'s `beforeMs` equals each pod's `wallMs` in the start commit's `pacing-ledger.json`. Its `nowMs` equals the new file's.
  - `pacing-built.json`'s E rows are byte-identical (check with `git diff`).
- `sweep.test.ts:173` pins Comet at 61 845 ms. Move it to the new value and say in the comment that it moved by F2's one summon.
- `gallery-assets.spec.ts`: a test 'the jump-in cell passes through, in full and reduced motion (27 F2)', modelled on B3's (l.128). The `facility.enter` demo gets `loops ≥ 1`, `reducedLoops ≥ 1` and `stuck 0`. Take stills in the act, `test-results/gallery/f2-jump-in-{full,reduced}.png`, and copy them into this folder. `errors` is `[]`.

Goldens and generated files expected to move (list each in the build record with the reason):
- `tests/golden/__golden__/director.json`: estimates, and forms or climaxes if they shift.
- `docs/progress/v1.4/pacing-ledger.{md,json}`: every pod's tables, Meteor included. F1's pre-F2 Meteor row survives as F2+'s `beforeMs`.
- `pacing-built.json`: only the added F2/F2+ rows.
- `tests/e2e/montageBeats.ts`, only if `director.test.ts` shows a moved montage. Name each ISO that moves.

Expected **not** to move: `pacing-candidates.json`, every v0 schedule/seek/highlights golden, and the Solar plan/scenes goldens. If one moves, stop and report it.

Run: `npm test`; `npm run pacing -- --candidates`; `npm run e2e:spec -- gallery-assets solar solar-play solar-dense montage-names`; `npm run e2e:keystone`. Drive `STAR_CHART_WINDOW_SIZE=1024x640 npm run drive -- tests/drive/steps/solar-station.ts --paradigm solar` and copy two stills into this folder for the gate: the blip frame and the frame after it, with the ship moving on. Report Quasar's and Pulsar's app seconds before and after.

## Out of scope
- Chaining summons (F3) and merges (F4). Only the waiting-sortie coast is here.
- A protect that sets the ship off late, so it reaches the spot after the act: the blip still plays at the act, at the ship's point. Record it under limitations.
- Crew plates under reduced motion. Today `crew()` returns 0 for a ship with no `Sortie`; leave that as it is.
- The tender's launch (`attachment.open`) and every other rule's hold.

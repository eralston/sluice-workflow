# Packet F2: Summon on the fly
Risk: medium (shared schedule and renderer path for every pod with a summon; the goldens and the ledger move, nothing persisted) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 61e49587326f4dab605a1afe09b2e48f431f9fd3

## Acceptance
- A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors.
- A unit test: the summoner's pursue has no hold between its flight and its next place, and the station's act
  starts within 50 ms of the blip.
- 15 §7's row and `docTables.test.ts`. The schedule goldens are updated, and the packet names each change.
- The ledger shows the saving per pod.

How to read it (decided here): **"the jump-in cell"** is the maneuver demo `[data-art="maneuvers:facility.enter"]`.
**"no hold"** means the pursue has `holdS` 0, gets no `waitS`, and its path is never at rest between leaving and
arriving at its place (a test on the pure path). **"the blip"** is the call ring issued in the act at delay 0, when the
ship reaches the spot (`gather.atMs + durS·1000 = act.atMs`). **"the ledger"** is the Built section's new F2 rows, all seven pods (Meteor too).

## Approach
1. **Phases** (`pace.ts` facility.enter): `phases(['gather', 715], ['act', 1200], ['land', 600])`. The tell goes: the flight is the cue. 2515 ms, down from 2815. Add `passes: true` to the rule. New `PaceRule.passes?: true`: "its crew passes (27 F2): named from the act for `NOTE_MIN_MS` in all; it holds no turn, and its ship never parks".
2. **Crew times** (`maneuvers.ts`, beside `crewTimes`): `passTimes(phases)` returns `{ openMs: claimMs, closeMs: claimMs + NOTE_MIN_MS − CREW_FOLD_MS, leaveMs: claimMs + NOTE_MIN_MS }`, and `crewTimesOf(rule, phases)` picks it when `rule?.passes`, else it calls `crewTimes`. Use `crewTimesOf` in `draftsOf`'s `durMs` (l.378) and in `releaseOf` (l.308). Facility.enter is then 715 + 1800 = 2515 = `spanMs`: the plate ends as the arrival does, and `heldMs` stays 2515. Before, it was 4835 (a leave at 1015 + 4315 − 1015 + 520). In `nearWaits`, skip a play whose rule passes, because a passing ship never waits. Leave `releaseOfPlay`, `turnVolleys` and `crewHoldMs` unchanged.
3. **Sequencing is unchanged otherwise.** The next sortie by the same captain still starts at `nearStartMs` (the summon's work end), and `attachment.open` still waits for the end. Just ending the leg and taking over are enough; a ship that flies straight on to its next sortie's spot is F3's chain path.
4. **The path** (`movers.ts`): add exported pure helpers `passTangent(a, spot, home)` and `passPoint(a, spot, home, tan, outS, backS, t, vs?)`.
   - **Tangent:** the unit bisector `unit(unit(spot−a) + unit(home−spot))`. When that sum is under 1e-3 long (home straight back), use `unit(spot−a)` turned +90° (`[-y, x]`). Either way the tangent never points against either leg, so the speed can't reach 0 mid-leg.
   - **Speed at the spot:** `vs = (|spot−a|/outS + |home−spot|/backS) / 2`.
   - **Out leg** (u = t/outS): cubic Hermite from `a` (tangent 0) to `spot` (tangent `outS·vs·tan`).
   - **On leg** (v = (t−outS)/backS): from `spot` (tangent `backS·vs·tan`) to `home` (tangent 0).
   - The helpers are C1 at the spot and at rest only at the two ends.
5. **Sortie pass mode**: a new trailing constructor argument `rideS = 0`. When it is above 0, hold and wait are 0, and `backS = max(backS, rideS)`.
   - Fix the tangent once, at construction, from `to()` and `scene.goalOf(pk)`. Each frame, place the ship at `passPoint` with the live `to()` and `goalOf`.
   - The ship faces by the sign of its x step. The wake is drawn on the out leg as today.
   - Under a jump (`takeJump`), the out leg stays `jumpIn`, and the on leg uses `vs = 0`.
   - `crewOpen(foldS)` in pass mode: with `h = t − outS`, it is 0 outside `[0, rideS]`, else `clamp(min(h/foldS, (rideS−h)/foldS))`.
6. **PursueArgs.rideS?: number** (`commands.ts`): "a pass (27 F2): through `to` with no hold or wait, then on to its place over `backS` (≥ rideS); its captain's plate rides this long from `to`". `make` passes `a.rideS ?? 0` to Sortie.
7. **The choreography** (`stationJumpIn.ts`):
   - Drop `tell`, the fold ring and `crewHoldMs`. Add a `spotOf(c)` helper (today's spot formula) and a `call(at, r)` ring: `cmd.ring({ at, r: r*0.7, r1: r*1.6, color: HERO, durS: 1.2, alpha: 0.7 })`.
   - **Gather:** `cmd.pursue({ pk, durS: gather/1000, rideS: NOTE_MIN_MS/1000, backS: NOTE_MIN_MS/1000, to: spot, look: f.at, wake: 4 })`, with no `holdS`. With no ship, `guest` at the spot for `(gather + NOTE_MIN_MS)/1000`.
   - **Act:** `cmd.act(f.key,'jump')`, the flare (At-rest blue, as today), `call(f.at, drawnR(f))`, and the blip `call(a.at, drawnR(a)*2)`, all at delay 0. The blip resolves `a.at` when the ring is made: at the spot in full motion, and at the ship's place under reduced motion (the ring is `reduced: 'same'`, and pursue snaps). With a guest, the blip is at the spot; with no summoner, there is none.
   - **Land:** as today.
   - **Hue:** both rings are Hero blue, because 15 §2 gives Hero blue to summons and 13 §6 says "the summons is in hero blue". The station's arrival ring moves from At-rest blue to Hero blue, so the blip and the arrival match (R10).
8. **Interpreter** (l.618): `crewTimesOf(ruleById(m.id) as PaceRule | undefined, m.phases)`, so the plate shows from the blip for `NOTE_MIN_MS`. Nothing else changes: the waitS injection already gets nothing for a pass (step 2).
9. **The ledger.**
   - `pacing-ledger.ts` exports `withoutF2(rules)`: facility.enter back to tell 300, gather 715, act 1200, land 600, with `passes` dropped.
   - `pacing-built.ts`: add `BuiltItem.passes?: true` ("runs with F2 and measures every pod, Meteor too"). Items without it run both schedules on `withoutF2(...)`, so E1 to E10 stay as measured. Pass the rules explicitly (not `{}`) for those items. An item with `passes` iterates `resolvePods({ all: true })`.
   - Add two rows: **F2** "Summon on the fly (before adaptive speed)" (`both: { levers: ['short','montage'] }`) and **F2+** "Summon on the fly, with every lever". Both `before: withoutF2`, with `directs`, `sweeps`, `rises`, `late` and `passes`. Their estimates are 0 per pod: C2 never modelled it.
   - `pacing-candidates.ts`: set `NO_SWEEP` to `withoutF2(PACE_RULES.filter(...))`, so C2's numbers don't move.
   - Regenerate with `npm run pacing -- --candidates`.
10. **Docs, in the same change**:
    - 15 §7: the row is 2515, with a new What-you-see. 15 §8 effect audit: the tell and fold rows become `cut` (with the reason 27 F2); add `Station jump-in | act | \`ring\` the call blip on the summoner as it passes | Who calls the station in | — | 0 | keep`. The arrival ring row reads "Hero blue, the blip's shape". The `pursue` commands row adds "or a pass through a spot and on, 27 F2".
    - 13: l.570, l.685 and l.738 (the blip and arrival in Hero blue), plus a grammar row *Call blip* after l.649.
    - 05: M-13 (l.716), P-7 (l.763: a rule whose crew passes holds no turn) and T-1 (l.833: "as its summoner passes").
    - 03 (normative, so amend it and call it out in the record): `PaceRule.passes`, `PursueArgs.rideS` and `passTimes`/`crewTimesOf` beside l.1490–1499, and "or `passTimes`" at l.1104.
    - `tests/README.md`: a mapping line for F2.

## Files
- `src/shared/engine/pace.ts` 40–90 (PaceRule), 498–515 (facility.enter)
- `src/shared/engine/maneuvers.ts` 42, 50–87 (crew constants, `crewTimes`), 300–316, 365–385, 798–832 (`releaseOfPlay`, `flyingPlay`, `nearWaits`)
- `src/renderer/src/chart/fx/commands.ts` 44–58 (PursueArgs), 356–368 (pursue def)
- `src/renderer/src/chart/fx/movers.ts` 232–345 (Sortie)
- `src/renderer/src/chart/fx/v1/interpreter.ts` 276–286, 605–630, 655–672
- `src/renderer/src/theme/starChart/maneuvers/stationJumpIn.ts` (all)
- `scripts/pacing-ledger.ts` 1–30, 100–110; `scripts/pacing-built.ts` (all); `scripts/pacing-candidates.ts` 295–310, 336–345
- Tests: `tests/unit/commands.test.ts` 121–130, 207–216, 482–498; `tests/unit/maneuvers.test.ts` 330–347; `tests/unit/pacingBuilt.test.ts` 10–12, 150–161; `tests/e2e/solar-dense.spec.ts` 400–466; `tests/e2e/gallery-assets.spec.ts` 128–165
- Docs: `docs/15-reference.md` 818, 884, 956–963; `docs/13-game-design.md` 570, 649, 685, 738; `docs/05-playback.md` 716, 763, 833; `docs/03-contracts.md` 1100–1105, 1490–1499

## Excerpts
- 27 F2 Decided: "The summoner's path passes through the spot without stopping. As it passes, it gives **one call blip**, and the station jumps in at that instant, in the same hue and with the same ring shape … The hold and the fly-back go. The ship carries on to its next place … The summoner is named from the blip (E2: plates from the act) and its plate rides with the ship for `NOTE_MIN_MS`. The rule's phases shrink to the flight plus the arrival … Under reduced motion the ship doesn't fly: the blip and the arrival play at its place."
- `NOTE_MIN_MS = 1800`: "The least time a labelled interaction holds its place in that budget, so its note can be read (22 B7)." (maneuvers.ts:42)
- R8: "A ship travels to a target, interacts, finishes, then moves on." R10: "Colour, silhouette and place each say what a thing is." (13 §1)
- 15 §2: "Hero blue … HERO … Hero energy: weapons, summons, phasers"; "At-rest blue … HERO_GLOW … a station's form flash."
- 05 P-7 (today): "A maneuver a captain flies (it has a gather) lasts until they leave: parked at the act's start, whole at least `CREW_HOLD_MS` past the work …"
- CLAUDE.md: "Change a constant and its row in the same change; `docTables.test.ts` fails until they match." "`02` and `03` are normative … update the doc in the same change and call it out."
- Project notes: "Goldens: update only the golden your item meant to move; check its diff line by line." "The effect where it's meant: check the change on the busy fixtures it's for."

## Checks
New or changed unit tests:
- `commands.test.ts`. Rewrite the "Station jump-in issues no beacon…" test, and add **"Station jump-in: the summoner passes, and the station arrives at the blip (27 F2)"**:
  - `jump.tell` is undefined, and gather has no ring.
  - Gather has exactly one pursue: `holdS` absent or 0, no `waitS`, `rideS === NOTE_MIN_MS/1000`, `backS ≥ rideS`, and `|gather.atMs + durS·1000 − act.atMs| ≤ 50`.
  - The act has the blip at the agent's anchor (delay ≤ 50) and the station's ring at the facility, with equal `color` (HERO), `durS`, `alpha` and `r1/r`. The `jump` act is at delay 0.
- `commands.test.ts` (or a new `passPath.test.ts`, loaded by the runtime path as commands.test does), on `passPoint`, in two cases: home ≈ start (the U-turn), and home to the side.
  - The path is at the spot at `outS` (to 1e-6) and at home at `outS + backS`.
  - With a finite-difference speed, the speed is above 0 for every t in [0.05, outS+backS−0.05], and the left and right speeds at `outS` agree within 5%.
- `maneuvers.test.ts`:
  - A one-summon beat's facility.enter has phases gather/act/land, and `durationMs === spanMs(phases) === 2515`.
  - `crewTimesOf(rule, phases)` is `{715, 1995, 2515}`.
  - `nearWaits` gives the summon no wait.
  - The existing "open.afterMs = enter.durationMs" test still passes.
- `pacingBuilt.test.ts`:
  - Exclude `F` ids from the frozen-rows filter (l.155).
  - Add: F2 and F2+ each have seven rows (Meteor too) and never cost time, Meteor saves more than 0, and every E row is unchanged.

Goldens and generated files. Expect these, and name each in the build record with its pods and numbers:
- `tests/golden/__golden__/director.json` (`estimateMs` on pods with summons; regenerate with `npx vitest run tests/golden/director.test.ts -u`).
- `docs/progress/v1.4/pacing-ledger.{md,json}` (the Summary and the per-pod tables; facility.enter's rows lose tell and hold).
- `pacing-built.json` (**only F2 and F2+ rows added**: check with `git diff`).

Expect **no** diff in `pacing-candidates.json` or in any `*.schedule|seek|scenes|plan|round.json` (those schedules don't run the Solar maneuvers). If one moves, explain why in the record before keeping it. If a fixed list moves (`MONTAGE_BEATS` in director.test, `rising`, `volleys`, `sweep`), update it only when F2's shorter beats explain it, and name each entry.

E2e:
- `solar-dense.spec.ts` l.400 (22 B9). Carry each acting plate's event key into its episode. A whole episode on a PR event (`pr_` key) that is whole for under 1200 ms is a summon's pass. Assert that it **moved more than 12 px** (it rides, never parks), and leave it out of the parked and 1.4 s checks.
- `gallery-assets.spec.ts`: add **"Station jump-in passes through, in full and reduced motion (27 F2)"** after the victories test. Pick the `facility.enter` demo; in each mode, loops ≥ 1 and `stuck` 0. Shoot `test-results/gallery/f2-jump-in-{full,reduced}.png`, and copy both into this work folder for the gate. Assert `errors` is empty.
- Run `npm run e2e:spec -- gallery-assets solar-dense solar solar-play`, then `npm run e2e:keystone`.

For the gate: the summoner's plate is whole for about 0.76 s (an unfurl and a fold inside 1.8 s) while flying. Raise it at the final check if it reads short; the knob is `passTimes`.

## Out of scope
- Chains, visit order and a ship flying straight on to its next sortie's spot (F3). Charge runs (F4). Meteor's hit floor (F5).
- Crew naming under reduced motion (unchanged: crews are named only from a live Sortie). The ring budget may cut the blip on a busy frame, as it does any ring; note it, don't change it.
- `crewHoldMs` and every other choreography's sortie. `releaseOfPlay` and the ledger's wait inference: a passing summon binds at its `end`, which is checked first.

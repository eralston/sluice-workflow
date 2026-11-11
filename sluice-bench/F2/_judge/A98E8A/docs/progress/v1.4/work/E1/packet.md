# Packet E1: Fewer signals
Risk: medium (a shared renderer gate, one engine rule retimed, the visual call left to the final check) · Score: blast 1, verify 1, design 1, acceptance 1, track 0
Start commit: 552d631

## Acceptance
- 15 §8 has the meaning column, and `docTables.test.ts` passes.
- The gallery's maneuver demos run with no console errors, in full and reduced motion.
- The ledger shows the saving per pod, against C2's estimate.

## Approach
1. **Cut U4's beams (confirmed by U4's own words and the HG-C pick).** No other duplicate was confirmed at HG-C (27 Decisions 2026-11-01 picks E1 whole and names none), so nothing else is cut. The other duplicates mute first under load (step 4).
   - `stationJumpIn.ts` gather: drop the three beacon `ring`s and the bearing `spark`. The gather becomes the flight alone: `fly = gather` (drop `* 0.55`), so `holdS = rest / 1000`. Keep the fold `ring` at `gather - 600` (made a repeat, step 4) and the guest branch.
   - `stationJumpIn.ts` land: drop the per-seat `CYAN` rings (the planets "catching its light": U4's planet↔station lines). Keep the station's own ring (a repeat, step 4). Drop unused imports (`brighten`, `CYAN`, `present` if unused).
   - `shuttleTender.ts` act: drop the author's `tractor` (U4's captain→station beam after the summons). Drop the unused `TRACTOR` and `phaseMs` imports.
   - `pace.ts` `facility.enter`: gather 1300 → **715** (C2's `E1_GATHER_MS`: the flight's 55%). Length 3400 → 2815. Update the comment above `phases(...)`.
2. **Value on every command.** `CommandDef` gains a required `value: number`: what it tells, per unit of attention. Its cost is `weight` (the attention the volatility meter sums, unchanged) and the beat ms of each use (the audit table's Beat ms). Set value = weight × the band ratio, so today's gate is reproduced exactly: ornament ×2, narrative cuttable ×6, narrative uncuttable ×10, essential ×10. The values are: flare 6, ring 1.5, ink 5, spark 3, tractor 10, support 10, pursue 15, hold 0, protect 0, insignia 0.5, guest 15, charge 5, phaser 10, cutter 10, mine 10, idleBeam 0.5, bolt 1.5, energy 5, stardust 5, enter 5, glint 0.5, allClear 10.
3. **The mute rule replaces P-9's command rule** in `make` (`interpreter.ts:800-806`). Add these to `chart/fx/timing.ts`:
   ```ts
   /** The least value per unit of weight a command needs to play (27 E1, P8): from the calm mark, and from the busy mark. */
   export const MUTE_FLOOR = { calm: 4, busy: 8 } as const;
   /** A call that repeats a meaning another cue gives (15 §8 effect-audit): it mutes first, from the calm mark. */
   export const REPEAT_VALUE = 0;
   export const valuePerCost = (value: number, weight: number): number => (weight > 0 ? value / weight : Infinity);
   export function muteFloor(v: number, ignoreLoad: boolean, ornament = activeProfile().render.switches.ornament): number {
     if (!ignoreLoad && v >= OVERLOAD) return Infinity;
     if (!ignoreLoad && v >= BUSY) return MUTE_FLOOR.busy;
     return v >= CALM || !ornament ? MUTE_FLOOR.calm : 0;
   }
   ```
   `make` gains a `value` argument: essential (the call's flag, a grand flare, or the def's tier) always plays; otherwise it returns when `valuePerCost(value, def.weight) < muteFloor(v, eng.ignoreLoad)`. Delete the two old tier lines. In `issue`, pass `c.value ?? d.value`, where `d` is the def after `reducedCall`'s substitution and `c` is the original call, so a repeat stays a repeat under reduced motion. `spawn`'s maneuver gate (`:479-484`), the idle gate (`:209`), `ornamentOk` and `host.calm()` stay. The profile `ornament` switch, when off, now applies the calm floor at every load, so repeats drop with ornament.
4. **Repeats.** `CommandCall`'s `cmd` variant gains `value?: number`. In `commands.ts`, add `export const repeats = (c: CommandCall): CommandCall => ('act' in c ? c : { ...c, value: REPEAT_VALUE });`. Wrap exactly these 7 calls:
   - Sensor contact: the act's second sweep ring (the one at +350).
   - Station jump-in: the gather's fold ring, and the land's station ring.
   - Power link: the land's surge-ring loop (`for (let t = 400; …)`).
   - Homeworld complete (`seatComplete.ts`): the land's second ring (the one at +350).
   - Landing and Strike run: the echo's `ring` beside the grand flare (not the flare).
5. **The audit table** goes in 15 §8, after `commands`, as `<!-- table: effect-audit -->`, with columns `| Choreography | Phase | Effect | Meaning | Also carried by | Beat ms | Verdict |`. Add one row per cue: the calls in one phase of one choreography that carry one meaning. Cover all 16 registered titles. Put Haul's calls under Rig up, and Station fire's calls under Landing and Strike run (`beamed`). Effect is the backticked command names (or `act`) with a short gloss. Also carried by is `—` when no other cue carries the meaning. Beat ms is the schedule time the cue alone holds open: **585** on the cut beacon row and 0 everywhere else. Verdict is `keep`, `cut` or `mutes first`, and the three cut rows and seven mutes-first rows are the ones in steps 1 and 4. Any other duplicate you notice stays `keep`, with `candidate:` in Also carried by, and is listed in your record for the final check. The `commands` table gains `Value` (after Weight) and `Meaning` (after Reduced: what it says when it plays, one clause). Then add a short paragraph above `commands`: the cost is Weight plus Beat ms, the value is Value, and the mute rule and its floors are in §10.
6. **docTables:** in `commands`, check `['Value', String(c.def.value)]` and a non-empty Meaning. Add `effect-audit` to `GUARDED`, with a check that: every Choreography is a registered title and every title has a row; every Phase is in `PHASES`; every backticked Effect name is a registered command or `act`; Verdict is in the three values; Beat ms is an integer ≥ 0; and a choreography has a `mutes first` row iff its file (the `maneuvers` table's File column) contains `repeats(`.
7. **The ledger's Built section.** Add a new `scripts/pacing-built.ts` that exports `BUILT` = `[{ id: 'E1', name: 'Fewer signals', before: (rules) => rules with facility.enter's phases set back to tell 300, gather 1300, act 1200, land 600, estimateMs: { 'Comet Pod': 585, 'Nova Pod': 585, 'Quasar Pod': 4680, 'Pulsar Pod': 5265, 'Convoy Planning Pod': 1755, 'Harbor Pod': 1755 } }]`. The estimates are C2's committed E1 `savingMs` at 552d631; say so in a comment. It also exports `buildBuilt(inputs = {})`, which returns rows `{ id, pod, beforeMs, nowMs, savedMs, estimateMs, diffMs }` per pod from `resolvePods()` and `scheduleOf`, where before uses `{ ...inputs, rules: before([...PACE_RULES]) }` and now uses `inputs`, and `renderBuilt()`, which renders a `## Built` section with one table: Item, Pod, Before s, Now s, Saved s, C2's estimate s, Difference s. In `pacing.ts`, under `--candidates`, append it after Candidates and write `pacing-built.json`. In `pacing-candidates.ts`, E1's assumption gains "Built (E1): today's rules already have it, so this row reads 0; see *Built*." Ids and order don't change. Regenerate last with `npm run pacing -- --candidates`.
8. **Docs.** 15 §7 `facility.enter`: 2815, and What you see = "The author flies out to where it comes in; space folds, the station slides in; an At-rest blue flare". `attachment.open`: drop the tractor clause. 15 §10 `budgets`: add rows for `MUTE_FLOOR.calm` 4, `MUTE_FLOOR.busy` 8 and `REPEAT_VALUE` 0 (`chart/fx/timing.ts`), and reword the Calm, Busy and Overload Meaning cells in terms of the floors. 15 §11 Ornament row: off applies the calm floor at every load (ornament and repeats). 05 §8.5 P-9 row and §5's note at `:393-394`: commands mute by value per cost. 13 §6 rows Station jump-in and Shuttle tender (`:684-685`), `:569`, and the Broadcast ping row `:648`: mark it "(retired, 27 E1)". **03 is normative:** amend `:826` `CommandDef` (add `value`) and `:829` `CommandCall` (add `value?`), and call it out in your record as a 03 amendment. Grep the non-archive docs for "beacon pulse" and fix any jump-in description you find.

## Files
- `src/renderer/src/chart/fx/v1/interpreter.ts` 1-40, 138-150, 470-485, 760-810
- `src/renderer/src/chart/fx/timing.ts` 30-37, 120-131
- `src/renderer/src/chart/fx/commands.ts` 74-90 (`call`, `cmd`), 295-400 (`SEED_COMMANDS`), 435-460 (`reducedCall`)
- `src/renderer/src/chart/fx/types.ts` 60-75, 108
- `src/renderer/src/theme/starChart/commands.ts` 720-765; `entrance.ts` 100-106; `finales.ts` 135-148
- `src/renderer/src/theme/starChart/maneuvers/stationJumpIn.ts` (all), `shuttleTender.ts` (all), `sensorContact.ts` 21-32, `powerLink.ts` 120-131, `seatComplete.ts` 44-58, `landing.ts` 66-78, `strikeRun.ts` 75-85
- `src/shared/engine/pace.ts` 433-446
- `scripts/pacing.ts` (all), `scripts/pacing-candidates.ts` 11-21, 225-236, 306-308, `scripts/pacing-ledger.ts` 28-50, 151-160
- `tests/unit/docTables.test.ts` 290-310, 655-735; `tests/unit/commands.test.ts` 365-376 (the rig); `tests/unit/pacingCandidates.test.ts`
- `docs/15-reference.md` 800-905, 1078-1115, 1195-1205; `docs/13-game-design.md` 569, 648, 684-685; `docs/05-playback.md` 390-396, 750; `docs/03-contracts.md` 826-829

## Excerpts
- Scope Decided (27 E1): "An audit table in 15 §8: every effect, the meaning it carries, and which other cue already carries that meaning. Cut U4's beams and every duplicate the user confirms at HG-C. Effects gain a cost (in ms of the beat, and in attention) and a value. Under budget pressure, the interpreter mutes the effects with the lowest value per cost first, replacing P-9's ornament rule."
- U4 (intake): "The captain → station communication beam after the captain already summoned the station; the planet ↔ station communication lines; fewer signals overall". P2: "keep two cues per identity, cut the third" (R10).
- C2's model (`pacing-candidates.ts:20`): "`facility.enter` gather 1300 -> 715 (the summoner's flight, 55%, stays; the beacon pulses and bearing go). Other cut effects cost no schedule time."
- P-9 today (05 §8.5): "per command, ornament is dropped whenever the scene isn't calm (`CALM`), even at Maximum." 15 §10: "At Maximum (the default) the busy and overload marks don't apply (`ENGAGEMENT.maximum.ignoreLoad`)". This is why repeats mute from the calm floor: it is the only floor that applies by default.
- R8 "Every motion means something"; R13 "Every emphasized interaction names its ADO cause": the tender's author is still named by the cast label. INV-20: "Reduced-motion mode replaces motion with static highlights and loses no information."
- Project notes: "Values: every constant with a row in `docs/15-reference.md` changes with its row, in the same edit." "Normative docs … A departure means amending the doc in the same change, and saying so in the run record." Lens: "check the change on the busy fixtures it's for (Halcyon's Pulsar and Quasar pods)". Goldens: "update only the golden your item meant to move".

## Checks
- New unit tests in `tests/unit/commands.test.ts`:
  1. **Equivalence.** For every registered command that isn't essential, for v in [0, 4.9, 5, 9.9, 10, 15.9, 16, 30], `ignoreLoad` in both states and the ornament switch on and off, `valuePerCost(def.value, def.weight) >= muteFloor(v, ignoreLoad, sw)` equals P-9's old rule: ornament plays iff `sw && v < CALM`; narrative plays iff `ignoreLoad || (v < OVERLOAD && !(v >= BUSY && cuttable))`.
  2. **Repeats.** With the rig, a `repeats(cmd.ring(...))` call is muted when the volatility is between CALM and BUSY and plays at bias 0. The plain ring plays in both cases. Set `fx.bias` so that `fx.volatility()` lands in [5, 10) once the rig's own live effects count, or use an `ignoreLoad` engagement.
  3. **The cuts.** Station jump-in issues no `spark` and only the fold ring in its gather, and no ring on a seat in its land. Shuttle tender issues no `tractor`.
  The existing "volatility gates tiers" test must still pass unchanged.
- `tests/unit/pacingCandidates.test.ts` (or a new `pacingBuilt.test.ts`, with a 120 s timeout): E1's `savedMs` equals `estimateMs` for all six pods; the committed `pacing-ledger.md` contains `## Built`; the committed `pacing-built.json` equals a fresh `buildBuilt()`.
- Run `npx vitest run tests/unit/commands.test.ts tests/unit/docTables.test.ts tests/unit/maneuvers.test.ts tests/unit/pacingCandidates.test.ts tests/unit/pacing.test.ts tests/unit/stationArrival.test.ts`, then the gate. If a golden moves, only a jump-in's 585 ms may move it. Check its diff line by line, or stop and record it.
- E2E (one at a time): `npm run e2e:spec -- gallery-assets solar solar-play solar-dense`, then `npm run e2e:keystone`. `gallery-assets` is acceptance line 2.
- In your record, give the Built table (six pods) and the 7 repeats' sites. For the block note's human gate, name the gallery's Station jump-in and Shuttle tender cells, and a Pulsar merge.

## Out of scope
- Cutting any duplicate beyond step 1, and changing `spawn`'s maneuver gate, the idle gate, `cuttable`, the live-effects cap or the v0 director (`director.ts`).
- Retiming any rule but `facility.enter`, and E2–E9.
- A `before` hook for method-P or method-F items in `pacing-built.ts`: later E items add their own.
- Changing a profile JSON.

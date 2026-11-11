# Packet F2: Summon on the fly
Risk: medium (the schedule engine and a shared mover, every pod with a summon; checks decide most of it, and the gallery look decides the rest) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 61e49587326f4dab605a1afe09b2e48f431f9fd3

## Acceptance
- A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors.
- A unit test: the summoner's pursue has no hold between its flight and its next place, and the station's act
  starts within 50 ms of the blip.
- 15 §7's row and `docTables.test.ts`. The schedule goldens are updated, and the packet names each change.
- The ledger shows the saving per pod.

## Approach
1. **Engine flag.** Add `passes?: true` to `PaceRule` (pace.ts): *its crew passes through without stopping (27 F2); the
   draft lasts its phases; its crew's plates open at the act's start and ride with the ship for `NOTE_MIN_MS`.* Set it on
   `facility.enter`, and shrink that rule's phases to the flight plus the arrival: `phases(['gather', 715], ['act', 1200])`,
   which is 1915 ms. The tell ring and the land ring go: the blip is now the call (E1, fewer signals).
2. **`crewTimes(phases, passes = false)`** (maneuvers.ts): when `passes`, return `openMs = claimMs`,
   `closeMs = openMs + NOTE_MIN_MS`, and `leaveMs = closeMs + CREW_FOLD_MS`. Export `passesPlay(m)`, which looks the rule up
   in `PACE_RULES` the way `flyingPlay` does. Then, for a `passes` rule:
   - `draftsOf`: `durMs = spanMs(phases)`, never `leaveMs`. This is the saving: today 4835 ms (2815 + the crew hold), now 1915.
   - `releaseOf` and `releaseOfPlay` return the pass `leaveMs` (3035 from the start). The captain's next flying turn sets
     off once the plate has folded (P4, `nearStartMs`), so the plate is never cut short.
   - `heldMs`: `max(durMs, NOTE_MIN_MS, pass leaveMs)` when it's flying, so the attention budget covers the plate (R14).
   - Don't touch the volley path (line 566) or crewBusy's non-near branch. They don't apply here (see Out of scope).
3. **`crewHoldMs(m)`** (fx/commands.ts) uses `crewTimes(m.phases, passesPlay(m))`, which gives 2320 ms for a summon.
   The interpreter's `showCrew` window (interpreter.ts ~line 618) uses the same call.
4. **Pursue passing through.** Add `through?: boolean` and `plateS?: number` to `PursueArgs`. The `pursue` make passes
   `{ plateS }` as a new last constructor parameter of `Sortie`: `pass: { plateS: number } | null = null`. A pass Sortie
   ignores `holdS` and `waitS`, and flies two cubic Hermite legs:
   - P0 is `start`. P1 is `to()` (live). P2 is `scene.goalOf(pk) ?? start` (live).
   - The tangent at P1 is T̂ = normalize(P2−P0). When |P2−P0| < 0.25·|P1−P0| (out and back, the usual case), use
     normalize(P1−P0) rotated +90° instead.
   - The speed at P1 is v = 1.5·(|P1−P0| + |P2−P1|) / (outS + backS).
   - Leg 1, t ∈ [0, outS): from P0 (velocity 0) to P1 (velocity v·T̂), Hermite tangents m0 = 0 and m1 = outS·v·T̂.
   - Leg 2, t ∈ [outS, outS + backS): from P1 to P2, with m0 = backS·v·T̂ and m1 = 0.
   - Once it arrives, it sits at its live goal until `outS + plateS`. Its lifetime is `outS + max(backS, plateS)`.
   - It faces the sign of its x velocity. The streak and wake are drawn as on the out leg, fading over the whole flight.
     A `jump` guest uses `jumpIn` for leg 1, then flies leg 2.
   - `crewOpen(foldS)` uses `plateS` where it used `holdS`, with h = t − outS.
   The ship's speed is above zero everywhere in (0, outS + backS): it never stops at the spot.
5. **stationJumpIn.ts.**
   - Remove `tell` and `land`, and with them every `repeats(` call.
   - The gather issues only `cmd.pursue({ pk, durS: gather/1000, through: true, plateS: crewHoldMs(m)/1000,
     backS: phaseMs(m,'act')/1000, to: spot, look: f.at, wake: 4 })`, with the spot computed as today. The ship reaches its
     rest as the arrival ends. A guest keeps `themeCmd.guest` at the spot, with
     `durS = (gather + crewHoldMs(m))/1000`.
   - The act issues the **blip** first, at delay 0: `cmd.ring({ at: <the agent's point now, pointOf(a.at); else the
     guest's spot>, r: s*0.7, r1: s*1.6, color: HERO_GLOW, durS: 0.6, alpha: 0.7 })`, with s = `drawnR(agent) * 2.5`
     (a guest: `drawnR(f) * 0.5`). After it come today's `act` jump, flare and ring. The blip has the station ring's hue
     and shape (r1/r = 1.6/0.7), so the two read as one cause and effect (R8, R10).
   - Why the ship's live point: in full motion the ship is passing the spot at that instant, so the blip is at the spot.
     Under reduced motion the pursue snaps and is skipped, so the blip plays at the ship's place, as Decided asks, with no
     motion check in the theme.
6. **Ledger.** In `scripts/pacing-ledger.ts`, export `undoPass(rules)`. It maps `facility.enter` back to its E1 form:
   phases tell 300, gather 715, act 1200, land 600, with `passes` dropped by destructuring. In pacing-built.ts:
   - Add `passes?: true` to `BuiltItem`. Every item without it runs both schedules through `undoPass`, the way
     `sweeps`, `rises` and `late` work, so the E rows stay as measured. `BEFORE_VOLLEYS` is a fixed table and must not move.
   - Add `all?: true`, which calls `resolvePods({ all: true })` so Meteor is included.
   - Add two rows, following E6 and E6+: **F2** "Summon on the fly (before adaptive speed)", with `before: undoPass`,
     `both: { levers: ['short','montage'] }`, and the flags directs, sweeps, rises, late, passes and all. **F2+** "Summon
     on the fly, with every lever" has the same settings without `both`. Set `estimateMs` to 0 for all seven pods
     (C2 never modelled it).
   - In pacing-candidates.ts, the baseline becomes `undoPass(NO_SWEEP)`, so pacing-candidates.json doesn't move.
   - Then run `npm run pacing -- --candidates`.

## Files
- `src/shared/engine/pace.ts` 45–91 (PaceRule), 500–515 (facility.enter)
- `src/shared/engine/maneuvers.ts` 42, 57–87 (NOTE_MIN_MS, CREW_*, crewTimes), 123–129 (nearStartMs), 300–319 (releaseOf, crewBusy), 370–381 (draftsOf durMs), 619 (heldMs), 799–834 (releaseOfPlay, flyingPlay, nearWaits)
- `src/renderer/src/chart/fx/movers.ts` 238–343 (Sortie)
- `src/renderer/src/chart/fx/commands.ts` 45–59 (PursueArgs), 111–126 (crewHoldMs), 357–370 (pursue)
- `src/renderer/src/theme/starChart/maneuvers/stationJumpIn.ts` (all)
- `src/renderer/src/chart/fx/v1/interpreter.ts` 278–286 (crew), 612–628 (showCrew), 686–701 (waitS injection: leave it; Sortie ignores it)
- `scripts/pacing-ledger.ts` 31–51, 95–110, 200–210 · `scripts/pacing-built.ts` 8–41, 145–165 · `scripts/pacing-candidates.ts` 296–340
- Docs: `docs/15-reference.md` 818 (§7 row), 956–963 (§8 effect audit), 1123 (§9), 1257 (CREW_HOLD_MS row: add "not a summon, which passes, 27 F2"); `docs/13-game-design.md` 685 (§6 row); `docs/05-playback.md` 716 (M-13), 763 (P-7)
- Tests: `tests/unit/commands.test.ts` 481–499 (the jump-in test, which this changes), `tests/unit/pacingBuilt.test.ts`, `tests/e2e/gallery-assets.spec.ts` 128–170 (pattern)

## Excerpts
- Scope, 27 F2 Decided: "The summoner's path passes through the spot without stopping. As it passes, it gives **one call
  blip**, and the station jumps in at that instant, in the same hue and with the same ring shape, so the two read as one
  cause and effect (R8, R10). The hold and the fly-back go. The ship carries on to its next place: its next sortie if one
  is waiting (E4's P4), else its rest beside its work (13 §4). The summoner is named from the blip (E2: plates from the
  act) and its plate rides with the ship for `NOTE_MIN_MS`. The rule's phases shrink to the flight plus the arrival (a
  15 §7 row). Under reduced motion the ship doesn't fly: the blip and the arrival play at its place."
- Today's crew hold (maneuvers.ts 85): `closeMs = max(workEnd + CREW_HOLD_MS, openMs + CREW_FOLD_MS + CREW_OPEN_MIN_MS, restAt − CREW_FOLD_MS)`;
  for facility.enter that is 4315, so leave is 4835, and `durMs = max(spanMs, leaveMs)` (line 378).
- 15 §2: "At-rest blue | HERO_GLOW | Hero energy at rest … a station's form flash". "Hero blue | HERO | … summons".
- docTables effect-audit: "a `mutes first` row iff the file marks a call `repeats(`". After F2, stationJumpIn has none.
  Set the old tell, fold and land rows to `cut`, with Beat ms 300 for the tell and 600 for the land ring. Add a row
  `act | \`ring\` call blip at the summoner as it passes | The summoner calls the station in | — | 0 | keep`. The gather
  row becomes "`pursue` (or `guest`) the summoner flies through the spot and on to its rest".
- 15 §7 row: Length ms **1915**. What you see: "The author flies through the spot where it comes in and on to its rest;
  as it passes, an At-rest blue call blip, and at that instant space folds and the station slides in; an At-rest blue
  flare".
- Project lens: "Goldens: update only the golden your item meant to move; check its diff line by line."
- R14 (attention is budgeted); INV-15 (play and seek draw the same: the end state is unchanged, the station is in and the
  ship is at rest).

## Checks
- **New `tests/unit/summonPass.test.ts`.** Load renderer modules by runtime path, as commands.test.ts does. It checks:
  (a) facility.enter's phases are gather 715 and act 1200, with `passes`. (b) The jump-in gather issues exactly one
  pursue, with `through: true`, no `holdS`, no `waitS`, `durS` 0.715 and `backS` 1.2, and no ring. (c) The act's blip
  ring is HERO_GLOW, with r1/r = 1.6/0.7, at the agent's point. |(actAt + blip.delayMs) − actAt| ≤ 50, and the jump act
  is at delay 0. (d) A pass `Sortie` on a stub scene (wake 0, no jump; own, placeAt, faceView, facingOf, currentScale,
  goalOf, release, restoreFacing, fadeView), stepped at 1/120 s: it is at the spot (±1e-6) at outS; its speed is above 0
  at every step in [0.02, outS + backS − 0.02]; it ends at goal; a given `waitS` doesn't change its lifetime; `crewOpen`
  is above 0 at outS + 1 and is 0 after plateS. (e) `planManeuvers` on an attach board: enter.durationMs is 1915,
  open.afterMs is 1915, and releaseOfPlay(enter) is 3035.
- Update the jump-in case in commands.test.ts: the gather has a pursue and no ring, and `jump.land` is undefined.
- pacingBuilt.test.ts: a test that F2 and F2+ each have seven rows (including Meteor Pod), with savedMs ≥ 0 everywhere,
  Meteor saving more than 0, and F2+ Pulsar and Quasar now ≤ 300 000. Leave the existing assertions alone.
- gallery-assets.spec.ts: add a test for the Station jump-in cell (`facility.enter`) that waits for a loop in full
  motion and then in reduced motion, takes a screenshot of each to `test-results/gallery/jump-in-{full,reduced}.png`,
  and expects `errors` to be empty. Copy both stills to the work folder as `build-1-jump-in-full.png` and
  `build-1-jump-in-reduced.png`.
- Regenerate: `npm run pacing -- --candidates`, then `npx vitest run tests/golden -u`. **Expected to move:**
  `tests/golden/__golden__/director.json` (each pod's estimateMs, and possibly tempo, forms and climaxes, because the
  summons got shorter), `docs/progress/v1.4/pacing-ledger.{md,json}` (each pod's wall time), and
  `pacing-built.json` (the new F2 and F2+ rows only; every E row byte-identical). **Expected unchanged:** every
  `*.schedule.json`, `*.seek.json`, `*.highlights.json`, `*.scenes.json`, `*.plan.json`, `*.round.json`,
  `v1-awards.json`, and `pacing-candidates.json`. The v0 schedule path doesn't use the pace rules. If anything outside
  the expected list moves, explain it line by line in the record. If the summon's timing doesn't explain it, stop there. Name each moved file and why in `build-1.json`.
- Run `npm test`, then `npm run e2e:spec -- gallery-assets solar solar-play solar-dense`, then `npm run e2e:keystone`.

## Out of scope
- Chains of summons, `facility.run` and visit order (F3). The pass mover takes a single spot; F3 generalizes it.
- crewBusy's non-near branch, which only the ledger's E4c "before" uses. A next same-captain turn there could cut the
  plate. Note it under `limitations`.
- Captain plates under reduced motion: `crew()` returns 0 when there's no Sortie, so no captain is named under reduced
  motion today. That is pre-existing; note it, don't fix it.
- The blip is a cuttable `ring`, so under heavy load the mute rule could drop it. Note it, don't add a command.
- The interpreter's P4 `waitS` injection stays as it is (the pass Sortie ignores it). Volleys and merges don't change.

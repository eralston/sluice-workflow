# F2 Summon on the fly: review 1

**Verdict: changes requested.** The acceptance lines the tests pin are met honestly, and the checks pass. Two
Decided behaviours aren't built: the ship doesn't carry on to a waiting next sortie (P4), and a captain new to the
scene loses its jump-in. The riding plate also outlives the attention budget's hold (R14). None of these is
tested, so the green suite doesn't cover them.

## Checks run
- `npm run -s typecheck`: clean. `npm run -s lint`: clean.
- `npm test`: 110 files, 1730 tests passed.
- `npx electron-vite build`, then `npx playwright test tests/e2e/summon-on-the-fly.spec.ts tests/e2e/gallery-assets.spec.ts`: 7/7 passed (the jump-in cell in full and reduced motion with no console errors; Meteor's lone summon in full and reduced motion).
- A probe script, kept outside the repo in `/tmp`: for every pod's planned beats, the `facility.enter` plays to which `nearWaits` gives the summoner a P4 wait (results under M1).

## Acceptance
| Line | Met? |
|---|---|
| Gallery jump-in cell, full and reduced motion, no console errors | Yes (e2e passes; the cell lasts the phases, 2815 ms). |
| Unit: no hold between flight and next place; the station's act within 50 ms of the blip | Yes, by construction: the blip is the act's first call at delay 0, beside `act jump`. Not gamed: the test simulates the real `Flyby` frame by frame. |
| 15 §7 row and `docTables`; schedule goldens updated, the packet names each change | Partly (m2, m3). The row's text changed and its Length didn't. The goldens' changes aren't each named. |
| The ledger shows the saving per pod | Yes for short+montage levers. With every lever the saving isn't shown (m4). |

## Test changes: judgement
- `tests/unit/commands.test.ts`: justified. The old assertions pinned the gather fold ring, which F2 removes on purpose: the blip replaces it, and 15 §8's audit row is replaced to match. The new assertions are stricter: `pass === true`, no `holdS`, and two act rings. The Shuttle tender check is unchanged, with only its variable renamed.
- `tests/unit/pacingBuilt.test.ts` filter `!x.id.startsWith('F')`: justified. `BEFORE_VOLLEYS` holds only E1 to E5 rows, and the F2 row is new. The committed rows E1 to E10 in `pacing-built.json` are byte-identical: the diff only appends seven F2 rows. That's because the pre-F2 items run with `held()`, which follows the precedent of `sweeps`, `rises` and `late` (E7, E8, E10).
- `tests/golden/__golden__/director.json`: the regeneration is genuine. Only the director's estimates and tempo move, and no other schedule golden carries a `facility.enter`. Not every change is a saving, though (m3).

## Findings

### M1 (Major): the summoner never carries on to a waiting next sortie; the P4 wait is dropped silently
`src/renderer/src/chart/fx/commands.ts:367`
```ts
if (a.pass) return new Flyby(scene, a.pk, start, live(a.to), live(a.look ?? a.to), a.durS, a.backS ?? a.durS, a.wake ?? 0);
```
The interpreter still injects P4's `waitS` into the summoner's pursue (`interpreter.ts:700-703`, via `nearWaits`, which now releases at `workEndOf`). `Flyby` ignores it, so the ship always flies to `goalOf` (its rest) and then flies out again for its next turn. Decided says: "The ship carries on to its next place: its next sortie if one is waiting (E4's P4), else its rest beside its work." build.md Decision 3 admits this isn't built and isn't pinned by a test.
Evidence (the probe, `nearWaits` over every pod's planned beats): Meteor has 37 summons, and **34** give the summoner a P4 wait. Pulsar has 9 summons, and 1 gets a wait. In those cases the ship passes the spot, glides home over 0.8 s, sits, and flies back out: the stop-and-go the item exists to remove. F3 will chain Meteor's same-captain summons, but F2's Decided covers the single case now, and Pulsar's single case isn't a chain.
**Fix:** when the summoner has a P4 wait, the pass's on-leg should end at its next sortie's spot, or the next sortie should take over from where the ship is drawn without flying home first. One way: `Flyby` honours `waitS` by easing to a stop near the spot. Better: hand off to the next turn. Add a unit test.

### M2 (Major): a captain new to the scene this beat loses its jump-in; it is hidden through the flight
`src/renderer/src/chart/fx/commands.ts:367` (the `pass` branch returns before `scene.takeJump(a.pk)`). `Sortie` received `scene.takeJump(a.pk)` and dropped the guest out of hyperspace at its spot (K-13, 22 C8). The `Flyby` path never takes the jump. The interpreter's jumpers (`interpreter.ts:504-545`) are captains not in `ctx.before`. Each has `scene.markJump(pk)`, which calls `fadeView(pk, 0)`, so it stays invisible while the `Flyby` moves it. At gather + 0.6 s the fallback fires (`if (!scene.takeJump(pk)) return;` fails to return because the jump is still pending). It then issues the rest entrance or a `FadeIn`, mid-flight and while the `Flyby` owns the node. The result: the blip is given at a ship that is invisible or only half faded in, and two movers place one node.
**Fix:** in the `pass` branch, `if (scene.takeJump(a.pk))`, either jump in at the spot and then carry on, or fall back to the `Sortie` jump path. Add a unit or e2e case with a summoner new to the beat.

### M3 (Major): the riding plate outlives the budget's hold (R14)
`src/renderer/src/chart/fx/v1/interpreter.ts:621`
```ts
const crew = onFly ? { openMs: claimMs(m.phases), closeMs: claimMs(m.phases) + Math.max(NOTE_MIN_MS, CREW_FOLD_MS + CREW_OPEN_MIN_MS + 250) } : crewTimes(m.phases);
```
The plate is whole from 1015 to 3285 ms and folds until about 3805 ms. The planner's attention hold is `heldMs = max(durMs, NOTE_MIN_MS)` (`maneuvers.ts:619`), which is now 2815 because `durMs` no longer includes `crewTimes().leaveMs`. So for about 1 s, the planner counts places as free while this plate still shows. A crowded beat can then show `ATTENTION_MAX + 1` labels (R14, 22 C10). The interpreter can over-run the budget this way because it no longer agrees with the planner. Before F2, `durMs` covered `leaveMs`, so the two matched.
**Fix:** derive one window, used by both the planner (`heldMs`, or the draft's `durMs`) and the interpreter, for example a shared `flyCrewTimes(phases)` in `maneuvers.ts`. Name its value in 15 §10 rather than writing a bare `+ 250`.

### m1 (Minor): the doc and the code disagree on the plate's length, and R8 and the shut-in-flight rule have no carve-out
- 13 §6 (`docs/13-game-design.md:685`) and the `PaceRule.onTheFly` comment (`pace.ts:87`) say the plate rides for `NOTE_MIN_MS` (1800 ms). The code uses 2270 ms, built from an unnamed 250 ms. This departs from Decided ("for `NOTE_MIN_MS`"). The departure is in build.md but not in the docs, and it isn't flagged for the block note.
- 15's `CREW_FOLD_MS` row says the plate is "shut in flight" (`Sortie.crewOpen`). `rides` overrides that (`castLabels.ts:107`) with no note in the row.
- R8 ("movement and interaction never blur into one", 13 §1) is now contradicted by design (the call is given in flight). The departure was the user's decision, but 13 §1 should note it.
**Fix:** make the docs match the code, or the code match `NOTE_MIN_MS` after M3. Add the exceptions to the 15 row and to R8.

### m2 (Minor): "the rule's phases shrink to the flight plus the arrival" is read as "the length stays the phases'"
`src/shared/engine/pace.ts:520`. The phases are unchanged (tell 300, gather 715, act 1200, land 600), so 15 §7's Length row didn't move. The acceptance's "15 §7's row" implies that it does. The 300 ms tell (a ring before the ship moves) is neither flight nor arrival. tests.md Decision 4 leaves tell to the builder, so this isn't a test failure, but it is a reading of the Decided that should be confirmed. **Fix:** confirm with the user or the block note that tell stays, or drop it (saving 300 ms per summon) and update the 15 §7 Length.

### m3 (Minor): build.md doesn't name each golden change, and one of them is a cost
`tests/golden/__golden__/director.json`: Quasar's `estimateMs` goes **296189 → 298283 (+2.1 s)** with tempo 1.9 → 1.8. Pulsar's goes 294434 → 287015 with tempo 1.1 → 1.05. build.md says only "Comet 53065 -> 51045 etc." The acceptance asks that "the packet names each change". **Fix:** list each pod's estimate and tempo change in build.md. Explain why Quasar's directed estimate grows: speed relaxes, so the target re-fits.

### m4 (Minor): the ledger shows only the short+montage saving; the app's own (every lever) is hidden
`scripts/pacing-built.ts:148`. The F2 row follows E6's lever restriction, which is fine as a precedent. E6, however, also has `E6+` ("with every lever") beside it, and F2 has none. build.md records that with every lever Pulsar is −3908 ms, a cost, and that number appears nowhere in the ledger. **Fix:** add an `F2+` row with every lever, as E6+ does, so the ledger shows what the app plays.

### n1 (Nit): dead parameter and wasted work in the `pass` path
- `Flyby` takes `look` (`movers.ts:247`) and never reads it.
- In `commands.ts:366-367`, `to` (with `clearOfPlate`) is computed before the `pass` branch, which then ignores it and calls `live(a.to)` again.
- `holdS` and `waitS` are dropped without a trace when `pass` is set; at least a comment, and see M1.

### n2 (Nit): `onTheFly(id)` duplicates `ruleById`
`src/shared/engine/maneuvers.ts:800` searches `PACE_RULES` again. `ruleById(id)?.onTheFly` is already used in the interpreter. The module stays pure: no Electron, DOM or Pixi imports were added to `src/shared/`.

### n3 (Nit): `PASS_ON_S = 0.8` is a timing literal outside 15
`stationJumpIn.ts`. It's the old fly-back literal under a new name, and 13 §6 states 0.8 s. A 15 §7 or §10 mention would keep "values live in 15" whole.

## Not found
- No Pixi v7 idioms: `Flyby` reuses `Streak` and `Graphics`-free drawing.
- No real data and no PAT use.
- Reduced motion is as Decided: the pursue snaps, and the blip and arrival play at the ship's place (unit and e2e).
- The other pods' committed Built rows are unchanged.

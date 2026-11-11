# Packet B3: Victory gold flashes, then settles
Risk: medium (shared art code every asteroid and hive ship wears, plus a new act through the adapter; the contrast is decided by a unit test, the flare by hooks and review copies) · Score: blast 1, verify 1, design 0, acceptance 1, track 1
Start commit: 22bde78c5aae046aef472a0bf749f78ce91428dc

## Acceptance
- `auraContrast`: gold's resting rim is within ±10% of red's and blue's contrast on the night sky.
- The gallery's maneuver demos for the three victories show the flare and the settle (review copies), with
  no console errors in full or reduced motion (`gallery-assets` spec).

## Approach
1. **Resting weight is 0.68, not "about 0.6".** In the test's nominal model, red is 3.47:1 and blue 4.18:1, so the band that sits within 10% of both is 3.76 to 3.81. Only 0.68 lands in it at two decimals (3.78: +9.1% on red, −9.5% on blue). 0.60 gives 3.10, which fails both. It also matches the drive: gold measured 9.6 at weight 1, against 7.61 nominal (×1.26), so 0.68 predicts about 4.8 measured, and red and blue measured 4.7 and 4.9. Set `AURA_BALANCE.accomplished = 0.68`.
2. **New constants in `aura.ts`:** `AURA_FLARE_WEIGHT = 1` (gold's weight at a flare's peak, the old weight) and `AURA_FLARE_MS = 1600`. 1600 is the close's land plus echo (1200 + 400), so the outline settles as the grand blossom takes over. Add a pure `export function flareShare(u: number): number`, equal to `1 − smoothstep(clamp(u, 0, 1))` (that is, `1 − u²(3 − 2u)`): 1 at the land, a brief hold near the top, then an ease to 0 at u = 1. It adds no constants.
3. **`Aura.setFlare(share)`:** clamp to 0..1 and store it. Return early if the value hasn't changed. If the colour is gold, rewrite both filters' matrices. `matrix()` uses `k = rest + (AURA_FLARE_WEIGHT − rest) × flare` for gold only, so red and blue ignore the flare and the order of `setColor` and `setFlare` doesn't matter (the look lands at the same instant the act fires). `setColor` and `fill` already call `matrix()`, so they pick the flare up. Add `export function auraFlareIn(root: Container): number`: the highest flare share among live, visible, attached auras that sit under `root` (walk up `parent`) and are gold now, else 0. Only the gallery calls it. `AuraReading` stays as it is, so 03 §10 doesn't change.
4. **Art views:** add `setAuraFlare(share: number): void` to `HiveShipView` (`this.aura.setFlare`), `AsteroidView` (likewise), and `AtlasAsteroidView`. The atlas view keeps a `flare` field and forwards to `proc` or else to its own `aura`; `toProcedural` re-applies it to the new view.
5. **The act, through the existing overlay seam (no new clock):** in `adapt.ts`, `Overlay` gains an optional `end?: () => void`, which `clearOverlay()` calls before destroying the Graphics. `Act<V>` may now return `null`, which means "nothing to play": `act()` returns at once and sets no `acting` state. This is cleaner than an empty overlay, and better than returning void, which would schedule a stage re-set. The overlay is cleared at u ≥ 1, at `rest` (and so at a seek, through `GraphScene.landAllStages`), by another overlay act, and on destroy. So `end` always puts the resting weight back (INV-15).
6. **`victory` in `assets/acts.ts`:** `export const victory = (art: { setAuraFlare(s: number): void }): Overlay | null`. Under `motion.reduced` it returns `null`, so there is no flare and only the resting weight shows. Otherwise it returns an overlay that draws nothing into `g`. Each frame it calls `art.setAuraFlare(motion.reduced ? 0 : flareShare(u))`, with `durS = AURA_FLARE_MS / 1000` and `end = () => art.setAuraFlare(0)`. Add `'victory'` to the `acts` lists in `objective.ts` (`victory: (art) => victory(art)`) and `threat.ts` (`acts.victory = (art) => victory(art)`). Update the header comment in acts.ts.
7. **Choreographies:** at the start of `land`, add `cmd.act(s.key, 'victory')` to `landing.ts` (every variant: base, beamed, arc), to `strikeRun.ts` (after the arc's `breakup` act), and to `seatComplete.ts`. In seatComplete, `s = one(c, 'subject')` is the closed piece's platform, which is already gold. Issue the act only if `s` exists and isn't gone. Acts aren't cut by load, so the flare plays at every engagement.
8. **Gallery demos (`maneuverDemos.ts`):** `DemoStats` gains `flare` (now: `auraFlareIn(this.root)` after `scene.tick`), `flarePeak` and `reducedFlarePeak`. These are the peak over the last finished loop in each mode: track `flarePeakNow`, reset it in `restart()` and when play starts, and store it into the mode's field where `loops` and `reducedLoops` are counted. The test hooks expose the new fields through `list()` unchanged.
9. **The gallery cell beside the role outlines:** add one wide cell, `outline-flare`, to `v1-asteroids`, right after `platformCells`. Title it `outlines · victory gold beside red and blue (27 B3)`. It shows an open asteroid (metal, `underway`, blue), an open hive ship (`stageOf(0, 'ready')`, as in `gallery/v1/swarm.ts`, red) and a closed platform (gold) in a row. It's a custom `ArtView` modelled on `Ladder` in gallery/v1/swarm.ts. It ticks its three views and flares the platform once per loop of `AURA_FLARE_MS / 1000 + 2` s (share `flareShare(phase / flareS)` while `phase < flareS`, else 0). Under `motion.reduced` the share is 0. Note: `Gold rests at red's and blue's contrast; a victory flares it to full, then it settles over 1.6 s`. Don't give it a cycle.
10. **Docs, in the same change:** see Excerpts for each line. 15 §2 (the two gold rows), §6 line 780, §8 (the aura table and the gold contrast row, from the drive), §10 (a new budgets row beside *An act's overlay*). Also 09 lines 118 and 237, 06 lines 1195–1201 (the balance bullet), and 05 line 732 (M-25 lists the acts; add `victory`).
11. **Re-measure:** run `npm run drive -- tests/drive/steps/c1-contrast.ts --paradigm solar`. It runs in reduced motion, so it measures the resting gold. Put the new gold numbers into 15 §8's contrast table ("Weight before → now" becomes `1 → 0.68`) and into line 780 and 06. Update `PINNED` in auraContrast. If measured gold falls outside ±10% of measured red and blue (4.41 to 5.17), don't retune: the unit test is the acceptance. Report it under `limitations` for the human gate.

## Files
- `src/renderer/src/chart/art/aura.ts`: 1–20 (header), 58–90 (constants, readings), 186–205 (`matrix`, `setColor`), 207–246 (`fill`), 290–310 (`setAlpha`, `destroy`).
- `src/renderer/src/theme/starChart/assets/adapt.ts`: 18–36 (`Overlay`, `Act`), 100–160 (`act`, `clearOverlay`, `tick`, `rest`).
- `src/renderer/src/theme/starChart/assets/acts.ts`: 1–17 (header, `env`), plus any act as a model.
- `src/renderer/src/theme/starChart/assets/objective.ts`: 27–48. `src/renderer/src/theme/starChart/assets/threat.ts`: 25–45.
- `src/renderer/src/chart/art/asteroids.ts`: 786–790, 1010–1030, 1310–1320. `src/renderer/src/chart/art/asteroidAtlas.ts`: 55–175. `src/renderer/src/chart/art/swarm.ts`: 866–905, 980–990, 1215–1230, 1455–1462.
- `src/renderer/src/theme/starChart/maneuvers/landing.ts`: 59–71. `strikeRun.ts`: 58–70. `seatComplete.ts`: 47–58.
- `src/renderer/src/gallery/maneuverDemos.ts`: 87–110 (`DemoStats`), 325–412 (`ManeuverDemo`), 435–450 (hooks).
- `src/renderer/src/gallery/v1/asteroids.ts`: 164–215. `src/renderer/src/gallery/v1/swarm.ts`: 1–20 (`stageOf`), 76–112 (`Ladder`).
- `src/renderer/src/chart/scenes/GraphScene.ts`: 410–428 (`actView`), 858–864 (`landAllStages`), 1093–1099 (acts rest). Read only.
- `tests/unit/auraContrast.test.ts` (all). `tests/unit/artActs.test.ts` (all). `tests/unit/registries.test.ts`: 120–130, 193–end. `tests/e2e/gallery-assets.spec.ts` (all).
- `docs/15-reference.md`: 116, 130, 780, 888–926, 1112. `docs/09-signal-ladder.md`: 118, 237. `docs/06-visual-brief.md`: 1195–1201. `docs/05-playback.md`: 732.

## Excerpts
- Scope, Decided (27 B3): "Gold's resting weight drops to match red's and blue's contrast (about 0.6, measured by the `auraContrast` unit test). At the land of a victory (`objective.accomplish`, `threat.accomplish`, `seat.complete`), the rim flares to weight 1 and eases back over a duration that is a 15 §10 value. Under reduced motion there is no flare, only the resting weight. A gallery cell sits beside the role outlines."
- Project notes, sources of truth: "every constant with a row in `docs/15-reference.md` changes with its row, in the same edit. `tests/unit/docTables.test.ts` fails until they match."
- The §8 aura rows are checked as a number in the Value column (`check('aura')`). The new rows are `` `chart/art/aura.ts` AURA_BALANCE.accomplished | 0.68 | × alpha | Solar | … `` (rewrite its Meaning: it rests at red's and blue's contrast, 27 B3; it was 1, at 9.6:1) and `` `chart/art/aura.ts` AURA_FLARE_WEIGHT | 1 | × alpha | Solar | Gold's weight at the peak of a victory's flare … ``. The §10 `budgets` rows must contain the constant's number in Value, so add `| Victory flare (new, 27 B3) | 1600 ms | `chart/art/aura.ts` AURA_FLARE_MS | … |`. Say in it: at the land of the three victories the gold outline flares to `AURA_FLARE_WEIGHT` and eases back (a smoothstep) to its resting weight over this, on the scene clock (the `victory` act's overlay); a seek rests it at once (INV-15); there is none under reduced motion.
- 15 §2, line 130 (to amend): "| Victory gold | `chart/art/aura.ts` AURA.accomplished | `#FFC76B` | Solar | The outline on anything Closed (`= SUCCESS`) | Open work |". Add to its meaning: at rest, the same contrast as red and blue; it flares at a victory (§8, §10). Line 116 lists "the outline on anything Closed": leave it alone unless the docTables colour-name check complains.
- 09 line 237 (to amend): "Each outline holds at least 3:1 against the night sky, red and blue alike, gold more". The new text: gold the same at rest, and it flares to full brightness at a victory, then settles. 09 line 118, Accomplished: "Burst, then none | One accent or maneuver on the transition, then still | … Solar's grand gold flare". Add: "and its gold outline flaring, then settling".
- 06 line 1200: "(4.7 and 4.9:1), gold 9.6:1." Change it to the new measured gold, with the reason (27 B3).
- aura.ts already says, on `AURA_BALANCE`: "Retune one and re-run the drive, then update tests/unit/auraContrast.test.ts". Rewrite that comment for the resting and flare weights.
- auraContrast.test.ts, as it stands: "gold stays the brightest outline" (`nominal.accomplished > max(red, blue)`). It contradicts B3: replace it (see Checks).
- R8 (13 §1): every motion means something. The flare marks the victory, and nothing else drives it. INV-12 and INV-15: the resting look is a function of the snapshot, and a seek clears transient looks (here through `rest` → `clearOverlay` → `end`).
- Frame-budget lens: the change adds no filter and no pass. It only rewrites two existing matrices per flaring aura per frame, for 1.6 s. No perf run is needed: say so in your record.

## Checks
- **Unit tests (new and changed):**
  - `auraContrast.test.ts`:
    - (a) New test: nominal resting gold is within 10% of red AND within 10% of blue (`|g − r| / r ≤ 0.1`, `|g − b| / b ≤ 0.1`). This is the acceptance line.
    - (b) Replace "gold stays the brightest" with: at `AURA_FLARE_WEIGHT`, nominal gold is above both red and blue.
    - (c) `PINNED.accomplished = 0.68`, plus `AURA_FLARE_WEIGHT: 1`, after the drive.
    - (d) Update the header comment.
  - `artActs.test.ts`:
    - `victory` is listed on both the `asteroid` and the `hive` asset, and is issued in `landing.ts`, `strikeRun.ts` and `seatComplete.ts` (from the `issued` list).
    - With `motion.reduced = false`, `victory(fake)` returns an overlay with `durS === AURA_FLARE_MS / 1000`. Calling it at u = 0 sets the share to 1, and at 0.5 to a value strictly between 0 and 1. `end()` sets it to 0.
    - With `motion.reduced = true`, it returns `null`. Restore `motion.reduced` afterwards.
    - `flareShare(0) === 1`, `flareShare(1) === 0`, and the values don't increase over 0..1.
  - `registries.test.ts` line 127: add `'victory'` to the threat acts list. If an asteroid act list is pinned too, add it there.
- **e2e, `gallery-assets.spec.ts`:** a new test, `the three victories flare, then settle, in full and reduced motion (27 B3)`, with a timeout of 150 s.
  - For each of `objective.accomplish`, `threat.accomplish` and `seat.complete`, use the demo whose `rule` equals the id, else the first that starts with `${id}:`.
  - Full motion: scroll the cell (`[data-art="<rule>"]`, its parent figure) into view. Poll at 50 ms until `flare ≥ 0.9`, then screenshot it to `test-results/gallery/victory-<id>-flare.png`. Poll until `state === 'after'` and `flare === 0`, then screenshot `…-settled.png`. Poll until each has `flarePeak ≥ 0.9`.
  - Reduced motion: call `setReduced(true)` and poll until each has `reducedLoops ≥ 1`. Expect `reducedFlarePeak === 0`, screenshot `victory-<id>-reduced.png`, then call `setReduced(false)`.
  - Expect `errors` to equal `[]`.
- **Run:** `npm test`, then `npm run e2e:spec -- gallery-assets gallery-v1 gallery-layout`, then `npm run e2e:keystone`, then the drive in step 11. Don't run the full suite. Look at the six `victory-*` review copies and the `outline-flare` cell, and name them in your record.

## Out of scope
- Red's sub-floor contrast on a lit planet face (15 §8, a decision for HG-C). The keyline. `RIM_ALPHA`.
- Flaring anything other than gold, or flaring at other moments (`region.clear`, the finale).
- In the arc variant of the strike run, the `breakup` act's look may hide the aura while it flares. Note it under `limitations` if you see it; don't fix it.
- `AuraReading` and the test hooks contract (03 §10): unchanged.
- Re-baking the asteroid atlas: the bake hides the outline, so it doesn't change.

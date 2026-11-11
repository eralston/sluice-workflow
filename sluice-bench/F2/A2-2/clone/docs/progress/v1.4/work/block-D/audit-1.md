# Audit block-D, round 1 · Verdict: pass

Items: D1, D2, D3 · Diff: 21d3559..827cf92 · No Blocker or Major. Two Minors, three Nits.

1. Minor — D1's plate-side rule assumes the formation runs along an axis, but D3 now turns it in 15° steps, and on a turned line `formationSides` gives neighbouring ships the same side.
   Evidence: `labelTiers.ts` `formationSides` sets the axis from the members' x/y extent and the side from `x − meanX` (or `y − meanY`), and the stagger (±0.6 ship) only flips that sign when the line runs exactly along x or y. `formationSpots.ts` `lineAt` (D3) builds lines at `theta0 ± k·π/12`. Every arc pick except k = 6 or 12 is tilted, and per D3's `build-1.json` an arc pick replaced D2's in 98 of 441 Pulsar checks, 49 of 532 for Quasar and 21 of 49 for Harbor. `probe-tilt-sides.mjs` in this folder copies the two formulas. At 0° and 90° the sides alternate (`null above below above`, `mid right left right`). At 15° and 30° they split by half of the line (`above above below below`), and at 60° to 75° two members fall on the same side or on `mid`. So on a turned crew, neighbouring plates ask for the same side. D1's guards still stop any overlap or covered ship (`collides(…, near)`, `crewBodies`), so the cost is a fallback place or a plate left as a picture, not a collision. D1's e2e can't see this: its check (c) works out the asked side with the same extent rule, and it plays only the first merge of each orientation.
   Rule: 27 D1 Decided ("on the side away from the formation's axis"). This is the interaction the scope order D1 → D2 → D3 created: D1 was built before turned lines existed.
   Fix direction: work out the side from each member's signed offset to the crew's own line (the author to the farthest member, or a principal axis), not from the x or y mean. Add a `labelTiers` unit case for a line at 15° and one at 60°.

2. Minor — `tests/README.md`, the test map that the sluice's `mappedTestsGuide` points to, wasn't updated for the block's new tests.
   Evidence: `git diff 21d3559 HEAD -- tests/README.md` is empty. The new unit tests `formationBounds.test.ts` and `formationCorridor.test.ts` aren't on the `theme/starChart/maneuvers/**` row (line 83, which lists `commands, maneuvers, castLabels` and the specs `solar, solar-play, gallery-assets`). `solar-dense` is on no row, so D1's "formation plates" and D2's "formations stay on screen" cases (`solar-dense.spec.ts:709`, `:814`) aren't mapped from `labels.ts`/`labelTiers.ts` (line 85) or from `powerLink.ts`/`formationSpots.ts`. The table's own rule says "Update when: a spec or test file is added … or what it covers moves". The unit tests still run under `npm test`, but a later change to the formation that follows the map would skip both e2e guards.
   Rule: tests/README.md Source/Update-when line, and the project notes' "How to verify here".

3. Nit — 08 §7's D2 bullet says the rule is "scale- and camera-free", but only the board is. The spots scale with `R = drawnR(f)`, the floored drawn radius, so the spacing, D2's pick and D3's corridor all depend on the zoom. That's why both new unit tests sweep scales (`formationCorridor.test.ts:171-174`). Suggested wording: "the board is scale- and camera-free; the spacing follows the station's drawn size".
   Evidence: `docs/08-layout-solver.md` D2 bullet; `fx/commands.ts:129` `drawnR` → `GraphScene.drawnR` (effective, floored radius).

4. Nit — The header comment in `powerLink.ts` (lines 12-13) still says "The formation lies beside the station on the side toward the star …, across its line of fire". Since D2 and D3 it may take the far end, the other axis or a turned line, and D3 picks it to stay off the line of fire. The `formation()` docblock names 22 C11 and 27 D2 but not D3.

5. Nit — Doc 15 gives the source of one module's constants two ways. The Merge formation row (`15-reference.md:1136`) names `powerLink.ts` for `APPROVER_STEP`/`APPROVER_OUT`, which now live in `formationSpots.ts` (re-exported, so `docTables` passes). The new `formation-corridor` table names `formationSpots.ts` for their neighbours. D2's packet left the old row on purpose. One source path for both would be clearer.

Not findings:
- D2 against D3 on the board: D3's arc candidates are filtered by D2's `inside`, and its fallback returns D2's pick, so D3 can't take a crew off the board.
- No-board and no-beam paths: `formationSpots` returns D2's pick as it is.
- The star is at the origin (`plan.ts:151`), so D2's `towardOf` (the sign of fx/fy) and D3's tie-break (the board's middle) agree.
- The veil's `r` matches the corridor (`R·0.5·CORRIDOR_HALF`).
- `strokeVeiled` with no veil draws the old single stroke, and its half-disc caps point outward.
- No `CastViews` code iterates by key, so the new `board` key is safe.
- The 13 §6.2 Power link row, the 08 §7 D3 bullet and the 15 §5 table match the code.
- The scope doc's D1-D3 State lines match the records.
- The wrong "Touches" lines (placeFormation.ts, stationFire.ts) are corrected in the Decisions log. These were settled by the item reviews and not repeated here: the unexercised fade, `spots.get` in `echo`, the D1 e2e covering only shown plates, and D2's e2e being a guard.
- Frame budget: the new work is O(crew) per frame, plus extra strokes only on a blocked crew. Shared Pixi resources: the veil adds strokes only.

Checks run: read every source, test and doc hunk in 21d3559..HEAD. `npx vitest run formationCorridor formationBounds labelTiers docTables` (4 files, 76 passed). `node probe-tilt-sides.mjs`. Grepped `tests/README.md` for `solar-dense`, the formation and the label rows. No e2e or drive runs (this was a lean audit). Finding 1 rests on the formulas and D3's recorded sweep counts; I didn't reproduce it in the app.

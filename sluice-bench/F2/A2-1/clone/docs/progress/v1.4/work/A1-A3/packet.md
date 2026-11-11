# Packet A1+A3: Station floor size in the gallery; frame budget in vsyncs
Risk: small (a gallery note, a test and docs; no runtime code) · Score: blast 0, verify 1, design 0, acceptance 0, track 0
Start commit: d39649b

## Acceptance
A1 (copied unchanged):
- `grep -n "48 px" src/renderer/src/gallery/v1/stations.ts` finds no claim about the floor.
- The `-sizes` cell's note states the floor size computed from `FLOOR_PX.facility` (`gallery-v1` spec green).

A3 (copied unchanged):
- `perf.spec.ts` has no `25` literal; its assertions compare against 2 × the measured vsync interval.
- 09 §7 and 15 §9 state "p95 ≤ 2 vsyncs", and `docTables.test.ts` passes.
- Pulsar's numbers at rest, at 1×, at 4× and on seeks are recorded in 09 §7 with the date. (Playing may still miss the budget: B1 addresses that.)

## Approach
**A1.** In `stations.ts` import `FLOOR_PX` from `@shared/scene/sizing` (the gallery already imports `@shared/hash`). `FLOOR_PX.facility` is `LABEL_PX * 1.2` = 57.6, a half-length (the "minimum on-screen radius"); the floor is 2 × that, about 115 px long. Compute `const FLOOR_LEN = Math.round(2 * (FLOOR_PX.facility ?? 0))`.
- FormSizes comment (line 70): "a station's floor is about ${FLOOR_LEN}..." cannot interpolate in a comment, so write "a station's floor is `FLOOR_PX.facility` as a half-length, about 115 px long (sizing.ts)".
- `-sizes` cell (line 139): keep the title "both forms at 48, 96, 150 px" (those are the cell's drawn sizes, not the floor) but the note becomes `` `The station floor is about ${FLOOR_LEN} px long (2 × FLOOR_PX.facility ${FLOOR_PX.facility})` ``. Check the cell's drawn sizes in `FormSizes` (lines 78-100): if the true floor is not among them, add `FLOOR_LEN` as a drawn size and update the title from the same array, so "among the cell's sizes" holds. If adding it makes the row overflow, leave the sizes and state it in the note only, and say so in the record.
- Search the file for any other "48 px" about the floor and fix it.

**A3.** Add to `perf.spec.ts`: `const VSYNC_TOLERANCE_MS = 2;` (a 60 Hz frame is 16.7, 2 vsyncs 33.3; 2 ms covers rAF jitter) and a helper `vsyncMs(page)`: the median of ~60 rAF deltas (drop the first 5). Measure it before the dense scene is entered (test 1: right after launch, on the galaxy view; Pulsar: after `launchApp`, before the dblclick into Halcyon). `budget = 2 * vsync + VSYNC_TOLERANCE_MS`. Replace the three `toBeLessThan(25)` with `toBeLessThanOrEqual(budget)`; messages and titles say "2 vsyncs" (e.g. "p95 frame time stays within 2 vsyncs at rest, ..."). Put the vsync and budget in the report JSON and the console log. Update the comments at lines 3-5 and 57-59 (no "25"). Do not touch the `250` seek bound (a different measure).
**Docs.** 09 §7 *Performance*: replace "Budget: painted p95 under 25 ms" with "Budget: p95 ≤ 2 vsyncs of the display (the spec measures the interval, plus 2 ms)", and rewrite the Pulsar sentence with the fresh numbers and today's date, 2026-10-29. 15 has no §9 budget row (§9 is Actions → what you see; budgets live in §10 *Timing and budgets*), so add the rule there as a row in the `budgets` table: `| Frame budget (new, 23 F-Q3) | p95 ≤ 2 vsyncs, plus 2 ms | unguarded: `../../../tests/e2e/perf.spec.ts` VSYNC_TOLERANCE_MS | ... |`. If `docTables` rejects that path form, use `(inline)` and say so in the record. Mention the deviation (§10 not §9) in the record.
**Measure.** Run the perf spec (take the lock if parallel) at the end, and record Pulsar's rest, 1×, 4× and seek numbers plus the measured vsync in 09 §7. If playing misses the budget, record it and leave the soft assertion as is (B1's work); say so.

## Files
- `src/renderer/src/gallery/v1/stations.ts` 1-10, 65-110, 135-142
- `src/shared/scene/sizing.ts` 8-25 (FLOOR_PX)
- `tests/e2e/perf.spec.ts` whole (138 lines)
- `docs/09-signal-ladder.md` 183-195 (§7 *Performance*)
- `docs/15-reference.md` 1064-1075 (§10 budgets table), 20-40 (the unguarded rule)
- `tests/unit/docTables.test.ts` 138-150 (how unguarded cells parse)

## Excerpts
09 §7 today: "Budget: painted p95 under 25 ms. The same spec also times Pulsar Pod ... playing it sits at the budget's edge (p95 about 25 ms at 1×, 33 ms at 4×)". "Since 2026-10-27 the harness's hidden window runs at about 60 fps".
15 §1: a constant's row changes with its code; a test-only or inline value is marked `unguarded:` in the Constant cell.
project.md lens: "Frame budget: dense scenes sit near the p95 budget" (so the numbers must come from a real run, not be estimated).

## Checks
- `grep -n "48 px" src/renderer/src/gallery/v1/stations.ts`; `grep -n "25" tests/e2e/perf.spec.ts` (no budget literal).
- `npm test -- docTables` (or the gate's unit run), then `npm run e2e:spec -- gallery-v1` (the `-sizes` cell; look at `test-results/gallery/` if drawn sizes changed), `npm run e2e:spec -- perf`, `npm run e2e:keystone`.
- No new tests.

## Out of scope
Making Pulsar playing meet the budget (B1). Other 48 px mentions outside `stations.ts`. The seek `250` ms bound. Any renderer or shared code change besides the gallery file.

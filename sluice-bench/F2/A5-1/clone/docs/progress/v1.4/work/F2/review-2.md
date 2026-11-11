# Review F2, round 2 · Verdict: pass

Since review 1, only the fixer's four files changed: `pacingBuilt.test.ts`, `solar-dense.spec.ts`, `gallery-assets.spec.ts` and `stationJumpIn.ts`. Every other file in the diff predates review 1. `ledger.jsonl` is the orchestrator's.

## Review 1's findings
- **1 Major (git show in CI): settled.** `tests/unit/pacingBuilt.test.ts:163–167` now pins `START_WALL_MS`, and no `execSync` or `git show` is left in `tests/` or `scripts/`. I checked the seven values against `git show 2b33931:docs/progress/v1.4/pacing-ledger.json`. All seven match: Comet 60795, Nova 209348, Quasar 299132, Pulsar 288808, Convoy Planning 183105, Harbor 178335, Meteor 284681.
- **2 Minor (B9 exemption too broad): settled.** `solar-dense.spec.ts:411–465` samples the facility nodes. The number of riding episodes is capped at the number of stations that came in during the sample, and each one must also last under 2.2 s. The parked and whole checks still apply to every other episode. The fixer's limitation (a station that leaves and comes back counts once) is fine.
- **3 Minor (gallery stills miss the act): not settled.** See finding 1 below.
- **5 and 6 Nits: fixed.** The comment now names the E6+ precedent. `spotOf` now returns `p`, so the guest path has no non-null assertion and keeps the `node.world` fallback.
- **4 and 7 Nits:** left as they were, which is allowed.

## Findings
1. Minor — The gallery spec's stills still don't show the act, even after the fix's "leave play, then catch a fresh one" wait.
   Evidence: I re-ran `gallery-assets` and copied the spec's output here.
   - `review-2-gallery-spec-full.png`: footer "full motion · R toggles · play". The station is fully in, and no blip ring is visible.
   - `review-2-gallery-spec-reduced.png`: footer "reduced motion · R toggles · **after**", meaning the play had already ended when the frame was taken.
   The 50 ms poll, the `waitForTimeout(750)` and the screenshot's own latency add up to more than the act window. Under reduced motion they add up to more than the whole play. The fixer's record says the stills were not looked at.
   The work folder's `f2-jump-in-*.png` are still round 1's frames. For the gate, review 1's `review-1-gallery-{full,reduced}-act.png` remain the act stills.
   Acceptance line or rule: packet Checks ("Take stills in the act"). The acceptance line itself is met: the cell loops in full and reduced motion, `stuck` is 0 and `errors` is `[]`. Possible fix (not required this round): take the still from the page side when the demo's clock passes the act, or check the footer text before the shot.
   Lens: none.

## Looked at
- **Drive at 1024×640.** I ran `STAR_CHART_WINDOW_SIZE=1024x640 npm run drive -- tests/drive/steps/solar-station.ts --paradigm solar`: Harbor Pod, tide-gateway arrival at 23330 ms, stepped at 1×. Stills: `review-2-drive-blip-1024.png` and `review-2-drive-after-1024.png`.
  - Blip frame: the station folds in at its spot. A ring of the same shape sits where Ossian Vale passed, and the ship is already moving on with its "Ossian Vale · Linked PR #21000" plate open.
  - The ship sprite briefly crosses the "Ossian's World" label while it travels. This is in motion only, as in review 1, and it is clear in the next frame.
  - Next frame: the ship is past Ossian's World and its plate is open. The plate is clear of the planet labels and the "tide-gateway · Repository · station" label.
  - The zoom buttons, timeline and side panel don't cover the scene. No plate overlaps another.
  - The behaviour matches review 1. The `stationJumpIn.ts` refactor changed nothing visible.
- **Gallery.** The `facility.enter` cell shows "2515 ms", and the station and ship render in both modes. `errors` is `[]` (the spec asserts it).

## Not findings
- Gate: typecheck, lint and unit tests are green (109 files, 1725 tests).
- `npm run e2e:spec -- gallery-assets solar-dense`: 26 passed, including the tightened 22 B9 check and the new F2 gallery test.
- `npm run e2e:keystone`: 43 passed.
- The rest of the diff (engine, mover, docs, ledger, goldens) is unchanged since review 1, which verified it. That covers the ledger reproducing byte for byte, only `director.json` moving among the goldens, 15 §7 at 2515, and the 03, 05 and 13 amendments.

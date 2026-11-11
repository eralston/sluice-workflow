# Review B4, round 1 · Verdict: pass
No Blocker or Major findings.
1. Minor — the stills show first light only weakly as a "front". The planet in Kit's Haven is a volcanic line world, so the pinpoints and bloom read as scattered warm dots over the lit crescent, brightest in 0147 and 0298 and fading by 1015. The dim lift and the settle are clear. The builder said so itself.
   Evidence: first-light-sheet.png, first-light-0147.png, first-light-0298.png, first-light-1015.png.
   Acceptance line or rule: "Drive c3-vacant shows the sweep (stills)". Met, but a gate viewer may want a terran world for a clearer front.
2. Minor — build-1.json says keystone and solar e2e were not clean, and that a `git stash` was used in the shared tree. The stash list is empty and the tree matches. No harm found.
   Evidence: `git stash list` is empty.
Not findings:
- `solar.spec.ts:352` ("pieces are hover-only") is NOT B4's. It fails on the unmodified start commit too. I built a throwaway worktree at 75fb4a7 and ran that test alone twice: both failed. On the B4 tree it fails 3 of 3 alone, plus once in the full run. The asserted line varies (a frontier-piece click selects a different key at :397). The test is about piece hover and click, and B4 only touches seat stage strings, a seat's tint and uniforms, not hit-testing or layout.
- Re-run on the B4 tree: `e2e:keystone` 43 passed. `e2e:spec -- gallery-assets gallery-v1 solar` gave 41 passed, 1 failed (:352), 4 did not run (they follow the failed test in the serial describe). This time the run finished and did not stall.
- typecheck and lint clean. `vitest run` on vacantWorld, stageCode, docTables and golden: 214 passed. I did not run the whole `npm test`.
- Goldens: only solar.scenes.json (6 lines) and meridian.scenes.json (15 lines) changed. Every changed line is `...|vc=1` becoming `...|vc=1|aw=1` on a seat stage.
- Projection: `firstHeld` is memoised per facts object and agrees with `seatReason` (the agreement test passes across all fixtures). `aw` is written only with `vc`, and decode rejects `aw=0` and `aw=1` without `vc=1`.
- SeatView: a seek or scene entry calls `settle()`, which drops the sweep. Reduced motion snaps. A return, with `awaiting` false, eases as before. A vacant stage mid-sweep cancels it. The unit tests cover each.
- Docs: 03, 09, 13 and 15 §10 match the code (800 and 600 ms). `docTables` passes. No pass or filter added, so there is no perf run owed.

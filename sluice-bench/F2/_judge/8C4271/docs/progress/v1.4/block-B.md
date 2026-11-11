# v1.4 · Block B

## Summary

```text
Block B · 5 items · 0.95 windows · 5.9 h with agents
First-pass acceptance   3/4    Fix rounds   0.4 mean, max 1    Re-plans   0
Findings               blocker 0 · major 1 · minor 4 · nit 8
Spend by role          planner 35% · orchestrator 23% · builder 20% · reviewer 19% · fixer 4%   (orchestrator approximate)
Spend per item         medium 0.18 win (4) · unknown 0.02 win (1)
Gate blocks            0
Largest item           B1: 0.22 win, 2 reviews
Escapes                record at the human gate
```

## Health

```text
Code health at f318980 · 340 files · 57,841 lines
Large files            10 over 800 lines · largest dreadnoughts.ts 1,888, GraphScene.ts 1,831, swarm.ts 1,470
Hotspots               GraphScene.ts 16/49 commits (1,831 lines) · ChartApp.ts 19/49 commits (1,302 lines) · labels.ts 17/49 commits (1,132 lines) · median 2
Dependencies           8 + 15 dev
Complexity             138 functions over 15 · worst 224 (labels.ts position) · 38 over 80 lines
```

## Notes for the final check
- **Departs from 02 and 03 (normative):** B2 amends 02 INV-10 and 03's `FEATURE_ROW_CAP` row (one Feature at rest); B4 adds `PieceState.awaiting` and stage `aw=1` to 03 (the goldens changed only by `|aw=1` after `|vc=1`).
- **Departs from the scope:** B1's acceptance line 4 (Pulsar p95 hard) moved to a new item, C3: B1's planner showed the plates aren't the cost (GPU or compositor work in the Pixi scene). Pulsar's p95 is the same before and after B1 (09 §7).
- **Lean from B2 on** (the 5-hour limit was hit during B2's build): Sonnet planners and reviewers, no block audit. B1 had one fix round (a one-frame tier lag); B2–B4 passed first time.
- **Suite:** e2e 210/211 on a clean tree at f318980. The one failure, `slice3a.spec.ts:214` (continuity), passed alone (the spec 18/18): load. `solar.spec.ts:352` (pieces are hover-only) failed in the shared tree under load and passes on a clean worktree; watched as a flaky hit-test (27 Decisions).
- **Judge at the final check:**
  - B1, captains rest at T4 like every plate (B1-Q1); quiet galaxies now look like active ones at rest.
  - B2, the resting Feature title is cut hard ("Dy… 10 +4 more").
  - B3, gold rests darker (weight 0.68).
  - B4, on a volcanic world the first light reads as warm dots more than a sweep.

## Stills
- B1: `work/B1/pulsar-rest.png`, `work/B1/pulsar-playing.png`.
- B2: `work/B2/01-quasar-star-features-rest.png`, `02-quasar-star-features-pointed.png`, and the Pulsar pair; `review-quasar-rest.png`, `review-pulsar-rest.png`.
- B3: `work/B3/review-1-*-arc-flare.png`, `review-1-outline-flare-{peak,rest}.png`; live in `npm run gallery` › the outline-flare cell.
- B4: `work/B4/first-light-sheet.png` (and the frames beside it); live, any Halcyon pod's first arrival at a homeworld.

## Human gate, signed 2026-11-01 (brought forward from the final check)
B1–B4 accepted as built, and B2's and B4's 02 and 03 amendments ratified.

## Escapes
- **B2 (Major, found by the late A/B audit):** entering a pod selects its star, so the full Features list opened on every entry and covered Quasar's plates. Fixed in d8fd5c7: entry doesn't open the list. That fix then hid a struck threat's cast plate (`solar-play.spec.ts:128`), fixed in 9937d20. B2's tests had reached "rest" only by clearing the selection first.
- **B4 (Minor, docs):** 03's `PieceState` block lacked `awaiting`, fixed in d8fd5c7.

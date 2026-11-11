# v1.4 · Block C

## Summary

```text
Block C · 8 items · 1.17 windows · 2.9 h with agents
First-pass acceptance   4/6    Fix rounds   0.5 mean, max 2    Re-plans   0
Findings               blocker 1 · major 2 · minor 6 · nit 13
Spend by role          orchestrator 54% · builder 13% · reviewer 11% · planner 10% · auditor 8% · fixer 4% · clerk 0%   (orchestrator approximate)
Spend per item         unknown 0.06 win (2) · medium 0.07 win (5) · small 0.08 win (1)
Gate blocks            1
Largest item           C3: 0.19 win, 3 reviews
Escapes                record at the human gate
```

## Health

```text
Code health at 9937d20 · 340 files · 58,046 lines
Large files            10 over 800 lines · largest dreadnoughts.ts 1,888, GraphScene.ts 1,831, swarm.ts 1,470
Hotspots               ChartApp.ts 13/49 commits (1,322 lines) · GraphScene.ts 9/49 commits (1,831 lines) · labels.ts 14/49 commits (1,138 lines) · median 2
Dependencies           8 + 15 dev
Complexity             138 functions over 15 · worst 225 (labels.ts position) · 38 over 80 lines
```

## Notes
- **Lean run** (Sonnet planners and reviewers). C3's builder was cut off by a usage limit and committed part-built (a42a986); it was finished as build round 1. Then came two fix rounds: the rim's causes, and a cuts test that a serial `describe` was skipping. C3 needed 3 reviews.
- **C3 outcome:** `auraBake` takes 47% off Pulsar's p95 at 4× (33.3 to 17.6 ms, same run, hard check). The baked rim fails the pixel diff (p99 97–249 against 12), so it's on for `phone` and `tablet` only, and desktop's look and frame time are unchanged. The live glow's reach went to 90-later.
- **Audit:** pass with 4 Minors, all fixed (b31e560). The `ornament` switch doesn't cover light work; `auraContrast` now uses the measured alpha 1 (gold's model check relaxed to 11%; the live `c1-contrast` reads 9.2%).
- **Suite** at 9937d20: e2e parallel 216/216, alone 22/23. The one failure is Pulsar's absolute-budget test, whose lines are soft (desktop runs with the bake off). `devlog.spec.ts:16` fails now and then under keystone load (it did at 2cccce3 too) and is watched as a flake.

## Human gate (HG-C), signed 2026-11-01
- A 5 min cap per pod at 1× (soft), with Comet within 5% of 67.3 s. All of E1–E9 picked, all four parts of E4. The director's levers past the target, in order: montage, adaptive speed, light work for more rules, fewer hero shots. E5-Q1 is 24 working hours; E6-Q1, the author with the most merges leads; `VOLLEY_WINDOW_MS` is swept in E6's plan. See 27's Decisions.
- The A and B final check was brought forward and signed the same day (27's Decisions).

## Escapes
- None found after block C's items were accepted; the audit's findings were Minors.

# v1.4 · Block A

## Summary

```text
Block A · 3 items · 0.22 windows · 0.6 h with agents
First-pass acceptance   2/3    Fix rounds   0.3 mean, max 1    Re-plans   0
Findings               blocker 0 · major 1 · minor 1 · nit 1
Spend by role          orchestrator 64% · builder 18% · reviewer 9% · planner 8% · clerk 1% · fixer 0%   (orchestrator approximate)
Spend per item         small 0.02 win (1) · medium 0.03 win (2)
Gate blocks            2
Largest item           A2: 0.03 win, 1 reviews
Escapes                record at the human gate
```

## Health

```text
Code health at b5d041f · 335 files · 57,280 lines
Large files            10 over 800 lines · largest dreadnoughts.ts 1,888, GraphScene.ts 1,831, swarm.ts 1,465
Hotspots               GraphScene.ts 16/35 commits (1,831 lines) · ChartApp.ts 19/35 commits (1,302 lines) · nav.ts 17/35 commits (985 lines) · median 2
Dependencies           8 + 14 dev
Complexity             137 functions over 15 · worst 209 (labels.ts position) · 38 over 80 lines
```

## Notes for the final check
- **Departs from 03 (normative):** A2 removed `PieceState.outcomes` and the stage code's `o=` field; 03's `PieceState` block, stage grammar, seat row and `seatLook` line are amended. World art still takes outcomes as an art-only option (the gallery's `*-outcomes` cells).
- **Departs from the sluice (lean run, weekly quota at 93%):** planners and reviewers ran on Sonnet; A1-A3's fix round was accepted on the orchestrator's check of the diff without a round-2 review; no block audit. See 27's Decisions.
- **Suite:** e2e parallel 208/208, alone 21/22. The one failure is Pulsar's soft p95 test, known red until B1. Quiet-machine numbers: rest 25.1 ms, 1× 33.4 ms, 4× 41.7 ms against 2 vsyncs (18.6 ms at 120 Hz).
- **To look at:** a station plate expanded in any Halcyon pod (A4: no sideways scroll; the stat line wraps at its `·`); `npm run gallery` › stations › `-sizes` (A1's note).

## Human gate, signed 2026-11-01 (brought forward from the final check)
A1 and A4 accepted, and A2's 03 amendment ratified. A late audit across A and B (`work/block-AB/`) found nothing in A beyond doc Nits.

## Escapes
- None in A's code. Docs: 03's `PieceState` block also missed `vacant` (23 C3), fixed in d8fd5c7.

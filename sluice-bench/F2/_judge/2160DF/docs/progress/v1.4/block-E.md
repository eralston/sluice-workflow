# v1.4 · Block E

## Summary

```text
Block E · 21 items · 3.98 windows · 14.3 h with agents
First-pass acceptance   13/16    Fix rounds   0.3 mean, max 1    Re-plans   0
Findings               blocker 1 · major 2 · minor 24 · nit 32
Spend by role          planner 35% · reviewer 30% · builder 24% · fixer 4% · auditor 4% · orchestrator 3%   (orchestrator approximate)
Spend per item         unknown 0.21 win (5) · medium 0.18 win (11) · large 0.16 win (5)
Gate blocks            3
Largest item           E6a: 0.32 win, 1 reviews
Escapes                record at the human gate
```

## Health

```text
Code health at 2125401 · 345 files · 60,050 lines
Large files            12 over 800 lines · largest dreadnoughts.ts 1,931, GraphScene.ts 1,837, swarm.ts 1,470
Hotspots               labels.ts 8/49 commits (1,195 lines) · maneuvers.ts 10/49 commits (929 lines) · interpreter.ts 8/49 commits (973 lines) · median 2
Dependencies           8 + 15 dev
Complexity             145 functions over 15 · worst 272 (labels.ts position) · 41 over 80 lines
```

## Stills for the final check

Fixture data only. Each item's stills sit in its work folder:
- E2, labels on arrival: [flight, four labels](work/E2/review-1-still-01-flight-four-labels.png), [parked plates](work/E2/review-1-still-02-parked-plates.png)
- E3, the progress beam: [gather](work/E3/review-1-still-gather.png), [act](work/E3/review-1-still-act.png)
- E4a, short forms: [play at 4.2 s](work/E4a/review-1-wars-play-4.2s.png), [seek back](work/E4a/review-1-wars-seek-back.png)
- E5, the director: [full merge](work/E5/e5a-full-merge.png), [progress act](work/E5/e5a-progress-act.png), [montage plate](work/E5/e5c-montage-plate.png)
- E6, volleys: [formation](work/E6/e6-volley-act-formation.png), [turn 2, the beam](work/E6/e6-volley-turn2-beam.png)
- E7, the sweep: [tell](work/E7/e7-sweep-tell.png), [mid-act](work/E7/e7-sweep-mid-act.png), [seek to the end](work/E7/e7-sweep-seek-end.png)
- E9, the camera: [before the climax](work/E9/e9-before-climax.png), [climax shot](work/E9/e9-climax-shot.png), [before montage](work/E9/e9-before-montage.png), [montage board](work/E9/e9-montage-board.png)

## Final suite

`npm run e2e`: 211 passed, 3 failed, 13 did not run (serial skips after a failure). The three that failed, avatars:51, activity:143
and solar-dense:295, pass when re-run alone (load flakes: two 60 s timeouts, and solar-dense:295, a known flake).

## For the final check

- Comet plays 45.8 s in story time, against 50.3 s before E1: 9% under (see 27 Decisions, 2026-11-06).
- `RISING_TIGHT_SHARE` 0.7 (E10). On Pulsar the climax shot is mostly a pan (E9).
- The montage guard's days are cut in the fixture's zone, so the guard is zone-dependent.
- The perf seek check has been red since before block E (328 ms).

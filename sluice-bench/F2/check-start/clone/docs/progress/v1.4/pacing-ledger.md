# Pacing ledger

Where each pod's replay time goes at 1x, from the engine's own schedule and plan (read-only; `npm run pacing`). Seconds are to 0.1.
The time frame and the playing/held split are in schedule time and sum to the schedule length (Schedule s). Total s is the wall time at 1x once the director's adaptive speed is counted (27 E5b); they differ only on a pod whose beats are sped. The rule table charges each stretch of a beat to its lead maneuver (the one that ends last) and phase; `hold` is a crew's turn staying out after the last phase. Waiting is maneuver-seconds (maneuvers overlap, so it is not wall time), and its causes are inferred from the plan, not read from the engine's queue. Carry (P-10) is measured.

## Summary

**App s** is what the app plays: the pod in story time (05 §8.3a), as `src/renderer/src/v1/story.ts` presents a Solar bundle. **Target** and **Levers** read it, and so does the final check (block E audit, 27 Decisions 2026-11-06). Every other column, the per-pod tables and the Built section are the recorded bundle's, as E1-E10 were measured. Comet's yardstick in story time is 50.3 s (at 552d631, the commit before E1; 67.3 s recorded).

| Pod | App s | Total s | Schedule s | Uncapped s | Orient | Gaps | Day turns | Playing | Held | Tail + hold | Target | Levers |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Comet Pod | 45.8 | 60.8 | 60.8 | 74.7 | 3.0 | 0.8 | 2.3 | 53.1 | 0.0 | 1.5 | ok | none |
| Nova Pod | 171.0 | 209.3 | 209.3 | 262.7 | 3.0 | 12.1 | 3.1 | 189.6 | 0.0 | 1.5 | ok | none |
| Quasar Pod | 289.6 | 299.1 | 491.9 | 526.4 | 3.0 | 32.6 | 2.7 | 452.1 | 0.0 | 1.5 | ok | short, montage, speed, light |
| Pulsar Pod | 288.6 | 288.8 | 372.6 | 399.9 | 3.0 | 19.6 | 2.4 | 346.1 | 0.0 | 1.5 | ok | short, montage, speed, light |
| Convoy Planning Pod | 179.0 | 183.1 | 183.1 | 209.1 | 3.0 | 8.9 | 3.5 | 166.2 | 0.0 | 1.5 | ok | none |
| Harbor Pod | 179.8 | 178.3 | 178.3 | 207.6 | 3.0 | 7.8 | 3.5 | 162.3 | 0.2 | 1.5 | ok | none |
| Meteor Pod | 275.9 | 284.7 | 483.9 | 489.5 | 3.0 | 12.1 | 2.1 | 465.2 | 0.0 | 1.5 | ok | short, montage, speed, light |

## Comet Pod (Halcyon Reach, Sprint 41)

sprint-pods, tz America/Los_Angeles, 32 events; 8 beats played of 18 (10 silent, 2 cut by the budget); budget default.

| Component | s | % |
|---|---|---|
| Orient | 3.0 | 4.9 |
| Gaps | 0.8 | 1.4 |
| Day turns (6) | 2.3 | 3.8 |
| Tail gap | 0.3 | 0.5 |
| Final hold | 1.2 | 2.0 |
| Beats: playing | 53.1 | 87.4 |
| Beats: queue idle | 0.0 | 0.0 |
| Beats: note hold | 0.0 | 0.0 |
| **Total** | 60.8 | 100.0 |

| Rule | s | Share | Maneuvers | tell | gather | act | land | echo | disperse | hold |
|---|---|---|---|---|---|---|---|---|---|---|
| attachment.merge/first | 7.9 | 14.9% | 1 | 0.3 | 0.9 | 2.3 | 0.5 | 3.0 | 0.9 |  |
| attachment.merge | 7.2 | 13.5% | 1 | 0.3 | 0.9 | 1.6 | 0.5 | 3.0 | 0.9 |  |
| threat.accomplish/beamed | 6.8 | 12.8% | 1 | 0.3 | 0.7 | 2.6 | 1.2 | 0.4 | 0.4 | 1.2 |
| objective.accomplish/beamed | 6.5 | 12.3% | 1 | 0.3 | 0.4 | 2.6 | 1.2 | 0.4 | 0.3 | 1.3 |
| seat.complete | 5.1 | 9.6% | 1 | 0.3 | 0.7 | 1.0 | 1.1 | 0.9 |  | 1.1 |
| objective.underway | 4.0 | 7.6% | 1 | 0.3 | 0.5 | 1.2 |  | 0.4 |  | 1.6 |
| attachment.open | 3.4 | 6.4% | 2 | 0.6 |  | 2.0 | 0.8 |  |  |  |
| region.clear | 3.0 | 5.6% | 1 | 0.3 |  | 1.6 |  | 1.0 |  |  |
| facility.enter | 2.8 | 5.3% | 1 | 0.3 | 0.7 | 1.2 | 0.6 |  |  |  |
| objective.nearing | 2.4 | 4.5% | 1 | 0.3 | 0.6 | 1.1 |  | 0.4 |  |  |
| threat.engage | 2.4 | 4.5% | 1 | 0.3 | 0.5 | 1.3 |  | 0.3 |  |  |
| piece.appear | 1.6 | 3.0% | 1 | 0.3 |  | 0.9 |  | 0.4 |  |  |

| Waiting cause (inferred) | Maneuver-s | Maneuvers |
|---|---|---|
| P-5 | 24.7 | 4 |
| P-3 | 11.9 | 1 |
| P-4 | 0.0 | 0 |
| P-6 | 0.0 | 0 |
| other | 0.0 | 0 |
| P-10 carry (measured) | 0.0 | 0 beats |

## Nova Pod (Halcyon Reach, Sprint 41)

sprint-pods, tz America/Los_Angeles, 128 events; 37 beats played of 96 (59 silent, 10 cut by the budget); budget default.

| Component | s | % |
|---|---|---|
| Orient | 3.0 | 1.4 |
| Gaps | 12.1 | 5.8 |
| Day turns (8) | 3.1 | 1.5 |
| Tail gap | 0.3 | 0.1 |
| Final hold | 1.2 | 0.6 |
| Beats: playing | 189.6 | 90.6 |
| Beats: queue idle | 0.0 | 0.0 |
| Beats: note hold | 0.0 | 0.0 |
| **Total** | 209.3 | 100.0 |

| Rule | s | Share | Maneuvers | tell | gather | act | land | echo | disperse | hold |
|---|---|---|---|---|---|---|---|---|---|---|
| attachment.merge | 36.0 | 19.0% | 5 | 1.5 | 4.5 | 8.0 | 2.5 | 15.0 | 4.5 |  |
| threat.accomplish/beamed | 27.3 | 14.4% | 4 | 1.2 | 2.8 | 10.4 | 4.8 | 1.6 | 1.6 | 4.9 |
| objective.accomplish/beamed | 26.1 | 13.8% | 4 | 1.2 | 1.6 | 10.4 | 4.8 | 1.6 | 1.2 | 5.3 |
| objective.nearing | 20.1 | 10.6% | 5 | 1.5 | 3.0 | 5.5 |  | 2.0 |  | 8.1 |
| objective.underway | 20.1 | 10.6% | 5 | 1.5 | 2.5 | 6.0 |  | 2.0 |  | 8.1 |
| attachment.open | 17.0 | 9.0% | 11 | 3.0 |  | 10.0 | 4.0 |  |  |  |
| seat.complete | 10.2 | 5.4% | 2 | 0.6 | 1.4 | 2.0 | 2.2 | 1.8 |  | 2.2 |
| attachment.merge/first | 7.9 | 4.2% | 1 | 0.3 | 0.9 | 2.3 | 0.5 | 3.0 | 0.9 |  |
| attachment.merge/short | 6.3 | 3.3% | 1 | 0.2 | 0.5 | 1.0 | 0.3 | 3.8 | 0.5 |  |
| objective.accomplish/beamed-short | 5.2 | 2.7% | 1 | 0.2 | 0.2 | 1.6 | 1.2 | 0.2 | 0.2 | 1.6 |
| facility.enter | 4.8 | 2.5% | 1 | 0.3 | 0.7 | 1.2 | 0.6 |  |  | 2.0 |
| agent.progress | 3.1 | 1.6% | 1 |  | 0.3 | 0.8 |  | 0.4 |  | 1.6 |
| threat.engage | 2.4 | 1.3% | 1 | 0.3 | 0.5 | 1.3 |  | 0.3 |  |  |
| piece.appear | 1.6 | 0.8% | 1 | 0.3 |  | 0.9 |  | 0.4 |  |  |
| threat.engage/montage | 1.4 | 0.8% | 1 | 0.2 | 0.3 | 0.8 |  | 0.2 |  |  |

| Waiting cause (inferred) | Maneuver-s | Maneuvers |
|---|---|---|
| P-5 | 51.8 | 7 |
| P-3 | 0.0 | 0 |
| P-4 | 0.0 | 0 |
| P-6 | 0.0 | 0 |
| other | 0.0 | 0 |
| P-10 carry (measured) | 0.0 | 0 beats |

## Quasar Pod (Halcyon Reach, Sprint 41)

sprint-pods, tz America/Los_Angeles, 472 events; 86 beats played of 348 (262 silent, 7 cut by the budget); budget default.

| Component | s | % |
|---|---|---|
| Orient | 3.0 | 0.6 |
| Gaps | 32.6 | 6.6 |
| Day turns (9) | 2.7 | 0.5 |
| Tail gap | 0.3 | 0.1 |
| Final hold | 1.2 | 0.2 |
| Beats: playing | 452.1 | 91.9 |
| Beats: queue idle | 0.0 | 0.0 |
| Beats: note hold | 0.0 | 0.0 |
| **Total** | 491.9 | 100.0 |

| Rule | s | Share | Maneuvers | tell | gather | act | land | echo | disperse | hold |
|---|---|---|---|---|---|---|---|---|---|---|
| agent.progress | 75.2 | 16.6% | 25 |  | 7.5 | 19.2 |  | 9.6 |  | 38.9 |
| attachment.merge/short | 72.9 | 16.1% | 16 | 2.9 | 8.6 | 15.4 | 4.8 | 32.8 | 8.3 |  |
| attachment.merge/first | 63.2 | 14.0% | 8 | 2.4 | 7.2 | 18.4 | 4.0 | 24.0 | 7.2 |  |
| objective.accomplish/beamed-short | 52.0 | 11.5% | 10 | 1.8 | 2.4 | 15.6 | 12.0 | 2.4 | 1.8 | 16.0 |
| facility.enter | 34.6 | 7.7% | 8 | 2.4 | 5.7 | 9.6 | 4.8 |  |  | 12.1 |
| attachment.merge/short/montage | 30.2 | 6.7% | 7 | 1.3 | 3.8 | 6.7 | 2.1 | 12.6 | 3.8 |  |
| attachment.merge | 28.8 | 6.4% | 4 | 1.2 | 3.6 | 6.4 | 2.0 | 12.0 | 3.6 |  |
| threat.accomplish/beamed-short | 26.9 | 6.0% | 5 | 0.9 | 2.1 | 7.8 | 6.0 | 1.2 | 1.2 | 7.7 |
| seat.complete/short | 23.3 | 5.1% | 6 | 1.1 | 2.5 | 3.6 | 4.0 | 3.2 |  | 8.9 |
| threat.accomplish/beamed | 20.5 | 4.5% | 3 | 0.9 | 2.1 | 7.8 | 3.6 | 1.2 | 1.2 | 3.7 |
| objective.accomplish/beamed-short/montage | 18.0 | 4.0% | 6 | 0.9 | 1.2 | 7.8 | 6.0 | 1.2 | 0.9 |  |
| objective.accomplish/beamed | 6.5 | 1.4% | 1 | 0.3 | 0.4 | 2.6 | 1.2 | 0.4 | 0.3 | 1.3 |

| Waiting cause (inferred) | Maneuver-s | Maneuvers |
|---|---|---|
| P-5 | 74.0 | 11 |
| P-3 | 0.0 | 0 |
| P-4 | 0.0 | 0 |
| P-6 | 11.2 | 1 |
| other | 0.0 | 0 |
| P-10 carry (measured) | 0.0 | 0 beats |

## Pulsar Pod (Halcyon Reach, Sprint 41)

sprint-pods, tz America/Los_Angeles, 335 events; 56 beats played of 275 (219 silent, 6 cut by the budget); budget default.

| Component | s | % |
|---|---|---|
| Orient | 3.0 | 0.8 |
| Gaps | 19.6 | 5.3 |
| Day turns (8) | 2.4 | 0.6 |
| Tail gap | 0.3 | 0.1 |
| Final hold | 1.2 | 0.3 |
| Beats: playing | 346.1 | 92.9 |
| Beats: queue idle | 0.0 | 0.0 |
| Beats: note hold | 0.0 | 0.0 |
| **Total** | 372.6 | 100.0 |

| Rule | s | Share | Maneuvers | tell | gather | act | land | echo | disperse | hold |
|---|---|---|---|---|---|---|---|---|---|---|
| attachment.merge/first | 63.2 | 18.3% | 8 | 2.4 | 7.2 | 18.4 | 4.0 | 24.0 | 7.2 |  |
| objective.accomplish/beamed-short | 46.8 | 13.5% | 9 | 1.6 | 2.2 | 14.0 | 10.8 | 2.2 | 1.6 | 14.4 |
| seat.complete/short | 46.6 | 13.5% | 12 | 2.2 | 5.0 | 7.2 | 7.9 | 6.5 |  | 17.8 |
| facility.enter | 41.2 | 11.9% | 9 | 2.7 | 6.4 | 10.8 | 5.4 |  |  | 15.9 |
| attachment.merge/short | 27.9 | 8.1% | 6 | 1.1 | 3.2 | 5.8 | 1.8 | 12.8 | 3.2 |  |
| threat.accomplish/beamed-short | 21.5 | 6.2% | 4 | 0.7 | 1.7 | 6.2 | 4.8 | 1.0 | 1.0 | 6.2 |
| threat.accomplish/beamed | 20.5 | 5.9% | 3 | 0.9 | 2.1 | 7.8 | 3.6 | 1.2 | 1.2 | 3.7 |
| agent.progress | 18.7 | 5.4% | 6 |  | 1.8 | 4.8 |  | 2.4 |  | 9.7 |
| attachment.merge/short/montage | 17.3 | 5.0% | 4 | 0.7 | 2.2 | 3.8 | 1.2 | 7.2 | 2.2 |  |
| attachment.merge | 14.4 | 4.2% | 2 | 0.6 | 1.8 | 3.2 | 1.0 | 6.0 | 1.8 |  |
| objective.accomplish/short | 12.4 | 3.6% | 3 | 0.5 | 0.7 | 1.4 | 3.6 | 0.7 | 0.5 | 4.8 |
| objective.accomplish/beamed | 6.5 | 1.9% | 1 | 0.3 | 0.4 | 2.6 | 1.2 | 0.4 | 0.3 | 1.3 |
| threat.accomplish/short | 4.5 | 1.3% | 1 | 0.2 | 0.4 | 0.7 | 1.2 | 0.2 | 0.2 | 1.5 |
| attachment.settle | 2.8 | 0.8% | 1 | 0.3 | 0.6 | 0.9 | 0.6 | 0.4 |  |  |
| piece.off | 1.8 | 0.5% | 1 | 0.3 |  | 0.9 |  |  | 0.6 |  |

| Waiting cause (inferred) | Maneuver-s | Maneuvers |
|---|---|---|
| P-5 | 75.5 | 14 |
| P-3 | 0.0 | 0 |
| P-4 | 0.0 | 0 |
| P-6 | 0.0 | 0 |
| other | 0.0 | 0 |
| P-10 carry (measured) | 0.0 | 0 beats |

## Convoy Planning Pod (Meridian Works, Sprint 7)

v1/meridian-sprint, tz America/Los_Angeles, 117 events; 31 beats played of 36 (5 silent, 2 cut by the budget); budget default.

| Component | s | % |
|---|---|---|
| Orient | 3.0 | 1.6 |
| Gaps | 8.9 | 4.9 |
| Day turns (9) | 3.5 | 1.9 |
| Tail gap | 0.3 | 0.2 |
| Final hold | 1.2 | 0.7 |
| Beats: playing | 166.2 | 90.8 |
| Beats: queue idle | 0.0 | 0.0 |
| Beats: note hold | 0.0 | 0.0 |
| **Total** | 183.1 | 100.0 |

| Rule | s | Share | Maneuvers | tell | gather | act | land | echo | disperse | hold |
|---|---|---|---|---|---|---|---|---|---|---|
| objective.underway | 50.3 | 30.3% | 20 | 4.2 | 7.0 | 16.8 |  | 5.6 |  | 16.7 |
| objective.nearing | 28.8 | 17.4% | 10 | 2.4 | 4.8 | 8.8 |  | 3.2 |  | 9.6 |
| attachment.merge/first | 15.8 | 9.5% | 2 | 0.6 | 1.8 | 4.6 | 1.0 | 6.0 | 1.8 |  |
| facility.enter | 14.5 | 8.7% | 3 | 0.9 | 2.1 | 3.6 | 1.8 |  |  | 6.1 |
| attachment.merge | 14.4 | 8.7% | 2 | 0.6 | 1.8 | 3.2 | 1.0 | 6.0 | 1.8 |  |
| objective.accomplish | 14.2 | 8.5% | 3 | 0.9 | 1.2 | 2.4 | 3.6 | 1.2 | 0.9 | 4.0 |
| attachment.open | 8.5 | 5.1% | 5 | 1.5 |  | 5.0 | 2.0 |  |  |  |
| objective.accomplish/beamed | 6.5 | 3.9% | 1 | 0.3 | 0.4 | 2.6 | 1.2 | 0.4 | 0.3 | 1.3 |
| seat.complete | 5.1 | 3.1% | 1 | 0.3 | 0.7 | 1.0 | 1.1 | 0.9 |  | 1.1 |
| region.sweep | 3.7 | 2.2% | 1 | 0.3 |  | 3.0 |  | 0.4 |  |  |
| objective.accomplish/short/montage | 2.5 | 1.5% | 4 | 0.2 | 0.2 | 0.5 | 1.2 | 0.2 | 0.2 |  |
| piece.off | 1.8 | 1.1% | 1 | 0.3 |  | 0.9 |  |  | 0.6 |  |
| objective.accomplish/arc | 0.0 | 0.0% | 3 |  |  |  |  |  |  |  |

| Waiting cause (inferred) | Maneuver-s | Maneuvers |
|---|---|---|
| P-5 | 32.6 | 6 |
| P-3 | 0.0 | 0 |
| P-4 | 0.0 | 0 |
| P-6 | 16.0 | 5 |
| other | 0.0 | 0 |
| P-10 carry (measured) | 0.0 | 0 beats |

## Harbor Pod (Tidewater Array, Sprint 13)

v1/pod-sprint, tz America/Los_Angeles, 126 events; 30 beats played of 38 (8 silent, 3 cut by the budget); budget default.

| Component | s | % |
|---|---|---|
| Orient | 3.0 | 1.7 |
| Gaps | 7.8 | 4.4 |
| Day turns (9) | 3.5 | 2.0 |
| Tail gap | 0.3 | 0.2 |
| Final hold | 1.2 | 0.7 |
| Beats: playing | 162.3 | 91.0 |
| Beats: queue idle | 0.0 | 0.0 |
| Beats: note hold | 0.2 | 0.1 |
| **Total** | 178.3 | 100.0 |

| Rule | s | Share | Maneuvers | tell | gather | act | land | echo | disperse | hold |
|---|---|---|---|---|---|---|---|---|---|---|
| attachment.merge/first | 23.7 | 14.6% | 3 | 0.9 | 2.7 | 6.9 | 1.5 | 9.0 | 2.7 |  |
| attachment.merge | 21.6 | 13.3% | 3 | 0.9 | 2.7 | 4.8 | 1.5 | 9.0 | 2.7 |  |
| objective.nearing | 18.5 | 11.4% | 5 | 1.5 | 3.0 | 5.5 |  | 2.0 |  | 6.5 |
| objective.underway | 17.9 | 11.0% | 9 | 1.5 | 2.5 | 6.0 |  | 2.0 |  | 5.9 |
| facility.enter | 12.5 | 7.7% | 3 | 0.9 | 2.1 | 3.6 | 1.8 |  |  | 4.0 |
| attachment.open | 11.9 | 7.3% | 9 | 2.1 |  | 7.0 | 2.8 |  |  |  |
| threat.accomplish | 10.8 | 6.7% | 2 | 0.6 | 1.4 | 2.4 | 2.4 | 0.8 | 0.8 | 2.4 |
| threat.engage | 9.6 | 5.9% | 6 | 1.2 | 2.0 | 5.2 |  | 1.2 |  |  |
| objective.accomplish | 9.4 | 5.8% | 2 | 0.6 | 0.8 | 1.6 | 2.4 | 0.8 | 0.6 | 2.6 |
| threat.accomplish/beamed | 5.9 | 3.6% | 1 | 0.3 | 0.7 | 2.6 | 1.2 | 0.4 | 0.4 | 0.3 |
| seat.complete | 5.1 | 3.2% | 1 | 0.3 | 0.7 | 1.0 | 1.1 | 0.9 |  | 1.1 |
| region.sweep | 3.6 | 2.2% | 1 | 0.3 |  | 2.9 |  | 0.4 |  |  |
| threat.accomplish/short/montage | 3.0 | 1.8% | 1 | 0.2 | 0.4 | 0.7 | 1.2 | 0.2 | 0.2 |  |
| region.clear | 3.0 | 1.8% | 1 | 0.3 |  | 1.6 |  | 1.0 |  |  |
| piece.reseat | 2.4 | 1.5% | 1 | 0.3 | 0.3 | 1.4 | 0.4 |  |  |  |
| piece.off | 1.8 | 1.1% | 1 | 0.3 |  | 0.9 |  |  | 0.6 |  |
| piece.appear | 1.6 | 1.0% | 1 | 0.3 |  | 0.9 |  | 0.4 |  |  |
| attachment.settle | 0.0 | 0.0% | 1 |  |  |  |  |  |  |  |
| objective.accomplish/arc | 0.0 | 0.0% | 4 |  |  |  |  |  |  |  |
| objective.nearing/montage | 0.0 | 0.0% | 1 |  |  |  |  |  |  |  |
| threat.accomplish/arc | 0.0 | 0.0% | 1 |  |  |  |  |  |  |  |

| Waiting cause (inferred) | Maneuver-s | Maneuvers |
|---|---|---|
| P-5 | 59.2 | 11 |
| P-3 | 3.0 | 1 |
| P-4 | 0.0 | 0 |
| P-6 | 5.9 | 1 |
| other | 0.0 | 0 |
| P-10 carry (measured) | 0.0 | 0 beats |

## Meteor Pod (Halcyon Reach, Sprint 41)

sprint-pods, tz America/Los_Angeles, 159 events; 31 beats played of 49 (18 silent, 0 cut by the budget); budget default.

| Component | s | % |
|---|---|---|
| Orient | 3.0 | 0.6 |
| Gaps | 12.1 | 2.5 |
| Day turns (7) | 2.1 | 0.4 |
| Tail gap | 0.3 | 0.1 |
| Final hold | 1.2 | 0.2 |
| Beats: playing | 465.2 | 96.1 |
| Beats: queue idle | 0.0 | 0.0 |
| Beats: note hold | 0.0 | 0.0 |
| **Total** | 483.9 | 100.0 |

| Rule | s | Share | Maneuvers | tell | gather | act | land | echo | disperse | hold |
|---|---|---|---|---|---|---|---|---|---|---|
| attachment.merge/first | 284.4 | 61.1% | 36 | 10.8 | 32.4 | 82.8 | 18.0 | 108.0 | 32.4 |  |
| facility.enter | 88.6 | 19.1% | 19 | 5.7 | 13.6 | 22.8 | 11.4 |  |  | 35.1 |
| facility.enter/montage | 30.4 | 6.5% | 18 | 3.2 | 7.7 | 13.0 | 6.5 |  |  |  |
| attachment.merge | 21.6 | 4.6% | 3 | 0.9 | 2.7 | 4.8 | 1.5 | 9.0 | 2.7 |  |
| objective.accomplish/beamed | 13.0 | 2.8% | 2 | 0.6 | 0.8 | 5.2 | 2.4 | 0.8 | 0.6 | 2.6 |
| seat.complete/short | 7.8 | 1.7% | 2 | 0.4 | 0.8 | 1.2 | 1.3 | 1.1 |  | 3.0 |
| objective.accomplish/beamed-short | 5.2 | 1.1% | 1 | 0.2 | 0.2 | 1.6 | 1.2 | 0.2 | 0.2 | 1.6 |
| objective.accomplish | 4.7 | 1.0% | 1 | 0.3 | 0.4 | 0.8 | 1.2 | 0.4 | 0.3 | 1.3 |
| threat.accomplish/short | 4.5 | 1.0% | 1 | 0.2 | 0.4 | 0.7 | 1.2 | 0.2 | 0.2 | 1.5 |
| agent.progress | 3.1 | 0.7% | 1 |  | 0.3 | 0.8 |  | 0.4 |  | 1.6 |
| region.clear/short | 1.8 | 0.4% | 1 | 0.2 |  | 1.0 |  | 0.6 |  |  |

| Waiting cause (inferred) | Maneuver-s | Maneuvers |
|---|---|---|
| P-5 | 1142.9 | 53 |
| P-3 | 4.5 | 1 |
| P-4 | 0.0 | 0 |
| P-6 | 0.0 | 0 |
| other | 0.0 | 0 |
| P-10 carry (measured) | 0.0 | 0 beats |

## Candidates

What each E item would save per pod, **modelled, not built** (`npm run pacing -- --candidates`). Positive means shorter. Each row is one of three methods. **R**: the rule edit is run as a real re-schedule (beat lengths, gaps, the 45 s budget fit and the cuts all re-run). **P**: post-hoc on the plans (a waiting maneuver starts earlier; the sequencer is private, so there is no budget re-fit, and P is an optimistic upper bound). **F**: on the frame (gaps and day turns of the final schedule). The stack rows compose the edits and are not sums: interactions are real. Comet is the yardstick and comes first.

### Assumptions

- **E1** (R) Fewer signals: facility.enter gather 1300 -> 715 ms (the summoner's flight, 55%, stays; the three beacon pulses and bearing go). Other cut effects cost no schedule time: a floor, E1's value is attention. Built (E1): today's rules already have it, so this row reads 0; see *Built*.
- **E2** (P) Labels on arrival: Built (E2): today's rules already have it, so this row reads about 0; see the build record. A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later.
- **E3** (-) Progress beam (enabler): Enabler: used by E5, which carries the saving; alone it costs no schedule time.
- **E4a** (R) Transform from gather (U1): Built (E4a): today's rules already have it, so this row reads about 0; see *Built*. A first merge's 4.4 s transform starts at its gather and the station fires as it ends: tell 300, gather 900, act 2300, land 500, echo 3000, disperse 900, holds the facility (3.2 s saved per first merge; C2 modelled act 3500, 2.0 s).
- **E4b** (P) Overlap neighbours (P3): Built (E4b): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on attention places, or on a shared actor). P-4 and P-6 waits start min(predecessor echo + disperse, own tell + gather) earlier (P-3 and P-5 share an actor, which P3 forbids). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later.
- **E4c** (P) Captain waits near (P4): Built (E4c): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on a protected pair, or on the attention budget). A P-5 wait starts (predecessor end - its crew close) earlier, floored at 0: the captain waits near instead of leaving. No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later.
- **E4d** (R) Short forms (P7): Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling. A ceiling (the director picks which): every protected rule and its variants has each phase x 0.6, except a close's land; the captain's plate minimums still floor it.
- **E5** (R) The director: Built (E5a): the pass picks each moment's form; see *Built*. Modelled here: merges with no arc close, minus each author's first merge and each day's climax, become a 1.5 s progress beam. Trade-down and the target are not modelled: E5 + E4d is its ceiling.
- **E6** (R) Multi-fire volleys: Built (E6): merges into one facility within 20 s of x on one day play as one volley, under the B-15 guard; see *Built*. Modelled here: per facility, merges within 10 s of a group's first (same day) play only their split beam (echo 1500 ms, no gather, no held turn). The union formation's labels are not modelled.
- **E7** (R) Sector sweep: A lower bound (within a beat only): the first of n >= 2 creations sweeps (tell 300, act 900 + 250 x (n-1), echo 400) and the others are dropped. Built (E7): a beat with 4 or more creations plays one Sector sweep (tell 300, act min(2000, 110 x n) + 1000, echo 400); see *Built*.
- **E8** (F) Tighter frame: Day turns keep 0.6 of themselves, last-day gaps and the tail gap 0.7, floored at 500 ms. Expected 0 s: every pod is over budget and already squeezed to 500 ms. Widening early days is ignored.
- **E8-250** (F) Tighter frame (floor 250 ms): As E8 with a 250 ms floor: a sensitivity row (gaps squeezed further than the engine's minimum).
- **E9** (-) Camera: Renderer-only: the camera costs no schedule time.
- **Stack** (R+P+F): E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows.
- **Not modelled**: the target, the director's trade-down, the union formation's labels, early-day widening, cross-beat sweeps. Rows from P or F that land under the budget say so: the gaps would re-expand.
- **Held time** in P is `max(duration, 1.8 s note)` unless the maneuver is quiet; light work costs nothing.

### Matrix (saving s, % of the pod's baseline)

| Item | Comet Pod | Nova Pod | Quasar Pod | Pulsar Pod | Convoy Planning Pod | Harbor Pod |
|---|---|---|---|---|---|---|
| *Baseline s* | 61.8 | 235.8 | 1050.2 | 670.4 | 189.6 | 199.4 |
| E1 Fewer signals | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) |
| E2 Labels on arrival | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.3 s (0.2%) |
| E3 Progress beam (enabler) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) |
| E4a Transform from gather (U1) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) |
| E4b Overlap neighbours (P3) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.3 s (0.2%) |
| E4c Captain waits near (P4) | 3.4 s (5.4%) | 3.0 s (1.3%) | 23.4 s (2.2%) | 16.1 s (2.4%) | 4.4 s (2.3%) | 5.8 s (2.9%) |
| E4d Short forms (P7) | 11.2 s (18.1%) | 47.0 s (19.9%) | 240.5 s (22.9%) | 136.4 s (20.3%) | 14.5 s (7.6%) | 25.6 s (12.8%) |
| E5 The director | 0.0 s (0.0%) | 11.1 s (4.7%) | 308.9 s (29.4%) | 80.2 s (12.0%) | 0.0 s (0.0%) | 4.0 s (2.0%) |
| E6 Multi-fire volleys | 0.0 s (0.0%) | 5.4 s (2.3%) | 11.1 s (1.1%) | 10.8 s (1.6%) | 0.0 s (0.0%) | 4.0 s (2.0%) |
| E7 Sector sweep | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | -2.4 s (-1.3%) | 5.1 s (2.5%) |
| E8 Tighter frame | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) |
| E8-250 Tighter frame (floor 250 ms) | 1.5 s (2.4%) | 2.0 s (0.9%) | 1.9 s (0.2%) | 3.0 s (0.4%) | 2.4 s (1.3%) | 2.5 s (1.3%) |
| E9 Camera | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) | 0.0 s (0.0%) |
| Stack | 3.4 s (5.4%) | 14.1 s (6.0%) | 317.1 s (30.2%) | 96.3 s (14.4%) | 2.0 s (1.0%) | 18.5 s (9.3%) |
| Stack + short forms | 13.4 s (21.7%) | 53.1 s (22.5%) | 391.9 s (37.3%) | 185.4 s (27.7%) | 14.4 s (7.6%) | 37.2 s (18.6%) |

### Comet Pod

Baseline 61.8 s.

| Rank | Item | Saving s | % | Est. total s | Assumption and detail |
|---|---|---|---|---|---|
| 1 | E4d Short forms (P7) |11.2 | 18.1 | 50.7 | 6 protected moments, phases x 0.6 (a close's land stays 1200 ms). Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling. A ceiling (the director picks which): every protected rule and its variants has each phase x 0.6, except a close's land; the captain's plate minimums still floor it. |
| 2 | E4c Captain waits near (P4) |3.4 | 5.4 | 58.5 | 3 waits start earlier. Built (E4c): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on a protected pair, or on the attention budget). A P-5 wait starts (predecessor end - its crew close) earlier, floored at 0: the captain waits near instead of leaving. No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 3 | E8-250 Tighter frame (floor 250 ms) |1.5 | 2.4 | 60.3 | 6 day turns, 2 last-day gaps. As E8 with a 250 ms floor: a sensitivity row (gaps squeezed further than the engine's minimum). |
| 4 | E1 Fewer signals |0.0 | 0.0 | 61.8 | 1 facility entrances, gather 1300 -> 715. facility.enter gather 1300 -> 715 ms (the summoner's flight, 55%, stays; the three beacon pulses and bearing go). Other cut effects cost no schedule time: a floor, E1's value is attention. Built (E1): today's rules already have it, so this row reads 0; see *Built*. |
| 5 | E2 Labels on arrival |0.0 | 0.0 | 61.8 | 0 waits start earlier. Built (E2): today's rules already have it, so this row reads about 0; see the build record. A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 6 | E3 Progress beam (enabler) |0.0 | 0.0 | 61.8 | not scheduled. Enabler: used by E5, which carries the saving; alone it costs no schedule time. |
| 7 | E4a Transform from gather (U1) |0.0 | 0.0 | 61.8 | 1 first merge, 3.2 s each. Built (E4a): today's rules already have it, so this row reads about 0; see *Built*. A first merge's 4.4 s transform starts at its gather and the station fires as it ends: tell 300, gather 900, act 2300, land 500, echo 3000, disperse 900, holds the facility (3.2 s saved per first merge; C2 modelled act 3500, 2.0 s). |
| 8 | E4b Overlap neighbours (P3) |0.0 | 0.0 | 61.8 | 0 waits start earlier. Built (E4b): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on attention places, or on a shared actor). P-4 and P-6 waits start min(predecessor echo + disperse, own tell + gather) earlier (P-3 and P-5 share an actor, which P3 forbids). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 9 | E5 The director |0.0 | 0.0 | 61.8 | 0 of 2 merges replaced by a 1.5 s beam; every merge is exempt (each author's first merge or a day's climax), so E5 is not exercised in this pod. Built (E5a): the pass picks each moment's form; see *Built*. Modelled here: merges with no arc close, minus each author's first merge and each day's climax, become a 1.5 s progress beam. Trade-down and the target are not modelled: E5 + E4d is its ceiling. |
| 10 | E6 Multi-fire volleys |0.0 | 0.0 | 61.8 | 0 merges join 2 volleys (2 merges). Built (E6): merges into one facility within 20 s of x on one day play as one volley, under the B-15 guard; see *Built*. Modelled here: per facility, merges within 10 s of a group's first (same day) play only their split beam (echo 1500 ms, no gather, no held turn). The union formation's labels are not modelled. |
| 11 | E7 Sector sweep |0.0 | 0.0 | 61.8 | 0 creations fold into 0 sweeps. A lower bound (within a beat only): the first of n >= 2 creations sweeps (tell 300, act 900 + 250 x (n-1), echo 400) and the others are dropped. Built (E7): a beat with 4 or more creations plays one Sector sweep (tell 300, act min(2000, 110 x n) + 1000, echo 400); see *Built*. |
| 12 | E8 Tighter frame |0.0 | 0.0 | 61.8 | 6 day turns, 2 last-day gaps. Day turns keep 0.6 of themselves, last-day gaps and the tail gap 0.7, floored at 500 ms. Expected 0 s: every pod is over budget and already squeezed to 500 ms. Widening early days is ignored. |
| 13 | E9 Camera |0.0 | 0.0 | 61.8 | not scheduled. Renderer-only: the camera costs no schedule time. |
| - | Stack |3.4 | 5.4 | 58.5 | E1: 1 facility entrances, gather 1300 -> 715; E4a: 1 first merge, 3.2 s each; E5: 0 of 2 merges replaced by a 1.5 s beam; every merge is exempt (each author's first merge or a day's climax), so E5 is not exercised in this pod; E6: 0 merges join 2 volleys (2 merges); E7: 0 creations fold into 0 sweeps; P: 3 waits advanced (3.4 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. |
| - | Stack + short forms |13.4 | 21.7 | 48.5 | E1: 1 facility entrances, gather 1300 -> 715; E4a: 1 first merge, 3.2 s each; E5: 0 of 2 merges replaced by a 1.5 s beam; every merge is exempt (each author's first merge or a day's climax), so E5 is not exercised in this pod; E6: 0 merges join 2 volleys (2 merges); E7: 0 creations fold into 0 sweeps; E4d: 6 protected moments, phases x 0.6 (a close's land stays 1200 ms); P: 3 waits advanced (2.2 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. Plus E4d (short forms), last, a ceiling. |

### Nova Pod

Baseline 235.8 s.

| Rank | Item | Saving s | % | Est. total s | Assumption and detail |
|---|---|---|---|---|---|
| 1 | E4d Short forms (P7) |47.0 | 19.9 | 188.8 | 21 protected moments, phases x 0.6 (a close's land stays 1200 ms). Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling. A ceiling (the director picks which): every protected rule and its variants has each phase x 0.6, except a close's land; the captain's plate minimums still floor it. |
| 2 | E5 The director |11.1 | 4.7 | 224.7 | 2 of 10 merges replaced by a 1.5 s beam. Built (E5a): the pass picks each moment's form; see *Built*. Modelled here: merges with no arc close, minus each author's first merge and each day's climax, become a 1.5 s progress beam. Trade-down and the target are not modelled: E5 + E4d is its ceiling. |
| 3 | E6 Multi-fire volleys |5.4 | 2.3 | 230.4 | 1 merge joins 9 volleys (10 merges). Built (E6): merges into one facility within 20 s of x on one day play as one volley, under the B-15 guard; see *Built*. Modelled here: per facility, merges within 10 s of a group's first (same day) play only their split beam (echo 1500 ms, no gather, no held turn). The union formation's labels are not modelled. |
| 4 | E4c Captain waits near (P4) |3.0 | 1.3 | 232.8 | 4 waits start earlier. Built (E4c): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on a protected pair, or on the attention budget). A P-5 wait starts (predecessor end - its crew close) earlier, floored at 0: the captain waits near instead of leaving. No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 5 | E8-250 Tighter frame (floor 250 ms) |2.0 | 0.9 | 233.7 | 8 day turns, 3 last-day gaps. As E8 with a 250 ms floor: a sensitivity row (gaps squeezed further than the engine's minimum). |
| 6 | E1 Fewer signals |0.0 | 0.0 | 235.8 | 1 facility entrances, gather 1300 -> 715. facility.enter gather 1300 -> 715 ms (the summoner's flight, 55%, stays; the three beacon pulses and bearing go). Other cut effects cost no schedule time: a floor, E1's value is attention. Built (E1): today's rules already have it, so this row reads 0; see *Built*. |
| 7 | E2 Labels on arrival |0.0 | 0.0 | 235.8 | 0 waits start earlier. Built (E2): today's rules already have it, so this row reads about 0; see the build record. A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 8 | E3 Progress beam (enabler) |0.0 | 0.0 | 235.8 | not scheduled. Enabler: used by E5, which carries the saving; alone it costs no schedule time. |
| 9 | E4a Transform from gather (U1) |0.0 | 0.0 | 235.8 | 1 first merge, 3.2 s each. Built (E4a): today's rules already have it, so this row reads about 0; see *Built*. A first merge's 4.4 s transform starts at its gather and the station fires as it ends: tell 300, gather 900, act 2300, land 500, echo 3000, disperse 900, holds the facility (3.2 s saved per first merge; C2 modelled act 3500, 2.0 s). |
| 10 | E4b Overlap neighbours (P3) |0.0 | 0.0 | 235.8 | 0 waits start earlier. Built (E4b): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on attention places, or on a shared actor). P-4 and P-6 waits start min(predecessor echo + disperse, own tell + gather) earlier (P-3 and P-5 share an actor, which P3 forbids). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 11 | E7 Sector sweep |0.0 | 0.0 | 235.8 | 0 creations fold into 0 sweeps. A lower bound (within a beat only): the first of n >= 2 creations sweeps (tell 300, act 900 + 250 x (n-1), echo 400) and the others are dropped. Built (E7): a beat with 4 or more creations plays one Sector sweep (tell 300, act min(2000, 110 x n) + 1000, echo 400); see *Built*. |
| 12 | E8 Tighter frame |0.0 | 0.0 | 235.8 | 8 day turns, 3 last-day gaps. Day turns keep 0.6 of themselves, last-day gaps and the tail gap 0.7, floored at 500 ms. Expected 0 s: every pod is over budget and already squeezed to 500 ms. Widening early days is ignored. |
| 13 | E9 Camera |0.0 | 0.0 | 235.8 | not scheduled. Renderer-only: the camera costs no schedule time. |
| - | Stack |14.1 | 6.0 | 221.7 | E1: 1 facility entrances, gather 1300 -> 715; E4a: 1 first merge, 3.2 s each; E5: 2 of 10 merges replaced by a 1.5 s beam; E6: 1 merge joins 9 volleys (10 merges); E7: 0 creations fold into 0 sweeps; P: 4 waits advanced (3.0 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. |
| - | Stack + short forms |53.1 | 22.5 | 182.7 | E1: 1 facility entrances, gather 1300 -> 715; E4a: 1 first merge, 3.2 s each; E5: 2 of 10 merges replaced by a 1.5 s beam; E6: 1 merge joins 9 volleys (10 merges); E7: 0 creations fold into 0 sweeps; E4d: 21 protected moments, phases x 0.6 (a close's land stays 1200 ms); P: 4 waits advanced (2.4 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. Plus E4d (short forms), last, a ceiling. |

### Quasar Pod

Baseline 1050.2 s.

| Rank | Item | Saving s | % | Est. total s | Assumption and detail |
|---|---|---|---|---|---|
| 1 | E5 The director |308.9 | 29.4 | 741.3 | 53 of 66 merges replaced by a 1.5 s beam. Built (E5a): the pass picks each moment's form; see *Built*. Modelled here: merges with no arc close, minus each author's first merge and each day's climax, become a 1.5 s progress beam. Trade-down and the target are not modelled: E5 + E4d is its ceiling. |
| 2 | E4d Short forms (P7) |240.5 | 22.9 | 809.7 | 97 protected moments, phases x 0.6 (a close's land stays 1200 ms). Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling. A ceiling (the director picks which): every protected rule and its variants has each phase x 0.6, except a close's land; the captain's plate minimums still floor it. |
| 3 | E4c Captain waits near (P4) |23.4 | 2.2 | 1026.8 | 26 waits start earlier. Built (E4c): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on a protected pair, or on the attention budget). A P-5 wait starts (predecessor end - its crew close) earlier, floored at 0: the captain waits near instead of leaving. No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 4 | E6 Multi-fire volleys |11.1 | 1.1 | 1039.1 | 2 merges join 64 volleys (66 merges). Built (E6): merges into one facility within 20 s of x on one day play as one volley, under the B-15 guard; see *Built*. Modelled here: per facility, merges within 10 s of a group's first (same day) play only their split beam (echo 1500 ms, no gather, no held turn). The union formation's labels are not modelled. |
| 5 | E8-250 Tighter frame (floor 250 ms) |1.9 | 0.2 | 1048.2 | 9 day turns, 1 last-day gaps. As E8 with a 250 ms floor: a sensitivity row (gaps squeezed further than the engine's minimum). |
| 6 | E1 Fewer signals |0.0 | 0.0 | 1050.2 | 8 facility entrances, gather 1300 -> 715. facility.enter gather 1300 -> 715 ms (the summoner's flight, 55%, stays; the three beacon pulses and bearing go). Other cut effects cost no schedule time: a floor, E1's value is attention. Built (E1): today's rules already have it, so this row reads 0; see *Built*. |
| 7 | E2 Labels on arrival |0.0 | 0.0 | 1050.2 | 0 waits start earlier. Built (E2): today's rules already have it, so this row reads about 0; see the build record. A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 8 | E3 Progress beam (enabler) |0.0 | 0.0 | 1050.2 | not scheduled. Enabler: used by E5, which carries the saving; alone it costs no schedule time. |
| 9 | E4a Transform from gather (U1) |0.0 | 0.0 | 1050.2 | 8 first merges, 3.2 s each. Built (E4a): today's rules already have it, so this row reads about 0; see *Built*. A first merge's 4.4 s transform starts at its gather and the station fires as it ends: tell 300, gather 900, act 2300, land 500, echo 3000, disperse 900, holds the facility (3.2 s saved per first merge; C2 modelled act 3500, 2.0 s). |
| 10 | E4b Overlap neighbours (P3) |0.0 | 0.0 | 1050.2 | 0 waits start earlier. Built (E4b): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on attention places, or on a shared actor). P-4 and P-6 waits start min(predecessor echo + disperse, own tell + gather) earlier (P-3 and P-5 share an actor, which P3 forbids). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 11 | E7 Sector sweep |0.0 | 0.0 | 1050.2 | 0 creations fold into 0 sweeps. A lower bound (within a beat only): the first of n >= 2 creations sweeps (tell 300, act 900 + 250 x (n-1), echo 400) and the others are dropped. Built (E7): a beat with 4 or more creations plays one Sector sweep (tell 300, act min(2000, 110 x n) + 1000, echo 400); see *Built*. |
| 12 | E8 Tighter frame |0.0 | 0.0 | 1050.2 | 9 day turns, 1 last-day gaps. Day turns keep 0.6 of themselves, last-day gaps and the tail gap 0.7, floored at 500 ms. Expected 0 s: every pod is over budget and already squeezed to 500 ms. Widening early days is ignored. |
| 13 | E9 Camera |0.0 | 0.0 | 1050.2 | not scheduled. Renderer-only: the camera costs no schedule time. |
| - | Stack |317.1 | 30.2 | 733.1 | E1: 8 facility entrances, gather 1300 -> 715; E4a: 8 first merges, 3.2 s each; E5: 53 of 66 merges replaced by a 1.5 s beam; E6: 2 merges join 64 volleys (66 merges); E7: 0 creations fold into 0 sweeps; P: 14 waits advanced (8.2 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. |
| - | Stack + short forms |391.9 | 37.3 | 658.3 | E1: 8 facility entrances, gather 1300 -> 715; E4a: 8 first merges, 3.2 s each; E5: 53 of 66 merges replaced by a 1.5 s beam; E6: 2 merges join 64 volleys (66 merges); E7: 0 creations fold into 0 sweeps; E4d: 97 protected moments, phases x 0.6 (a close's land stays 1200 ms); P: 14 waits advanced (7.6 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. Plus E4d (short forms), last, a ceiling. |

### Pulsar Pod

Baseline 670.4 s.

| Rank | Item | Saving s | % | Est. total s | Assumption and detail |
|---|---|---|---|---|---|
| 1 | E4d Short forms (P7) |136.4 | 20.3 | 534.0 | 63 protected moments, phases x 0.6 (a close's land stays 1200 ms). Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling. A ceiling (the director picks which): every protected rule and its variants has each phase x 0.6, except a close's land; the captain's plate minimums still floor it. |
| 2 | E5 The director |80.2 | 12.0 | 590.1 | 14 of 30 merges replaced by a 1.5 s beam. Built (E5a): the pass picks each moment's form; see *Built*. Modelled here: merges with no arc close, minus each author's first merge and each day's climax, become a 1.5 s progress beam. Trade-down and the target are not modelled: E5 + E4d is its ceiling. |
| 3 | E4c Captain waits near (P4) |16.1 | 2.4 | 654.3 | 24 waits start earlier. Built (E4c): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on a protected pair, or on the attention budget). A P-5 wait starts (predecessor end - its crew close) earlier, floored at 0: the captain waits near instead of leaving. No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 4 | E6 Multi-fire volleys |10.8 | 1.6 | 659.6 | 2 merges join 28 volleys (30 merges). Built (E6): merges into one facility within 20 s of x on one day play as one volley, under the B-15 guard; see *Built*. Modelled here: per facility, merges within 10 s of a group's first (same day) play only their split beam (echo 1500 ms, no gather, no held turn). The union formation's labels are not modelled. |
| 5 | E8-250 Tighter frame (floor 250 ms) |3.0 | 0.4 | 667.4 | 8 day turns, 9 last-day gaps. As E8 with a 250 ms floor: a sensitivity row (gaps squeezed further than the engine's minimum). |
| 6 | E1 Fewer signals |0.0 | 0.0 | 670.4 | 9 facility entrances, gather 1300 -> 715. facility.enter gather 1300 -> 715 ms (the summoner's flight, 55%, stays; the three beacon pulses and bearing go). Other cut effects cost no schedule time: a floor, E1's value is attention. Built (E1): today's rules already have it, so this row reads 0; see *Built*. |
| 7 | E2 Labels on arrival |0.0 | 0.0 | 670.4 | 0 waits start earlier. Built (E2): today's rules already have it, so this row reads about 0; see the build record. A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 8 | E3 Progress beam (enabler) |0.0 | 0.0 | 670.4 | not scheduled. Enabler: used by E5, which carries the saving; alone it costs no schedule time. |
| 9 | E4a Transform from gather (U1) |0.0 | 0.0 | 670.4 | 8 first merges, 3.2 s each. Built (E4a): today's rules already have it, so this row reads about 0; see *Built*. A first merge's 4.4 s transform starts at its gather and the station fires as it ends: tell 300, gather 900, act 2300, land 500, echo 3000, disperse 900, holds the facility (3.2 s saved per first merge; C2 modelled act 3500, 2.0 s). |
| 10 | E4b Overlap neighbours (P3) |0.0 | 0.0 | 670.4 | 0 waits start earlier. Built (E4b): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on attention places, or on a shared actor). P-4 and P-6 waits start min(predecessor echo + disperse, own tell + gather) earlier (P-3 and P-5 share an actor, which P3 forbids). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 11 | E7 Sector sweep |0.0 | 0.0 | 670.4 | 0 creations fold into 0 sweeps. A lower bound (within a beat only): the first of n >= 2 creations sweeps (tell 300, act 900 + 250 x (n-1), echo 400) and the others are dropped. Built (E7): a beat with 4 or more creations plays one Sector sweep (tell 300, act min(2000, 110 x n) + 1000, echo 400); see *Built*. |
| 12 | E8 Tighter frame |0.0 | 0.0 | 670.4 | 8 day turns, 9 last-day gaps. Day turns keep 0.6 of themselves, last-day gaps and the tail gap 0.7, floored at 500 ms. Expected 0 s: every pod is over budget and already squeezed to 500 ms. Widening early days is ignored. |
| 13 | E9 Camera |0.0 | 0.0 | 670.4 | not scheduled. Renderer-only: the camera costs no schedule time. |
| - | Stack |96.3 | 14.4 | 574.1 | E1: 9 facility entrances, gather 1300 -> 715; E4a: 8 first merges, 3.2 s each; E5: 14 of 30 merges replaced by a 1.5 s beam; E6: 2 merges join 28 volleys (30 merges); E7: 0 creations fold into 0 sweeps; P: 24 waits advanced (16.1 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. |
| - | Stack + short forms |185.4 | 27.7 | 484.9 | E1: 9 facility entrances, gather 1300 -> 715; E4a: 8 first merges, 3.2 s each; E5: 14 of 30 merges replaced by a 1.5 s beam; E6: 2 merges join 28 volleys (30 merges); E7: 0 creations fold into 0 sweeps; E4d: 63 protected moments, phases x 0.6 (a close's land stays 1200 ms); P: 23 waits advanced (13.2 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. Plus E4d (short forms), last, a ceiling. |

### Convoy Planning Pod

Baseline 189.6 s.

| Rank | Item | Saving s | % | Est. total s | Assumption and detail |
|---|---|---|---|---|---|
| 1 | E4d Short forms (P7) |14.5 | 7.6 | 175.1 | 16 protected moments, phases x 0.6 (a close's land stays 1200 ms). Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling. A ceiling (the director picks which): every protected rule and its variants has each phase x 0.6, except a close's land; the captain's plate minimums still floor it. |
| 2 | E4c Captain waits near (P4) |4.4 | 2.3 | 185.2 | 5 waits start earlier. Built (E4c): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on a protected pair, or on the attention budget). A P-5 wait starts (predecessor end - its crew close) earlier, floored at 0: the captain waits near instead of leaving. No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 3 | E8-250 Tighter frame (floor 250 ms) |2.4 | 1.3 | 187.2 | 9 day turns, 4 last-day gaps. As E8 with a 250 ms floor: a sensitivity row (gaps squeezed further than the engine's minimum). |
| 4 | E1 Fewer signals |0.0 | 0.0 | 189.6 | 3 facility entrances, gather 1300 -> 715. facility.enter gather 1300 -> 715 ms (the summoner's flight, 55%, stays; the three beacon pulses and bearing go). Other cut effects cost no schedule time: a floor, E1's value is attention. Built (E1): today's rules already have it, so this row reads 0; see *Built*. |
| 5 | E2 Labels on arrival |0.0 | 0.0 | 189.6 | 9 waits start earlier. Built (E2): today's rules already have it, so this row reads about 0; see the build record. A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 6 | E3 Progress beam (enabler) |0.0 | 0.0 | 189.6 | not scheduled. Enabler: used by E5, which carries the saving; alone it costs no schedule time. |
| 7 | E4a Transform from gather (U1) |0.0 | 0.0 | 189.6 | 2 first merges, 3.2 s each. Built (E4a): today's rules already have it, so this row reads about 0; see *Built*. A first merge's 4.4 s transform starts at its gather and the station fires as it ends: tell 300, gather 900, act 2300, land 500, echo 3000, disperse 900, holds the facility (3.2 s saved per first merge; C2 modelled act 3500, 2.0 s). |
| 8 | E4b Overlap neighbours (P3) |0.0 | 0.0 | 189.6 | 9 waits start earlier. Built (E4b): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on attention places, or on a shared actor). P-4 and P-6 waits start min(predecessor echo + disperse, own tell + gather) earlier (P-3 and P-5 share an actor, which P3 forbids). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 9 | E5 The director |0.0 | 0.0 | 189.6 | 0 of 4 merges replaced by a 1.5 s beam; every merge is exempt (each author's first merge or a day's climax), so E5 is not exercised in this pod. Built (E5a): the pass picks each moment's form; see *Built*. Modelled here: merges with no arc close, minus each author's first merge and each day's climax, become a 1.5 s progress beam. Trade-down and the target are not modelled: E5 + E4d is its ceiling. |
| 10 | E6 Multi-fire volleys |0.0 | 0.0 | 189.6 | 0 merges join 4 volleys (4 merges). Built (E6): merges into one facility within 20 s of x on one day play as one volley, under the B-15 guard; see *Built*. Modelled here: per facility, merges within 10 s of a group's first (same day) play only their split beam (echo 1500 ms, no gather, no held turn). The union formation's labels are not modelled. |
| 11 | E8 Tighter frame |0.0 | 0.0 | 189.6 | 9 day turns, 4 last-day gaps. Day turns keep 0.6 of themselves, last-day gaps and the tail gap 0.7, floored at 500 ms. Expected 0 s: every pod is over budget and already squeezed to 500 ms. Widening early days is ignored. |
| 12 | E9 Camera |0.0 | 0.0 | 189.6 | not scheduled. Renderer-only: the camera costs no schedule time. |
| 13 | E7 Sector sweep |-2.4 | -1.3 | 192.0 | 22 creations fold into 1 sweeps **(longer than the baseline)**. A lower bound (within a beat only): the first of n >= 2 creations sweeps (tell 300, act 900 + 250 x (n-1), echo 400) and the others are dropped. Built (E7): a beat with 4 or more creations plays one Sector sweep (tell 300, act min(2000, 110 x n) + 1000, echo 400); see *Built*. |
| - | Stack |2.0 | 1.0 | 187.6 | E1: 3 facility entrances, gather 1300 -> 715; E4a: 2 first merges, 3.2 s each; E5: 0 of 4 merges replaced by a 1.5 s beam; every merge is exempt (each author's first merge or a day's climax), so E5 is not exercised in this pod; E6: 0 merges join 4 volleys (4 merges); E7: 22 creations fold into 1 sweeps; P: 5 waits advanced (4.4 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. |
| - | Stack + short forms |14.4 | 7.6 | 175.1 | E1: 3 facility entrances, gather 1300 -> 715; E4a: 2 first merges, 3.2 s each; E5: 0 of 4 merges replaced by a 1.5 s beam; every merge is exempt (each author's first merge or a day's climax), so E5 is not exercised in this pod; E6: 0 merges join 4 volleys (4 merges); E7: 22 creations fold into 1 sweeps; E4d: 16 protected moments, phases x 0.6 (a close's land stays 1200 ms); P: 4 waits advanced (2.4 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. Plus E4d (short forms), last, a ceiling. |

### Harbor Pod

Baseline 199.4 s.

| Rank | Item | Saving s | % | Est. total s | Assumption and detail |
|---|---|---|---|---|---|
| 1 | E4d Short forms (P7) |25.6 | 12.8 | 173.8 | 20 protected moments, phases x 0.6 (a close's land stays 1200 ms). Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling. A ceiling (the director picks which): every protected rule and its variants has each phase x 0.6, except a close's land; the captain's plate minimums still floor it. |
| 2 | E4c Captain waits near (P4) |5.8 | 2.9 | 193.6 | 7 waits start earlier. Built (E4c): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on a protected pair, or on the attention budget). A P-5 wait starts (predecessor end - its crew close) earlier, floored at 0: the captain waits near instead of leaving. No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 3 | E7 Sector sweep |5.1 | 2.5 | 194.3 | 16 creations fold into 1 sweeps. A lower bound (within a beat only): the first of n >= 2 creations sweeps (tell 300, act 900 + 250 x (n-1), echo 400) and the others are dropped. Built (E7): a beat with 4 or more creations plays one Sector sweep (tell 300, act min(2000, 110 x n) + 1000, echo 400); see *Built*. |
| 4 | E6 Multi-fire volleys |4.0 | 2.0 | 195.4 | 1 merge joins 6 volleys (7 merges). Built (E6): merges into one facility within 20 s of x on one day play as one volley, under the B-15 guard; see *Built*. Modelled here: per facility, merges within 10 s of a group's first (same day) play only their split beam (echo 1500 ms, no gather, no held turn). The union formation's labels are not modelled. |
| 5 | E5 The director |4.0 | 2.0 | 195.4 | 1 of 7 merges replaced by a 1.5 s beam. Built (E5a): the pass picks each moment's form; see *Built*. Modelled here: merges with no arc close, minus each author's first merge and each day's climax, become a 1.5 s progress beam. Trade-down and the target are not modelled: E5 + E4d is its ceiling. |
| 6 | E8-250 Tighter frame (floor 250 ms) |2.5 | 1.3 | 196.9 | 9 day turns, 5 last-day gaps. As E8 with a 250 ms floor: a sensitivity row (gaps squeezed further than the engine's minimum). |
| 7 | E2 Labels on arrival |0.3 | 0.2 | 199.1 | 5 waits start earlier. Built (E2): today's rules already have it, so this row reads about 0; see the build record. A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 8 | E4b Overlap neighbours (P3) |0.3 | 0.2 | 199.1 | 5 waits start earlier. Built (E4b): today's rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on attention places, or on a shared actor). P-4 and P-6 waits start min(predecessor echo + disperse, own tell + gather) earlier (P-3 and P-5 share an actor, which P3 forbids). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later. |
| 9 | E1 Fewer signals |0.0 | 0.0 | 199.4 | 3 facility entrances, gather 1300 -> 715. facility.enter gather 1300 -> 715 ms (the summoner's flight, 55%, stays; the three beacon pulses and bearing go). Other cut effects cost no schedule time: a floor, E1's value is attention. Built (E1): today's rules already have it, so this row reads 0; see *Built*. |
| 10 | E3 Progress beam (enabler) |0.0 | 0.0 | 199.4 | not scheduled. Enabler: used by E5, which carries the saving; alone it costs no schedule time. |
| 11 | E4a Transform from gather (U1) |0.0 | 0.0 | 199.4 | 3 first merges, 3.2 s each. Built (E4a): today's rules already have it, so this row reads about 0; see *Built*. A first merge's 4.4 s transform starts at its gather and the station fires as it ends: tell 300, gather 900, act 2300, land 500, echo 3000, disperse 900, holds the facility (3.2 s saved per first merge; C2 modelled act 3500, 2.0 s). |
| 12 | E8 Tighter frame |0.0 | 0.0 | 199.4 | 9 day turns, 5 last-day gaps. Day turns keep 0.6 of themselves, last-day gaps and the tail gap 0.7, floored at 500 ms. Expected 0 s: every pod is over budget and already squeezed to 500 ms. Widening early days is ignored. |
| 13 | E9 Camera |0.0 | 0.0 | 199.4 | not scheduled. Renderer-only: the camera costs no schedule time. |
| - | Stack |18.5 | 9.3 | 180.9 | E1: 3 facility entrances, gather 1300 -> 715; E4a: 3 first merges, 3.2 s each; E5: 1 of 7 merges replaced by a 1.5 s beam; E6: 1 merge joins 6 volleys (7 merges); E7: 16 creations fold into 1 sweeps; P: 8 waits advanced (5.4 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. |
| - | Stack + short forms |37.2 | 18.6 | 162.2 | E1: 3 facility entrances, gather 1300 -> 715; E4a: 3 first merges, 3.2 s each; E5: 1 of 7 merges replaced by a 1.5 s beam; E6: 1 merge joins 6 volleys (7 merges); E7: 16 creations fold into 1 sweeps; E4d: 20 protected moments, phases x 0.6 (a close's land stays 1200 ms); P: 7 waits advanced (3.4 s); F: 0.0 s. E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows. Plus E4d (short forms), last, a ceiling. |

## Built

What each built E item saves per pod: a real re-schedule with the item's change undone (before) against today's rules (now), beside C2's estimate (`npm run pacing -- --candidates`). Positive means shorter.

| Item | Pod | Before s | Now s | Saved s | C2's estimate s | Difference s |
|---|---|---|---|---|---|---|
| E1 Fewer signals | Comet Pod | 62.4 | 61.8 | 0.6 | 0.6 | 0.0 |
| E1 Fewer signals | Nova Pod | 236.3 | 235.8 | 0.6 | 0.6 | 0.0 |
| E1 Fewer signals | Quasar Pod | 1054.9 | 1050.2 | 4.7 | 4.7 | 0.0 |
| E1 Fewer signals | Pulsar Pod | 675.6 | 670.4 | 5.3 | 5.3 | 0.0 |
| E1 Fewer signals | Convoy Planning Pod | 191.3 | 189.6 | 1.8 | 1.8 | 0.0 |
| E1 Fewer signals | Harbor Pod | 201.2 | 199.4 | 1.8 | 1.8 | 0.0 |
| E4a Transform from the gather | Comet Pod | 66.7 | 61.8 | 4.8 | 2.0 | 2.8 |
| E4a Transform from the gather | Nova Pod | 239.0 | 235.8 | 3.2 | 2.0 | 1.2 |
| E4a Transform from the gather | Quasar Pod | 1075.8 | 1050.2 | 25.6 | 16.0 | 9.6 |
| E4a Transform from the gather | Pulsar Pod | 696.0 | 670.4 | 25.6 | 16.0 | 9.6 |
| E4a Transform from the gather | Convoy Planning Pod | 196.0 | 189.6 | 6.4 | 4.0 | 2.4 |
| E4a Transform from the gather | Harbor Pod | 210.7 | 199.4 | 11.3 | 6.0 | 5.3 |
| E4b Overlap neighbours (P3) | Comet Pod | 61.8 | 61.8 | 0.0 | 0.0 | 0.0 |
| E4b Overlap neighbours (P3) | Nova Pod | 235.8 | 235.8 | 0.0 | 0.0 | 0.0 |
| E4b Overlap neighbours (P3) | Quasar Pod | 1050.2 | 1050.2 | 0.0 | 0.0 | 0.0 |
| E4b Overlap neighbours (P3) | Pulsar Pod | 670.4 | 670.4 | 0.0 | 0.0 | 0.0 |
| E4b Overlap neighbours (P3) | Convoy Planning Pod | 189.6 | 189.6 | 0.0 | 0.0 | 0.0 |
| E4b Overlap neighbours (P3) | Harbor Pod | 199.4 | 199.4 | 0.0 | 0.3 | -0.3 |
| E4c Captain waits near (P4) | Comet Pod | 61.8 | 61.8 | 0.0 | 3.4 | -3.4 |
| E4c Captain waits near (P4) | Nova Pod | 235.8 | 235.8 | 0.0 | 3.0 | -3.0 |
| E4c Captain waits near (P4) | Quasar Pod | 1050.2 | 1050.2 | 0.0 | 23.4 | -23.4 |
| E4c Captain waits near (P4) | Pulsar Pod | 670.4 | 670.4 | 0.0 | 16.1 | -16.1 |
| E4c Captain waits near (P4) | Convoy Planning Pod | 190.0 | 189.6 | 0.4 | 4.4 | -4.0 |
| E4c Captain waits near (P4) | Harbor Pod | 200.1 | 199.4 | 0.7 | 6.3 | -5.6 |
| E4d Short forms (ceiling: every protected moment short; E5 picks) | Comet Pod | 61.8 | 53.8 | 8.0 | 14.1 | -6.1 |
| E4d Short forms (ceiling: every protected moment short; E5 picks) | Nova Pod | 235.8 | 191.8 | 44.0 | 48.2 | -4.2 |
| E4d Short forms (ceiling: every protected moment short; E5 picks) | Quasar Pod | 1050.2 | 835.0 | 215.2 | 250.7 | -35.5 |
| E4d Short forms (ceiling: every protected moment short; E5 picks) | Pulsar Pod | 670.4 | 562.9 | 107.4 | 145.0 | -37.5 |
| E4d Short forms (ceiling: every protected moment short; E5 picks) | Convoy Planning Pod | 189.6 | 179.7 | 9.9 | 17.0 | -7.2 |
| E4d Short forms (ceiling: every protected moment short; E5 picks) | Harbor Pod | 199.4 | 182.8 | 16.6 | 29.9 | -13.3 |
| E5a The director: forms, hero shots, climax, short over the target | Comet Pod | 61.8 | 61.8 | 0.0 | 0.0 | 0.0 |
| E5a The director: forms, hero shots, climax, short over the target | Nova Pod | 235.8 | 224.6 | 11.2 | 11.1 | 0.1 |
| E5a The director: forms, hero shots, climax, short over the target | Quasar Pod | 1050.2 | 301.8 | 748.4 | 308.9 | 439.5 |
| E5a The director: forms, hero shots, climax, short over the target | Pulsar Pod | 670.4 | 295.7 | 374.6 | 80.2 | 294.4 |
| E5a The director: forms, hero shots, climax, short over the target | Convoy Planning Pod | 189.6 | 189.0 | 0.6 | 0.0 | 0.6 |
| E5a The director: forms, hero shots, climax, short over the target | Harbor Pod | 199.4 | 196.5 | 2.9 | 4.0 | -1.1 |
| E5b The director: montage the routine, adaptive speed | Comet Pod | 61.8 | 61.8 | 0.0 | 0.0 | 0.0 |
| E5b The director: montage the routine, adaptive speed | Nova Pod | 224.6 | 224.6 | 0.0 | 0.0 | 0.0 |
| E5b The director: montage the routine, adaptive speed | Quasar Pod | 807.5 | 301.8 | 505.7 | 0.0 | 505.7 |
| E5b The director: montage the routine, adaptive speed | Pulsar Pod | 562.4 | 295.7 | 266.7 | 0.0 | 266.7 |
| E5b The director: montage the routine, adaptive speed | Convoy Planning Pod | 189.0 | 189.0 | 0.0 | 0.0 | 0.0 |
| E5b The director: montage the routine, adaptive speed | Harbor Pod | 196.5 | 196.5 | 0.0 | 0.0 | 0.0 |
| E5c The director: light work for more rules, fewer hero shots | Comet Pod | 61.8 | 61.8 | 0.0 | 0.0 | 0.0 |
| E5c The director: light work for more rules, fewer hero shots | Nova Pod | 224.6 | 224.6 | 0.0 | 0.0 | 0.0 |
| E5c The director: light work for more rules, fewer hero shots | Quasar Pod | 448.1 | 301.8 | 146.4 | 0.0 | 146.4 |
| E5c The director: light work for more rules, fewer hero shots | Pulsar Pod | 321.6 | 295.7 | 25.9 | 0.0 | 25.9 |
| E5c The director: light work for more rules, fewer hero shots | Convoy Planning Pod | 189.0 | 189.0 | 0.0 | 0.0 | 0.0 |
| E5c The director: light work for more rules, fewer hero shots | Harbor Pod | 196.5 | 196.5 | 0.0 | 0.0 | 0.0 |
| E6 Multi-fire volleys (before adaptive speed) | Comet Pod | 61.8 | 61.8 | 0.0 | 0.0 | 0.0 |
| E6 Multi-fire volleys (before adaptive speed) | Nova Pod | 224.6 | 212.8 | 11.8 | 5.4 | 6.4 |
| E6 Multi-fire volleys (before adaptive speed) | Quasar Pod | 802.8 | 784.1 | 18.7 | 11.1 | 7.6 |
| E6 Multi-fire volleys (before adaptive speed) | Pulsar Pod | 562.4 | 555.0 | 7.4 | 10.8 | -3.4 |
| E6 Multi-fire volleys (before adaptive speed) | Convoy Planning Pod | 189.0 | 189.0 | 0.0 | 0.0 | 0.0 |
| E6 Multi-fire volleys (before adaptive speed) | Harbor Pod | 196.5 | 190.8 | 5.7 | 4.0 | 1.7 |
| E6+ Multi-fire volleys, with every lever | Comet Pod | 61.8 | 61.8 | 0.0 | 0.0 | 0.0 |
| E6+ Multi-fire volleys, with every lever | Nova Pod | 224.6 | 212.8 | 11.8 | 5.4 | 6.4 |
| E6+ Multi-fire volleys, with every lever | Quasar Pod | 301.8 | 303.6 | -1.9 | 11.1 | -13.0 |
| E6+ Multi-fire volleys, with every lever | Pulsar Pod | 295.7 | 293.5 | 2.2 | 10.8 | -8.6 |
| E6+ Multi-fire volleys, with every lever | Convoy Planning Pod | 189.0 | 189.0 | 0.0 | 0.0 | 0.0 |
| E6+ Multi-fire volleys, with every lever | Harbor Pod | 196.5 | 190.8 | 5.7 | 4.0 | 1.7 |
| E7 Sector sweep | Comet Pod | 61.8 | 61.8 | 0.0 | 0.0 | 0.0 |
| E7 Sector sweep | Nova Pod | 212.8 | 212.8 | 0.0 | 0.0 | 0.0 |
| E7 Sector sweep | Quasar Pod | 303.6 | 303.6 | 0.0 | 0.0 | 0.0 |
| E7 Sector sweep | Pulsar Pod | 293.5 | 293.5 | 0.0 | 0.0 | 0.0 |
| E7 Sector sweep | Convoy Planning Pod | 189.0 | 188.0 | 1.0 | -2.4 | 3.4 |
| E7 Sector sweep | Harbor Pod | 190.8 | 183.7 | 7.1 | 5.1 | 2.0 |
| E8 Rising tempo | Comet Pod | 61.8 | 60.8 | 1.1 | 0.0 | 1.1 |
| E8 Rising tempo | Nova Pod | 212.8 | 209.3 | 3.5 | 0.0 | 3.5 |
| E8 Rising tempo | Quasar Pod | 303.6 | 299.1 | 4.5 | 0.0 | 4.5 |
| E8 Rising tempo | Pulsar Pod | 293.5 | 288.8 | 4.7 | 0.0 | 4.7 |
| E8 Rising tempo | Convoy Planning Pod | 188.0 | 184.7 | 3.3 | 0.0 | 3.3 |
| E8 Rising tempo | Harbor Pod | 183.7 | 179.9 | 3.9 | 0.0 | 3.9 |
| E10 Late-day montage | Comet Pod | 60.8 | 60.8 | 0.0 | 0.0 | 0.0 |
| E10 Late-day montage | Nova Pod | 209.3 | 209.3 | 0.0 | 0.0 | 0.0 |
| E10 Late-day montage | Quasar Pod | 299.1 | 299.1 | 0.0 | 0.0 | 0.0 |
| E10 Late-day montage | Pulsar Pod | 288.8 | 288.8 | 0.0 | 0.0 | 0.0 |
| E10 Late-day montage | Convoy Planning Pod | 184.7 | 183.1 | 1.6 | 0.0 | 1.6 |
| E10 Late-day montage | Harbor Pod | 179.9 | 178.3 | 1.5 | 0.0 | 1.5 |


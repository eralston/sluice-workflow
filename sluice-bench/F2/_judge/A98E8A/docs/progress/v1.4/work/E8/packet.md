# Packet E8: Tempo
Risk: medium (the shared schedule's layout, behind a switch only Solar sets; the ledger and unit tests decide it) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 0278b3c

## Acceptance
- A unit test: day-turn lengths follow the curve, never go below a floor, and are deterministic.
- The ledger shows the saving.

## Approach
What the ledger says first: every Solar pod runs far over the 45 s schedule budget, so `fit()` squeezes to 0 and
**every gap and day turn on all six pods is already 500 ms** (`GAP_MIN_MS`; measured at 0278b3c). P10 ("shorter day
turns when dense") is therefore already met by B-18's squeeze (1500 to 500 ms), and C2 modelled E8 at 0 s. E8 can
only save by going below 500 ms. Decisions:
1. **Rising tempo (new B-23).** On a schedule with `risingTempo` set, each gap, day turn and the tail gap is first
   computed as today (squeezed), then multiplied by `risingShare(p) = RISING_FIRST_DAY + (RISING_LAST_DAY - RISING_FIRST_DAY) * p`
   and clamped: `risingMs(ms, p, capMs) = Math.min(capMs, Math.max(RISING_FLOOR_MS, ms * risingShare(p)))`. Values:
   `RISING_FIRST_DAY = 1.1` ("a little wider"), `RISING_LAST_DAY = 0.5`, `RISING_FLOOR_MS = 300`. Cap: `gapMax` for a gap
   and the tail gap, `DAY_TURN_MS` for a day turn, so B-16's cap and B-17's 1.5 s still hold. No rounding (gaps are
   floats today).
2. **p is the chapter count:** for a played beat, p = (day turns at or before it) / T, where T is the episode's day
   turns; the tail gap takes p = 1. With T = 0 (one day, or `dayTurns` off) gaps are unchanged. To know T, split
   `layout()`'s loop: a first pass sets `opensDay` exactly as today (same code moved, `delete` included) and counts T;
   the second lays out. Chosen over local-day indexing: it is the chapters the viewer sees, and adds no `localDay` calls.
3. **P10, dense:** when the episode is over its target, i.e. the director pulled any lever
   (`limelight?.direction?.levers.length > 0`; Quasar and Pulsar today), each day turn is `RISING_FLOOR_MS` flat. Read from
   the limelight `buildBeatSchedule` already has before layout.
4. **The switch:** `ScheduleOptions.risingTempo?: boolean` (unset: v0 path byte-identical, so the v0 goldens can't move).
   `pacing()` returns `risingTempo: true` beside `dayTurns: true` unless `PacingOptions.risingTempo === false`.
   `EngineInputs.risingTempo?: false` in the ledger passes it through (add it to `scheduleOf`'s early-return test).
5. **Ledger:** C2's candidates run with `risingTempo: false` (their committed numbers must not move); every Built item
   before E8 runs both schedules with `risingTempo: false` (new `BuiltItem.rises?: true`, as `sweeps` did for E7). New
   Built row `E8 Rising tempo`: before `{ risingTempo: false }`, `directs: true`, `sweeps: true`, `rises: true`,
   estimate 0 on every pod (C2's committed E8 row). Regenerate with `npm run pacing -- --candidates`.
6. **The montage threshold is not scaled** (a departure from the item's Decided line): no such number exists. The
   director's montage (P-24) folds a back-to-back repeat; P-15 montage triggers on a wait for a label place. Inventing a
   run-length threshold would be a new director rule outside Touches, and on dense pods the speed lever would re-fit it
   away. Say so in B-23's note and the build record; the orchestrator raises it at the final check.
7. The director's estimate (`GAP_MIN_MS` per beat) and limelight's fair-turn clock (`DAY_TURN_MS`) are not changed.

Modelled (planner's probe on the six pods, the curve applied to today's gaps, wall time with each beat's tempo):
Comet 1.05 s (1.7%), Nova 3.48 s (1.6%), Quasar 4.51 s (1.5%; 303.6 to about 299.1, just inside the 300 s cap),
Pulsar 4.71 s (1.6%), Convoy Planning 3.30 s (1.8%), Harbor 3.85 s (2.1%). Report the real numbers from the regenerated
ledger. If any pod's saving is ≤ 0, or Comet moves 5% or more, stop and report. Don't retune.

## Files
- `src/shared/playback/constants.ts` 1-30: add the three constants, with a doc comment each, after `DAY_TURN_MS`.
- `src/shared/playback/schedule.ts` 123-160 (`layout`), 209-240 (`ScheduleOptions`), 318-357 (fit, return): export
  `risingShare` and `risingMs`; give `layout` a `rising?: { dense: boolean }` parameter, passed from all four
  `layout(...)` calls in `fit` when `opts.risingTempo`.
- `src/shared/engine/maneuvers.ts` 851-868 (`PacingOptions`), 881-922 (`pacing()`, the `dayTurns: true` line).
- `src/shared/engine/director.ts` 154-188: read only (how `levers` and the estimate work).
- `scripts/pacing-ledger.ts` 29-61 (`EngineInputs`, `scheduleOf`).
- `scripts/pacing-built.ts` 8-139 (`BuiltItem`, `BUILT`, `buildBuilt`'s `base`).
- `scripts/pacing-candidates.ts` 335-340 (`buildCandidates`' inputs).
- `tests/unit/pacingBuilt.test.ts` 63-147; `tests/unit/limelight.test.ts` 20-47 (a Solar schedule's gaps, as a pattern).
- `tests/unit/rising.test.ts` (new).
- `docs/05-playback.md` 664-675 (§8.3b), `docs/15-reference.md` 1208-1215 (§10), `docs/03-contracts.md` 1468-1478.
- Regenerated: `docs/progress/v1.4/pacing-ledger.md`, `pacing-ledger.json`, `pacing-built.json`.
  `pacing-candidates.json` must come out byte-identical.

## Excerpts
- 27 E8, Decided: "Day turns shorten when the episode runs over its target, and a tempo curve across the sprint's days
  scales the gaps and the montage threshold (constants in 15 §10)."
- 27 Decisions, 2026-11-01 (HG-C): "a **5 min cap** at 1× for every pod, and Comet within 5% of its 67.3 s. The cap is
  the director's target and is soft". E5's reading: Comet's yardstick is 61,845 ms, and "the director must not shorten
  it further" (E8 shortens its gaps only, about 1 s).
- Today's `layout` (schedule.ts:132-134):
  `const gap = (a, b) => GAP_MIN_MS + (gapMs(weightedHours(a, b, tz), gapMax) - GAP_MIN_MS) * squeeze;`
  `const turn = GAP_MIN_MS + (DAY_TURN_MS - GAP_MIN_MS) * squeeze;`
- 05 B-17: "Where a working day changes between beats, a **day turn** (`DAY_TURN_MS`, 1.5 s) replaces the gap: a
  chapter break. Nights and weekends fold into the next morning's. It opens with a breather (§8.5b)".
  B-16: "No gap longer than `PULSE_GAP_MAX_MS` (1.2 s at 1×)". B-18: "it squeezes gaps first, as ever".
- 05 B-19's note says "accented beats start over 500 ms apart"; make it "over 300 ms apart (B-23's floor)".
- Project notes: "every constant with a row in `docs/15-reference.md` changes with its row, in the same edit"; "A
  departure [from 03] means amending the doc in the same change, and saying so in the run record"; "**The effect where
  it's meant:** check the change on the busy fixtures it's for (Halcyon's Pulsar and Quasar pods)".
- `pacingBuilt.test.ts:138`: E1-E5's rows are fixed values, so they must not move ("a change that moves them fails
  here rather than being regenerated into the json").

Doc rows to write:
- 05 §8.3b, a new **B-23 Rising tempo** row: what 1-3 say, values named; Notes "Revises B-5, B-17. **Built** with 27 E8
  (`risingShare`, `risingMs`, `ScheduleOptions.risingTempo`, set by Solar's pacing). The montage threshold the item named
  is not scaled: there is none (P-24 folds a back-to-back repeat)". Add to B-17's Notes: "On a dense episode it is
  B-23's floor".
- 15 §10, a new row after "A day turn": `| Rising tempo (new, 27 E8) | 1.1 to 0.5, floor 300 ms | \`@shared/playback/constants.ts\` RISING_FIRST_DAY, RISING_LAST_DAY, RISING_FLOOR_MS | ... |`
  (each value must appear as a number: `docTables.test.ts`). Add to "A day turn"'s Meaning: "a dense episode's is the
  rising floor (B-23)".
- 03: `ScheduleOptions += { risingTempo?: boolean }  // Solar: true (27 E8, 05 B-23)` beside `dayTurns`, and
  `PacingOptions += { risingTempo?: false }  // the ledger's "before"; the app never sets it`.

## Checks
New `tests/unit/rising.test.ts` (it may import `resolvePods`/`scheduleOf` from `scripts/pacing-ledger`, as
`director.test.ts` does; set a long timeout):
- `risingShare(0) === RISING_FIRST_DAY`, `risingShare(1) === RISING_LAST_DAY`, non-increasing in p; over a grid of ms
  in [0, 2000] and p in [0, 1], `RISING_FLOOR_MS <= risingMs(ms, p, cap) <= cap`; `risingMs(GAP_MIN_MS, 1, cap) === RISING_FLOOR_MS`.
- The premise: with `risingTempo: false`, every gap and day turn of all six pods is `GAP_MIN_MS`.
- Follows the curve: on Convoy Planning (no lever pulled), the i-th day turn equals `risingMs(GAP_MIN_MS, i / T, DAY_TURN_MS)`,
  the turns are non-increasing, and every gap equals `risingMs(GAP_MIN_MS, p, PULSE_GAP_MAX_MS)` for its p (within 1e-6).
- P10: on Pulsar (levers pulled), every day turn is `RISING_FLOOR_MS`.
- Never below the floor: every gap, day turn and tail gap on all six pods is ≥ `RISING_FLOOR_MS - 1e-6`.
- Deterministic: two builds of one pod give identical `totalMs`, `wallMs` and beat starts.
- v0 untouched: a v0 schedule (e.g. orbit-week, `buildBeatSchedule` with no options) equals one built with
  `risingTempo: false`.

`pacingBuilt.test.ts`: a new case, "E8, rising tempo: rows on all six pods, each saves time; Comet within 5% of 61 845 ms".
E1-E5's fixed rows, and E6, E6+ and E7's committed rows, must not move.

Run: `npm test` (all of it is the gate; the mapped ones are `rising`, `pacingBuilt`, `pacing`, `pacingCandidates`,
`limelight`, `tempo`, `scheduleHooks`, `solarSeek`, `docTables`, goldens `schedule` and `director`). No golden file
should move. If one does, stop and explain, don't update it. Then `npm run pacing -- --candidates`, check the diff
(Summary, frame rows and the Built section move; Candidates must not), and `npm run e2e:spec -- solar-play solar-dense profile`
plus `npm run e2e:keystone`.

Record in `build-1.json`: the six pods' saving (s and %) and their new wall times, whether Quasar is inside the
300 s cap, the montage departure, and the 03 amendment.

## Out of scope
- Scaling the montage lever (decision 6), the adaptive speed (`Direction.tempo`) or any director rule.
- The director's estimate and limelight's `DAY_TURN_MS` clock (decision 7); `GAP_MIN_MS`, `DAY_TURN_MS` and the v0
  views' gaps.
- The day's breather in the renderer. It already gets 500 ms of x on every Solar pod, and a dense day turn's 300 ms
  makes the spotlight's read time shorter still. Note it under `limitations`; don't change `playback.ts` or `ChartApp.ts`.
- E9's camera.

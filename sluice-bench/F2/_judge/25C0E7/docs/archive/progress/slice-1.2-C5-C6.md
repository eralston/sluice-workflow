# Slice 1.2-C5–C6: a steady pulse, montage, and limelight

**Status:** built 2026-10-16. [22 §3, Block C](../22-v1.2.md#3-blocks): C5 (I-2) and C6 (I-3, I-4, G-3),
phase 3. B-19 (every crossed accent) comes with C9, P-16 (turns) with C7.

## 1. What was built
- **A steady pulse (C5, 05 §8 B-16, B-17).**
  - **The cap:** a solar region's gaps are capped at `PULSE_GAP_MAX_MS` (1.2 s; the v0 views keep
    2.5 s) through a new schedule option, `gapMaxMs`.
  - **Day turns:** where the local working day changes between beats, the gap is a day turn
    (`DAY_TURN_MS`, 1.5 s), and the beat is marked `opensDay`. Its night and weekend fold in.
- **Limelight (C6, P-17; `engine/limelight.ts`).** One pure pass over the episode's beats in order (a
  new `ScheduleOptions.limelight` hook, run before any beat is shaped), estimating times from the
  beats' base shapes. Who is named:
  - moments and arcs, always;
  - each person's first turn;
  - after that, a turn only when everyone in it has had no named turn for `FAIR_TURN_MS` (8 s).
- **The day's spotlight (M-28).** Each `opensDay` beat spotlights someone not yet seen, else the fewest
  named turns, then by seat order.
- **Where the decision goes.** The schedule carries its `Limelight`.
  - **The planner:** `shapeOf` and `planManeuvers` (`PlanOptions.limelight`) mark the rest `quiet`:
    unlabelled, no held turn.
  - **The renderer:** passes the schedule's limelight to every beat it plans, as the beat was shaped.
- **Montage (C5, P-15).** In a beat whose named labels would still wait for a place, the quiet work
  plays at `MONTAGE_PACE` (its phases × 0.6), flagged `montage`.
- **The breather (M-28).** The dawn inside a day turn (`chart.dawn`) plays:
  - the star breathing (two rings);
  - the spotlit captain working the piece they rest beside (the theme's idle work), named *On
    {title}*, or *On {their planet}* with no piece.

  The name shows only while the label budget has room (`CastLabels.hasRoom`), and folds before the
  day's first beat starts.
- **The roll call and the finale ungated (M-29, M-27, G-3).**
  - **The roll call:** the finale returns a `rollCall` window, and every captain in the chevron is
    named *Crew* as it holds. It's the team's victory: no count, no rank (INV-19).
  - **Ungated:** the finale's and the recap's commands are issued `essential`, so no load gate drops
    them.

## 2. Contracts changed
- **03 / 14 (as noted):**
  - `Beat.opensDay`;
  - `Limelight` and `BeatSchedule.limelight`;
  - `ScheduleOptions.limelight`, `dayTurns`, `gapMaxMs`, and `beatShape(…, limelight)`;
  - `Hierarchy.pacing(h, ref?)` (a region's captains for its spotlights);
  - `PlannedManeuver.quiet`, `montage`;
  - `Finale`'s `rollCall`.
- **05 §8.3b, §8.5a (P-15) and §8.5b** are marked built; M-27 is built.
- **13 §6.4:** the roll call.
- **15 §10:** `PULSE_GAP_MAX_MS`, `DAY_TURN_MS`, `MONTAGE_PACE`, `FAIR_TURN_MS`, `SPOTLIGHT_S`.

## 3. Checks
- **Unit:** `npm test` passes (993). `limelight.test.ts` (new) runs on the dense pod's schedule:
  - no gap over 1.2 s, but 1.5 s day turns exactly where the local day changes;
  - moments and arcs always named;
  - everyone who flies named at least once;
  - fair turns spaced;
  - montage shorter;
  - spotlights on day-opening beats, the first few on different captains.

  The paced-schedule tests (`maneuvers.test.ts`, `solarSeek.test.ts`) plan with the schedule's
  limelight, as the renderer does.
- **E2E:**
  - Mapped specs and keystone: 58 and 39 passed, with one failure.
  - **That failure:** the dense pod's B8 guard saw five labels at once, a breather's spotlight held
    over into the day's first beat. Fixed: the spotlight now folds before that beat and only names
    when there's room. solar-dense passes.
  - **The close-glide guard** now measures only around each close (from just before the look turns
    to 2.5 s after). A montage reassign flies quicker and isn't a close jumping. It still catches the
    old jump (34.2 px a frame).

## 4. Human gates
HG-C-flow and HG-C-team, at Block C's close:
- the rhythm (no long silences, day turns as chapter breaks);
- montage in a busy hour;
- everyone named at least once;
- the day's spotlight;
- the roll call.

## 5. Known limitations and open questions
- **The fair share is estimated.** It counts in estimated playback (base shapes and a typical gap), not
  the laid-out schedule, which the pass precedes.
- **The spotlight's name can be brief,** or skipped: it must fold before the day's first beat, inside
  a 1.5 s day turn at 1×. Its star breath and the captain's work still play.
- **The ruler doesn't mark the day turn** beyond its existing day labels.

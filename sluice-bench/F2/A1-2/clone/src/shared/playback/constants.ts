// 05 §3 beat schedule constants (all tunable), plus 05 §5 trail limits.
export const GROUP_WINDOW_MS = 30 * 60_000; // source time
export const GROUP_BURST_MS = 2400; // a wave of Tasks: collapse, run, re-expand, echo
// Tightened 2026-10-09 ("it dragged"): holds 2 s → 1.2 s, gaps from 0.7 s → 0.5 s, budget 60 s → 45 s.
export const ORIENT_MS = 1200;
export const FINAL_HOLD_MS = 1200;
export const GAP_MIN_MS = 500;
export const GAP_MAX_MS = 2500;
/** A solar region's dead air at most, at 1× (22 C5, 05 §8 B-16: a steady pulse); the v0 views keep `GAP_MAX_MS`. */
export const PULSE_GAP_MAX_MS = 1200;
/** Where a working day changes between beats, a day turn replaces the gap: a chapter break (22 C5, B-17). */
export const DAY_TURN_MS = 1500;
/** Rising tempo (27 E8, 05 B-23): a solar episode's gaps and day turns keep this share of themselves on its first day... */
export const RISING_FIRST_DAY = 1.1;
/** ...falling linearly, by day turns, to this share on its last day (and the tail gap). */
export const RISING_LAST_DAY = 0.5;
/** No rising gap or day turn is shorter than this; a dense episode's day turns (the director pulled a lever) are this flat. */
export const RISING_FLOOR_MS = 300;
/** Rising tempo's tight end (27 E10, 05 P-24): where a solar episode's `risingShare` is at most this (the last third of its day turns; on a sprint of three days or fewer, its last day), a routine repeat folds to montage even under the director's target. */
export const RISING_TIGHT_SHARE = 0.7;
export const GAP_BASE_MS = 500;
export const GAP_LOG_MS = 450;
/** Hours outside weekdays 07:00–19:00 local count at this weight. */
export const OFF_HOURS_WEIGHT = 0.1;
export const WORKDAY_START_HOUR = 7;
export const WORKDAY_END_HOUR = 19;
/** Jump trails: schedule-time lifetime, fade, and the most per scene (05 §5). */
export const TRAIL_MS = 14_000; // 18 s while a week ran 60 s; scaled to the 45 s pace (2026-10-09), so a late departure's trail still fades before the end
export const TRAIL_FADE_MS = 3000;
export const MAX_TRAILS = 3;
/** The lead-in (05 §5): a beat's tell starts this long before it, or the whole gap if shorter. */
export const LEAD_MS = 700;
/** History (22 B5): the events a beat's card lists, the headline first; the rest are counted, "+N more". */
export const HISTORY_ROWS = 4;
/** Story time (05 §8.3a B-12): a close joins the last merge serving it at most this many working hours before it (two working days). */
export const ARC_WORK_HOURS = 24;

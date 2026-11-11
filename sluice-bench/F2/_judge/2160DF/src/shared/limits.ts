// 03 §0 — tunable pilot limits. Exceeding one moves extras into an overflow token; nothing is dropped.
export const MAX_FEATURES_PER_SECTOR = 15;
export const MAX_CHILDREN_PER_FEATURE = 24;
export const MAX_TASKS_PER_BODY = 24;
/** Task dots drawn under a body in the system view; the close-up shows them all. */
export const MAX_TASK_DOTS_IN_SYSTEM = 8;
export const MAX_STATIONS_PER_FEATURE = 6;
export const BACKFILL_MAX_WEEKS = 4;
/**
 * The most work items one streamed scope will hold (decided 2026-10-08, after a sprint of 575 items
 * grew to 8,020 on the real org): a sprint is its own work, never the whole project. Past this, the
 * stream stops widening and coverage says it's partial.
 */
export const MAX_SCOPE_MEMBERS = 3000;
export const DEFAULT_RANGE_DAYS = 7;
export const LAYOUT_VERSION = 2; // 2: systems as a board (decided 2026-10-09)
/** How a star system seats its children (06 §3): as the team's board, or the earlier ring formation. */
export const SYSTEM_LAYOUT: 'board' | 'formation' = 'board';
export const ART_VERSION = 1;
export const SHIP_DESIGN_VERSION = 1;

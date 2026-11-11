// When a streamed sprint's history has stopped short (decided 2026-10-22): the player says "History
// stopped" and offers Retry. Pure, so it unit-tests; the player's widget (panels/Transport.tsx) feeds it.

/** No request to ADO started or finished for this long, while history is gathering: it has stalled. */
export const GATHER_STALL_MS = 20_000;
/**
 * The stream having ended with history still missing counts as stopped only after this long: a stream
 * that ends normally leaves the player gathering for the moment its last bundle takes to load.
 */
export const GATHER_STOP_GRACE_MS = 3000;

export interface GatherWatch {
  /** The stream is running (the store's `stream`). */
  streaming: boolean;
  /** When it was first seen not running, if it isn't; null while it runs. */
  stoppedAt: number | null;
  /** Requests to ADO in flight, and when the latest finished (null: none yet). */
  active: number;
  lastEndedAt: number | null;
  now: number;
}

/** Whether what's left of the history won't arrive by itself. */
export function gatherStalled(w: GatherWatch): boolean {
  if (!w.streaming) return w.stoppedAt !== null && w.now - w.stoppedAt >= GATHER_STOP_GRACE_MS;
  if (w.active > 0) return false;
  return w.lastEndedAt !== null && w.now - w.lastEndedAt > GATHER_STALL_MS;
}

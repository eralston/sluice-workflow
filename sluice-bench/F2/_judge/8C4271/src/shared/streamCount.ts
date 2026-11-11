// The streaming load's count (23 B6): "Filling in · N of ~M to go". N is the queue still to run; M is the
// work it is out of. Until the sprint's discovery has finished M is an estimate (the scope's member
// count, at least what has been queued so far), shown with a `~`; after, it is exactly what was
// queued, and the `~` goes. N is never more than M: M grows when the queue outruns the estimate.
export interface FillCountIn {
  /** Tasks queued or running now. */
  pending: number;
  /** Tasks completed this run. */
  finished: number;
  /** The scope's members, known after the first look: the estimate's basis (about one history read each). */
  members: number;
  /** Discovery is over: nothing more will be found to queue (the closure ran and found no new roots). */
  exact: boolean;
  /** Items whose history waits for their scene (not queued yet, but work this scope will do). */
  deferred?: number;
}
export interface FillCount { n: number; m: number; exact: boolean }

export function fillCount(i: FillCountIn): FillCount {
  const n = Math.max(0, Math.floor(i.pending));
  const seen = n + Math.max(0, Math.floor(i.finished)) + Math.max(0, Math.floor(i.deferred ?? 0));
  const m = i.exact ? seen : Math.max(seen, Math.max(0, Math.floor(i.members)));
  return { n, m, exact: i.exact };
}

/**
 * The banner's words (06 §3). It counts reads (requests queued for the scope), not scene items, which is
 * what the player counts. Without a total (a stream that has not reported one yet) it is the bare count.
 */
export function fillText(n: number, total?: number, exact?: boolean): string {
  if (total === undefined) return `Filling in · ${n} reads`;
  const m = Math.max(total, n); // never N > M, whatever arrives
  return `Filling in · ${n} of ${exact ? '' : '~'}${m} reads`;
}

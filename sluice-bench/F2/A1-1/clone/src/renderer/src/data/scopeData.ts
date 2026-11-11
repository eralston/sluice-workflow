// The renderer's data layer (decided 2026-10-07): the bundles loaded per scope, the range, and the
// jobs that load them. Navigation asks for a scope's bundle; how it arrives (a whole fixture bundle,
// or ADO's sync by level, 04 §5a) is the source's business, read from its capabilities.
import type { ScopeHistory } from '@shared/contracts/history';
import type { Range, Scope, SyncLevel } from '@shared/contracts/ipc';
import type { CanonicalKey } from '@shared/contracts/keys';
import { warn } from '../devlog';
import { useChart } from '../store';
import { refusesToken } from '@shared/contracts/neterror';
import { isUnreachable, noteTokenRefused } from '../errors';
import { caps } from './caps';

const DAY = 86_400_000;

export const histories = new Map<string, ScopeHistory>();
export const scopeId = (s: Scope): string => JSON.stringify(s);

let range: Range | null = null;
/** The source's default range (05 §1), read at boot. */
export const defaultRange = (): Range | null => range;
export async function readRange(): Promise<Range> {
  range = await window.starChart.history.range();
  return range;
}

/**
 * Hooks navigation sets: a load's progress (the loading energy), a sync's end (captions refresh), and a
 * streaming scope's new facts: whether they touch what's on screen, and the reloaded bundle.
 */
const hooks: {
  progress?: (fraction: number) => void; synced?: () => void;
  touches?: (scope: Scope, h: ScopeHistory, changed: readonly CanonicalKey[]) => boolean;
  streamed?: (scope: Scope, h: ScopeHistory, done: boolean) => void;
} = {};
export function onLoadProgress(fn: (fraction: number) => void): void { hooks.progress = fn; }
export function onSynced(fn: () => void): void { hooks.synced = fn; }
export function onStreamed(touches: NonNullable<typeof hooks.touches>, streamed: NonNullable<typeof hooks.streamed>): void { hooks.touches = touches; hooks.streamed = streamed; }

/**
 * The scope streaming now (decided 2026-10-08): a sprint, behind its first look. Its `scope.updated`
 * batches reload the bundle when they touch the scene on screen (or bring something new), one reload
 * at a time; the rest wait for the next batch, or the end.
 */
let streaming: string | null = null;
/**
 * The stream that has already ended (it finished, or its token was refused). Its last word can arrive
 * before `loadScope` has even heard the first look's reply, and that reply must not put "Filling in"
 * back over it.
 */
let ended: string | null = null;
export const isStreaming = (scope: Scope): boolean => streaming === scopeId(scope);
let watching: (() => void) | null = null;
let reloading = false;
let again: { scope: Scope; done: boolean } | null = null;
function watchStream(): void {
  watching ??= window.starChart.sync.onScopeUpdated?.((e) => {
    const id = scopeId(e.scope);
    if (id !== streaming) return;
    // The token died part-way through (04 §6): the stream has stopped. Say so, and what to do.
    if (e.refused) {
      streaming = null;
      ended = id;
      noteTokenRefused(null); // part-way through: no one call to name
      useChart.getState().set({ stream: null, error: syncError('stream 401'), errorNet: null });
      return;
    }
    if (e.done) ended = id;
    useChart.getState().set({ stream: e.done ? null : { pending: e.pending, ...(e.total !== undefined ? { total: e.total } : {}), ...(e.exact !== undefined ? { exact: e.exact } : {}) } });
    const h = histories.get(id);
    if (!h || (!e.done && !(hooks.touches?.(e.scope, h, e.changed) ?? true))) return;
    void reload(e.scope, e.done);
  }) ?? null;
}
async function reload(scope: Scope, done: boolean): Promise<void> {
  if (reloading) { again = { scope, done: done || (again?.done ?? false) }; return; }
  reloading = true;
  try {
    const next = await window.starChart.history.load(scope, rangeFor(scope));
    histories.set(scopeId(scope), next);
    hooks.streamed?.(scope, next, done);
  } catch (e) {
    warn('stream-reload-failed', { message: String((e as Error).message).slice(0, 120) });
  } finally {
    reloading = false;
    const a = again;
    again = null;
    if (a) void reload(a.scope, a.done);
  }
}

/**
 * Sync a scope (04 §5), or one level of it (decided 2026-10-07), then load its bundle from the cache.
 * Levels of current state show in the sync banner; a history request shows in the player; a catch-up
 * is quiet.
 */
export async function syncAndLoad(scope: Scope, label: string, r: Range, level?: SyncLevel, opts: { quiet?: boolean } = {}): Promise<ScopeHistory> {
  const st = useChart.getState();
  type Progress = Parameters<Parameters<typeof window.starChart.sync.onProgress>[0]>[0];
  // Listen before starting: a job with nothing to fetch can finish before start() returns its ID.
  const early: Progress[] = [];
  let handle: ((p: Progress) => void) | null = null;
  const off = window.starChart.sync.onProgress((p) => (handle ? handle(p) : early.push(p)));
  let jobId: string;
  if (level?.kind === 'history') cancelWhenStarted = false;
  try {
    ({ jobId } = await window.starChart.sync.start(scope, r, level));
  } catch (e) {
    off();
    throw e;
  }
  if (level?.kind === 'history') {
    // Starting… ends here (23 B8): the job has an id, so Cancel works; one pressed before this is sent now.
    const cur = useChart.getState().historyLoad;
    st.set({ historyLoad: { days: level.days, done: 0, total: 0, ...cur, jobId } });
    if (cancelWhenStarted) { cancelWhenStarted = false; void window.starChart.sync.cancel(jobId); }
  }
  const show = (p: Progress | null) => {
    if (level?.kind === 'catchUp' || opts.quiet) return;
    if (level?.kind === 'history') st.set({ historyLoad: p ? { jobId, days: level.days, done: p.done, total: p.total } : null });
    else st.set({ sync: p ? { ...p, label, level: level?.kind, projectKey: scope.projectKey } : null });
  };
  if (level?.kind === 'catchUp') st.set({ catchingUp: true });
  await new Promise<void>((resolve, reject) => {
    handle = (p) => {
      if (p.jobId !== jobId) return;
      show(p);
      hooks.progress?.(p.total > 0 ? p.done / p.total : 0);
      if (p.phase === 'done') { off(); if (p.partial) warn('sync-partial', { key: scope.projectKey }); resolve(); }
      if (p.phase === 'failed') { off(); show(null); if (p.lastError && / 401$/.test(p.lastError) && refusesToken(p.lastError.split(' ')[0] ?? '', 401)) noteTokenRefused(p.lastError.split(' ')[0] ?? null); reject(Object.assign(new Error(p.errorMessage ? `${syncError(p.lastError)} ${p.errorMessage}` : syncError(p.lastError)), { net: p.error ?? null, cancelled: p.lastError === 'cancelled' })); }
    };
    for (const p of early.splice(0)) handle(p);
  });
  try {
    return await window.starChart.history.load(scope, r);
  } finally {
    show(null);
    if (level?.kind === 'catchUp') st.set({ catchingUp: false });
    hooks.synced?.();
  }
}

/**
 * A scope's first load, by level when the source loads that way: the team's current state, or a
 * sprint's first look (decided 2026-10-08), with the rest of the sprint streaming in behind it.
 * `quiet`: a sprint already on hand revalidates in the background (stale-while-revalidate).
 */
export async function loadScope(scope: Scope, label: string, r: Range, opts: { quiet?: boolean } = {}): Promise<ScopeHistory> {
  if (!caps().syncsByLevel) return window.starChart.history.load(scope, r);
  return fromCacheIfOffline(scope, r, async () => {
    if (scope.sector.kind !== 'sprint') return syncAndLoad(scope, label, r, { kind: 'team' });
    watchStream();
    streaming = scopeId(scope); // before the look: a batch can beat its answer home
    ended = null;
    const h = await syncAndLoad(scope, label, r, { kind: 'sprint' }, opts);
    if (ended !== scopeId(scope)) useChart.getState().set({ stream: { pending: 1 } });
    return h;
  });
}

/**
 * Offline, the chart runs from the cache (04 §6, AC-31; decided 2026-10-09). If ADO can't be reached
 * and this scope was synced before, its cached bundle opens and the status bar says how old it is.
 * Any other failure — a refused token, a denied read — is still an error: those need an answer, not a
 * stale chart. A read that gets through clears the offline mark.
 */
async function fromCacheIfOffline(scope: Scope, r: Range, run: () => Promise<ScopeHistory>): Promise<ScopeHistory> {
  const st = useChart.getState();
  try {
    const h = await run();
    if (st.offline) st.set({ offline: false });
    return h;
  } catch (e) {
    if (!isUnreachable(e)) throw e;
    let cached: ScopeHistory;
    try {
      cached = await window.starChart.history.load(scope, r);
    } catch {
      throw e; // never synced: there's nothing to fall back to
    }
    streaming = null;
    useChart.getState().set({ offline: true, sync: null, stream: null });
    warn('offline-from-cache', { syncedAt: cached.coverage.syncedAt ?? 0 });
    return cached;
  }
}



/**
 * A scope's range. A sprint's is its own dates, up to now (decided 2026-10-07: the sprint is the
 * clock). Otherwise the default, widened to the longest history requested in it.
 */
export function rangeFor(scope: Scope, days = 0): Range {
  const r = range!;
  if (scope.sector.kind === 'sprint') {
    // A fixture's clock is the scenario's own, which the source applies (23 D6: the default range
    // is the active scenario's week, which cut a CRM quarter mid-quarter): ask for the whole sprint.
    const end = caps().syncsByLevel ? Math.min(scope.sector.finishUtc, r.endUtc) : scope.sector.finishUtc;
    return { startUtc: scope.sector.startUtc, endUtc: Math.max(end, scope.sector.startUtc + 60_000) };
  }
  const h = histories.get(scopeId(scope));
  const longest = Math.max(days, ...(h?.coverage.played ?? []).map((p) => p.days));
  return longest * DAY > r.endUtc - r.startUtc ? { startUtc: r.endUtc - longest * DAY, endUtc: r.endUtc } : r;
}

/** The sync's failure in plain words: only the endpoint family and status are known (INV-17). */
function syncError(code: string | undefined): string {
  if (!code) return 'Sync failed.';
  if (code === 'cancelled') return 'Sync cancelled.';
  if (/ 401$/.test(code)) return 'ADO refused the token: it may have expired. Enter a new PAT from the mode chip.';
  if (/ 403$/.test(code)) return `ADO denied a read (${code}). Run Check access from the mode chip.`;
  if (/ 429$/.test(code)) return 'ADO is throttling requests. Try again in a few minutes.';
  return code === 'error' ? 'Couldn’t reach ADO. Check your connection.' : `Sync failed (${code}).`;
}

/** Cancel the sync in progress (the banner's Cancel). */
export function cancelSync(): void {
  const s = useChart.getState().sync;
  if (s) void window.starChart.sync.cancel(s.jobId);
}

/** Cancel a history request (the player's Cancel). */
export function cancelHistory(): void {
  const h = useChart.getState().historyLoad;
  if (!h) return;
  if (h.jobId) void window.starChart.sync.cancel(h.jobId);
  else cancelWhenStarted = true; // Starting…: remembered, and sent the moment the job has an id (23 B8)
}
let cancelWhenStarted = false;

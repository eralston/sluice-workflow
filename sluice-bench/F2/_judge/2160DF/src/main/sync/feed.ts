// 04 §5c — scale-up ingestion (v1.3 B5): a big batch of history reads goes through the project-wide reporting
// revisions feed instead of two calls per item. One crawl per run serves every batch of the run from memory.
// The feed carries revisions only (no relation changes), so updates are still read per item, but only for items
// with something new. A history-phase tool: the first look never waits on it.
import type { RevisionFact, UpdateFact } from '@shared/contracts/facts';
import type { UtcMs } from '@shared/contracts/keys';
import { failureTier } from '@shared/contracts/neterror';
import { FEED_BUFFER_ROWS, FEED_FIELDS, FEED_MAX_PAGES, FEED_OVERLAP_MS, FEED_PAGE, FEED_THRESHOLD } from '@shared/feed';
import { parseRevision, parseUpdate } from '@shared/ingest/parse';
import { BACKFILL_MAX_WEEKS } from '@shared/limits';
import { AdoError } from '../ado/client';
import { devlog } from '../devlog';
import { throttleGate } from './scheduler';
import { isGone, pool, scopeKeyOf, type SyncContext, type SyncScope } from './sync';

const DAY = 86_400_000;

/** Test knobs (SyncContext.scale): the threshold, the page cap and size, and where the window of a first read starts. */
export interface ScaleOptions { threshold?: number; maxPages?: number; pageSize?: number; windowFrom?: UtcMs; bufferRows?: number }

/** The scope's one saved crawl: the window's day and start (they must match to resume), the token, the newest ChangedDate seen, and who it covers. */
interface Saved { day: number; since: UtcMs; token: string; maxChanged: UtcMs; covered: number[]; /** Items that held history with no checkpoint when the crawl began (migration 007's cleared ones): their rows are never fed. */ pre?: number[] }
export const feedKey = (scope: SyncScope) => `feed3:${scope.org}:${scopeKeyOf(scope)}`;

export const feedThreshold = (ctx: Pick<SyncContext, 'scale'>) => ctx.scale?.threshold ?? FEED_THRESHOLD;

interface Crawl {
  since: UtcMs; startedThisRun: boolean; complete: boolean; maxChanged: UtcMs;
  /** Parsed rows by item, for the run's later batches; `overflow` once the bound was passed. */
  buffer: Map<number, RevisionFact[]>; rows: number; overflow: boolean;
  /** Items whose rows were stored to the cache from the crawl's beginning (the members and the first batch). */
  covered: Set<number>;
  /** Items that held stored revisions with no checkpoint (and no seed) when the crawl began: the feed's window rows would leave a gap after them, so they are read whole, per item (B5 audit). */
  pre: Set<number>;
}
type Outcome = 'complete' | 'capped' | 'nofeed';
/** `flight`: the crawl in progress, awaited by every batch that needs it (one crawl per session at a time, B5 audit). */
interface Session { used: number; crawl: Crawl | null; noFeed?: boolean; flight?: Promise<Outcome> }
const sessions = new WeakMap<object, Session>();
/** A new run on a long-lived context (a stream's fill or refresh) starts a new page budget and a new crawl. */
export const resetFeedBudget = (ctx: object): void => { sessions.delete(ctx); };

export interface FeedRange { startUtc?: UtcMs; endUtc: UtcMs }

export interface FeedResult {
  /** Items the feed could not serve (another project's, born before the window, changed since a seed, not covered): read them per item. */
  fallback: number[];
  /** The page budget or a transient failure stopped the crawl (or the seed read of some items): its token is kept and the next run resumes. */
  capped: boolean;
  /** Items now current (history and checkpoint, or a seed). Empty when the crawl itself was capped. */
  served: number[];
  /** Of those, the seeded ones (04 §5c). */
  seeded: number[];
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason ?? new Error('Cancelled')); }, { once: true });
});

/**
 * Where a feed read starts for items with no checkpoint: the earlier of (range end minus BACKFILL_MAX_WEEKS) and the range's own
 * start, so a played range is always covered, snapped to the start of its UTC day so a moving clock does not move it within a day.
 */
export const feedWindowFrom = (ctx: Pick<SyncContext, 'scale'>, range: FeedRange): UtcMs => {
  const from = ctx.scale?.windowFrom ?? Math.min(range.endUtc - BACKFILL_MAX_WEEKS * 7 * DAY, range.startUtc ?? Infinity);
  return Math.max(0, Math.floor(from / DAY) * DAY);
};

export async function feedHistory(ctx: SyncContext, scope: SyncScope, list: number[], progress: (done: number, total: number) => void,
  onGone: ((id: number) => void) | undefined, range: FeedRange, failed?: (id: number) => void): Promise<FeedResult> {
  const { client, cache, signal } = ctx;
  const org = scope.org;
  const at = ctx.clock();
  const abort = () => { if (signal?.aborted) throw signal.reason ?? new Error('Cancelled'); };
  const projectId = scope.project.projectId;
  const projectIdOf = (name: string) => (name === scope.project.name ? projectId : cache.projects(org).find((p) => p.name === name)?.projectId);
  const all = [...new Set(list)];
  const cur = cache.currentItems(org, all);
  const foreign = all.filter((id) => { const p = cur.get(id)?.projectId; return p !== undefined && p !== projectId; });
  const wanted = new Set(all.filter((id) => !foreign.includes(id)));
  const fallback = [...foreign];
  const ids = [...wanted];
  const sess = sessions.get(ctx) ?? (sessions.set(ctx, { used: 0, crawl: null }), sessions.get(ctx)!);
  const maxPages = ctx.scale?.maxPages ?? FEED_MAX_PAGES;
  const pageSize = ctx.scale?.pageSize ?? FEED_PAGE;
  if (sess.noFeed) return { fallback: [...fallback, ...ids], capped: false, served: [], seeded: [] };
  const capped = (): FeedResult => ({ fallback, capped: true, served: [], seeded: [] });
  const cps = cache.checkpointRows(org, ids);
  const fresh = ids.filter((id) => !cps.has(id));
  const windowFrom = feedWindowFrom(ctx, range);
  /** Of these items, the ones holding stored revisions with no checkpoint and no seed (migration 007 cleared checkpoints, kept revisions). */
  const preHeld = (list: number[], fedBefore: Set<number> = new Set()): Set<number> => {
    const have = cache.revisions(org, list);
    const cp = cache.checkpointRows(org, list);
    return new Set(list.filter((id) => { const r = have.get(id); return !!r?.length && !cp.has(id) && !fedBefore.has(id) && !r.some((x) => x.seed); }));
  };

  let fedBefore = new Set<number>();
  // ---- The run's one crawl: started by the first batch that needs it, then served from memory to every later batch ----
  if (!sess.crawl) {
    const needWindow = fresh.length >= Math.max(1, feedThreshold(ctx)) || cps.size === 0;
    const knownSince = Math.min(Infinity, ...[...cps.values()].map((c) => c.at - FEED_OVERLAP_MS));
    const since = Math.max(0, needWindow ? Math.min(windowFrom, knownSince) : knownSince);
    const saved = cache.setting<Saved>(feedKey(scope));
    const resume = saved && saved.day === windowFrom && saved.since === since && saved.token ? saved : null;
    // Rows a capped earlier crawl of this scope stored (its `covered`) are fed rows, not old history, whatever starts this crawl.
    fedBefore = new Set(saved?.covered ?? []);
    const pre = resume ? new Set(resume.pre ?? []) : preHeld([...cache.scopeMembers(org, scopeKeyOf(scope)), ...ids], fedBefore);
    sess.crawl = {
      since, startedThisRun: !resume, complete: false, maxChanged: resume?.maxChanged ?? 0,
      buffer: new Map(), rows: 0, overflow: false, pre,
      covered: new Set(resume ? resume.covered : [...cache.scopeMembers(org, scopeKeyOf(scope)), ...ids].filter((id) => !pre.has(id))),
    };
    if (resume) (sess.crawl as Crawl & { token?: string }).token = resume.token;
    devlog.write('main', 'feed-start', { items: ids.length, fresh: fresh.length, resumed: !!resume });
  }
  const cr = sess.crawl as Crawl & { token?: string };
  progress(0, all.length);
  const crawlNow = async (): Promise<Outcome> => {
    const bound = ctx.scale?.bufferRows ?? FEED_BUFFER_ROWS;
    let restarted = false;
    let pages = 0;
    try {
      for (;;) {
        if (sess.used >= maxPages) { devlog.write('main', 'feed-pages', { pages, complete: false }); return 'capped'; }
        abort();
        while (throttleGate.until > Date.now()) await sleep(Math.min(throttleGate.until - Date.now(), 1000), signal);
        sess.used++; // reserved before the request, so batches running side by side cannot overshoot the run's budget
        let j;
        try {
          j = await client.revisionFeed(scope.project.name, { fields: FEED_FIELDS, pageSize, ...(cr.token ? { continuationToken: cr.token } : { startDateTime: new Date(cr.since).toISOString() }) });
        } catch (e) {
          // A 400 on a saved token is a stale token: forget it and start the crawl again, once. Any other 400 is "no feed".
          if (e instanceof AdoError && e.status === 400 && cr.token && !restarted) {
            restarted = true; cr.token = undefined; cr.startedThisRun = true; cr.maxChanged = 0; cr.buffer.clear(); cr.rows = 0; cr.overflow = false;
            cr.pre = preHeld([...cache.scopeMembers(org, scopeKeyOf(scope)), ...ids], fedBefore);
            cr.covered = new Set([...cache.scopeMembers(org, scopeKeyOf(scope)), ...ids].filter((id) => !cr.pre.has(id)));
            cache.setSetting(feedKey(scope), null); devlog.write('main', 'feed-stale-token', {}); continue;
          }
          throw e;
        }
        pages++;
        const values = Array.isArray(j.values) ? j.values : [];
        for (const v of values) { const t = Date.parse(String(((v as { fields?: Record<string, unknown> }).fields ?? {})['System.ChangedDate'] ?? '')); if (Number.isFinite(t)) cr.maxChanged = Math.max(cr.maxChanged, t); }
        const revs = values.map((r) => parseRevision(r, projectIdOf)).filter((r): r is RevisionFact => r !== null);
        // Stored as they come, for the items covered from the start (so a cut-off crawl keeps its rows) ...
        cache.putFeedRevisions(org, revs.filter((r) => !cr.pre.has(r.itemId) && (cr.covered.has(r.itemId) || wanted.has(r.itemId))), at);
        // ... and kept for the run's later batches, up to the bound.
        for (const r of revs) {
          if (cr.rows >= bound) { cr.overflow = true; break; }
          const l = cr.buffer.get(r.itemId); if (l) l.push(r); else cr.buffer.set(r.itemId, [r]);
          cr.rows++;
        }
        const next = typeof j.continuationToken === 'string' ? j.continuationToken : '';
        progress(Math.min(cr.buffer.size, all.length), all.length);
        if (j.isLastBatch === true || !values.length || !next) { cr.complete = true; break; }
        cr.token = next;
        cache.setSetting(feedKey(scope), { day: windowFrom, since: cr.since, token: next, maxChanged: cr.maxChanged, covered: [...cr.covered], pre: [...cr.pre] } satisfies Saved);
      }
    } catch (e) {
      if (!(e instanceof AdoError)) throw e;
      if (e.status === 401) throw e; // a dead token (base scope), as for every history call
      if (e.status === 400 || failureTier(e.status) === 'gone') {
        devlog.write('main', 'feed-unavailable', { status: e.status });
        cache.setSetting(feedKey(scope), null);
        sess.noFeed = true; // no feed: every later batch of the run is read per item too
        sess.crawl = null;
        return 'nofeed';
      }
      if (failureTier(e.status) === 'transient') { devlog.write('main', 'feed-transient', { status: e.status }); return 'capped'; }
      throw e;
    }
    devlog.write('main', 'feed-pages', { pages, complete: true });
    cache.setSetting(feedKey(scope), null);
    return 'complete';
  };
  if (!cr.complete) {
    const out = await (sess.flight ??= crawlNow().finally(() => { sess.flight = undefined; }));
    if (out === 'capped') return capped();
    if (out === 'nofeed') return { fallback: [...fallback, ...ids], capped: false, served: [], seeded: [] };
  }

  // ---- Serve this batch from the crawl ----
  // What the crawl covers: a known item whose watermark is no older than where it started; an unread item if the crawl began at
  // the window; and, when the crawl was resumed (its early rows are in the cache, not in memory), only the items it covered.
  const servable = (id: number): boolean => {
    const cp = cps.get(id);
    if (cp ? cp.at - FEED_OVERLAP_MS < cr.since : cr.since > windowFrom) return false;
    if (!cr.startedThisRun) return cr.covered.has(id);
    return !cr.overflow || cr.covered.has(id);
  };
  for (const id of ids) if (!servable(id)) { fallback.push(id); wanted.delete(id); }
  // Stored history with no checkpoint (migration 007) cannot be continued from the window: read whole, per item (B5 audit). For an
  // item the crawl covered from its start this was settled when it began; for a later one, what is stored now predates this batch.
  const heldBefore = cache.revisions(org, [...wanted]);
  const cpNow = cache.checkpointRows(org, [...wanted]);
  for (const id of [...wanted]) {
    const old = cr.covered.has(id) || cr.pre.has(id) ? cr.pre.has(id)
      : !cpNow.has(id) && !!heldBefore.get(id)?.length && !heldBefore.get(id)!.some((x) => x.seed);
    if (old) { fallback.push(id); wanted.delete(id); }
  }
  for (const id of wanted) { const rows = cr.buffer.get(id); if (rows) cache.putFeedRevisions(org, rows, at); }
  const stored = cache.revisions(org, [...wanted]);
  const isSeed = (id: number) => !!stored.get(id)?.some((r) => r.seed);
  // Seeded and changed since (real rows beyond the seed): its history is read whole, per item, which replaces the seed.
  // Unread and born before the window (its first row isn't rev 1): the same.
  for (const id of [...wanted]) {
    const revs = stored.get(id) ?? [];
    if (cps.has(id) && isSeed(id) && revs.some((r) => !r.seed)) { fallback.push(id); wanted.delete(id); }
    else if (!cps.has(id) && revs[0] && revs[0].rev > 1) { fallback.push(id); wanted.delete(id); }
  }
  const mark = cr.maxChanged;
  // Seed what the window shows nothing of: current fields as rev 1 at the creation time, flagged, with a checkpoint at the mark.
  const bare = ids.filter((id) => wanted.has(id) && !cps.has(id) && !(stored.get(id)?.length));
  const seeded: number[] = [];
  let seedCapped = false;
  for (let i = 0; i < bare.length; i += 200) {
    abort();
    const slice = bare.slice(i, i + 200);
    let got: unknown[];
    try { got = await client.workItemFields(slice, [...FEED_FIELDS]); } catch (e) {
      if (!(e instanceof AdoError)) throw e;
      const tier = failureTier(e.status);
      if (tier === 'transient') { // those items wait for the next run, and the scope says so
        devlog.write('main', 'feed-seed-transient', { status: e.status });
        for (const id of slice) wanted.delete(id);
        seedCapped = true;
        continue;
      }
      if (tier === 'gone') { for (const id of slice) { fallback.push(id); wanted.delete(id); } continue; } // per item, which decides gone or not
      throw e;
    }
    const seen = new Set<number>();
    for (const w of got) {
      const rev = parseRevision(w, projectIdOf);
      if (!rev) continue;
      seen.add(rev.itemId);
      if (rev.projectId !== projectId) { fallback.push(rev.itemId); wanted.delete(rev.itemId); continue; }
      const created = Date.parse(String(((w as { fields?: Record<string, unknown> } | null)?.fields ?? {})['System.CreatedDate'] ?? ''));
      const seed: RevisionFact = { ...rev, rev: 1, changedAt: Number.isFinite(created) && created <= rev.changedAt ? created : rev.changedAt, seed: true };
      cache.putHistory(org, rev.itemId, [seed], [], at, mark || cr.since);
      seeded.push(rev.itemId);
    }
    for (const id of bare.slice(i, i + 200)) if (!seen.has(id)) { wanted.delete(id); onGone?.(id); }
  }

  // Updates (relations) are not in the feed: read per item, only where something is new; then the checkpoint moves, never back.
  const seededSet = new Set(seeded);
  const served: number[] = [...seeded];
  let done = seeded.length;
  await pool([...wanted].filter((id) => !seededSet.has(id)), 4, async (id) => {
    abort();
    const revs = cache.revisions(org, [id]).get(id) ?? [];
    const cp = cps.get(id);
    const owed = !cp || (revs.at(-1)?.rev ?? 0) > cp.lastRev;
    const cpAt = cp ? (mark ? Math.max(cp.at, mark) : cp.at) : (mark || cr.since);
    let ups: UpdateFact[] = [];
    try {
      if (owed) ups = (await client.updates(id, cache.checkpoint(org, id).updates)).map((u) => parseUpdate(u, id)).filter((u): u is UpdateFact => u !== null);
      cache.putHistory(org, id, revs, ups, at, cpAt);
      served.push(id);
    } catch (e) {
      if (!isGone(e)) throw e;
      // A failure that may pass is "missing" (the caller keeps it for a retry); the rest is gone (B7, B5 audit).
      if (e instanceof AdoError && failureTier(e.status) === 'transient') (failed ?? onGone)?.(id);
      else onGone?.(id);
    }
    progress(++done, wanted.size);
  });
  return { fallback, capped: seedCapped, served, seeded };
}

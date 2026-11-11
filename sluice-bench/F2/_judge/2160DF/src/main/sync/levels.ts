// Loading by level (decided 2026-10-07): current state first, explored level by level, history only
// when asked. A team loads its Features as they are now; entering a Feature loads its subtree and
// PRs as they are now; asking to play a scene loads that scene's history for a range of days. Each
// is a few batch calls, where a full sync is hundreds. 04 §§3, 5; the full sync (sync.ts) stays for
// tests and the AC-27 equivalence.
import type { CurrentItemFact, IdentityRefFact, PullRequestFact, RelationFact, RevisionFact, UpdateFact } from '@shared/contracts/facts';
import { keys, type Guid, type OrgKey, type UtcMs } from '@shared/contracts/keys';
import type { ScopeHistory } from '@shared/contracts/history';
import { callSignFor, shipSeedFor } from '@shared/captains';
import { applyCurrent } from '@shared/ingest/current';
import { derive } from '@shared/ingest/derive';
import { readReview, runJobsFor, runStatsInBackground, statsJobsFor, surfaceReview, type ReviewRead, type RunJob, type StatsJob } from './prStats';
import { approversAt, parseIdentity, parsePullRequest, parseRelation, parseRepo, parseRevision, parseUpdate } from '@shared/ingest/parse';
import { SHIP_DESIGN_VERSION } from '@shared/limits';
import { failureTier } from '@shared/contracts/neterror';
import { missingAfter, retrySet } from '@shared/historyPartial';
import { AdoError, type AdoClient } from '../ado/client';
import { fetchPictures } from '../avatars/strategies';
import type { Cache } from '../db/cache';
import { devlog } from '../devlog';
import { feedHistory, feedThreshold } from './feed';
import { boundedFeatures, FEED_CAPPED_NOTE, factsFor, ids, isGone, pool, scopeKeyOf, type SyncContext, type SyncScope } from './sync';
import { mergeMissing, Unreadable } from './missing';
import { countRefresh, itemsToRescan } from './refresh';
import { descendantQueries, epicFeatures, LINK_QUERY_TOP } from './wiql';

const DAY = 86_400_000;
/** The first look at a team: Features changed in the last 30 days, at least the 10 newest. */
export const RECENT_DAYS = 30;
export const RECENT_MIN = 10;
/** Load more: the next 15 Features (the sector's cap, MAX_FEATURES_PER_SECTOR). */
export const MORE_PAGE = 15;
export const HISTORY_RANGES = [1, 7, 14, 30] as const;

export type Scene = { kind: 'team' } | { kind: 'feature'; featureId: number };
export type Level =
  | { kind: 'team' }
  | { kind: 'feature'; featureId: number }
  | { kind: 'more' }
  | { kind: 'history'; scene: Scene; days: number; /** B7: only the scene's missing items (Retry). */ retry?: boolean }
  | { kind: 'catchUp' };

/** What's loaded for a scope, kept in settings (`levels:{org}:{scopeKey}`). */
export interface LevelState {
  /** Features loaded at the team level, newest first; and those found but not yet shown (Load more). */
  shown: number[];
  queue: number[];
  /** The oldest ChangedDate seen, to page further back when the queue runs out; null when there's no more. */
  cursor: string | null;
  explored: number[];
  /** Scenes whose history was loaded (to catch up next time), with their range. */
  history: { scene: string; days: number; at: UtcMs; /** B7: items whose history read failed last time (5xx, timeout): Retry's request set. */ missing?: number[]; /** B7: the feed hit its page cap on that pass. */ capped?: true }[];
  /** A sprint's stream (decided 2026-10-08): when its first look and its last full fill finished. */
  sprint?: { lookAt: UtcMs; filledAt: UtcMs | null };
}
const sceneId = (s: Scene) => (s.kind === 'team' ? 'team' : `feature:${s.featureId}`);
export const stateKey = (scope: SyncScope) => `levels:${scope.org}:${scopeKeyOf(scope)}`;
export const emptyLevels = (): LevelState => ({ shown: [], queue: [], cursor: null, explored: [], history: [] });
export function levelState(cache: Cache, scope: SyncScope): LevelState | null {
  return cache.setting<LevelState>(stateKey(scope));
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const time = (v: unknown) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };

/** Hydrate items (fields and relations) and store them as current state. */
export async function hydrate(ctx: SyncContext, scope: SyncScope, list: number[]): Promise<Map<number, { item: CurrentItemFact; rels: RelationFact[] }>> {
  const { client, cache } = ctx;
  const at = ctx.clock();
  const out = new Map<number, { item: CurrentItemFact; rels: RelationFact[] }>();
  const fresh = [...new Set(list)];
  if (!fresh.length) return out;
  const projectIdOf = (name: string) => (name === scope.project.name ? scope.project.projectId : cache.projects(scope.org).find((p) => p.name === name)?.projectId);
  const items: CurrentItemFact[] = [];
  for (const w of await client.workItems(fresh)) {
    const o = w as Json | null;
    if (!o || typeof o.id !== 'number') continue;
    const f = (o.fields ?? {}) as Json;
    const projectId = projectIdOf(str(f['System.TeamProject'])) ?? scope.project.projectId;
    const item: CurrentItemFact = {
      itemId: o.id, projectId, type: str(f['System.WorkItemType']), title: str(f['System.Title']), state: str(f['System.State']), areaPath: str(f['System.AreaPath']),
      ...(str(f['System.IterationPath']) ? { iterationPath: str(f['System.IterationPath']) } : {}),
      assignedTo: parseIdentity(f['System.AssignedTo']), createdAt: time(f['System.CreatedDate']), changedAt: time(f['System.ChangedDate']),
    };
    const rels = (Array.isArray(o.relations) ? o.relations : []).map(parseRelation).filter((r): r is RelationFact => r !== null);
    const html = ((o._links as Json | undefined)?.html as Json | undefined)?.href;
    cache.putCurrent(scope.org, o.id, rels, typeof html === 'string' ? html : '', at);
    items.push(item);
    out.set(o.id, { item, rels });
  }
  cache.putCurrentItems(scope.org, items, at);
  return out;
}

/** Revisions and updates for items, from their checkpoints: history. */
export async function history(ctx: SyncContext, scope: SyncScope, list: number[], progress: (done: number, total: number) => void, onGone?: (id: number) => void, opts: { rescan?: boolean; range?: { startUtc?: UtcMs; endUtc: UtcMs }; capped?: () => void; /** B7: an item whose read failed for a reason that may pass (a 5xx, a timeout): it is missing, not gone. */ failed?: (id: number) => void } = {}): Promise<void> {
  const { client, cache } = ctx;
  const at = ctx.clock();
  const projectIdOf = (name: string) => (name === scope.project.name ? scope.project.projectId : cache.projects(scope.org).find((p) => p.name === name)?.projectId);
  let done = 0;
  let todo = [...new Set(list)];
  // 04 §5c: a big batch (not a rescan, which re-reads whole histories) comes from the revisions feed; the rest, per item.
  if (!opts.rescan && opts.range && todo.length >= feedThreshold(ctx)) {
    const res = await feedHistory(ctx, scope, todo, progress, onGone, opts.range, opts.failed);
    if (res.capped) opts.capped?.();
    const rest = new Set(res.fallback);
    todo = todo.filter((id) => rest.has(id));
    done = list.length - todo.length;
  }
  await pool(todo, 4, async (id) => {
    if (ctx.signal?.aborted) throw ctx.signal.reason ?? new Error('Cancelled');
    // A rescan reads from the start, so a correction behind our checkpoint is seen (04 §5 step 7).
    const cp = opts.rescan ? { revisions: 0, updates: 0 } : cache.checkpoint(scope.org, id);
    try {
      const revs = (await client.revisions(id, cp.revisions)).map((r) => parseRevision(r, projectIdOf)).filter((r): r is RevisionFact => r !== null);
      const ups = (await client.updates(id, cp.updates)).map((u) => parseUpdate(u, id)).filter((u): u is UpdateFact => u !== null);
      cache.putHistory(scope.org, id, revs, ups, at);
    } catch (e) {
      if (!isGone(e)) throw e;
      // A rescan's 404 means the item is gone from ADO for good: repair the cache (slice 7). Otherwise
      // (a 403, or a failure that may pass) it keeps its last known facts, marked stale (02 §3).
      if (opts.rescan && e instanceof AdoError && e.status === 404) cache.forgetWorkItem(scope.org, id);
      else onGone?.(id);
      if (e instanceof AdoError && failureTier(e.status) === 'transient') opts.failed?.(id);
    }
    progress(++done, list.length);
  });
}

/**
 * PR records for the artifact links among items' current relations. `withApprovers`: a completed PR's approvers
 * (§6a). It never reads the stat line (§6a-1): callers queue that as deferred work, handing on the `reviews` read here (a
 * completed PR's reviewers and threads) so they are not read twice.
 */
export async function prsFor(ctx: SyncContext, scope: SyncScope, rels: RelationFact[][], withApprovers: boolean, only?: (prKey: string) => boolean, track?: Unreadable): Promise<{ identities: IdentityRefFact[]; threadsDenied: boolean; reviews: Map<string, ReviewRead> }> {
  const { client, cache } = ctx;
  const at = ctx.clock();
  const refs = new Map<string, { repoId: Guid; prId: number }>();
  for (const list of rels) {
    for (const r of list) {
      if (r.rel !== 'pr' || r.target.kind !== 'pr') continue;
      const k = `${r.target.repoId}:${r.target.prId}`;
      if (only && !only(k)) continue;
      refs.set(k, { repoId: r.target.repoId, prId: r.target.prId });
    }
  }
  const identities: IdentityRefFact[] = [];
  let threadsDenied = false;
  const reviews = new Map<string, ReviewRead>();
  await pool([...refs.values()], 4, async ({ repoId, prId }) => {
    let pr: PullRequestFact | null = null;
    try { pr = parsePullRequest(await client.pullRequest(repoId, prId)); } catch (e) { if (!isGone(e)) throw e; track?.pr(repoId, prId, e); return; }
    if (!pr) return;
    track?.found(keys.pr(scope.org, repoId, prId));
    cache.putPr(scope.org, pr, at);
    if (pr.author) identities.push(pr.author);
    if (pr.closedBy) identities.push(pr.closedBy);
    const review = withApprovers && pr.status === 'completed' ? await readReview(client, repoId, prId) : undefined;
    if (review) {
      for (const r of review.reviewers) { const i = parseIdentity(r); if (i) identities.push(i); }
      if (review.threadsDenied) threadsDenied = true;
    }
    if (review) {
      reviews.set(`${repoId}:${prId}`, review);
      surfaceReview(review);
      cache.setApprovers(scope.org, repoId, prId, approversAt(review.reviewers, review.threads, pr.closedAt).approvers);
    }
  });
  return { identities, threadsDenied, reviews };
}

/**
 * Identities seen, their pictures (once), and captain profiles (written once, 03 §9). Pictures only
 * for these people, not everyone the org's cache has met (decided 2026-10-08); `avatars: false` leaves
 * them for later (the stream's idle work).
 */
export async function people(ctx: SyncContext, org: OrgKey, list: IdentityRefFact[], opts: { avatars?: boolean } = {}): Promise<void> {
  const { client, cache } = ctx;
  const at = ctx.clock();
  const uniq = new Map(list.map((i) => [i.id, i]));
  cache.tx(() => { for (const i of uniq.values()) cache.putIdentity(org, i, at); });
  if (opts.avatars !== false) await fetchPictures({ client, cache, org, who: cache.identitiesNeedingAvatar(org).filter((x) => uniq.has(x.id)), now: at });
  cache.tx(() => {
    for (const i of uniq.values()) {
      cache.ensureProfile(org, i.id, () => { const shipSeed = shipSeedFor(org, i.id); return { shipSeed, designVersion: SHIP_DESIGN_VERSION, callSign: callSignFor(i.displayName, shipSeed) }; });
    }
  });
}

/** Loading by level is the Backlog's: a sprint loads whole (decided 2026-10-07). */
function backlogTarget(scope: SyncScope): Exclude<SyncScope['target'], { kind: 'sprint' }> {
  if (scope.target.kind === 'sprint') throw new Error('A sprint loads whole, not by level');
  return scope.target;
}

/** The Features of a team, newest first: one bounded page (the 20,000 cap never trips). */
async function teamFeatures(client: AdoClient, scope: SyncScope, before?: string): Promise<number[]> {
  if (scope.target.kind === 'area') return (await boundedFeatures(client, scope.project.projectId, scope.target.path, before ? { before } : {})).ids;
  if (scope.target.kind === 'sprint') throw new Error('A sprint loads whole, not by level'); // decided 2026-10-07
  const rels = await client.wiql(scope.project.projectId, epicFeatures(scope.target.id), LINK_QUERY_TOP);
  return (Array.isArray(rels.workItemRelations) ? (rels.workItemRelations as Json[]) : []).filter((r) => r.rel).map((r) => Number((r.target as Json).id));
}

/** Every item beneath a Feature now (a tree query). */
async function subtree(client: AdoClient, scope: SyncScope, featureId: number): Promise<number[]> {
  const out: number[] = [];
  for (const q of descendantQueries([featureId])) out.push(...ids(await client.wiql(scope.project.projectId, q, LINK_QUERY_TOP), 'workItemRelations'));
  return [...new Set(out)].filter((id) => id !== featureId);
}

/** Load one level for a scope (04 §5, by level). Progress, cancellation, and errors as for a full sync. */
export async function loadLevel(ctx: SyncContext, scope: SyncScope, range: { startUtc: UtcMs; endUtc: UtcMs }, level: Level): Promise<void> {
  const { client, cache } = ctx;
  const org = scope.org;
  const sk = scopeKeyOf(scope);
  const state = levelState(cache, scope) ?? emptyLevels();
  const save = () => cache.setSetting(stateKey(scope), state);
  // What this pass couldn't read (slice 7): merged into the scope's coverage at the end.
  const unreadable = new Unreadable(cache, org);
  const later = new Map<string, StatsJob>();
  const laterRuns = new Map<string, RunJob>();
  /** The PRs among these relations whose stat lines still need reading: read after the level returns. */
  const deferStats = (rels: RelationFact[][], reviews?: Map<string, ReviewRead>) => {
    const refs = new Set(rels.flat().filter((r) => r.rel === 'pr' && r.target.kind === 'pr').map((r) => { const t = r.target as { repoId: Guid; prId: number }; return `${t.repoId}:${t.prId}`; }));
    for (const [k, v] of statsJobsFor(cache, org, refs, ctx.clock())) { const review = reviews?.get(k); later.set(k, review ? { ...v, review } : v); }
    for (const [k, v] of runJobsFor(cache, org, refs, ctx.clock())) laterRuns.set(k, v); // B2: the stations' run lines
  };
  const report = (phase: 'discover' | 'history' | 'prs' | 'derive' | 'done' | 'failed', done = 0, total = 0, lastError?: string) => {
    devlog.write('main', 'level', { phase, kind: level.kind, done, total });
    ctx.progress?.({ phase, done, total, partial: false, ...(lastError ? { lastError } : {}) });
  };
  try {
    if (level.kind === 'team' || level.kind === 'more') {
      report('discover');
      if (level.kind === 'team') {
        const repos = (await client.repos(scope.project.projectId)).flatMap((r) => parseRepo(r, scope.project.projectId) ?? []);
        cache.putRepos(org, repos, ctx.clock());
        const found = await teamFeatures(client, scope);
        const h = await hydrate(ctx, scope, found);
        const newest = [...h.values()].sort((a, b) => b.item.changedAt - a.item.changedAt).map((x) => x.item.itemId);
        const since = ctx.clock() - RECENT_DAYS * DAY;
        let first = newest.filter((id) => h.get(id)!.item.changedAt >= since);
        if (first.length < RECENT_MIN) first = newest.slice(0, RECENT_MIN);
        state.shown = [...new Set([...state.shown, ...first])];
        state.queue = newest.filter((id) => !state.shown.includes(id));
        const oldest = [...h.values()].reduce((m, x) => Math.min(m, x.item.changedAt), Infinity);
        state.cursor = found.length >= 200 && Number.isFinite(oldest) ? new Date(oldest).toISOString() : null;
        // Their current parents (Epics), for the breadcrumb and the Epic sector.
        const parents = [...new Set(first.flatMap((id) => h.get(id)!.rels.filter((r) => r.rel === 'parent' && r.target.kind === 'wi').map((r) => (r.target as { id: number }).id)))];
        await hydrate(ctx, scope, parents);
        cache.addScopeMembers(org, sk, [...first, ...parents]);
        await people(ctx, org, [...h.values()].flatMap((x) => (x.item.assignedTo ? [x.item.assignedTo] : [])));
      } else {
        if (!state.queue.length && state.cursor) {
          const older = await teamFeatures(client, scope, state.cursor);
          const h = await hydrate(ctx, scope, older);
          const newest = [...h.values()].sort((a, b) => b.item.changedAt - a.item.changedAt).map((x) => x.item.itemId);
          state.queue = newest.filter((id) => !state.shown.includes(id));
          const oldest = [...h.values()].reduce((m, x) => Math.min(m, x.item.changedAt), Infinity);
          state.cursor = older.length >= 200 && Number.isFinite(oldest) ? new Date(oldest).toISOString() : null;
        }
        const next = state.queue.splice(0, MORE_PAGE);
        state.shown.push(...next);
        cache.addScopeMembers(org, sk, next);
      }
    } else if (level.kind === 'feature') {
      report('discover');
      const below = await subtree(client, scope, level.featureId);
      const h = await hydrate(ctx, scope, [level.featureId, ...below]);
      cache.addScopeMembers(org, sk, [level.featureId, ...below]);
      report('prs');
      const featureRels = [...h.values()].map((x) => x.rels);
      const { identities } = await prsFor(ctx, scope, featureRels, false, undefined, unreadable);
      deferStats(featureRels);
      await people(ctx, org, [...identities, ...[...h.values()].flatMap((x) => (x.item.assignedTo ? [x.item.assignedTo] : []))]);
      if (!state.explored.includes(level.featureId)) state.explored.push(level.featureId);
    } else {
      // Catching up is Backlog's incremental refresh, so it carries the shared extras (04 §5 step 7):
      // every seventh one re-reads recently-changed items from the start, catching a late correction
      // that sits behind our checkpoint.
      const refresh = level.kind === 'catchUp' ? countRefresh(cache, org, sk) : null;
      const scenes: { scene: Scene; days: number }[] = level.kind === 'history' ? [{ scene: level.scene, days: level.days }]
        : state.history.map((x) => ({ scene: x.scene === 'team' ? { kind: 'team' as const } : { kind: 'feature' as const, featureId: Number(x.scene.split(':')[1]) }, days: x.days }));
      // B7: Retry asks again for only what the last pass of this scene couldn't read.
      const retryOnly = level.kind === 'history' && level.retry === true;
      for (const { scene, days } of scenes) {
        const members = cache.scopeMembers(org, sk);
        const saved = state.history.find((x) => x.scene === sceneId(scene));
        const failed = new Set<number>(); // reads that failed for a reason that may pass (a 5xx, a timeout)
        let sceneCapped = false;
        const current = cache.currentItems(org, members);
        const relsOf = cache.current(org, members);
        let items: number[];
        if (retryOnly) {
          items = retrySet(saved?.missing, new Set(members));
        } else if (scene.kind === 'team') {
          items = state.shown.filter((id) => current.has(id));
          // Features that were in the team during the range, by daily ASOF samples (04 §3).
          if (scope.target.kind === 'area') {
            const extra = new Set<number>();
            for (let d = 0; d < days; d++) {
              const asOf = new Date(Math.floor((range.endUtc - d * DAY) / DAY) * DAY - DAY / 2).toISOString();
              for (const id of (await boundedFeatures(client, scope.project.projectId, scope.target.path, { asOf })).ids) if (!current.has(id)) extra.add(id);
            }
            if (extra.size) { await hydrate(ctx, scope, [...extra]); cache.addScopeMembers(org, sk, [...extra]); items.push(...extra); }
          }
        } else {
          // The Feature and everything beneath it now, then its former children (from its updates).
          const under = new Set<number>([scene.featureId]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const [id, rels] of relsOf) {
              // Either side of the link counts: a child naming its parent, or a parent naming its child
              // (an undated removal leaves only the parent's side, 02 §6).
              if (!under.has(id) && rels.some((r) => r.rel === 'parent' && r.target.kind === 'wi' && under.has(r.target.id))) { under.add(id); grew = true; }
              if (under.has(id)) for (const r of rels) if (r.rel === 'child' && r.target.kind === 'wi' && !under.has(r.target.id) && relsOf.has(r.target.id)) { under.add(r.target.id); grew = true; }
            }
          }
          items = [...under];
        }
        // And every ancestor (Epics), for the breadcrumb and the Epic sector's own events.
        for (let i = 0; !retryOnly && i < items.length; i++) {
          const p = (relsOf.get(items[i]!) ?? []).find((r) => r.rel === 'parent' && r.target.kind === 'wi')?.target as { id: number } | undefined;
          if (p && current.has(p.id) && !items.includes(p.id)) items.push(p.id);
        }
        report('history', 0, items.length);
        await history(ctx, scope, items, (d, t) => report('history', d, t), undefined, { range, capped: () => { sceneCapped = true; }, failed: (id) => failed.add(id) });
        if (refresh?.rescan) {
          const again = itemsToRescan(cache, org, items, ctx.clock());
          if (again.length) {
            devlog.write('main', 'level-rescan', { items: again.length, refresh: refresh.n });
            await history(ctx, scope, again, () => {}, undefined, { rescan: true });
          }
        }
        if (scene.kind === 'feature' && !retryOnly) {
          const former = items.flatMap((id) => (cache.updates(org, [id]).get(id) ?? []).flatMap((u) => u.removed)).filter((r) => r.rel === 'child' && r.target.kind === 'wi').map((r) => (r.target as { id: number }).id);
          const fresh = [...new Set(former)].filter((id) => !items.includes(id));
          if (fresh.length) { await hydrate(ctx, scope, fresh); cache.addScopeMembers(org, sk, fresh); await history(ctx, scope, fresh, () => {}, undefined, { failed: (id) => failed.add(id) }); items.push(...fresh); }
        }
        if (scene.kind === 'feature' && !retryOnly) {
          report('prs');
          const itemRels = items.map((id) => cache.current(org, [id]).get(id) ?? []);
          const { identities, threadsDenied, reviews } = await prsFor(ctx, scope, itemRels, true, undefined, unreadable);
          deferStats(itemRels, reviews);
          await people(ctx, org, identities);
          // The unlinked search (04 §3) for this Feature's station repos in this project, over the range.
          const linked = new Set(itemRels.flat().filter((r) => r.rel === 'pr' && r.target.kind === 'pr').map((r) => { const t = r.target as { repoId: Guid; prId: number }; return `${t.repoId}:${t.prId}`; }));
          const own = new Set(cache.repos(org).filter((r) => r.projectId === scope.project.projectId).map((r) => r.repoId));
          const stations = [...new Set([...linked].map((k) => k.split(':')[0]!))].filter((r) => own.has(r));
          const from = new Date(range.endUtc - days * DAY).toISOString();
          const found: { repoId: Guid; prId: number; hasWorkItems: boolean }[] = [];
          const unlinkedIds: IdentityRefFact[] = [];
          for (const repoId of stations) {
            const seen = new Map<number, unknown>();
            try {
              for (const type of ['created', 'closed']) {
                for (const p of await client.pullRequests(scope.project.projectId, { repositoryId: repoId, status: 'all', minTime: from, maxTime: new Date(range.endUtc).toISOString(), queryTimeRangeType: type })) {
                  const n = Number((p as Json).pullRequestId);
                  if (Number.isFinite(n)) seen.set(n, p);
                }
              }
            } catch (e) { if (!isGone(e)) throw e; unreadable.repo(repoId, e); continue; }
            for (const [prId, raw] of seen) {
              if (linked.has(`${repoId}:${prId}`)) continue;
              let wis: unknown[];
              try { wis = await client.prWorkItems(repoId, prId); } catch (e) { if (!isGone(e)) throw e; continue; }
              const pr = parsePullRequest(raw);
              if (pr) { cache.putPr(org, pr, ctx.clock()); if (pr.author) unlinkedIds.push(pr.author); }
              found.push({ repoId, prId, hasWorkItems: wis.length > 0 });
            }
          }
          cache.addScopePrs(org, sk, found);
          await people(ctx, org, unlinkedIds);
          if (threadsDenied) devlog.write('main', 'sync-skip', { family: 'review', reason: 'threads-denied' });
        }
        const revIdentities = [...cache.revisions(org, items).values()].flat().flatMap((r) => [r.assignedTo, r.changedBy].filter((x): x is IdentityRefFact => !!x));
        await people(ctx, org, revIdentities);
        const id = sceneId(scene);
        const missing = missingAfter(failed);
        const capped = sceneCapped || (retryOnly && saved?.capped === true);
        state.history = [...state.history.filter((x) => x.scene !== id), { scene: id, days: Math.max(days, saved?.days ?? 0), at: ctx.clock(), ...(missing.length ? { missing } : {}), ...(capped ? { capped: true as const } : {}) }];
      }
    }
    save();
    // The feed's cap note is derived from the scenes' own `capped` flags (B5 audit), so coverage and the player agree.
    const feedCapped = state.history.some((x) => x.capped);
    const prev = cache.scopeCheckpoint(org, sk)?.coverage;
    const merged = mergeMissing(prev ? { ...prev, notes: prev.notes.filter((n) => n !== FEED_CAPPED_NOTE) } : prev, unreadable);
    cache.setScopeCheckpoint(org, sk, { lastSuccessAt: ctx.clock(), lastError: null, coverage: feedCapped ? { ...merged, partial: true, notes: [...merged.notes, FEED_CAPPED_NOTE].sort() } : merged });
    report('done', 1, 1);
    // The stat lines (B1) come after the level has returned: two at a time, behind the throttle gate, until aborted.
    runStatsInBackground(ctx, org, later, laterRuns);
  } catch (e) {
    save();
    const status = e instanceof AdoError ? `${e.family} ${e.status}` : ctx.signal?.aborted ? 'cancelled' : 'error';
    ctx.progress?.({ phase: 'failed', done: 0, total: 0, partial: false, lastError: status, ...(e instanceof AdoError ? { error: e.detail } : {}), ...(!(e instanceof AdoError) && e instanceof Error ? { errorMessage: e.message } : {}) });
    throw e;
  }
}

/**
 * 03 §9 (v1.3 F1): after a derivation change cleared the derived tables, a scope's rows come back from
 * its cached facts when it opens, as its last writer left them: a full sync over the open range; a
 * streamed sprint over the sprint so far (as `sprintStream` does when it finishes, filled or not). A
 * sprint whose stream is running now (`streaming`) stays pending: that stream rebuilds them when it
 * finishes. A level-loaded team or Epic never wrote derived rows, so there is nothing to rebuild.
 * Returns whether rows were written.
 */
export function rebuildPendingDerived(ctx: Pick<SyncContext, 'cache' | 'mapping' | 'clock' | 'pictures'>, scope: SyncScope, range: { startUtc: UtcMs; endUtc: UtcMs }, streaming = false): boolean {
  const { cache } = ctx;
  const org = scope.org;
  const sk = scopeKeyOf(scope);
  if (!cache.derivedPending(org, sk)) return false;
  const state = levelState(cache, scope);
  const t = scope.target;
  let r: { startUtc: UtcMs; endUtc: UtcMs } | null = range;
  if (state && t.kind === 'sprint') {
    if (streaming) return false;
    r = { startUtc: t.startUtc, endUtc: Math.min(t.finishUtc, ctx.clock()) };
  } else if (state) r = null;
  if (!r) { cache.derivedRebuilt(org, sk); return false; }
  const { history: h, links } = derive(factsFor(ctx, scope, r));
  cache.rebuildDerived(org, sk, [...h.entities.workItems, ...h.entities.prs].map((e) => e.key), h.events, h.observations, links, (pk) => pk.split(':').pop()!);
  return true;
}

/** The bundle for what's loaded: history where it is, current state for the rest. */
export function loadLevelHistory(ctx: Pick<SyncContext, 'cache' | 'mapping' | 'clock' | 'pictures'>, scope: SyncScope, range: { startUtc: UtcMs; endUtc: UtcMs }): ScopeHistory {
  const { cache } = ctx;
  const org = scope.org;
  const state = levelState(cache, scope) ?? emptyLevels();
  const members = cache.scopeMembers(org, scopeKeyOf(scope));
  const withHistory = cache.itemsWithHistory(org, members);
  const memberSet = new Set(members); // B7: a missing item that has left the scope is not the scope's gap
  const full = factsFor(ctx, scope, range);
  const only = <T>(m: ReadonlyMap<number, T>) => new Map([...m].filter(([id]) => withHistory.has(id)));
  const derived = derive({ ...full, revisions: only(full.revisions), updates: only(full.updates), currentRelations: only(full.currentRelations) }).history;
  const relations = cache.current(org, members);
  const t = scope.target;
  // A sprint streams (decided 2026-10-08): its bundle is the first look's current state, with history
  // where it has arrived. Nothing to load more of, and nothing played: its history comes by itself.
  if (t.kind === 'sprint') {
    return applyCurrent(derived, { items: cache.currentItems(org, members), relations, prs: full.prs, explored: [], at: ctx.clock(), more: { team: false, features: [] } },
      { org, projectId: scope.project.projectId, target: { kind: 'sprint', path: t.path, pods: t.pods }, identities: full.identities, profiles: full.profiles, workItemUrl: full.workItemUrl });
  }
  // Load more applies at the team level (older Features); a Feature's subtree loads whole when entered.
  return applyCurrent(derived, {
    items: cache.currentItems(org, members), relations, prs: full.prs, explored: state.explored, at: ctx.clock(),
    more: { team: state.queue.length > 0 || state.cursor !== null, features: [] },
    played: state.history.map((x) => ({ scene: x.scene === 'team' ? 'team' as const : Number(x.scene.split(':')[1]), days: x.days, at: x.at, ...(x.missing?.filter((id) => memberSet.has(id)).length ? { missing: x.missing.filter((id) => memberSet.has(id)) } : {}), ...(x.capped ? { capped: true as const } : {}) })),
  }, { org, projectId: scope.project.projectId, target: backlogTarget(scope), identities: full.identities, profiles: full.profiles, workItemUrl: full.workItemUrl });
}

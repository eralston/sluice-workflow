// 04 §5 — the sync sequence for one scope, and `history.load` from the cache. Facts are written per
// item in one transaction with its checkpoint; derived tables are rebuilt wholesale at the end. The
// bundle itself is the pure derivation (src/shared/ingest/derive.ts) over the cached facts.
import type { AreaNodeFact, BoardColumnFact, IterationNodeFact, IdentityRefFact, ProjectFact, PullRequestFact, RelationFact, RepoFact, RevisionFact, UpdateFact } from '@shared/contracts/facts';
import type { ScopeHistory, SectorRef, StateMapping } from '@shared/contracts/history';
import { keys, type CanonicalKey, type Guid, type OrgKey, type UtcMs } from '@shared/contracts/keys';
import { callSignFor, shipSeedFor } from '@shared/captains';
import { derive, type IngestFacts } from '@shared/ingest/derive';
import { readPrStats, readRepoRun, readReview, runDue, surfaceReview } from './prStats';
import { approversAt, parseIdentity, parsePullRequest, parseRelation, parseRepo, parseRevision, parseUpdate } from '@shared/ingest/parse';
import { BACKFILL_MAX_WEEKS, SHIP_DESIGN_VERSION } from '@shared/limits';
import { failureTier, type NetError } from '@shared/contracts/neterror';
import { AdoError, type AdoClient } from '../ado/client';
import { devlog } from '../devlog';
import type { HandPictures } from '../avatars/pictures';
import { fetchPictures } from '../avatars/strategies';
import { teamsKey } from './boards';
import { feedHistory, feedThreshold } from './feed';
import { Unreadable } from './missing';
import type { Cache } from '../db/cache';
import { descendantQueries, epicFeatures, FEATURE_PAGE, featuresUnder, LINK_QUERY_TOP, NARROW_DAYS, sprintItems } from './wiql';
import { fnv1a32 } from '@shared/hash';
import { boardTeamOf, type TeamFacts } from '@shared/teams';

const DAY = 86_400_000;
export const AREA_SAMPLING_NOTE = 'Area membership is sampled daily at 12:00 UTC: a Feature that joined and left the area between two samples is missed.';
export const SPRINT_SAMPLING_NOTE = 'Sprint membership is sampled daily at 12:00 UTC: an item that joined and left the sprint between two samples is missed.';
/** The member cap tripped (decided 2026-10-08): a sprint is its own work, never the whole project. */
export const SCOPE_CAPPED_NOTE = 'This scope holds more work items than the chart loads at once; the newest are shown.';
/** At most this many items per sprint sample. */
const SPRINT_TOP = 1000;
export const FEED_CAPPED_NOTE = 'This scope’s history is still being read from the project’s revision feed; more arrives on the next refresh.';
export const FINAL_VOTES_NOTE = 'Review threads were unreadable, so approvals come from final reviewer votes.';

export interface SyncScope {
  org: OrgKey;
  project: ProjectFact;
  sector: SectorRef;
  target: { kind: 'area'; path: string; nodeId: number } | { kind: 'epic'; id: number }
    /** A sprint (decided 2026-10-07): an iteration with dates, seen through the pods' area paths. */
    | { kind: 'sprint'; path: string; nodeId: number; startUtc: UtcMs; finishUtc: UtcMs; pods: string[] };
}

export interface SyncProgress {
  phase: 'discover' | 'history' | 'prs' | 'derive' | 'done' | 'failed'; done: number; total: number; partial: boolean; lastError?: string;
  /** Why it failed, in full (decided 2026-10-07): the network error, or the message of anything else. */
  error?: NetError; errorMessage?: string;
}

export interface SyncContext {
  client: AdoClient;
  cache: Cache;
  mapping: StateMapping;
  clock: () => UtcMs;
  progress?: (p: SyncProgress) => void;
  signal?: AbortSignal;
  /** Pictures the user added by hand: they win over ADO's (slice 6). */
  pictures?: HandPictures;
  /** B5 test knobs for the revisions feed (src/main/sync/feed.ts): the threshold, the page cap and size, the window. */
  scale?: import('./feed').ScaleOptions;
  /** B-audit: the service's one background controller, with a client bound to it. Deferred stat and run reads (04 §6a-1) run on it, so a purge, a new token or another scope stops them. */
  background?: { client: AdoClient; signal: AbortSignal };
}

/**
 * Features under a path, never tripping ADO's 20,000-result cap (decided 2026-10-07): newest first,
 * at most `top`; if ADO still answers VS402337, narrow by ChangedDate and retry. `full` says the page
 * was full (there may be more); `narrowed` is the window used, if any; `capped` means it couldn't
 * narrow enough.
 */
export async function boundedFeatures(client: AdoClient, projectId: string, path: string, opts: { asOf?: string; top?: number; before?: string } = {}):
  Promise<{ ids: number[]; full: boolean; narrowed: number | null; capped: boolean }> {
  const top = opts.top ?? FEATURE_PAGE;
  for (const sinceDays of [undefined, ...NARROW_DAYS]) {
    try {
      const j = await client.wiql(projectId, featuresUnder(path, opts.asOf, { sinceDays, ...(opts.before ? { before: opts.before } : {}) }), top);
      const found = ids(j, 'workItems');
      return { ids: found, full: found.length >= top, narrowed: sinceDays ?? null, capped: false };
    } catch (e) {
      if (!(e instanceof AdoError && e.status === 400 && e.code === 'VS402337')) throw e;
      devlog.write('main', 'wiql-narrow', { status: 400, code: 'VS402337', days: sinceDays ?? null });
    }
  }
  return { ids: [], full: false, narrowed: null, capped: true };
}

/**
 * One thing that can't be read now (02 §3, slice 7): a 403 or 404, or a failure that may pass and
 * whose retries ran out (no response, 429, 5xx). The scope goes partial and the thing is kept stale or
 * listed missing, and the next sync asks again. A 401 is never this: it stops the sync. Logged.
 */
export const isGone = (e: unknown) => {
  const tier = e instanceof AdoError ? failureTier(e.status) : null;
  const gone = e instanceof AdoError && (tier === 'gone' || tier === 'transient');
  if (gone) devlog.write('main', 'sync-skip', { family: e.family, status: e.status, code: e.code ?? null });
  return gone;
};

export const scopeKeyOf = (s: SyncScope) => {
  const t = s.target;
  if (t.kind === 'sprint') return `${s.project.projectId}|sprint|${t.nodeId}|${fnv1a32([...t.pods].sort().join('|')).toString(16)}`; // the pods change its members
  return `${s.project.projectId}|${t.kind}|${t.kind === 'area' ? t.nodeId : t.id}`;
};

type Json = Record<string, unknown>;
export const ids = (j: Json, field: 'workItems' | 'workItemRelations'): number[] => {
  const list = Array.isArray(j[field]) ? (j[field] as Json[]) : [];
  return list.map((x) => Number(field === 'workItems' ? x.id : (x.target as Json | undefined)?.id)).filter(Number.isFinite);
};

/** Area nodes from the classification tree: `\Project\Area\X` reads as the work items' `Project\X`. */
/**
 * The iteration tree (decided 2026-10-07): `\\Project\\Iteration\\Sprint 41` becomes the work items'
 * `Project\\Sprint 41`, with its dates (null for an undated node).
 */
export function flattenIterations(projectId: Guid, root: unknown): IterationNodeFact[] {
  const out: IterationNodeFact[] = [];
  const when = (v: unknown) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
  const walk = (n: unknown) => {
    const o = n as Json | undefined;
    if (!o || typeof o.id !== 'number' || typeof o.path !== 'string') return;
    const parts = o.path.replace(/^\\/, '').split('\\');
    const attrs = (o.attributes ?? {}) as Json;
    out.push({ projectId, nodeId: o.id, path: [parts[0], ...parts.slice(2)].join('\\'), startUtc: when(attrs.startDate), finishUtc: when(attrs.finishDate) });
    for (const c of Array.isArray(o.children) ? o.children : []) walk(c);
  };
  walk(root);
  return out;
}

export function flattenAreas(projectId: Guid, root: unknown): AreaNodeFact[] {
  const out: AreaNodeFact[] = [];
  const walk = (n: unknown) => {
    const o = n as Json | undefined;
    if (!o || typeof o.id !== 'number' || typeof o.path !== 'string') return;
    const parts = o.path.replace(/^\\/, '').split('\\');
    const path = [parts[0], ...parts.slice(2)].join('\\');
    out.push({ projectId, nodeId: o.id, path, hasChildren: o.hasChildren === true });
    for (const c of Array.isArray(o.children) ? o.children : []) walk(c);
  };
  walk(root);
  return out;
}

/** A small pool: at most `n` tasks at once (the transport also caps requests in flight). */
export async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

export async function syncScope(ctx: SyncContext, scope: SyncScope, range: { startUtc: UtcMs; endUtc: UtcMs }): Promise<void> {
  const { client, cache, signal } = ctx;
  const org = scope.org;
  const at = ctx.clock();
  const notes = new Set<string>();
  // Entities ADO refused this time, whose last known facts we keep and mark (02 §3, decided 2026-10-09).
  const stale = new Set<CanonicalKey>();
  let partial = false;
  const unreadable = new Unreadable(ctx.cache, scope.org);
  const report = (p: Omit<SyncProgress, 'partial'>) => {
    devlog.write('main', 'sync', { phase: p.phase, done: p.done, total: p.total, partial, status: p.lastError ?? null });
    ctx.progress?.({ ...p, partial });
  };
  const project = scope.project;
  const projectIdOf = (name: string) => cache.projects(org).find((p) => p.name === name)?.projectId;
  const checkAbort = () => { if (signal?.aborted) throw signal.reason ?? new Error('Cancelled'); };

  try {
    // ---- 1. Reference data (04 §3) ----
    report({ phase: 'discover', done: 0, total: 0 });
    const repos: RepoFact[] = (await client.repos(project.projectId)).flatMap((r) => parseRepo(r, project.projectId) ?? []);
    cache.putRepos(org, repos, at);

    // ---- 2. Discover the scope's Features ----
    const features = new Set<number>();
    const historyFrom = range.endUtc - BACKFILL_MAX_WEEKS * 7 * DAY;
    if (scope.target.kind === 'area') {
      const samples: (string | undefined)[] = [undefined];
      const last = Math.min(range.endUtc, at);
      for (let d = Math.floor(historyFrom / DAY) * DAY + DAY / 2; d <= last; d += DAY) if (d >= historyFrom) samples.push(new Date(d).toISOString());
      for (const asOf of samples) {
        checkAbort();
        const page = await boundedFeatures(client, project.projectId, scope.target.path, { asOf });
        if (page.capped) { partial = true; notes.add('This Area Path is too large for ADO to list its Features; choose a smaller one.'); }
        else if (page.full || page.narrowed !== null) notes.add(`Showing the ${FEATURE_PAGE} most recently changed Features in this Area Path.`);
        for (const id of page.ids) features.add(id);
      }
      notes.add(AREA_SAMPLING_NOTE);
    } else if (scope.target.kind === 'sprint') {
      // A sprint's Stories and Bugs in its pods: now, and sampled each day of the sprint so far, so
      // items that joined it and left are found too (decided 2026-10-07).
      const t = scope.target;
      const samples: (string | undefined)[] = [undefined, new Date(t.startUtc).toISOString()];
      for (let d = Math.floor(t.startUtc / DAY) * DAY + DAY / 2; d < Math.min(t.finishUtc, at); d += DAY) if (d >= t.startUtc) samples.push(new Date(d).toISOString());
      for (const asOf of samples) {
        checkAbort();
        for (const id of ids(await client.wiql(project.projectId, sprintItems(t.path, t.pods, asOf), SPRINT_TOP), 'workItems')) features.add(id);
      }
      notes.add(SPRINT_SAMPLING_NOTE);
    } else {
      const epic = scope.target.id;
      const rels = await client.wiql(project.projectId, epicFeatures(epic), LINK_QUERY_TOP);
      const list = Array.isArray(rels.workItemRelations) ? (rels.workItemRelations as Json[]) : [];
      for (const r of list) if (r.rel) features.add(Number((r.target as Json).id));
    }

    // ---- 3. Items: hydrate and history, from checkpoints ----
    const known = new Set<number>();
    const current = new Map<number, RelationFact[]>();
    const updatesOf = new Map<number, UpdateFact[]>();
    let done = 0;
    let total = 0;
    const fetchItems = async (list: number[]) => {
      const fresh = [...new Set(list)].filter((id) => !known.has(id));
      if (!fresh.length) return;
      for (const id of fresh) known.add(id);
      total += fresh.length;
      report({ phase: 'history', done, total });
      const hydrated = await client.workItems(fresh);
      const seen = new Set<number>();
      for (const w of hydrated) {
        const o = w as Json | null;
        if (!o || typeof o.id !== 'number') continue;
        seen.add(o.id);
        const rels = (Array.isArray(o.relations) ? o.relations : []).map(parseRelation).filter((r): r is RelationFact => r !== null);
        current.set(o.id, rels);
        const html = ((o._links as Json | undefined)?.html as Json | undefined)?.href;
        cache.putCurrent(org, o.id, rels, typeof html === 'string' ? html : '', at);
      }
      const missing = fresh.filter((id) => !seen.has(id));
      if (missing.length) {
        // Deleted or forbidden now: keep the last known facts (02 §3), and say coverage is partial.
        partial = true;
        notes.add('Some work items could not be read now; their last known history is kept.');
        for (const id of missing) stale.add(keys.workItem(org, id));
        for (const [id, rels] of cache.current(org, missing)) current.set(id, rels);
      }
      let perItem = fresh.filter((id) => seen.has(id));
      if (perItem.length >= feedThreshold(ctx)) {
        // 04 §5c: a big batch comes from the project-wide revisions feed; what it cannot serve is read per item below.
        const res = await feedHistory(ctx, scope, perItem, (d) => report({ phase: 'history', done: done + d, total }), (id) => stale.add(keys.workItem(org, id)), range);
        if (res.capped) { partial = true; notes.add(FEED_CAPPED_NOTE); }
        const rest = new Set(res.fallback);
        for (const id of perItem) if (!rest.has(id)) { updatesOf.set(id, cache.updates(org, [id]).get(id) ?? []); done++; }
        perItem = perItem.filter((id) => rest.has(id));
      }
      await pool(perItem, 4, async (id) => {
        checkAbort();
        const cp = cache.checkpoint(org, id);
        try {
          const revs = (await client.revisions(id, cp.revisions)).map((r) => parseRevision(r, (name) => (name === project.name ? project.projectId : projectIdOf(name)))).filter((r): r is RevisionFact => r !== null);
          const ups = (await client.updates(id, cp.updates)).map((u) => parseUpdate(u, id)).filter((u): u is UpdateFact => u !== null);
          cache.putHistory(org, id, revs, ups, at);
        } catch (e) {
          if (e instanceof AdoError && (e.status === 403 || e.status === 404)) {
            partial = true;
            notes.add('Some work items could not be read now; their last known history is kept.');
            stale.add(keys.workItem(org, id));
          } else throw e;
        }
        updatesOf.set(id, cache.updates(org, [id]).get(id) ?? []);
        report({ phase: 'history', done: ++done, total });
      });
    };

    // Descendants (a tree query), then former children from the parents' updates, until nothing new.
    let frontier = [...features];
    await fetchItems(frontier);
    while (frontier.length) {
      checkAbort();
      const next: number[] = [];
      for (const q of descendantQueries(frontier)) next.push(...ids(await client.wiql(project.projectId, q, LINK_QUERY_TOP), 'workItemRelations'));
      for (const id of frontier) {
        for (const u of updatesOf.get(id) ?? []) for (const r of u.removed) if (r.rel === 'child' && r.target.kind === 'wi') next.push(r.target.id);
      }
      const fresh = [...new Set(next)].filter((id) => !known.has(id));
      await fetchItems(fresh);
      frontier = fresh;
    }
    // An Epic sector: its former Features come from the Epic's own updates (04 §3).
    if (scope.target.kind === 'epic') {
      await fetchItems([scope.target.id]);
      const former = (updatesOf.get(scope.target.id) ?? []).flatMap((u) => u.removed).filter((r) => r.rel === 'child' && r.target.kind === 'wi').map((r) => (r.target as { id: number }).id);
      let f2 = former.filter((id) => !known.has(id));
      await fetchItems(f2);
      while (f2.length) {
        const next: number[] = [];
        for (const q of descendantQueries(f2)) next.push(...ids(await client.wiql(project.projectId, q, LINK_QUERY_TOP), 'workItemRelations'));
        for (const id of f2) for (const u of updatesOf.get(id) ?? []) for (const r of u.removed) if (r.rel === 'child' && r.target.kind === 'wi') next.push(r.target.id);
        f2 = [...new Set(next)].filter((id) => !known.has(id));
        await fetchItems(f2);
      }
    }
    // Ancestors: every parent an item has had, up the chain.
    let up = [...known];
    while (up.length) {
      const parents = new Set<number>();
      for (const id of up) {
        for (const r of current.get(id) ?? []) if (r.rel === 'parent' && r.target.kind === 'wi') parents.add(r.target.id);
        for (const u of updatesOf.get(id) ?? []) for (const r of [...u.added, ...u.removed]) if (r.rel === 'parent' && r.target.kind === 'wi') parents.add(r.target.id);
      }
      up = [...parents].filter((id) => !known.has(id));
      await fetchItems(up);
    }
    cache.putScopeMembers(org, scopeKeyOf(scope), [...known]);

    // ---- 4. PRs: from work-item links, then the unlinked reconcile ----
    report({ phase: 'prs', done: 0, total: 0 });
    const prRefs = new Map<string, { repoId: Guid; prId: number }>();
    for (const id of known) {
      for (const r of [...(current.get(id) ?? []), ...(updatesOf.get(id) ?? []).flatMap((u) => [...u.added, ...u.removed])]) {
        if (r.rel === 'pr' && r.target.kind === 'pr') prRefs.set(`${r.target.repoId}:${r.target.prId}`, { repoId: r.target.repoId, prId: r.target.prId });
      }
    }
    const identities = new Map<Guid, IdentityRefFact>();
    const meet = (i: IdentityRefFact | null | undefined) => { if (i) identities.set(i.id, i); };
    let threadsDenied = false;
    const fetchPr = async (repoId: Guid, prId: number, raw?: unknown): Promise<PullRequestFact | null> => {
      let pr: PullRequestFact | null = null;
      try {
        pr = parsePullRequest(raw ?? (await client.pullRequest(repoId, prId)));
      } catch (e) {
        // Gone or out of reach (an abandoned PR, a deleted or forbidden repo): kept from its last known
        // record if we have one, marked stale, and listed either way (slice 7). Asked for again next sync.
        if (isGone(e)) { unreadable.pr(repoId, prId, e); return null; }
        throw e;
      }
      if (!pr) return null;
      cache.putPr(org, pr, at);
      meet(pr.author);
      meet(pr.closedBy);
      // The stat line's facts for every PR (B1; reads only what could have changed), and a completed PR's approvers (§6a).
      const review = pr.status === 'completed' ? await readReview(client, repoId, prId) : undefined;
      if (review) {
        for (const r of review.reviewers) meet(parseIdentity(r));
        if (review.threadsDenied) threadsDenied = true;
      }
      const read = await readPrStats(client, pr, cache.prStatsOf(org, repoId, prId), at, review);
      if (!read.transient) cache.setPrStats(org, repoId, prId, read.stats, read.commit);
      if (review) {
        surfaceReview(review); // an approvers failure still fails the sync, as before B1
        cache.setApprovers(org, repoId, prId, approversAt(review.reviewers, review.threads, pr.closedAt).approvers);
      }
      return pr;
    };
    let prDone = 0;
    const refs = [...prRefs.values()];
    await pool(refs, 4, async (r) => {
      checkAbort();
      await fetchPr(r.repoId, r.prId);
      report({ phase: 'prs', done: ++prDone, total: refs.length });
    });
    // Repos with a station in scope (02 §3): PRs created or closed in the range, not already linked.
    // Only repos in this project: a work item can link a PR in another project's repo, and listing
    // that repo under this project is a 404 (TF401019).
    const ownRepos = new Set(repos.map((r) => r.repoId));
    // A sprint has no unlinked reconcile: its work is what was planned into it (decided 2026-10-07).
    const stationRepos = new Set(scope.target.kind === 'sprint' ? [] : refs.map((r) => r.repoId).filter((id) => ownRepos.has(id)));
    const reconciled: { repoId: Guid; prId: number; hasWorkItems: boolean }[] = [];
    for (const repoId of stationRepos) {
      const found = new Map<number, unknown>();
      try {
        for (const type of ['created', 'closed']) {
          const list = await client.pullRequests(project.projectId, {
            repositoryId: repoId, status: 'all', minTime: new Date(range.startUtc).toISOString(), maxTime: new Date(range.endUtc).toISOString(), queryTimeRangeType: type,
          });
          for (const p of list) { const id = Number((p as Json).pullRequestId); if (Number.isFinite(id)) found.set(id, p); }
        }
      } catch (e) {
        if (!isGone(e)) throw e;
        unreadable.repo(repoId, e); // gone or unreadable: no unlinked PRs from it, and the panel says so
        continue;
      }
      for (const [prId, raw] of found) {
        if (prRefs.has(`${repoId}:${prId}`)) continue;
        checkAbort();
        let linked: unknown[];
        try { linked = await client.prWorkItems(repoId, prId); } catch (e) { if (!isGone(e)) throw e; continue; }
        await fetchPr(repoId, prId, raw);
        reconciled.push({ repoId, prId, hasWorkItems: linked.length > 0 });
      }
    }
    cache.putScopePrs(org, scopeKeyOf(scope), reconciled);
    if (threadsDenied) notes.add(FINAL_VOTES_NOTE);

    // The stations' run lines (B2, 04 §3 builds): each repo with a PR here, when its last read is due. Never fails the
    // sync but for a dead token (a 401 rethrows); a refused or failed call leaves only that line out, with no note.
    const stationIds = new Set([...stationRepos, ...refs.map((r) => r.repoId)]);
    const dueRuns = cache.repos(org).filter((r) => ownRepos.has(r.repoId) && stationIds.has(r.repoId) && runDue(r, at));
    await pool(dueRuns, 4, async (repo) => {
      checkAbort();
      const read = await readRepoRun(client, repo);
      if (!read.transient) cache.setRepoRun(org, repo.repoId, read.keep ? repo.run : read.run, at);
    });

    // ---- 5. Identities, pictures, and captain profiles (04 §7) ----
    for (const [, revs] of cache.revisions(org, [...known])) for (const r of revs) { meet(r.assignedTo); meet(r.changedBy); }
    cache.tx(() => { for (const i of identities.values()) cache.putIdentity(org, i, at); });
    await fetchPictures({ client, cache, org, who: cache.identitiesNeedingAvatar(org), now: at, checkAbort });
    cache.tx(() => {
      for (const i of identities.values()) {
        cache.ensureProfile(org, i.id, () => {
          const shipSeed = shipSeedFor(org, i.id);
          return { shipSeed, designVersion: SHIP_DESIGN_VERSION, callSign: callSignFor(i.displayName, shipSeed) };
        });
      }
    });

    // ---- 6. Derive, and rebuild the scope's derived tables wholesale ----
    report({ phase: 'derive', done: 0, total: 1 });
    if (unreadable.size) {
      partial = true;
      notes.add(unreadable.note()!);
      for (const k of unreadable.staleKeys()) stale.add(k);
    }
    cache.setScopeCheckpoint(org, scopeKeyOf(scope), { lastSuccessAt: at, lastError: null, coverage: { partial, notes: [...notes].sort(), ...(stale.size ? { stale: [...stale].sort() } : {}), ...(unreadable.size ? { missing: unreadable.list() } : {}) } });
    const { history, links } = derive(factsFor(ctx, scope, range));
    const entities = [...history.entities.workItems, ...history.entities.prs].map((e) => e.key);
    cache.rebuildDerived(org, scopeKeyOf(scope), entities, history.events, history.observations, links, (pk) => pk.split(':').pop()!);
    report({ phase: 'done', done: 1, total: 1 });
  } catch (e) {
    const status = e instanceof AdoError ? `${e.family} ${e.status}` : signal?.aborted ? 'cancelled' : 'error';
    cache.setScopeCheckpoint(org, scopeKeyOf(scope), { lastSuccessAt: null, lastError: status, coverage: null });
    report({
      phase: 'failed', done: 0, total: 0, lastError: status,
      ...(e instanceof AdoError ? { error: e.detail } : {}), ...(!(e instanceof AdoError) && e instanceof Error ? { errorMessage: e.message } : {}),
    });
    throw e;
  }
}

/**
 * The team board's columns for a scope (B4): from the team list the service keeps in settings (`teams:`),
 * for the team that owns the scope's Area Path (an area), or its first pod with a clear team (a sprint).
 * An Epic names no area. Nothing cached, no team, or no board: placement by state.
 */
function boardFor(cache: Cache, scope: SyncScope): { boardColumns?: BoardColumnFact[]; boardOwns?: (areaPath: string) => boolean } {
  const t = scope.target;
  const areas = t.kind === 'area' ? [t.path] : t.kind === 'sprint' ? t.pods : [];
  if (!areas.length) return {};
  const teams = cache.setting<{ teams: TeamFacts[] | null }>(teamsKey(scope.org, scope.project.projectId))?.teams;
  const board = boardTeamOf(teams, areas);
  return board ? { boardColumns: board.columns, boardOwns: board.owns } : {};
}

/** The cached facts for a scope, as the derivation reads them. */
export function factsFor(ctx: Pick<SyncContext, 'cache' | 'mapping' | 'clock' | 'pictures'>, scope: SyncScope, range: { startUtc: UtcMs; endUtc: UtcMs }): IngestFacts {
  const { cache } = ctx;
  const org = scope.org;
  const members = cache.scopeMembers(org, scopeKeyOf(scope));
  const cp = cache.scopeCheckpoint(org, scopeKeyOf(scope));
  const prs = cache.prs(org);
  const urls = cache.workItemUrls(org);
  return {
    orgKey: org,
    project: scope.project,
    sector: scope.sector,
    sectorTarget: scope.target.kind === 'area' ? { kind: 'area', path: scope.target.path }
      : scope.target.kind === 'sprint' ? { kind: 'sprint', path: scope.target.path, startUtc: scope.target.startUtc, finishUtc: scope.target.finishUtc, pods: scope.target.pods }
        : { kind: 'epic', id: scope.target.id },
    range,
    now: ctx.clock(),
    revisions: cache.revisions(org, members),
    updates: cache.updates(org, members),
    currentRelations: cache.current(org, members),
    prs: prs.map((p) => p.pr),
    approvers: new Map(prs.filter((p) => p.approvers).map((p) => [`${p.pr.repoId}:${p.pr.prId}`, p.approvers!])),
    repos: cache.repos(org),
    identities: ctx.pictures ? ctx.pictures.overlay(org, cache.identities(org)) : cache.identities(org),
    reconciled: cache.scopePrs(org, scopeKeyOf(scope)),
    mapping: ctx.mapping,
    ...boardFor(cache, scope),
    coverage: { syncedAt: cp?.lastSuccessAt ?? null, partial: cp?.coverage?.partial ?? false, notes: cp?.coverage?.notes ?? [], ...(cp?.coverage?.stale?.length ? { stale: cp.coverage.stale } : {}), ...(cp?.coverage?.missing?.length ? { missing: cp.coverage.missing } : {}) },
    workItemUrl: (id) => urls.get(id) ?? '',
    profiles: cache.profiles(org),
  };
}

export function loadHistory(ctx: Pick<SyncContext, 'cache' | 'mapping' | 'clock' | 'pictures'>, scope: SyncScope, range: { startUtc: UtcMs; endUtc: UtcMs }): ScopeHistory {
  return derive(factsFor(ctx, scope, range)).history;
}

// A sprint, streamed (decided 2026-10-08; 04 §5b). The first look is three calls: the sprint's Stories
// and Bugs now, their fields, and their Features' fields. That's enough for the pods' progress and the
// planets, so the scene opens on it. The rest streams in behind it through the scheduler, the focused
// pod first: each pod's Tasks and PRs, then history newest-changed first, then the idle extras (the
// sprint's leavers by daily samples, former children and ancestors, review votes, pictures). When the
// stream is done, the cache holds what a full sync would (AC-27).
import type { IdentityRefFact, PullRequestFact, RelationFact } from '@shared/contracts/facts';
import { keys, type CanonicalKey, type Guid } from '@shared/contracts/keys';
import { isQuiet } from '@shared/contracts/neterror';
import { MAX_SCOPE_MEMBERS } from '@shared/limits';
import { derive } from '@shared/ingest/derive';
import { approversAt, parseIdentity, parseRepo } from '@shared/ingest/parse';
import { readReview, runDue, runStatsJobs, surfaceReview, type RunJob, type StatsJob } from './prStats';
import { AdoError } from '../ado/client';
import { devlog } from '../devlog';
import { feedHistory, feedThreshold, resetFeedBudget } from './feed';
import { fillCount, type FillCount } from '@shared/streamCount';
import { emptyLevels, history, hydrate, levelState, people, prsFor, stateKey } from './levels';
import { mergeMissing, prRef, Unreadable } from './missing';
import { countRefresh, itemsToRescan, prsWorthRefetching } from './refresh';
import { Scheduler, type TaskClass, type TaskSpec } from './scheduler';
import { factsFor, FEED_CAPPED_NOTE, FINAL_VOTES_NOTE, ids, SCOPE_CAPPED_NOTE, scopeKeyOf, SPRINT_SAMPLING_NOTE, type SyncContext, type SyncScope } from './sync';
import { descendantQueries, LINK_QUERY_TOP, podItemsEver, QUERY_MAX, sprintItems, sprintItemsEver } from './wiql';
import { underPath } from '@shared/paths';

const DAY = 86_400_000;
const SPRINT_TOP = 1000;
const under = underPath;

/** Paths for an ORed `EVER`, kept well under WIQL's 32k limit: past it, just the root (the samples cover the rest). */
const fitQuery = (paths: string[], root: string): string[] => (paths.join('').length + paths.length * 40 < QUERY_MAX / 3 ? paths : [root]);
type SprintTarget = Extract<SyncScope['target'], { kind: 'sprint' }>;

/** Where the user is looking, in the sprint: a pod (by its path) and maybe an item in it. */
export interface StreamFocus { pod?: string; item?: number }

export interface SprintStreamOpts {
  /** Items whose cached facts changed (they arrived, changed, or left). Batched by the caller. */
  changed: (itemIds: number[]) => void;
  /** The first look's steps, for the loading plate. */
  progress?: (step: number, steps: number) => void;
  /** Everything the scene on screen needs is in (called again after a focus brings more). */
  done?: () => void;
  /**
   * ADO stopped accepting the token part-way through (04 §6, decided 2026-10-09): the stream has stopped,
   * and the user needs to hear it. Called at most once.
   */
  refused?: () => void;
  concurrency?: number;
}

export class SprintStream {
  readonly sched: Scheduler;
  private readonly target: SprintTarget;
  private readonly sk: string;
  private readonly finished = new Set<string>();
  private focusOn: StreamFocus = {};
  /**
   * History waits for its scene (decided 2026-10-08: playback is the scene's own): an item's history is
   * queued only while it's in the scene on screen, or under it. Current state still streams for all.
   */
  private readonly deferred = new Map<number, { group: string; cls: TaskClass }>();
  private draining: Promise<void> | null = null;
  /**
   * The sprint's own Stories and Bugs: the look's, the `EVER` query's, and the samples'. The closure
   * walks out from these and nowhere else (decided 2026-10-08) — seeding it from every member instead
   * let each pass drag in the ancestors' own subtrees, and one sprint reached 8,020 items.
   */
  private readonly roots = new Set<number>();
  private rootsSinceClosure = true;
  /** Discovery is over (B6): the closure ran and found no new roots, so what is queued is all there will be. */
  private discovered = false;
  /** M's high-water mark for this run (B6): the count never steps down. */
  private mHigh = 0;
  private threadsDenied = false;
  /** Stat lines (B1) waiting to be read once the stream is done, by `repoId:prId`, with the commit they were read at. */
  private readonly statsTodo = new Map<string, StatsJob>();
  /** Repos whose run line (B2) is due, read with the stat lines. */
  private readonly runsTodo = new Map<string, RunJob>();
  private statsRun: Promise<void> | null = null;
  private closed = false;
  /** Entities ADO refused this time: their last known facts stay, marked stale (02 §3). */
  private readonly stale = new Set<CanonicalKey>();
  /** PRs and repos this stream couldn't read (slice 7), merged into coverage at the end. */
  private readonly unreadable: Unreadable;
  /** The member cap tripped, or the closure failed: the scope is short of what a full sync holds. */
  private capped = false;
  private incomplete = false;
  /** This org's ADO refused the `EVER` operator: the daily samples are the only backstop. */
  private everUnsupported = false;
  /** ADO answered 401 to something that matters: the token has expired or been revoked. Everything stops. */
  private refusedToken = false;
  /** The revisions feed (B5) stopped at its page cap: the scope is partial until a later run resumes it. */
  private feedCapped = false;

  constructor(private readonly ctx: SyncContext, private readonly scope: SyncScope, private readonly opts: SprintStreamOpts) {
    if (scope.target.kind !== 'sprint') throw new Error('Not a sprint');
    this.target = scope.target;
    this.sk = scopeKeyOf(scope);
    this.unreadable = new Unreadable(ctx.cache, scope.org);
    this.sched = new Scheduler({
      concurrency: opts.concurrency ?? 4,
      onError: (key, e) => {
        if (this.closed) return;
        devlog.write('main', 'stream-error', { task: key.split(':')[0] ?? '', status: e instanceof AdoError ? e.status : null });
        this.checkRefused(e);
      },
    });
  }

  /** The sprint's window ends at its finish (or now): the feed reads the weeks before it. */
  private range() { return { startUtc: this.target.startUtc, endUtc: Math.min(this.target.finishUtc, this.ctx.clock()) }; }
  private get org() { return this.scope.org; }
  private podOf(areaPath: string): string | undefined { return this.target.pods.find((p) => under(areaPath, p)); }

  /**
   * A 401 on anything but a picture means the token is no longer good (a picture 401 is expected and
   * quiet, `isQuiet`). Every later call would fail the same way, so stop now rather than send hundreds
   * of doomed requests, drop what's queued, and tell the user to enter a new one (04 §6). What was
   * already read stays in the cache; the scope just isn't marked complete.
   */
  private checkRefused(e: unknown): void {
    if (this.refusedToken || !(e instanceof AdoError) || e.status !== 401 || isQuiet(e.family, 401)) return;
    this.refusedToken = true;
    this.incomplete = true;
    this.sched.cancel(() => true);
    devlog.write('main', 'stream-refused', { family: e.family });
    const { cache } = this.ctx;
    const cp = cache.scopeCheckpoint(this.org, this.sk);
    const notes = new Set(cp?.coverage?.notes ?? []);
    notes.add('ADO stopped accepting the token part-way through, so the rest wasn’t read. Enter a new token and refresh.');
    cache.setScopeCheckpoint(this.org, this.sk, { lastSuccessAt: cp?.lastSuccessAt ?? null, lastError: `${e.family} 401`, coverage: { partial: true, notes: [...notes].sort(), ...(cp?.coverage?.stale?.length ? { stale: cp.coverage.stale } : {}), ...(cp?.coverage?.missing?.length ? { missing: cp.coverage.missing } : {}) } });
    this.opts.refused?.();
  }

  /** Add members up to the cap (MAX_SCOPE_MEMBERS): past it the stream stops widening and says so. */
  private addMembers(list: number[]): void {
    const { cache } = this.ctx;
    const fresh = [...new Set(list)];
    if (!fresh.length) return;
    const room = MAX_SCOPE_MEMBERS - cache.scopeMembers(this.org, this.sk).length;
    if (room <= 0) { this.capped = true; return; }
    if (fresh.length > room) { this.capped = true; devlog.write('main', 'stream-capped', { cap: MAX_SCOPE_MEMBERS }); }
    cache.addScopeMembers(this.org, this.sk, fresh.slice(0, room));
  }

  /** Note the sprint's own bodies: the closure's only seed, and what a pod's planets are drawn from. */
  private addRoots(list: number[]): void {
    let fresh = false;
    for (const id of list) if (!this.roots.has(id)) { this.roots.add(id); fresh = true; }
    if (fresh) { this.rootsSinceClosure = true; this.discovered = false; }
  }

  /**
   * The first look (the `look` class): three calls, then the bundle can load. Items that were members
   * and have vanished (deleted, or no longer readable) leave the scope.
   */
  async look(progress = this.opts.progress): Promise<void> {
    const { client, cache } = this.ctx;
    const t = this.target;
    progress?.(0, 3);
    const now = ids(await client.wiql(this.scope.project.projectId, sprintItems(t.path, t.pods), SPRINT_TOP), 'workItems');
    progress?.(1, 3);
    // Bodies we already knew in this sprint, so one that moved out is seen to (its current fields change).
    const before = cache.scopeMembers(this.org, this.sk);
    const knownBodies = [...cache.currentItems(this.org, before).values()].filter((it) => (it.type === 'User Story' || it.type === 'Bug') && under(it.iterationPath ?? '', t.path)).map((it) => it.itemId);
    const asked = [...new Set([...now, ...knownBodies])];
    const got = await hydrate(this.ctx, this.scope, asked);
    const vanished = asked.filter((id) => !got.has(id));
    progress?.(2, 3);
    const parents = [...new Set([...got.values()].flatMap((x) => x.rels.filter((r) => r.rel === 'parent' && r.target.kind === 'wi').map((r) => (r.target as { id: number }).id)))].filter((id) => !got.has(id));
    await hydrate(this.ctx, this.scope, parents);
    progress?.(3, 3);
    this.addMembers([...now, ...parents]);
    this.addRoots(now.filter((id) => got.has(id)));
    // Who the work is assigned to, so the first look names them instead of "Unknown". No pictures yet.
    await people(this.ctx, this.org, [...got.values()].flatMap((x) => (x.item.assignedTo ? [x.item.assignedTo] : [])), { avatars: false });
    if (vanished.length) {
      for (const id of vanished) this.stale.add(keys.workItem(this.org, id));
      const gone = new Set(vanished);
      cache.putScopeMembers(this.org, this.sk, cache.scopeMembers(this.org, this.sk).filter((id) => !gone.has(id)));
      devlog.write('main', 'stream-vanished', { count: vanished.length });
    }
    const state = levelState(cache, this.scope) ?? emptyLevels();
    state.sprint = { lookAt: this.ctx.clock(), filledAt: state.sprint?.filledAt ?? null };
    cache.setSetting(stateKey(this.scope), state);
    const cp = cache.scopeCheckpoint(this.org, this.sk);
    // No notes yet: the first look knows of nothing missing. The sampling note is only earned if the
    // `EVER` query turns out to be unsupported (04 §5b), and `finish` adds it then.
    cache.setScopeCheckpoint(this.org, this.sk, { lastSuccessAt: this.ctx.clock(), lastError: null, coverage: cp?.coverage ?? { partial: false, notes: [] } });
    if (vanished.length) this.opts.changed(vanished);
  }

  /** Queue the rest: per pod, the focused one first, then the idle extras. Resolves when the scene's share is in. */
  fill(): Promise<void> {
    resetFeedBudget(this.ctx); // a new run: a new page budget for the revisions feed
    this.feedCapped = false;
    this.mHigh = 0;
    void this.add({ key: 'repos', group: '', cls: 'fill', run: () => this.repos() });
    // Everything ever in this sprint that's still under a pod: one query, so a story planned out to
    // the next sprint still arrives and departs here (decided 2026-10-08).
    void this.add({ key: 'ever', group: '', cls: 'fill', run: () => this.everInSprint() });
    for (const pod of this.target.pods) {
      void this.add({ key: `tasks:${pod}`, group: pod, cls: 'fill', run: () => this.tasks(pod) });
    }
    void this.add({ key: 'leavers', group: '', cls: 'idle', run: () => this.leavers() });
    // The view is done when `drain` is (`opts.done` fires then); this promise also waits for the stat lines,
    // which `drain` and `finish` never do (B1).
    return this.drain().then(() => this.statsRun ?? undefined);
  }

  private parentOf(id: number): number | undefined {
    const r = (this.ctx.cache.current(this.org, [id]).get(id) ?? []).find((x) => x.rel === 'parent' && x.target.kind === 'wi');
    return r ? (r.target as { id: number }).id : undefined;
  }

  /** History deferred while out of view. */
  get waiting(): number { return this.deferred.size; }

  /**
   * Read this sprint again (04 §5 step 7, decided 2026-10-09): the look tells us what joined, left or
   * changed, then the rest picks up from the item checkpoints, so an unchanged sprint costs the look
   * alone. Used when a settled scope is reopened, and by the Refresh control.
   */
  async refresh(progress?: (done: number, total: number) => void): Promise<void> {
    if (this.closed) return;
    const { cache } = this.ctx;
    const before = new Set(cache.scopeMembers(this.org, this.sk));
    this.mHigh = 0;
    this.finished.clear(); // the look and each item are re-checked; the cache makes that cheap
    this.deferred.clear();
    await this.look(progress);
    const now = cache.scopeMembers(this.org, this.sk);
    const joined = now.filter((id) => !before.has(id));
    // What checkpoints can't see (04 §5 step 7): a PR that has moved on, and now and then a late
    // correction behind our checkpoint. Both are queued, so they rank behind the scene's own work.
    const { n, rescan } = countRefresh(cache, this.org, this.sk);
    void this.add({ key: `prs:refresh:${n}`, group: '', cls: 'fill', run: () => this.refetchPrs() });
    if (rescan) void this.add({ key: `rescan:${n}`, group: '', cls: 'idle', run: () => this.rescan() });
    devlog.write('main', 'stream-reread', { members: now.length, joined: joined.length, refresh: n, rescan });
    void this.fill().catch(() => undefined);
  }

  /** Re-read the PR records that could still have changed: open, or closed in the last week. */
  private async refetchPrs(): Promise<void> {
    const { cache } = this.ctx;
    const members = cache.scopeMembers(this.org, this.sk);
    const worth = prsWorthRefetching(cache, this.org, this.ctx.clock());
    // And whatever couldn't be read last time (slice 7): asked for again.
    for (const m of cache.scopeCheckpoint(this.org, this.sk)?.coverage?.missing ?? []) {
      const r = m.kind === 'pr' ? prRef(m.key) : null;
      if (r) worth.add(`${r.repoId}:${r.prId}`);
    }
    if (!worth.size) return;
    const rels = [...cache.current(this.org, members).values()];
    const { identities } = await prsFor(this.ctx, this.scope, rels, false, (k) => worth.has(k), this.unreadable);
    await people(this.ctx, this.org, identities, { avatars: false });
    this.queueReviews('', 'fill', (pr) => worth.has(`${pr.repoId}:${pr.prId}`), worth);
    devlog.write('main', 'stream-prs-refetched', { count: worth.size });
    this.opts.changed(members.filter((id) => (cache.current(this.org, [id]).get(id) ?? []).some((r) => r.rel === 'pr')));
  }

  /** Re-read recently-changed items from the start, so a correction behind our checkpoint is caught. */
  private async rescan(): Promise<void> {
    const { cache } = this.ctx;
    const items = itemsToRescan(cache, this.org, cache.scopeMembers(this.org, this.sk), this.ctx.clock());
    if (!items.length) return;
    await history(this.ctx, this.scope, items, () => {}, (gone) => this.stale.add(keys.workItem(this.org, gone)), { rescan: true });
    devlog.write('main', 'stream-rescanned', { items: items.length });
    this.opts.changed(items);
  }

  /**
   * Run the queue dry, then close the scope and finish; again if a focus or new roots brought more.
   * The closure runs once per set of roots, never once per history fetch: that was the runaway.
   */
  private drain(): Promise<void> {
    this.draining ??= (async () => {
      for (;;) {
        await this.sched.idle();
        if (this.closed || this.refusedToken) return;
        if (this.rootsSinceClosure) { this.rootsSinceClosure = false; this.discovered = false; await this.closure(); await this.sched.idle(); this.discovered = !this.rootsSinceClosure; }
        if (this.closed || this.refusedToken) return;
        if (this.sched.pending || this.rootsSinceClosure) continue;
        await this.finish();
        this.opts.done?.();
        void this.runStats();
        if (!this.sched.pending && !this.rootsSinceClosure) return;
      }
    })().finally(() => { this.draining = null; });
    return this.draining;
  }

  /** The plate's `N of ~M` (23 B6): the queue, out of an estimate from the member count until discovery is over, then exact. */
  fillCount(): FillCount {
    const c = fillCount({ pending: this.sched.pending, finished: this.finished.size, members: this.ctx.cache.scopeMembers(this.org, this.sk).length, exact: this.discovered, deferred: this.deferred.size });
    this.mHigh = Math.max(this.mHigh, c.m); // M never falls within a run (reset by fill() and a refresh)
    return { ...c, m: this.mHigh };
  }

  /** An item's history, now if it's in the scene on screen, else when it is. */
  private wantHistory(id: number, group: string, cls: TaskClass): void {
    if (this.finished.has(`hist:${id}`)) return;
    if (this.inScene(id, group)) { this.deferred.delete(id); void this.add({ key: `hist:${id}`, group, cls, run: () => this.itemHistory(id) }); }
    else this.deferred.set(id, { group, cls });
  }

  /**
   * Whether an item belongs to the scene on screen, or to what it draws below it: the sprint holds
   * everything; a pod, the Stories and Bugs ever in it, their Tasks, and the Features above them; a
   * close-up, its own item and what's beneath it. `group` is the pod the work was queued for, which
   * answers for a Feature above a pod's bodies — walking up from one only ever reaches an Epic.
   */
  private inScene(id: number, group?: string): boolean {
    const f = this.focusOn;
    if (f.pod === undefined && f.item === undefined) return true;
    if (f.item === undefined && group && group === f.pod) return true;
    const { cache } = this.ctx;
    let cur: number | undefined = id;
    for (let depth = 0; cur !== undefined && depth < 8; depth++) {
      const it = cache.currentItems(this.org, [cur]).get(cur);
      if (!it) return false;
      if (it.type === 'User Story' || it.type === 'Bug') {
        if (f.item !== undefined) return it.itemId === f.item;
        return f.pod === undefined || this.everUnder(it.itemId, it.areaPath, f.pod);
      }
      if (f.item !== undefined && cur === f.item) return true;
      cur = this.parentOf(cur);
    }
    return false; // a Feature or Epic reached from nowhere in this pod: the sprint's scene only
  }

  /**
   * Whether a body was ever under a pod: where it sits now, or where any revision we hold put it. A
   * body that left the pod still has to depart in the pod's playback (02 INV-14).
   */
  private everUnder(id: number, areaPath: string, pod: string): boolean {
    if (under(areaPath, pod)) return true;
    return (this.ctx.cache.revisions(this.org, [id]).get(id) ?? []).some((r) => under(r.areaPath, pod));
  }

  /**
   * Look here (decided 2026-10-08): the pod's work moves to the front, and an item's own history to the
   * very front. Entering a pod raises its Tasks to `look`: resolves once they're in (or at once if they are).
   */
  focus(f: StreamFocus): Promise<void> {
    this.focusOn = f;
    // A seeded item (B5) has one lossy revision: the item in view gets its real history, read whole.
    if (f.item !== undefined && (this.ctx.cache.revisions(this.org, [f.item]).get(f.item) ?? []).some((r) => r.seed)) { this.finished.delete(`hist:${f.item}`); this.wantHistory(f.item, f.pod ?? '', 'look'); } // its checkpoint hides the seed from per-item reads, so this reads it whole
    this.sched.focus((t) => (f.item !== undefined && t.key === `hist:${f.item}` ? -1 : f.pod !== undefined && t.group === f.pod ? 0 : 1));
    // History out of the new scene waits (not yet started); history now in it is queued.
    this.sched.cancel((t) => {
      if (!t.key.startsWith('hist:')) return false;
      const id = Number(t.key.slice(5));
      if (this.inScene(id, t.group)) return false;
      this.deferred.set(id, { group: t.group, cls: t.cls });
      return true;
    });
    for (const [id, d] of [...this.deferred]) if (this.inScene(id, d.group)) this.wantHistory(id, d.group, d.cls);
    if (this.sched.pending && !this.draining && !this.closed) void this.drain().catch(() => undefined);
    if (!f.pod || this.finished.has(`tasks:${f.pod}`)) return Promise.resolve();
    const pod = f.pod;
    return this.add({ key: `tasks:${pod}`, group: pod, cls: 'look', run: () => this.tasks(pod) });
  }

  close(): void {
    this.closed = true;
    this.sched.close();
  }

  get focused(): StreamFocus { return this.focusOn; }

  private add(spec: TaskSpec): Promise<void> {
    if (this.finished.has(spec.key)) return Promise.resolve();
    return this.sched.add({ ...spec, run: async (signal) => { await spec.run(signal); this.finished.add(spec.key); } });
  }

  private async repos(): Promise<void> {
    const { client, cache } = this.ctx;
    const projectId = this.scope.project.projectId;
    const repos = (await client.repos(projectId)).flatMap((r) => parseRepo(r, projectId) ?? []);
    cache.putRepos(this.org, repos, this.ctx.clock());
    // A station is labelled from its repo, so anything already holding a PR link relabels now;
    // without this it keeps the repo's GUID until the next change happens by.
    const members = cache.scopeMembers(this.org, this.sk);
    const linked = members.filter((id) => (cache.current(this.org, [id]).get(id) ?? []).some((r) => r.rel === 'pr'));
    if (linked.length) this.opts.changed(linked);
  }

  /** A pod's bodies: the sprint's own Stories and Bugs ever under it, newest-changed first. */
  private bodies(pod: string): number[] {
    const { cache } = this.ctx;
    return [...cache.currentItems(this.org, [...this.roots]).values()]
      .filter((it) => (it.type === 'User Story' || it.type === 'Bug') && this.everUnder(it.itemId, it.areaPath, pod))
      .sort((a, b) => b.changedAt - a.changedAt).map((it) => it.itemId);
  }

  /** A pod's Tasks (a tree query and their fields), then its PRs and everyone's history, queued. */
  private async tasks(pod: string): Promise<void> {
    const { client, cache } = this.ctx;
    const bodies = this.bodies(pod);
    const below: number[] = [];
    for (const q of descendantQueries(bodies)) below.push(...ids(await client.wiql(this.scope.project.projectId, q, LINK_QUERY_TOP), 'workItemRelations'));
    const known = new Set(cache.scopeMembers(this.org, this.sk));
    const fresh = [...new Set(below)].filter((id) => !bodies.includes(id));
    const got = await hydrate(this.ctx, this.scope, fresh);
    this.addMembers([...got.keys()]);
    const arrived = [...got.keys()].filter((id) => !known.has(id));
    if (arrived.length) this.opts.changed(arrived);
    const cls: TaskClass = 'fill';
    void this.add({ key: `prs:${pod}`, group: pod, cls, run: () => this.prs(pod, [...bodies, ...got.keys()]) });
    void this.add({ key: 'faces', group: '', cls, run: () => this.faces() });
    // History, newest-changed first: the bodies (their planets' stages), then their Tasks.
    const tasksNewest = [...got.values()].sort((a, b) => b.item.changedAt - a.item.changedAt).map((x) => x.item.itemId);
    const want = [...bodies, ...tasksNewest];
    // 04 §5c: a pod with many items to read has them from the project-wide revisions feed first (one fill task, behind the
    // look); each item then finds its history in the cache. Never part of the look. Items the feed served are done; those it
    // couldn't (born before its window, another project's) are read per item; and when the run's page budget stopped it,
    // items that already have a checkpoint (a catch-up) still read per item, while the unread wait for the next run.
    const owed = want.filter((id) => !this.finished.has(`hist:${id}`));
    if (owed.length >= feedThreshold(this.ctx)) {
      void this.add({ key: `feed:${pod}`, group: pod, cls, run: async () => {
        const res = await feedHistory(this.ctx, this.scope, owed, () => {}, (gone) => this.stale.add(keys.workItem(this.org, gone)), this.range(), (id) => this.stale.add(keys.workItem(this.org, id)));
        if (res.capped) this.feedCapped = true;
        const served = new Set(res.served);
        for (const id of served) this.finished.add(`hist:${id}`);
        const started = cache.checkpointRows(this.org, owed);
        // Capped: the pod the user is in reads its unread items per item now (normal priority); other pods wait for the next run.
        const here = this.focusOn.pod === pod;
        for (const id of want) if (!served.has(id) && (!res.capped || started.has(id) || here)) this.wantHistory(id, pod, cls);
        this.opts.changed(owed);
      } });
    } else for (const id of want) this.wantHistory(id, pod, cls);
    // Their Features (the label line, and a reparent's other end): context.
    const features = [...new Set(bodies.flatMap((id) => (cache.current(this.org, [id]).get(id) ?? []).filter((r) => r.rel === 'parent' && r.target.kind === 'wi').map((r) => (r.target as { id: number }).id)))];
    for (const id of features) this.wantHistory(id, pod, 'context');
  }

  /**
   * A pod's PR records, from its bodies' and Tasks' links (in our ADO the Tasks carry most of them).
   * Their reviewers follow as their own tasks at the same class, so `pr_completed` carries who
   * approved and the review formation plays (05 §5) instead of a bare completion.
   */
  private async prs(pod: string, items: number[]): Promise<void> {
    const { cache } = this.ctx;
    const rels = [...cache.current(this.org, items).values()];
    const { identities } = await prsFor(this.ctx, this.scope, rels, false, undefined, this.unreadable);
    await people(this.ctx, this.org, identities, { avatars: false });
    const mine = new Set(rels.flat().filter((r) => r.rel === 'pr' && r.target.kind === 'pr').map((r) => { const t = r.target as { repoId: Guid; prId: number }; return `${t.repoId}:${t.prId}`; }));
    this.queueReviews(pod, 'fill', (pr) => mine.has(`${pr.repoId}:${pr.prId}`));
    const prItems = items.filter((id) => (cache.current(this.org, [id]).get(id) ?? []).some((r) => r.rel === 'pr'));
    if (prItems.length) this.opts.changed(prItems);
  }

  /** Pictures for the people seen so far, so the scene's ships wear their faces while it fills in. */
  private async faces(): Promise<void> {
    const { cache } = this.ctx;
    const met = new Map<Guid, IdentityRefFact>();
    for (const [, revs] of cache.revisions(this.org, cache.scopeMembers(this.org, this.sk))) {
      for (const r of revs) for (const i of [r.assignedTo, r.changedBy]) if (i) met.set(i.id, i);
    }
    for (const it of cache.currentItems(this.org, cache.scopeMembers(this.org, this.sk)).values()) if (it.assignedTo) met.set(it.assignedTo.id, it.assignedTo);
    for (const { pr } of cache.prs(this.org)) for (const i of [pr.author, pr.closedBy]) if (i) met.set(i.id, i);
    await people(this.ctx, this.org, [...met.values()]);
    this.opts.changed([]);
  }

  /** One item's revisions and updates, unless the cache already has its latest revision (a reopen costs nothing). */
  private async itemHistory(id: number): Promise<void> {
    const { cache } = this.ctx;
    const cur = cache.currentItems(this.org, [id]).get(id);
    const held = cache.revisions(this.org, [id]).get(id);
    const last = held?.at(-1);
    // A tail (the first row isn't rev 1: the revisions feed's window began mid-history, B5) is not a whole history.
    // And a checkpoint: stored rows without one (migration 007, or a capped feed crawl) are read whole.
    if (cur && last && last.changedAt >= cur.changedAt && held![0]!.rev === 1 && cache.checkpointRows(this.org, [id]).has(id)) return;
    await history(this.ctx, this.scope, [id], () => {}, (gone) => this.stale.add(keys.workItem(this.org, gone)));
    const revs = cache.revisions(this.org, [id]).get(id) ?? [];
    await people(this.ctx, this.org, revs.flatMap((r) => [r.assignedTo, r.changedBy].filter((x): x is IdentityRefFact => !!x)), { avatars: false });
    this.opts.changed([id]);
  }

  /**
   * Everything ever in this sprint that's still under a pod, in one query (decided 2026-10-08): the
   * story planned out to the next sprint, which the daily samples only found much later. `EVER` has no
   * `UNDER` form and can't be combined with `ASOF`, so the pod clause is present-tense; derive's own
   * rule (ever under a pod, in the sprint's window) does the real filtering. Older ADO may refuse the
   * operator, so a 400 falls back to the samples.
   */
  private async everInSprint(): Promise<void> {
    const t = this.target;
    const { cache } = this.ctx;
    const projectId = this.scope.project.projectId;
    // The sprint and its child iterations (slice 7): `EVER` has no `UNDER`, so one clause per path.
    const sprintPaths = fitQuery([t.path, ...cache.iterationNodes(this.org, projectId).map((n) => n.path).filter((p) => p !== t.path && under(p, t.path))], t.path);
    let found: number[];
    try {
      found = ids(await this.ctx.client.wiql(projectId, sprintItemsEver(sprintPaths, t.pods), SPRINT_TOP), 'workItems');
    } catch (e) {
      if (!(e instanceof AdoError) || e.status !== 400) throw e;
      devlog.write('main', 'wiql-ever-unsupported', { status: 400, code: e.code ?? null });
      this.everUnsupported = true;
      return;
    }
    await this.adopt(found, 'fill');
    // Then once per pod, ever in the pod too (slice 7, decided 2026-10-10): a body that has since left
    // both the sprint and the pod is found now, not only by the daily samples.
    const areas = cache.areaNodes(this.org, projectId).map((n) => n.path);
    for (const pod of t.pods) {
      const podPaths = fitQuery([pod, ...areas.filter((p) => p !== pod && under(p, pod))], pod);
      try {
        await this.adopt(ids(await this.ctx.client.wiql(projectId, podItemsEver(sprintPaths, podPaths), SPRINT_TOP), 'workItems'), 'fill');
      } catch (e) {
        if (!(e instanceof AdoError) || e.status !== 400) throw e;
        devlog.write('main', 'wiql-ever-unsupported', { status: 400, code: e.code ?? null, query: 'pod' });
      }
    }
  }

  /**
   * The backstop (idle): Stories and Bugs in the sprint on some day so far, sampled daily at 12:00
   * UTC. The `EVER` query covers anything still under a pod; this also catches one that moved area.
   */
  private async leavers(): Promise<void> {
    const { client } = this.ctx;
    const t = this.target;
    const at = this.ctx.clock();
    const samples = [new Date(t.startUtc).toISOString()];
    for (let d = Math.floor(t.startUtc / DAY) * DAY + DAY / 2; d < Math.min(t.finishUtc, at); d += DAY) if (d >= t.startUtc) samples.push(new Date(d).toISOString());
    const found = new Set<number>();
    for (const asOf of samples) {
      for (const id of ids(await client.wiql(this.scope.project.projectId, sprintItems(t.path, t.pods, asOf), SPRINT_TOP), 'workItems')) found.add(id);
    }
    await this.adopt([...found], 'idle');
  }

  /** Take in newly found bodies of the sprint: members, roots, and their history at `cls`. */
  private async adopt(found: number[], cls: TaskClass): Promise<void> {
    const known = new Set(this.ctx.cache.scopeMembers(this.org, this.sk));
    const fresh = found.filter((id) => !known.has(id));
    if (!fresh.length) { this.addRoots(found); return; }
    const got = await hydrate(this.ctx, this.scope, fresh);
    this.addMembers([...got.keys()]);
    this.addRoots([...found.filter((id) => known.has(id)), ...got.keys()]);
    for (const id of got.keys()) this.wantHistory(id, this.podOf(got.get(id)!.item.areaPath) ?? '', cls);
    this.opts.changed([...got.keys()]);
  }

  /**
   * Close the scope, so it holds what a full sync would (AC-27). It walks out from the sprint's own
   * bodies and nowhere else, in the full sync's order (04 §5b): descendants and former children down,
   * then every parent those have ever had — and the ancestors never feed the downward walk, or an
   * Epic drags its whole tree in. Run when the queue is dry, so the members' updates are in.
   */
  private async closure(): Promise<void> {
    const { client, cache } = this.ctx;
    const org = this.org;
    const projectId = this.scope.project.projectId;
    const take = async (list: number[], cls: TaskClass = 'idle') => {
      const got = await hydrate(this.ctx, this.scope, list);
      this.addMembers([...got.keys()]);
      for (const id of got.keys()) this.wantHistory(id, this.podOf(got.get(id)!.item.areaPath) ?? '', cls);
      if (got.size) this.opts.changed([...got.keys()]);
      return [...got.keys()];
    };
    try {
      const known = new Set(cache.scopeMembers(org, this.sk));
      // Down, from the sprint's bodies only.
      let frontier = [...this.roots];
      while (frontier.length) {
        if (this.closed) return;
        const next: number[] = [];
        for (const q of descendantQueries(frontier)) next.push(...ids(await client.wiql(projectId, q, LINK_QUERY_TOP), 'workItemRelations'));
        for (const [, ups] of cache.updates(org, frontier)) for (const u of ups) for (const r of u.removed) if (r.rel === 'child' && r.target.kind === 'wi') next.push(r.target.id);
        const fresh = [...new Set(next)].filter((id) => !known.has(id));
        for (const id of fresh) known.add(id);
        frontier = await take(fresh, 'fill');
      }
      // Up, for the breadcrumb and the Epic sector. Their own other children are not this sprint's.
      let up = [...known];
      while (up.length) {
        if (this.closed) return;
        const parents = new Set<number>();
        for (const [, rels] of cache.current(org, up)) for (const r of rels) if (r.rel === 'parent' && r.target.kind === 'wi') parents.add(r.target.id);
        for (const [, ups] of cache.updates(org, up)) for (const u of ups) for (const r of [...u.added, ...u.removed]) if (r.rel === 'parent' && r.target.kind === 'wi') parents.add(r.target.id);
        const fresh = [...parents].filter((id) => !known.has(id));
        for (const id of fresh) known.add(id);
        up = await take(fresh, 'context');
      }
      // History for any member still without it (the look's Features, a cancelled fill).
      const members = cache.scopeMembers(org, this.sk);
      const withHistory = cache.itemsWithHistory(org, members);
      for (const id of members) {
        if (withHistory.has(id) || this.deferred.has(id) || this.finished.has(`hist:${id}`)) continue;
        this.wantHistory(id, this.podOf(cache.currentItems(org, [id]).get(id)?.areaPath ?? '') ?? '', 'idle');
      }
      // PRs from every link ever made, and review votes for completed ones.
      const rels: RelationFact[][] = [...cache.current(org, members).values()];
      for (const [, ups] of cache.updates(org, members)) rels.push(ups.flatMap((u) => [...u.added, ...u.removed]));
      const have = new Set(cache.prs(org).map((p) => `${p.pr.repoId}:${p.pr.prId}`));
      const todo = rels.map((l) => l.filter((r) => r.rel === 'pr' && r.target.kind === 'pr' && !have.has(`${r.target.repoId}:${r.target.prId}`)));
      if (todo.some((l) => l.length)) await people(this.ctx, org, (await prsFor(this.ctx, this.scope, todo, false, undefined, this.unreadable)).identities, { avatars: false });
      const linked = new Set(rels.flat().filter((r) => r.rel === 'pr' && r.target.kind === 'pr').map((r) => { const t = r.target as { repoId: Guid; prId: number }; return `${t.repoId}:${t.prId}`; }));
      this.queueReviews('', 'idle', (pr) => linked.has(`${pr.repoId}:${pr.prId}`));
    } catch (e) {
      // The scope is short of a full sync's: say so rather than marking it filled (decided 2026-10-08).
      if (this.closed) return;
      this.incomplete = true;
      devlog.write('main', 'stream-error', { task: 'closure', status: e instanceof AdoError ? e.status : null });
      this.checkRefused(e);
    }
  }

  /**
   * Queue the approvers read for completed PRs that have none yet (`fill`, so `pr_completed` carries who
   * approved), and note which PRs' stat lines (B1) need reading. The stat reads are not queued here: see
   * `runStats`, which runs them after the stream is done.
   */
  private queueReviews(group: string, cls: TaskClass, mine: (pr: PullRequestFact) => boolean, wanted?: ReadonlySet<string>): void {
    const repos = new Map(this.ctx.cache.repos(this.org).map((r) => [r.repoId, r]));
    for (const { pr, approvers, statsCommit } of this.ctx.cache.prs(this.org)) {
      if (!mine(pr)) continue;
      const repo = repos.get(pr.repoId);
      if (repo && runDue(repo, this.ctx.clock()) && !this.runsTodo.has(repo.repoId)) this.runsTodo.set(repo.repoId, { repo });
      if (approvers === null && pr.status === 'completed') void this.add({ key: `votes:${pr.repoId}:${pr.prId}`, group, cls, run: () => this.approvers(pr) });
      if (pr.stats === undefined || wanted?.has(`${pr.repoId}:${pr.prId}`)) { const k = `${pr.repoId}:${pr.prId}`; if (!this.statsTodo.has(k)) this.statsTodo.set(k, { pr, ...(statsCommit ? { commit: statsCommit } : {}) }); }
    }
  }

  /** A completed PR's reviewers and threads: its approvers at completion (04 §6a). */
  private async approvers(pr: PullRequestFact): Promise<void> {
    const { client, cache } = this.ctx;
    const read = await readReview(client, pr.repoId, pr.prId);
    if (read.threadsDenied) this.threadsDenied = true;
    surfaceReview(read);
    // A completed PR's stat line reuses what was just read (04 §6a-1): no second look at its reviewers and threads.
    const waiting = this.statsTodo.get(`${pr.repoId}:${pr.prId}`);
    if (waiting) waiting.review = read;
    await people(this.ctx, this.org, read.reviewers.map(parseIdentity).filter((i): i is IdentityRefFact => !!i), { avatars: false });
    cache.setApprovers(this.org, pr.repoId, pr.prId, approversAt(read.reviewers, read.threads, pr.closedAt).approvers);
  }

  /**
   * The stat lines still to read (B1), run once the stream is done and the scope closed: they are not
   * the view's own work, so `drain` and `finish` never wait on them. Two at a time, and a stop
   * (`closed`) ends them. Each tells the view which
   * pieces its PR touches, so the plate's line fills in behind the scene.
   */
  private runStats(): Promise<void> {
    this.statsRun ??= runStatsJobs(this.ctx, this.org, this.statsTodo, {
      stopped: () => this.closed || this.refusedToken,
      onStop: (e) => this.checkRefused(e),
      runs: this.runsTodo,
      onRun: (repo) => {
        // The station's plate fills in its run line behind the scene: tell the view which pieces its PRs touch.
        const { cache } = this.ctx;
        const linked = cache.scopeMembers(this.org, this.sk).filter((id) => (cache.current(this.org, [id]).get(id) ?? []).some((r) => r.rel === 'pr' && r.target.kind === 'pr' && r.target.repoId === repo.repoId));
        if (linked.length) this.opts.changed(linked);
      },
      onRead: (pr) => {
        const { cache } = this.ctx;
        const linked = cache.scopeMembers(this.org, this.sk).filter((id) => (cache.current(this.org, [id]).get(id) ?? []).some((r) => r.rel === 'pr' && r.target.kind === 'pr' && r.target.repoId === pr.repoId && r.target.prId === pr.prId));
        if (linked.length) this.opts.changed(linked);
      },
    }).finally(() => { this.statsRun = null; });
    return this.statsRun;
  }

  /** Pictures for the people in this sprint, the derived tables, and the coverage notes. */
  private async finish(): Promise<void> {
    const { cache } = this.ctx;
    const org = this.org;
    const members = cache.scopeMembers(org, this.sk);
    const met = new Map<Guid, IdentityRefFact>();
    for (const [, revs] of cache.revisions(org, members)) for (const r of revs) for (const i of [r.assignedTo, r.changedBy]) if (i) met.set(i.id, i);
    for (const { pr } of cache.prs(org)) for (const i of [pr.author, pr.closedBy]) if (i) met.set(i.id, i);
    await people(this.ctx, org, [...met.values()]);
    const notes = new Set(cache.scopeCheckpoint(org, this.sk)?.coverage?.notes ?? []);
    if (this.everUnsupported) notes.add(SPRINT_SAMPLING_NOTE); // else the EVER query covered it
    if (this.threadsDenied) notes.add(FINAL_VOTES_NOTE);
    if (this.capped) notes.add(SCOPE_CAPPED_NOTE);
    if (this.feedCapped) notes.add(FEED_CAPPED_NOTE); else notes.delete(FEED_CAPPED_NOTE);
    if (this.stale.size) notes.add('Some work items could not be read now; their last known history is kept.');
    const cp = cache.scopeCheckpoint(org, this.sk);
    const items = (cp?.coverage?.partial ?? false) || this.capped || this.incomplete || this.feedCapped || this.stale.size > 0;
    // PRs and repos that couldn't be read join (or leave) the list (slice 7).
    const merged = mergeMissing({ partial: items, notes: [...notes], stale: [...this.stale], missing: cp?.coverage?.missing ?? [] }, this.unreadable);
    const partial = merged.partial || this.capped || this.incomplete || this.feedCapped || this.stale.size > 0;
    cache.setScopeCheckpoint(org, this.sk, { lastSuccessAt: cp?.lastSuccessAt ?? this.ctx.clock(), lastError: null, coverage: { ...merged, partial } });
    const state = levelState(cache, this.scope) ?? emptyLevels();
    // Filled only when the closure came through: otherwise the next open streams it again.
    state.sprint = { lookAt: state.sprint?.lookAt ?? this.ctx.clock(), filledAt: this.incomplete || this.feedCapped ? null : this.ctx.clock() };
    cache.setSetting(stateKey(this.scope), state);
    // The derived tables, wholesale, as a full sync leaves them (the galaxy's activity reads them).
    const { history: h, links } = derive(factsFor(this.ctx, this.scope, { startUtc: this.target.startUtc, endUtc: Math.min(this.target.finishUtc, this.ctx.clock()) }));
    cache.rebuildDerived(org, this.sk, [...h.entities.workItems, ...h.entities.prs].map((e) => e.key), h.events, h.observations, links, (pk) => pk.split(':').pop()!);
    devlog.write('main', 'stream-done', { members: members.length, roots: this.roots.size, partial });
  }
}

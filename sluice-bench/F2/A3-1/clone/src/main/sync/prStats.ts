// B1 (04 §6a-1): what a PR's reviewers, threads, iterations and changes say, shared by the full sync,
// the level loader and the sprint stream. Reviewers and threads also give the approvers at completion
// (§6a); iterations and the last iteration's changes give pushes and files.
//
// Two jobs with two failure rules, kept apart:
//  - **Approvers** (`readReview`, then `surfaceReview`) behave as they did before B1: a failure the old code
//    threw still throws, and a refused thread list is "denied" (the final-votes note).
//  - **The stat line** (`readPrStats`) is a nice-to-have. No failure of any of its four calls ever throws:
//    a permanent refusal (401, 403, 404) leaves that fact out and is stored; a transient failure (no
//    response, 408, 429, 5xx) stores nothing, so the PR stays "unread" and is tried once more next refresh.
//    A **401 on reviewers, iterations or changes is neither** (plain Code read, the PR record's own scope; 04 §6: the
//    token is no longer good): it stores nothing and is rethrown, so the caller stops (a sync fails, the stream
//    refuses) instead of sending doomed calls. A **threads** 401 is a missing scope (`vso.threads_full`, 04 §1): a
//    refusal like a 403 (`threadsDenied`). An abort (not an `AdoError`) ends the read.
// **The station's run line** (B2, 04 §3 builds) rides the same runner: a repo's latest build on its default branch,
// its own failure tiers: any refusal (401, 403, 404, and a 400 or 409) is "read, no run" and backs off for the
// interval, because a token without the Build scope gets 401 (04 §1), which is a scope and not a dead token;
// 0/408/429/5xx store nothing and are tried at the next refresh; a failed call never fails a load.
// Reads only (INV-21).
import type { Guid } from '@shared/contracts/keys';
import type { PrStats, PullRequestFact, RepoFact, RepoRun } from '@shared/contracts/facts';
import { failureTier } from '@shared/contracts/neterror';
import { changePage, parseBuildRun, prStatsOf } from '@shared/ingest/parse';
import { RUN_REREAD_MS } from '@shared/runLine';
import { AdoError, type AdoClient } from '../ado/client';
import { devlog } from '../devlog';
import { PR_REFETCH_DAYS, prsWorthRefetching } from './refresh';
import { throttleGate } from './scheduler';
import type { Cache } from '../db/cache';
import { isGone } from './sync';

export interface ReviewRead {
  /** `[]` when the call failed (see `reviewersRead`). */
  reviewers: unknown[];
  reviewersRead: boolean;
  /** Null when unreadable: approvals then come from the final votes (§6a-3). */
  threads: unknown[] | null;
  /** Threads were refused (401, 403, 404) while the PR itself was readable: the note that approvals come from final votes. */
  threadsDenied: boolean;
  /** Failures the pre-B1 approvers path threw (`surfaceReview` throws them). */
  failure?: unknown;
  /** A call failed in a way worth another try (no response, 408, 429, 5xx). */
  transient: boolean;
  /** A call answered 401: the token is no longer good. `readPrStats` and `surfaceReview` rethrow it. */
  unauthorized?: AdoError;
}

const DAY = 86_400_000;
/** A page of changes, and the most pages read: past it the count is a floor, and enough for a band. */
const PAGE = 1000;
const MAX_PAGES = 10;

const isTransient = (e: AdoError) => failureTier(e.status) === 'transient';

/** Reviewers and threads of one PR. Never throws an `AdoError`: see `surfaceReview`. */
export async function readReview(client: AdoClient, repoId: Guid, prId: number): Promise<ReviewRead> {
  const out: ReviewRead = { reviewers: [], reviewersRead: true, threads: null, threadsDenied: false, transient: false };
  let prGone = false;
  try { out.reviewers = await client.reviewers(repoId, prId); } catch (e) {
    if (!(e instanceof AdoError)) throw e;
    out.reviewersRead = false;
    prGone = e.status === 404;
    if (e.status === 401) out.unauthorized ??= e;
    if (isTransient(e)) out.transient = true;
    if (!isGone(e)) out.failure = e; // the old code threw these (a 401, a 400)
  }
  try { out.threads = await client.threads(repoId, prId); } catch (e) {
    if (!(e instanceof AdoError)) throw e;
    if (isTransient(e)) out.transient = true;
    // Refused threads on a PR we could read are "denied"; with the PR itself gone, they say nothing. A threads 401 is
    // a scope refusal too (ADO answers 401, TF400813, to a token without `vso.threads_full`; 04 §1): not a dead token.
    if ([401, 403, 404].includes(e.status)) out.threadsDenied = !prGone;
    else out.failure ??= e; // the old code threw these (429, 5xx, no response)
  }
  return out;
}

/** The approvers path's failure, if it had one: throws it, as before B1. Call after the stats are stored. */
export function surfaceReview(review: ReviewRead): void {
  if (review.unauthorized) throw review.unauthorized;
  if (review.failure) throw review.failure;
}

/** One quiet read: its value, or what went wrong. Anything but an `AdoError` still ends the read. */
async function quietly<T>(read: () => Promise<T>): Promise<{ value?: T; transient: boolean }> {
  try { return { value: await read(), transient: false }; } catch (e) {
    if (!(e instanceof AdoError) || e.status === 401) throw e;
    devlog.write('main', 'sync-skip', { family: e.family, status: e.status, code: e.code ?? null, reason: 'pr-stats' });
    return { transient: isTransient(e) };
  }
}

export interface PriorStats { stats?: PrStats; commit?: string }
export interface StatsRead {
  stats: PrStats;
  /** The source commit the pushes and files were read at. */
  commit?: string;
  /** Something failed and may pass: store nothing, so the PR is tried again. */
  transient: boolean;
}

/**
 * The stat line's facts for one PR, reading only what could have changed (04 §6a-1):
 * - **Votes and threads** are read for a PR that is open, closed within `PR_REFETCH_DAYS`, or has no stats yet.
 *   An older closed PR keeps what it has. A `review` already read (the approvers' path) is reused.
 * - **Pushes and files** (iterations, changes) are read when the PR's last source commit moved since the stored
 *   stats, or there are none; an older closed PR with stats is not asked again.
 */
export async function readPrStats(client: AdoClient, pr: PullRequestFact, prior: PriorStats | undefined, now: number, review?: ReviewRead): Promise<StatsRead> {
  const had = prior?.stats;
  const recent = pr.status === 'active' || (pr.closedAt ?? 0) >= now - PR_REFETCH_DAYS * DAY;
  let transient = false;
  const out: PrStats = { ...(had ?? {}) };
  let commit = prior?.commit;

  const rv = review ?? (recent || !had ? await readReview(client, pr.repoId, pr.prId) : undefined);
  if (rv?.unauthorized) throw rv.unauthorized;
  if (rv) {
    if (rv.transient) transient = true;
    const fresh = prStatsOf({ ...(rv.reviewersRead ? { reviewers: rv.reviewers } : {}), ...(rv.threads ? { threads: rv.threads } : {}) });
    if (rv.reviewersRead) { delete out.votes; if (fresh.votes) out.votes = fresh.votes; }
    if (fresh.threads !== undefined) out.threads = fresh.threads;
  }

  const moved = !had || (recent && !(prior?.commit && pr.lastCommit && prior.commit === pr.lastCommit));
  if (moved) {
    const its = await quietly(() => client.prIterations(pr.repoId, pr.prId));
    if (its.transient) transient = true;
    if (its.value) {
      out.pushes = its.value.length;
      delete out.files;
      if (its.value.length > 0) {
        const last = Number((its.value[its.value.length - 1] as { id?: unknown } | undefined)?.id ?? its.value.length);
        const files = await quietly(async () => {
          let n = 0;
          let skip = 0;
          for (let page = 0; page < MAX_PAGES; page++) {
            const got = changePage(await client.prChanges(pr.repoId, pr.prId, last, skip, PAGE));
            n += got.files;
            if (got.next <= skip) break;
            skip = got.next;
          }
          return n;
        });
        if (files.transient) transient = true;
        if (files.value !== undefined) out.files = files.value;
      }
      if (pr.lastCommit) commit = pr.lastCommit;
    }
  }
  return { stats: out, ...(commit ? { commit } : {}), transient };
}

/** A stat read waiting its turn (B1): the PR, the commit its stats were read at, and a review already read for its approvers. */
export interface StatsJob { pr: PullRequestFact; commit?: string; review?: ReviewRead }
/** A run read waiting its turn (B2): a repository whose latest build is due. */
export interface RunJob { repo: RepoFact }

/** Whether the repo's run should be read now: it has a default branch to read on, and was never read or last read `RUN_REREAD_MS` ago. */
export const runDue = (repo: RepoFact, now: number): boolean =>
  !!repo.defaultBranch && (repo.runReadAt === undefined || now - repo.runReadAt >= RUN_REREAD_MS || repo.runReadAt > now);

export interface RunRead {
  /** The latest run; absent when the repository has none, or the builds are refused. */
  run?: RepoRun;
  /** Something failed and may pass: store nothing, so the repository is tried again. */
  transient: boolean;
  /** A 401 (the Build scope was withdrawn): the run read earlier is kept; the read is stored only for the back-off. */
  keep?: true;
}

/**
 * One repository's latest run on its default branch (04 §3). `[]`, an unreadable build, or any refusal (401, 403, 404,
 * 400, 409: the Build scope isn't granted, or the project has no pipelines) is "no run", stored: no line shows, no
 * banner rises, and it is asked again only after `RUN_REREAD_MS`. A 401 here is a missing scope (ADO answers an
 * ungranted scope with 401, 04 §1), never a dead token: the other calls would say so. A transient failure is not
 * stored. Throws only what is not an `AdoError`.
 */
export async function readRepoRun(client: AdoClient, repo: RepoFact): Promise<RunRead> {
  try {
    const rows = await client.latestBuild(repo.projectId, repo.repoId, repo.defaultBranch!);
    const run = parseBuildRun(rows[0]);
    return run ? { run, transient: false } : { transient: false };
  } catch (e) {
    if (!(e instanceof AdoError)) throw e;
    devlog.write('main', 'sync-skip', { family: e.family, status: e.status, code: e.code ?? null, reason: 'repo-run' });
    return { transient: isTransient(e), ...(e.status === 401 ? { keep: true as const } : {}) };
  }
}

const sleepFor = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reads the waiting stat lines (and run lines) after the view's own work is done (04 §6a-1): two at a time, never while the
 * shared throttle gate is shut (04 §6), and ending at once when `stopped()` says so. A 401 stops the whole run
 * (nothing stored for that read) and goes to `onStop`; any other failure is that read's alone. `onRead` hears each
 * PR that was stored, `onRun` each repository whose run was. Takes jobs from `jobs` and `o.runs` as it goes, so ones
 * added meanwhile are read too; PRs go first.
 */
export async function runStatsJobs(
  c: { client: AdoClient; cache: Cache; clock: () => number }, org: string, jobs: Map<string, StatsJob>,
  o: { stopped: () => boolean; onRead?: (pr: PullRequestFact) => void; onStop?: (e: AdoError) => void; runs?: Map<string, RunJob>; onRun?: (repo: RepoFact) => void; /** Told each job's key as it is taken from the queue. */ taken?: (key: string) => void },
): Promise<void> {
  const runs = o.runs ?? new Map<string, RunJob>();
  while ((jobs.size || runs.size) && !o.stopped()) {
    const wait = throttleGate.until - Date.now();
    if (wait > 0) { await sleepFor(Math.min(wait, 1000)); continue; }
    const batch = [...jobs.entries()].slice(0, 2);
    for (const [k] of batch) { jobs.delete(k); o.taken?.(k); }
    const repoBatch = [...runs.entries()].slice(0, 2 - batch.length);
    for (const [k] of repoBatch) { runs.delete(k); o.taken?.(k); }
    let stop: AdoError | null = null;
    const failed = (e: unknown, task: string) => {
      if (e instanceof AdoError && e.status === 401) { stop ??= e; return; }
      if (o.stopped()) return;
      devlog.write('main', 'stream-error', { task, status: e instanceof AdoError ? e.status : null });
    };
    await Promise.all([
      ...batch.map(async ([, { pr, commit, review }]) => {
        try {
          const read = await readPrStats(c.client, pr, { ...(pr.stats ? { stats: pr.stats } : {}), ...(commit ? { commit } : {}) }, c.clock(), review);
          if (read.transient) return; // stays unread: tried again at the next refresh
          c.cache.setPrStats(org, pr.repoId, pr.prId, read.stats, read.commit);
          o.onRead?.(pr);
        } catch (e) { failed(e, 'pr-stats'); }
      }),
      ...repoBatch.map(async ([, { repo }]) => {
        try {
          const read = await readRepoRun(c.client, repo);
          if (read.transient) return; // stays as it was: tried again at the next refresh
          c.cache.setRepoRun(org, repo.repoId, read.keep ? repo.run : read.run, c.clock());
          o.onRun?.(repo);
        } catch (e) { failed(e, 'repo-run'); }
      }),
    ]);
    if (stop) { jobs.clear(); runs.clear(); o.onStop?.(stop); return; }
  }
}

/** The stat reads a set of PRs (`repoId:prId`) still need: never read, open, or closed within the last week (`prsWorthRefetching`). */
export function statsJobsFor(cache: Cache, org: string, refs: ReadonlySet<string>, now: number): Map<string, StatsJob> {
  const worth = prsWorthRefetching(cache, org, now);
  const out = new Map<string, StatsJob>();
  for (const { pr, statsCommit } of cache.prs(org)) {
    const k = `${pr.repoId}:${pr.prId}`;
    if (refs.has(k) && worth.has(k)) out.set(k, { pr, ...(statsCommit ? { commit: statsCommit } : {}) });
  }
  return out;
}

/** The run reads the repos of a set of PRs (`repoId:prId`) need now (`runDue`): one per repo, only those the cache lists with a default branch. */
export function runJobsFor(cache: Cache, org: string, refs: ReadonlySet<string>, now: number): Map<string, RunJob> {
  const repoIds = new Set([...refs].map((k) => k.slice(0, k.indexOf(':'))));
  const out = new Map<string, RunJob>();
  for (const repo of cache.repos(org)) if (repoIds.has(repo.repoId) && runDue(repo, now)) out.set(repo.repoId, { repo });
  return out;
}

/**
 * Stat reads started after a level load returned, so a test can wait for them (`settleStats`).
 * One job queue per org (B audit): concurrent level loads add to it, so a PR is not read twice and the reads do not run 2 x N wide.
 * `seen` holds the keys already taken since the runner started; a later load's job for one of them is dropped.
 */
interface OrgQueue { jobs: Map<string, StatsJob>; runs: Map<string, RunJob>; seen: Set<string>; running: boolean }
const queues = new Map<string, OrgQueue>();
const background = new Set<Promise<void>>();
export const settleStats = async (): Promise<void> => { while (background.size) await Promise.all([...background]); };

/**
 * Adds the deferred stat reads of a level load to the org's queue and starts its runner if none is going: two at a time,
 * honouring the gate. The runner stops when `c.background` (the service's controller; else the load's own signal) aborts,
 * and then drops what is queued.
 */
export function runStatsInBackground(c: { client: AdoClient; cache: Cache; clock: () => number; signal?: AbortSignal; background?: { client: AdoClient; signal: AbortSignal } }, org: string, jobs: Map<string, StatsJob>, runs?: Map<string, RunJob>): void {
  const q = queues.get(org) ?? (queues.set(org, { jobs: new Map(), runs: new Map(), seen: new Set(), running: false }), queues.get(org)!);
  for (const [k, v] of jobs) if (!q.seen.has(k)) q.jobs.set(k, v);
  for (const [k, v] of runs ?? []) if (!q.seen.has(k)) q.runs.set(k, v);
  if (q.running || (!q.jobs.size && !q.runs.size)) return;
  q.running = true;
  const signal = c.background?.signal ?? c.signal;
  const ctx = { client: c.background?.client ?? c.client, cache: c.cache, clock: c.clock };
  const stopped = () => !!signal?.aborted;
  const run: Promise<void> = runStatsJobs(ctx, org, q.jobs, { stopped, runs: q.runs, taken: (k) => q.seen.add(k) }).catch(() => undefined).finally(() => {
    background.delete(run);
    q.running = false;
    q.seen.clear();
    if (stopped()) { q.jobs.clear(); q.runs.clear(); queues.delete(org); }
    else if (q.jobs.size || q.runs.size) runStatsInBackground(c, org, new Map(), new Map()); // added as the last read finished
  });
  background.add(run);
}

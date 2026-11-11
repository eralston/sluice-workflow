// B2: the station plate's pipeline line. The build's status and result in the chart's words, the line's text
// and age, the fake ADO's builds, and the sync storing the run, degrading quietly and re-reading on the PR
// cadence (04 §3 builds, §6a-2). Invented data only (INV-18).
import { describe, expect, it } from 'vitest';
import { scenario, toHistory, sprintScopes } from '@fixtures/dsl';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { parseBuildRun } from '@shared/ingest/parse';
import { RUN_DOT_HEX, RUN_REREAD_MS, runAsOf, RUN_DOT_SHAPE, RUN_WORD, runAgo, runLine } from '@shared/runLine';
import type { RunState } from '@shared/contracts/facts';
import type { AdoResponse } from '@shared/contracts/transport';
import { comparable, harness, ingest, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';
import { refusesToken } from '@shared/contracts/neterror';
import { runProbe } from '../../src/main/ado/probe';
import { loadLevel } from '../../src/main/sync/levels';
import { runDue, settleStats } from '../../src/main/sync/prStats';
import { syncScope } from '../../src/main/sync/sync';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { throttleGate } from '../../src/main/sync/scheduler';

const ORG = '00000000-0000-4000-8000-000000000001';
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('parseBuildRun: status and result become one honest word', () => {
  const build = (o: Record<string, unknown>) => ({ queueTime: '2026-10-06T10:00:00Z', startTime: '2026-10-06T10:01:00Z', finishTime: '2026-10-06T10:09:00Z', ...o });
  const at = (s: string) => Date.parse(s);
  it('maps a completed build by its result, stamped at its finish', () => {
    const cases: [string, RunState][] = [['succeeded', 'passed'], ['partiallySucceeded', 'partly'], ['failed', 'failed'], ['canceled', 'canceled']];
    for (const [result, state] of cases) expect(parseBuildRun(build({ status: 'completed', result })), result).toEqual({ state, at: at('2026-10-06T10:09:00Z') });
  });
  it('maps a build not yet completed to running (at its start) or queued (at its queueing)', () => {
    expect(parseBuildRun(build({ status: 'inProgress' }))).toEqual({ state: 'running', at: at('2026-10-06T10:01:00Z') });
    expect(parseBuildRun(build({ status: 'cancelling' }))).toEqual({ state: 'running', at: at('2026-10-06T10:01:00Z') });
    expect(parseBuildRun(build({ status: 'notStarted' }))).toEqual({ state: 'queued', at: at('2026-10-06T10:00:00Z') });
    expect(parseBuildRun(build({ status: 'postponed' }))).toEqual({ state: 'queued', at: at('2026-10-06T10:00:00Z') });
  });
  it('is null for what it cannot read, never a guess', () => {
    expect(parseBuildRun(undefined)).toBeNull();
    expect(parseBuildRun({})).toBeNull();
    expect(parseBuildRun(build({ status: 'completed' }))).toBeNull(); // no result
    expect(parseBuildRun(build({ status: 'completed', result: 'mystery' }))).toBeNull();
    expect(parseBuildRun({ status: 'completed', result: 'failed' })).toBeNull(); // no time at all
  });
});

describe('the run line (15 §6 run-line)', () => {
  const t0 = Date.parse('2026-10-06T12:00:00Z');
  it('counts the age to the later of the as-of time and when the run was read', () => {
    expect(runAsOf({ state: 'passed', at: t0 }, t0 + HOUR)).toBe(t0 + HOUR);
    expect(runAsOf({ state: 'passed', at: t0, readAt: t0 + 3 * HOUR }, t0 + HOUR)).toBe(t0 + 3 * HOUR);
    expect(runLine({ state: 'passed', at: t0 }, runAsOf({ state: 'passed', at: t0, readAt: t0 + 3 * HOUR }, t0 + HOUR))).toBe('Last run: passed · 3 h ago');
  });
  it('writes the age against the as-of time', () => {
    expect(runAgo(t0, t0 + 20_000)).toBe('just now');
    expect(runAgo(t0, t0 - HOUR)).toBe('just now'); // stamped after the as-of time: never a negative age
    expect(runAgo(t0, t0 + 5 * MIN)).toBe('5 min ago');
    expect(runAgo(t0, t0 + 2 * HOUR + 59 * MIN)).toBe('2 h ago');
    expect(runAgo(t0, t0 + 47 * HOUR)).toBe('47 h ago');
    expect(runAgo(t0, t0 + 3 * 24 * HOUR)).toBe('3 d ago');
  });
  it('says the result in neutral words, with partly passed and canceled as they are', () => {
    expect(runLine({ state: 'passed', at: t0 }, t0 + 2 * HOUR)).toBe('Last run: passed · 2 h ago');
    expect(runLine({ state: 'partly', at: t0 }, t0 + HOUR)).toBe('Last run: partly passed · 1 h ago');
    expect(runLine({ state: 'canceled', at: t0 }, t0 + HOUR)).toBe('Last run: canceled · 1 h ago');
    expect(runLine({ state: 'running', at: t0 }, t0 + 5 * MIN)).toBe('Last run: running · 5 min ago');
    expect(runLine({ state: 'failed', at: t0 }, t0 + HOUR)).toBe('Last run: failed · 1 h ago');
  });
  it('colours the dot outside the ladder, the hostile palette, red, the fleet\'s Seafoam and --cyan, and gives each result its own shape', () => {
    const ladder = ['#8A93A6', '#5AA9FF', '#A487FF', '#FFC76B', '#6F7787'];
    const hostile = ['#84182A', '#18141C', '#FF4438', '#541722', '#36333B', '#FF5C48', '#A8361A', '#121014', '#FF5A1E', '#7A3A20', '#4A4140', '#FF6E30', '#80184B', '#1C1021', '#FF3A86', '#261C22', '#9C1C2A', '#FF3030'];
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const far = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!) as [number, number, number]);
    for (const hex of Object.values(RUN_DOT_HEX)) {
      expect([...ladder, ...hostile]).not.toContain(hex.toUpperCase());
      const [r, g, b] = rgb(hex);
      expect(r > g * 1.4 && r > b * 1.4, `${hex} reads red`).toBe(false);
      for (const other of ['#7CC2AE', '#83DDE2', ...ladder]) expect(far(hex, other), `${hex} vs ${other}`).toBeGreaterThan(40);
    }
    expect(Object.keys(RUN_WORD).sort()).toEqual(Object.keys(RUN_DOT_SHAPE).sort());
    expect(new Set(Object.values(RUN_DOT_SHAPE)).size).toBe(Object.keys(RUN_DOT_SHAPE).length); // a shape for every result
    expect(RUN_DOT_SHAPE.failed).not.toBe('full'); // failed is hollow
  });
});

// ---- Through the fake ADO, the client, the cache and the sync ----

const RANGE: [string, string] = ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'];
const AREA = 'Quillmoor\\Pod';
const world = (runs: Record<string, RunState> = { plates: 'partly' }) => {
  const b = scenario('repo-runs', { project: 'Quillmoor', tz: 'America/Los_Angeles', range: RANGE })
    .area('Quillmoor', 100).area(AREA, 101, { favorite: true, defaultScope: true })
    .repo('plates').repo('bare').repo('queue')
    .person('ada', 'Ada Quill')
    .at('2026-10-05T16:00:00Z').feature(1, 'Plates', { area: AREA, assignee: 'ada' })
    .at('2026-10-06T16:00:00Z').pr(7, { repo: 'plates', author: 'ada', title: 'In plates', links: [1] })
    .at('2026-10-06T16:10:00Z').pr(8, { repo: 'bare', author: 'ada', title: 'In bare', links: [1] })
    .at('2026-10-06T16:20:00Z').pr(9, { repo: 'queue', author: 'ada', title: 'In queue', links: [1] });
  b.at('2026-10-09T10:00:00Z');
  for (const [repo, state] of Object.entries(runs)) b.run(repo, state);
  return b.build();
};
const scope = { project: 'Quillmoor', area: AREA };
const runsOf = (h: Awaited<ReturnType<typeof ingest>>) => Object.fromEntries(h.entities.repos.map((r) => [r.name, r.run]));
const repoOf = (h: Awaited<ReturnType<typeof harness>>, name: string) => h.cache.repos(ORG).find((r) => r.name === name)!;
const builds = (h: Awaited<ReturnType<typeof harness>>) => h.transport.log.filter((r) => /\/_apis\/build\/builds/.test(r.url));
const failing = (re: RegExp, status: number) => (r: { url: string }) => (re.test(r.url) ? ({ status, headers: {}, body: { message: 'x' } } as AdoResponse) : undefined);
const T = Date.parse('2026-10-09T10:00:00Z');

describe('the sync reads and stores each station repo\'s latest run', () => {
  it('asks for the default branch of each repo with a PR, newest first, one row', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    const calls = builds(h);
    expect(calls).toHaveLength(3);
    const u = new URL(calls[0]!.url);
    expect(u.searchParams.get('branchName')).toBe('refs/heads/main');
    expect(u.searchParams.get('repositoryType')).toBe('TfsGit');
    expect(u.searchParams.get('$top')).toBe('1');
    expect(u.searchParams.get('queryOrder')).toBe('queueTimeDescending');
  });
  it('holds the run on the repo, none for a project without pipelines, and the bundle agrees (AC-27)', async () => {
    const s = world({ plates: 'partly', queue: 'queued' });
    const h = await harness(s);
    const out = await ingest(h, s, scope);
    expect(runsOf(out)).toEqual({ plates: { state: 'partly', at: T, readAt: h.clock() }, bare: undefined, queue: { state: 'queued', at: T, readAt: h.clock() } });
    expect(repoOf(h, 'bare').runReadAt).toBeDefined(); // read, and there is nothing: not asked again at once
    expect(repoOf(h, 'bare').run).toBeUndefined();
    expect(comparable(out)).toEqual(comparable(toHistory(s, mapping, scope)));
  });
  it('maps every result the fake can serve', async () => {
    const states: RunState[] = ['passed', 'partly', 'failed', 'canceled', 'running', 'queued'];
    for (const state of states) {
      const s = world({ plates: state });
      const h = await harness(s);
      expect(runsOf(await ingest(h, s, scope)).plates, state).toEqual({ state, at: T, readAt: h.clock() });
    }
  });
  it('is the same through the stream (AC-27)', async () => {
    const mech = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
    const h = await harness(sprintMechanics);
    const stream = new SprintStream({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(sprintMechanics, mech), { changed: () => {} });
    await stream.look(); await stream.fill();
    // Sprint-mechanics has no pipelines: every repo was read and has nothing.
    expect(h.cache.repos(ORG).filter((r) => r.runReadAt !== undefined).length).toBeGreaterThan(0);
    expect(h.cache.repos(ORG).every((r) => r.run === undefined)).toBe(true);
  });
});

describe('a failed or refused run call never fails a load and raises no banner (04 §6)', () => {
  for (const status of [403, 404]) {
    it(`a ${status} is a refusal for good: no line, remembered as read, no note, the rest of the sync intact`, async () => {
      const s = world();
      const base = await ingest(await harness(s), s, scope);
      const h = await harness(s);
      h.transport.intercept = failing(/\/_apis\/build\/builds/, status);
      const out = await ingest(h, s, scope);
      expect(runsOf(out)).toEqual({ plates: undefined, bare: undefined, queue: undefined });
      expect(repoOf(h, 'plates').runReadAt).toBeDefined();
      expect(out.entities.prs).toHaveLength(3);
      expect({ ...out.coverage, syncedAt: null }).toEqual({ ...base.coverage, syncedAt: null }); // no note, nothing partial or missing
    });
  }
  for (const status of [429, 500, 503, 0]) {
    it(`a ${status} is transient: it never fails the sync, stores nothing, and the next refresh tries again`, async () => {
      const s = world();
      const h = await harness(s);
      h.transport.intercept = failing(/\/_apis\/build\/builds/, status);
      const out = await ingest(h, s, scope);
      expect(runsOf(out).plates).toBeUndefined();
      expect(repoOf(h, 'plates').runReadAt).toBeUndefined(); // not even "read"
      h.transport.intercept = null;
      expect(runsOf(await ingest(h, s, scope)).plates).toMatchObject({ state: 'partly', at: T });
    });
  }
  it('a 401 is a missing Build scope, not a dead token: the sync passes, the repo is read with no run, and it backs off', async () => {
    const s = world();
    const base = await ingest(await harness(s), s, scope);
    const h = await harness(s);
    h.transport.intercept = failing(/\/_apis\/build\/builds/, 401);
    const out = await ingest(h, s, scope);
    expect(runsOf(out)).toEqual({ plates: undefined, bare: undefined, queue: undefined });
    expect({ ...out.coverage, syncedAt: null }).toEqual({ ...base.coverage, syncedAt: null });
    expect(h.cache.repos(ORG).every((r) => r.runReadAt !== undefined && r.run === undefined)).toBe(true);
    const n = builds(h).length;
    await syncScope({ client: h.client, cache: h.cache, mapping, clock: () => h.clock() + MIN }, syncScopeOf(s, scope), s.range);
    expect(builds(h)).toHaveLength(n); // backed off for the interval
    expect(refusesToken('builds', 401)).toBe(false);
    expect(refusesToken('review', 401)).toBe(true);
  });
  it('a 401 keeps the run read before (the Build scope was withdrawn): the read is stored only for the back-off', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    const before = h.cache.repos(ORG).map((r) => r.run);
    expect(before.some((r) => r)).toBe(true);
    h.transport.intercept = failing(/\/_apis\/build\/builds/, 401);
    await syncScope({ client: h.client, cache: h.cache, mapping, clock: () => h.clock() + RUN_REREAD_MS }, syncScopeOf(s, scope), s.range);
    expect(h.cache.repos(ORG).map((r) => r.run)).toEqual(before);
    expect(h.cache.repos(ORG).every((r) => r.runReadAt !== undefined && r.runReadAt >= h.clock() + RUN_REREAD_MS)).toBe(true);
  });
  for (const status of [400, 409]) {
    it(`a ${status} on builds is stored as no run and fails nothing`, async () => {
      const s = world();
      const h = await harness(s);
      h.transport.intercept = failing(/\/_apis\/build\/builds/, status);
      expect(runsOf(await ingest(h, s, scope)).plates).toBeUndefined();
      expect(repoOf(h, 'plates').runReadAt).toBeDefined();
    });
  }
  it('a level load: a 401 only leaves the line out, and the other reads go on', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    h.cache.db.exec('UPDATE repositories SET run_json = NULL');
    h.transport.intercept = failing(/\/_apis\/build\/builds/, 401);
    await loadLevel({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(s, scope), s.range, { kind: 'feature', featureId: 1 });
    await settleStats();
    expect(builds(h).length).toBeGreaterThanOrEqual(3); // all three repos were asked: no stop
    expect(h.cache.repos(ORG).every((r) => r.runReadAt !== undefined && r.run === undefined)).toBe(true);
    h.transport.intercept = failing(/\/_apis\/build\/builds/, 403);
    h.cache.db.exec('UPDATE repositories SET run_json = NULL');
    await loadLevel({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(s, scope), s.range, { kind: 'feature', featureId: 1 });
    await settleStats();
    expect(h.cache.repos(ORG).every((r) => r.runReadAt !== undefined && r.run === undefined)).toBe(true);
  });
  it('the stream: a 401 on builds never refuses the token', async () => {
    const mech = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
    const h = await harness(sprintMechanics);
    h.transport.intercept = failing(/\/_apis\/build\/builds/, 401);
    let refused = 0;
    const stream = new SprintStream({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(sprintMechanics, mech), { changed: () => {}, refused: () => { refused++; } });
    await stream.look(); await stream.fill();
    expect(refused).toBe(0);
    expect(h.cache.repos(ORG).filter((r) => r.runReadAt !== undefined).length).toBeGreaterThan(0);
  });
  it('the probe says the Build scope is needed on a 401 as on a 403', async () => {
    for (const status of [401, 403]) {
      const h = await harness(world());
      h.transport.intercept = failing(/\/build\/builds/, status);
      const m = await runProbe(h.client, mapping, h.clock);
      expect(m.rows.find((r) => r.family === 'builds')!.note).toMatch(/Build \(read\)/);
    }
  });
});

describe('the run is re-read on the PR cadence, never faster than the interval (15 §6 run-line)', () => {
  const syncAt = async (h: Awaited<ReturnType<typeof harness>>, s: ReturnType<typeof world>, now: number) =>
    syncScope({ client: h.client, cache: h.cache, mapping, clock: () => now }, syncScopeOf(s, scope), s.range);
  it('reads once, skips a refresh inside the interval, reads again after it', async () => {
    const s = world();
    const h = await harness(s);
    await syncAt(h, s, T);
    expect(builds(h)).toHaveLength(3);
    await syncAt(h, s, T + 5 * MIN);
    expect(builds(h)).toHaveLength(3); // nothing could have changed enough to ask again
    await syncAt(h, s, T + RUN_REREAD_MS);
    expect(builds(h)).toHaveLength(6);
  });
  it('runDue: needs a default branch, and is due when never read, old enough, or read in the future', () => {
    const repo = { projectId: 'p', repoId: 'r', name: 'n', adoUrl: '', defaultBranch: 'refs/heads/main' };
    expect(runDue(repo, T)).toBe(true);
    expect(runDue({ ...repo, runReadAt: T }, T + RUN_REREAD_MS - 1)).toBe(false);
    expect(runDue({ ...repo, runReadAt: T }, T + RUN_REREAD_MS)).toBe(true);
    expect(runDue({ ...repo, runReadAt: T + HOUR }, T)).toBe(true);
    expect(runDue({ ...repo, defaultBranch: undefined }, T)).toBe(false);
  });
  it('re-listing the repositories never loses the run', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    h.cache.putRepos(ORG, h.cache.repos(ORG).map(({ run: _r, runReadAt: _t, ...r }) => r), T);
    expect(repoOf(h, 'plates').run).toMatchObject({ state: 'partly', at: T });
    expect(repoOf(h, 'plates').defaultBranch).toBe('refs/heads/main');
  });
});

describe('the deferred and throttled run reads', () => {
  it('a level load reads the runs after it returns, never before', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    h.cache.db.exec('UPDATE repositories SET run_json = NULL');
    h.transport.log.length = 0;
    let atDone = -1;
    const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock, progress: (p: { phase: string }) => { if (p.phase === 'done') atDone = builds(h).length; } };
    await loadLevel(ctx, syncScopeOf(s, scope), s.range, { kind: 'feature', featureId: 1 });
    expect(atDone).toBe(0);
    await settleStats();
    expect(repoOf(h, 'plates').run).toMatchObject({ state: 'partly', at: T });
  });
  it('waits for the throttle gate, and stops when aborted', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    h.cache.db.exec('UPDATE repositories SET run_json = NULL');
    throttleGate.until = Date.now() + 250;
    const t0 = Date.now();
    await loadLevel({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(s, scope), s.range, { kind: 'feature', featureId: 1 });
    await settleStats();
    throttleGate.until = 0;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(240);
    expect(repoOf(h, 'plates').runReadAt).toBeDefined();
    h.cache.db.exec('UPDATE repositories SET run_json = NULL');
    const ac = new AbortController();
    ac.abort();
    h.transport.log.length = 0;
    await loadLevel({ client: h.client, cache: h.cache, mapping, clock: h.clock, signal: ac.signal }, syncScopeOf(s, scope), s.range, { kind: 'feature', featureId: 1 }).catch(() => undefined);
    await settleStats();
    expect(builds(h)).toHaveLength(0);
  });
  it('the stream tells the view when a station\'s run lands', async () => {
    const mech = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
    const h = await harness(sprintMechanics);
    const changed: number[][] = [];
    const stream = new SprintStream({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(sprintMechanics, mech), { changed: (ids) => { changed.push(ids as number[]); } });
    await stream.look();
    const before = changed.length;
    await stream.fill();
    expect(changed.length).toBeGreaterThan(before);
  });
});

// B5: scale-up ingestion through the project-wide revisions feed (04 §5c). Equivalence with the per-item path (AC-27 style),
// paging and resume, the page cap, abort, the throttle gate, the failure rules and the threshold. Invented data only (INV-18).
import { describe, expect, it, vi } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { scenarioScopes, sprintScopes, toHistory } from '@fixtures/dsl';
import busyWeek from '@fixtures/scenarios/busy-week';
import { loadHistory, scopeKeyOf, syncScope, type SyncContext } from '../../src/main/sync/sync';
import { feedHistory, feedKey, feedWindowFrom } from '../../src/main/sync/feed';
import { throttleGate } from '../../src/main/sync/scheduler';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { FEED_THRESHOLD } from '@shared/feed';
import { comparable, harness, readTeamBoards, syncScopeOf, type Harness } from '../golden/ingest';
import { mapping } from '../golden/helpers';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import type { AdoResponse } from '@shared/contracts/transport';
import type { FakeOptions } from '@fixtures/ado';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

const feedCalls = (h: Harness) => h.transport.log.filter((r) => r.url.includes('/reporting/workitemrevisions'));
const historyCalls = (h: Harness) => h.transport.log.filter((r) => /\/workItems\/\d+\/(revisions|updates)/.test(r.url));

async function run(h: Harness, s: Parameters<typeof syncScopeOf>[0], scope: Parameters<typeof syncScopeOf>[1], extra: Partial<SyncContext> = {}, range = s.range) {
  const sc = syncScopeOf(s, scope);
  await readTeamBoards(h, sc);
  const ctx: SyncContext = { client: h.client, cache: h.cache, mapping, clock: h.clock, scale: { threshold: 1, windowFrom: 0, maxPages: 10_000 }, ...extra };
  await syncScope(ctx, sc, range);
  return loadHistory(ctx, sc, range);
}

describe('B5 equivalence: the feed gives the bundle the per-item path gives', () => {
  const cases = scenarios.flatMap((s) => scenarioScopes(s, mapping).map((scope) => ({ s, scope, name: `${s.name} · ${'area' in scope ? scope.area : `Epic ${scope.epic}`}` })));
  it.each(cases)('$name', async ({ s, scope }) => {
    const h = await harness(s, undefined, { feedPage: 7 });
    const got = await run(h, s, scope);
    if (got.entities.workItems.length) expect(feedCalls(h).length).toBeGreaterThan(0);
    expect(comparable(got)).toEqual(comparable(toHistory(s, mapping, scope)));
  });
  const sprints = scenarios.flatMap((s) => sprintScopes(s).map((scope) => ({ s, scope, name: `${s.name} · ${scope.sprint}` })));
  it.each(sprints)('$name', async ({ s, scope }) => {
    const want = toHistory(s, mapping, scope);
    const h = await harness(s, undefined, { feedPage: 7 });
    expect(comparable(await run(h, s, scope, {}, want.range))).toEqual(comparable(want));
  });
});

const area = () => scenarioScopes(busyWeek, mapping).find((x) => 'area' in x)!;

describe('B5 the threshold', () => {
  it('is a 15 row at 300', () => { expect(FEED_THRESHOLD).toBe(300); });
  it('below it reads per item and never calls the feed', async () => {
    const h = await harness(busyWeek);
    await run(h, busyWeek, area(), { scale: { threshold: 100_000 } });
    expect(feedCalls(h)).toHaveLength(0);
    expect(historyCalls(h).length).toBeGreaterThan(0);
  });
  it('above it reads the feed, and only the updates per item (no revisions calls)', async () => {
    const h = await harness(busyWeek);
    await run(h, busyWeek, area());
    expect(feedCalls(h).length).toBeGreaterThan(0);
    expect(historyCalls(h).some((r) => r.url.includes('/revisions'))).toBe(false);
  });
  it('a refresh with nothing new reads no per-item history at all', async () => {
    const h = await harness(busyWeek);
    await run(h, busyWeek, area());
    h.transport.log.length = 0;
    await run(h, busyWeek, area());
    expect(feedCalls(h).length).toBeGreaterThan(0);
    expect(historyCalls(h)).toHaveLength(0);
  });
  it('an item the checkpoints hold is then ignored by the per-item path (its checkpoint moved)', async () => {
    const h = await harness(busyWeek);
    await run(h, busyWeek, area());
    h.transport.log.length = 0;
    await run(h, busyWeek, area(), { scale: { threshold: 100_000 } });
    const calls = historyCalls(h);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((r) => /skip=/i.test(decodeURIComponent(r.url)))).toBe(true);
  });
});

const capped = (maxPages: number): Partial<SyncContext> => ({ scale: { threshold: 1, windowFrom: 0, maxPages } });
const covOf = (h: Harness, s: Parameters<typeof syncScopeOf>[0], scope: Parameters<typeof syncScopeOf>[1]) => {
  const sc = syncScopeOf(s, scope);
  return h.cache.scopeCheckpoint(sc.org, `${sc.project.projectId}|area|${(sc.target as { nodeId: number }).nodeId}`)?.coverage;
};

describe('B5 paging, the cap and resume', () => {
  it('converges under a small page budget with no uncapped final run, reading at most the budget a run across all its batches', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 5 });
    let runs = 0;
    for (; runs < 80; runs++) {
      const before = feedCalls(h).length;
      await run(h, busyWeek, area(), capped(3));
      expect(feedCalls(h).length - before).toBeLessThanOrEqual(3);
      if (!covOf(h, busyWeek, area())?.partial) break;
    }
    expect(runs).toBeGreaterThan(1); // it really was capped
    expect(runs).toBeLessThan(80);   // and it converged
    expect(h.cache.setting(feedKey(syncScopeOf(busyWeek, area())))).toBeNull();
    const got = loadHistory({ cache: h.cache, mapping, clock: h.clock }, syncScopeOf(busyWeek, area()), busyWeek.range);
    expect(comparable(got)).toEqual(comparable(toHistory(busyWeek, mapping, area())));
  });
  it('a resumed run starts from the saved token, not from the start date', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 5 });
    await run(h, busyWeek, area(), capped(2));
    expect(feedCalls(h).every((r) => !r.url.includes('continuationToken') || r.url.includes('startDateTime') === false)).toBe(true);
    const mark = feedCalls(h).length;
    await run(h, busyWeek, area(), capped(2));
    const second = feedCalls(h).slice(mark);
    expect(second.length).toBeGreaterThan(0);
    expect(second[0]!.url).toContain('continuationToken');
    expect(second[0]!.url).not.toContain('startDateTime');
  });
  it('a capped run says so in coverage, and the note goes when it converges', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 5 });
    await run(h, busyWeek, area(), capped(1));
    expect(covOf(h, busyWeek, area())?.partial).toBe(true);
    expect(covOf(h, busyWeek, area())?.notes.some((n) => /revision feed/.test(n))).toBe(true);
    for (let i = 0; i < 600 && covOf(h, busyWeek, area())?.partial; i++) await run(h, busyWeek, area(), capped(1));
    expect(covOf(h, busyWeek, area())?.partial).toBe(false);
    expect(covOf(h, busyWeek, area())?.notes.some((n) => /revision feed/.test(n))).toBe(false);
  });
  it('resumes by its token alone when the start date is after 1970 (the fake carries the position in the token)', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 4 });
    const from = busyWeek.range.startUtc;
    await run(h, busyWeek, area(), { scale: { threshold: 1, windowFrom: from, maxPages: 1 } });
    for (let i = 0; i < 600 && covOf(h, busyWeek, area())?.partial; i++) await run(h, busyWeek, area(), { scale: { threshold: 1, windowFrom: from, maxPages: 1 } });
    expect(covOf(h, busyWeek, area())?.partial).toBe(false);
    const rows = (token: string) => h.fake.handle({ method: 'GET', url: `https://dev.azure.com/fixture-org/${encodeURIComponent(busyWeek.projects[0]!.name)}/_apis/wit/reporting/workitemrevisions?${token}` } as never);
    const first = (await rows(`startDateTime=${new Date(from).toISOString()}`) as { body: { values: { id: number; rev: number }[]; continuationToken: string } }).body;
    const next = (await rows(`continuationToken=${encodeURIComponent(first.continuationToken)}`) as { body: { values: { id: number; rev: number }[] } }).body;
    const key = (v: { id: number; rev: number }) => `${v.id}:${v.rev}`;
    expect(first.values.length).toBeGreaterThan(0);
    expect(next.values.some((v) => first.values.map(key).includes(key(v)))).toBe(false);
  });
  it('abort stops the crawl', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 5 });
    const ac = new AbortController();
    h.transport.intercept = () => { ac.abort(new Error('Cancelled')); return undefined; };
    await expect(run(h, busyWeek, area(), { signal: ac.signal })).rejects.toThrow();
    h.transport.intercept = null;
    expect(feedCalls(h).length).toBeLessThanOrEqual(2);
  });
  it('waits for the throttle gate before each page', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 5 });
    throttleGate.until = Date.now() + 60;
    const t0 = Date.now();
    try { await run(h, busyWeek, area()); } finally { throttleGate.until = 0; }
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
  });
  it('a stale token (the feed answers 400) self-heals: the crawl restarts, no per-item fallback', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 5 });
    await run(h, busyWeek, area(), capped(1));
    const sc = syncScopeOf(busyWeek, area());
    const saved = h.cache.setting<{ token: string }>(feedKey(sc))!;
    expect(saved?.token).toBeTruthy();
    h.cache.setSetting(feedKey(sc), { ...saved, token: 'bm90LWEtdG9rZW4=' });
    h.transport.log.length = 0;
    await run(h, busyWeek, area());
    expect(feedCalls(h).some((r) => r.url.includes('startDateTime'))).toBe(true);
    expect(historyCalls(h).some((r) => r.url.includes('/revisions'))).toBe(false);
    expect(comparable(loadHistory({ cache: h.cache, mapping, clock: h.clock }, sc, busyWeek.range))).toEqual(comparable(toHistory(busyWeek, mapping, area())));
  });
  it('the checkpoint is server time (the newest ChangedDate the crawl saw), not the local clock', async () => {
    const h = await harness(busyWeek);
    await run(h, busyWeek, area(), { clock: () => h.fake.now + 40 * 86_400_000 });
    const sc = syncScopeOf(busyWeek, area());
    const members = h.cache.scopeMembers(sc.org, `${sc.project.projectId}|area|${(sc.target as { nodeId: number }).nodeId}`);
    const at = [...h.cache.checkpointRows(sc.org, members).values()].map((c) => c.at);
    expect(at.length).toBeGreaterThan(0);
    expect(Math.max(...at)).toBeLessThanOrEqual(h.fake.now);
  });
});

describe('B5 failures', () => {
  const fail = (status: number): (() => AdoResponse | undefined) => () => ({ status, headers: {}, body: { message: 'x' } });
  const onlyFeed = (h: Harness, status: number) => { h.transport.intercept = (req) => (req.url.includes('/reporting/') ? fail(status)() : undefined); };
  it('a 401 is a dead token and fails the sync', async () => {
    const h = await harness(busyWeek);
    onlyFeed(h, 401);
    await expect(run(h, busyWeek, area())).rejects.toMatchObject({ status: 401 });
  });
  it.each([429, 500, 503, 0])('a transient %i never fails the sync; the scope is partial and the crawl retries later', async (status) => {
    const h = await harness(busyWeek);
    onlyFeed(h, status);
    await run(h, busyWeek, area());
    const sc = syncScopeOf(busyWeek, area());
    const cov = h.cache.scopeCheckpoint(sc.org, `${sc.project.projectId}|area|${(sc.target as { nodeId: number }).nodeId}`);
    expect(cov?.lastError).toBeNull();
    expect(cov?.coverage?.partial).toBe(true);
    h.transport.intercept = null;
    const got = await run(h, busyWeek, area());
    expect(comparable(got)).toEqual(comparable(toHistory(busyWeek, mapping, area())));
  });
  it.each([403, 404])('a %i (no feed) falls back to per-item reads, same bundle', async (status) => {
    const h = await harness(busyWeek, undefined, status === 404 ? { noFeed: true } as FakeOptions : {});
    if (status === 403) onlyFeed(h, 403);
    const got = await run(h, busyWeek, area());
    expect(comparable(got)).toEqual(comparable(toHistory(busyWeek, mapping, area())));
    expect(historyCalls(h).some((r) => r.url.includes('/revisions'))).toBe(true);
  });
});

describe('B5 the window and the seed', () => {
  it('an item the window shows nothing of is seeded from its current fields, with no per-item history calls', async () => {
    const h = await harness(busyWeek);
    // A window that starts after everything: the feed answers nothing, every item is seeded.
    await run(h, busyWeek, area(), { scale: { threshold: 1, windowFrom: h.fake.now + 1000 } });
    expect(historyCalls(h)).toHaveLength(0);
    const sc = syncScopeOf(busyWeek, area());
    const members = h.cache.scopeMembers(sc.org, `${sc.project.projectId}|area|${(sc.target as { nodeId: number }).nodeId}`);
    expect(members.length).toBeGreaterThan(0);
    for (const [, revs] of h.cache.revisions(sc.org, members)) expect(revs).toHaveLength(1);
  });
});

describe('B5 the sprint stream', () => {
  it('reads a pod through the feed, with the same cache a stream without it ends with', async () => {
    const scope = (await import('@fixtures/dsl')).sprintScopes(sprintMechanics)[0]!;
    const sc = syncScopeOf(sprintMechanics, scope);
    const cacheOf = async (scale?: SyncContext['scale']) => {
      const h = await harness(sprintMechanics, undefined, { feedPage: 6 });
      const ctx: SyncContext = { client: h.client, cache: h.cache, mapping, clock: h.clock, ...(scale ? { scale } : {}) };
      await readTeamBoards(h, sc);
      const stream = new SprintStream(ctx, sc, { changed: () => undefined });
      await stream.look();
      await stream.fill();
      stream.close();
      return { h, ctx };
    };
    const a = await cacheOf({ threshold: 1, windowFrom: 0 });
    const b = await cacheOf();
    expect(feedCalls(a.h).length).toBeGreaterThan(0);
    expect(feedCalls(b.h)).toHaveLength(0);
    const range = { startUtc: (sc.target as { startUtc: number }).startUtc, endUtc: (sc.target as { finishUtc: number }).finishUtc };
    expect(comparable(loadHistory(a.ctx, sc, range))).toEqual(comparable(loadHistory(b.ctx, sc, range)));
  });
});

describe('B5 the production window (no windowFrom): the played range is covered, and what differs is exactly the seeded items', () => {
  const windowFrom = (s: { range: { startUtc: number; endUtc: number } }) => feedWindowFrom({}, s.range);
  /** Events from the window on are equal; before it, seeded items (one lossy revision, links undated) may differ. */
  const norm = (h: ReturnType<typeof comparable>, from: number) => {
    const o = h as { events: { occurredAt: number }[]; observations: unknown[] } & Record<string, unknown>;
    return { ...o, events: o.events.filter((e) => e.occurredAt >= from), observations: [] };
  };
  const cases = scenarios.flatMap((s) => scenarioScopes(s, mapping).map((scope) => ({ s, scope, name: `${s.name} · ${'area' in scope ? scope.area : `Epic ${scope.epic}`}` })));
  it.each(cases)('$name', async ({ s, scope }) => {
    const h = await harness(s, undefined, { feedPage: 7 });
    const got = await run(h, s, scope, { scale: { threshold: 1, maxPages: 100_000 } });
    const want = toHistory(s, mapping, scope);
    const seeds = (h.cache as unknown as { all: (q: string) => { n: number }[] }).all("SELECT COUNT(*) n FROM wi_revisions WHERE fact_json LIKE '%\"seed\":true%'")[0]!.n;
    if (seeds === 0) expect(comparable(got)).toEqual(comparable(want));
    else expect(norm(comparable(got), windowFrom(s))).toEqual(norm(comparable(want), windowFrom(s)));
  });
  it('a seeded item has a checkpoint at the crawl mark, and a per-item read replaces it with the true history', async () => {
    const h = await harness(busyWeek);
    await run(h, busyWeek, area(), { scale: { threshold: 1, windowFrom: h.fake.now + 1000, maxPages: 100 } });
    const sc = syncScopeOf(busyWeek, area());
    const members = h.cache.scopeMembers(sc.org, `${sc.project.projectId}|area|${(sc.target as { nodeId: number }).nodeId}`);
    expect(h.cache.checkpointRows(sc.org, members).size).toBe(members.length);
    for (const [, revs] of h.cache.revisions(sc.org, members)) expect(revs.every((r) => r.seed)).toBe(true);
    for (const id of members) expect(h.cache.checkpoint(sc.org, id)).toEqual({ revisions: 0, updates: 0 }); // per-item paths see no history
    await run(h, busyWeek, area(), { scale: { threshold: 100_000 } }); // the per-item path reads them whole
    for (const [, revs] of h.cache.revisions(sc.org, members)) expect(revs.some((r) => r.seed)).toBe(false);
    expect(comparable(loadHistory({ cache: h.cache, mapping, clock: h.clock }, sc, busyWeek.range))).toEqual(comparable(toHistory(busyWeek, mapping, area())));
  });
});

describe('B5 the sprint stream at the production window', () => {
  const sprints = scenarios.flatMap((s) => sprintScopes(s).map((scope) => ({ s, scope, name: `${s.name} · ${scope.sprint}` })));
  it.each(sprints)('$name', async ({ s, scope }) => {
    const sc = syncScopeOf(s, scope);
    const t = sc.target as { startUtc: number; finishUtc: number };
    const open = async (scale?: SyncContext['scale']) => {
      const h = await harness(s, undefined, { feedPage: 6 });
      const ctx: SyncContext = { client: h.client, cache: h.cache, mapping, clock: h.clock, ...(scale ? { scale } : {}) };
      await readTeamBoards(h, sc);
      const st = new SprintStream(ctx, sc, { changed: () => undefined });
      await st.look(); await st.fill(); st.close();
      return { h, ctx };
    };
    const a = await open({ threshold: 1, maxPages: 100_000 });
    const b = await open();
    const range = { startUtc: t.startUtc, endUtc: t.finishUtc };
    const from = feedWindowFrom({}, { startUtc: t.startUtc, endUtc: Math.min(t.finishUtc, a.h.fake.now) });
    const seeds = (a.h.cache as unknown as { all: (q: string) => { n: number }[] }).all("SELECT COUNT(*) n FROM wi_revisions WHERE fact_json LIKE '%\"seed\":true%'")[0]!.n;
    const A = comparable(loadHistory(a.ctx, sc, range)) as { events: { occurredAt: number }[] };
    const B = comparable(loadHistory(b.ctx, sc, range)) as { events: { occurredAt: number }[] };
    if (seeds === 0) expect(A).toEqual(B);
    else expect({ ...A, events: A.events.filter((e) => e.occurredAt >= from), observations: [] }).toEqual({ ...B, events: B.events.filter((e) => e.occurredAt >= from), observations: [] });
  });
  it('a capped feed task still reads catch-up items per item, and the next run finishes the rest', async () => {
    const scope = sprintScopes(sprintMechanics)[0]!;
    const sc = syncScopeOf(sprintMechanics, scope);
    const h = await harness(sprintMechanics, undefined, { feedPage: 20 });
    await readTeamBoards(h, sc);
    const ctx: SyncContext = { client: h.client, cache: h.cache, mapping, clock: h.clock, scale: { threshold: 1, windowFrom: 0, maxPages: 2 } }; // the crawl is one (not one per pod), so it needs a budget under its 4 pages to cap
    const st = new SprintStream(ctx, sc, { changed: () => undefined });
    await st.look(); await st.fill();
    const first = feedCalls(h).length;
    expect(first).toBeLessThanOrEqual(2);
    const partial = () => h.cache.scopeCheckpoint(sc.org, scopeKeyOf(sc))?.coverage?.partial ?? false;
    let runs = 0;
    for (; runs < 100 && partial(); runs++) { await st.refresh(); await st.fill(); }
    if (runs >= 100) throw new Error(JSON.stringify(h.cache.scopeCheckpoint(sc.org, scopeKeyOf(sc))?.coverage) + ' feed=' + feedCalls(h).length + ' ' + JSON.stringify(h.cache.setting(`feed2:${sc.org}:${scopeKeyOf(sc)}`)));
    expect(runs).toBeGreaterThan(0);
    expect(partial()).toBe(false);
    st.close();
  });
});

describe('B5 round 3: one crawl per run, capped convergence with seeds, incremental refresh, a stable window', () => {
  // Orbit-week's Tide Team (601 and 702 are older than the window and seeded) with story 701 retitled eight times inside it, so the
  // feed has several pages at the production window.
  const tide = () => {
    const base = scenarios.find((x) => x.name === 'orbit-week')!;
    const s = { ...base, ops: [...base.ops, ...Array.from({ length: 8 }, (_, i) => ({ t: Date.UTC(2026, 8, 10 + i, 12), op: 'title' as const, id: 701, to: `Auto-route claims, take ${i + 2}` }))] };
    return { s, scope: scenarioScopes(s, mapping).find((x) => 'area' in x && x.area.endsWith('Tide Team'))! };
  };
  const items = (h: Harness, s: Parameters<typeof syncScopeOf>[0], scope: Parameters<typeof syncScopeOf>[1]) =>
    loadHistory({ cache: h.cache, mapping, clock: h.clock }, syncScopeOf(s, scope), s.range).entities.workItems.length;
  const partialOf = (h: Harness, s: Parameters<typeof syncScopeOf>[0], scope: Parameters<typeof syncScopeOf>[1]) =>
    h.cache.scopeCheckpoint(syncScopeOf(s, scope).org, scopeKeyOf(syncScopeOf(s, scope)))?.coverage?.partial;

  it.each([1, 3])('converges at the production window with seeds, %i page(s) a run, a fresh context each run, never emptier', async (maxPages) => {
    const { s, scope } = tide();
    const h = await harness(s, undefined, { feedPage: 1 });
    let last = 0;
    let runs = 0;
    for (; runs < 200; runs++) {
      const before = feedCalls(h).length;
      await run(h, s, scope, { scale: { threshold: 1, maxPages } }); // a fresh context, no windowFrom: the production window
      expect(feedCalls(h).length - before).toBeLessThanOrEqual(maxPages);
      const n = items(h, s, scope);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
      if (!partialOf(h, s, scope)) break;
    }
    expect(runs).toBeGreaterThan(0);
    expect(runs).toBeLessThan(200);
    expect(h.cache.setting(feedKey(syncScopeOf(s, scope)))).toBeNull();
    expect(last).toBeGreaterThan(0);
    const seeds = (h.cache as unknown as { all: (q: string) => { n: number }[] }).all("SELECT COUNT(*) n FROM wi_revisions WHERE fact_json LIKE '%\"seed\":true%'")[0]!.n;
    expect(seeds).toBeGreaterThan(0); // 601 and 702
    const from = feedWindowFrom({}, s.range);
    const norm = (x: ReturnType<typeof comparable>) => { const o = x as { events: { occurredAt: number }[] } & Record<string, unknown>; return { ...o, events: o.events.filter((e) => e.occurredAt >= from), observations: [] }; };
    expect(norm(comparable(loadHistory({ cache: h.cache, mapping, clock: h.clock }, syncScopeOf(s, scope), s.range)))).toEqual(norm(comparable(toHistory(s, mapping, scope))));
  });

  it('an incremental refresh after convergence crawls only from the checkpoint, seeds included, and never moves a watermark back', async () => {
    const { s, scope } = tide();
    const h = await harness(s, undefined, { feedPage: 3 });
    const sc = syncScopeOf(s, scope);
    await run(h, s, scope, { scale: { threshold: 1, maxPages: 10_000 } });
    const firstPages = feedCalls(h).length;
    const members = h.cache.scopeMembers(sc.org, scopeKeyOf(sc));
    const before = h.cache.checkpointRows(sc.org, members);
    expect(before.size).toBe(members.length); // seeds have checkpoints too
    h.transport.log.length = 0;
    await run(h, s, scope, { scale: { threshold: 1, maxPages: 10_000 } });
    const calls = feedCalls(h);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThan(firstPages);
    const start = Date.parse(new URL(calls[0]!.url).searchParams.get('startDateTime')!);
    const oldest = Math.min(...[...before.values()].map((c) => c.at));
    expect(start).toBe(Math.max(0, oldest - 3_600_000)); // from the oldest checkpoint, not the window
    expect(historyCalls(h)).toHaveLength(0);
    for (const [id, c] of h.cache.checkpointRows(sc.org, members)) expect(c.at).toBeGreaterThanOrEqual(before.get(id)!.at);
  });

  it('one crawl per run: a multi-wave full sync starts the feed once and makes no more calls than the crawl has pages', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 4 });
    const probe = await harness(busyWeek, undefined, { feedPage: 4 });
    const tokens = (x: Harness) => feedCalls(x).map((r) => new URL(r.url).searchParams);
    await run(h, busyWeek, area(), { scale: { threshold: 1, maxPages: 10_000 } });
    expect(tokens(h).filter((q) => q.has('startDateTime'))).toHaveLength(1);
    // The same project crawled once by hand, from the same start: that is how many pages one crawl has.
    let pages = 0;
    for (let token = ''; ; pages++) {
      const r = probe.fake.handle({ method: 'GET', url: `https://dev.azure.com/fixture-org/${encodeURIComponent(busyWeek.projects[0]!.name)}/_apis/wit/reporting/workitemrevisions?${token ? `continuationToken=${encodeURIComponent(token)}` : `startDateTime=${new Date(0).toISOString()}`}` } as never) as { body: { continuationToken: string; isLastBatch: boolean } };
      if (r.body.isLastBatch) { pages++; break; }
      token = r.body.continuationToken;
    }
    expect(feedCalls(h).length).toBe(pages);
  });

  it('the window is the start of its UTC day, so a clock moving within a day does not move it', () => {
    const base = { startUtc: 0, endUtc: Date.UTC(2026, 8, 21, 10, 0) };
    const a = feedWindowFrom({}, { ...base, startUtc: undefined });
    const b = feedWindowFrom({}, { ...base, endUtc: base.endUtc + 600_000, startUtc: undefined });
    expect(a).toBe(b);
    expect(a % 86_400_000).toBe(0);
  });

  it('the stream resumes its saved token as its clock moves 10 minutes a run', async () => {
    const s = scenarios.find((x) => x.name === 'sprint-pods')!;
    const scope = sprintScopes(s).find((x) => x.sprint.endsWith('41'))!;
    const sc = syncScopeOf(s, scope);
    const t = sc.target as { finishUtc: number };
    const h = await harness(s, undefined, { feedPage: 50 });
    await readTeamBoards(h, sc);
    let now = Math.min(h.fake.now, t.finishUtc - 3 * 86_400_000);
    let resumed = 0;
    let seen = 0;
    for (let i = 0; i < 8; i++) {
      now += 600_000;
      const ctx: SyncContext = { client: h.client, cache: h.cache, mapping, clock: () => now, scale: { threshold: 1, maxPages: 3 } };
      h.transport.log.length = 0;
      const st = new SprintStream(ctx, sc, { changed: () => undefined });
      await st.look(); await st.fill(); st.close();
      const calls = feedCalls(h);
      if (i > 0 && h.cache.scopeCheckpoint(sc.org, scopeKeyOf(sc))?.coverage?.partial !== undefined && calls.length) { seen++; if (new URL(calls[0]!.url).searchParams.has('continuationToken')) resumed++; }
    }
    expect(seen).toBeGreaterThan(0);
    expect(resumed).toBeGreaterThan(0);
  });
});

describe('B audit: the feed against old history, failures beside the crawl, one crawl in flight', () => {
  const sql = (h: Harness, q: string) => (h.cache as unknown as { run: (q: string) => void }).run(q);
  const membersOf = (h: Harness) => { const sc = syncScopeOf(busyWeek, area()); return { sc, ids: h.cache.scopeMembers(sc.org, scopeKeyOf(sc)) }; };
  const fail = (status: number): AdoResponse => ({ status, headers: {}, body: { message: 'x' } });

  it('an item with stored revisions and no checkpoint (migration 007) is read whole, per item: no gap, equal to the per-item bundle', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 7 });
    await run(h, busyWeek, area(), { scale: { threshold: 100_000 } }); // whole histories, as before 007
    sql(h, 'DELETE FROM item_checkpoints');
    sql(h, 'DELETE FROM wi_revisions WHERE rev > 2'); // old history, cut short: revs 1..2 with no checkpoint
    h.transport.log.length = 0;
    // A window that starts mid-range: the feed alone would append only the later rows and leave a gap after rev 2.
    const midway = busyWeek.range.startUtc + 3 * 86_400_000;
    const got = await run(h, busyWeek, area(), { scale: { threshold: 1, windowFrom: midway, maxPages: 10_000 } });
    expect(historyCalls(h).some((r) => r.url.includes('/revisions'))).toBe(true);
    expect(comparable(got)).toEqual(comparable(toHistory(busyWeek, mapping, area())));
    const { sc, ids } = membersOf(h);
    for (const [, revs] of h.cache.revisions(sc.org, ids)) revs.forEach((r, i) => expect(r.rev).toBe(i + 1)); // no gap
  });

  it('a seed fetch that fails with a blip counts the crawl as capped (the items wait); a 403 sends them per item', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 7 });
    const late = { scale: { threshold: 1, windowFrom: h.fake.now + 1000, maxPages: 10_000 } };
    h.transport.intercept = (req) => (req.url.includes('workitemsbatch') && (req.body as { fields?: unknown })?.fields && !(req.body as { $expand?: unknown }).$expand ? fail(503) : undefined);
    await run(h, busyWeek, area(), late);
    const sc = syncScopeOf(busyWeek, area());
    const cov = h.cache.scopeCheckpoint(sc.org, scopeKeyOf(sc))?.coverage;
    expect(cov?.partial).toBe(true);
    expect(cov?.notes.some((n) => n.includes('revision feed'))).toBe(true);
    h.transport.intercept = null;
    const again = await run(h, busyWeek, area());
    expect(comparable(again)).toEqual(comparable(toHistory(busyWeek, mapping, area())));

    const h2 = await harness(busyWeek, undefined, { feedPage: 7 });
    h2.transport.intercept = (req) => (req.url.includes('workitemsbatch') && (req.body as { fields?: unknown })?.fields && !(req.body as { $expand?: unknown }).$expand ? fail(403) : undefined);
    const got = await run(h2, busyWeek, area(), { scale: { threshold: 1, windowFrom: h2.fake.now + 1000, maxPages: 10_000 } });
    expect(historyCalls(h2).some((r) => r.url.includes('/revisions'))).toBe(true);
    expect(comparable(got)).toEqual(comparable(toHistory(busyWeek, mapping, area())));
  });

  it('a blip on an update read goes to `failed`, not `onGone`', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 7 });
    await run(h, busyWeek, area(), { scale: { threshold: 100_000 } });
    const { sc, ids } = membersOf(h);
    sql(h, 'DELETE FROM item_checkpoints'); sql(h, 'DELETE FROM wi_revisions'); sql(h, 'DELETE FROM wi_updates');
    h.transport.intercept = (req) => (/\/updates/.test(req.url) ? fail(503) : undefined);
    const failed: number[] = []; const gone: number[] = [];
    const ctx: SyncContext = { client: h.client, cache: h.cache, mapping, clock: h.clock, scale: { threshold: 1, windowFrom: 0, maxPages: 10_000 } };
    const res = await feedHistory(ctx, sc, ids, () => {}, (id) => gone.push(id), { startUtc: busyWeek.range.startUtc, endUtc: busyWeek.range.endUtc }, (id) => failed.push(id));
    expect(failed.length).toBeGreaterThan(0);
    expect(gone).toEqual([]);
    expect(res.served.some((id) => failed.includes(id))).toBe(false);
  });

  it('two batches at once crawl once: one crawl\'s worth of feed calls, the page budget used once', async () => {
    const h = await harness(busyWeek, undefined, { feedPage: 5 });
    await run(h, busyWeek, area(), { scale: { threshold: 100_000 } });
    const { sc, ids } = membersOf(h);
    const range = { startUtc: busyWeek.range.startUtc, endUtc: busyWeek.range.endUtc };
    const reset = () => { sql(h, 'DELETE FROM item_checkpoints'); sql(h, 'DELETE FROM wi_revisions'); sql(h, 'DELETE FROM wi_updates'); h.cache.setSetting(feedKey(sc), null); h.transport.log.length = 0; };
    const mk = (): SyncContext => ({ client: h.client, cache: h.cache, mapping, clock: h.clock, scale: { threshold: 1, windowFrom: 0, maxPages: 10_000, pageSize: 5 } });
    reset();
    await feedHistory(mk(), sc, ids, () => {}, undefined, range);
    const one = feedCalls(h).length;
    expect(one).toBeGreaterThan(1);
    reset();
    const ctx = mk();
    const half = Math.ceil(ids.length / 2);
    await Promise.all([feedHistory(ctx, sc, ids.slice(0, half), () => {}, undefined, range), feedHistory(ctx, sc, ids.slice(half), () => {}, undefined, range)]);
    expect(feedCalls(h).length).toBe(one);
  });
});

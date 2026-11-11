// B1: the PR stat line's facts. Parsing the four reads, the size band, the line's text, the fake ADO's
// answers, and the sync storing them and degrading quietly (04 §6a-1). Invented data only (INV-18).
import { describe, expect, it } from 'vitest';
import { scenario } from '@fixtures/dsl';
import { PR_SIZE_MEDIUM_MAX, PR_SIZE_SMALL_MAX, prStatLine, sizeBand } from '@shared/prStat';
import { changePage, humanThreadCount, prStatsOf, voteCounts } from '@shared/ingest/parse';
import type { AdoResponse } from '@shared/contracts/transport';
import { harness, ingest, syncScopeOf } from '../golden/ingest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { sprintScopes } from '@fixtures/dsl';
import { mapping } from '../golden/helpers';
import { loadLevel } from '../../src/main/sync/levels';
import { settleStats } from '../../src/main/sync/prStats';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { throttleGate } from '../../src/main/sync/scheduler';
import { Cache } from '../../src/main/db/cache';
import { prsWorthRefetching } from '../../src/main/sync/refresh';
import { FINAL_VOTES_NOTE } from '../../src/main/sync/sync';

const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const person = (n: number, vote: number, extra: Record<string, unknown> = {}) => ({ id: id(n), displayName: `P${n}`, vote, ...extra });

describe('voteCounts: current votes only', () => {
  it('counts 10, 5, -5 and -10 apart, and ignores no vote and groups', () => {
    expect(voteCounts([person(1, 10), person(2, 10), person(3, 5), person(4, -5), person(5, -10), person(6, 0), person(7, 10, { isContainer: true })]))
      .toEqual({ approved: 2, suggestions: 1, waiting: 1, rejected: 1 });
  });
  it('is undefined when nobody voted', () => {
    expect(voteCounts([person(1, 0)])).toBeUndefined();
    expect(voteCounts([])).toBeUndefined();
    expect(voteCounts('nope')).toBeUndefined();
  });
});

describe('humanThreadCount: a thread a person started', () => {
  const text = (extra: Record<string, unknown> = {}) => ({ id: 1, isDeleted: false, properties: {}, comments: [{ commentType: 'text', content: 'hm' }], ...extra });
  it('counts person-written threads, and skips system, typed and deleted ones', () => {
    const threads = [
      text(),
      text({ comments: [{ commentType: 'text' }, { commentType: 'system' }] }), // one person comment is enough
      text({ comments: [{ commentType: 'system', content: 'Policy status updated' }] }),
      text({ comments: [{ commentType: 'system' }, { commentType: 'system' }] }),
      text({ isDeleted: true }),
      text({ properties: { CodeReviewThreadType: { $value: 'VoteUpdate' } } }),
      text({ comments: [{ commentType: 'text', isDeleted: true }] }), // its only comment was deleted
      text({ comments: [] }),
    ];
    expect(humanThreadCount(threads)).toBe(2);
  });
  it('is 0 for nothing readable', () => {
    expect(humanThreadCount(null)).toBe(0);
    expect(humanThreadCount([null, 3])).toBe(0);
  });
});

describe('changePage', () => {
  it('counts files, not folders, and reads the cursor', () => {
    expect(changePage({ changeEntries: [{ item: { path: '/a', isFolder: true } }, { item: { path: '/a/b.ts' } }, { item: { path: '/a/c.ts' } }], nextSkip: 3 })).toEqual({ files: 2, next: 3 });
    expect(changePage({})).toEqual({ files: 0, next: 0 });
  });
});

describe('prStatsOf', () => {
  it('leaves out what was not read', () => {
    expect(prStatsOf({})).toEqual({});
    expect(prStatsOf({ reviewers: [person(1, 10)], iterations: 4 })).toEqual({ votes: { approved: 1 }, pushes: 4 });
    expect(prStatsOf({ threads: [], files: 0 })).toEqual({ threads: 0, files: 0 });
  });
});

describe('the size band measures volume (15 §6 pr-stat)', () => {
  it('splits at the thresholds', () => {
    expect(sizeBand(0)).toBe('S');
    expect(sizeBand(PR_SIZE_SMALL_MAX)).toBe('S');
    expect(sizeBand(PR_SIZE_SMALL_MAX + 1)).toBe('M');
    expect(sizeBand(PR_SIZE_MEDIUM_MAX)).toBe('M');
    expect(sizeBand(PR_SIZE_MEDIUM_MAX + 1)).toBe('L');
  });
});

describe('prStatLine', () => {
  it('writes the whole line, folding approved-with-suggestions into the check', () => {
    expect(prStatLine({ votes: { approved: 1, suggestions: 1, waiting: 1 }, pushes: 4, threads: 3, files: 12 })).toBe('✓ 2  ⧖ 1 · 4 pushes · 3 threads · M');
    expect(prStatLine({ votes: { rejected: 1 }, pushes: 1, threads: 1, files: 90 })).toBe('✕ 1 · 1 push · 1 thread · L');
  });
  it('shows what it has, and nothing when it has nothing', () => {
    expect(prStatLine({ threads: 0 })).toBe('0 threads');
    expect(prStatLine({ files: 2 })).toBe('S');
    expect(prStatLine({})).toBeUndefined();
    expect(prStatLine(undefined)).toBeUndefined();
  });
});

// ---- Through the fake ADO, the client, the cache and the sync ----

const RANGE: [string, string] = ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'];
const AREA = 'Quillmoor\\Pod';
const world = () => scenario('pr-stats', { project: 'Quillmoor', tz: 'America/Los_Angeles', range: RANGE })
  .area('Quillmoor', 100).area(AREA, 101, { favorite: true, defaultScope: true })
  .repo('plates')
  .person('ada', 'Ada Quill').person('bram', 'Bram Hale').person('cato', 'Cato Venn')
  .at('2026-10-05T16:00:00Z').feature(1, 'Plates', { area: AREA, assignee: 'ada' })
  .at('2026-10-05T16:10:00Z').story(2, 'A story', { parent: 1, area: AREA, assignee: 'ada' })
  .at('2026-10-06T16:00:00Z').pr(7, { repo: 'plates', author: 'ada', title: 'Open one', links: [2] })
  .prStats(7, { votes: { bram: -5, cato: 5 }, pushes: 3, threads: 2, files: 7 })
  .at('2026-10-06T17:00:00Z').pr(8, { repo: 'plates', author: 'ada', title: 'Merged one', links: [2] })
  .prStats(8, { votes: { bram: 10 }, pushes: 1, threads: 0, files: 2 })
  .at('2026-10-07T17:00:00Z').completePr(8, { approvedBy: ['bram'] })
  .at('2026-10-06T18:00:00Z').pr(9, { repo: 'plates', author: 'ada', title: 'Bare one', links: [2] })
  .build();
const scope = { project: 'Quillmoor', area: AREA };
const statsOf = (h: Awaited<ReturnType<typeof ingest>>) => Object.fromEntries(h.entities.prs.map((p) => [Number(p.key.split(':').pop()), p.stats]));

describe('the sync reads and stores the stat line facts', () => {
  it('serves every endpoint, and the bundle holds what the scenario says', async () => {
    const s = world();
    const h = await harness(s);
    const out = await ingest(h, s, scope);
    expect(statsOf(out)).toEqual({
      7: { votes: { waiting: 1, suggestions: 1 }, pushes: 3, threads: 2, files: 7 },
      8: { votes: { approved: 1 }, pushes: 1, threads: 0, files: 2 },
      9: { threads: 0 }, // the fake refuses iterations and changes for a PR that gives no pushes
    });
  });
  it('pages the changes', async () => {
    const s = scenario('pr-stats-big', { project: 'Quillmoor', tz: 'America/Los_Angeles', range: RANGE })
      .area('Quillmoor', 100).area(AREA, 101, { favorite: true, defaultScope: true }).repo('plates').person('ada', 'Ada Quill')
      .at('2026-10-05T16:00:00Z').feature(1, 'Plates', { area: AREA, assignee: 'ada' })
      .at('2026-10-06T16:00:00Z').pr(7, { repo: 'plates', author: 'ada', title: 'Huge', links: [1] })
      .prStats(7, { pushes: 2, files: 2300 })
      .build();
    const h = await harness(s);
    const out = await ingest(h, s, scope);
    expect(statsOf(out)[7]).toMatchObject({ pushes: 2, files: 2300 });
    expect(h.transport.log.filter((r) => /\/changes/.test(r.url)).length).toBeGreaterThan(1);
  });
  it('leaves a fact out when its call is refused for good, with the rest intact and no failure', async () => {
    const votes = { waiting: 1, suggestions: 1 };
    const cases: [RegExp, unknown][] = [
      [/\/pullRequests\/7\/threads/, { votes, pushes: 3, files: 7 }],
      [/\/pullRequests\/7\/iterations(\?|$)/, { votes, threads: 2 }],
      [/\/pullRequests\/7\/iterations\/\d+\/changes/, { votes, pushes: 3, threads: 2 }],
      [/\/pullRequests\/7\/reviewers/, { pushes: 3, threads: 2, files: 7 }],
    ];
    for (const [re, want] of cases) {
      const s = world();
      const h = await harness(s);
      h.transport.intercept = (r) => (re.test(r.url) ? ({ status: 403, headers: {}, body: { message: 'no' } } as AdoResponse) : undefined);
      expect(statsOf(await ingest(h, s, scope))[7], String(re)).toEqual(want);
    }
    const s = world();
    const h = await harness(s);
    h.transport.intercept = (r) => (/\/pullRequests\/7\/(reviewers|iterations|threads)/.test(r.url) ? ({ status: 403, headers: {}, body: { message: 'no' } } as AdoResponse) : undefined);
    expect(statsOf(await ingest(h, s, scope))[7]).toBeUndefined(); // `{}` is stored, and the bundle leaves it out
    expect(h.cache.prs('00000000-0000-4000-8000-000000000001').find((p) => p.pr.prId === 7)!.pr.stats).toEqual({});
  });
  const failing = (re: RegExp, status: number) => (r: { url: string }) => (re.test(r.url) ? ({ status, headers: {}, body: { message: 'x' } } as AdoResponse) : undefined);
  for (const status of [429, 500, 503, 0]) {
    for (const call of ['threads', 'reviewers', 'iterations(\\?|$)', 'iterations/\\d+/changes']) {
      it(`a ${status} on ${call} never fails the sync, and leaves the PR unread to be tried again`, async () => {
        const s = world();
        const h = await harness(s);
        const org = '00000000-0000-4000-8000-000000000001';
        h.transport.intercept = failing(new RegExp(`/pullRequests/7/${call}`), status);
        const out = await ingest(h, s, scope); // an open PR: nothing here may throw
        expect(statsOf(out)[7]).toBeUndefined();
        expect(h.cache.prs(org).find((p) => p.pr.prId === 7)!.pr.stats).toBeUndefined(); // not even `{}`
        h.transport.intercept = null;
        expect(statsOf(await ingest(h, s, scope))[7]).toEqual({ votes: { waiting: 1, suggestions: 1 }, pushes: 3, threads: 2, files: 7 });
      });
    }
  }
  it('keeps the approvers path as it was: a failed thread list on a completed PR still fails the sync, a reviewers 429 does not', async () => {
    const s = world();
    const h = await harness(s);
    h.transport.intercept = failing(/\/pullRequests\/8\/threads/, 503);
    await expect(ingest(h, s, scope)).rejects.toMatchObject({ status: 503 });
    h.transport.intercept = failing(/\/pullRequests\/8\/reviewers/, 429);
    const out = await ingest(h, s, scope);
    expect(statsOf(out)[8]).toBeUndefined(); // transient: unread
    expect(out.events.find((e) => e.kind === 'pr_completed')).toBeDefined();
  });
  it('does not say threads were unreadable when the PR itself was gone', async () => {
    const s = world();
    const h = await harness(s);
    h.transport.intercept = failing(/\/pullRequests\/8\/(reviewers|threads)/, 404);
    expect((await ingest(h, s, scope)).coverage.notes).not.toContain(FINAL_VOTES_NOTE);
    h.transport.intercept = failing(/\/pullRequests\/8\/threads/, 403); // threads alone refused: the note stands
    expect((await ingest(h, s, scope)).coverage.notes).toContain(FINAL_VOTES_NOTE);
    h.transport.intercept = failing(/\/pullRequests\/8\/threads/, 401); // a threads 401 is a missing scope (vso.threads_full): the same note, no failure
    expect((await ingest(h, s, scope)).coverage.notes).toContain(FINAL_VOTES_NOTE);
  });
  it('reads only what could have changed: an older closed PR with stats costs no call, a push costs the pushes', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    const calls = (re: RegExp) => h.transport.log.filter((r) => re.test(r.url)).length;
    // Same commit, still open: reviewers and threads again (2), no iterations or changes.
    h.transport.log.length = 0;
    await ingest(h, s, scope);
    expect(calls(/\/pullRequests\/7\/(reviewers|threads)/)).toBe(2);
    expect(calls(/\/pullRequests\/7\/iterations/)).toBe(0);
    // Closed a long while ago, stats cached: the stats read asks nothing (the approvers path's own two calls stay).
    h.transport.log.length = 0;
    const org = '00000000-0000-4000-8000-000000000001';
    const { PR_REFETCH_DAYS } = await import('../../src/main/sync/refresh');
    const { readPrStats } = await import('../../src/main/sync/prStats');
    const done = h.cache.prs(org).find((p) => p.pr.prId === 8)!;
    const later = h.fake.now + (PR_REFETCH_DAYS + 30) * 86_400_000;
    const r = await readPrStats(h.client, done.pr, { stats: done.pr.stats!, commit: done.statsCommit }, later);
    expect(h.transport.log).toHaveLength(0);
    expect(r.stats).toEqual(done.pr.stats);
    // A moved commit costs the pushes and the changes, and the new count.
    const open = h.cache.prs(org).find((p) => p.pr.prId === 7)!;
    const r2 = await readPrStats(h.client, { ...open.pr, lastCommit: 'c7-4' }, { stats: open.pr.stats!, commit: open.statsCommit }, h.fake.now);
    expect(calls(/\/pullRequests\/7\/iterations/)).toBe(2);
    expect(r2.commit).toBe('c7-4');
  });
  it('re-reads the record without losing the stats, and counts an unread PR as worth re-reading', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    const org = '00000000-0000-4000-8000-000000000001';
    const before = h.cache.prs(org).map((p) => p.pr.stats);
    expect(before.every((x) => x !== undefined)).toBe(true);
    for (const { pr } of h.cache.prs(org)) h.cache.putPr(org, { ...pr, stats: undefined }, h.clock());
    expect(h.cache.prs(org).map((p) => p.pr.stats)).toEqual(before); // its own column
    const fresh = Cache.open(':memory:');
    const done = h.cache.prs(org).find((p) => p.pr.status === 'completed')!.pr;
    fresh.putPr(org, { ...done, closedAt: 1 }, 0);
    expect(prsWorthRefetching(fresh, org, 90 * 86_400_000).size).toBe(1); // old and closed, but never read
    fresh.setPrStats(org, done.repoId, done.prId, {});
    expect(prsWorthRefetching(fresh, org, 90 * 86_400_000).size).toBe(0); // `{}`: asked, and nothing came
  });
});

// ---- 401: the token is no longer good (04 §6), on every path ----

const ORG = '00000000-0000-4000-8000-000000000001';
const UNAUTH = (re: RegExp) => (r: { url: string }) => (re.test(r.url) ? ({ status: 401, headers: {}, body: { message: 'expired (test)' } } as AdoResponse) : undefined);
// Plain Code (read), the PR record's own scope: a 401 here is a dead token. Threads are not here: a threads 401 is a
// missing scope (`vso.threads_full`, 04 §1), tested below.
const CALLS: [string, RegExp][] = [
  ['reviewers', /\/pullRequests\/7\/reviewers/],
  ['iterations', /\/pullRequests\/7\/iterations(\?|$)/], ['changes', /\/pullRequests\/7\/iterations\/\d+\/changes/],
];
const unread = (h: Awaited<ReturnType<typeof harness>>, id: number) => h.cache.prs(ORG).find((p) => p.pr.prId === id)!.pr.stats === undefined;

describe('a threads 401 is a missing scope, not a dead token', () => {
  it('full sync: it never fails the sync; the PR keeps its other facts, and approvals come from final votes with the note', async () => {
    const s = world();
    const h = await harness(s);
    h.transport.intercept = UNAUTH(/\/pullRequests\/\d+\/threads/);
    const out = await ingest(h, s, scope);
    expect(statsOf(out)[7]).toEqual({ votes: { waiting: 1, suggestions: 1 }, pushes: 3, files: 7 }); // no threads fact
    expect(out.coverage.notes).toContain(FINAL_VOTES_NOTE);
  });
  it('stream: it never refuses the token', async () => {
    const mech = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
    const h = await harness(sprintMechanics);
    h.transport.intercept = UNAUTH(/\/threads/);
    let refused = 0;
    const st = new SprintStream({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(sprintMechanics, mech), { changed: () => {}, refused: () => { refused++; } });
    await st.look(); await st.fill();
    expect(refused).toBe(0);
  });
});

describe('a 401 on the stat path stops, and stores nothing for that PR', () => {
  for (const [name, re] of CALLS) {
    it(`full sync: a 401 on ${name} fails the sync as a dead token`, async () => {
      const s = world();
      const h = await harness(s);
      h.transport.intercept = UNAUTH(re);
      await expect(ingest(h, s, scope)).rejects.toMatchObject({ status: 401 });
      expect(unread(h, 7)).toBe(true); // not `{}`: it is asked again with a good token
    });

    it(`level load: a 401 on ${name} stops the deferred reads, leaves the PR unread, and sends no doomed calls`, async () => {
      const s = world();
      const h = await harness(s);
      await ingest(h, s, scope); // the records and links are in; start over for the stats
      h.cache.db.exec('UPDATE pull_requests SET stats_json = NULL');
      h.transport.intercept = UNAUTH(re);
      h.transport.log.length = 0;
      const sc = syncScopeOf(s, scope);
      await loadLevel({ client: h.client, cache: h.cache, mapping, clock: h.clock }, sc, s.range, { kind: 'feature', featureId: 1 });
      await settleStats();
      expect(unread(h, 7)).toBe(true);
      // After the 401 nothing else of the stat path was sent: at most the first batch (two PRs) was in flight.
      expect(h.transport.log.filter((r) => /\/pullRequests\/\d+\/(reviewers|threads|iterations)/.test(r.url)).length).toBeLessThanOrEqual(8);
    });

    it(`stream: a 401 on ${name} refuses the token once, and leaves the PR unread`, async () => {
      const mech = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
      const h = await harness(sprintMechanics);
      const sync = syncScopeOf(sprintMechanics, mech);
      const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
      const first = new SprintStream(ctx, sync, { changed: () => {} });
      await first.look(); await first.fill(); // approvers and stats read normally
      h.cache.db.exec('UPDATE pull_requests SET stats_json = NULL');
      let refused = 0;
      const second = new SprintStream(ctx, sync, { changed: () => {}, refused: () => { refused++; } });
      // The mechanics sprint gives no pushes: give iterations and changes something to ask for.
      const target = h.cache.prs(ORG)[0]!.pr;
      const only = new RegExp(`/pullRequests/${target.prId}/`);
      const stat = (r: { url: string }) => (only.test(r.url) && /\/reviewers|\/threads|\/iterations/.test(r.url) ? true : false);
      h.transport.intercept = (r) => {
        if (!stat(r)) return undefined;
        if (/\/iterations(\?|$)/.test(r.url) && name === 'changes') return { status: 200, headers: {}, body: { count: 1, value: [{ id: 1 }] } } as AdoResponse;
        const hit = { reviewers: /\/reviewers/, threads: /\/threads/, iterations: /\/iterations(\?|$)/, changes: /\/changes/ }[name]!;
        return hit.test(r.url) ? ({ status: 401, headers: {}, body: { message: 'expired (test)' } } as AdoResponse) : undefined;
      };
      await second.look(); await second.fill();
      expect(refused).toBe(1);
      expect(h.cache.prs(ORG).find((p) => p.pr.prId === target.prId)!.pr.stats).toBeUndefined();
    });
  }
});

describe('the deferred and throttled stat reads (B1)', () => {
  it('a level load reads its stat lines after it returns, never before', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    h.cache.db.exec('UPDATE pull_requests SET stats_json = NULL');
    h.transport.log.length = 0;
    let atDone = -1;
    const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock, progress: (p: { phase: string }) => { if (p.phase === 'done') atDone = h.transport.log.filter((r) => /\/iterations/.test(r.url)).length; } };
    await loadLevel(ctx, syncScopeOf(s, scope), s.range, { kind: 'feature', featureId: 1 });
    expect(atDone).toBe(0);
    await settleStats();
    expect(statsOf(await ingest(h, s, scope))[7]).toBeDefined();
    expect(h.cache.prs(ORG).every((p) => p.pr.stats !== undefined)).toBe(true);
  });

  it('waits for the throttle gate before each batch', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    h.cache.db.exec('UPDATE pull_requests SET stats_json = NULL');
    h.transport.log.length = 0;
    throttleGate.until = Date.now() + 250;
    const t0 = Date.now();
    await loadLevel({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(s, scope), s.range, { kind: 'feature', featureId: 1 });
    await settleStats();
    throttleGate.until = 0;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(240);
    expect(h.cache.prs(ORG).every((p) => p.pr.stats !== undefined)).toBe(true);
  });

  it('stops when the job is aborted', async () => {
    const s = world();
    const h = await harness(s);
    await ingest(h, s, scope);
    h.cache.db.exec('UPDATE pull_requests SET stats_json = NULL');
    const ac = new AbortController();
    ac.abort();
    h.transport.log.length = 0;
    await loadLevel({ client: h.client, cache: h.cache, mapping, clock: h.clock, signal: ac.signal }, syncScopeOf(s, scope), s.range, { kind: 'feature', featureId: 1 }).catch(() => undefined);
    await settleStats();
    expect(h.transport.log.filter((r) => /\/iterations/.test(r.url))).toHaveLength(0);
  });

  it('a completed PR in the stream is read once: its approvers read is reused for the stat line', async () => {
    const mech = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
    const h = await harness(sprintMechanics);
    const stream = new SprintStream({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(sprintMechanics, mech), { changed: () => {} });
    await stream.look(); await stream.fill();
    const done = h.cache.prs(ORG).filter((p) => p.pr.status === 'completed');
    expect(done.length).toBeGreaterThan(0);
    for (const { pr } of done) {
      const n = h.transport.log.filter((r) => new RegExp(`/pullRequests/${pr.prId}/reviewers`).test(r.url)).length;
      expect(n, `PR ${pr.prId}`).toBe(1);
    }
  });
});

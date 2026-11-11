// Slice 5: incremental refresh (04 §5 step 7) and AC-30's second half — cancelling keeps what was
// committed, and the next run resumes from the checkpoints. On sprint-mechanics, through the fake ADO.
import { describe, expect, it, vi } from 'vitest';
import orbitWeek from '@fixtures/scenarios/orbit-week';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { scenarioKeys, scenarioScopes, sprintScopes, toHistory } from '@fixtures/dsl';
import { FIXTURE_ORG } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import { AdoClient } from '../../src/main/ado/client';
import { HttpTransport } from '../../src/main/ado/http';
import { Cache } from '../../src/main/db/cache';
import { history, loadLevelHistory } from '../../src/main/sync/levels';
import { countRefresh, itemsToRescan, prsWorthRefetching, refreshCount, RESCAN_EVERY } from '../../src/main/sync/refresh';
import { Scheduler, throttleGate } from '../../src/main/sync/scheduler';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { loadHistory, scopeKeyOf, syncScope } from '../../src/main/sync/sync';
import { comparable, harness, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

const scope = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
const want = toHistory(sprintMechanics, mapping, scope);
const k = scenarioKeys(sprintMechanics);
const strip = (x: ScopeHistory) => {
  const c = comparable(x) as { current?: unknown; coverage: Record<string, unknown> };
  delete c.current;
  for (const f of ['history', 'explored', 'more', 'played', 'stale']) delete c.coverage[f];
  return c;
};

/** A stream on its own cache, with the pieces the tests poke at. */
async function open(cache = Cache.open(':memory:')) {
  const h = await harness(sprintMechanics, cache);
  const sync = syncScopeOf(sprintMechanics, scope);
  const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
  const changed: number[] = [];
  const stream = new SprintStream(ctx, sync, { changed: (ids) => changed.push(...ids) });
  const sk = scopeKeyOf(sync);
  return {
    h, ctx, sync, sk, stream, changed,
    bundle: (): ScopeHistory => loadLevelHistory(ctx, sync, want.range),
    revisionCalls: () => h.transport.log.filter((r) => /\/revisions/.test(r.url)).map((r) => r.url),
  };
}

describe('what a refresh re-reads (04 §5 step 7)', () => {
  it('counts refreshes per scope and rescans every seventh', () => {
    const cache = Cache.open(':memory:');
    const seen: number[] = [];
    for (let i = 1; i <= RESCAN_EVERY * 2; i++) {
      const { n, rescan } = countRefresh(cache, FIXTURE_ORG, 'scope-a');
      expect(n).toBe(i);
      if (rescan) seen.push(n);
    }
    expect(seen).toEqual([RESCAN_EVERY, RESCAN_EVERY * 2]);
    // Per scope: another one starts again at 1.
    expect(countRefresh(cache, FIXTURE_ORG, 'scope-b').n).toBe(1);
    expect(refreshCount(cache, FIXTURE_ORG, 'scope-a')).toBe(RESCAN_EVERY * 2);
  });

  it('picks the PRs that could still have changed: open, or closed in the last week', async () => {
    const { h, stream } = await open();
    await stream.look();
    await stream.fill();
    const now = h.clock();
    // PR 9501 completed three days before the scenario's now, so it's still worth a look.
    expect([...prsWorthRefetching(h.cache, FIXTURE_ORG, now)]).toHaveLength(1);
    // A fortnight on, it has settled and is left alone.
    expect([...prsWorthRefetching(h.cache, FIXTURE_ORG, now + 14 * 86_400_000)]).toHaveLength(0);
  });

  it('rescans only members whose history we hold and that changed recently', async () => {
    const { h, stream, sk } = await open();
    await stream.look();
    await stream.fill();
    const members = h.cache.scopeMembers(FIXTURE_ORG, sk);
    const now = h.clock();
    const recent = itemsToRescan(h.cache, FIXTURE_ORG, members, now);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThanOrEqual(members.length);
    // Newest first, so a rescan that's cut short still covers what moved last.
    const changedAt = h.cache.currentItems(FIXTURE_ORG, recent);
    for (let i = 1; i < recent.length; i++) {
      expect(changedAt.get(recent[i - 1]!)!.changedAt).toBeGreaterThanOrEqual(changedAt.get(recent[i]!)!.changedAt);
    }
    // A year on, nothing counts as recent.
    expect(itemsToRescan(h.cache, FIXTURE_ORG, members, now + 365 * 86_400_000)).toEqual([]);
  });

  it('a rescan re-reads from the start, where a plain read trusts the checkpoint', async () => {
    const { h, ctx, sync, stream } = await open();
    await stream.look();
    await stream.fill();
    const id = Number(k.wi(9104).split(':').pop());
    // Plain: the checkpoint is past this item's revisions, so there's nothing to ask for.
    h.transport.log.length = 0;
    await history(ctx, sync, [id], () => {});
    const plain = h.transport.log.filter((r) => /\/revisions/.test(r.url)).map((r) => r.url);
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((u) => !/skip=0(&|$)/.test(u))).toBe(true); // it resumed past what we hold
    // Rescan: it asks again from zero, and the facts are upserted, so the bundle is unchanged (INV-13).
    const before = strip(loadLevelHistory(ctx, sync, want.range));
    h.transport.log.length = 0;
    await history(ctx, sync, [id], () => {}, undefined, { rescan: true });
    expect(h.transport.log.some((r) => /\/revisions/.test(r.url) && /skip=0(&|$)/.test(r.url))).toBe(true);
    expect(strip(loadLevelHistory(ctx, sync, want.range))).toEqual(before);
  });

  it('reopening a settled sprint reads it again, and an unchanged one costs little', async () => {
    const { h, stream, bundle } = await open();
    await stream.look();
    await stream.fill();
    const full = strip(bundle());
    h.transport.log.length = 0;
    await stream.refresh();
    // The look is the price of knowing nothing changed: no history re-read for settled items.
    expect(h.transport.log.filter((r) => /\/revisions|\/updates/.test(r.url))).toHaveLength(0);
    // And it looks again at the PR that could still move.
    expect(h.transport.log.some((r) => /pullRequests\/9501/.test(r.url))).toBe(true);
    expect(strip(bundle())).toEqual(full);
  });
});

describe('AC-30: cancelling keeps what was committed, and the next run resumes', () => {
  it('a cancelled stream leaves its checkpoints, and reopening finishes the job', async () => {
    const cache = Cache.open(':memory:');
    const first = await open(cache);
    await first.stream.look();
    // Cut it off part-way through the fill.
    first.h.transport.delayMs = 2;
    const filling = first.stream.fill();
    await new Promise((r) => setTimeout(r, 40));
    first.stream.close();
    await filling.catch(() => undefined);
    const committed = first.h.cache.itemsWithHistory(FIXTURE_ORG, first.h.cache.scopeMembers(FIXTURE_ORG, first.sk));
    expect(committed.size).toBeGreaterThan(0); // what it read is kept
    // A fresh stream on the same cache: it asks only for what's missing, and finishes.
    const second = await open(cache);
    second.h.transport.log.length = 0;
    await second.stream.look();
    await second.stream.fill();
    const reread = second.revisionCalls().map((u) => Number(/workItems\/(\d+)\//.exec(u)?.[1]));
    for (const id of committed) expect(reread).not.toContain(id); // resumed, not restarted
    expect(strip(second.bundle())).toEqual(strip(toHistory(sprintMechanics, mapping, scope)));
  });
});

describe('401 during sync: stop, and ask for a new token (04 §6, decided 2026-10-09)', () => {
  /** A stream whose token dies right after the first look. */
  async function expiring(deny: (url: string) => boolean) {
    const o = await open();
    let refused = 0;
    const stream = new SprintStream(o.ctx, o.sync, { changed: () => {}, refused: () => { refused++; } });
    await stream.look();
    const afterLook = o.h.transport.log.length;
    o.h.transport.intercept = (req) => (deny(req.url) ? { status: 401, headers: {}, body: { message: 'expired (test)' } } : undefined);
    await stream.fill();
    return { ...o, stream, refusals: () => refused, callsAfter: () => o.h.transport.log.length - afterLook };
  }

  it('a token that dies mid-fill stops the stream and says so exactly once', async () => {
    const t = await expiring(() => true);
    expect(t.refusals()).toBe(1);
    // It didn't plough on: only the first few tasks got as far as a call.
    expect(t.callsAfter()).toBeLessThan(10);
  });

  it('what was read stays, but the scope is not claimed to be complete', async () => {
    const t = await expiring(() => true);
    const cp = t.h.cache.scopeCheckpoint(FIXTURE_ORG, t.sk)!;
    expect(cp.lastError).toMatch(/401$/);
    expect(cp.coverage?.partial).toBe(true);
    expect(cp.coverage?.notes.some((n) => n.includes('stopped accepting the token'))).toBe(true);
    // The first look's current state is still there to draw from.
    expect(t.h.cache.scopeMembers(FIXTURE_ORG, t.sk).length).toBeGreaterThan(0);
    expect(t.bundle().entities.workItems.length).toBeGreaterThan(0);
  });

  it('a picture 401 is not a dead token: it does not stop anything', async () => {
    const t = await expiring((url) => /MemberAvatars/.test(url));
    expect(t.refusals()).toBe(0);
    expect(strip(t.bundle())).toEqual(strip(want)); // everything else still arrived
  });

  it('a 401 on one kind of call is enough: the others need not be tried', async () => {
    const t = await expiring((url) => /\/wit\/wiql/.test(url));
    expect(t.refusals()).toBe(1);
  });
});

describe('AC-30: a throttle pauses the whole queue, not just the one request', () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('ADO asking us to wait sets the shared gate', async () => {
    throttleGate.until = 0;
    let calls = 0;
    const fetchFn = (async () => (++calls === 1 ? new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }) : new Response('{"value":[]}', { status: 200 }))) as unknown as typeof fetch;
    const t = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => 'canary', fetch: fetchFn, sleep: async () => {} });
    const client = new AdoClient(t, 'https://dev.azure.com/contoso');
    const before = Date.now();
    await client.call('projects', 'GET', '/_apis/projects');
    // Retry-After: 2 s, so everything else queued behind ADO waits until about then.
    expect(throttleGate.until).toBeGreaterThanOrEqual(before + 1900);
    expect(throttleGate.until).toBeLessThanOrEqual(Date.now() + 2100);
    throttleGate.until = 0;
  });

  it('a queued task doesn’t start while the gate is shut, and does once it opens', async () => {
    const s = new Scheduler({ concurrency: 4 });
    const ran: string[] = [];
    throttleGate.until = Date.now() + 150;
    const a = s.add({ key: 'a', group: '', cls: 'fill', run: async () => { ran.push('a'); } });
    const b = s.add({ key: 'b', group: '', cls: 'look', run: async () => { ran.push('b'); } });
    await wait(60);
    expect(ran).toEqual([]); // held, though a slot is free
    await Promise.all([a, b]);
    expect(Date.now()).toBeGreaterThanOrEqual(throttleGate.until - 10);
    expect(ran.sort()).toEqual(['a', 'b']);
    throttleGate.until = 0;
  });

  it('work already running is left to finish', async () => {
    throttleGate.until = 0;
    const s = new Scheduler({ concurrency: 1 });
    const ran: string[] = [];
    const first = s.add({ key: 'first', group: '', cls: 'fill', run: async () => { await wait(40); ran.push('first'); } });
    const second = s.add({ key: 'second', group: '', cls: 'fill', run: async () => { ran.push('second'); } });
    await wait(10);
    throttleGate.until = Date.now() + 120; // a 429 lands while 'first' is in flight
    await first;
    expect(ran).toEqual(['first']);
    await second;
    expect(ran).toEqual(['first', 'second']);
    throttleGate.until = 0;
  });
});

describe('AC-30: a cancelled full sync keeps what it committed, and the next one resumes', () => {
  it('per item, in one transaction with its checkpoint', async () => {
    const scopeOf = scenarioScopes(orbitWeek, mapping).find((x) => 'area' in x)!;
    const cache = Cache.open(':memory:');
    const h = await harness(orbitWeek, cache);
    const sc = syncScopeOf(orbitWeek, scopeOf);
    const range = toHistory(orbitWeek, mapping, scopeOf).range;
    const base = { client: h.client, cache: h.cache, mapping, clock: h.clock };

    // Cut it off once some items have been read but not all: discovery comes first (a daily ASOF sample
    // per day), then each item's history, so wait for the first commit rather than guess a delay.
    h.transport.delayMs = 2;
    const ac = new AbortController();
    const first = syncScope({ ...base, client: h.client.withSignal(ac.signal), signal: ac.signal }, sc, range);
    for (let i = 0; i < 600 && h.cache.revisions(FIXTURE_ORG).size === 0; i++) await new Promise((r) => setTimeout(r, 5));
    ac.abort(new Error('Cancelled'));
    await expect(first).rejects.toThrow();
    const committed = [...h.cache.revisions(FIXTURE_ORG).keys()];
    expect(committed.length).toBeGreaterThan(0); // what it read is kept
    expect(h.cache.scopeCheckpoint(FIXTURE_ORG, scopeKeyOf(sc))?.lastSuccessAt).toBeNull(); // but it isn't called done

    // The next one resumes: committed items ask from past what they hold, not from the start.
    h.transport.delayMs = 0;
    h.transport.log.length = 0;
    await syncScope(base, sc, range);
    const fromStart = h.transport.log
      .map((r) => /workItems\/(\d+)\/revisions\?.*skip=0(&|$)/.exec(r.url)?.[1])
      .filter((id): id is string => !!id)
      .map(Number);
    for (const id of committed) expect(fromStart).not.toContain(id);
    // And it ends the same as an uninterrupted one (AC-27).
    expect(strip(loadHistory(base, sc, range))).toEqual(strip(toHistory(orbitWeek, mapping, scopeOf)));
  });
});

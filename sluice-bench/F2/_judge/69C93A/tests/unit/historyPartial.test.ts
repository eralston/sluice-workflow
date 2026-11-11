// 23 B6 and B7: the load count (`N of ~M`) and partial history (the missing set, Retry's request set),
// the pure parts, and the level loader recording and retrying a failed read through the fake ADO.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { scenarioScopes } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import { missingAfter, partialText, retrySet, scenePartial } from '@shared/historyPartial';
import { fillCount, fillText } from '@shared/streamCount';
import { loadLevel, loadLevelHistory, type Level } from '../../src/main/sync/levels';
import { mapping } from '../golden/helpers';
import { harness, syncScopeOf } from '../golden/ingest';

describe('the load count (B6)', () => {
  it('is an estimate from the member count until discovery is over, and never has N above M', () => {
    for (let pending = 0; pending <= 40; pending += 3) {
      for (const finished of [0, 5, 60]) {
        for (const members of [0, 10, 100]) {
          for (const exact of [false, true]) {
            const c = fillCount({ pending, finished, members, exact });
            expect(c.n, JSON.stringify({ pending, finished, members, exact })).toBeLessThanOrEqual(c.m);
            expect(c.n).toBe(pending);
          }
        }
      }
    }
    // The estimate: the members, until the queue outruns it (then M grows with the queue).
    expect(fillCount({ pending: 4, finished: 0, members: 30, exact: false })).toEqual({ n: 4, m: 30, exact: false });
    expect(fillCount({ pending: 50, finished: 10, members: 30, exact: false })).toEqual({ n: 50, m: 60, exact: false });
    // Exact: what has been queued, finished or not, and the members no longer matter.
    expect(fillCount({ pending: 4, finished: 20, members: 99, exact: true })).toEqual({ n: 4, m: 24, exact: true });
    // Deferred items (history waiting for its scene) are work too.
    expect(fillCount({ pending: 4, finished: 20, members: 0, exact: true, deferred: 6 })).toEqual({ n: 4, m: 30, exact: true });
  });

  it('writes ~ while M is an estimate and drops it once exact; clamps a total below the count', () => {
    expect(fillText(12, 40, false)).toBe('Filling in · 12 of ~40 reads');
    expect(fillText(12, 40, true)).toBe('Filling in · 12 of 40 reads');
    expect(fillText(12, 5, false)).toBe('Filling in · 12 of ~12 reads');
    expect(fillText(7)).toBe('Filling in · 7 reads'); // a stream that has not reported a total yet
  });
});

describe('partial history (B7): the sets', () => {
  const h = (played: NonNullable<ScopeHistory['coverage']['played']>) => ({ coverage: { played } }) as unknown as ScopeHistory;
  const k = (n: number) => `wi:o:${n}` as never;

  it('a scene is partial when items are missing or the feed was capped, and whole otherwise', () => {
    const b = h([{ scene: 'team', days: 7, at: 1, missing: [k(3), k(5), k(3)] }, { scene: k(9), days: 7, at: 1, capped: true }, { scene: k(11), days: 7, at: 1 }]);
    expect(scenePartial(b, 'team')).toEqual({ missing: 2, capped: false }); // a repeat counts once
    expect(scenePartial(b, k(9))).toEqual({ missing: 0, capped: true });
    expect(scenePartial(b, k(11))).toBeNull();
    expect(scenePartial(b, k(12))).toBeNull(); // not played at all
    expect(scenePartial(null, 'team')).toBeNull();
  });

  it('says the missing count (with Retry beside it), or that a capped crawl continues on the next load', () => {
    expect(partialText({ missing: 3, capped: false })).toBe('History partial · 3 missing');
    expect(partialText({ missing: 3, capped: true })).toBe('History partial · 3 missing'); // the missing ones come first
    expect(partialText({ missing: 0, capped: true })).toBe('History partial · more on the next load');
  });

  it('Retry asks for the missing items that are still members, once each, in order', () => {
    expect(retrySet([9, 4, 4, 7], new Set([4, 9, 10]))).toEqual([4, 9]);
    expect(retrySet(undefined, new Set([1]))).toEqual([]);
    expect(missingAfter([5, 2, 5])).toEqual([2, 5]);
    expect(missingAfter([])).toEqual([]);
  });
});

describe('partial history (B7): through the level loader', () => {
  const s = scenarios[0]!;
  const scope = scenarioScopes(s, mapping).find((x) => 'area' in x)!;

  async function setup() {
    const hh = await harness(s);
    const sc = syncScopeOf(s, scope);
    const ctx = { client: hh.client, cache: hh.cache, mapping, clock: hh.clock };
    const load = (level: Level) => loadLevel(ctx, sc, s.range, level);
    const bundle = () => loadLevelHistory(ctx, sc, s.range);
    return { hh, load, bundle };
  }
  const revCalls = (log: { url: string }[]) => log.map((r) => /workItems\/(\d+)\/revisions/.exec(r.url)?.[1]).filter((x): x is string => !!x).map(Number);

  it('records the items whose read failed (5xx), Retry refetches only those, and the scene is whole after', async () => {
    const { hh, load, bundle } = await setup();
    await load({ kind: 'team' });
    while (bundle().coverage.more?.team) await load({ kind: 'more' });
    const items = bundle().entities.workItems.map((w) => Number(w.key.split(':').pop()));
    const bad = new Set(items.slice(0, 3));
    hh.transport.intercept = (req) => {
      const id = /workItems\/(\d+)\/revisions/.exec(req.url)?.[1];
      return id && bad.has(Number(id)) ? { status: 503, headers: {}, body: { message: 'Simulated' } } : undefined;
    };
    await load({ kind: 'history', scene: { kind: 'team' }, days: 30 });
    const first = bundle();
    const played = first.coverage.played!.find((p) => p.scene === 'team')!;
    expect(new Set(played.missing)).toEqual(new Set([...bad].map((id) => `wi:00000000-0000-4000-8000-000000000001:${id}`)));
    expect(scenePartial(first, 'team')?.missing).toBe(bad.size);

    // Retry while they still fail: the same set stays missing, and only they are asked for.
    hh.transport.log.length = 0;
    await load({ kind: 'history', scene: { kind: 'team' }, days: 30, retry: true });
    expect(new Set(revCalls(hh.transport.log))).toEqual(bad);
    expect(scenePartial(bundle(), 'team')?.missing).toBe(bad.size);

    // Retry once ADO answers: the same items only, and the scene is whole.
    hh.transport.intercept = null;
    hh.transport.log.length = 0;
    await load({ kind: 'history', scene: { kind: 'team' }, days: 30, retry: true });
    expect(new Set(revCalls(hh.transport.log))).toEqual(bad);
    expect(scenePartial(bundle(), 'team')).toBeNull();
  });

  it('a refusal (403) is not "missing": it is kept stale and is not offered again', async () => {
    const { hh, load, bundle } = await setup();
    await load({ kind: 'team' });
    const one = Number(bundle().entities.workItems[0]!.key.split(':').pop());
    hh.transport.intercept = (req) => (new RegExp(`workItems/${one}/revisions`).test(req.url) ? { status: 403, headers: {}, body: { message: 'no' } } : undefined);
    await load({ kind: 'history', scene: { kind: 'team' }, days: 30 });
    expect(scenePartial(bundle(), 'team')).toBeNull();
  });
});

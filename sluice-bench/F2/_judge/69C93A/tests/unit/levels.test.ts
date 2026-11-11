// Loading by level (decided 2026-10-07): current state first, explored level by level, history only
// when asked. Each level is checked against the fixture's own truth (toHistory) through the fake ADO.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import crowdedOrg from '@fixtures/scenarios/crowded-org';
import { scenarioScopes, toHistory } from '@fixtures/dsl';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { workItemId, type CanonicalKey } from '@shared/contracts/keys';
import type { SceneKey } from '@shared/contracts/view';
import { loadLevel, loadLevelHistory, type Level } from '../../src/main/sync/levels';
import { mapping } from '../golden/helpers';
import { harness, syncScopeOf } from '../golden/ingest';
import { projectScene } from '@shared/scene/projectScene';
import { LAYOUT_VERSION } from '@shared/limits';
import { BACKLOG } from '@shared/hierarchy/backlog';

const orbit = scenarios[0]!;
const comet = { project: 'Nimbus Deck', area: 'Nimbus Deck\\Comet Crew' };

async function levels(s = orbit, scope: Parameters<typeof syncScopeOf>[1] = comet) {
  const h = await harness(s);
  const sc = syncScopeOf(s, scope);
  const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
  const load = (level: Level) => loadLevel(ctx, sc, s.range, level);
  const bundle = () => loadLevelHistory(ctx, sc, s.range);
  return { h, load, bundle };
}
const calls = (log: { url: string }[], re: RegExp) => log.filter((r) => re.test(r.url)).length;
/** A snapshot's items as comparable rows. */
const rows = (snap: ReturnType<typeof snapshotAt>, keys?: Set<string>) => [...snap.workItems.values()]
  .filter((w) => !keys || keys.has(w.key))
  .map((w) => [w.key, w.rawState, w.assigneeKey, w.parentKey, w.areaPath]).sort();

describe('loading by level', () => {
  it('a team loads its Features as they are now: no history, no PRs, no ASOF', async () => {
    const { h, load, bundle } = await levels();
    await load({ kind: 'team' });
    expect(calls(h.transport.log, /\/(revisions|updates)\?/)).toBe(0);
    expect(calls(h.transport.log, /pullRequests?\//i)).toBe(0);
    expect(h.transport.log.some((r) => /ASOF/.test(String((r.body as { query?: string })?.query)))).toBe(false);
    const b = bundle();
    expect(b.events).toEqual([]);
    expect(b.current?.workItems.length).toBeGreaterThan(0);
    // Its Features, as they are at the end, match the fixture's own state there.
    const truth = snapshotAt(toHistory(orbit, mapping, comet), orbit.range.endUtc - 1, 'knownThen');
    const now = snapshotAt(b, b.range.endUtc - 1, 'knownThen');
    const features = new Set([...now.workItems.values()].filter((w) => w.kind === 'feature').map((w) => w.key));
    expect(features.size).toBeGreaterThan(0);
    expect(rows(now, features).map((r) => r.slice(0, 3))).toEqual(rows(truth, features).map((r) => r.slice(0, 3)));
    expect(b.entities.childCounts?.length).toBeGreaterThan(0); // unexplored miniatures
  });

  it('entering a Feature loads its subtree and PRs as they are now, still no history', async () => {
    const { h, load, bundle } = await levels();
    await load({ kind: 'team' });
    const feature = workItemId(bundle().current!.workItems.find((w) => w.type === 'Feature' && w.title === 'Unified quote ledger')!.key);
    await load({ kind: 'feature', featureId: feature });
    expect(calls(h.transport.log, /\/(revisions|updates)\?/)).toBe(0);
    const b = bundle();
    expect(b.coverage.explored).toContain(`wi:00000000-0000-4000-8000-000000000001:${feature}`);
    const truth = snapshotAt(toHistory(orbit, mapping, comet), orbit.range.endUtc - 1, 'knownThen');
    const now = snapshotAt(b, b.range.endUtc - 1, 'knownThen');
    const sub = new Set([...now.workItems.values()].filter((w) => {
      for (let c: typeof w | undefined = w; c; c = c.parentKey ? now.workItems.get(c.parentKey) : undefined) if (workItemId(c.key) === feature) return true;
      return false;
    }).map((w) => w.key));
    expect(sub.size).toBeGreaterThan(3);
    expect(rows(now, sub)).toEqual(rows(truth, sub));
    expect([...now.prs.values()].map((p) => [p.key, p.status]).sort()).toEqual([...truth.prs.values()].filter((p) => now.prs.has(p.key)).map((p) => [p.key, p.status]).sort());
    expect(now.prs.size).toBeGreaterThan(0);
  });

  it('asking for a Feature’s history adds its events; everything with history matches toHistory', async () => {
    for (const s of scenarios) {
      for (const scope of scenarioScopes(s, mapping).filter((x) => 'area' in x)) {
        const { load, bundle } = await levels(s, scope);
        await load({ kind: 'team' });
        while (bundle().coverage.more?.team) await load({ kind: 'more' });
        await load({ kind: 'history', scene: { kind: 'team' }, days: 30 });
        for (const w of bundle().entities.workItems.filter((x) => x.type === 'Feature')) {
          await load({ kind: 'feature', featureId: workItemId(w.key) });
          await load({ kind: 'history', scene: { kind: 'feature', featureId: workItemId(w.key) }, days: 30 });
        }
        const got = bundle();
        const truth = toHistory(s, mapping, scope);
        // Every entity has history now, so the events are the fixture's.
        expect(got.events.map((e) => e.eventKey).sort(), `${s.name} ${JSON.stringify(scope)}`).toEqual(truth.events.map((e) => e.eventKey).sort());
      }
    }
  });

  it('the current-state bundle matches the fixture’s state at the range end, for every area scope', async () => {
    for (const s of scenarios) {
      for (const scope of scenarioScopes(s, mapping).filter((x) => 'area' in x)) {
        const { load, bundle } = await levels(s, scope);
        await load({ kind: 'team' });
        while (bundle().coverage.more?.team) await load({ kind: 'more' });
        for (const w of bundle().entities.workItems.filter((x) => x.type === 'Feature')) await load({ kind: 'feature', featureId: workItemId(w.key) });
        const b = bundle();
        expect(b.events, s.name).toEqual([]);
        const now = snapshotAt(b, s.range.endUtc - 1, 'knownThen');
        // Current state carries today's links, as the Retrospective lens does (815's link is known only now).
        const truth = snapshotAt(toHistory(s, mapping, scope), s.range.endUtc - 1, 'currentObserved');
        // Membership is the scope's as it is now: a Feature that moved away, an item that lost its parent
        // (uncharted), or one unlinked without a date is reached only through history (a Feature's history
        // brings its former children). Every Feature under the path now is here, and every shared item matches.
        const label = `${s.name} ${JSON.stringify(scope)}`;
        const under = (p: string) => p === scope.area || p.startsWith(`${scope.area}\\`);
        const features = [...truth.workItems.values()].filter((w) => w.kind === 'feature' && under(w.areaPath)).map((w) => w.key);
        for (const f of features) expect(now.workItems.has(f), `${label} ${f}`).toBe(true);
        const shared = new Set([...now.workItems.keys()].filter((k) => truth.workItems.has(k)));
        expect(shared.size).toBeGreaterThanOrEqual(features.length);
        expect(rows(now, shared), label).toEqual(rows(truth, shared));
      }
    }
  });

  it('Load more pages Features newest first, with no duplicates', async () => {
    // crowded-org's Pine Team has 15 Features, 14 of them untouched for months: it opens on 10.
    const pine = { project: 'Juniper Ridge', area: 'Juniper Ridge\\Pine Team' };
    const pineCase = await levels(crowdedOrg, pine);
    await pineCase.load({ kind: 'team' });
    expect(pineCase.bundle().current!.workItems.filter((w) => w.type === 'Feature')).toHaveLength(10);
    expect(pineCase.bundle().coverage.more?.team).toBe(true);
    await pineCase.load({ kind: 'more' });
    expect(pineCase.bundle().current!.workItems.filter((w) => w.type === 'Feature')).toHaveLength(15);
    expect(pineCase.bundle().coverage.more?.team).toBe(false);
    for (const [s, scopes] of [...scenarios.map((x) => [x, scenarioScopes(x, mapping)] as const), [crowdedOrg, [pine]] as const]) {
      for (const scope of scopes.filter((x) => 'area' in x)) {
        const { load, bundle } = await levels(s, scope);
        await load({ kind: 'team' });
        const pages: CanonicalKey[][] = [];
        const seen = () => bundle().current!.workItems.filter((w) => w.type === 'Feature' && w.areaPath.startsWith(scope.area)).map((w) => w.key);
        pages.push(seen());
        while (bundle().coverage.more?.team) {
          await load({ kind: 'more' });
          const all = seen();
          pages.push(all.filter((k) => !pages.flat().includes(k)));
        }
        const flat = pages.flat();
        expect(new Set(flat).size, s.name).toBe(flat.length);
        const changed = new Map(bundle().current!.workItems.map((w) => [w.key, w.changedAt]));
        for (let i = 1; i < pages.length; i++) {
          if (!pages[i]!.length) continue;
          expect(Math.max(...pages[i]!.map((k) => changed.get(k)!))).toBeLessThanOrEqual(Math.min(...pages[i - 1]!.map((k) => changed.get(k)!)));
        }
      }
    }
  });

  it('a played scene is recorded, and a catch-up with nothing new changes nothing (AC-28)', async () => {
    const { load, bundle } = await levels();
    await load({ kind: 'team' });
    await load({ kind: 'history', scene: { kind: 'team' }, days: 7 });
    const a = bundle();
    expect(a.coverage.played?.map((p) => [p.scene, p.days])).toEqual([['team', 7]]);
    await load({ kind: 'catchUp' });
    const b = bundle();
    expect({ ...b, coverage: { ...b.coverage, played: [] }, current: { ...b.current!, at: 0 } }).toEqual({ ...a, coverage: { ...a.coverage, played: [] }, current: { ...a.current!, at: 0 } });
  });

  it('projection: unexplored Features show their child count, and Load more takes the next slot', async () => {
    const { load, bundle } = await levels();
    await load({ kind: 'team' });
    const b = bundle();
    const withMore = { ...b, coverage: { ...b.coverage, more: { team: true, features: [] } } };
    const sceneKey = `sector:area:${(b.scope.sector as { areaKey: string }).areaKey}` as SceneKey;
    const g = projectScene(withMore, snapshotAt(withMore, b.range.endUtc - 1, 'knownThen'), sceneKey, LAYOUT_VERSION);
    const stars = g.nodes.filter((n) => n.kind === 'star');
    const unexplored = stars.filter((n) => n.flags.unexplored);
    expect(unexplored.length).toBeGreaterThan(0);
    for (const st of unexplored) {
      const c = b.entities.childCounts!.find((x) => x.key === st.canonicalKey)!;
      expect(st.meta2).toBe(`${c.stories + c.bugs} item${c.stories + c.bugs === 1 ? '' : 's'} · not yet explored`);
      expect(g.nodes.filter((n) => n.role === 'unexplored' && n.canonicalKey === st.canonicalKey).length).toBe(Math.min(24, c.stories + c.bugs));
    }
    const more = g.nodes.filter((n) => n.role === 'loadMore');
    expect(more).toHaveLength(1);
    expect(more[0]!.selectable).toBe(true);
    for (const st of stars) expect(Math.hypot(st.world.x - more[0]!.world.x, st.world.y - more[0]!.world.y)).toBeGreaterThan(100);
  });

  it('re-loading a level changes nothing (INV-13)', async () => {
    const { load, bundle } = await levels();
    await load({ kind: 'team' });
    const a = bundle();
    await load({ kind: 'team' });
    expect(bundle()).toEqual(a);
  });
});

describe('sector order (decided 2026-10-07)', () => {
  it('stars sit A–Z by title, in the layout and their slots, at every instant', () => {
    for (const s of scenarios) {
      const h = toHistory(s, mapping);
      const sector = BACKLOG.format(BACKLOG.sceneForScope(h.scope));
      const orders = [h.range.startUtc + 1, (h.range.startUtc + h.range.endUtc) / 2, h.range.endUtc - 1].map((t) => {
        const g = projectScene(h, snapshotAt(h, t, 'knownThen'), sector, LAYOUT_VERSION);
        const stars = g.nodes.filter((n) => n.kind === 'star').sort((a, b) => a.slot! - b.slot!);
        // Reading order on screen (rows top to bottom, left to right) follows the slots.
        const onScreen = [...stars].sort((a, b) => a.world.y - b.world.y || a.world.x - b.world.x);
        expect(onScreen.map((n) => n.canonicalKey), s.name).toEqual(stars.map((n) => n.canonicalKey));
        return stars.map((n) => n.canonicalKey);
      });
      expect(orders[1], s.name).toEqual(orders[2]); // slots never change on seek (INV-14)
      const end = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
      const titles = orders[2]!.map((k) => end.workItems.get(k)?.title ?? '');
      expect(titles, s.name).toEqual([...titles].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })));
    }
  });
});

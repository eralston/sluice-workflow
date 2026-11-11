import { describe, expect, it } from 'vitest';
import stateMappingJson from '@config/state-mapping.json';
import type { StateMapping } from '@shared/contracts/history';
import type { SceneKey } from '@shared/contracts/view';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { scenarioKeys, toHistory } from '@fixtures/dsl';
import orbitWeek from '@fixtures/scenarios/orbit-week';

const mapping = stateMappingJson as StateMapping;
const s = orbitWeek;
const k = scenarioKeys(s);
const end = s.range.endUtc - 1;
const area = toHistory(s, mapping, { project: 'Nimbus Deck', area: 'Nimbus Deck\\Comet Crew' });
const epic52 = toHistory(s, mapping, { project: 'Nimbus Deck', epic: 52 });
const epic51 = toHistory(s, mapping, { project: 'Nimbus Deck', epic: 51 });
const featureScene = (key: string) => `feature:${key}` as SceneKey;

describe('AC-04: one Feature, two sectors, one history (INV-09)', () => {
  it('Feature 104 projects under its Area sector and Epic 52 with the same key and events', () => {
    const f = k.wi(104);
    const areaSector = projectScene(area, snapshotAt(area, end, 'knownThen'), `sector:area:${k.area('Nimbus Deck\\Comet Crew')}`, 1);
    const epicSector = projectScene(epic52, snapshotAt(epic52, end, 'knownThen'), `sector:epic:${k.wi(52)}`, 1);
    const inArea = areaSector.nodes.find((n) => n.canonicalKey === f && n.kind === 'star');
    const inEpic = epicSector.nodes.find((n) => n.canonicalKey === f && n.kind === 'star');
    expect(inArea).toBeDefined();
    expect(inEpic).toBeDefined();
    expect(inArea!.projectionKey).not.toBe(inEpic!.projectionKey); // two projections...
    // ...of one history: the Feature's subtree events are identical in both bundles.
    const subtree = (h: typeof area) => {
      const snap = snapshotAt(h, end, 'knownThen');
      const keys = new Set([f, ...[...snap.workItems.values()].filter((w) => w.parentKey === f).map((w) => w.key)]);
      return h.events.filter((e) => keys.has(e.entityKey)).map((e) => e.eventKey);
    };
    expect(subtree(epic52)).toEqual(subtree(area));
    for (const h of [area, epic52, epic51]) expect(new Set(h.events.map((e) => e.eventKey)).size).toBe(h.events.length);
  });

  it('the Epic sector spans areas; the Area sector ignores Epic parentage', () => {
    const epicStars = projectScene(epic52, snapshotAt(epic52, end, 'knownThen'), `sector:epic:${k.wi(52)}`, 1)
      .nodes.filter((n) => n.kind === 'star').map((n) => n.canonicalKey).sort();
    expect(epicStars).toEqual([k.wi(104), k.wi(111), k.wi(112)].sort());
    const areaStars = projectScene(area, snapshotAt(area, end, 'knownThen'), `sector:area:${k.area('Nimbus Deck\\Comet Crew')}`, 1)
      .nodes.filter((n) => n.kind === 'star');
    expect(areaStars).toHaveLength(6); // includes 103 and 105, which have no Epic
  });
});

describe('AC-05: route shapes (02 §3, INV-10)', () => {
  const g = projectScene(area, snapshotAt(area, end, 'knownThen'), featureScene(k.wi(101)), 1);
  const pk = (key: string) => g.nodes.find((n) => n.canonicalKey === key && n.kind !== 'captain' && n.kind !== 'assignmentBeacon')?.projectionKey;
  const has = (kind: string, a?: string, b?: string) => g.edges.some((e) => e.kind === kind && e.from === a && e.to === b);

  it('PR → Task, continuing to the Story', () => {
    expect(has('route', pk(k.pr(9001)), pk(k.wi(401)))).toBe(true);
    expect(has('routeContinuation', pk(k.wi(401)), pk(k.wi(201)))).toBe(true);
  });
  it('PR → Story directly, with no Task in between', () => {
    expect(has('route', pk(k.pr(9002)), pk(k.wi(201)))).toBe(true);
    const viaTask = g.edges.filter((e) => e.kind === 'route' && e.from === pk(k.pr(9002)))
      .some((e) => g.nodes.find((n) => n.projectionKey === e.to)?.kind === 'missionPoint');
    expect(viaTask).toBe(false);
  });
  it('PR → Bug directly', () => {
    expect(has('route', pk(k.pr(9003)), pk(k.wi(301)))).toBe(true);
  });
  it('an unlinked PR goes to the tray, not to an invented planet', () => {
    expect(g.trays.unlinked).toContain(k.pr(9004));
    expect(g.nodes.some((n) => n.canonicalKey === k.pr(9004))).toBe(false);
  });
  it('a Task that lost its parent is Uncharted', () => {
    expect(g.trays.uncharted).toContain(k.wi(408));
  });
});

describe('AC-06: a shared repo is one entity with many projections', () => {
  it('portal-web appears as a station in Feature 101 and Feature 104', () => {
    const repo = k.repo('portal-web');
    expect(area.entities.repos.filter((r) => r.key === repo)).toHaveLength(1);
    const snap = snapshotAt(area, end, 'knownThen');
    const in101 = projectScene(area, snap, featureScene(k.wi(101)), 1).nodes.filter((n) => n.canonicalKey === repo);
    const in104 = projectScene(area, snap, featureScene(k.wi(104)), 1).nodes.filter((n) => n.canonicalKey === repo);
    expect(in101).toHaveLength(1);
    expect(in104).toHaveLength(1);
    expect(in101[0]!.projectionKey).not.toBe(in104[0]!.projectionKey);
  });
});

describe('AC-07: slots are stable across seeks (INV-14)', () => {
  it('20 random seeks: the frame never moves, and a body\u2019s place depends only on t (INV-14 as amended, INV-12)', () => {
    const scene = featureScene(k.wi(101));
    const at = (t: number) => projectScene(area, snapshotAt(area, t, 'knownThen'), scene, 1);
    const ref = at(end);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const span = end - Date.parse('2026-08-24T00:00:00Z');
    const seen = new Map<number, string>();
    for (let i = 0; i < 20; i++) {
      const t = end - Math.floor(rnd() * span);
      const g = at(t);
      expect(g.board).toEqual(ref.board);
      expect(g.nodes.find((n) => n.kind === 'star')!.world).toEqual(ref.nodes.find((n) => n.kind === 'star')!.world);
      // Coming back to an instant gives the same places, whatever was seen in between.
      const places = JSON.stringify(g.nodes.filter((n) => n.kind === 'planet' || n.kind === 'anomaly').map((n) => [n.projectionKey, n.world]));
      if (seen.has(t)) expect(places).toBe(seen.get(t));
      seen.set(t, places);
      expect(JSON.stringify(at(t).nodes.filter((n) => n.kind === 'planet' || n.kind === 'anomaly').map((n) => [n.projectionKey, n.world]))).toBe(places);
    }
  });
  it('a child added later takes a free slot', () => {
    const g = projectScene(area, snapshotAt(area, end, 'knownThen'), featureScene(k.wi(101)), 1);
    const slots = g.nodes.filter((n) => n.slot !== undefined && (n.kind === 'planet' || n.kind === 'anomaly')).map((n) => n.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(g.nodes.find((n) => n.canonicalKey === k.wi(301))?.slot).toBe(5); // the Bug arrived last
  });
});

describe('captains (INV-07)', () => {
  it('one ship per captain per scene; concurrent assignments elsewhere do not move it', () => {
    const snap = snapshotAt(area, end, 'knownThen');
    const g101 = projectScene(area, snap, featureScene(k.wi(101)), 1);
    const g102 = projectScene(area, snap, featureScene(k.wi(102)), 1);
    const ava = k.person('ava');
    expect(g101.nodes.filter((n) => n.canonicalKey === ava && n.kind === 'captain')).toHaveLength(1);
    expect(g102.nodes.filter((n) => n.canonicalKey === ava && n.kind === 'captain')).toHaveLength(1);
  });
});

describe('label lines (06 §4)', () => {
  const lantern = toHistory(s, mapping, { project: 'Nimbus Deck', area: 'Nimbus Deck\\Lantern Squad' });
  const g = projectScene(lantern, snapshotAt(lantern, end, 'knownThen'), featureScene(k.wi(111)), 1);

  it('assigned items carry the assignee as a third line; unassigned ones carry none', () => {
    expect(g.nodes.find((n) => n.canonicalKey === k.wi(251) && n.kind === 'planet')?.meta2).toBe('Rafe Okoro');
    expect(g.nodes.find((n) => n.canonicalKey === k.wi(254) && n.kind === 'planet')?.meta2).toBeUndefined();
  });
  it('PR vessels carry their author; repositories carry no person', () => {
    expect(g.nodes.find((n) => n.canonicalKey === k.pr(9202))?.meta2).toBe('Rafe Okoro');
    expect(g.nodes.filter((n) => n.kind === 'station').every((n) => n.meta2 === undefined)).toBe(true);
  });
  it('assignment beacons are disabled', () => {
    expect(g.nodes.some((n) => n.kind === 'assignmentBeacon')).toBe(false);
  });
  it('titles are capped at the longest possible subtitle: "Pull Request #12345678 · Ready for Review"', async () => {
    const { TITLE_MAX_CHARS, capTitle } = await import('@shared/scene/sizing');
    expect(TITLE_MAX_CHARS).toBe('Pull Request #12345678 · Ready for Review'.length);
    const long = 'x'.repeat(60);
    expect(capTitle(long)).toHaveLength(TITLE_MAX_CHARS);
    expect(capTitle(long).endsWith('…')).toBe(true);
    expect(capTitle('Short title')).toBe('Short title');
  });
});

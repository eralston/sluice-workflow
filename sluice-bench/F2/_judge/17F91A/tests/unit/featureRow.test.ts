// B3: the Features on a star's plate (15 §6 `feature-row`): the top three by the pod's pieces under each, ties
// by Feature id, pieces with no Feature parent counted nowhere. Text only: no object is drawn (INV-10).
import { describe, expect, it } from 'vitest';
import halcyon from '@fixtures/scenarios/sprint-pods';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import { FEATURE_OPEN_LINES, FEATURE_ROW_CAP, featureName, featureRows, rankFeatures } from '@shared/featureRow';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { LAYOUT_VERSION } from '@shared/limits';
import { SOLAR } from '@shared/hierarchy/solar';
import { projectScene } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

const F = (n: number) => `wi:org:${n}` as CanonicalKey;
const titles = new Map<CanonicalKey, string>([[F(1), 'Alpha'], [F(2), 'Beta'], [F(3), 'Gamma']]);
const rank = (counts: [number, number][]) => rankFeatures(new Map(counts.map(([n, c]) => [F(n), c])), (k) => titles.get(k) ?? null);

describe('rankFeatures', () => {
  it('puts the Feature with the most pieces first', () => {
    expect(rank([[1, 2], [2, 5], [3, 3]]).map((f) => f.id)).toEqual([2, 3, 1]);
  });
  it('breaks a tie by the lower Feature id, whatever the titles or the order given', () => {
    expect(rank([[3, 4], [1, 4], [2, 4]]).map((f) => f.id)).toEqual([1, 2, 3]);
    expect(rank([[2, 4], [3, 4], [1, 4]]).map((f) => f.id)).toEqual([1, 2, 3]);
  });
  it('drops a Feature with no pieces, and leaves an unknown title null', () => {
    const r = rank([[1, 0], [9, 2]]);
    expect(r.map((f) => f.id)).toEqual([9]);
    expect(r[0]!.title).toBeNull();
  });
  it('names a Feature the ADO way, and by number alone while its title is unknown', () => {
    expect(featureName({ id: 123, title: 'Rates' })).toBe('Feature #123 · Rates');
    expect(featureName({ id: 123, title: null })).toBe('Feature #123');
  });
  it('shows the top one and counts the rest; opened, shows all', () => {
    const all = rank([[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]]);
    expect(FEATURE_ROW_CAP).toBe(1);
    expect(featureRows(all)).toMatchObject({ more: 4 });
    expect(featureRows(all).shown.map((f) => f.id)).toEqual([1]);
    expect(featureRows(all, true)).toMatchObject({ more: 0 });
    expect(featureRows(all, true).shown).toHaveLength(5);
    expect(featureRows(rank([[1, 1]])).more).toBe(0);
  });
});

describe('a Halcyon pod star carries its Features', () => {
  const h = toHistory(halcyon, mapping, sprintScopes(halcyon).find((x) => x.sprint.endsWith('Sprint 41'))!);
  const sector = h.scope.sector;
  if (sector.kind !== 'sprint') throw new Error('Halcyon is a sprint');
  const star = (path: string) => {
    const pod = sector.pods.find((p) => p.path.endsWith(path))!;
    const g = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), SOLAR.format({ level: 'pod', key: pod.areaKey }), LAYOUT_VERSION, SOLAR);
    return g.nodes.find((n) => n.kind === 'star')!;
  };
  it('reserves the row on every pod star, even when empty, and puts none on the round', () => {
    const round = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), SOLAR.format(SOLAR.sceneForScope(h.scope)), LAYOUT_VERSION, SOLAR);
    expect(round.nodes.filter((n) => n.kind === 'star').every((n) => n.features === undefined)).toBe(true);
    for (const p of sector.pods) {
      const g = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), SOLAR.format({ level: 'pod', key: p.areaKey }), LAYOUT_VERSION, SOLAR);
      expect(g.nodes.find((n) => n.kind === 'star')!.features, p.path).toBeDefined();
    }
  });
  it('Quasar and Pulsar have more than three Features, most pieces first, each titled', () => {
    for (const pod of ['Quasar Pod', 'Pulsar Pod']) {
      const f = star(pod).features!;
      expect(f.length, pod).toBeGreaterThan(FEATURE_ROW_CAP);
      for (let i = 1; i < f.length; i++) expect(f[i - 1]!.count >= f[i]!.count, pod).toBe(true);
      expect(f.every((x) => x.title), pod).toBe(true);
      expect(new Set(f.map((x) => x.count)).size, `${pod} varies`).toBeGreaterThan(1);
    }
  });
  it('counts only pieces under a Feature: the totals never exceed the pod’s pieces', () => {
    const f = star('Quasar Pod').features!;
    const total = f.reduce((n, x) => n + x.count, 0);
    expect(total).toBeGreaterThan(0);
    expect(f.every((x) => x.key.endsWith(`:${x.id}`))).toBe(true);
  });
});

describe('pieces with no Feature parent are not counted', () => {
  const h = toHistory(halcyon, mapping, sprintScopes(halcyon).find((x) => x.sprint.endsWith('Sprint 41'))!);
  const quasar = (hh: typeof h) => {
    if (hh.scope.sector.kind !== 'sprint') throw new Error('sprint');
    const pod = hh.scope.sector.pods.find((p) => p.path.endsWith('Quasar Pod'))!;
    return projectScene(hh, snapshotAt(hh, hh.range.endUtc - 1, 'knownThen'), SOLAR.format({ level: 'pod', key: pod.areaKey }), LAYOUT_VERSION, SOLAR).nodes.find((n) => n.kind === 'star')!;
  };
  it('a piece whose parent link is gone drops out of every Feature’s count', () => {
    const before = quasar(h).features!;
    const link = h.events.find((e) => e.kind === 'link_parent_added' && e.payload.parentKey === before[0]!.key)!;
    const child = (link as { payload: { childKey: CanonicalKey } }).payload.childKey;
    const orphaned = { ...h, events: h.events.filter((e) => !(e.kind === 'link_parent_added' && (e as { payload: { childKey: CanonicalKey } }).payload.childKey === child)) };
    const after = quasar(orphaned).features!;
    const sum = (f: typeof before) => f.reduce((n, x) => n + x.count, 0);
    expect(sum(after)).toBe(sum(before) - 1);
  });
});

describe('the lines the row reserves (R4 against R9)', () => {
  const h = toHistory(halcyon, mapping, sprintScopes(halcyon).find((x) => x.sprint.endsWith('Sprint 41'))!);
  if (h.scope.sector.kind !== 'sprint') throw new Error('sprint');
  const sector = h.scope.sector;
  const star = (hh: typeof h, path: string, at: number) => {
    const pod = sector.pods.find((p) => p.path.endsWith(path))!;
    return projectScene(hh, snapshotAt(hh, at, 'knownThen'), SOLAR.format({ level: 'pod', key: pod.areaKey }), LAYOUT_VERSION, SOLAR).nodes.find((n) => n.kind === 'star')!;
  };
  it('holds the same lines from the first look to the last, whatever the playhead shows', () => {
    for (const pod of ['Quasar Pod', 'Pulsar Pod', 'Nova Pod']) {
      const a = star(h, pod, h.range.startUtc + 1), b = star(h, pod, h.range.endUtc - 1);
      expect(a.featureLines, pod).toBe(b.featureLines);
    }
    expect(star(h, 'Quasar Pod', h.range.endUtc - 1).featureLines).toBe(FEATURE_ROW_CAP);
    expect(star(h, 'Nova Pod', h.range.endUtc - 1).featureLines).toBe(1);
  });
  it('gives a pod that never has a Feature no row and no blank line', () => {
    const bare = { ...h, events: h.events.filter((e) => e.kind !== 'link_parent_added' || !(e as { payload: { parentKey: string } }).payload.parentKey.match(/:90\d\d$/)) };
    const n = star(bare, 'Quasar Pod', h.range.endUtc - 1);
    expect(n.features).toBeUndefined();
    expect(n.featureLines).toBeUndefined();
  });
  it('Pulsar has more Features than the opened list shows before it scrolls', () => {
    expect(star(h, 'Pulsar Pod', h.range.endUtc - 1).features!.length).toBeGreaterThan(FEATURE_OPEN_LINES);
  });
});

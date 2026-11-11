import { describe, expect, it } from 'vitest';
import stateMappingJson from '@config/state-mapping.json';
import type { StateMapping } from '@shared/contracts/history';
import { normalizeGuid } from '@shared/contracts/keys';
import { fnv1a32 } from '@shared/hash';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { resolveState } from '@shared/stateMapping';
import { scenarioKeys, toHistory } from '@fixtures/dsl';
import { scenarios } from '@fixtures/scenarios';

const mapping = stateMappingJson as StateMapping;

describe('keys and hashing', () => {
  it('normalizes GUIDs in every accepted form', () => {
    const canonical = '24281983-2530-4a9c-aeb7-88d60d57acfd';
    expect(normalizeGuid('2428198325304A9CAEB788D60D57ACFD')).toBe(canonical);
    expect(normalizeGuid(`{${canonical.toUpperCase()}}`)).toBe(canonical);
    expect(() => normalizeGuid('not-a-guid')).toThrow();
  });
  it('fnv1a32 is stable', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('star-chart')).toBe(fnv1a32('star-chart'));
  });
});

describe('state mapping (INV-05, INV-11)', () => {
  it('maps known states and neutralizes unknown ones', () => {
    expect(resolveState(mapping, 'Feature', 'Closed').stage).toBe('feature.whiteDwarf');
    expect(resolveState(mapping, 'User Story', 'Resolved').category).toBe('InProgress');
    const unknown = resolveState(mapping, 'User Story', 'Blocked');
    expect(unknown).toEqual({ kind: 'story', category: 'Unknown', stage: 'unknown' });
  });
});

describe.each(scenarios.map((s) => [s.name, s] as const))('scenario %s', (_name, s) => {
  const h = toHistory(s, mapping);
  const k = scenarioKeys(s);

  it('passes its expect checkpoints', () => {
    for (const ex of s.expectations) ex.check(snapshotAt(ex.scope ? toHistory(s, mapping, ex.scope) : h, ex.at, 'knownThen'), k);
  });

  it('has unique, sorted event keys', () => {
    const ks = h.events.map((e) => e.eventKey);
    expect(new Set(ks).size).toBe(ks.length);
  });

  it('seeks idempotently (INV-12)', () => {
    const t = s.range.startUtc + 3 * 86_400_000;
    const a = snapshotAt(h, t, 'knownThen');
    snapshotAt(h, s.range.endUtc, 'knownThen');
    const b = snapshotAt(h, t, 'knownThen');
    expect([...b.workItems.entries()]).toEqual([...a.workItems.entries()]);
    expect(b.links).toEqual(a.links);
  });
});

describe('projectScene: feature', () => {
  const s = scenarios[0]!;
  const h = toHistory(s, mapping);
  const k = scenarioKeys(s);
  const scene = `feature:${k.wi(101)}` as const;

  it('is pure, and keeps its frame across seeks (INV-14, as amended for the board 2026-10-09)', () => {
    const late = projectScene(h, snapshotAt(h, s.range.endUtc, 'knownThen'), scene, 1);
    const again = projectScene(h, snapshotAt(h, s.range.endUtc, 'knownThen'), scene, 1);
    expect(again).toEqual(late);
    const early = projectScene(h, snapshotAt(h, Date.parse('2026-08-28T00:00:00Z'), 'knownThen'), scene, 1);
    // The star and the board's frame (rings, columns, lane heads) never move; the bodies sit by who and stage.
    expect(early.board).toEqual(late.board);
    const star = (g: typeof late) => g.nodes.find((n) => n.kind === 'star')!.world;
    expect(star(early)).toEqual(star(late));
  });

  it('projects one star plus its Story/Bug children', () => {
    const g = projectScene(h, snapshotAt(h, s.range.endUtc, 'knownThen'), scene, 1);
    expect(g.nodes.filter((n) => n.kind === 'star')).toHaveLength(1);
    expect(g.nodes.filter((n) => n.kind === 'planet')).toHaveLength(5);
    expect(g.nodes.filter((n) => n.kind === 'anomaly')).toHaveLength(1);
    expect(g.edges.filter((e) => e.kind === 'orbit')).toHaveLength(6);
    expect(g.nodes.every((n) => n.openable === false)).toBe(true); // fixture mode
  });
});

describe('layout rules (06 §3)', () => {
  it('balances rows: fewest rows of at most 4, larger first', async () => {
    const { balancedRows } = await import('@shared/scene/layout');
    expect(balancedRows(5, 4)).toEqual([3, 2]);
    expect(balancedRows(6, 4)).toEqual([3, 3]);
    expect(balancedRows(7, 4)).toEqual([4, 3]);
    expect(balancedRows(9, 4)).toEqual([3, 3, 3]);
    expect(balancedRows(15, 4)).toEqual([4, 4, 4, 3]);
  });

  it('centers every row on the same axis (symmetric sector rows)', async () => {
    const { centeredRow } = await import('@shared/scene/layout');
    expect(centeredRow(3, 100)).toEqual([-100, 0, 100]);
    expect(centeredRow(2, 100)).toEqual([-50, 50]);
  });

  it('ring formation: two bodies per ring, rings nested outward and forward, labels outward', async () => {
    const { featureFormation, ringCounts } = await import('@shared/scene/layout');
    expect(ringCounts(1)).toEqual([1]);
    expect(ringCounts(5)).toEqual([2, 2, 1]);
    expect(ringCounts(6)).toEqual([2, 2, 2]);
    expect(ringCounts(8)).toEqual([2, 2, 2, 2]);
    expect(ringCounts(12)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(ringCounts(20)).toEqual([3, 3, 3, 3, 4, 4]); // past 6 rings, rings get fuller instead
    for (let n = 1; n <= 24; n++) {
      const f = featureFormation(n);
      expect(f).toHaveLength(n);
      // Rings are nested: each ring is wider and deeper than the one inside it.
      const rings = [...new Map(f.map((s) => [s.ring, s])).values()].sort((a, b) => a.ring - b.ring);
      for (let i = 1; i < rings.length; i++) expect(rings[i]!.rx).toBeGreaterThan(rings[i - 1]!.rx);
      for (const s of f) {
        expect((s.x / s.rx) ** 2 + (s.y / s.ry) ** 2).toBeCloseTo(1); // on its orbit
      }
      // Each ring's right end labels right; everything else (left end, interior, lone) labels left,
      // the start of a top-left-to-bottom-right read (06 §4).
      for (const ring of new Set(f.map((s) => s.ring))) {
        const xs = f.filter((s) => s.ring === ring).sort((a, b) => a.x - b.x);
        if (xs.length > 1) expect(xs.at(-1)!.labelSide).toBe('right');
        for (const m of xs.slice(0, xs.length > 1 ? -1 : 1)) expect(m.labelSide).toBe('left');
      }
      // Mirror symmetry: every body has a twin at -x on the same ring.
      for (const s of f) expect(f.some((o) => o.ring === s.ring && Math.abs(o.x + s.x) < 1e-6 && Math.abs(o.y - s.y) < 1e-6)).toBe(true);
    }
  });
});

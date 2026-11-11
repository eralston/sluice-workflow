// 19 P1: Solar's round previews each region as it opens (R3): a planet per seat, by the region's own
// rule, and its objectives and threats as counts (R4); no stations or ships; nothing selectable. While
// history streams, today's assignees stand in, and the seats history adds never move a planet
// (INV-14). The v0 Sprints round keeps its miniatures. On pod-sprint's Sprint 13 (fixture data only).
import { describe, expect, it } from 'vitest';
import crmQuarter from '@fixtures/scenarios/v1/crm-quarter';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { scenario, sprintScopes, toHistory } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import type { ViewGraph } from '@shared/contracts/view';
import { SOLAR } from '@shared/hierarchy/solar';
import { solarSource } from '@shared/hierarchy/solarSource';
import { SPRINTS } from '@shared/hierarchy/sprints';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { PREVIEW, previewSlot, projectPreview } from '@shared/scene/project/preview';
import type { ProjectCtx } from '@shared/scene/project/ctx';
import { projectScene } from '@shared/scene/projectScene';
import { countsLine, terminology } from '@shared/engine/terminology';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { Cache } from '../../src/main/db/cache';
import { loadLevelHistory } from '../../src/main/sync/levels';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { harness, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';

/** The chart register's two nouns as the Star Chart theme has them (`theme/starChart/words.ts`; solar.spec reads the real ones). */
const chartWords = { role: { objective: { one: 'asteroid', many: 'asteroids' }, threat: { one: 'hive ship', many: 'hive ships' } } };

const scope = sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!;
const h: ScopeHistory = toHistory(podSprint, mapping, scope);
const sector = h.scope.sector.kind === 'sprint' ? h.scope.sector : null;
const pods = sector?.pods ?? [];

function round(b: ScopeHistory, hier = SOLAR): ViewGraph {
  const s = b.scope.sector;
  if (s.kind !== 'sprint') throw new Error('not a sprint bundle');
  return projectScene(b, snapshotAt(b, b.range.endUtc - 1, 'knownThen'), hier.format({ level: 'sprint', key: s.iterationKey }), LAYOUT_VERSION, hier);
}

const previewOf = (g: ViewGraph, starPk: string) => g.nodes.filter((n) => n.projectionKey.startsWith(`${starPk}|preview|`));

describe('Solar’s round: each pod star previews its region (19 P1)', () => {
  const g = round(h);
  const stars = g.nodes.filter((n) => n.kind === 'star');

  it('draws one planet per seat the region opens with, its objectives and threats as counts, and nothing else', () => {
    expect(stars.map((s) => s.label)).toEqual(['Harbor Pod', 'Lantern Pod']);
    for (const star of stars) {
      const nodes = previewOf(g, star.projectionKey);
      const region = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), SOLAR.format({ level: 'pod', key: star.canonicalKey }), LAYOUT_VERSION, SOLAR);
      const seats = new Set(region.nodes.filter((n) => n.kind === 'seat').map((n) => n.canonicalKey));
      expect(new Set(nodes.filter((n) => n.kind === 'seat').map((n) => n.projectionKey.split('|preview|seat|')[1]))).toEqual(seats);
      expect(seats).toEqual(new Set(solarSource.facts(h, { level: 'pod', key: star.canonicalKey }).seats));
      // A preview planet is its homeworld inside: the same seed, so the same world.
      for (const n of nodes.filter((x) => x.kind === 'seat')) {
        const inside = region.nodes.find((r) => r.kind === 'seat' && n.projectionKey.endsWith(`|${r.canonicalKey}`))!;
        expect(n.seed).toBe(inside.seed);
      }
      expect(new Set(nodes.map((n) => n.kind))).toEqual(new Set(['seat', 'objective', 'threat']));
      expect(nodes.every((n) => !n.selectable && !n.labelled && n.canonicalKey === star.canonicalKey)).toBe(true);
      expect(g.nodes.some((n) => n.kind === 'facility' || n.kind === 'captain' || n.kind === 'planet' || n.kind === 'anomaly')).toBe(false);
    }
    const harbor = previewOf(g, stars[0]!.projectionKey);
    expect([harbor.filter((n) => n.kind === 'objective').length, harbor.filter((n) => n.kind === 'threat').length]).toEqual([11, 5]); // every one (22 A1)
  });

  it('labels a pod star with its name and counts by role, never its path; the inspector keeps the path and the done count (Q11; 22 A3, A4)', () => {
    expect(stars[0]!.roleCounts).toEqual({ objective: 11, threat: 5, done: 10 });
    expect(stars[0]!.path).toBe('Tidewater Array\\Harbor Pod');
    expect(stars[0]!.meta).toBe('16 items');
    expect(stars[0]!.detail).toBe('Area Path · 16 items · 10 done');
    expect(stars[1]!.meta).toBe('2 items');
    for (const star of stars) expect(star.meta).not.toContain('\\');
    // The region's star reads the same, above it, its counts shown at rest (no `labelCompact`).
    const region = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), SOLAR.format({ level: 'pod', key: pods[0]!.areaKey }), LAYOUT_VERSION, SOLAR);
    const own = region.nodes.find((n) => n.kind === 'star')!;
    expect({ counts: own.roleCounts, side: own.labelSide, layout: own.labelLayout, compact: own.labelCompact }).toEqual({ counts: stars[0]!.roleCounts, side: 'above', layout: 'vertical', compact: undefined });
  });

  it('words the counts in the register (the chart’s, the source’s), leaving a zero part out (22 A3)', () => {
    const pack = packFor(h);
    const chart = terminology(pack, 'chart', { chart: chartWords, mapping: h.stateMapping });
    const source = terminology(pack, 'source', { mapping: h.stateMapping });
    expect(countsLine(chart, { objective: 12, threat: 4, done: 10 })).toBe('12 asteroids · 4 hive ships');
    expect(countsLine(chart, { objective: 1, threat: 1, done: 0 })).toBe('1 asteroid · 1 hive ship');
    expect(countsLine(chart, { objective: 0, threat: 3, done: 0 })).toBe('3 hive ships');
    expect(countsLine(chart, { objective: 0, threat: 0, done: 0 })).toBe('0 asteroids');
    expect(countsLine(chart, { objective: 12, threat: 4, done: 10 }, true)).toBe('12 asteroids · 4 hive ships · 10 done');
    expect(countsLine(source, { objective: 12, threat: 4, done: 10 })).toMatch(/^12 User Stories · 4 Bugs$/);
  });

  it('counts the same on the plate and in the inspector for every pack (a CRM pod read 0 items in the inspector, 19 review)', () => {
    const crmScope = sprintScopes(crmQuarter).find((x) => x.sprint.endsWith('\\Q3 2026'))!;
    const crm = round(toHistory(crmQuarter, crmQuarter.mapping!, crmScope));
    const crmStars = crm.nodes.filter((n) => n.kind === 'star');
    expect(crmStars.length).toBeGreaterThan(0);
    for (const star of crmStars) {
      const items = /^(\d+) items?$/.exec(star.meta ?? '')?.[1];
      expect(star.roleCounts!.objective + star.roleCounts!.threat, star.label).toBe(Number(items));
      expect(items, star.label).toBeDefined();
      expect(star.detail, star.label).toMatch(new RegExp(`^\\S.* · ${items} items?( · \\d+ done)?$`));
    }
    expect(crmStars.some((s) => !/· 0 items/.test(s.detail ?? ''))).toBe(true);
    // Its look reads its work too: a pod with items is never the empty pod's sketch.
    for (const star of crmStars) if (!/^0 items/.test(star.meta ?? '')) expect(star.stage, star.label).not.toBe('feature.faint');
  });

  it('draws every objective and threat, in groups of five by its own star, growing outward: a count that grows moves none (19 review, R4; 22 A1)', () => {
    const place = (objectives: number, threats: number) => {
      const ctx = { graph: { nodes: [], edges: [] } } as unknown as ProjectCtx;
      projectPreview(ctx, 'star', 'pod' as never, 0, 0, { seats: [], objectives, threats });
      const at = (kind: string) => ctx.graph.nodes.filter((n) => n.kind === kind).map((n) => n.world);
      return { rocks: at('objective'), hives: at('threat') };
    };
    // The drawn count is the true count, past the old caps (24 rocks, 5 hive marks).
    for (const n of [0, 1, 5, 6, 24, 25, 60]) expect(place(n, n).rocks.length).toBe(n);
    for (const n of [0, 1, 5, 6, 40]) expect(place(n, n).hives.length).toBe(n);
    const one = place(1, 1);
    const two = place(2, 2);
    const full = place(60, 40);
    expect(two.rocks.slice(0, 1)).toEqual(one.rocks);
    expect(full.rocks.slice(0, 2)).toEqual(two.rocks);
    expect(full.hives.slice(0, 2)).toEqual(two.hives);
    // Groups of five: each group's marks sit nearer each other than the next group's.
    const group = (ws: { x: number; y: number }[], g: number) => ws.slice(g * 5, g * 5 + 5);
    const centre = (ws: { x: number; y: number }[]) => ({ x: ws.reduce((a, w) => a + w.x, 0) / ws.length, y: ws.reduce((a, w) => a + w.y, 0) / ws.length });
    for (const ws of [full.rocks, full.hives]) {
      const spread = Math.max(...group(ws, 0).map((w) => Math.hypot(w.x - centre(group(ws, 0)).x, w.y - centre(group(ws, 0)).y)));
      const apart = Math.hypot(centre(group(ws, 0)).x - centre(group(ws, 1)).x, centre(group(ws, 0)).y - centre(group(ws, 1)).y);
      expect(apart).toBeGreaterThan(2 * spread);
    }
    // Rocks to the left of the star, hive marks to its right; 60 rocks and 40 hive marks within the reach.
    for (const w of full.rocks) expect(w.x).toBeLessThan(0);
    for (const w of full.hives) expect(w.x).toBeGreaterThan(0);
    for (const w of [...full.rocks, ...full.hives]) {
      expect(Math.abs(w.x) + w.r).toBeLessThanOrEqual(PREVIEW.reachX);
      expect(Math.abs(w.y) + w.r).toBeLessThanOrEqual(PREVIEW.reachY);
    }
    // A lone rock is near its own star: closer than halfway to a neighbour's, whatever the field's spacing.
    expect(Math.hypot(one.rocks[0]!.x, one.rocks[0]!.y)).toBeLessThan(PREVIEW.clusterX + PREVIEW.rockStep);
  });

  it('keeps v0’s Sprints round as it was: planets and anomalies, the done count on the plate', () => {
    const v0 = round(h, SPRINTS);
    expect(v0.nodes.some((n) => n.kind === 'planet')).toBe(true);
    expect(v0.nodes.some((n) => n.projectionKey.includes('|preview|'))).toBe(false);
    expect(v0.nodes.find((n) => n.kind === 'star')!.meta).toBe('Area Path · 16 items · 10 done');
    expect(v0.nodes.find((n) => n.kind === 'star')!.detail).toBeUndefined();
  });

  it('fills its ring from the front outward, then wider rings, and a slot never moves with the count', () => {
    const at = (i: number) => {
      const { angle, scale } = previewSlot(i);
      return { x: PREVIEW.ringRx * scale * Math.cos(angle), y: PREVIEW.ringRy * scale * Math.sin(angle), angle, scale };
    };
    expect(Math.sin(at(0).angle)).toBeGreaterThan(0.95); // the front of the ring (y down)
    expect(Math.sign(Math.cos(at(0).angle))).toBe(-Math.sign(Math.cos(at(1).angle))); // the next one on the other side
    expect(at(PREVIEW.seatSlots - 1).scale).toBe(1);
    expect(at(PREVIEW.seatSlots).scale).toBeGreaterThan(1); // a full ring hands on to a wider one
    // Two rings (15 seats): no two planets touch, and all stay inside the preview's reserved reach.
    const all = Array.from({ length: PREVIEW.seatSlots * 2 - 1 }, (_, i) => at(i));
    for (const [i, a] of all.entries()) {
      for (const b of all.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(PREVIEW.planetR * 2);
      expect(Math.abs(a.x) + PREVIEW.planetR).toBeLessThanOrEqual(PREVIEW.reachX);
      expect(a.y + PREVIEW.planetR).toBeLessThanOrEqual(PREVIEW.reachY);
    }
  });

  it('starts from today’s assignees while history streams, and the people it adds never move a planet (R4, INV-14)', async () => {
    const hs = await harness(podSprint, Cache.open(':memory:'));
    const sync = syncScopeOf(podSprint, scope);
    const ctx = { client: hs.client, cache: hs.cache, mapping, clock: hs.clock };
    const stream = new SprintStream(ctx, sync, { changed: () => {} });
    const bundle = () => loadLevelHistory(ctx, sync, h.range);
    await stream.look();
    const first = round(bundle());
    await stream.fill();
    const after = round(bundle());
    stream.close();
    const seats = (x: ViewGraph) => new Map(x.nodes.filter((n) => n.projectionKey.includes('|preview|seat|')).map((n) => [n.projectionKey, n.world]));
    const before = seats(first);
    const now = seats(after);
    expect(before.size).toBeGreaterThan(0);
    expect(now.size).toBeGreaterThan(before.size); // history adds people (Lantern Pod's earlier assignee)
    for (const [pk, w] of before) expect(now.get(pk)).toEqual(w);
    // The field itself doesn't reflow: every star stays where it was.
    const starAt = (x: ViewGraph) => x.nodes.filter((n) => n.kind === 'star').map((n) => [n.projectionKey, n.world.x, n.world.y]);
    expect(starAt(after)).toEqual(starAt(first));
  });

  it('holds every planet in place whatever order the histories arrive in (R4, INV-14)', async () => {
    // Two people history adds, arriving in reverse of the order they first held a piece: Bo's item
    // changed last, so its history comes first, but Ada held hers earlier. Invented names (INV-18).
    const POD = 'Brindle Works\\Quay Pod';
    const SPRINT = 'Brindle Works\\Sprint 4';
    const s = scenario('preview-stream', { project: 'Brindle Works', tz: 'America/Los_Angeles', range: ['2026-09-28T07:00:00Z', '2026-10-12T07:00:00Z'] })
      .area('Brindle Works', 23000)
      .area(POD, 23001, { favorite: true, defaultScope: true })
      .iteration(SPRINT, 23101, '2026-09-28T07:00:00Z', '2026-10-12T07:00:00Z')
      .person('ada', 'Ada Quill').person('bo', 'Bo Fenwick').person('cyr', 'Cyr Lattimer').person('dov', 'Dov Ashgrove')
      .at('2026-09-28T16:00:00Z')
      .story(30101, 'Tide gauge feed', { area: POD, iteration: SPRINT, assignee: 'ada' })
      .story(30102, 'Quay lamp schedule', { area: POD, iteration: SPRINT })
      .at('2026-09-30T16:00:00Z').assign(30102, 'bo')
      .at('2026-10-02T16:00:00Z').assign(30101, 'cyr')
      .at('2026-10-05T16:00:00Z').assign(30102, 'dov')
      .build();
    const sc = sprintScopes(s)[0]!;
    const full = toHistory(s, mapping, sc);
    const hs = await harness(s, Cache.open(':memory:'));
    const sync = syncScopeOf(s, sc);
    const ctx = { client: hs.client, cache: hs.cache, mapping, clock: hs.clock };
    const seen = new Map<string, ViewGraph['nodes'][number]['world']>();
    let partWay = false; // a look with Bo's history in and Ada's not: the reverse order happened
    const check = () => {
      const b = loadLevelHistory(ctx, sync, full.range);
      const has = (id: number) => (b.coverage.history ?? []).some((k) => k.endsWith(`:${id}`));
      if (has(30102) && !has(30101)) partWay = true;
      const now = round(b).nodes.filter((n) => n.projectionKey.includes('|preview|seat|'));
      // Once drawn, a planet stays, and stays where it was.
      for (const [pk, w] of seen) expect(now.find((n) => n.projectionKey === pk)?.world).toEqual(w);
      for (const n of now) seen.set(n.projectionKey, n.world);
    };
    // One task at a time, so the histories land newest-changed first whatever else (pictures) is queued:
    // the reverse order this test needs must not depend on how long an idle task takes.
    const stream = new SprintStream(ctx, sync, { changed: check, concurrency: 1 });
    await stream.look();
    check();
    expect(seen.size).toBe(2); // today's assignees: Cyr and Dov
    await stream.fill();
    check();
    stream.close();
    expect(partWay).toBe(true);
    // In the end, the region's own four seats.
    const quay = full.scope.sector.kind === 'sprint' ? full.scope.sector.pods[0]!.areaKey : null;
    expect(new Set([...seen.keys()].map((pk) => pk.split('|preview|seat|')[1]))).toEqual(new Set(solarSource.facts(full, { level: 'pod', key: quay! }).seats));
    expect(seen.size).toBe(4);
  });
});

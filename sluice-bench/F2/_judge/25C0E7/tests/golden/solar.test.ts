// The solar goldens (14 §5, 17 W2-T1): pod-sprint's Sprint 13 round, each of its regions, and the
// dense pod, meridian-sprint's Sprint 7 (22 A13: 12 homeworlds, `meridian.*.json`), and Halcyon's Meteor Pod (27 F1:
// 37 stations on 3 seats, `halcyon-meteor.*.json`). The plan
// (the fixed setup over the loaded history) and the projected scene at 5 playheads, and the round
// itself with its previews (19 P1, at the round's end), so a change to
// the layout or the projection shows as a diff. Bump SOLAR_LAYOUT_VERSION with a geometry change
// and regenerate both in the same change.
import { describe, expect, it } from 'vitest';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import meridianSprint from '@fixtures/scenarios/v1/meridian-sprint';
import halcyon from '@fixtures/scenarios/sprint-pods';
import { sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import type { ViewGraph } from '@shared/contracts/view';
import { planSolar } from '@shared/engine/solar/plan';
import type { SolarPlan } from '@shared/engine/types';
import { SOLAR } from '@shared/hierarchy/solar';
import { solarSource } from '@shared/hierarchy/solarSource';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { mapping } from './helpers';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A plan as plain, rounded JSON (its slots are a Map). */
function plainPlan(p: SolarPlan) {
  return {
    version: p.version, star: p.star,
    seats: p.seats.map((s) => ({ ...s, angle: r2(s.angle), x: r2(s.x), y: r2(s.y), ry: r2(s.ry) })),
    slots: [...p.slots.values()].map((s) => ({ ...s, x: r2(s.x), y: r2(s.y), r: r2(s.r) })),
    formations: p.formations.map((f) => ({ ...f, cx: r2(f.cx), cy: r2(f.cy), memberR: r2(f.memberR) })),
    frontier: { rx0: r2(p.frontier.rx0), rx1: r2(p.frontier.rx1), ry0: r2(p.frontier.ry0), ry1: r2(p.frontier.ry1) },
    stations: p.stations.map((s) => ({ ...s, x: r2(s.x), y: r2(s.y), slots: s.slots.map((c) => ({ ...c, angle: r2(c.angle) })) })),
  };
}

/** A solar graph as plain JSON: what each node shows, and the lists. */
function plainSolarGraph(g: ViewGraph) {
  return {
    sceneKey: g.sceneKey, atUtc: new Date(g.atUtc).toISOString(),
    nodes: g.nodes.map((n) => ({
      pk: n.projectionKey, kind: n.kind, asset: n.asset, stage: n.stage, x: Math.round(n.world.x), y: Math.round(n.world.y), r: Math.round(n.world.r),
      label: n.label, meta: n.meta, ...(n.roleCounts ? { counts: n.roleCounts } : {}), ...(n.cluster ? { cluster: n.cluster } : {}), ...(n.attach ? { attach: n.attach.to } : {}),
      ...(n.compound ? { compound: { ...n.compound, slots: n.compound.slots.map((c) => `${c.role}:${c.key}@${c.slot}:${c.signal.rung}`) } } : {}),
    })),
    edges: g.edges.map((e) => e.key),
    lists: g.lists,
  };
}

const ROUNDS: { s: Scenario; sprint: string; file: string; regions: string[] }[] = [
  { s: podSprint, sprint: 'Sprint 13', file: 'solar', regions: ['Harbor Pod', 'Lantern Pod'] },
  { s: meridianSprint, sprint: 'Sprint 7', file: 'meridian', regions: ['Convoy Planning Pod', 'Signals Pod'] },
];

describe.each(ROUNDS)('the solar goldens: $s.name, $sprint', ({ s: sc, sprint, file, regions }) => {
  const h: ScopeHistory = toHistory(sc, mapping, sprintScopes(sc).find((x) => x.sprint.endsWith(sprint))!);
  const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
  /** The start, the quarters and the last instant of the round. */
  const playheads = [0, 0.25, 0.5, 0.75, 1].map((q) => (q === 1 ? h.range.endUtc - 1 : Math.round(h.range.startUtc + (h.range.endUtc - h.range.startUtc) * q)));

  it('has both regions of the round', () => {
    expect(pods.map((p) => p.label)).toEqual(regions);
  });

  it('plans each region as it does today', async () => {
    const out = pods.map((pod) => ({ region: pod.label, plan: plainPlan(planSolar(solarSource.facts(h, { level: 'pod', key: pod.areaKey }), solarSource.pack!(h))) }));
    await expect(JSON.stringify(out, null, 1) + '\n').toMatchFileSnapshot(`./__golden__/${file}.plan.json`);
  });

  it('projects each region at 5 playheads as it does today', async () => {
    const out = pods.map((pod) => {
      const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
      return { region: pod.label, graphs: playheads.map((t) => plainSolarGraph(projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION, SOLAR))) };
    });
    await expect(JSON.stringify(out, null, 1) + '\n').toMatchFileSnapshot(`./__golden__/${file}.scenes.json`);
  });

  it('projects the round, each pod star with its preview, as it does today (19 P1)', async () => {
    const scene = SOLAR.format(SOLAR.sceneForScope(h.scope));
    const g = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), scene, LAYOUT_VERSION, SOLAR);
    await expect(JSON.stringify(plainSolarGraph(g), null, 1) + '\n').toMatchFileSnapshot(`./__golden__/${file}.round.json`);
  });
});

// Halcyon's Meteor Pod (27 F1): a run of 36 one-seat stations beside a 37th, on three seats. The goldens give F2 to F4 a diff
// to read when the engine changes how that crowd plays; the plan and the scenes themselves are the layout's, not the run's.
describe('the solar goldens: sprint-pods, Sprint 41, Meteor Pod (27 F1)', () => {
  const h: ScopeHistory = toHistory(halcyon, mapping, sprintScopes(halcyon).find((x) => x.sprint.endsWith('Sprint 41'))!);
  const pod = (h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : []).find((p) => p.label === 'Meteor Pod')!;
  const plan = () => planSolar(solarSource.facts(h, { level: 'pod', key: pod.areaKey }), solarSource.pack!(h));
  const playheads = [h.range.startUtc, Date.parse('2026-09-16T17:00:30Z'), Date.parse('2026-09-16T23:00:00Z'), Date.parse('2026-09-17T22:00:00Z'), h.range.endUtc - 1];

  it('plans 37 stations on 3 seats, and no two stations\' discs overlap in the world', () => {
    const p = plan();
    expect(p.stations.length).toBe(37);
    expect(p.seats.length).toBe(3);
    const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
    const g = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), scene, LAYOUT_VERSION, SOLAR);
    const fac = g.nodes.filter((n) => n.kind === 'facility');
    expect(fac.length).toBe(37);
    for (let i = 0; i < fac.length; i++) for (let j = i + 1; j < fac.length; j++) {
      const a = fac[i]!.world, b = fac[j]!.world;
      expect(Math.hypot(a.x - b.x, a.y - b.y), `${fac[i]!.label} and ${fac[j]!.label}`).toBeGreaterThanOrEqual(a.r + b.r);
    }
  });

  it('plans the pod as it does today', async () => {
    await expect(JSON.stringify([{ region: pod.label, plan: plainPlan(plan()) }], null, 1) + '\n').toMatchFileSnapshot('./__golden__/halcyon-meteor.plan.json');
  });

  it('projects the pod at range start, mid-opening, evening of the run, the second day and the end as it does today', async () => {
    const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
    const out = [{ region: pod.label, graphs: playheads.map((t) => plainSolarGraph(projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION, SOLAR))) }];
    await expect(JSON.stringify(out, null, 1) + '\n').toMatchFileSnapshot('./__golden__/halcyon-meteor.scenes.json');
  });
});

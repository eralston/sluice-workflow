// 23 C8 (08 §7): the frontier's push-out clears the stations as well as the groups and the loiter rings.
// At sampled playheads of every sprint fixture, at several camera scales, no frontier piece's hit
// overlaps a station's, after the whole screen-terms pass (`placeInScreen`). Stations stay where the
// plan put them (a ring station sits exactly on its slot): it is the piece that moves. The module touches
// no DOM or Pixi at import (as placeStations.test.ts).
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import halcyon from '../../fixtures/scenarios/sprint-pods';
import podSprint from '../../fixtures/scenarios/v1/pod-sprint';
import meridianSprint from '../../fixtures/scenarios/v1/meridian-sprint';
import { sprintScopes, toHistory } from '../../fixtures/dsl';
import type { ViewGraph, ViewNode } from '@shared/contracts/view';
import { SOLAR } from '@shared/hierarchy/solar';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import type { CanonicalKey } from '@shared/contracts/keys';
import { RING_MAX_SCALE } from '@shared/engine/solar/stations';
import { GEOMETRY, SQUASH } from '@shared/engine/solar/version';
import { hitRadius, screenRadius } from '@shared/scene/sizing';
import { mapping } from '../golden/helpers';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

const CHART = resolve(__dirname, '../../src/renderer/src/chart');
const { placeInScreen } = (await import(/* @vite-ignore */ `${CHART}/scenes/placement.ts`)) as {
  placeInScreen(effective: Map<string, ViewNode>, scale: number, lane: undefined, solar?: ViewGraph['solar']): void;
};
const { clearStationMemo } = (await import(/* @vite-ignore */ `${CHART}/scenes/placeFormation.ts`)) as { clearStationMemo(): void };

const SAMPLES = 24;
// From a far fit (the dense pod) to a near one; the floors outgrow the plan's gaps at the small ones.
const SCALES = [0.02, 0.03, 0.05, 0.08, 0.12];

/** The scene's nodes as the renderer holds them before placing: each at its floored on-screen size. */
const effectiveOf = (g: ViewGraph, scale: number): Map<string, ViewNode> =>
  new Map(g.nodes.map((n) => {
    const sr = n.maxScale ? Math.min(screenRadius(n, scale), n.world.r * n.maxScale * scale) : screenRadius(n, scale);
    return [n.projectionKey, { ...n, world: { ...n.world, r: sr / scale } }] as const;
  }));

describe.each([halcyon, podSprint, meridianSprint])('frontier pieces clear stations: $name', (sc) => {
  it('no frontier piece overlaps a station at any sampled playhead or scale', () => {
    let frontier = 0;
    let stations = 0;
    const bad: string[] = [];
    for (const scope of sprintScopes(sc)) {
      const h = toHistory(sc, mapping, scope);
      const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
      for (const pod of pods) {
        const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
        for (let i = 0; i <= SAMPLES; i++) {
          const t = Math.min(h.range.endUtc - 1, Math.round(h.range.startUtc + ((h.range.endUtc - h.range.startUtc) * i) / SAMPLES));
          const g = projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION, SOLAR);
          if (!g.solar) continue;
          const unassigned = new Set(g.solar.unassigned);
          for (const scale of SCALES) {
            clearStationMemo();
            const eff = effectiveOf(g, scale);
            placeInScreen(eff, scale, undefined, g.solar);
            const out = [...eff.values()];
            const pieces = out.filter((n) => unassigned.has(n.projectionKey));
            const hulls = out.filter((n) => n.kind === 'facility');
            frontier += pieces.length;
            stations += hulls.length;
            for (const p of pieces) for (const s of hulls) {
              const gap = Math.hypot(p.world.x - s.world.x, p.world.y - s.world.y) - hitRadius(p, scale) - hitRadius(s, scale);
              if (gap < -1e-6) bad.push(`${pod.label} @${scale} t${i}: ${p.label} / ${s.label} by ${gap.toFixed(1)}`);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
    expect(stations).toBeGreaterThan(0);
    if (sc === halcyon) expect(frontier).toBeGreaterThan(0);
  });
});

describe('the push-out on a hand-built board', () => {
  // Not a layout the planner makes for ring stations (it keeps them inside the belt and the push only goes
  // outward): it proves the push-out's own rule. The reachable case is the modeless station below.
  // A seat on a 3000 orbit, a formation of bugs that reaches the frontier belt, one unassigned piece on
  // the belt's middle beside it, and a ring station the plan put just past where the push-out would take it.
  const rx0 = 4400;
  const rx1 = rx0 + (2 * GEOMETRY.frontierR) / SQUASH + 2 * GEOMETRY.frontierPad;
  const mid = (rx0 + rx1) / 2;
  const scale = 0.05;
  const node = (pk: string, kind: ViewNode['kind'], x: number, y: number, r: number): ViewNode => ({
    projectionKey: pk, canonicalKey: pk as CanonicalKey, kind, world: { x, y, r }, stage: '', seed: 1, label: pk,
    openable: false, selectable: true, labelled: true, flags: {}, evidence: [],
  });
  const formation = { id: 'f1', seat: 'id:org:wren' as CanonicalKey, role: 'threat' as const, cx: mid - 300, cy: 0, memberR: GEOMETRY.frontierR, pitch: 400, outerR: 600, offsets: [{ x: 0, y: 0 }, { x: 0, y: 400 }, { x: 0, y: -400 }], members: [] };
  const board = (stations: NonNullable<ViewGraph['solar']>['stations']): NonNullable<ViewGraph['solar']> => ({
    star: { x: 0, y: 0 },
    seats: [{ person: 'id:org:wren' as CanonicalKey, index: 0, angle: 0, rx: 3000, ry: 3000 * SQUASH, x: 3000, y: 0, arc: 0.6 }],
    frontier: { rx0, rx1, ry0: rx0 * SQUASH, ry1: rx1 * SQUASH },
    formations: [formation],
    unassigned: ['wi:drifter'],
    stations,
  });
  const run = (stations: NonNullable<ViewGraph['solar']>['stations'], withStation: ViewNode[]) => {
    const solar = board(stations);
    const members = formation.offsets.map((o, i) => ({ ...node(`wi:m${i}`, 'threat', formation.cx + o.x, formation.cy + o.y, GEOMETRY.frontierR), cluster: { id: 'f1', index: i, size: 3 } }) as ViewNode);
    const nodes = [node('wi:drifter', 'threat', mid, 0, GEOMETRY.frontierR), ...members, ...withStation];
    clearStationMemo();
    const eff = effectiveOf({ nodes } as ViewGraph, scale);
    placeInScreen(eff, scale, undefined, solar);
    return eff;
  };

  it('moves out past the group, and clears a station planned where it would have landed', () => {
    const free = run([], []).get('wi:drifter')!;
    expect(free.world.x, 'the group must push the piece out, or this proves nothing').toBeGreaterThan(mid + 1);
    // A ring station planned on the pushed spot's far side, close enough that the old push-out would touch it.
    const dock = { ...node('repo:dock', 'facility', free.world.x + 30 / scale, free.world.y, GEOMETRY.facilityR), maxScale: RING_MAX_SCALE };
    const planned = [{ facility: dock.canonicalKey, x: dock.world.x, y: dock.world.y, mode: 'inner' as const, size: 1 }];
    const eff = run(planned, [dock]);
    const piece = eff.get('wi:drifter')!;
    const hull = eff.get('repo:dock')!;
    expect({ x: hull.world.x, y: hull.world.y }).toEqual({ x: dock.world.x, y: dock.world.y }); // the station never moves for it
    expect(Math.hypot(piece.world.x - hull.world.x, piece.world.y - hull.world.y)).toBeGreaterThanOrEqual(hitRadius(piece, scale) + hitRadius(hull, scale));
    // And a station planned but not drawn keeps it clear all the same (INV-14: the plan and the scale alone).
    const undrawn = run(planned, []).get('wi:drifter')!;
    expect(undrawn.world).toEqual(piece.world);
  });

  it('keeps clear of a modeless (older-graph) station wherever its spiral settles it just outside the belt', () => {
    const free = run([], []).get('wi:drifter')!;
    const dock = { ...node('repo:old-dock', 'facility', free.world.x + 30 / scale, free.world.y, GEOMETRY.facilityR), maxScale: RING_MAX_SCALE };
    const planned = [{ facility: dock.canonicalKey, x: dock.world.x, y: dock.world.y }]; // no mode
    const eff = run(planned, [dock]);
    const piece = eff.get('wi:drifter')!;
    const hull = eff.get('repo:old-dock')!;
    expect(Math.hypot(piece.world.x - hull.world.x, piece.world.y - hull.world.y)).toBeGreaterThanOrEqual(hitRadius(piece, scale) + hitRadius(hull, scale));
  });
});

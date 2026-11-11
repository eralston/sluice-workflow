// The solar station pass in screen terms (v1, 17 W4-T2; INV-14, seek equals play): a station's spot
// depends on the plan and the scale only. Which frontier pieces and other stations are drawn, and the
// order the renderer happens to hold them in, never move it, and stations keep clear of each other
// whoever is drawn (every planned spot is in `solar.stations`). Hand-built board, invented keys;
// the module touches no DOM or Pixi at import (as labelTiers.test.ts).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ViewGraph, ViewNode } from '@shared/contracts/view';
import { GEOMETRY, SQUASH } from '@shared/engine/solar/version';
import { ATTACH_GAP_PX, hitRadius } from '@shared/scene/sizing';

const CHART = resolve(__dirname, '../../src/renderer/src/chart');
const { placeStations, clearStationMemo, stationMemoStats } = (await import(/* @vite-ignore */ `${CHART}/scenes/placeFormation.ts`)) as {
  placeStations(effective: Map<string, ViewNode>, scale: number, solar: ViewGraph['solar']): void;
  clearStationMemo(): void;
  stationMemoStats: { hits: number; computes: number };
};

// One seat on a 3000 orbit, and the frontier belt outside it.
const rx0 = 4400;
const rx1 = rx0 + (2 * GEOMETRY.frontierR) / SQUASH + 2 * GEOMETRY.frontierPad;
const mid = (rx0 + rx1) / 2;

const node = (pk: string, kind: ViewNode['kind'], x: number, y: number, r: number): ViewNode => ({
  projectionKey: pk, canonicalKey: pk as CanonicalKey, kind, world: { x, y, r }, stage: '', seed: 1, label: pk,
  openable: false, selectable: true, labelled: true, flags: {}, evidence: [],
});
// Two stations the plan put just outside the belt (a facility's reach apart), and a frontier piece
// on the belt's middle beside the first.
const harbor = () => node('repo:harbor-relay', 'facility', rx1 + 380, 0, GEOMETRY.facilityR);
const tide = () => node('repo:tide-gate', 'facility', 0, -(rx1 + 380) * SQUASH, GEOMETRY.facilityR);
const drifter = () => node('wi:drifting-bug', 'threat', mid, 0, GEOMETRY.frontierR);
// A third station the plan put close beside the first: clear in world units, not at small scales.
const lamp = () => node('repo:lamp-room', 'facility', rx1 + 380, 640, GEOMETRY.facilityR);

// The plan's order: arrival, then key (lamp-room arrives first).
const planned = [lamp(), harbor(), tide()].map((n) => ({ facility: n.canonicalKey, x: n.world.x, y: n.world.y }));
const solar: NonNullable<ViewGraph['solar']> = {
  star: { x: 0, y: 0 },
  seats: [{ person: 'id:org:wren' as CanonicalKey, index: 0, angle: 0, rx: 3000, ry: 3000 * SQUASH, x: 3000, y: 0, arc: 0.6 }],
  frontier: { rx0, rx1, ry0: rx0 * SQUASH, ry1: rx1 * SQUASH },
  formations: [],
  unassigned: ['wi:drifting-bug'], // the drifter
  stations: planned,
};

/** Runs the pass on `nodes` (in that order) and returns each station's spot. */
function spots(nodes: ViewNode[], scale: number, board = solar): Record<string, { x: number; y: number }> {
  const effective = new Map(nodes.map((n) => [n.projectionKey, n]));
  placeStations(effective, scale, board);
  return Object.fromEntries([...effective.values()].filter((n) => n.kind === 'facility').map((n) => [n.projectionKey, { x: n.world.x, y: n.world.y }]));
}

describe('placeStations', () => {
  // Small enough that the floored hull and the piece's hit outgrow the plan's gaps, so stations move.
  for (const scale of [0.02, 0.05, 0.1]) {
    it(`at scale ${scale}, a station's spot doesn't depend on who else is drawn or in what order`, () => {
      const all = spots([harbor(), tide(), drifter()], scale);
      expect(spots([harbor()], scale)['repo:harbor-relay']).toEqual(all['repo:harbor-relay']);
      expect(spots([drifter(), harbor()], scale)['repo:harbor-relay']).toEqual(all['repo:harbor-relay']);
      expect(spots([tide(), harbor()], scale)).toEqual(spots([harbor(), tide()], scale));
      expect(spots([tide()], scale)['repo:tide-gate']).toEqual(all['repo:tide-gate']);
      const withLamp = spots([harbor(), lamp(), tide(), drifter()], scale);
      expect(spots([lamp(), harbor()], scale)).toEqual({ 'repo:lamp-room': withLamp['repo:lamp-room'], 'repo:harbor-relay': withLamp['repo:harbor-relay'] });
      expect(spots([harbor()], scale)['repo:harbor-relay']).toEqual(withLamp['repo:harbor-relay']);
    });

    it(`at scale ${scale}, stations clear each other's hits, whichever are drawn`, () => {
      const at = spots([harbor(), lamp(), tide()], scale);
      const r = 2 * hitRadius(harbor(), scale) + ATTACH_GAP_PX / scale;
      const keys = Object.keys(at);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = at[keys[i]!]!; const b = at[keys[j]!]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(r - 1e-6);
      }
    });

    it(`at scale ${scale}, a station clears a frontier piece wherever it stands on the belt`, () => {
      const at = spots([harbor()], scale)['repo:harbor-relay']!;
      const station = { ...harbor(), world: { ...harbor().world, ...at } };
      const r = hitRadius(station, scale) + hitRadius(drifter(), scale) + ATTACH_GAP_PX / scale;
      expect(Math.hypot(at.x - mid, at.y)).toBeGreaterThanOrEqual(r - 1e-6);
    });
  }

  it('settles in the plan\'s order: the earlier arrival keeps its spot, the later one moves off it', () => {
    const lampAlone = spots([lamp()], 0.02, { ...solar, stations: planned.slice(0, 1) })['repo:lamp-room'];
    expect(spots([harbor(), lamp()], 0.02)['repo:lamp-room']).toEqual(lampAlone);
    const harborAlone = spots([harbor()], 0.02, { ...solar, stations: planned.slice(1, 2) })['repo:harbor-relay'];
    expect(spots([harbor()], 0.02)['repo:harbor-relay']).not.toEqual(harborAlone);
  });

  it('without planned spots (an older graph), drawn stations settle in key order and clear each other', () => {
    const { stations: _, ...older } = solar;
    void _;
    expect(spots([tide(), harbor()], 0.05, older)).toEqual(spots([harbor(), tide()], 0.05, older));
    for (const scale of [0.02, 0.05]) {
      const at = spots([lamp(), harbor(), tide()], scale, older);
      expect(spots([tide(), harbor(), lamp()], scale, older)).toEqual(at);
      const r = 2 * hitRadius(harbor(), scale) + ATTACH_GAP_PX / scale;
      const keys = Object.keys(at);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = at[keys[i]!]!; const b = at[keys[j]!]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(r - 1e-6);
      }
    }
  });

  it('leaves a station where the plan put it when that spot is clear', () => {
    const far = node('repo:far-dock', 'facility', rx1 + 4000, 0, GEOMETRY.facilityR);
    expect(spots([far], 0.1)['repo:far-dock']).toEqual({ x: far.world.x, y: far.world.y });
  });

  describe('the memo (v1.3 F6)', () => {
    // A formation of frontier pieces right beside the harbor station: how big its members are drawn
    // moves the group's reach, so the station's spot depends on them.
    const formation = { id: 'f1', seat: 'id:org:wren' as CanonicalKey, role: 'threat' as const, cx: rx1 + 380, cy: 300, memberR: GEOMETRY.frontierR, pitch: 200, outerR: 300, offsets: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: -200, y: 0 }], members: [] };
    const withFormation = (): NonNullable<ViewGraph['solar']> => ({ ...solar, formations: [formation] });
    const member = (r: number, floorScale?: number): ViewNode => ({ ...node('wi:member', 'threat', formation.cx, formation.cy, r), cluster: { id: 'f1', index: 0 }, ...(floorScale ? { floorScale } : {}) }) as ViewNode;

    it('a member that changes size between two calls gives the fresh answer, not the stale one', () => {
      const scale = 0.02;
      const board = withFormation();
      const run = (m: ViewNode) => spots([harbor(), m], scale, board)['repo:harbor-relay']!;
      clearStationMemo();
      const small = run(member(GEOMETRY.frontierR));
      let moved = 0;
      for (const m of [member(GEOMETRY.frontierR * 12), member(GEOMETRY.frontierR, 40)]) {
        const second = run(m);
        if (second.x !== small.x || second.y !== small.y) moved++;
        clearStationMemo();
        expect(second).toEqual(run(m)); // equals a fresh computation
        clearStationMemo();
        run(member(GEOMETRY.frontierR));
        expect(run(m)).toEqual(second); // and a computation that follows another is the same
      }
      expect(moved, 'the member size must matter, or this test proves nothing').toBeGreaterThan(0);
    });

    it('a repeat with the same plan content (even a new object) and scale is a hit', () => {
      clearStationMemo();
      const first = spots([harbor(), tide()], 0.05);
      expect(stationMemoStats).toEqual({ hits: 0, computes: 1 });
      expect(spots([harbor(), tide()], 0.05, structuredClone(solar))).toEqual(first);
      expect(stationMemoStats).toEqual({ hits: 1, computes: 1 });
      spots([harbor(), tide()], 0.1); // a new scale is a new answer
      expect(stationMemoStats.computes).toBe(2);
    });

    it('two drawn stations that share a key outside the plan still settle apart, as before', () => {
      const { stations: _, ...older } = solar;
      void _;
      const twin = (): ViewNode => ({ ...harbor(), projectionKey: 'repo:harbor-relay#2' });
      const at = spots([harbor(), twin()], 0.02, older);
      clearStationMemo();
      expect(spots([harbor(), twin()], 0.02, older)).toEqual(at);
      expect(at['repo:harbor-relay']).not.toEqual(at['repo:harbor-relay#2']);
    });
  });
});

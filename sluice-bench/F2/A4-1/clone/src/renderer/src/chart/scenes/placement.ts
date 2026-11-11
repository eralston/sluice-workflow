// Placement in screen terms (06 §2 sizing, 06 §3 PR lane): the v1 board's free pieces, formation
// members and stations (placeFormation.ts), the PR lane's rows and slots, then every attached ship or
// berth, travelling vessel, and ship on its home track, each taking the first spot whose hit circle
// collides with nothing already placed.
// Split out of GraphScene (2026-10-10, no behaviour change). Mutates the effective nodes' positions in place.
import type { LaneSpec, ViewGraph, ViewNode } from '@shared/contracts/view';
import { ATTACH_GAP_PX, hitRadius, laneRows, laneSlotsX } from '@shared/scene/sizing';
import { awayFromStar, loiterOffset } from '@shared/engine/solar/mandala';
import { GEOMETRY } from '@shared/engine/solar/version';
import { placeFormations, placeLoiterRings, placePlatforms, placeStations } from './placeFormation';

export function placeInScreen(effective: Map<string, ViewNode>, scale: number, lane: LaneSpec | undefined, solar?: ViewGraph['solar']): void {
  // The v1 board (17 D12, VC-3; 08 §7): formation members spread to a screen-terms pitch, then
  // finished pieces on their platforms, then each station on the first clear spot, so everything
  // placed below keeps clear of them. v0 graphs have no `solar`, so these are no-ops there.
  placeFormations(effective, scale, solar);
  placePlatforms(effective, scale, solar);
  placeLoiterRings(effective, scale, solar);
  placeStations(effective, scale, solar);
  // PR lane in screen terms (06 §3): stations and lane vessels move down until every vessel has a
  // label's room above and below it on screen.
  if (lane) {
    const { laneY, stationY } = laneRows(lane, scale);
    const vessels = [...effective.values()].filter((e) => e.along?.lane?.x !== undefined);
    const xs = laneSlotsX(vessels.map((e) => e.along!.lane!.x!), scale);
    vessels.forEach((e, i) => { e.along = { ...e.along!, lane: { ...e.along!.lane!, x: xs[i]! } }; });
    for (const e of effective.values()) {
      if (e.kind === 'station') {
        e.world = { ...e.world, y: stationY };
      } else if (e.along?.lane) {
        e.along = { ...e.along, lane: { ...e.along.lane, y: laneY } };
        e.world = { ...e.world, y: laneY };
      }
    }
  }
  // Placed objects (06 §2 sizing): attached ships and berths try directions around their target,
  // starting with the preferred one; in-flight vessels slide along their route. Each takes the
  // first spot whose hit circle collides with nothing already placed.
  const placed: { x: number; y: number; r: number; seat?: boolean }[] = [];
  for (const e of effective.values()) if (!e.attach && !e.along && !e.track && e.selectable) placed.push({ ...e.world, r: hitRadius(e, scale), seat: e.kind === 'seat' });
  // A ship resting beside a piece on a planet (13 §3, v4: pieces overlay it) isn't kept off the planet's big hit.
  const free = (x: number, y: number, r: number, overPlanet = false) => placed.every((p) => (overPlanet && p.seat) || Math.hypot(p.x - x, p.y - y) >= p.r + r + ATTACH_GAP_PX / scale);
  const movers = [...effective.values()].filter((e) => e.attach || e.along || e.track).sort((a, b) => (a.projectionKey < b.projectionKey ? -1 : 1));
  // How far an attached ship may stand off its target, in reaches of the touching distance, nearest
  // tier first (every direction at one tier before the next). The solar board is denser on screen at
  // its fit scale, so a ship there may go a tier further before it overlaps.
  const reaches = solar ? [[1, 1.6, 2.3], [3, 3.8, 4.8]] : [[1, 1.6, 2.3]];
  for (const e of movers) {
    const r = hitRadius(e, scale);
    let spot: { x: number; y: number } | null = null;
    let fallback: { x: number; y: number } | null = null;
    const ring = e.attach?.loiter !== undefined && solar ? effective.get(e.attach.to) : undefined;
    if (ring?.loiterR && e.attach?.loiter !== undefined) {
      // Its loiter slot (22 D3): exactly on its planet's ring, the first on the far side from the star,
      // neighbours a ship's drawn length apart plus one more (at least the plan's), never moved for room.
      const away = awayFromStar(ring.world.x - solar!.star.x, ring.world.y - solar!.star.y);
      const pitch = 2 * Math.max(2 * e.world.r, 2 * GEOMETRY.shipR);
      // The ring as drawn at this scale (`placeLoiterRings`, run above).
      const o = loiterOffset(ring.loiterR, pitch, e.attach.loiter, away);
      spot = { x: ring.world.x + o.x, y: ring.world.y + o.y };
    } else if (e.attach) {
      const target = effective.get(e.attach.to);
      if (target) {
        const overPlanet = target.kind === 'objective' || target.kind === 'threat';
        const d = hitRadius(target, scale) + r + ATTACH_GAP_PX / scale;
        const base = Math.atan2(e.attach.dirY, e.attach.dirX);
        attach: for (const tier of reaches) {
          // Round the preferred direction in eighths of a turn; in Solar in sixteenths, so a ship resting
          // off a planet stays on its work's side (22 A9).
          for (const step of solar ? [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -3, 3, 4] : [0, -1, 1, -2, 2, -3, 3, 4]) {
            for (const reach of tier) {
              const a = base + step * (Math.PI / 4);
              const p = { x: target.world.x + Math.cos(a) * d * reach, y: target.world.y + Math.sin(a) * d * reach };
              fallback ??= p;
              if (free(p.x, p.y, r, overPlanet)) { spot = p; break attach; }
            }
          }
        }
      }
    } else if (e.track) {
      // At home on its lane's track (the board): slide along the track, a ship-width at a time, to the
      // nearest spot clear of every body; only then lean a little off it, toward either lane.
      const t = e.track;
      const at = (x: number, lean: number) => {
        const cx = Math.max(-t.span, Math.min(t.span, x));
        return { x: cx, y: t.ry * Math.sqrt(Math.max(0, 1 - (cx / t.rx) ** 2)) + lean };
      };
      track: for (const lean of [0, -0.6 * r, 0.6 * r]) {
        for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 10, -10]) {
          const p = at(e.world.x + step * r * 2.2, lean);
          fallback ??= p;
          if (free(p.x, p.y, r)) { spot = p; break track; }
        }
      }
    } else if (e.along) {
      const a = effective.get(e.along.from);
      const b = effective.get(e.along.to);
      if (a && b) {
        const dx = b.world.x - a.world.x;
        const dy = b.world.y - a.world.y;
        const len = Math.hypot(dx, dy) || 1;
        const lane = e.along.lane;
        if (lane) {
          // Stay in the PR lane: start where the route crosses it, then spread sideways (and a
          // little up or down within the band) a vessel-width at a time.
          const k = dy !== 0 ? (lane.y - a.world.y) / dy : e.along.t;
          const x0 = lane.x ?? a.world.x + dx * Math.min(1, Math.max(0, k)); // the vessel's lane slot
          const dyMax = Math.max(0, lane.halfHeight - r);
          lane: for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
            for (const v of [0, -0.6, 0.6]) {
              const p = { x: x0 + step * r * 2.2, y: lane.y + v * dyMax };
              fallback ??= p;
              if (free(p.x, p.y, r)) { spot = p; break lane; }
            }
          }
        }
        // Off-lane: slide along the route first; then step off it to either side, a vessel-width at a time.
        if (!lane) search: for (const side of [0, 1, -1, 2, -2, 3, -3]) {
          for (const dt of [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32, 0.32]) {
            const k = Math.min(0.92, Math.max(0.08, e.along.t + dt));
            const n = e.along.normal + side * r * 2.2;
            const p = { x: a.world.x + dx * k + (-dy / len) * n, y: a.world.y + dy * k + (dx / len) * n };
            fallback ??= p;
            if (free(p.x, p.y, r)) { spot = p; break search; }
          }
        }
      }
    }
    const p = spot ?? fallback;
    if (!p) continue;
    e.world = { ...e.world, x: p.x, y: p.y };
    placed.push({ x: p.x, y: p.y, r });
  }
}

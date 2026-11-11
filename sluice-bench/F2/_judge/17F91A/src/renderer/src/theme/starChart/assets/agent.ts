// An agent as a captain's hero ship (13 §4.5): faction, hull and colourway from the person's ship
// seed, except the viewer's own ship, which takes the style they chose (13 §7). Every hull has the
// same footprint (INV-19). A captain carries no rung, so the neutral stage leaves it as it is; its one
// act is a transformation, for hulls with a second pose, which reverts to the first when the act ends.
import { LABEL_PX } from '@shared/scene/sizing';
import type { Graphics } from 'pixi.js';
import type { ViewNode } from '@shared/contracts/view';
import { CaptainView, COLOURWAYS, FLEET_HULLS, posesOf, type FleetDesign } from '../../../chart/art/fleet';
import type { AssetCtx, AssetDef } from '../../../chart/assets/types';
import type { Item } from '../../../gallery/types';
import { agentDesign, FACTIONS, hullsOf } from '../factions';
import { type Act, AdaptedView, NO_VIEWER, sampleKey, sampleNode } from './adapt';

/** The ship a node draws: the viewer's style for the viewer's own ship, else the seed's. */
export function agentStyle(node: ViewNode, ctx: AssetCtx): FleetDesign {
  const own = ctx.viewer !== null && node.canonicalKey === ctx.viewer;
  return agentDesign(node.seed, own ? ctx.captain : null);
}

const builtKey = (node: ViewNode, ctx: AssetCtx) => {
  const d = agentStyle(node, ctx);
  return `${d.hull}:${d.colourway}`;
};
const built = new Map<string, string>();

/** Steps through a hull's poses (the Mecha fighter's hybrid); a one-pose hull doesn't change. */
const transform: Act<CaptainView> = (art) => {
  const poses = posesOf(art.design.hull);
  const at = transformed.get(art) ?? 0;
  const next = (at + 1) % poses.length;
  transformed.set(art, next);
  art.setStage(poses[next]!);
};
const transformed = new WeakMap<CaptainView, number>();
/** Puts the hull back in its first pose when a transform ends (the art skips an unchanged pose). */
const untransform = (art: CaptainView) => {
  transformed.delete(art);
  art.setStage(posesOf(art.design.hull)[0]!);
};

/** How long a guest's warp out takes (s, 22 C8, K-14). */
export const WARP_OUT_S = 0.5;

/**
 * A guest leaving the region (22 C8, K-14): it jumps out, accelerating ahead along its heading,
 * stretched, a streak of light behind it; the scene fades it as it goes. The view is gone after.
 */
const warpOut: Act<CaptainView> = (art) => {
  const base = { x: art.root.scale.x, y: art.root.scale.y };
  const dir = art.dir;
  const size = art.size;
  return Object.assign((g: Graphics, u: number) => {
    const k = u ** 2.4;
    const off = dir * size * 9 * k;
    art.root.pivot.x = -off;
    art.root.scale.set(base.x * (1 + 2.4 * k), base.y);
    // The overlay is the root's child, so the pivot carries it ahead with the ship: its tail starts at 0.
    const tail = size * 6 * Math.sin(Math.PI * Math.min(1, u * 1.1));
    if (tail > 1e-3) g.moveTo(-dir * tail, 0).lineTo(0, 0).stroke({ width: size * 0.12, color: 0xe8fbff, alpha: 0.7 * (1 - k) });
  }, { durS: WARP_OUT_S });
};

export const agentAsset: AssetDef = {
  id: 'captain',
  layer: 'traffic',
  moving: false, framed: false, flare: false, body: false,
  floorPx: LABEL_PX * 0.6,
  rank: 4,
  // The captain's picture and name on a holographic plate above the ship (2026-10-12), the picture a
  // square at the plate's near end (19 L8); in play, the picture alone, hugging the top of the ship
  // (the picture tier).
  label: { frame: 'chamfer', variant: 'avatar', layout: 'vertical', tier: 'lead' },
  labelRim: 0.4,
  acts: ['transform', 'warpOut'],
  // Leaving, it jumps out (22 C8, K-14): only a guest ever leaves (a captain with a planet stays, K-12).
  departAct: 'warpOut', departS: WARP_OUT_S,
  make(node, ctx) {
    built.set(node.projectionKey, builtKey(node, ctx));
    // The node's r is the ship's half-length, as v0's ShipView takes it.
    return new AdaptedView(new CaptainView(agentStyle(node, ctx), node.world.r), () => null, { transform, warpOut }, untransform);
  },
  rebuildOn: (_prev, next, ctx) => built.get(next.projectionKey) !== builtKey(next, ctx),
  samples() {
    const viewer = sampleKey.person(1);
    const node = (n: number) => sampleNode({ key: sampleKey.person(n), kind: 'captain', asset: 'agent', seed: 104729 * n, r: 35 });
    const seeded: Item = {
      id: 'agent-seeded',
      title: 'agent · seeded ships',
      note: 'Faction, hull and colourway from each person’s seed',
      make: () => agentAsset.make(node(2), NO_VIEWER),
      cycle: [2, 3, 4, 5, 6, 7].map((n) => ({ label: `person ${n}`, rung: null, make: () => agentAsset.make(node(n), NO_VIEWER) })),
    };
    const own: Item = {
      id: 'agent-viewer',
      title: 'agent · the viewer’s own style',
      note: 'Each faction’s hulls, in the viewer’s chosen colourways',
      make: () => agentAsset.make(node(1), NO_VIEWER),
      cycle: FACTIONS.flatMap((faction) => hullsOf(faction).map((_, hull) => ({
        label: `${faction} · ${FLEET_HULLS[hullsOf(faction)[hull]!]!.name}`,
        rung: null,
        make: () => agentAsset.make(node(1), { ...NO_VIEWER, viewer, captain: { faction, hull, colourway: (hull * 3) % COLOURWAYS.length } }),
      }))),
    };
    return [seeded, own];
  },
};

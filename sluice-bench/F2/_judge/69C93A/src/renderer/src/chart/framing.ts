// Camera framing (05 §6, slice 3b): the fit that includes screen-sized labels, the frame-the-action
// target, and the follow camera's target. Pure computations over the camera and the scene; ChartApp
// decides when to move (transitions, the hold around a click, reduced motion). Split out of ChartApp
// (2026-10-10, no behaviour change). v1: an asset's `framed` capability stands in for the kind table,
// and a solar region's fit holds its frontier belt and its formations' screen-terms spread.
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ViewGraph, ViewNode } from '@shared/contracts/view';
import { laneRows, laneSlotsX, MIN_TARGET_PX, pageScale, screenRadius, targetScale, TOUCH_TARGET_PX } from '@shared/scene/sizing';
import { assetFor } from './assets/registry';
import type { Bounds, CameraController, CamState } from './camera';
import { formationLayouts, stationReach } from './scenes/placeFormation';

/** Frame-the-action camera moves: unhurried, so a pan reads as the view following, not a jolt. */
export const FRAME_MS = 700;
/** The follow camera: zoom within these multiples of the scene's fit, and move unhurriedly. */
export const FOLLOW_MIN_ZOOM = 0.8;
export const FOLLOW_MAX_ZOOM = 2.5;
export const FOLLOW_MS = 900;
/** The directed camera (27 E9, 05 §6): ease toward a climax's cast, and back to the board; up to this many times the fit. */
export const CLIMAX_MS = 900;
export const BOARD_MS = 900;
export const CLIMAX_MAX_ZOOM = 1.5;
/** The share of the scene the working set may span before the follow camera shows the whole system. */
export const FOLLOW_WHOLE_SHARE = 0.55;
/** The follow bar's height under the player (CSS .follow-bar sits at 70 px): framed work stays below it. */
export const FOLLOW_BAR_PX = 56;
/** What the frame-the-action camera keeps in view: the beat's objects, not people or decorations. */
export const FRAMED_KINDS = new Set(['star', 'planet', 'anomaly', 'missionPoint', 'flight', 'station']);

/** Whether frame-the-action keeps a node in view: a v1 node by its asset's capability, else by kind (17 D7). */
export function isFramed(n: Pick<ViewNode, 'kind' | 'asset'>): boolean {
  const def = assetFor(n);
  return def ? def.framed : FRAMED_KINDS.has(n.kind);
}

/** Fit including screen-sized labels: a few fixed-point iterations of scale → bounds → scale. */
export function fitFor(camera: CameraController, graph: ViewGraph): CamState {
  let state = camera.fitState(boundsOf(graph), 40);
  for (let i = 0; i < 4; i++) state = camera.fitState(boundsOf(graph, state.scale), 40);
  // Scroll over shrink (decided 2026-10-07): if the whole scene would make what leads somewhere
  // smaller than a touch target, open it as a page at a usable size, top first.
  // Only the galaxy is a grid that scrolls; sectors are capped and Feature systems are seen whole.
  const min = graph.sceneKey === 'galaxy' ? targetScale(graph.nodes, MIN_TARGET_PX) : 0;
  if (state.scale >= min) return state;
  const touch = targetScale(graph.nodes, TOUCH_TARGET_PX);
  let scale = touch;
  for (let i = 0; i < 4; i++) {
    const b = boundsOf(graph, scale);
    scale = pageScale(camera.fitState(b, 40).scale, camera.widthFitScale(b, 40), touch, min).scale;
  }
  return camera.pageState(boundsOf(graph, scale), 40, scale);
}

/**
 * World bounds of a graph, padded so labels fit. Labels have a fixed *screen* size, so their world
 * extent depends on the camera scale: pass the scale you expect (fitFor iterates to a fixed point).
 */
export function boundsOf(graph: ViewGraph, scale = 0.5): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const labelW = 270 / scale; // widest callout plate, in world units at this scale
  // Edge labels reserve only part of a plate: reserving full plates on both sides starves dense
  // systems of width. Labels that don't fit fall back to another side or hide until hover (06 §4).
  const sideW = 140 / scale;
  const labelH = 62 / scale; // up to three lines: title, type/ID/state, person
  const lane = graph.lane ? laneRows(graph.lane, scale) : null;
  const vessels = graph.nodes.filter((n) => n.along?.lane?.x !== undefined);
  const slotX = new Map(laneSlotsX(vessels.map((n) => n.along!.lane!.x!), scale).map((x, i) => [vessels[i]!.projectionKey, x]));

  for (const raw of graph.nodes) {
    // The PR lane, its slots, and the station row sit where the renderer will put them at this scale.
    const n = lane && raw.kind === 'station' ? { ...raw, world: { ...raw.world, y: lane.stationY } }
      : lane && raw.along?.lane ? { ...raw, world: { ...raw.world, x: slotX.get(raw.projectionKey) ?? raw.world.x, y: lane.laneY } } : raw;
    const r = screenRadius(n, scale) / scale; // mechanical floors are screen-sized
    const pad = n.kind === 'galaxy' ? n.world.r * 1.05 : r * 1.6;
    let { minX, maxX, minY, maxY } = { minX: n.world.x - pad, maxX: n.world.x + pad, minY: n.world.y - pad, maxY: n.world.y + pad };
    if (n.labelled) {
      const side = n.labelSide ?? 'below';
      if (side === 'left') minX = n.world.x - n.world.r - sideW;
      else if (side === 'right') maxX = n.world.x + n.world.r + sideW;
      else {
        minX = Math.min(minX, n.world.x - labelW / 2);
        maxX = Math.max(maxX, n.world.x + labelW / 2);
        if (side === 'above') minY = n.world.y - n.world.r * 1.3 - labelH;
        else if (n.labelCompact) maxY = Math.max(maxY, n.world.y + n.world.r * 0.45 + 34 / scale); // the name, tight below
        else maxY = n.world.y + n.world.r * 1.45 + labelH;
      }
    }
    b.minX = Math.min(b.minX, minX);
    b.maxX = Math.max(b.maxX, maxX);
    b.minY = Math.min(b.minY, minY);
    b.maxY = Math.max(b.maxY, maxY);
  }
  // The whole radar, whichever bands are occupied now, so the fit never changes as Tasks move.
  for (const band of graph.radar?.bands ?? []) {
    b.minX = Math.min(b.minX, graph.radar!.cx - band.rx - sideW);
    b.maxX = Math.max(b.maxX, graph.radar!.cx + band.rx + sideW);
    b.maxY = Math.max(b.maxY, graph.radar!.cy + band.ry + 40 / scale);
  }
  // A solar region's frontier belt (v1), whether or not anything is on it now, so the fit never
  // changes as pieces are taken or let go (INV-14).
  const solar = graph.solar;
  if (solar) {
    const pad = 24 / scale;
    b.minX = Math.min(b.minX, solar.star.x - solar.frontier.rx1 - pad);
    b.maxX = Math.max(b.maxX, solar.star.x + solar.frontier.rx1 + pad);
    b.minY = Math.min(b.minY, solar.star.y - solar.frontier.ry1 - pad);
    b.maxY = Math.max(b.maxY, solar.star.y + solar.frontier.ry1 + pad);
    // Every planned station with its reach (22 C11: the outer ring stands near the belt), drawn yet or
    // not, so the fit never changes as stations jump in.
    for (const st of solar.stations ?? []) {
      const r = stationReach(scale) + pad;
      b.minX = Math.min(b.minX, st.x - r);
      b.maxX = Math.max(b.maxX, st.x + r);
      b.minY = Math.min(b.minY, st.y - r);
      b.maxY = Math.max(b.maxY, st.y + r);
    }
    // Formations spread to their screen pitch at small scales (placeFormation.ts): fit the spread.
    for (const l of formationLayouts(solar, graph.nodes, scale).values()) {
      const m = l.outerR + l.memberR * 0.6;
      b.minX = Math.min(b.minX, l.cx - m);
      b.maxX = Math.max(b.maxX, l.cx + m);
      b.minY = Math.min(b.minY, l.cy - m);
      b.maxY = Math.max(b.maxY, l.cy + m);
    }
  }
  if (!Number.isFinite(b.minX)) return { minX: -400, minY: -300, maxX: 400, maxY: 300 };
  return b;
}

/** The follow camera's working set for the scene it's in. */
export interface FollowCtx { scene: string; keys: Set<CanonicalKey>; whole: boolean; fresh: boolean }

/**
 * The frame-the-action target (slice 3b): when a High beat's objects are off-screen, pan (or zoom
 * out) to bring them in, never zooming in on its own. Null when they're already in view.
 */
export function actionFrame(camera: CameraController, all: ViewNode[], keys: Set<CanonicalKey>): CamState | null {
  const scale = camera.state.scale;
  const nodes = all.filter((n) => keys.has(n.canonicalKey) && isFramed(n));
  if (!nodes.length) return null;
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of nodes) {
    const m = n.world.r * 1.2 + 30 / scale; // the object, its flare, and a little room for its label
    b.minX = Math.min(b.minX, n.world.x - m);
    b.minY = Math.min(b.minY, n.world.y - m);
    b.maxX = Math.max(b.maxX, n.world.x + m);
    b.maxY = Math.max(b.maxY, n.world.y + m);
  }
  return camera.includeState(b, 48);
}

/**
 * The directed camera's climax shot (27 E9, 05 §6): the cast's frame, eased in but never out past the
 * board (`fitScale` to `fitScale * CLIMAX_MAX_ZOOM`), centred on the padded box clamped into the box of
 * the cast's centres so the target always lies within the cast's bounds. People count (unlike
 * `actionFrame`). Null when none of the keys is drawn.
 */
export function climaxFrame(camera: CameraController, nodes: ViewNode[], keys: ReadonlySet<CanonicalKey>, fitScale: number): CamState | null {
  const cast = nodes.filter((n) => keys.has(n.canonicalKey));
  if (!cast.length) return null;
  const raw: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const pad: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of cast) {
    const m = n.world.r * 1.3 + 70 / fitScale; // the object, its flare, and room for a compact label
    raw.minX = Math.min(raw.minX, n.world.x);
    raw.minY = Math.min(raw.minY, n.world.y);
    raw.maxX = Math.max(raw.maxX, n.world.x);
    raw.maxY = Math.max(raw.maxY, n.world.y);
    pad.minX = Math.min(pad.minX, n.world.x - m);
    pad.minY = Math.min(pad.minY, n.world.y - m);
    pad.maxX = Math.max(pad.maxX, n.world.x + m);
    pad.maxY = Math.max(pad.maxY, n.world.y + m);
  }
  const fit = camera.fitState(pad, 60);
  const scale = Math.min(fitScale * CLIMAX_MAX_ZOOM, Math.max(fitScale, fit.scale));
  return {
    x: Math.min(raw.maxX, Math.max(raw.minX, fit.x)),
    y: Math.min(raw.maxY, Math.max(raw.minY, fit.y)),
    scale,
  };
}

/**
 * The follow camera's target (ChartApp.followFrame has the principles): the captain's working set in
 * this scene, widening only, the whole system once the work spans it. Updates `ctx` (whole, fresh).
 * Null when there's no ship, or the change is too small to be worth a move.
 */
export function followTarget(camera: CameraController, graph: ViewGraph, nodes: ViewNode[], shipKey: CanonicalKey, ctx: FollowCtx, fitScale: number): CamState | null {
  const ship = nodes.find((n) => n.kind === 'captain' && n.canonicalKey === shipKey);
  if (!ship) return null;
  const byPk = new Map(nodes.map((n) => [n.projectionKey, n]));
  const beside = ship.attach ? byPk.get(ship.attach.to) : undefined;
  const framed = new Map<string, ViewNode>([[ship.projectionKey, ship]]);
  if (beside) framed.set(beside.projectionKey, beside);
  for (const n of nodes) if (ctx.keys.has(n.canonicalKey) && isFramed(n)) framed.set(n.projectionKey, n);
  // A PR brings its station and its linked work; work brings the PRs routed to it from the set.
  for (const e of graph.edges) {
    if (e.kind !== 'route' && e.kind !== 'routeContinuation') continue;
    const from = byPk.get(e.from);
    const to = byPk.get(e.to);
    if (from && to && framed.has(from.projectionKey) && from.kind === 'flight') framed.set(to.projectionKey, to);
  }
  const scale = camera.state.scale;
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of framed.values()) {
    const m = n.world.r * 1.3 + 70 / scale; // the object, its flare, and room for a compact label
    b.minX = Math.min(b.minX, n.world.x - m);
    b.minY = Math.min(b.minY, n.world.y - m);
    b.maxX = Math.max(b.maxX, n.world.x + m);
    b.maxY = Math.max(b.maxY, n.world.y + m);
  }
  // Spanning the network: the whole system, from here on in this Feature.
  const whole = boundsOf(graph, scale);
  const wide = (b.maxX - b.minX) / Math.max(1, whole.maxX - whole.minX);
  const tall = (b.maxY - b.minY) / Math.max(1, whole.maxY - whole.minY);
  if (wide >= FOLLOW_WHOLE_SHARE || tall >= FOLLOW_WHOLE_SHARE) ctx.whole = true;
  let to: CamState;
  if (ctx.whole) to = fitFor(camera, graph);
  else {
    // Room at the top for the follow bar, which sits just under the player while following.
    b.minY -= FOLLOW_BAR_PX / Math.min(scale, fitScale * FOLLOW_MAX_ZOOM);
    const fit = camera.fitState(b, 60);
    to = { ...fit, scale: Math.min(fitScale * FOLLOW_MAX_ZOOM, Math.max(fitScale * FOLLOW_MIN_ZOOM, fit.scale)) };
  }
  // Only the start of a stay may zoom in; after that the frame only widens.
  if (!ctx.fresh) to.scale = Math.min(to.scale, scale);
  ctx.fresh = false;
  const shift = Math.hypot(to.x - camera.state.x, to.y - camera.state.y) * scale;
  if (Math.abs(to.scale / scale - 1) < 0.08 && shift < 40) return null; // small changes are ignored
  return to;
}

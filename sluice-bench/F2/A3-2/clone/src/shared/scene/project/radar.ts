// 06 §3 — the radar layout (the close-up): one body and its points on the radar, one front-arc band
// per rung around it, Ready outermost and Accomplished hugging it. Each point keeps its spoke (an
// angle fixed by slot order across the whole history), and its band follows its displayed stage, so
// a state change moves it only inward or outward along that spoke (INV-14). Removed points have no
// band and leave the radar. The body and its points come from the level's source. Pure.
import type { CanonicalKey } from '../../contracts/keys';
import type { ViewNode } from '../../contracts/view';
import type { RadarSource, SceneRef } from '../../hierarchy/types';
import { centeredRow, RADAR, RADAR_ARC, RADAR_BANDS, radarAngles, radarBand, radarPoint, stationRowY, type RadarBand } from '../layout';
import { orbitEdge, projectionKey, type ProjectCtx } from './ctx';
import { prLane, projectCaptains, projectTraffic, stationStep } from './traffic';

/** A radar Task's dot (world r); its on-screen floor is half a label (06 §2). */
const RADAR_DOT_R = 40;

export function projectRadar(ctx: ProjectCtx, ref: SceneRef, src: RadarSource): void {
  const pk = projectionKey(ctx.scene, ref.key);
  const body = src.center(ctx, ref, pk);
  if (!body) return;
  body.world = { x: 0, y: 0, r: RADAR.planetR };
  body.labelSide = 'left';
  body.labelLayout = 'horizontal';
  ctx.graph.nodes.push(body);
  // Spokes for every point ever linked, so seeking never moves a spoke (INV-14).
  const ever = src.spokes(ctx.h, ref);
  const angles = radarAngles(ever.length);
  const current = new Set(src.current(ctx, ref));
  const tasks: ViewNode[] = [];
  const counts: Record<RadarBand, number> = { accomplished: 0, underway: 0, ready: 0 };
  ever.forEach((taskKey, i) => {
    if (!current.has(taskKey)) return;
    const tpk = projectionKey(ctx.scene, taskKey);
    const t = src.point(ctx, taskKey, tpk);
    const band = radarBand(t.stage);
    if (!band) return;
    counts[band]++;
    const angle = angles[i]!;
    const p = radarPoint(angle, band);
    t.world = { x: p.x, y: p.y, r: RADAR_DOT_R };
    t.slot = i;
    t.radar = { angle, band };
    // Labels point outward from the spoke: left half to the left, right half to the right.
    t.labelSide = Math.cos(angle) < 0 ? 'left' : 'right';
    t.labelLayout = 'horizontal';
    // Underway points are the story right now; the rest label on hover (the band counts summarize them).
    if (band !== 'underway') t.labelOnHover = true;
    tasks.push(t);
    ctx.graph.nodes.push(t);
    ctx.graph.edges.push({ ...orbitEdge(pk, tpk, 0, 0, p.rx, p.ry, src.uncertain(ctx, ref, taskKey)), geometry: { kind: 'ellipse', cx: 0, cy: 0, rx: p.rx, ry: p.ry, band: true } });
  });
  ctx.graph.radar = {
    center: pk, cx: 0, cy: 0, arc: RADAR_ARC, spokes: ever.length,
    bands: RADAR_BANDS.map((band) => {
      const { rx, ry } = radarPoint(Math.PI / 2, band);
      return { band, rx, ry, count: counts[band] };
    }),
  };
  if (ever.length) body.tally = RADAR_BANDS.map((band) => ({ band, count: counts[band] }));
  const bodies = new Map([[ref.key, body]]);
  const subtree = new Set<CanonicalKey>([ref.key, ...tasks.map((t) => t.canonicalKey)]);
  // Resources at the bottom, exactly as in the system. The lane is sized by the outer band (not by
  // where points are now), so it never moves while points change bands.
  const outer = radarPoint(Math.PI / 2, 'ready');
  const extent = ever.length ? [{ x: outer.rx, y: outer.ry + RADAR_DOT_R, rx: outer.rx, ry: outer.ry, ring: 0, labelSide: 'left' as const }] : [];
  const rowY = stationRowY(extent, body.world.r);
  const taskWidth = ever.length ? outer.rx * 2 : 0;
  const bodyBottom = Math.max(body.world.r, ...extent.map((f) => f.y));
  const bodyLane = prLane(bodyBottom, rowY - 170);
  ctx.graph.lane = { childrenBottom: bodyBottom, laneOffset: bodyLane.y - bodyBottom, stationOffset: rowY - bodyBottom };
  projectTraffic(ctx, subtree, bodies, (count) => centeredRow(count, stationStep(count, taskWidth)).map((x) => [x, rowY]), 'x', 'body', bodyLane);
  projectCaptains(ctx, [body, ...tasks]);
}

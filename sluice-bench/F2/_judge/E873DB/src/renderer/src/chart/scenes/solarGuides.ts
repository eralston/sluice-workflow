// The solar guides (v1, 14 §1.4): drawings under a solar region's objects, from `graph.solar`. The
// frontier belt (13 §3) is a faint annulus round the star with dashed edges, where unassigned work
// drifts. (A planet's region is the planet itself, v4: its pieces overlay the dark side, so no guide is
// drawn for it.) The belt is chart furniture in the orbits' cyan, never a rung colour (09: colour belongs
// to state), and never red: danger is the hive ships' own outline (19 S2; the threat light retired).
// It shows only while unassigned work sits in it (19 S2): GraphScene fades it in as the first such
// piece comes into view and out as the last leaves, and snaps it on a seek; its geometry stays
// reserved over the loaded history either way, so nothing reflows (INV-14).
// The theme table lists it; GraphScene draws it at the end of its orbit pass.
import type { Graphics } from 'pixi.js';
import type { ViewGraph } from '@shared/contracts/view';
import type { ThemeGuide } from '../../theme/types';

const CYAN = 0x83dde2;
/** Dashes and gaps on the belt's edges, in screen px. */
const DASH_PX = 10;

/** An ellipse's outline as dashes `DASH_PX` long on screen. */
function dashedEllipse(g: Graphics, cx: number, cy: number, rx: number, ry: number, px: number): void {
  const around = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))); // Ramanujan
  const n = 2 * Math.max(12, Math.min(360, Math.round(around / (2 * DASH_PX * px))));
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    g.moveTo(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry).lineTo(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry);
  }
}

/** The frontier belt: a faint fill between its two ellipses, with dashed edges. */
function drawFrontier(g: Graphics, solar: NonNullable<ViewGraph['solar']>, px: number): void {
  const { star, frontier: f } = solar;
  if (!(f.rx1 > f.rx0)) return;
  g.ellipse(star.x, star.y, f.rx1, f.ry1).fill({ color: CYAN, alpha: 0.03 });
  g.ellipse(star.x, star.y, f.rx0, f.ry0).cut();
  dashedEllipse(g, star.x, star.y, f.rx0, f.ry0, px);
  dashedEllipse(g, star.x, star.y, f.rx1, f.ry1, px);
  g.stroke({ width: px, color: CYAN, alpha: 0.22 });
}

export const solarGuide: ThemeGuide = {
  id: 'solar',
  draw: (g, graph, px) => {
    const solar = graph.solar;
    if (!solar) return;
    drawFrontier(g, solar, px);
  },
  shownBy: (graph) => graph.solar?.unassigned ?? [],
};

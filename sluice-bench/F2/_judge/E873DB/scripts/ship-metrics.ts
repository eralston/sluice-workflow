// Ship silhouette metrics (art audit, 2026-10-12): rasterises every fleet hull and hive ship as a flat
// silhouette at the on-chart lengths and reports how much of it survives at that size. Run with
//   npx vite-node -c vitest.config.ts scripts/ship-metrics.ts
// Sizes: a threat ship's floor is ~29 px long, a captain ship's ~58 px (sizing.ts), the gallery's
// close-up ~116 px. "mass" is the silhouette's area in px²; "core" the widest inscribed disc's
// diameter; "thin" the share of area that vanishes under a 1.5 px-radius opening (parts under 3 px
// thick, which read as noise at that size); "fill" is area over bounding box.
import { resolve } from 'node:path';

// Renderer code sits outside this project's tsconfig (as in tests/unit/registries.test.ts), so it is
// loaded by a runtime path and typed by hand.
const ART = resolve(__dirname, '../src/renderer/src/chart/art');
const load = async <T>(f: string) => (await import(/* @vite-ignore */ resolve(ART, f))) as T;
interface Ctx { instructions: { action: string; data: { path: { shapePath: { shapePrimitives: { shape: { points?: number[] } }[] } } } }[] }
type Palette = Record<string, number>;
interface Model { beacon(p: [number, number, number]): void }
const { FLEET_HULLS } = await load<{ FLEET_HULLS: { name: string; poses: Record<string, (m: Model) => void> }[] }>('fleet.ts');
const { HullModel, renderHull } = await load<{ HullModel: new () => Model; renderHull(m: Model, p: Palette, dir: number, fit: { width: number; height: number }): { context: Ctx } }>('hull3d.ts');
const { SWARMS, hiveContexts } = await load<{ SWARMS: { name: string }[]; hiveContexts(style: number, dir: number): Ctx[] }>('swarm.ts');

const PAL: Palette = { hull: 0x888888, accent: 0x777777, cargo: 0x666666, steel: 0x666666, dark: 0x444444, glass: 0x555555, glow: 0xffffff, ember: 0xffffff };

type Poly = number[];

/** Every filled polygon in a context, in its own units. */
export function polysOf(ctx: Ctx): Poly[] {
  const out: Poly[] = [];
  for (const ins of ctx.instructions) {
    if (ins.action !== 'fill') continue;
    for (const prim of ins.data.path.shapePath.shapePrimitives) if (prim.shape.points) out.push(prim.shape.points);
  }
  return out;
}

/** Rasterise polygons scaled so the bounding width is `len` px; 1 px cells, 4× supersampled. */
function raster(polys: Poly[], len: number): { g: Uint8Array; w: number; h: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys) for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]!); x1 = Math.max(x1, p[i]!); y0 = Math.min(y0, p[i + 1]!); y1 = Math.max(y1, p[i + 1]!);
  }
  const k = len / (x1 - x0);
  const w = Math.ceil(len) + 6, h = Math.ceil((y1 - y0) * k) + 6;
  const SS = 4;
  const W = w * SS, H = h * SS;
  const hi = new Uint8Array(W * H);
  for (const p of polys) {
    const pts: [number, number][] = [];
    for (let i = 0; i < p.length; i += 2) pts.push([((p[i]! - x0) * k + 3) * SS, ((p[i + 1]! - y0) * k + 3) * SS]);
    const ys = pts.map((q) => q[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [a, b] = [pts[i]!, pts[(i + 1) % pts.length]!];
        if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) xs.push(a[0] + ((y + 0.5 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(0, Math.round(xs[i]!)); x < Math.min(W, Math.round(xs[i + 1]!)); x++) hi[y * W + x] = 1;
    }
  }
  return { g: hi, w: W, h: H };
}

/** Binary erosion then dilation by a disc of radius r (in grid cells). */
function open(g: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const offs: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) offs.push([dx, dy]);
  const er = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!g[y * w + x]) continue;
    let ok = 1;
    for (const [dx, dy] of offs) { const [X, Y] = [x + dx, y + dy]; if (X < 0 || Y < 0 || X >= w || Y >= h || !g[Y * w + X]) { ok = 0; break; } }
    er[y * w + x] = ok;
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!er[y * w + x]) continue;
    for (const [dx, dy] of offs) { const [X, Y] = [x + dx, y + dy]; if (X >= 0 && Y >= 0 && X < w && Y < h) out[Y * w + X] = 1; }
  }
  return out;
}

const count = (g: Uint8Array) => g.reduce((s, v) => s + v, 0);

export interface Metrics { mass: number; fill: number; core: number; thin: number; wpx: number; hpx: number }

export function measure(polys: Poly[], len: number): Metrics {
  const { g, w, h } = raster(polys, len);
  const SS = 4;
  const area = count(g) / (SS * SS);
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const [wpx, hpx] = [(x1 - x0 + 1) / SS, (y1 - y0 + 1) / SS];
  const thin = 1 - count(open(g, w, h, Math.round(1.5 * SS))) / Math.max(1, count(g));
  // The widest disc that fits: the largest r (in px) whose opening still leaves something.
  let core = 0;
  for (let r = 1; r <= 12; r++) { if (count(open(g, w, h, r * SS / 2)) > 0) core = r; else break; }
  return { mass: Math.round(area), fill: area / (wpx * hpx), core, thin, wpx, hpx };
}

const LENGTHS = [29, 58, 116];
const fmt = (m: Metrics) => `${String(m.mass).padStart(5)} px²  h ${m.hpx.toFixed(0).padStart(3)}  core ${String(m.core).padStart(2)}px  fill ${(m.fill * 100).toFixed(0).padStart(3)}%  thin ${(m.thin * 100).toFixed(0).padStart(3)}%`;

console.log('FLEET (length 29 / 58 / 116 px)');
FLEET_HULLS.forEach((h) => {
  const m = new HullModel();
  Object.values(h.poses)[0]!(m);
  m.beacon([0, 0, 0]);
  const polys = polysOf(renderHull(m, PAL, 1, { width: 44, height: 28 }).context);
  console.log(h.name.padEnd(22), LENGTHS.map((l) => fmt(measure(polys, l))).join(' | '));
});
console.log('\nHIVE (length 29 / 58 / 116 px)');
SWARMS.forEach((s, i) => {
  const polys = hiveContexts(i, 1).flatMap(polysOf);
  console.log(s.name.padEnd(22), LENGTHS.map((l) => fmt(measure(polys, l))).join(' | '));
});

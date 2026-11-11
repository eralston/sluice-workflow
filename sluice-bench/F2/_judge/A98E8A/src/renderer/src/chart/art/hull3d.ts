// A tiny vector 3D kit for mechanical art (06 §7): hulls are modelled once as real solids (lofted
// sections, lathes, plates, tubes, boxes), then projected at one fixed three-quarter view — nose
// a little toward the viewer, seen a little from above — and painted face by face in gouache value
// planes under the chart's key light (upper left). Rendering the same model at two headings gives a
// ship flying east and one flying west, each correctly lit (a mirror would move the light).
//
// Model space: +x is the bow, +y is up, +z is the starboard side. Everything is baked into a shared
// GraphicsContext, so per-frame cost is only the static geometry.
import { GraphicsContext } from 'pixi.js';
import { coolShade, darken, keyLit, lighten, mix } from './lit';

export type V3 = [number, number, number];
/** `trim` is painted white in its own layer, so it can be tinted at run time (a signal-ladder stripe). */
export type Mat = 'hull' | 'accent' | 'cargo' | 'steel' | 'dark' | 'glass' | 'glow' | 'ember' | 'trim';
type Mats = Mat | Mat[];

export interface Section { x: number; w: number; h: number; y: number; z: number }
/** A cross-section at x: half-width w (along z), half-height h (along y), centered at (y, z). */
export const S = (x: number, w: number, h = w, y = 0, z = 0): Section => ({ x, w, h, y, z });

interface Face { pts: V3[]; n: V3; mat: Mat }
interface Part { faces: Face[]; bias: number }
interface Spot { p: V3; n: V3 }
interface Engine { p: V3; r: number; hot: boolean }

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const centroid = (pts: V3[]): V3 => mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
const mirror = (p: V3): V3 => [p[0], p[1], -p[2]];
const matAt = (m: Mats, i: number): Mat => (Array.isArray(m) ? m[Math.min(i, m.length - 1)]! : m);

function newell(pts: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

function dedupe(pts: V3[]): V3[] {
  const out: V3[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-6) out.push(p);
  }
  while (out.length > 1 && Math.hypot(...sub(out[0]!, out[out.length - 1]!)) <= 1e-6) out.pop();
  return out;
}

/** A unit superellipse ring (u along z, v along y); sq 2 is an ellipse, higher is boxier. */
function ring(sides: number, sq: number): [number, number][] {
  const se = (c: number) => Math.sign(c) * Math.pow(Math.abs(c), 2 / sq);
  return Array.from({ length: sides }, (_, k) => {
    const t = (2 * Math.PI * k) / sides;
    return [se(Math.cos(t)), se(Math.sin(t))];
  });
}

export class HullModel {
  readonly parts: Part[] = [];
  readonly windows: Spot[] = [];
  readonly engines: Engine[] = [];
  readonly beacons: V3[] = [];

  private part(bias = 0): Part {
    const p: Part = { faces: [], bias };
    this.parts.push(p);
    return p;
  }

  /** Add a face, oriented outward: away from `ref`, a point inside the solid. */
  private face(part: Part, pts: V3[], mat: Mat, ref: V3): void {
    const p = dedupe(pts);
    if (p.length < 3) return;
    const raw = newell(p);
    if (Math.hypot(raw[0], raw[1], raw[2]) < 1e-9) return;
    let n = norm(raw);
    if (dot(n, sub(centroid(p), ref)) < 0) n = mul(n, -1);
    part.faces.push({ pts: p, n, mat });
  }

  /** A hull lofted through cross-sections along x. Mats are per segment; caps close both ends. */
  loft(secs: Section[], mats: Mats, o: { sides?: number; sq?: number; shape?: [number, number][]; caps?: [Mat?, Mat?]; bias?: number } = {}): this {
    const shape = o.shape ?? ring(o.sides ?? 12, o.sq ?? 2);
    const part = this.part(o.bias);
    const center = (s: Section): V3 => [s.x, s.y, s.z];
    const rings = secs.map((s) => shape.map(([u, v]): V3 => [s.x, s.y + v * s.h, s.z + u * s.w]));
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = rings[i]!, b = rings[i + 1]!;
      const ref = mul(add(center(secs[i]!), center(secs[i + 1]!)), 0.5);
      for (let k = 0; k < shape.length; k++) {
        const k1 = (k + 1) % shape.length;
        this.face(part, [a[k]!, a[k1]!, b[k1]!, b[k]!], matAt(mats, i), ref);
      }
    }
    const mid = centroid(secs.map(center));
    this.face(part, rings[0]!, o.caps?.[0] ?? matAt(mats, 0), mid);
    this.face(part, rings[rings.length - 1]!, o.caps?.[1] ?? matAt(mats, secs.length - 2), mid);
    return this;
  }

  /** A solid of revolution about a vertical axis: profile points are [radius, y]. */
  lathe(profile: [number, number][], mats: Mats, o: { sides?: number; cx?: number; cy?: number; cz?: number; sx?: number; sz?: number; bias?: number } = {}): this {
    const { sides = 24, cx = 0, cy = 0, cz = 0, sx = 1, sz = 1 } = o;
    const part = this.part(o.bias);
    const rings = profile.map(([r, y]) => Array.from({ length: sides }, (_, k): V3 => {
      const t = (2 * Math.PI * k) / sides;
      return [cx + Math.cos(t) * r * sx, cy + y, cz + Math.sin(t) * r * sz];
    }));
    const ref: V3 = [cx, cy + profile.reduce((s, [, y]) => s + y, 0) / profile.length, cz];
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        this.face(part, [rings[i]![k]!, rings[i]![k1]!, rings[i + 1]![k1]!, rings[i + 1]![k]!], matAt(mats, i), ref);
      }
    }
    return this;
  }

  /**
   * A solid of revolution about the x axis over the arc φ0..φ1 (degrees from starboard, 90 is up): a
   * ring, a band or a collar round a hull. The profile is a closed outline of [x, radius] points, and
   * mats go per edge. It is built in short arcs, each sorted on its own (as `torus`), so it passes in
   * front of and behind what it circles; caps close the arc's ends unless it is a whole turn.
   */
  spin(profile: [number, number][], φ0: number, φ1: number, mats: Mats, o: { cy?: number; cz?: number; step?: number; bias?: number; caps?: [boolean, boolean] } = {}): this {
    const { cy = 0, cz = 0, step = 15 } = o;
    const whole = Math.abs(φ1 - φ0) >= 360 - 1e-6;
    const [capA, capB] = o.caps ?? [!whole, !whole];
    const n = Math.max(1, Math.ceil(Math.abs(φ1 - φ0) / step));
    const at = ([x, r]: [number, number], deg: number): V3 => {
      const t = (deg * Math.PI) / 180;
      return [x, cy + Math.sin(t) * r, cz + Math.cos(t) * r];
    };
    const mid: [number, number] = [profile.reduce((s, p) => s + p[0], 0) / profile.length, profile.reduce((s, p) => s + p[1], 0) / profile.length];
    for (let k = 0; k < n; k++) {
      const [a, b] = [φ0 + ((φ1 - φ0) * k) / n, φ0 + ((φ1 - φ0) * (k + 1)) / n];
      const part = this.part(o.bias);
      const ref = at(mid, (a + b) / 2);
      profile.forEach((p, i) => {
        const q = profile[(i + 1) % profile.length]!;
        this.face(part, [at(p, a), at(q, a), at(q, b), at(p, b)], matAt(mats, i), ref);
      });
      if (k === 0 && capA) this.face(part, profile.map((p) => at(p, a)), matAt(mats, 0), ref);
      if (k === n - 1 && capB) this.face(part, profile.map((p) => at(p, b)), matAt(mats, 0), ref);
    }
    return this;
  }

  /** A flat plate: a polygon in the xz plane (wings) or the xy plane (fins), extruded from a to b. */
  prism(poly: [number, number][], a: number, b: number, plane: 'xz' | 'xy', mat: Mat, o: { bias?: number } = {}): this {
    const at = (u: number, v: number, w: number): V3 => (plane === 'xz' ? [u, w, v] : [u, v, w]);
    const part = this.part(o.bias);
    const cu = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cv = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const ref = at(cu, cv, (a + b) / 2);
    this.face(part, poly.map(([u, v]) => at(u, v, a)), mat, ref);
    this.face(part, poly.map(([u, v]) => at(u, v, b)), mat, ref);
    poly.forEach(([u, v], i) => {
      const [u1, v1] = poly[(i + 1) % poly.length]!;
      this.face(part, [at(u, v, a), at(u1, v1, a), at(u1, v1, b), at(u, v, b)], mat, ref);
    });
    return this;
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: Mat, o: { bias?: number } = {}): this {
    return this.prism([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, 'xz', mat, o);
  }

  /** A tube along a path of points; r may taper with s = 0..1 along the path. */
  tube(path: V3[], r: number | ((s: number) => number), mat: Mat, o: { sides?: number; bias?: number } = {}): this {
    const sides = o.sides ?? 6;
    const part = this.part(o.bias);
    const rad = typeof r === 'number' ? () => r : r;
    const rings = path.map((p, i) => {
      const t = norm(sub(path[Math.min(i + 1, path.length - 1)]!, path[Math.max(i - 1, 0)]!));
      const up: V3 = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const n = norm(cross(t, up));
      const b = cross(n, t);
      const rr = rad(i / Math.max(1, path.length - 1));
      return Array.from({ length: sides }, (_, k): V3 => {
        const a = (2 * Math.PI * k) / sides;
        return add(p, add(mul(n, Math.cos(a) * rr), mul(b, Math.sin(a) * rr)));
      });
    });
    for (let i = 0; i + 1 < rings.length; i++) {
      const ref = mul(add(path[i]!, path[i + 1]!), 0.5);
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        this.face(part, [rings[i]![k]!, rings[i]![k1]!, rings[i + 1]![k1]!, rings[i + 1]![k]!], mat, ref);
      }
    }
    this.face(part, rings[0]!, mat, path[1] ?? path[0]!);
    this.face(part, rings[rings.length - 1]!, mat, path[path.length - 2] ?? path[0]!);
    return this;
  }

  /** Build something on the starboard side and mirror it to port. */
  sym(build: () => void): this {
    const [p0, w0, e0] = [this.parts.length, this.windows.length, this.engines.length];
    build();
    for (const p of this.parts.slice(p0)) {
      this.parts.push({ bias: p.bias, faces: p.faces.map((f) => ({ mat: f.mat, pts: f.pts.map(mirror), n: mirror(f.n) })) });
    }
    for (const w of this.windows.slice(w0)) this.windows.push({ p: mirror(w.p), n: mirror(w.n) });
    for (const e of this.engines.slice(e0)) this.engines.push({ ...e, p: mirror(e.p) });
    return this;
  }

  /** A row of lit windows from x0 to x1 on a surface facing n. */
  winRow(x0: number, x1: number, step: number, y: number, z: number, n: V3 = [0, 0, 1]): this {
    for (let x = x0; x <= x1 + 1e-6; x += step) this.windows.push({ p: [x, y, z], n: norm(n) });
    return this;
  }

  win(p: V3, n: V3): this {
    this.windows.push({ p, n: norm(n) });
    return this;
  }

  /** A ring (torus) in short arcs, each sorted on its own, so it passes in front of and behind what it circles. */
  torus(c: V3, radius: number, r: number, plane: 'xz' | 'yz', mat: Mat, o: { segments?: number; sides?: number } = {}): this {
    const segs = o.segments ?? 16;
    for (let k = 0; k < segs; k++) {
      const pts = Array.from({ length: 4 }, (_, j): V3 => {
        const t = ((k + j / 3) * 2 * Math.PI) / segs;
        const [a, b] = [Math.cos(t) * radius, Math.sin(t) * radius];
        return plane === 'xz' ? [c[0] + a, c[1], c[2] + b] : [c[0], c[1] + a, c[2] + b];
      });
      this.tube(pts, r, mat, { sides: o.sides ?? 6 });
    }
    return this;
  }

  /** Where a blinking beacon sits (returned in render coordinates). */
  beacon(p: V3): this {
    this.beacons.push(p);
    return this;
  }

  /** An engine exhaust: hot is a warm rocket flame, otherwise a cool drive glow. */
  engine(p: V3, r: number, hot = false): this {
    this.engines.push({ p, r, hot });
    return this;
  }

  /** Everything in `other`, added to this model (its parts keep their painter's bias). */
  append(other: HullModel): this {
    this.parts.push(...other.parts);
    this.windows.push(...other.windows);
    this.engines.push(...other.engines);
    this.beacons.push(...other.beacons);
    return this;
  }

  /** A copy of this model placed by `xf`: a rigid re-posing of the same solids (a transformation's other pose). */
  transformed(xf: Xf): HullModel {
    const at = placer(xf);
    const turn = rotator(xf);
    const out = new HullModel();
    for (const p of this.parts) {
      out.parts.push({
        bias: p.bias,
        faces: p.faces.map((f) => {
          const pts = f.pts.map(at);
          // Scaling unevenly skews normals, so they are re-derived and kept facing the way they did.
          const raw = newell(pts);
          const want = turn(f.n);
          let n = Math.hypot(raw[0], raw[1], raw[2]) > 1e-9 ? norm(raw) : want;
          if (dot(n, want) < 0) n = mul(n, -1);
          return { pts, n, mat: f.mat };
        }),
      });
    }
    for (const w of this.windows) out.windows.push({ p: at(w.p), n: norm(turn(w.n)) });
    const k = ((xf.s ?? [1, 1, 1]).reduce((a, b) => a + b, 0)) / 3;
    for (const e of this.engines) out.engines.push({ p: at(e.p), r: e.r * k, hot: e.hot });
    for (const b of this.beacons) out.beacons.push(at(b));
    return out;
  }
}

/**
 * A rigid-ish placement: shift `pivot` to the origin, scale along the axes, turn (about z, then y,
 * then x, in radians), then shift to `t`.
 */
export interface Xf { pivot?: V3; s?: V3; rz?: number; ry?: number; rx?: number; t?: V3 }

function rotator(xf: Xf): (p: V3) => V3 {
  const [rz, ry, rx] = [xf.rz ?? 0, xf.ry ?? 0, xf.rx ?? 0];
  const [cz, sz, cy, sy, cx, sx] = [Math.cos(rz), Math.sin(rz), Math.cos(ry), Math.sin(ry), Math.cos(rx), Math.sin(rx)];
  return (p) => {
    const a: V3 = [p[0] * cz - p[1] * sz, p[0] * sz + p[1] * cz, p[2]];
    const b: V3 = [a[0] * cy + a[2] * sy, a[1], -a[0] * sy + a[2] * cy];
    return [b[0], b[1] * cx - b[2] * sx, b[1] * sx + b[2] * cx];
  };
}

/** The point mapping of an `Xf`, for placing hardpoints with the geometry they ride on. */
export function placer(xf: Xf): (p: V3) => V3 {
  const turn = rotator(xf);
  const [pv, s, t] = [xf.pivot ?? [0, 0, 0], xf.s ?? [1, 1, 1], xf.t ?? [0, 0, 0]] as [V3, V3, V3];
  return (p) => add(turn([(p[0] - pv[0]) * s[0], (p[1] - pv[1]) * s[1], (p[2] - pv[2]) * s[2]]), t);
}

// ---- Projection and painting ----

/** The heroic three-quarter view: yawed so the nose comes toward the viewer, seen from above. */
const YAW = (32 * Math.PI) / 180;
const PITCH = (27 * Math.PI) / 180;
/** Eye distance for a ~100-unit hull: a mild perspective, so the near end reads a touch larger. */
const EYE = 320;
/** Key light from the upper left and in front (06 §7); the half vector for glints; a cool bounce from below right. */
const LIGHT = norm([-0.45, 0.8, 0.3]);
const HALF = norm(add(LIGHT, [0, 0, 1]));
const BOUNCE = norm([0.7, -0.6, 0.35]);
const BOUNCE_COLOR = 0x4f7f86;

export type Palette = Record<Exclude<Mat, 'trim'>, number>;

export interface HullRender {
  context: GraphicsContext;
  /** The trim faces, lit in white over the hull: tint the Graphics that shows it. */
  trim: GraphicsContext;
  windows: [number, number][];
  engines: { x: number; y: number; r: number; hot: boolean; bx: number; by: number }[];
  beacons: [number, number][];
  /** Model-to-render scale, shared by both headings so they're the same size. */
  k: number;
  /** The projected point at the render's centre (its bounds' centre unless given): pass it on to line another render up with this one. */
  origin: [number, number];
  /** Where a model point lands in this render. */
  at: (p: V3) => [number, number];
  /** Whether a surface at p with normal n faces the viewer (the outside of it shows). */
  faces: (p: V3, n: V3) => boolean;
}

/**
 * How near the viewer a model point sits at a heading (larger is nearer): for splitting a piece into
 * the part in front of a hull and the part behind it.
 */
export const depthOf = (p: V3, dir: number): number => viewOf(dir)(p)[2];

function viewOf(dir: number): (p: V3) => V3 {
  const a = dir > 0 ? YAW : Math.PI - YAW;
  const [ca, sa, cp, sp] = [Math.cos(a), Math.sin(a), Math.cos(PITCH), Math.sin(PITCH)];
  return (p) => {
    const x = p[0] * ca - p[2] * sa;
    const z1 = p[0] * sa + p[2] * ca;
    return [x, p[1] * cp - z1 * sp, z1 * cp + p[1] * sp];
  };
}

const EYE_POINT: V3 = [0, 0, EYE];
const project = (v: V3): [number, number] => {
  const s = EYE / (EYE - v[2]);
  return [v[0] * s, -v[1] * s];
};

/** Gouache value planes: the light snaps to a few steps, warm in the light and cool in the shade. */
function shade(c: number, n: V3, mat: Mat, jitter: number): number {
  if (mat === 'glow' || mat === 'ember') return c;
  const q = Math.round(dot(n, LIGHT) * 4) / 4;
  let out = q >= 0.25 ? keyLit(c, Math.min(0.4, (q - 0.25) * 0.55)) : coolShade(c, Math.min(0.82, (0.25 - q) * 0.62));
  const h = dot(n, HALF);
  if (h > 0.9) out = keyLit(out, ((mat === 'glass' ? 0.85 : 0.45) * (h - 0.9)) / 0.1);
  const b = dot(n, BOUNCE);
  if (b > 0.4) out = mix(out, BOUNCE_COLOR, (b - 0.4) * 0.35);
  // A slight value wobble per face, like separate touches of the brush.
  return jitter > 0 ? lighten(out, jitter) : darken(out, -jitter);
}

/**
 * Paint a model at a heading (1 = east, −1 = west), fitted to width × height render units unless
 * a scale k is given (pass the east render's k to the west one). It is centred on its bounds, or on
 * another render's `origin` at the same heading (so two forms of one hull, or a piece and its whole,
 * line up).
 */
export function renderHull(model: HullModel, palette: Palette, dir: number, fit: { width: number; height: number; k?: number; origin?: [number, number] }): HullRender {
  const view = viewOf(dir);
  const parts = model.parts.map((p) => {
    const faces = p.faces.map((f) => {
      const v = f.pts.map(view);
      const c = centroid(v);
      const n = view(f.n);
      return { f, v, c, n, visible: dot(n, sub(EYE_POINT, c)) > 0 };
    });
    const depth = faces.reduce((s, x) => s + x.c[2], 0) / Math.max(1, faces.length) + p.bias;
    return { faces: faces.filter((x) => x.visible).sort((a, b) => a.c[2] - b.c[2]), depth };
  }).sort((a, b) => a.depth - b.depth);

  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of parts) for (const f of p.faces) for (const v of f.v) {
    const [x, y] = project(v);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const k = fit.k ?? Math.min(fit.width / (x1 - x0), fit.height / (y1 - y0));
  const [ox, oy] = fit.origin ?? [(x0 + x1) / 2, (y0 + y1) / 2];
  const toScreen = (v: V3): [number, number] => {
    const [x, y] = project(v);
    return [(x - ox) * k, (y - oy) * k];
  };

  const context = new GraphicsContext();
  const trim = new GraphicsContext();
  let i = 0;
  for (const p of parts) for (const f of p.faces) {
    const jitter = ((((i++ * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 0.07;
    const isTrim = f.f.mat === 'trim';
    const color = isTrim ? keyLit(0xb4b4b4, Math.max(0, dot(f.n, LIGHT))) : shade(palette[f.f.mat as keyof Palette], f.n, f.f.mat, jitter);
    const pts = f.v.flatMap(toScreen);
    // Stroked in its own color so neighbouring faces meet without hairline seams.
    (isTrim ? trim : context).poly(pts).fill({ color }).stroke({ width: 0.3, color, join: 'round' });
  }

  const windows = model.windows
    .filter((w) => dot(view(w.n), norm(sub(EYE_POINT, view(w.p)))) > 0.15)
    .map((w) => toScreen(view(w.p)));
  const back = view([-1, 0, 0]);
  const engines = model.engines.map((e) => {
    const [x, y] = toScreen(view(e.p));
    const [tx, ty] = toScreen(add(view(e.p), mul(back, 6)));
    return { x, y, r: e.r * k, hot: e.hot, bx: tx - x, by: ty - y };
  });
  const at = (p: V3) => toScreen(view(p));
  const faces = (p: V3, n: V3) => dot(view(n), sub(EYE_POINT, view(p))) > 0;
  return { context, trim, windows, engines, beacons: model.beacons.map(at), k, origin: [ox, oy], at, faces };
}

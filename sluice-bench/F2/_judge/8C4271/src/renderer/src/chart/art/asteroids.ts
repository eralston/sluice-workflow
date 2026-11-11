// v1 objective asteroids (13-game-design.md §4.2): each objective (Story) is an asteroid of one
// material, chosen by seed: metal (iron-nickel, veins), crystal (faceted, translucent glints) or
// energy (a glowing core in dark rock). On the signal ladder (09):
//   sketch        a radar wireframe sensor contact, grey, barely breathing
//   ready         rough, worn stone, the material barely showing (dull veins, a dim glint, a faint core)
//   underway      laser-cut: clean facets bare the material, the cut lines glow progress blue on the
//                 beat; two A-frame gantries stand folded on the rim
//   nearing       fully carved; two arches grow over it from their gantries, a crane jib at each
//                 growing tip, in violet work light, gold creeping in with the step
//   accomplished  the final form: a compact orbital mine (the processed core wrapped in two crossing
//                 catwalk bands of brushed titanium, two girders, gold rivets, warm walkway lights), in
//                 low orbit
//   off           a drifting ghost: desaturated, its outline dashed
// (Simplified 2026-10-12: arches built on the rock and decking that wraps it, not rigs and vanes.)
// Steps (Tasks) are augmentations on the rim, at deterministic sockets: straps of plating clamped along
// it, an outline waiting (New), a plate going on under a blue work light (Active), a plate fixed with a
// gold rivet (Closed).
//
// The rock is one quad: a ray-marched signed-distance body (a smooth union of seeded blobs, crystal
// points, and the cutting planes), painted in gouache value planes (layer 'celestial'). The hardware
// (straps, catwalks, girders, the platform's bands, wireframe brackets, ghost dashes) is crisp, baked
// per stage in `marks`. A JS twin of the same distance field places the sockets on the silhouette and
// hides the back of the catwalk where the rock covers it.
import { Container, GlProgram, Graphics, GraphicsContext, Mesh, Shader, UniformGroup, type Geometry, type UniformData } from 'pixi.js';
import { MESH_VERTEX, NOISE } from './glsl';
import type { V3 } from './hull3d';
import { coolShade, darken, keyLit, lighten, mix, WindowLights } from './lit';
import { Aura, AURA } from './aura';
import { drawOffLadderMarks } from './marks';
import { motion } from './motion';
import { ACTIVITY, beatOf, NEARING, PROGRESS, PROGRESS_GLSL, progressPulse, READY, RUNG_COLOR, rgb, SUCCESS, type Signal } from './progress';
import { quadGeometry } from './quad';

export type AsteroidMaterial = 'metal' | 'crystal' | 'energy';
export const ASTEROID_MATERIALS: AsteroidMaterial[] = ['metal', 'crystal', 'energy'];
/** A step's state: New (an empty socket), Active (a working rig), Closed (a finished module). */
export type StepState = 'new' | 'active' | 'closed';

/** The material an asteroid is made of, from its seed (identity, never state). */
export const asteroidMaterial = (seed: number): AsteroidMaterial => ASTEROID_MATERIALS[(seed >>> 0) % 3]!;

/** At most this many augmentations are drawn, one per socket. */
export const MAX_SOCKETS = 6;

const UV_HALF = 1.75;
const IVORY = 0xf4f0de;
/** The processed core's scale inside an Accomplished platform's cage (of the radius). */
const CORE = 0.52;
/** A done asteroid's orb (22 A12): the radius of its hoop and of the round gold outline, a share of its own. */
export const ORB_R = 0.86;
const INK = 0x081629;

// ---- Stages ----

type AsteroidState = 'sketch' | 'ready' | 'deferred' | 'underway' | 'resolved' | 'accept' | 'accomplished' | 'ghost' | 'unknown';

const STATE_SIGNAL: Record<AsteroidState, Signal> = {
  sketch: { rung: 'ready', sketch: true },
  ready: { rung: 'ready' },
  deferred: { rung: 'ready', deferred: true },
  underway: { rung: 'underway' },
  resolved: { rung: 'nearing', step: 0.3 },
  accept: { rung: 'nearing', step: 0.65 },
  accomplished: { rung: 'accomplished' },
  ghost: { rung: 'off', ghost: true },
  unknown: { rung: 'off', unknown: true },
};
const STATE_ALIAS: Record<string, AsteroidState> = {
  new: 'sketch', review: 'ready', active: 'underway', nearing: 'resolved', closed: 'accomplished', removed: 'ghost', off: 'ghost',
};
const STEP_CODE: Record<string, StepState> = { n: 'new', a: 'active', c: 'closed' };

export interface AsteroidStage { material?: AsteroidMaterial; state: AsteroidState; signal: Signal; steps?: StepState[] }

/**
 * Parse a stage: `asteroid[.<material>].<state>[:<steps>]`, for example `asteroid.crystal.underway:can`
 * (steps: n New, a Active, c Closed, in socket order). States: sketch, ready, deferred, underway,
 * resolved (nearing), accept, accomplished, ghost; anything else is unknown (INV-11).
 */
export function asteroidStage(stage: string): AsteroidStage {
  const [head = '', code] = stage.split(':');
  const parts = head.split('.');
  if (parts[0] !== 'asteroid') return { state: 'unknown', signal: STATE_SIGNAL.unknown };
  const material = ASTEROID_MATERIALS.find((m) => m === parts[1]);
  const raw = parts[material ? 2 : 1] ?? '';
  const state: AsteroidState = raw in STATE_SIGNAL ? (raw as AsteroidState) : STATE_ALIAS[raw] ?? 'unknown';
  const steps = code === undefined ? undefined : [...code].map((c) => STEP_CODE[c]).filter((s): s is StepState => !!s);
  return { material, state, signal: STATE_SIGNAL[state], steps };
}

// ---- The shape: a seeded distance field, shared by the shader and its JS twin ----

type V4 = [number, number, number, number];
interface Shard { o: V3; a: V3; u: V3; v: V3; len: number; w: number }
interface Geo {
  blobs: V4[];
  scale: V3;
  smooth: number;
  /** In-plane orientation of the body frame (cos, sin), so elongation points anywhere. */
  orient: [number, number];
  shards: Shard[];
  /** Cutting planes: normal and the body's support along it (the plane that just touches it). */
  planes: { n: V3; support: number; depth: number }[];
}

function rng(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: V3): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smin = (a: number, b: number, k: number) => {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

function sdRock(g: Geo, p: V3): number {
  // Hot (the silhouette search runs it ~46k times per rock): no temporaries, and sqrt rather than the
  // slower Math.hypot (23 F10).
  const [c, s] = g.orient;
  const qx = (c * p[0] + s * p[1]) / g.scale[0];
  const qy = (-s * p[0] + c * p[1]) / g.scale[1];
  const qz = p[2] / g.scale[2];
  let d = 1e3;
  for (const b of g.blobs) {
    const dx = qx - b[0];
    const dy = qy - b[1];
    const dz = qz - b[2];
    d = smin(d, Math.sqrt(dx * dx + dy * dy + dz * dz) - b[3], g.smooth);
  }
  return d * Math.min(g.scale[0], g.scale[1], g.scale[2]);
}

function sdShard(g: Geo, p: V3): number {
  let d = 1e3;
  for (const s of g.shards) {
    const r: V3 = [p[0] - s.o[0], p[1] - s.o[1], p[2] - s.o[2]];
    const k = Math.abs(dot3(r, s.u)) / s.w + Math.abs(dot3(r, s.v)) / s.w + Math.abs(dot3(r, s.a)) / s.len - 1;
    d = Math.min(d, k / Math.sqrt(2 / (s.w * s.w) + 1 / (s.len * s.len)));
  }
  return d;
}

/** The active cuts: plane i at offset h. */
type Cuts = { n: V3; h: number }[];

function sdf(g: Geo, cuts: Cuts, p: V3): number {
  let d = Math.min(sdRock(g, p), sdShard(g, p));
  for (const c of cuts) d = Math.max(d, dot3(p, c.n) - c.h);
  return d;
}

const BOUND = 1.5;
/** Does the view ray through (x, y) hit the body? (The same march as the shader.) */
function hits(g: Geo, cuts: Cuts, x: number, y: number): boolean {
  const r2 = x * x + y * y;
  if (r2 >= BOUND * BOUND) return false;
  const zEnter = Math.sqrt(BOUND * BOUND - r2);
  let t = 0;
  for (let i = 0; i < 64; i++) {
    const d = sdf(g, cuts, [x, y, zEnter - t]);
    if (d < 0.0015) return true;
    t += Math.max(d * 0.9, 0.006);
    if (t > 2 * zEnter) return false;
  }
  return false;
}

/** The silhouette's radius along screen angle θ (a binary search on the view-ray hit test). */
function rimAt(g: Geo, cuts: Cuts, theta: number): number {
  const [c, s] = [Math.cos(theta), Math.sin(theta)];
  let lo = 0;
  let hi = BOUND;
  for (let i = 0; i < 15; i++) {
    const m = (lo + hi) / 2;
    if (hits(g, cuts, c * m, s * m)) lo = m;
    else hi = m;
  }
  return lo;
}

const SIL_N = 96;

/** A seeded asteroid shape for a material, normalized so its silhouette spans about one radius. */
function makeGeo(seed: number, material: AsteroidMaterial): Geo {
  // A rock's shape is a pure function of its seed and material, and is read-only after this, so a view
  // built again for the same piece (a seek, a scene re-entered) reuses it. Building one marches ~46k
  // distance samples to normalize its size: the cost of a seek onto a dense pod (23 F10).
  const key = `${seed}|${material}`;
  let g = geoMemo.get(key);
  if (!g) {
    g = buildGeo(seed, material);
    if (geoMemo.size >= GEO_MEMO_MAX) geoMemo.delete(geoMemo.keys().next().value!);
    geoMemo.set(key, g);
  }
  return g;
}
const GEO_MEMO_MAX = 256;
const geoMemo = new Map<string, Geo>();
const silMemo = new WeakMap<Geo, Map<string, number[]>>();

function buildGeo(seed: number, material: AsteroidMaterial): Geo {
  const rand = rng(seed);
  const between = (a: number, b: number) => a + (b - a) * rand();
  const dirOn = (): V3 => {
    const z = between(-0.9, 0.9);
    const a = between(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    return [Math.cos(a) * r, Math.sin(a) * r, z];
  };
  const spec = {
    metal: { n: 7, main: 0.6, dist: [0.26, 0.42], r: [0.3, 0.42], smooth: 0.22, sx: [1.02, 1.16], sy: [0.86, 0.96] },
    crystal: { n: 5, main: 0.56, dist: [0.28, 0.44], r: [0.24, 0.36], smooth: 0.12, sx: [1.0, 1.15], sy: [0.85, 0.98] },
    energy: { n: 6, main: 0.55, dist: [0.3, 0.48], r: [0.26, 0.4], smooth: 0.16, sx: [1.2, 1.38], sy: [0.74, 0.84] },
  }[material];
  const blobs: V4[] = [[0, 0, 0, spec.main]];
  for (let i = 1; i < spec.n; i++) {
    const d = dirOn();
    const k = between(spec.dist[0]!, spec.dist[1]!);
    blobs.push([d[0] * k, d[1] * k, d[2] * k * 0.8, between(spec.r[0]!, spec.r[1]!)]);
  }
  const ang = between(0, Math.PI * 2);
  const g: Geo = {
    blobs, smooth: spec.smooth, shards: [], planes: [],
    scale: [between(spec.sx[0]!, spec.sx[1]!), between(spec.sy[0]!, spec.sy[1]!), between(0.85, 0.98)],
    orient: [Math.cos(ang), Math.sin(ang)],
  };
  // Normalize the rock so its widest silhouette radius is 1.
  let max = 0;
  for (let i = 0; i < 48; i++) max = Math.max(max, rimAt(g, [], (i / 48) * Math.PI * 2));
  const k = 1 / (max || 1);
  g.blobs = g.blobs.map(([x, y, z, r]) => [x * k, y * k, z * k, r * k]);
  g.smooth *= k;

  if (material === 'crystal') {
    // Crystal points: square bipyramids growing out of the rock, mostly toward the silhouette.
    const base = between(0, Math.PI * 2);
    for (let i = 0; i < 3; i++) {
      const az = base + (i * Math.PI * 2) / 3 + between(-0.5, 0.5);
      const el = between(-0.15, 0.55);
      const dir = norm3([Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)]);
      const a = norm3([dir[0] + between(-0.25, 0.25), dir[1] + between(-0.25, 0.25), dir[2] + between(-0.2, 0.2)]);
      const helper: V3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u = norm3(cross3(a, helper));
      const v = cross3(a, u);
      const len = between(0.55, 0.72) * (i === 0 ? 1.2 : 1);
      g.shards.push({ o: [dir[0] * 0.55, dir[1] * 0.55, dir[2] * 0.55], a, u, v, len, w: between(0.17, 0.23) });
    }
  }

  // Cutting planes, in carving order, cut like a gem's crown on the lit side: a table facet, a ring
  // of bezel facets around it (so the cuts meet in straight ridges), then a wider ring that turns the
  // silhouette angular.
  const support = (n: V3) => {
    let s = -1e3;
    const [c, sn] = g.orient;
    // Ellipsoid-scaled blobs: support = n·(Rᵀ S c) + r |S R n|, plus the smooth union's bulge.
    const rn: V3 = [c * n[0] + sn * n[1], -sn * n[0] + c * n[1], n[2]];
    const srn: V3 = [g.scale[0] * rn[0], g.scale[1] * rn[1], g.scale[2] * rn[2]];
    for (const b of g.blobs) s = Math.max(s, dot3(srn, [b[0], b[1], b[2]]) + b[3] * len3(srn));
    s += g.smooth * 0.25;
    // The rock alone: crystal points sticking out are cut along with it.
    return s;
  };
  const carveAz = Math.atan2(-0.55, -0.7) + between(-0.9, 0.9);
  const d = norm3([Math.cos(carveAz) * 0.82, Math.sin(carveAz) * 0.82, 0.57]);
  const e1 = norm3(cross3(d, [0, 0, 1]));
  const e2 = cross3(d, e1);
  const cone = (angle: number, az: number): V3 => {
    const [c, sn] = [Math.cos(angle), Math.sin(angle)];
    return norm3([
      d[0] * c + (e1[0] * Math.cos(az) + e2[0] * Math.sin(az)) * sn,
      d[1] * c + (e1[1] * Math.cos(az) + e2[1] * Math.sin(az)) * sn,
      d[2] * c + (e1[2] * Math.cos(az) + e2[2] * Math.sin(az)) * sn,
    ]);
  };
  const az0 = between(0, Math.PI * 2);
  const cuts: [V3, number][] = [
    [d, between(0.08, 0.11)],
    ...[0, 1, 2].map((i): [V3, number] => [cone(between(0.5, 0.6), az0 + (i * Math.PI * 2) / 3 + between(-0.2, 0.2)), between(0.2, 0.25)]),
    ...[0, 1, 2, 3].map((i): [V3, number] => [cone(between(1.0, 1.2), az0 + Math.PI / 3 + (i * Math.PI * 2) / 4 + between(-0.25, 0.25)), between(0.16, 0.22)]),
  ];
  g.planes = cuts.map(([n, depth]) => ({ n, support: support(n), depth }));
  return g;
}

/** How a state carves the rock: how many planes cut, and how deep. */
function cutsFor(g: Geo, state: AsteroidState): Cuts {
  // Underway: the bezel cuts only, part deep, so rough rock still holds the middle. Nearing: the whole crown.
  const planes = state === 'underway' ? g.planes.slice(1, 5) : state === 'resolved' || state === 'accept' || state === 'accomplished' ? g.planes : [];
  const deep = state === 'underway' ? 0.7 : 1;
  return planes.map((p) => ({ n: p.n, h: p.support - p.depth * deep }));
}

// ---- The painted rock ----

// GLSL ES 3.00 (Pixi compiles a shader as ES 1.00 unless it says #version 300 es), for the screen
// derivatives the bump mapping and pixel-wide lines need. The shared vertex shader is written in ES 3
// style, so it only needs the version line too.
const FRAGMENT = /* glsl */ `#version 300 es
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uTime;
uniform float uPulse;
uniform float uSeed;
uniform float uMat;
uniform vec3 uLightDir;
uniform vec3 uSignal;
uniform vec4 uBlob[8];
uniform float uBlobN;
uniform vec3 uScale;
uniform vec2 uOrient;
// The surface's slow spin (art session 2026-10-12): a diagonal axis and the angle turned so far.
uniform vec4 uSpin;
// Welding glints on the cut lines (2026-10-12): 0 none, up to 1 where people worked lately.
uniform float uWeld;
uniform float uSmooth;
uniform vec4 uShard[12];
uniform float uShardN;
uniform vec4 uPlane[8];
uniform float uCuts;
uniform float uSketch;
uniform float uHint;
uniform float uCutGlow;
uniform float uRim;
uniform float uHalo;
uniform float uFringe;
uniform float uActivity;
uniform float uBeat;
uniform float uGhost;
uniform float uNeutral;
uniform float uDormant;
uniform float uSpill;
${NOISE}
${PROGRESS_GLSL}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
/** A point turned by uSpin (Rodrigues): the rock's surface detail spins; its outline and cuts don't. */
vec3 spinOf(vec3 p) {
  vec3 k = uSpin.xyz;
  float c = cos(uSpin.w), sn = sin(uSpin.w);
  return p * c + cross(k, p) * sn + k * dot(k, p) * (1.0 - c);
}
float sdRock(vec3 p) {
  vec3 q = vec3((uOrient.x * p.x + uOrient.y * p.y), (-uOrient.y * p.x + uOrient.x * p.y), p.z) / uScale;
  float d = 1e3;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uBlobN) break;
    vec4 b = uBlob[i];
    d = smin(d, length(q - b.xyz) - b.w, uSmooth);
  }
  return d * min(min(uScale.x, uScale.y), uScale.z);
}
float sdShard(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < 3; i++) {
    if (float(i) >= uShardN) break;
    vec4 A = uShard[i * 4];
    vec4 B = uShard[i * 4 + 1];
    vec3 U = uShard[i * 4 + 2].xyz;
    vec3 V = uShard[i * 4 + 3].xyz;
    vec3 r = p - A.xyz;
    float k = abs(dot(r, U)) / B.w + abs(dot(r, V)) / B.w + abs(dot(r, B.xyz)) / A.w - 1.0;
    d = min(d, k / sqrt(2.0 / (B.w * B.w) + 1.0 / (A.w * A.w)));
  }
  return d;
}
float sdf(vec3 p) {
  float d = min(sdRock(p), sdShard(p));
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uCuts) break;
    d = max(d, dot(p, uPlane[i].xyz) - uPlane[i].w);
  }
  return d;
}
vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.003;
  return normalize(k.xyy * sdf(p + k.xyy * h) + k.yyx * sdf(p + k.yyx * h) + k.yxy * sdf(p + k.yxy * h) + k.xxx * sdf(p + k.xxx * h));
}
// Cell noise: x = distance to the nearest cell point, y = gap to the second (0 on a cell wall), z = the cell's hash.
vec3 cells(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int xx = -1; xx <= 1; xx++) {
    vec3 c = vec3(float(xx), float(y), float(z));
    vec3 o = vec3(hash31(i + c), hash31(i + c + 7.1), hash31(i + c + 3.3));
    float d = length(c + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = hash31(i + c + 5.9); } else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2 - d1, id);
}
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }

void main() {
  vec2 uv = vUV;
  float px = max(fwidth(uv.x) + fwidth(uv.y), 1e-4) * 0.7;
  vec3 L = normalize(uLightDir);

  // March the view ray (toward −z) through the body.
  float r2 = dot(uv, uv);
  float B = ${BOUND.toFixed(2)};
  float minD = 1e3;
  vec3 p = vec3(uv, 0.0);
  float hit = 0.0;
  if (r2 < B * B) {
    float zEnter = sqrt(B * B - r2);
    float t = 0.0;
    for (int i = 0; i < 64; i++) {
      vec3 q = vec3(uv, zEnter - t);
      float d = sdf(q);
      if (d < minD) { minD = d; p = q; }
      if (d < 0.0015) { hit = 1.0; break; }
      t += max(d * 0.9, 0.006);
      if (t > 2.0 * zEnter) break;
    }
  }
  float cover = max(hit, smoothstep(1.4 * px, 0.0, minD));

  vec3 n = calcNormal(p);
  vec3 ps = spinOf(p); // where the surface detail is sampled: it turns slowly, the outline doesn't
  float act = uActivity;
  float beat = progressPulse(uPulse, 0.0, uBeat) * act;

  // Which surface is this: the rough rock, a crystal point, or a cut facet?
  float dr = sdRock(p);
  float ds = sdShard(p);
  float win = min(dr, ds);
  float second = -1e3;
  float facetId = -1.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uCuts) break;
    float dp = dot(p, uPlane[i].xyz) - uPlane[i].w;
    if (dp > win) { second = win; win = dp; facetId = float(i); } else if (dp > second) { second = dp; }
  }
  float facet = step(0.0, facetId);
  float shard = (1.0 - facet) * step(ds, dr);
  float edgeGap = win - second;
  // The edge's distance in screen pixels, whatever the angle the cut meets the rock at.
  float edgePx = edgeGap / max(fwidth(edgeGap), 0.002 * px);

  // Rough surface: low hills, craters with lit rims, grit. Bump-mapped from screen derivatives.
  vec3 sp = ps * 2.4 + vec3(uSeed * 13.0, uSeed * 7.0, uSeed * 3.0);
  float h = fbm(sp);
  vec3 cr = cells(ps * 2.1 + uSeed * 17.0);
  float pit = smoothstep(0.42, 0.18, cr.x) * step(0.45, cr.z);
  float lip = smoothstep(0.3, 0.42, cr.x) * smoothstep(0.55, 0.42, cr.x) * step(0.45, cr.z);
  float H = h * 0.9 - pit * 0.55 + lip * 0.3 + vnoise(ps * 11.0 + uSeed) * 0.18;
  vec2 grad = vec2(dFdx(H), dFdy(H)) / px;
  grad = clamp(grad, -6.0, 6.0) * (1.0 - facet) * (1.0 - shard * 0.7);
  vec3 nb = normalize(n - vec3(grad, 0.0) * 0.045);
  // Facets stay flat but not airbrushed: a faint value wobble per facet, like separate touches.
  float facetTone = 1.0 + (hash31(vec3(facetId, uSeed, 2.0)) - 0.5) * 0.16 * facet;

  float ndl = dot(nb, L);
  float wrap = smoothstep(-0.18, 0.82, ndl);
  wrap = mix(wrap, floor(wrap * 4.0 + 0.5) / 4.0, 0.35);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hv = normalize(L + V);
  float nh = max(dot(nb, Hv), 0.0);

  // Materials. Rock first (with the faint hints of what lies inside), then the bared material.
  float h2 = fbm3(sp * 1.9 + 4.0);
  float vein = 1.0 - smoothstep(0.0, 0.045, abs(fbm3(ps * 2.3 + uSeed * 5.0 + 2.0) - 0.5));
  vec3 alb;
  vec3 emit = vec3(0.0);
  float spec = 0.0;
  float shin = 12.0;
  vec3 rockA, rockB;
  if (uMat < 0.5) { rockA = vec3(0.36, 0.31, 0.27); rockB = vec3(0.23, 0.21, 0.21); }
  else if (uMat < 1.5) { rockA = vec3(0.31, 0.32, 0.35); rockB = vec3(0.2, 0.21, 0.25); }
  else { rockA = vec3(0.2, 0.18, 0.2); rockB = vec3(0.11, 0.1, 0.12); }
  vec3 rock = mix(rockB, rockA, smoothstep(0.3, 0.7, h2)) * (0.78 + 0.45 * h) * (1.0 - pit * 0.3);
  alb = rock;
  vec3 ENERGY = vec3(0.36, 1.0, 0.42);
  vec3 AQUA = vec3(0.6, 0.95, 0.9);
  // The hints: dull veins in metal, a dim glint in crystal, a faint core in energy rock.
  if (uMat < 0.5) {
    alb = mix(alb, vec3(0.5, 0.49, 0.47), vein * uHint * 0.75);
    spec += vein * uHint * 0.35;
  } else if (uMat < 1.5) {
    vec3 g = cells(ps * 5.5 + uSeed * 3.0);
    float inc = step(0.78, g.z) * smoothstep(0.5, 0.2, g.x);
    vec3 gn = normalize(nb + (vec3(hash31(vec3(g.z, 1.0, 0.0)), hash31(vec3(g.z, 2.0, 0.0)), 0.5) - 0.5) * 1.2);
    alb = mix(alb, vec3(0.22, 0.4, 0.42), inc * uHint);
    emit += AQUA * pow(max(dot(gn, Hv), 0.0), 40.0) * inc * uHint * 1.6;
  } else {
    float core = smoothstep(1.0, 0.3, length(p));
    float crack = 1.0 - smoothstep(0.0, 0.02, abs(fbm3(ps * 2.3 + uSeed * 5.0 + 2.0) - 0.5));
    emit += ENERGY * crack * uHint * (0.18 + 0.6 * core);
  }

  // Crystal points are always bare crystal; cut facets bare each material.
  // Crystal points stay dull under a rind of dust until the rock is worked (uHint 1 = Ready).
  float bare = max(facet, shard);
  float rind = shard * (1.0 - facet) * (1.0 - step(0.5, uCuts)) * 0.8;
  vec3 bareAlb = alb;
  vec3 bareEmit = vec3(0.0);
  float bareSpec = 0.0;
  float bareShin = 30.0;
  if (uMat < 0.5) {
    // Polished iron-nickel: a cool mirror of the dark sky, a hot key highlight, and the etched
    // crosshatch of its crystal grain (Widmanstätten) catching the light.
    // A chrome horizon (after Syd Mead): each facet mirrors a cool sky over a warm dark ground, the
    // line between them sharp and sliding across the facet.
    vec3 refl = reflect(-V, nb);
    float hz = -refl.y * 0.6 - refl.x * 0.25 - p.y * 1.7 + p.x * 0.5 - 0.15;
    vec3 sky = mix(vec3(0.62, 0.66, 0.74), vec3(0.12, 0.15, 0.24), smoothstep(0.0, 0.55, hz));
    vec3 env = mix(vec3(0.2, 0.15, 0.12) * (0.7 + 0.3 * h), sky, smoothstep(-0.025, 0.025, hz));
    float etch = max(1.0 - smoothstep(0.0, 0.06, abs(fract(dot(p, vec3(7.0, 4.0, 2.0)) + h * 0.6) - 0.5)),
                     1.0 - smoothstep(0.0, 0.06, abs(fract(dot(p, vec3(-3.0, 7.5, 1.0)) + h * 0.6) - 0.5)));
    bareAlb = vec3(0.3, 0.31, 0.33) * (0.9 + 0.15 * etch);
    bareEmit = env * 0.75;
    bareSpec = 0.5;
    bareShin = 60.0;
  } else if (uMat < 1.5) {
    // Translucent crystal: deep aqua, lit from within, fractures glinting inside, prism fire at the edges.
    float inner = fbm3(p * 3.6 - nb * 0.9 + uSeed * 4.0);
    float frac = 1.0 - smoothstep(0.0, 0.05, abs(inner - 0.5));
    bareAlb = vec3(0.16, 0.42, 0.44);
    bareEmit = AQUA * (0.2 + 0.45 * frac) * (0.55 + 0.45 * (1.0 - wrap)) + AQUA * pow(max(dot(reflect(-V, nb), L), 0.0), 6.0) * 0.35;
    bareEmit += hue(edgePx * 0.06 + p.x) * 0.22 * smoothstep(8.0, 2.0, edgePx) * facet;
    bareSpec = 0.8;
    bareShin = 70.0;
  } else {
    // Energy: glassy black stone, a web of glowing seams, brighter toward the core.
    // Cut open, a facet is a window onto the core: glowing green, white-hot toward the middle,
    // crossed by dark veins of the rock it grew in.
    vec3 c = cells(p * 2.8 + uSeed * 9.0);
    float vein = 1.0 - smoothstep(0.0, 0.06, c.y);
    float core = smoothstep(1.0, 0.15, length(p));
    float swirl = fbm3(p * 3.0 + vec3(0.0, 0.0, uTime * 0.05));
    bareAlb = vec3(0.04, 0.05, 0.05);
    vec3 hot = mix(ENERGY * 0.85, vec3(0.85, 1.0, 0.8), core * core * 0.55);
    bareEmit = hot * (0.12 + 1.1 * core * core + 0.22 * swirl) * (1.0 - 0.8 * vein) * (0.94 + 0.06 * sin(uTime * 1.05));
    bareSpec = 1.0;
    bareShin = 50.0;
  }
  alb = mix(alb, bareAlb, bare) * facetTone;
  emit = mix(emit, bareEmit, bare) * (1.0 - rind);
  alb = mix(alb, rock * 1.15, rind * 0.75);
  spec = mix(spec, bareSpec, bare);
  shin = mix(shin, bareShin, bare);

  // Gouache lighting: a warm key from the light, cool violet-ink shadows, a cool bounce from below.
  vec3 col = alb * (vec3(0.07, 0.08, 0.15) + vec3(1.0, 0.95, 0.86) * wrap * 1.1);
  vec3 Lb = normalize(vec3(-L.xy, 0.15));
  col += alb * vec3(0.18, 0.28, 0.32) * max(dot(nb, Lb), 0.0) * 0.35;
  col += vec3(1.0, 0.96, 0.88) * pow(nh, shin) * spec;
  col += emit;

  // Cut lines: where a facet meets the rock or another facet, the laser's trace glows in the rung's
  // color, the pulse sweeping across west to east on the beat.
  float line = (1.0 - smoothstep(0.9, 2.0, edgePx)) * facet;
  float sweep = progressPulse(uPulse, (p.x + 1.2) * 0.4, uBeat);
  float glow = uCutGlow * (0.45 + 0.55 * mix(1.0, sweep, act));
  col = mix(col, mix(uSignal * 1.15, vec3(1.0), 0.25 * line), line * clamp(glow, 0.0, 1.0));
  col += uSignal * (1.0 - smoothstep(2.0, 6.0, edgePx)) * facet * glow * 0.5;

  // Welding glints: now and then a tiny white spark on a cut line, as if crews are at work. Each little
  // patch of line sparks for a moment once every few seconds; more patches spark where people worked lately.
  vec3 wc = floor(p * 9.0 + uSeed * 3.0);
  float wt = fract(uTime / 3.3 + hash31(wc + 1.7));
  float weld = step(1.0 - uWeld * 0.2, hash31(wc + 0.37)) * smoothstep(0.0, 0.02, wt) * (1.0 - smoothstep(0.02, 0.1, wt));
  col += vec3(0.88, 0.95, 1.0) * weld * (1.0 - smoothstep(0.5, 2.2, edgePx)) * facet * 1.8;

  // Work light spilling onto the rock from the superstructure (nearing): violet, gold creeping in.
  vec3 spillCol = mix(uSignal, LADDER_GOLD, uFringe);
  col += alb * spillCol * uSpill * (0.35 + 0.65 * (1.0 - wrap)) * (0.85 + 0.15 * beat) * (1.0 - facet * 0.5);

  // Rim light in the rung's color; nearing gathers gold at the limb.
  // Only a thin band at the real limb: an edge-on facet mustn't flood with rim light.
  float fres = pow(clamp(1.0 - nb.z, 0.0, 1.0), 3.0) * (1.0 - facet * 0.85);
  vec3 rimCol = mix(uSignal, LADDER_GOLD, uFringe * 0.7);
  col += rimCol * fres * uRim * (0.35 + 0.65 * wrap) * (0.9 + 0.3 * beat);

  // New: only a sensor sketch: grey slice lines across the body and its outline, over a dark fill.
  float a1 = dot(p, normalize(vec3(0.18, 1.0, 0.3))) * 3.2;
  float a2 = dot(p, normalize(vec3(1.0, -0.2, 0.45))) * 2.6;
  float w1 = abs(fract(a1 + 0.5) - 0.5) / max(fwidth(a1), 1e-4);
  float w2 = abs(fract(a2 + 0.5) - 0.5) / max(fwidth(a2), 1e-4);
  float wire = max(1.0 - smoothstep(0.8, 1.7, w1), (1.0 - smoothstep(0.8, 1.7, w2)) * 0.75) * hit;
  float outline = max(smoothstep(0.32, 0.1, nb.z) * hit, (1.0 - hit) * cover);
  float breath = 0.88 + 0.12 * sin(uTime * 6.2831853 / 12.0);
  vec3 sketch = INK * 0.6 + LADDER_READY * clamp(max(wire * 0.75, outline * 1.1), 0.0, 1.2) * breath;
  col = mix(col, sketch, uSketch);

  // Brush grain.
  col *= 0.94 + 0.12 * vnoise(vec3(uv.x * 16.0 + uv.y * 5.0, uv.y * 30.0, uSeed * 5.0));
  if (uNeutral > 0.5) col = vec3(0.4, 0.42, 0.46) * (0.55 + 0.6 * wrap);
  col *= mix(1.0, 0.5, uDormant);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  // A ghost: desaturated and lifted toward a pale, cool grey, so it reads as a fading memory, not a hole.
  col = mix(col, (vec3(lum) * 1.4 + 0.08) * vec3(0.74, 0.84, 1.0), uGhost * 0.9);

  float alpha = cover * (1.0 - uGhost * 0.5) * mix(1.0, 0.55 + 0.45 * max(wire, outline), uSketch);
  // A halo in the rung's color, outside the silhouette.
  float halo = exp(-max(minD, 0.0) * 7.0) * (1.0 - cover) * uHalo * (0.85 + 0.3 * beat) * smoothstep(B, B - 0.2, sqrt(r2));
  vec3 outCol = col * alpha + rimCol * halo;
  finalColor = vec4(outCol, clamp(alpha + halo, 0.0, 1.0)) * uColor.a;
}
`;

let program: GlProgram | null = null;
function rockShader(uniforms: Record<string, UniformData>): { shader: Shader; u: Record<string, unknown> } {
  program ??= GlProgram.from({ vertex: `#version 300 es\n${MESH_VERTEX}`, fragment: FRAGMENT, name: 'asteroid' });
  const group = new UniformGroup(uniforms);
  return { shader: new Shader({ glProgram: program, resources: { u: group } }), u: group.uniforms as Record<string, unknown> };
}

interface RockLook { sketch: number; hint: number; cutGlow: number; rim: number; halo: number; fringe: number; ghost: number; neutral: number; dormant: number; spill: number }

function rockLook(state: AsteroidState, s: Signal): RockLook {
  const b: RockLook = { sketch: 0, hint: 0, cutGlow: 0, rim: 0.3, halo: 0, fringe: 0, ghost: 0, neutral: 0, dormant: 0, spill: 0 };
  switch (state) {
    case 'sketch': return { ...b, sketch: 1, rim: 0 };
    case 'ready': return { ...b, hint: 1, rim: 0.32, halo: 0.06 };
    case 'deferred': return { ...b, hint: 1, rim: 0.25, dormant: 1 };
    case 'underway': return { ...b, hint: 1, cutGlow: 1, rim: 1.0, halo: 0.42 };
    case 'resolved':
    case 'accept': return { ...b, hint: 1, cutGlow: 0.7, rim: 0.8, halo: 0.3, fringe: s.step ?? 0.5, spill: 0.2 };
    // Processed ore: every cut bared, the seams glowing gold from within, a warm rim; calm.
    case 'accomplished': return { ...b, hint: 1, cutGlow: 0.3, rim: 0.55, halo: 0.12, fringe: 1, spill: 0.12 };
    case 'ghost': return { ...b, hint: 0.5, rim: 0.2, ghost: 1 };
    default: return { ...b, neutral: 1, rim: 0.2 };
  }
}

// ---- Hardware: lit in gouache value planes from the upper left (as hull3d), drawn crisp ----

const STEEL = 0x7d899e;
const STEEL_LIGHT = 0xb9c2cf;
const STEEL_DARK = 0x3a4252;
const PANEL = 0xcfc8b8;
/** The key light on screen (y down): from the upper left, as hull3d. */
const KEY: [number, number] = [-0.6, -0.8];

/** A lit tone for a surface facing (lx, ly) in a module's frame, turned by φ onto the screen. */
function toneAt(base: number, lx: number, ly: number, phi: number): number {
  const [c, s] = [Math.cos(phi), Math.sin(phi)];
  const t = (c * lx - s * ly) * KEY[0] + (s * lx + c * ly) * KEY[1];
  return t > 0.15 ? keyLit(base, Math.min(0.45, (t - 0.15) * 0.6)) : coolShade(base, Math.min(0.6, (0.15 - t) * 0.5));
}

interface Lamp { g: Graphics; lag: number; kind: 'blink' | 'pulse' | 'steady' }

/** A lamp: a soft dab of light around a bright core (additive), alpha driven per tick. */
function lamp(color: number, r: number, x: number, y: number): Graphics {
  const g = new Graphics();
  g.circle(x, y, r * 2.8).fill({ color, alpha: 0.18 }).circle(x, y, r * 1.6).fill({ color, alpha: 0.35 }).circle(x, y, r).fill({ color: lighten(color, 0.55) });
  g.blendMode = 'add';
  return g;
}

/** A lattice girder from a to b: two rails and zig-zag bracing. */
function girder(g: Graphics, ax: number, ay: number, bx: number, by: number, w: number, color: number, lw: number, dark = darken(color, 0.35)): void {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const [nx, ny] = [(-(by - ay) / len) * w * 0.5, ((bx - ax) / len) * w * 0.5];
  // Capped: a hairline girder (w ~ 0) would otherwise emit thousands of degenerate segments.
  const segs = Math.min(40, Math.max(2, Math.round(len / (w * 1.3))));
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const s = i % 2 ? 1 : -1;
    g.moveTo(ax + (bx - ax) * t0 + nx * s, ay + (by - ay) * t0 + ny * s).lineTo(ax + (bx - ax) * t1 - nx * s, ay + (by - ay) * t1 - ny * s);
  }
  g.stroke({ width: lw * 0.7, color: dark });
  g.moveTo(ax + nx, ay + ny).lineTo(bx + nx, by + ny).moveTo(ax - nx, ay - ny).lineTo(bx - nx, by - ny);
  g.stroke({ width: lw, color, cap: 'round' });
}

interface ModuleNode { root: Container; lamps: Lamp[] }

/**
 * One step (Task) at a socket (simplified 2026-10-12): a strap of plating clamped along the rim, like
 * a length of deck being laid. Drawn in the socket's frame (the rim at the origin, outward is −y) and
 * turned to the rim's normal; `s` is its length. New: the strap's outline, waiting; Active: the plate
 * going on, with one blue work light at its end; Closed: the plate fixed with a gold rivet, still.
 */
function buildStrap(state: StepState, s: number, phi: number, lag: number): ModuleNode {
  const root = new Container();
  root.rotation = phi;
  const g = new Graphics();
  root.addChild(g);
  const node: ModuleNode = { root, lamps: [] };
  const [w, h] = [s, Math.max(1.6, s * 0.17)];
  const lw = Math.max(0.9, s * 0.05);
  if (state === 'new') {
    g.rect(-w / 2, -h, w, h).fill({ color: INK, alpha: 0.35 }).stroke({ width: lw, color: READY, alpha: 0.9 });
    return node;
  }
  const done = state === 'closed';
  const plate = done ? mix(STEEL, PANEL, 0.3) : STEEL;
  g.rect(-w / 2, -h, w, h).fill({ color: toneAt(plate, 0, -1, phi) }).stroke({ width: Math.max(0.6, s * 0.025), color: INK, alpha: 0.55 });
  // The plate's lit edge, and the pins that hold it to the rock.
  g.moveTo(-w / 2, -h).lineTo(w / 2, -h).stroke({ width: lw * 0.8, color: toneAt(STEEL_LIGHT, 0, -1, phi) });
  for (const x of [-0.36, 0.36]) g.circle(x * w, -h / 2, Math.max(0.6, s * 0.035)).fill({ color: STEEL_DARK });
  if (done) {
    const rv = Math.max(1, s * 0.06);
    g.circle(0, -h / 2, rv * 1.8).fill({ color: SUCCESS, alpha: 0.18 });
    g.circle(0, -h / 2, rv).fill({ color: SUCCESS }).stroke({ width: Math.max(0.5, s * 0.02), color: darken(SUCCESS, 0.45) });
  } else {
    node.lamps.push({ g: lamp(PROGRESS, Math.max(0.9, s * 0.06), w * 0.5, -h * 0.5), lag, kind: 'blink' });
  }
  for (const l of node.lamps) root.addChild(l.g);
  return node;
}

/** A tilted ring around the rock, in radius units: its half-axes and tilt. */
interface Ring { rx: number; ry: number; tilt: number }

function ringPoint(ring: Ring, t: number, grow = 0): [number, number] {
  const [x, y] = [Math.cos(t) * (ring.rx + grow), Math.sin(t) * (ring.ry + grow * 0.3)];
  const [c, s] = [Math.cos(ring.tilt), Math.sin(ring.tilt)];
  return [x * c - y * s, x * s + y * c];
}

/**
 * One half of a catwalk band round the rock (2026-10-12): a flat deck between two rails, with cross
 * ties every few segments, shaded by which way each stretch faces the light. `isFront(t)` says which
 * half a point is on; the far half is skipped where `hide` says the rock covers it. `w` is the deck's
 * half-width and `R` the radius, both so the band reads as walkway rather than wire.
 */
function catwalkHalf(ring: Ring, R: number, isFront: (t: number) => boolean, front: boolean, w: number, base: number, hide: (x: number, y: number) => boolean, light: [number, number]): Graphics {
  const g = new Graphics();
  const N = 56;
  const lw = Math.max(0.9, R * 0.028);
  const shadeAt = (nx: number, ny: number) => {
    const t = nx * light[0] + ny * light[1];
    return t > 0.1 ? keyLit(base, Math.min(0.5, (t - 0.1) * 0.7)) : coolShade(base, Math.min(0.55, (0.1 - t) * 0.45));
  };
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * Math.PI * 2;
    const t1 = ((i + 1) / N) * Math.PI * 2;
    if (isFront(t0) !== front || isFront(t1) !== front) continue;
    const [ax, ay] = ringPoint(ring, t0, -w);
    const [bx, by] = ringPoint(ring, t1, -w);
    const [cx, cy] = ringPoint(ring, t0, w);
    const [dx, dy] = ringPoint(ring, t1, w);
    if (!front && hide(cx, cy) && hide(ax, ay)) continue;
    const [mx, my] = ringPoint(ring, (t0 + t1) / 2);
    const ml = Math.hypot(mx, my) || 1;
    const lit = shadeAt(mx / ml, my / ml);
    const deck = front ? lit : mix(lit, INK, 0.35);
    g.poly([ax * R, ay * R, bx * R, by * R, dx * R, dy * R, cx * R, cy * R]).fill({ color: darken(deck, 0.18) });
    g.moveTo(cx * R, cy * R).lineTo(dx * R, dy * R).stroke({ width: lw, color: deck, cap: 'round' });
    g.moveTo(ax * R, ay * R).lineTo(bx * R, by * R).stroke({ width: lw * 0.8, color: darken(deck, 0.4), cap: 'round' });
    if (i % 3 === 0) g.moveTo(ax * R, ay * R).lineTo(cx * R, cy * R).stroke({ width: lw * 0.6, color: darken(deck, 0.45) });
  }
  return g;
}

// ---- The view ----

const ORDER = [0, 2, 4, 1, 3, 5];
/** One turn of an asteroid's surface, in seconds: quicker than a planet (96 s), slower than a ship's bob. */
const SPIN_S = 70;

/**
 * An objective asteroid (13 §4.2). `radius` is the rock's widest silhouette radius in px; the
 * catwalk reaches about 1.35 radius, a crystal's points about 1.25. Seed varies the shape and,
 * unless `material` is given, the material; never the state.
 */
export class AsteroidView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'celestial' as const;
  readonly material: AsteroidMaterial;
  private readonly body = new Container();
  private readonly mbody = new Container();
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly geometry: Geometry;
  private readonly u: Record<string, unknown>;
  private readonly geo: Geo;
  /** The outline (aura.ts): opportunity blue on every open rung, a contact's included; victory gold once done. */
  private readonly aura: Aura;
  private readonly hw = new Container();
  private readonly offMarks = new Graphics();
  private modules: ModuleNode[] = [];
  private lamps: Lamp[] = [];
  private state: AsteroidState | '' = '';
  private steps: StepState[] = [];
  private readonly phase: number;
  /** The surface spin's axis (unit) and direction (±1). */
  private readonly spinAxis: [number, number, number, number];
  private windows: WindowLights | null = null;
  private glintG: Graphics | null = null;
  private flash = 0;
  private lastT = 0;
  private builtLight = 0;
  private light: [number, number, number] = [-0.62, -0.5, 0.6];
  private readonly sockets = new Map<string, { x: number; y: number; phi: number; theta: number }[]>();

  constructor(private readonly radius: number, private readonly seed: number, material?: AsteroidMaterial) {
    this.material = material ?? asteroidMaterial(seed);
    this.geo = makeGeo(seed, this.material);
    this.phase = ((seed >>> 0) % 997) / 997;
    // A diagonal axis, leaning one way or the other, and a turning direction, both from the seed.
    const lean = (seed >>> 3) % 2 ? 1 : -1;
    const ax = [0.62 * lean, 0.62, 0.48];
    const l = Math.hypot(...ax);
    this.spinAxis = [ax[0]! / l, ax[1]! / l, ax[2]! / l, (seed >>> 5) % 2 ? 1 : -1];
    this.geometry = quadGeometry(radius * UV_HALF, UV_HALF);
    const g = this.geo;
    const blobs = new Float32Array(32);
    g.blobs.forEach((b, i) => blobs.set(b, i * 4));
    const shards = new Float32Array(48);
    g.shards.forEach((s, i) => {
      shards.set([...s.o, s.len], i * 16);
      shards.set([...s.a, s.w], i * 16 + 4);
      shards.set([...s.u, 0], i * 16 + 8);
      shards.set([...s.v, 0], i * 16 + 12);
    });
    const { shader, u } = rockShader({
      uTime: { value: 0, type: 'f32' },
      uPulse: { value: 0, type: 'f32' },
      uSeed: { value: ((seed >>> 0) % 9973) / 9973, type: 'f32' },
      uMat: { value: ASTEROID_MATERIALS.indexOf(this.material), type: 'f32' },
      uLightDir: { value: new Float32Array(this.light), type: 'vec3<f32>' },
      uSignal: { value: new Float32Array(rgb(RUNG_COLOR.ready)), type: 'vec3<f32>' },
      uBlob: { value: blobs, type: 'vec4<f32>', size: 8 },
      uBlobN: { value: g.blobs.length, type: 'f32' },
      uScale: { value: new Float32Array(g.scale), type: 'vec3<f32>' },
      uOrient: { value: new Float32Array(g.orient), type: 'vec2<f32>' },
      uSpin: { value: new Float32Array([0, 0, 1, 0]), type: 'vec4<f32>' },
      uWeld: { value: 0, type: 'f32' },
      uSmooth: { value: g.smooth, type: 'f32' },
      uShard: { value: shards, type: 'vec4<f32>', size: 12 },
      uShardN: { value: g.shards.length, type: 'f32' },
      uPlane: { value: new Float32Array(32), type: 'vec4<f32>', size: 8 },
      uCuts: { value: 0, type: 'f32' },
      uSketch: { value: 0, type: 'f32' },
      uHint: { value: 1, type: 'f32' },
      uCutGlow: { value: 0, type: 'f32' },
      uRim: { value: 0.3, type: 'f32' },
      uHalo: { value: 0, type: 'f32' },
      uFringe: { value: 0, type: 'f32' },
      uActivity: { value: 0, type: 'f32' },
      uBeat: { value: 2.4, type: 'f32' },
      uGhost: { value: 0, type: 'f32' },
      uNeutral: { value: 0, type: 'f32' },
      uDormant: { value: 0, type: 'f32' },
      uSpill: { value: 0, type: 'f32' },
    });
    this.u = u;
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    // Outside the rock, in the crisp marks (the paint pass would smear a thin rim): it rocks and drifts with the rock.
    this.aura = new Aura(AURA.objective, radius * 0.16, { outside: true });
    this.body.addChild(this.mesh);
    this.root.addChild(this.body);
    this.mbody.addChild(this.aura.root, this.hw, this.offMarks);
    this.marks.addChild(this.mbody);
    this.setStage('asteroid.ready');
  }

  /**
   * The outline's shape in radius units, for the current state (23 C7): a polygon of rim radii at equal
   * angles, an orb's circle, or null (no outline). The atlas bake stores it beside the frames.
   */
  auraShape: { polygon: number[] } | { circle: number } | null = null;

  /** Hide the outline (the atlas bake draws the art alone; the outline stays a live layer). */
  bareForBake(): void {
    this.aura.setAlpha(0);
  }

  /** Its look's own sketch weight (the radar outline is 1), and an arrival as a contact under way. */
  private lookSketch = 0;
  /** When an arrival as a radar contact began (wall s; null: next tick), or unset. */
  private contactFrom: number | null | undefined;

  /**
   * Arriving (2026-10-13): it shows as its radar outline first, its hardware hidden, then resolves
   * into its own look as it settles (from 0.8 s to 1.3 s). A New asteroid is an outline anyway.
   */
  /** A victory's gold flare, 0..1 (27 B3; aura.ts). */
  setAuraFlare(share: number): void {
    this.aura.setFlare(share);
  }

  contact(): void {
    this.contactFrom = null;
    this.u.uSketch = 1;
    this.mbody.alpha = 0;
  }

  /** How lately anyone worked it (ViewNode.activity, 0..1): more welding glints when recent. */
  private activity = 0;

  /** What the scene around it is doing (2026-10-12): how lately it was worked. */
  ambient(a: { activity?: number }): void {
    if (a.activity !== undefined) this.activity = Math.max(0, Math.min(1, a.activity));
  }

  /** The current steps (Tasks), in socket order; at most MAX_SOCKETS are drawn. */
  setSteps(steps: StepState[]): void {
    this.steps = steps.slice(0, MAX_SOCKETS);
    if (this.state) this.rebuild();
  }

  setStage(stage: string): void {
    const s = asteroidStage(stage);
    // A stage's material segment is only a label: the material is the seed's (or the constructor's).
    if (s.steps) this.steps = s.steps.slice(0, MAX_SOCKETS);
    this.state = s.state;
    const look = rockLook(s.state, s.signal);
    const rung = s.signal.rung;
    const cuts = cutsFor(this.geo, s.state);
    const planes = this.u.uPlane as Float32Array;
    planes.fill(0);
    cuts.forEach((c, i) => planes.set([...c.n, c.h], i * 4));
    this.lookSketch = look.sketch;
    Object.assign(this.u, {
      uCuts: cuts.length, uSketch: this.contactFrom !== undefined ? 1 : look.sketch, uHint: look.hint, uCutGlow: look.cutGlow, uRim: look.rim, uHalo: look.halo,
      uFringe: look.fringe, uGhost: look.ghost, uNeutral: look.neutral, uDormant: look.dormant, uSpill: look.spill,
      uActivity: ACTIVITY[rung], uBeat: beatOf(rung),
    });
    (this.u.uSignal as Float32Array).set(rgb(RUNG_COLOR[rung]));
    drawOffLadderMarks(this.offMarks, { ...s.signal, ghost: false }, this.radius, this.radius * 1.3);
    this.rebuild();
  }

  /** Light comes from the region's star (the scene origin on the chart). */
  setLightFrom(x: number, y: number): void {
    const dx = x - this.root.x;
    const dy = y - this.root.y;
    const len = Math.hypot(dx, dy) || 1;
    this.light = [(dx / len) * 0.8, (dy / len) * 0.8, 0.6];
    // The platform's hardware is baked lit from the star: re-bake only when the light has turned.
    if (this.state === 'accomplished' && Math.abs(Math.atan2(dy, dx) - this.builtLight) > 0.12) this.rebuild();
  }

  /** The outline for these cuts, kept per rock and cut set (read-only): 96 rim searches cost a few ms each time (23 F10). */
  private silhouette(cuts: Cuts): number[] {
    let byCuts = silMemo.get(this.geo);
    if (!byCuts) silMemo.set(this.geo, (byCuts = new Map()));
    const key = cuts.map((c) => `${c.n.join(',')}:${c.h}`).join('|');
    let out = byCuts.get(key);
    if (!out) {
      out = [];
      for (let i = 0; i < SIL_N; i++) out.push(rimAt(this.geo, cuts, (i / SIL_N) * Math.PI * 2));
      byCuts.set(key, out);
    }
    return out;
  }

  /** Is (x, y) (in radius units) inside the silhouette? */
  private static inside(sil: number[], x: number, y: number): boolean {
    let a = Math.atan2(y, x);
    if (a < 0) a += Math.PI * 2;
    const f = (a / (Math.PI * 2)) * sil.length;
    const i = Math.floor(f) % sil.length;
    const r = sil[i]! + (sil[(i + 1) % sil.length]! - sil[i]!) * (f - Math.floor(f));
    return Math.hypot(x, y) < r - 0.02;
  }

  /** The sockets for a carve state: six rim points, spread so any first few are well apart. */
  private socketsFor(state: AsteroidState, sil: number[]): { x: number; y: number; phi: number; theta: number }[] {
    const key = `${cutsFor(this.geo, state).length}`;
    let s = this.sockets.get(key);
    if (s) return s;
    const rand = rng(this.seed * 31 + 7);
    const base = -Math.PI / 2 + (rand() - 0.5) * 0.9;
    const rimPt = (t: number): [number, number] => {
      let a = t % (Math.PI * 2);
      if (a < 0) a += Math.PI * 2;
      const f = (a / (Math.PI * 2)) * sil.length;
      const i = Math.floor(f) % sil.length;
      const r = sil[i]! + (sil[(i + 1) % sil.length]! - sil[i]!) * (f - Math.floor(f));
      return [Math.cos(t) * r, Math.sin(t) * r];
    };
    s = Array.from({ length: MAX_SOCKETS }, (_, i) => {
      const theta = base + (i * Math.PI * 2) / MAX_SOCKETS + (rand() - 0.5) * 0.35;
      const [x, y] = rimPt(theta);
      const [x0, y0] = rimPt(theta - 0.09);
      const [x1, y1] = rimPt(theta + 0.09);
      // Outward normal of the rim: perpendicular to its tangent, pointing away from the center.
      let [nx, ny] = [y1 - y0, -(x1 - x0)];
      if (nx * x + ny * y < 0) [nx, ny] = [-nx, -ny];
      const l = Math.hypot(nx, ny) || 1;
      [nx, ny] = [nx / l, ny / l];
      // Lean toward the radial direction a little, so a module on a sharp corner doesn't lie flat.
      const rl = Math.hypot(x, y) || 1;
      [nx, ny] = [nx * 0.7 + (x / rl) * 0.3, ny * 0.7 + (y / rl) * 0.3];
      return { x: x - nx * 0.035, y: y - ny * 0.035, phi: Math.atan2(nx, -ny), theta };
    });
    s = ORDER.map((i) => s![i]!);
    this.sockets.set(key, s);
    return s;
  }

  private clearHardware(): void {
    for (const c of this.hw.removeChildren()) c.destroy({ children: true });
    this.modules = [];
    this.lamps = [];
  }

  private rebuild(): void {
    this.clearHardware();
    const state = this.state as AsteroidState;
    const R = this.radius;
    this.mbody.alpha = 1;
    this.windows = null;
    this.glintG = null;
    this.body.scale.set(state === 'accomplished' ? CORE : 1);
    // Opportunity blue while the work is open; victory gold once it's done (aura.ts).
    this.aura.setColor(state === 'accomplished' ? AURA.accomplished : AURA.objective);
    if (state === 'accomplished') {
      // The platform's gold follows the core and its bands (`buildPlatform`), never a disc, so the
      // gaps in the structure stay dark.
      return this.buildPlatform();
    }
    const cuts = cutsFor(this.geo, state);
    const sil = this.silhouette(cuts);
    // Every rock on the ladder wears the aura along its own silhouette, a sensor contact included: the
    // wireframe says it isn't seen yet, the blue that it's a Story (2026-10-12). A ghost doesn't.
    if (state === 'ghost' || state === 'unknown') { this.auraShape = null; this.aura.setPolygon([]); }
    else {
      this.auraShape = { polygon: sil.map((r) => Math.round(r * 1e4) / 1e4) };
      this.aura.setPolygon(sil.flatMap((r, i) => [Math.cos((i / sil.length) * Math.PI * 2) * r * R, Math.sin((i / sil.length) * Math.PI * 2) * r * R]));
    }

    if (state === 'ghost') {
      // A dashed outline that follows the rock's own silhouette.
      const g = new Graphics();
      const n = sil.length;
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const r0 = (sil[i]! + 0.1) * R;
        const r1 = (sil[(i + 1) % n]! + 0.1) * R;
        g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0).lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      }
      g.stroke({ width: 1.5, color: IVORY, alpha: 0.5 });
      this.hw.addChild(g);
      return;
    }

    if (state === 'sketch') this.hw.addChild(this.brackets(sil));
    const nearing = state === 'resolved' || state === 'accept';
    // The build (2026-10-12): gantries folded on the rim while it's carved, arches rising once nearing.
    if (state === 'underway') this.hw.addChild(this.gantries(sil, 0));
    else if (nearing) this.hw.addChild(this.gantries(sil, state === 'accept' ? 0.65 : 0.3));

    const sockets = this.socketsFor(state, sil);
    const s = R * 0.5;
    this.steps.forEach((st, i) => {
      const k = sockets[i]!;
      const m = buildStrap(st, s, k.phi, i * 0.17);
      m.root.position.set(k.x * R, k.y * R);
      this.hw.addChild(m.root);
      this.modules.push(m);
      this.lamps.push(...m.lamps);
    });
  }

  /** Sensor-contact brackets around the sketch: a radar's corner ticks, grey. */
  private brackets(sil: number[]): Graphics {
    const R = this.radius;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    sil.forEach((r, i) => {
      const a = (i / sil.length) * Math.PI * 2;
      x0 = Math.min(x0, Math.cos(a) * r); x1 = Math.max(x1, Math.cos(a) * r);
      y0 = Math.min(y0, Math.sin(a) * r); y1 = Math.max(y1, Math.sin(a) * r);
    });
    const pad = 0.16;
    [x0, y0, x1, y1] = [(x0 - pad) * R, (y0 - pad) * R, (x1 + pad) * R, (y1 + pad) * R];
    const k = R * 0.22;
    const g = new Graphics();
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]] as const) {
      g.moveTo(x + sx * k, y).lineTo(x, y).lineTo(x, y + sy * k);
    }
    g.stroke({ width: 1.4, color: READY, alpha: 0.8 });
    // A range tick under the contact.
    g.moveTo((x0 + x1) / 2 - k * 0.5, y1 + 4).lineTo((x0 + x1) / 2 + k * 0.5, y1 + 4).stroke({ width: 1, color: READY, alpha: 0.5 });
    return g;
  }

  // ---- The build: gantry arches (2026-10-12) ----
  // Two arches cross over the rock, each springing from an A-frame gantry planted on the rim at both
  // feet. While the rock is carved (Underway) the gantries stand folded, their booms laid along the
  // surface. Once it's nearing, each boom reaches up and over: the arch grows from both feet toward
  // its crown, as far as the step has come (Resolved about a third, Ready to Accept about two thirds),
  // and a short crane jib at each growing tip hoists the next section under a violet work light, gold
  // creeping into the foot lights with the step. Closed, the arches are the finished mine's two
  // crossing bands (`buildPlatform`), lifted with the core into orbit.

  private gantries(sil: number[], step: number): Container {
    const R = this.radius;
    const rand = rng(this.seed * 13 + 5);
    const out = new Container();
    const back = new Graphics();
    const g = new Graphics();
    out.addChild(back, g);
    const lw = Math.max(0.9, R * 0.03);
    const w = R * 0.08;
    const building = step > 0;
    // Seen a little from above (elevation E), turned a little by the seed. World: x right, y toward the
    // viewer, z up; the screen's y is down.
    const E = 0.38;
    const [se, ce] = [Math.sin(E), Math.cos(E)];
    const turn = (rand() - 0.5) * 0.4;
    const [ct, st] = [Math.cos(turn), Math.sin(turn)];
    const proj = (x: number, y: number, z: number): [number, number] => {
      const sx = x;
      const sy = y * se - z * ce;
      return [(sx * ct - sy * st) * R, (sx * st + sy * ct) * R];
    };
    const hidden = (p: [number, number]) => AsteroidView.inside(sil, p[0] / R, p[1] / R);
    // The rock's top on screen (radius units), so an arch clears a flat rock without towering over it.
    const topUp = Math.max(...sil.map((r, i) => -Math.sin((i / sil.length) * Math.PI * 2 + turn) * r));
    const hz = Math.min(1.2, Math.max(0.7, topUp / ce + 0.3));
    [{ phi: Math.PI / 4 + (rand() - 0.5) * 0.3, lift: 1 }, { phi: -Math.PI / 4 + (rand() - 0.5) * 0.3, lift: 0.88 }].forEach((arch, k) => {
      const [cp, sp] = [Math.cos(arch.phi), Math.sin(arch.phi)];
      // Each foot planted on the rock: the furthest point out along the arch's line that still lands
      // inside the silhouette, so a long, flat rock gets a long, low arch and no foot stands in space.
      const reach = (sgn: number) => {
        for (let r = 1.05; r > 0.3; r -= 0.04) if (hidden(proj(sgn * r * cp, sgn * r * sp, 0))) return r;
        return 0.3;
      };
      const [rA, rB] = [reach(1), reach(-1)];
      // α from 0 (one foot) through π/2 (the crown) to π (the other foot).
      const at3 = (a: number): [number, number, number] => {
        const r = Math.cos(a) >= 0 ? rA : rB;
        return [r * Math.cos(a) * cp, r * Math.cos(a) * sp, hz * arch.lift * Math.sin(a)];
      };
      const at = (a: number) => proj(...at3(a));
      const front = (a: number) => at3(a)[1] >= -0.05;
      // How far this arch has grown from each foot: the first leads, the second follows.
      const f = !building ? 0 : k === 0 ? Math.min(0.92, 0.3 + step) : Math.max(0.12, step * 1.1 - 0.05);
      for (const dir of [1, -1] as const) {
        const a0 = dir > 0 ? 0 : Math.PI;
        const footFront = front(a0);
        const gg = footFront ? g : back;
        const shade = footFront ? STEEL_LIGHT : mix(STEEL, INK, 0.3);
        // The gantry: an A-frame on the ground, its legs across the arch's plane.
        const top = at(a0 + dir * 0.16);
        const [gx, gy, gz] = at3(a0);
        const leg = 0.16;
        if (!(footFront === false && hidden(top))) {
          for (const sgn of [-1, 1]) {
            const l = proj(gx - sp * leg * sgn, gy + cp * leg * sgn, gz);
            gg.moveTo(l[0], l[1]).lineTo(top[0], top[1]);
          }
          gg.stroke({ width: lw, color: shade, cap: 'round' });
          gg.circle(top[0], top[1], Math.max(0.9, R * 0.035)).fill({ color: STEEL_DARK });
        }
        if (!building) {
          // Folded: the boom laid along the ground, back toward the rock's middle.
          const rest = proj(gx * 0.55, gy * 0.55, 0.05);
          if (footFront || !hidden(rest)) girder(gg, top[0], top[1], rest[0], rest[1], R * 0.06, STEEL, lw * 0.85, STEEL_DARK);
          continue;
        }
        // The arch so far, from this foot toward the crown: a lattice girder, the far side behind the rock.
        const segs = 9;
        const span = (f * Math.PI) / 2;
        let prevA = a0;
        let prev = at(a0);
        for (let i = 1; i <= segs; i++) {
          const a = a0 + dir * span * (i / segs);
          const p = at(a);
          const isFront = front((a + prevA) / 2);
          if (isFront || !(hidden(p) && hidden(prev))) {
            girder(isFront ? g : back, prev[0], prev[1], p[0], p[1], w, isFront ? (k ? STEEL : STEEL_LIGHT) : mix(STEEL, INK, 0.3), lw, STEEL_DARK);
          }
          prev = p;
          prevA = a;
        }
        // The crane at the growing tip: a jib reaching on and up, a cable, the next section on the hook.
        const aT = a0 + dir * span;
        const tip3 = at3(aT);
        const rT = Math.cos(aT) >= 0 ? rA : rB;
        const d3: [number, number, number] = [-Math.sin(aT) * rT * cp * dir, -Math.sin(aT) * rT * sp * dir, Math.cos(aT) * hz * arch.lift * dir];
        const dl = Math.hypot(...d3) || 1;
        d3[0] /= dl; d3[1] /= dl; d3[2] /= dl;
        const jib3: [number, number, number] = [tip3[0] + d3[0] * 0.3, tip3[1] + d3[1] * 0.3, tip3[2] + d3[2] * 0.3 + 0.12];
        const tip = proj(...tip3);
        const jib = proj(...jib3);
        const hook = proj(jib3[0], jib3[1], jib3[2] - 0.2);
        const tipFront = tip3[1] >= -0.05;
        if (!tipFront && hidden(jib)) continue;
        const tg = tipFront ? g : back;
        tg.moveTo(tip[0], tip[1]).lineTo(jib[0], jib[1]).stroke({ width: lw * 1.1, color: STEEL_LIGHT, cap: 'round' });
        tg.moveTo(jib[0], jib[1]).lineTo(hook[0], hook[1]).stroke({ width: Math.max(0.6, lw * 0.45), color: STEEL_LIGHT });
        tg.rect(hook[0] - R * 0.07, hook[1], R * 0.14, R * 0.045).fill({ color: toneAt(STEEL, 0, -1, 0) }).stroke({ width: 0.6, color: INK, alpha: 0.5 });
        const tipLamp = lamp(NEARING, Math.max(0.9, R * 0.03), jib[0], jib[1]);
        if (!tipFront) tipLamp.alpha = 0.7;
        out.addChild(tipLamp);
        this.lamps.push({ g: tipLamp, lag: k * 0.4 + (dir > 0 ? 0 : 0.2), kind: 'pulse' });
        if (footFront || !hidden(top)) {
          const footLamp = lamp(step > 0.5 ? SUCCESS : NEARING, Math.max(0.8, R * 0.025), top[0], top[1]);
          out.addChild(footLamp);
          this.lamps.push({ g: footLamp, lag: 0.6 + k * 0.3, kind: 'pulse' });
        }
      }
    });
    return out;
  }

  // ---- Accomplished: a compact orbital mine (simplified 2026-10-12; a round orb since 22 A12) ----
  // The processed core (the rock, scaled to CORE, every cut bared and glowing gold) wrapped in two
  // crossing catwalk bands of brushed titanium, like straps round a parcel, with two girders, a drill
  // bore, gold rivets on the deck and warm walkway lights. It all fits inside the radius. The same
  // scaffold vocabulary dresses a defeated bug hulk (swarm.ts).

  private buildPlatform(): void {
    const R = this.radius;
    const rand = rng(this.seed * 17 + 3);
    this.builtLight = Math.atan2(this.light[1], this.light[0]);
    const L: [number, number] = [this.light[0] / 0.8, this.light[1] / 0.8];
    const sil = this.silhouette(cutsFor(this.geo, 'accomplished'));
    const hide = (x: number, y: number) => AsteroidView.inside(sil, x / CORE, y / CORE);
    const tilt = -0.24 + (rand() - 0.5) * 0.36;
    const eq: Ring = { rx: 0.72, ry: 0.25 + rand() * 0.05, tilt };
    const cross: Ring = { rx: 0.66, ry: 0.22, tilt: tilt + 1.15 };
    const near = (t: number) => Math.sin(t) > 0;
    const lw = Math.max(0.9, R * 0.03);
    const TITAN = 0x9aa4b4;
    const bore = this.material === 'metal' ? 0xffb050 : this.material === 'crystal' ? 0x9ff0e0 : 0x78ff7a;

    // Told apart from a defeated hive's asterisk by shape, not only by colour (22 A12, R10): the mine is
    // an unmistakable circle. Its gold outline follows a disc, not the rock's facets, and a hoop rings
    // the core and its bands, so at any size it reads as a round orb.
    this.auraShape = { circle: ORB_R };
    this.aura.setShapes([new GraphicsContext().circle(0, 0, ORB_R * R).fill({ color: 0xffffff })]);
    const hoop = new Graphics();
    hoop.circle(0, 0, ORB_R * R).stroke({ width: Math.max(1, R * 0.05), color: SUCCESS, alpha: 0.9 });
    hoop.circle(0, 0, ORB_R * R * 0.9).stroke({ width: Math.max(0.6, R * 0.016), color: lighten(SUCCESS, 0.35), alpha: 0.45 });
    this.hw.addChild(hoop);

    // The bands' far halves, only where the core doesn't cover them.
    this.hw.addChild(catwalkHalf(eq, R, near, false, 0.05, TITAN, hide, L), catwalkHalf(cross, R, near, false, 0.04, TITAN, hide, L));

    // One drill bore in the core: a dark mouth with the glow of what was cut.
    const bg = new Graphics();
    const a = rand() * Math.PI * 2;
    const d = CORE * R * (0.18 + 0.2 * rand());
    const [bx, by] = [Math.cos(a) * d, Math.sin(a) * d];
    const br = Math.max(0.9, R * 0.05);
    bg.ellipse(bx, by, br * 1.15, br).fill({ color: INK }).ellipse(bx, by, br * 2.2, br * 2).fill({ color: bore, alpha: 0.2 });
    bg.ellipse(bx, by + br * 0.15, br * 0.6, br * 0.5).fill({ color: lighten(bore, 0.4), alpha: 0.9 });
    this.hw.addChild(bg);

    // The near halves, the crossing band over the equator, and two girders down to the core.
    this.hw.addChild(catwalkHalf(eq, R, near, true, 0.05, TITAN, hide, L), catwalkHalf(cross, R, near, true, 0.04, TITAN, hide, L));
    const fg = new Graphics();
    for (const t of [Math.PI / 2 - 0.95, Math.PI / 2 + 0.95]) {
      const [x, y] = ringPoint(eq, t);
      girder(fg, x * R, y * R, x * 0.7 * R, y * 0.7 * R, R * 0.05, TITAN, lw * 0.85, darken(TITAN, 0.5));
    }
    this.hw.addChild(fg);

    // Gold rivets along the equator's deck, and warm lights along its walkway.
    const rg = new Graphics();
    const rr = Math.max(0.9, R * 0.028);
    for (let i = 0; i < 5; i++) {
      const [x, y] = ringPoint(eq, Math.PI * (0.15 + (0.7 * i) / 4) + rand() * 0.05);
      rg.circle(x * R, y * R, rr).fill({ color: SUCCESS }).stroke({ width: 0.5, color: darken(SUCCESS, 0.6) });
    }
    this.hw.addChild(rg);
    const pts: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      const [x, y] = ringPoint(eq, Math.PI * (0.25 + (0.5 * i) / 4), 0.05);
      pts.push([x * R, y * R]);
    }
    this.windows = new WindowLights(pts, Math.max(1.1, R * 0.045), this.seed, [SUCCESS, 0xf1b75b, lighten(SUCCESS, 0.35)], 'shimmer');
    this.hw.addChild(...this.windows.groups);

    // The harvest glint on the core's lit limb.
    const gl = new Graphics();
    const gl0 = CORE * R * 0.72;
    const len = R * 0.18;
    gl.circle(0, 0, Math.max(1, R * 0.03)).fill({ color: lighten(SUCCESS, 0.7) });
    gl.moveTo(-len, 0).lineTo(len, 0).moveTo(0, -len).lineTo(0, len).stroke({ width: Math.max(0.8, R * 0.022), color: lighten(SUCCESS, 0.45) });
    gl.position.set(L[0] * gl0 * 0.9, L[1] * gl0 * 0.9);
    gl.blendMode = 'add';
    this.glintG = gl;
    this.hw.addChild(gl);
  }

  /** A short gold glint on the platform: the maneuver code calls this when the objective closes. */
  glint(): void {
    this.flash = 1;
  }

  tick(seconds: number): void {
    this.u.uTime = seconds;
    // An eccentric tumble (2026-10-12): the surface turns about a diagonal axis, clockwise or not by
    // seed, one turn in SPIN_S; a planet turns slower still. Identity motion: none in reduced motion.
    const spin = this.spinAxis;
    (this.u.uSpin as Float32Array).set([spin[0], spin[1], spin[2], motion.reduced ? 0 : (2 * Math.PI * seconds) / SPIN_S * spin[3] + this.phase * 6.28]);
    this.u.uWeld = this.state === 'underway' && !motion.reduced ? 0.3 + 0.7 * this.activity : 0;
    if (this.contactFrom !== undefined) {
      if (this.contactFrom === null || seconds < this.contactFrom) this.contactFrom = seconds;
      const s = motion.reduced ? 2 : seconds - this.contactFrom;
      const k = Math.max(0, Math.min(1, (s - 0.8) / 0.5));
      const e = k * k * (3 - 2 * k);
      this.u.uSketch = 1 + (this.lookSketch - 1) * e;
      this.mbody.alpha = e;
      if (k >= 1) this.contactFrom = undefined;
    }
    const dt = Math.min(0.1, Math.max(0, seconds - this.lastT));
    this.lastT = seconds;
    this.flash = Math.max(0, this.flash - dt / 1.4);
    const reduced = motion.reduced;
    this.u.uPulse = reduced ? 0.5 : motion.pulseTime;
    // The aura breathes slowly and gently: one blue on every open rung, gold once done (state is in the
    // form and the rung's light). A contact's is a touch fainter, as yet unseen.
    const body = this.state !== '' && this.state !== 'ghost' && this.state !== 'unknown';
    const base = this.state === 'accomplished' ? 0.45 : this.state === 'sketch' ? 0.4 : 0.5;
    this.aura.setAlpha(body ? (reduced ? base + 0.05 : base + 0.12 * Math.sin((2 * Math.PI * seconds) / 6 + this.phase * 6.28)) : 0);
    const still = this.state === 'accomplished';
    // Identity motion: a slow rock and drift (09 §5). A ghost drifts further; a platform holds still.
    const rockA = still || reduced ? 0 : 0.05 * Math.sin((2 * Math.PI * seconds) / 40 + this.phase * 6.28);
    const drift = still || reduced ? 0 : (this.state === 'ghost' ? 0.08 : 0.025) * this.radius;
    const dx = Math.sin((2 * Math.PI * seconds) / 23 + this.phase * 9) * drift;
    const dy = Math.cos((2 * Math.PI * seconds) / 17 + this.phase * 5) * drift * 0.6;
    for (const c of [this.body, this.mbody]) {
      c.rotation = rockA;
      c.position.set(dx, dy);
    }
    // The light stays fixed in the world while the body rocks.
    const [lx, ly, lz] = this.light;
    const [c, s] = [Math.cos(-rockA), Math.sin(-rockA)];
    (this.u.uLightDir as Float32Array).set([c * lx - s * ly, s * lx + c * ly, lz]);

    // State motion: rigs work on the progress beat; the superstructure's lamps quicken and settle.
    const nearing = this.state === 'resolved' || this.state === 'accept';
    const period = nearing ? 1.6 : 2.4;
    const p = motion.pulseTime;
    if (still) {
      // Calm: the windows shimmer slowly; the glint twinkles, brightening for a moment on `glint()`.
      if (this.windows) { if (reduced) for (const g of this.windows.groups) g.alpha = 0.9; else this.windows.tick(seconds); }
      if (this.glintG) {
        const tw = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / 7 + this.phase * 6.28);
        this.glintG.alpha = Math.min(1, 0.22 + 0.3 * tw * tw + this.flash * 0.9);
        this.glintG.scale.set(0.8 + 0.3 * tw + this.flash * 0.9);
        this.glintG.rotation = this.flash * 0.6;
      }
    }
    for (const l of this.lamps) {
      if (reduced) { l.g.alpha = 0.85; continue; }
      if (still) { l.g.alpha = 0.7 + 0.3 * Math.sin((2 * Math.PI * seconds) / 6 + l.lag * 6); continue; }
      const k = progressPulse(p, l.lag, period);
      l.g.alpha = nearing ? 0.5 + 0.5 * k : l.kind === 'blink' ? 0.25 + 0.75 * k : 0.45 + 0.55 * k;
    }
  }

  destroy(): void {
    const shader = this.mesh.shader;
    this.clearHardware();
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
    this.aura.destroy();
    shader?.destroy();
    this.geometry.destroy();
  }
}

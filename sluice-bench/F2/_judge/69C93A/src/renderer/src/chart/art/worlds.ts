// v1 seat planets (13-game-design.md §4.1): a person's world. Its world line comes from their seed
// (Terran, Glacial or Volcanic) and its surface transforms with their own share: the fraction of their
// own objectives and threats in the round that are Accomplished. The rung rides on the rim light and
// halo (09 §4): share 0 Ready grey; under ¾ Underway blue on the 2.4 s beat; from ¾ Nearing violet
// with gold creeping in; 1 Accomplished, a soft gold halo, still except the glimmering settlements.
// The body is painted (layer 'celestial'). The art takes outcomes on the surface (megastructures and
// research facilities) as options, the stage's `.m<n>r<n>`, drawn crisp in `marks` by a second quad with
// the same sphere math so they turn with the world. Only the gallery sets them (`gallery/v1/worlds.ts`);
// the shared contract carries none (03, 05 §8 G-14): finished pieces are platforms in orbit (13 §3).
import { Container, Mesh, type Geometry, type Shader } from 'pixi.js';
import { NOISE } from './glsl';
import { motion } from './motion';
import { ACTIVITY, beatOf, PROGRESS_GLSL, RUNG_COLOR, rgb, type Rung } from './progress';
import { makeShader, quadGeometry } from './quad';

const UV_HALF = 1.3;

export type WorldLine = 'terran' | 'glacial' | 'volcanic';
export const WORLD_LINES: readonly WorldLine[] = ['terran', 'glacial', 'volcanic'];
/** Up to this many of each outcome show on one world (more still count; the surface is full). */
export const MAX_OUTCOMES = 4;

/** First light (v1.4 B4): the front's `front` (0..1) and the share of its lights still showing (1 across, then falling to the world's own). */
export interface FirstLight { front: number; lights: number }
/** The front runs from the terminator (n·L 0.3) past the far limb (n·L −1.15). */
const FIRST_FRONT_FROM = 0.3;
const FIRST_FRONT_TO = -1.15;

/** A vacated world's surface at power 0 (23 C3): this share of its light. Its settlement lights go to none. */
export const VACANT_SURFACE = 0.55;

/**
 * The shares a world draws at `power` (1 holding work, 0 vacated; 23 C3): its surface's light and its
 * settlement lights' share, on one smoothstep of the level. Pure.
 */
export function vacancyShares(power: number): { surface: number; lights: number } {
  const u = 1 - Math.max(0, Math.min(1, power));
  const e = u * u * (3 - 2 * u);
  return { surface: 1 - (1 - VACANT_SURFACE) * e, lights: 1 - e };
}

/** The world line a person's seed picks. Mixed first, so it doesn't track the palette's seed bits. */
export function worldLineOf(seed: number): WorldLine {
  let h = (seed ^ (seed >>> 16)) >>> 0;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return WORLD_LINES[h % 3]!;
}

/** Own share → rung (13 §4.1): 0 Ready; under ¾ Underway; ¾ to just under 1 Nearing; 1 Accomplished. */
export function worldRung(share: number): Rung {
  if (share <= 0) return 'ready';
  if (share >= 1) return 'accomplished';
  return share >= 0.75 ? 'nearing' : 'underway';
}

export interface WorldStage { line?: WorldLine; share: number; megastructures?: number; research?: number }

/**
 * Stage strings: `world.<line>.<percent>`, or `world.<percent>` for the seed's own line, with an
 * optional outcome suffix `.m<n>r<n>`. For example `world.glacial.75.m2r1`. Unparseable → share 0.
 */
export function parseWorldStage(stage: string): WorldStage {
  const m = /^world(?:\.(terran|glacial|volcanic))?\.(\d{1,3})(?:\.m(\d+)r(\d+))?$/.exec(stage);
  if (!m) return { share: 0 };
  const out: WorldStage = { share: Math.min(1, Math.max(0, Number(m[2]) / 100)) };
  if (m[1]) out.line = m[1] as WorldLine;
  if (m[3] !== undefined) { out.megastructures = Number(m[3]); out.research = Number(m[4]); }
  return out;
}

/** Weather and lights per line, at shares 0, ¼, ½, ¾, 1 (interpolated between). */
interface LineWeather { clouds: number[]; band: number[]; grey: number[]; lights: number[] }
const WEATHER: Record<WorldLine, LineWeather> = {
  // Clouds form at the terraforming front and settle into fair-weather cover.
  terran: { clouds: [0, 0.06, 0.3, 0.42, 0.4], band: [0, 0, 0.1, 0.1, 0.1], grey: [0, 0, 0.1, 0, 0], lights: [0, 0, 0, 0.45, 1] },
  // Storm streaks scour the ice; the thaw brings heavy grey rain bands; the ocean world clears.
  glacial: { clouds: [0.45, 0.4, 0.82, 0.5, 0.34], band: [0.9, 0.8, 1, 0.5, 0.2], grey: [0.1, 0.2, 0.55, 0.25, 0], lights: [0, 0, 0, 0.45, 1] },
  // Ash plumes over the molten world thin to a dry haze.
  volcanic: { clouds: [0.36, 0.22, 0.12, 0.08, 0.12], band: [0.35, 0.3, 0.2, 0.2, 0.2], grey: [0.8, 0.7, 0.3, 0.1, 0], lights: [0, 0, 0, 0.5, 1] },
};
const knot = (v: number[], s: number) => {
  const x = Math.min(0.9999, Math.max(0, s)) * 4;
  const i = Math.floor(x);
  return v[i]! + (v[i + 1]! - v[i]!) * (x - i);
};
const LINE_INDEX: Record<WorldLine, number> = { terran: 0, glacial: 1, volcanic: 2 };

const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uPx;
uniform float uPass; // 0: the painted body and halo; 1: the crisp structures (marks)
uniform float uTime;
uniform float uPulse;
uniform float uSeed;
uniform float uLine;
uniform float uShare;
uniform float uMega;
uniform float uResearch;
uniform float uCloudAmt;
uniform float uCloudBand;
uniform float uCloudGrey;
uniform float uLights;
uniform float uDim;
uniform float uFirstFront;
uniform float uFirstLights;
uniform float uGlimmer;
uniform float uRecede;
uniform float uBands;
uniform vec3 uLightDir;
uniform vec3 uSignal;
uniform float uSignalAmt;
uniform float uFringe;
uniform float uActivity;
uniform float uBeat;
${NOISE}
${PROGRESS_GLSL}
const float SPIN = 6.2831853 / 96.0; // one turn every 96 s (06 §7 had 48 s; slowed 2026-10-12: the biggest things move slowest)
const vec3 LIGHTS = vec3(1.0, 0.78, 0.42);
const vec3 MINT = vec3(0.42, 0.95, 0.78);

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
float norm01(float x, float lo, float hi) { return clamp((x - lo) / (hi - lo), 0.0, 1.0); }

// 3D cell noise: x = distance to the nearest site, y = to the second, z = the nearest cell's id.
vec3 cells(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = vec3(float(x), float(y), float(z));
    vec3 o = vec3(hash31(i + c), hash31(i + c + 7.1), hash31(i + c + 3.3));
    float d = length(c + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = hash31(i + c + 5.9); }
    else if (d < d2) d2 = d;
  }
  return vec3(d1, d2, id);
}
float craterField(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float best = 1.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = vec3(float(x), float(y), float(z));
    float h = hash31(i + c);
    if (h < 0.55) continue;
    vec3 o = vec3(hash31(i + c + 7.1), hash31(i + c + 3.3), hash31(i + c + 5.9));
    best = min(best, length(c + o - f) / (0.22 + 0.2 * fract(h * 13.0)));
  }
  return best;
}

// Outcome sites: the first landings cluster on the face the world shows at t = 0, then fill in
// around it, so a world with a few outcomes reads as one settled region. Seed jitters them a little.
// (Written for GLSL ES 1.00 too: no array constructors or integer modulus.)
vec2 site(float k) {
  if (k < 0.5) return vec2(-0.40, -0.10);
  if (k < 1.5) return vec2(0.20, 0.32);
  if (k < 2.5) return vec2(0.42, -0.38);
  if (k < 3.5) return vec2(-0.50, 0.44);
  if (k < 4.5) return vec2(0.82, 0.10);
  if (k < 5.5) return vec2(-0.10, -0.58);
  if (k < 6.5) return vec2(0.12, 0.66);
  return vec2(-0.95, -0.30);
}
vec3 siteDir(float k) {
  vec2 s = site(k);
  float j1 = hash31(vec3(uSeed * 91.0, k, 3.0));
  float j2 = hash31(vec3(k, uSeed * 57.0, 1.0));
  float lon = uSeed * 6.2831853 + s.x + (j1 - 0.5) * 0.16;
  float y = clamp(s.y + (j2 - 0.5) * 0.12, -0.8, 0.8);
  float cl = sqrt(1.0 - y * y);
  return vec3(sin(lon) * cl, y, cos(lon) * cl);
}
// Even sites hold megastructures, odd ones research facilities.
bool isMega(float k) { return mod(k, 2.0) < 0.5; }
bool siteOn(float k) { return isMega(k) ? floor(k * 0.5) < uMega : floor(k * 0.5) < uResearch; }
const float MEGA_S = 0.15;
const float LAB_S = 0.14;
// Tangent-plane coordinates around a site (x east, y down at the front), in units of the radius.
vec2 siteLocal(vec3 pn, vec3 d, out vec3 e1, out vec3 e2) {
  e1 = normalize(vec3(d.z, 0.0, -d.x));
  e2 = cross(d, e1);
  vec3 q = pn - d;
  return vec2(dot(q, e1), dot(q, e2));
}

float cloudCover(vec3 n, float ang) {
  vec3 cp = rotY(n, ang * 1.35 + uSeed * 3.0);
  // band stretches the noise across the latitudes: storm streaks and rain bands
  vec3 q = cp * vec3(2.3, 2.3 * (1.0 + 3.0 * uCloudBand), 2.3) + uSeed * 9.0;
  q.x += 0.35 * uCloudBand * sin(cp.y * 9.0 + uSeed * 20.0);
  float b = fbm(q);
  b = mix(b, 0.5 + 0.34 * sin(cp.y * 13.0 + b * 5.0), 0.6 * uCloudBand); // zonal belts
  return smoothstep(0.66 - 0.24 * uCloudAmt, 0.80 - 0.14 * uCloudAmt, b) * min(1.0, uCloudAmt * 2.5);
}

// The surface of each line at the current share: its color, plus what the lighting needs.
//   glow     emissive (lava), unaffected by the sun     wet      open water, for the sun's glint
//   settled  where settlements may light                front    the line of change (the pulse runs it)
//   shelter  canyon depths: settlements show by day     density  how thickly settlements crowd
vec3 terrain(vec3 pn, vec3 sp, float h, float h2, out vec3 glow, out float wet, out float settled,
             out float front, out float shelter, out float density) {
  float s = uShare;
  float pal = fract(uSeed * 4.0);
  float started = step(0.001, s);
  float midway = started * (1.0 - step(0.999, s));
  vec3 col;
  glow = vec3(0.0);
  wet = 0.0;
  settled = 0.0;
  front = 0.0;
  shelter = 0.0;
  density = 0.0;
  if (uLine < 0.5) {
    // ---- Terran: barren grey rock → first green in the lowlands → terraforming front → lush.
    vec3 dust = mix(vec3(0.42, 0.40, 0.38), vec3(0.38, 0.39, 0.42), pal);
    vec3 rock = mix(vec3(0.22, 0.21, 0.23), vec3(0.27, 0.25, 0.23), pal);
    vec3 barren = mix(dust, rock, smoothstep(0.35, 0.65, h2)) * (0.7 + 0.6 * h);
    float cr = craterField(sp * 2.6 + 2.0);
    barren *= 1.0 - 0.42 * smoothstep(0.95, 0.6, cr);
    barren += vec3(0.11, 0.10, 0.09) * smoothstep(0.85, 1.0, cr) * smoothstep(1.2, 1.0, cr);
    // Seas fill the basins as the share grows; the green spreads from the lowlands up.
    float sea = mix(0.30, 0.50, smoothstep(0.08, 0.8, s)) + 0.025 * pal;
    float field = norm01(mix(fbm3(sp * 0.75 + 11.0), h, 0.6), 0.36, 0.58);
    float grow = s * 1.12 - 0.04;
    float veg = smoothstep(-0.03, 0.03, grow - field) * started;
    veg = max(veg, smoothstep(sea + 0.11, sea + 0.04, h) * started); // moss rings the first lakes
    front = (1.0 - smoothstep(0.0, 0.035, abs(grow - field))) * midway;
    vec3 deep = vec3(0.04, 0.12, 0.28);
    vec3 shallow = vec3(0.10, 0.34, 0.48);
    vec3 green = mix(vec3(0.20, 0.42, 0.20), vec3(0.32, 0.46, 0.18), pal);
    vec3 dry = vec3(0.50, 0.44, 0.30);
    float water = smoothstep(sea + 0.008, sea - 0.008, h) * started;
    vec3 sheet = mix(deep, shallow, smoothstep(sea - 0.14, sea, h));
    // a finished world greens its highlands too; first growth is a dark moss
    vec3 land = mix(green, dry, smoothstep(sea + 0.05, sea + 0.25, h) * mix(1.0, 0.45, smoothstep(0.75, 1.0, s)));
    land = mix(vec3(0.17, 0.25, 0.15), land, smoothstep(0.15, 0.5, s));
    land = mix(land, vec3(0.92, 0.95, 1.0), smoothstep(0.8, 0.9, abs(pn.y) + h2 * 0.12) * smoothstep(0.5, 0.9, s));
    col = mix(barren, land, veg * (1.0 - water));
    // young seas are grey-green and shallow; they deepen as the world comes alive
    col = mix(col, mix(vec3(0.16, 0.22, 0.24), sheet, smoothstep(0.1, 0.6, s)), water);
    wet = water;
    settled = veg * (1.0 - water) * smoothstep(sea + 0.2, sea + 0.02, h);
  } else if (uLine < 1.5) {
    // ---- Glacial: storm-scoured ice → ice breaking over dark seas → thaw → rain world → ocean world.
    // Wind scours the ice into streaks along the latitudes.
    float streak = fbm(vec3(pn.x * 1.2, pn.y * 7.0 + h * 2.5, pn.z * 1.2) + uSeed * 17.0);
    float ridge = 1.0 - abs(fbm3(sp * 2.4 + 3.0) * 2.0 - 0.88);
    vec3 ice = mix(vec3(0.42, 0.54, 0.72), vec3(0.88, 0.93, 0.98), smoothstep(0.4, 0.56, streak));
    ice = mix(ice, vec3(0.97, 0.98, 1.0), smoothstep(0.62, 0.7, streak) * 0.7); // fresh drift on the scour lines
    ice *= 1.0 - 0.38 * smoothstep(0.86, 0.97, ridge); // pressure ridges and crevasses
    // melt order: equator and lowlands first, the poles last
    float mf = clamp(0.5 * abs(pn.y) + 0.5 * norm01(fbm3(sp * 0.8 + 21.0), 0.25, 0.62) + 0.7 * (h - 0.48), 0.0, 1.0);
    float th = s * 1.12 - 0.05;
    float margin = clamp((mf - th) / 0.16, 0.0, 1.0); // 0 at the ice edge, 1 deep in the sheet
    vec3 v = cells(sp * 2.6 + 9.0);
    float edge = v.y - v.x;
    // Leads split the whole sheet once the thaw starts; near the edge the floes drift apart.
    float lead = 0.065 * smoothstep(0.0, 0.2, s) * (1.0 - smoothstep(0.55, 0.85, s)) + 0.16 * (1.0 - margin) * started;
    float floe = smoothstep(lead, lead + 0.03, edge) * step(v.z * 0.9, margin + 0.1);
    float iceOn = smoothstep(-0.015, 0.015, mf - th) * floe;
    iceOn = max(iceOn, smoothstep(0.88, 0.92, abs(pn.y) + 0.06 * h2)); // caps stay
    if (s <= 0.0) iceOn = 1.0;
    front = (1.0 - smoothstep(0.0, 0.03, abs(mf - th))) * midway;
    // An ocean world: only the highest ground stands clear, as island chains.
    float sea = 0.635 + 0.015 * pal;
    float coast = smoothstep(sea + 0.04, sea, h);
    float water = smoothstep(sea + 0.006, sea - 0.006, h);
    vec3 ocean = mix(vec3(0.02, 0.08, 0.18), vec3(0.06, 0.40, 0.46), smoothstep(sea - 0.07, sea, h));
    ocean = mix(vec3(0.015, 0.035, 0.07), ocean, smoothstep(0.15, 0.6, s)); // the first seas are black
    float greenAmt = smoothstep(0.55, 0.95, s);
    vec3 tundra = mix(vec3(0.36, 0.34, 0.30), vec3(0.44, 0.41, 0.35), h2);
    vec3 land = mix(tundra, mix(vec3(0.18, 0.44, 0.22), vec3(0.26, 0.48, 0.20), pal), greenAmt * (0.4 + 0.6 * coast));
    vec3 open = mix(land, ocean, water);
    col = mix(open, ice, iceOn);
    wet = water * (1.0 - iceOn);
    settled = (1.0 - iceOn) * smoothstep(sea + 0.05, sea + 0.01, h) * smoothstep(sea - 0.02, sea, h); // coastal strips
    density = 0.04;
  } else {
    // ---- Volcanic: molten, fire-cracked → black plates → canyons and steam → riven, cliff cities.
    vec3 v = cells(sp * 1.4 + 4.0);
    float edge = v.y - v.x; // 0 on a plate boundary
    float id = v.z;
    // Which way the ground falls toward the sun: the same field sampled a step sunward, so the far
    // wall of each canyon takes the light and the near wall falls into shadow.
    float sunward = 0.0;
    if (s >= 0.25) {
      vec3 Lsf = rotY(normalize(uLightDir), uTime * SPIN + uSeed * 6.2831853);
      vec3 v2 = cells(sp * 1.4 + 4.0 + (Lsf - pn * dot(Lsf, pn)) * 0.09);
      sunward = (v2.y - v2.x) - edge;
    }
    float rid = abs(fbm3(sp * 4.0 + 17.0) - 0.44); // a finer fissure network
    float field = norm01(fbm3(sp * 0.9 + 31.0), 0.25, 0.62);
    float molten = s <= 0.0 ? 1.0 : smoothstep(-0.04, 0.04, field - s * 2.4);
    front = (1.0 - smoothstep(0.0, 0.04, abs(field - s * 2.4))) * midway * (1.0 - step(0.42, s));
    // fire cracks: wide in the melt, thin seams once cooled
    float cw = mix(0.035, 0.12, molten);
    float crack = 1.0 - smoothstep(cw * 0.35, cw, edge);
    float core = 1.0 - smoothstep(0.0, cw * 0.4, edge);
    float heat = max(molten, 0.75 * (1.0 - smoothstep(0.15, 0.5, s)));
    float fissure = (1.0 - smoothstep(0.0, mix(0.008, 0.022, molten), rid)) * (1.0 - smoothstep(0.1, 0.4, s));
    float lake = smoothstep(0.45, 0.4, h) * molten;
    // Canyons open along the old cracks and a finer rift network; their width wanders.
    float open = smoothstep(0.25, 0.8, s);
    float cyw = 0.2 * open * (0.6 + 0.8 * norm01(h2, 0.35, 0.6));
    float canyon = 1.0 - smoothstep(cyw * 0.6, cyw + 0.004, edge);
    float rift = (1.0 - smoothstep(0.012, 0.012 + 0.05 * open, rid)) * smoothstep(0.4, 0.6, s);
    canyon = max(canyon, rift);
    float floorM = max(1.0 - smoothstep(0.0, cyw * 0.4, edge), (1.0 - smoothstep(0.0, 0.025 * open, rid)) * smoothstep(0.4, 0.6, s));
    float rim = smoothstep(cyw * 0.8, cyw, edge) * (1.0 - smoothstep(cyw, cyw * 1.3 + 0.012, edge)) * open;
    if (s >= 0.42) front = rim * midway;
    vec3 crustHot = vec3(0.22, 0.08, 0.05) * (0.7 + 0.6 * h2);
    vec3 basalt = vec3(0.13, 0.125, 0.135) * (0.75 + 0.8 * h2) + 0.035 * sin(h2 * 70.0 + h * 30.0);
    vec3 rust = mix(mix(vec3(0.52, 0.26, 0.13), vec3(0.62, 0.45, 0.27), id), vec3(0.55, 0.33, 0.24), pal * 0.5);
    rust *= 0.75 + 0.5 * h2;
    float weather = smoothstep(0.4, 0.9, s);
    vec3 plate = mix(mix(basalt, crustHot, molten), rust, weather);
    // canyon walls in strata, deep floors that green at the end
    float strata = 0.5 + 0.5 * sin(edge * 120.0 + h2 * 8.0);
    float litWall = smoothstep(-0.004, 0.014, -sunward);
    vec3 wallCol = mix(vec3(0.05, 0.035, 0.04), mix(vec3(0.40, 0.25, 0.15), vec3(0.62, 0.44, 0.27), strata), litWall * mix(0.45, 1.0, weather));
    vec3 floorCol = mix(vec3(0.02, 0.018, 0.02), vec3(0.10, 0.24, 0.10), smoothstep(0.8, 1.0, s));
    col = plate + mix(vec3(0.12, 0.12, 0.13), vec3(0.42, 0.32, 0.18), weather) * rim; // lit canyon lips
    col = mix(col, wallCol, canyon);
    col = mix(col, floorCol, floorM * open);
    shelter = canyon * open * (1.0 - 0.6 * litWall);
    // Steam rises from vents along the opening canyons, most at the halfway point.
    float vent = step(0.4, id) * (1.0 - smoothstep(0.1, 0.34, edge));
    float steamAmt = 1.0 - smoothstep(0.0, 0.32, abs(s - 0.5));
    float plume = smoothstep(0.4, 0.6, fbm3(pn * 5.0 + vec3(0.0, -uTime * 0.06, uSeed * 7.0)));
    col = mix(col, vec3(0.88, 0.87, 0.86), plume * vent * steamAmt * 0.9);
    // Lava light: deep red at the edge of a crack, orange at its core. Ready work recedes, so dimmer.
    vec3 lava = mix(vec3(0.62, 0.10, 0.03), vec3(1.0, 0.46, 0.12), core * heat);
    glow = lava * (crack * heat + fissure * 0.6 + lake * 0.9) * mix(1.0, 0.72, uRecede);
    glow += vec3(0.85, 0.18, 0.04) * max(floorM, canyon * 0.35) * smoothstep(0.3, 0.45, s) * (1.0 - smoothstep(0.55, 0.8, s)) * 1.1; // embers below
    settled = max(canyon * (1.0 - floorM), rim) * open;
    density = 0.07;
  }

  return col;
}

// Crisp structures pass: draws only the outcomes, lit as the body is lit.
vec4 structures(vec3 n, vec3 pn, vec3 Ls, float ndl, float aa, float cl) {
  vec4 acc = vec4(0.0);
  float day = smoothstep(-0.15, 0.5, ndl);
  float night = 1.0 - smoothstep(-0.1, 0.2, ndl);
  for (int ki = 0; ki < 8; ki++) {
    float k = float(ki);
    if (!siteOn(k)) continue;
    vec3 d = siteDir(k);
    if (dot(pn, d) < 0.95) continue;
    vec3 e1, e2;
    vec2 l = siteLocal(pn, d, e1, e2);
    vec2 Lt = vec2(dot(Ls, e1), dot(Ls, e2));
    float Lz = dot(Ls, d);
    vec2 sd = -normalize(Lt + vec2(1e-4)); // shadows fall away from the sun
    float shLen = clamp(0.35 / (max(Lz, 0.0) + 0.25), 0.4, 1.3);
    vec4 c = vec4(0.0);
    if (isMega(k)) {
      // Megastructure: an arcology wheel (ring, spokes, central spire) on a dark foundation.
      vec2 u = l / MEGA_S;
      float px = aa / MEGA_S;
      float rho = length(u);
      float a = hash31(vec3(k, uSeed * 13.0, 9.0)) * 1.57;
      vec2 ur = mat2(cos(a), -sin(a), sin(a), cos(a)) * u;
      float ring = 1.0 - smoothstep(0.15 - px, 0.15 + px, abs(rho - 0.62));
      float spoke = (1.0 - smoothstep(0.07 - px, 0.07 + px, min(abs(ur.x), abs(ur.y)))) * step(rho, 0.62);
      float spire = 1.0 - smoothstep(0.24 - px, 0.24 + px, rho);
      float along = dot(u, sd);
      float across = length(u - sd * clamp(along, 0.0, shLen));
      float shadow = (1.0 - smoothstep(0.1, 0.18, across)) * step(0.0, along) * (1.0 - spire);
      float base = 1.0 - smoothstep(0.92 - px, 0.92 + px, rho);
      float face = 0.7 + 0.45 * dot(normalize(u + vec2(1e-4)), -sd); // the sunward side of the ring catches light
      vec3 metal = vec3(0.95, 0.86, 0.66) * (0.28 + 0.9 * day * face);
      vec3 ringCol = metal + LIGHTS * night * 0.95;
      vec3 spireCol = vec3(1.0, 0.95, 0.82) * (0.35 + 0.9 * day) + LIGHTS * night * 1.2;
      float body = max(ring, spire);
      c.a = max(max(body, spoke * 0.85), base * 0.55);
      vec3 col = vec3(0.07, 0.07, 0.09) * (1.0 - 0.5 * shadow);
      col = mix(col, metal * 0.75 + LIGHTS * night * 0.5, spoke * 0.85);
      col = mix(col, mix(ringCol, spireCol, spire), body);
      c.rgb = col * c.a;
    } else {
      // Research facility: a white dome ringed by three small domes, mint windows at night.
      vec2 u = l / LAB_S;
      float px = aa / LAB_S;
      float rho = length(u);
      float a = hash31(vec3(k, uSeed * 17.0, 4.0)) * 6.2831853;
      float dome = 1.0 - smoothstep(0.52 - px, 0.52 + px, rho);
      vec3 dn = vec3(u / 0.52, sqrt(max(0.0, 1.0 - rho * rho / 0.2704)));
      float shade = clamp(dot(normalize(dn), normalize(vec3(Lt, max(Lz, 0.05)))), 0.0, 1.0);
      float pods = 0.0;
      float podShade = 0.0;
      for (int j = 0; j < 3; j++) {
        float b = a + float(j) * 2.0943951;
        vec2 o = u - 0.86 * vec2(cos(b), sin(b));
        float pr = length(o);
        float pod = 1.0 - smoothstep(0.22 - px, 0.22 + px, pr);
        if (pod > pods) { pods = pod; podShade = clamp(0.6 + 0.6 * dot(o / 0.22, -sd), 0.0, 1.0); }
      }
      float base = 1.0 - smoothstep(1.08 - px, 1.08 + px, rho);
      float windows = (1.0 - smoothstep(0.06, 0.1, abs(rho - 0.45))) * dome;
      vec3 white = vec3(0.93, 0.95, 0.94) * (0.25 + 0.95 * day * (0.35 + 0.65 * shade));
      vec3 podCol = vec3(0.70, 0.80, 0.80) * (0.25 + 0.85 * day * podShade) + MINT * night * 0.9;
      c.a = max(max(dome, pods), base * 0.5);
      vec3 col = vec3(0.07, 0.08, 0.09);
      col = mix(col, podCol, pods);
      col = mix(col, white, dome);
      col += MINT * windows * (0.25 + 0.9 * night);
      c.rgb = col * c.a;
    }
    acc = c + acc * (1.0 - c.a);
  }
  // Clouds pass over the structures, and the air thickens toward the limb.
  float fade = (1.0 - 0.75 * cl) * smoothstep(0.05, 0.35, n.z);
  return acc * fade;
}

// Settlement lights, crisp pinpoints (marks pass): each a small seeded cell of the surface, kept where
// the ground is settled and the light can be seen. Only a finished world's lights glimmer, each on its
// own 2–10 s phase (06 §7; 09 §1, the one exception to stillness).
vec4 settlementLights(vec3 n, vec3 pn, vec3 sp, float h, float h2, float dusk, float cl) {
  if (uLights <= 0.0) return vec4(0.0);
  if (dusk < 0.02 && uLine < 1.5) return vec4(0.0); // only canyon towns show in daylight
  vec3 glow;
  float wet, settled, front, shelter, density;
  terrain(pn, sp, h, h2, glow, wet, settled, front, shelter, density);
  float vis = max(dusk, 0.6 * shelter) * settled;
  if (vis < 0.01) return vec4(0.0);
  vec3 c = cells(sp * 7.0 + 40.0);
  // Towns cluster; a nearly finished world shows its first few, a finished one is crowded with them.
  float town = smoothstep(0.34, 0.46, fbm3(sp * 2.2 + 61.0));
  float keep = step(c.z, (0.06 + 0.6 * uLights * uLights + 2.0 * density) * town);
  float px = uPx * 7.0 * 1.7;
  float pt = 1.0 - smoothstep(0.22 - px * 0.5, 0.22 + px * 0.5, c.x);
  float period = 2.0 + 8.0 * fract(c.z * 7.31);
  float glim = mix(1.0, 0.5 + 0.5 * sin(uTime * 6.2831853 / period + c.z * 40.0), uGlimmer);
  float a = pt * keep * min(1.0, vis * 1.6) * min(1.0, uLights * 1.6) * glim * (1.0 - 0.75 * cl) * smoothstep(0.05, 0.3, n.z);
  return vec4(mix(LIGHTS, vec3(1.0, 0.95, 0.8), 0.35) * a, a);
}

// First light (v1.4 B4), marks pass: seeded pinpoints come on over the night side behind a front that runs from the
// terminator to the far limb. No settled mask: a share-0 world has no city, so this is a transient, not a rung.
vec4 firstLights(vec3 n, vec3 sp, float ndl, float dusk, float cl) {
  if (uFirstLights <= 0.0 || dusk < 0.02) return vec4(0.0);
  vec3 c = cells(sp * 7.0 + 40.0);
  float town = smoothstep(0.34, 0.46, fbm3(sp * 2.2 + 61.0));
  float keep = step(c.z, 0.5 * town);
  float px = uPx * 7.0 * 1.7;
  float pt = 1.0 - smoothstep(0.22 - px * 0.5, 0.22 + px * 0.5, c.x);
  float on = smoothstep(uFirstFront - 0.12, uFirstFront + 0.12, ndl);
  float a = pt * keep * dusk * on * uFirstLights * (1.0 - 0.75 * cl) * smoothstep(0.05, 0.3, n.z);
  return vec4(mix(LIGHTS, vec3(1.0, 0.95, 0.8), 0.35) * a, a);
}

void main() {
  float r = length(vUV);
  vec3 L = normalize(uLightDir);
  float beat = progressPulse(uPulse, 0.0, uBeat) * uActivity;
  float aa = uPx; // about one screen pixel, in units of the radius (no derivatives in GLSL ES 1.00)
  float s = uShare;

  if (r > 1.0) {
    if (uPass > 0.5) { finalColor = vec4(0.0); return; }
    // The rung's light: an atmospheric halo, brighter on the sunward limb; gold creeps out from it.
    float g = smoothstep(1.22, 1.0, r);
    float lit = clamp(dot(normalize(vec3(vUV, 0.0)), L) * 0.7 + 0.45, 0.0, 1.0);
    float a = g * g * lit * (0.2 + 0.75 * uSignalAmt) * (0.9 + 0.25 * beat);
    vec3 halo = mix(uSignal, LADDER_GOLD, uFringe * smoothstep(1.02, 1.2, r));
    finalColor = vec4(halo * a, a) * uColor.a;
    return;
  }

  vec3 n = vec3(vUV, sqrt(max(0.0, 1.0 - r * r)));
  float ang = uTime * SPIN + uSeed * 6.2831853;
  vec3 pn = rotY(n, ang);
  vec3 Ls = rotY(L, ang);
  float ndl = dot(n, L);

  // Each line gets its own geography, so one seed never reads as the same map in two lines.
  vec3 sp = pn * 1.7 + vec3(uSeed * 13.0 + uLine * 37.0, uSeed * 7.0 + uLine * 11.0, uSeed * 3.0 - uLine * 23.0);
  float h = fbm(sp);
  float h2 = fbm(sp * 3.1 + 5.0);
  float cl = cloudCover(n, ang);
  float dusk = 1.0 - smoothstep(-0.2, 0.3, ndl); // settlement lights come on along the terminator

  if (uPass > 0.5) {
    // Machines are crisp: the outcomes, over pinpoint settlement lights.
    vec4 st = structures(n, pn, Ls, ndl, aa, cl);
    vec4 pts = settlementLights(n, pn, sp, h, h2, dusk, cl);
    vec4 fl = firstLights(n, sp, ndl, dusk, cl);
    pts = fl + pts * (1.0 - fl.a);
    finalColor = (st + pts * (1.0 - st.a)) * smoothstep(1.0, 0.985, r) * uColor.a;
    return;
  }

  vec3 glow, col;
  float wet, settled, front, shelter, density;
  col = terrain(pn, sp, h, h2, glow, wet, settled, front, shelter, density);

  // Outcome foundations, painted into the ground, with a soft bloom of their lights at night.
  float night = 1.0 - smoothstep(-0.1, 0.2, ndl);
  for (int ki = 0; ki < 8; ki++) {
    float k = float(ki);
    if (!siteOn(k)) continue;
    vec3 d = siteDir(k);
    if (dot(pn, d) < 0.9) continue;
    vec3 e1, e2;
    float rho = length(siteLocal(pn, d, e1, e2)) / (isMega(k) ? MEGA_S : LAB_S);
    col = mix(col, vec3(0.16, 0.15, 0.15), 0.55 * smoothstep(1.25, 0.95, rho));
    glow += (isMega(k) ? LIGHTS : MINT) * 0.35 * night * smoothstep(2.2, 0.8, rho);
    wet *= smoothstep(0.9, 1.3, rho);
    settled = max(settled, 0.6 * smoothstep(2.4, 1.4, rho) * step(1.2, rho));
  }

  // clouds, with their shadows a little sunward on the ground
  float cs = cloudCover(n + uLightDir * 0.04, ang);
  col *= 1.0 - 0.3 * cs * (1.0 - cl);
  vec3 cloudCol = mix(vec3(0.96, 0.97, 1.0), vec3(0.42, 0.42, 0.45), uCloudGrey);
  col = mix(col, cloudCol, cl * 0.85);

  // lighting with a soft painterly terminator
  float wrap = smoothstep(-0.08, 0.5, ndl);
  wrap = mix(wrap, floor(wrap * 5.0 + 0.5) / 5.0, 0.25);
  vec3 lit = col * (0.07 + 1.05 * wrap);
  vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
  lit += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, hv), 0.0), 60.0) * wet * (1.0 - cl) * 0.45;
  // Lava and embers glow, but the shadow side stays a dark region: they show strongly only where the star lights the ground.
  lit += glow * (0.14 + 0.86 * wrap) * (1.0 - 0.6 * cl);

  // Settled ground glows warm on the night side (and in canyon shade by day): the painted bloom
  // under the crisp pinpoint lights of the marks pass.
  float city = smoothstep(0.5 - density, 0.62 - density, fbm3(sp * 3.0 + 40.0)) * settled;
  lit += LIGHTS * city * max(dusk, 0.6 * shelter) * uLights * 0.8 * (1.0 - 0.7 * cl);

  // First light (v1.4 B4): a warm bloom over the night side, behind the front, with a bright crest riding it.
  if (uFirstLights > 0.0) {
    float town = smoothstep(0.34, 0.46, fbm3(sp * 2.2 + 61.0));
    float on = smoothstep(uFirstFront - 0.12, uFirstFront + 0.12, ndl);
    float cd = (ndl - uFirstFront) / 0.08;
    float crest = exp(-cd * cd);
    lit += LIGHTS * town * dusk * (on + 0.6 * crest) * uFirstLights * 0.5 * (1.0 - 0.7 * cl);
  }

  // rim light in the rung's color
  float fres = pow(1.0 - n.z, 2.4);
  lit += mix(uSignal, LADDER_GOLD, uFringe * 0.6) * fres * (0.25 + 0.6 * wrap) * (0.25 + 0.95 * uSignalAmt) * (0.9 + 0.3 * beat);
  // Underway: the shared pulse runs along the line of change, west to east.
  lit += uSignal * 0.7 * front * uBands * (0.3 + 0.7 * progressPulse(uPulse, (pn.x + 1.0) * 0.45, uBeat));

  // brush texture
  lit *= 0.94 + 0.12 * vnoise(vec3(vUV.x * 18.0 + vUV.y * 6.0, vUV.y * 34.0, uSeed * 5.0));
  // Ready recedes: lower contrast, a little desaturated (09 §1).
  float lum = dot(lit, vec3(0.3, 0.59, 0.11));
  lit = mix(lit, mix(vec3(lum), lit, 0.85) * 0.88, uRecede);

  lit *= uDim; // a vacated world dims its surface (23 C3)
  float alpha = smoothstep(1.0, 0.985, r);
  finalColor = vec4(lit * alpha, alpha) * uColor.a;
}
`;

const CRESCENT = Math.PI / 6;

/**
 * A seat's world. Stage strings come from parseWorldStage; the constructor's line wins over the
 * seed's, and a stage's line wins over both. Outcome counts can come from the stage or setOutcomes.
 */
export class WorldView {
  readonly root = new Container();
  /** The crisp structures (megastructures, research facilities): the scene places this over the body. */
  readonly marks = new Container();
  readonly layer = 'celestial' as const;
  private readonly body: Mesh<Geometry, Shader>;
  private readonly sites: Mesh<Geometry, Shader>;
  private readonly geometry: Geometry;
  private readonly siteGeometry: Geometry;
  private readonly us: Record<string, unknown>[];
  private line: WorldLine;
  private share = 0;
  private rung: Rung = 'ready';
  /** Whether the world holds work now; false once its last piece has left (23 C3). */
  private holding = true;
  private power = 1;
  private dimShare = 1;
  /** The lights it last showed while holding: what a vacated world's lights fade from. */
  private lit = 0;
  private firstFront = FIRST_FRONT_FROM;
  private firstLights = 0;

  constructor(private readonly radius: number, seed: number, opts: { line?: WorldLine; megastructures?: number; research?: number } = {}) {
    this.line = opts.line ?? worldLineOf(seed);
    this.geometry = quadGeometry(radius * UV_HALF, UV_HALF);
    this.siteGeometry = quadGeometry(radius, 1);
    const uniforms = (pass: number) => ({
      uPass: { value: pass, type: 'f32' as const },
      uPx: { value: 1 / radius, type: 'f32' as const },
      uTime: { value: 0, type: 'f32' as const },
      uPulse: { value: 0, type: 'f32' as const },
      uSeed: { value: (seed % 10007) / 10007, type: 'f32' as const },
      uLine: { value: 0, type: 'f32' as const },
      uShare: { value: 0, type: 'f32' as const },
      uMega: { value: 0, type: 'f32' as const },
      uResearch: { value: 0, type: 'f32' as const },
      uCloudAmt: { value: 0, type: 'f32' as const },
      uCloudBand: { value: 0, type: 'f32' as const },
      uCloudGrey: { value: 0, type: 'f32' as const },
      uLights: { value: 0, type: 'f32' as const },
      uDim: { value: 1, type: 'f32' as const },
      uFirstFront: { value: FIRST_FRONT_FROM, type: 'f32' as const },
      uFirstLights: { value: 0, type: 'f32' as const },
      uGlimmer: { value: 0, type: 'f32' as const },
      uRecede: { value: 0, type: 'f32' as const },
      uBands: { value: 0, type: 'f32' as const },
      uLightDir: { value: new Float32Array([-1, -0.4, 0.6]), type: 'vec3<f32>' as const },
      uSignal: { value: new Float32Array(rgb(RUNG_COLOR.ready)), type: 'vec3<f32>' as const },
      uSignalAmt: { value: 0.3, type: 'f32' as const },
      uFringe: { value: 0, type: 'f32' as const },
      uActivity: { value: 0, type: 'f32' as const },
      uBeat: { value: 12, type: 'f32' as const },
    });
    const a = makeShader('world', FRAGMENT, uniforms(0));
    const b = makeShader('world', FRAGMENT, uniforms(1));
    this.us = [a.u, b.u];
    this.body = new Mesh({ geometry: this.geometry, shader: a.shader });
    this.sites = new Mesh({ geometry: this.siteGeometry, shader: b.shader });
    this.root.addChild(this.body);
    this.marks.addChild(this.sites);
    this.setOutcomes(opts.megastructures ?? 0, opts.research ?? 0);
    this.apply();
  }

  private set(values: Record<string, number>): void {
    for (const u of this.us) Object.assign(u, values);
  }

  /** Landed objectives and defeated threats on this world (each capped at MAX_OUTCOMES). */
  setOutcomes(megastructures: number, research: number): void {
    const clamp = (x: number) => Math.max(0, Math.min(MAX_OUTCOMES, Math.floor(x)));
    this.set({ uMega: clamp(megastructures), uResearch: clamp(research) });
  }

  /**
   * Whether the world holds work now (23 C3). Call before `setStage`. A world that doesn't keeps the lights
   * it last had, for `setPower` to fade, since its own share (0) has none.
   */
  setHolding(holding: boolean): void {
    this.holding = holding;
  }

  /** 1 draws the world as its share says; 0 is vacated: the surface dimmed, the lights off. Eased by the caller. */
  setPower(level: number): void {
    const p = Math.max(0, Math.min(1, level));
    if (p === this.power) return;
    this.power = p;
    this.apply();
  }

  /** First light (v1.4 B4): a transient over the night side, null when none. Sets two uniforms; no `apply()`. */
  setFirstLight(f: FirstLight | null): void {
    const front = f ? FIRST_FRONT_FROM + (FIRST_FRONT_TO - FIRST_FRONT_FROM) * Math.max(0, Math.min(1, f.front)) : FIRST_FRONT_FROM;
    const lights = f ? Math.max(0, Math.min(1, f.lights)) : 0;
    if (front === this.firstFront && lights === this.firstLights) return;
    this.firstFront = front;
    this.firstLights = lights;
    this.set({ uFirstFront: front, uFirstLights: lights });
  }

  setStage(stage: string): void {
    const s = parseWorldStage(stage);
    if (s.line) this.line = s.line;
    this.share = s.share;
    if (s.megastructures !== undefined) this.setOutcomes(s.megastructures, s.research ?? 0);
    this.apply();
  }

  private apply(): void {
    const s = this.share;
    const w = WEATHER[this.line];
    this.rung = worldRung(s);
    const own = s >= 1 ? 1 : knot(w.lights, s);
    if (this.holding) this.lit = own;
    const { surface, lights } = vacancyShares(this.power);
    const signalAmt = { ready: 0.3, underway: 1, nearing: 0.85, accomplished: 0.85, off: 0.3 }[this.rung];
    this.set({
      uLine: LINE_INDEX[this.line], uShare: s,
      uCloudAmt: knot(w.clouds, s), uCloudBand: knot(w.band, s), uCloudGrey: knot(w.grey, s),
      uLights: (this.holding ? own : this.lit) * lights,
      uDim: surface,
      uRecede: this.rung === 'ready' ? 1 : 0,
      uBands: this.rung === 'underway' ? 1 : this.rung === 'nearing' ? 0.5 : 0,
      uSignalAmt: signalAmt,
      // Nearing: gold creeps in from ¾ toward completion.
      uFringe: this.rung === 'nearing' ? 0.3 + 0.6 * ((s - 0.75) / 0.25) : 0,
      uActivity: ACTIVITY[this.rung],
      // Ready breathes once every 12 s; the others ride the shared beat.
      uBeat: this.rung === 'ready' ? 12 : beatOf(this.rung),
    });
    for (const u of this.us) (u.uSignal as Float32Array).set(rgb(RUNG_COLOR[this.rung]));
    this.dimShare = surface;
  }

  /** The surface's share of light now (1 holding work; read by the test hooks' `viewTints`). */
  get surfaceShare(): number {
    return this.dimShare;
  }

  /** Light comes from the star, which sits at the scene origin. */
  /** The star's angle behind the planet (radians): sin = 1 − 2·lit, so 30° lights a quarter of the disc. */
  setLightFrom(starX: number, starY: number): void {
    const dx = starX - this.root.x;
    const dy = starY - this.root.y;
    const len = Math.hypot(dx, dy) || 1;
    for (const u of this.us) {
      const v = u.uLightDir as Float32Array;
      // A crescent: the star is mostly behind the planet, so only its star-facing limb is lit (a quarter
      // of the disc at CRESCENT), and the rest is shadow (13 §3, v4).
      v[0] = (dx / len) * Math.cos(CRESCENT); v[1] = (dy / len) * Math.cos(CRESCENT); v[2] = -Math.sin(CRESCENT);
    }
  }

  tick(seconds: number): void {
    // Settlement lights glimmer only on a finished world, and never under reduced motion (05 §7).
    this.set({ uTime: seconds, uPulse: motion.pulseTime, uGlimmer: this.rung === 'accomplished' && !motion.reduced ? 1 : 0 });
  }

  destroy(): void {
    const shaders = [this.body.shader, this.sites.shader];
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
    for (const s of shaders) s?.destroy();
    this.geometry.destroy();
    this.siteGeometry.destroy();
  }
}

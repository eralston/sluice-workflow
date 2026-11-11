// Loading energy (decided 2026-10-07, reworked the same day): while something loads, the object it's
// for gathers energy suited to its kind, building the longer the wait runs and flaring out as the
// scene changes.
//   - Galaxy: flaming arms emerge and expand, spinning faster and breathing.
//   - Star: the corona licks outward in swirling tongues, shedding embers: a campfire lit by elder
//     gods, with a faint violet flicker at the tips.
//   - Planet: an aurora wreathes the poles in green, blue, pink, and purple curtains.
//   - Black hole (the empty cosmos): particles appear from nowhere at the rim and spiral into the
//     centre, accelerating and widening, until the photon ring itself starts to crack.
// The ladder's blue and violet appear here by decision: the effect is brief and always moving, so it
// never reads as a work state (09 §1, noted there). Screen space, owned by the chart like the hero
// aura; wall time, never the playback rate. Reduced motion: one still frame, held at a steady glow.
import { Container, Mesh, type Geometry, type Shader } from 'pixi.js';
import { NOISE } from '../art/glsl';
import { makeShader, quadGeometry } from '../art/quad';

export type EnergyKind = 'galaxy' | 'star' | 'planet' | 'blackhole';
const KIND_ID: Record<EnergyKind, number> = { galaxy: 0, star: 1, planet: 2, blackhole: 3 };
/** How far each effect reaches, in object radii (the quad's half-size). */
const EXTENT: Record<EnergyKind, number> = { galaxy: 2.4, star: 3.2, planet: 2.1, blackhole: 2.8 };

/** The progress arc's old cue, kept as the moment the effect reaches full strength (s). */
export const ARC_AFTER_S = 1.5;
const RELEASE_S = 0.6;
/** Waits this long before showing (s), so a quick lookup never flashes (decided 2026-10-07). */
export const QUIET_START_S = 0.25;
const FADE_S = 0.3;
/**
 * How the energy builds (23 C10, one step softer; it was 0.35, 0.14/s, peak 1.8): where a load starts,
 * how fast it gathers per second of wait, how much each unit of progress adds, and the most it reaches.
 */
export const ENERGY_BASE = 0.3;
export const ENERGY_RATE = 0.09;
export const ENERGY_PROGRESS = 0.3;
export const ENERGY_PEAK = 1.5;

const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform float uTime;
uniform float uEnergy;
uniform float uRelease;
uniform float uSeed;
uniform float uKind;
uniform float uAlpha;
${NOISE}
const float TAU = 6.2831853;

vec3 galaxy(vec2 p, float t, float E, float R) {
  vec2 q = vec2(p.x, p.y / 0.55); // the galaxy's oblique tilt (galaxy.ts)
  float breathe = 1.0 + 0.09 * E * sin(t * 2.1);
  float r = length(q) / (breathe * (1.0 + 0.3 * E + 0.9 * R));
  float ang = atan(q.y, q.x) - t * (0.5 + 0.9 * E);
  float spiral = ang * 2.0 + log(r + 0.05) * 3.6;
  float arm = pow(0.5 + 0.5 * cos(spiral), 2.0);
  // Flames: ridged noise makes licking filaments, streaming outward along each arm.
  vec3 fp = vec3(spiral * 1.1 + 0.8 * sin(r * 6.0 - t), r * 6.0 - t * (1.6 + 1.2 * E), uSeed);
  float n = fbm(fp + fbm3(fp * 1.7) * 0.9);
  float ridge = pow(1.0 - abs(2.0 * n - 1.0), 3.0);
  float tongue = smoothstep(0.25, 0.9, ridge * (0.6 + 0.8 * arm) + arm * 0.25);
  float reach = smoothstep(0.18, 0.45, r) * (1.0 - smoothstep(0.75, 1.35 + 0.45 * E, r));
  float I = tongue * reach * (0.35 + 0.45 * E) * (0.35 + 0.9 * arm); // the arms carry the fire
  // Hot amber where flames bite, through the galaxy's cobalt and violet to the arms' cool tips.
  vec3 col = mix(COBALT, VIOLET, smoothstep(0.3, 1.2, r));
  col = mix(col, vec3(1.0, 0.55, 0.2), smoothstep(0.55, 0.95, ridge) * (1.0 - smoothstep(0.5, 1.1, r)) * 0.8);
  col += IVORY * pow(ridge * arm, 6.0) * 0.5;
  return col * I + mix(AMBER, IVORY, 0.5) * exp(-r * r * 12.0) * 0.3 * E;
}

vec3 star(vec2 p, float t, float E, float R) {
  float d = length(p);
  float ang = atan(p.y, p.x);
  float h = max(d - 0.96, 0.0);
  // Swirling tongues: the corona's polar field, warped and lifted outward.
  vec2 w = vec2(ang * 3.2 + 0.7 * sin(h * 5.0 - t * 1.4), h * 3.2 - t * (1.1 + 0.9 * E));
  float warp = fbm(vec3(w * 1.6, t * 0.35 + uSeed));
  float n = fbm(vec3(w + warp * 1.3, uSeed + 4.0));
  float reach = 0.3 + 0.75 * E + 0.9 * R;
  float heat = clamp(n * 1.7 - h / reach, 0.0, 1.0) * smoothstep(0.9, 1.0, d);
  vec3 crimson = vec3(0.95, 0.16, 0.05);
  vec3 orange = vec3(1.0, 0.48, 0.1);
  vec3 col = mix(crimson, orange, smoothstep(0.0, 0.6, heat));
  col = mix(col, vec3(1.0, 0.82, 0.42), heat * heat);
  col = mix(col, vec3(1.0, 0.97, 0.88), pow(heat, 4.0));
  // The elder gods' flicker: violet at the tongues' cooling tips.
  float eldritch = smoothstep(0.55, 0.85, fbm(vec3(w * 0.7 + 11.0, t * 0.5))) * (1.0 - heat) * smoothstep(0.05, 0.4, heat + 0.2);
  vec3 c = col * sqrt(heat) * 1.1 + VIOLET * eldritch * 0.5 * E * smoothstep(0.96, 1.1, d);
  // Embers riding up the flames.
  float lanes = 56.0;
  vec2 e = vec2(ang / TAU * lanes + 1.5 * sin(h * 3.0 + t * 0.9), (h - t * (0.22 + 0.3 * E)) * 7.0);
  vec2 id = floor(e);
  vec2 f = fract(e) - 0.5;
  float rnd = hash31(vec3(id, uSeed));
  vec2 off = vec2(hash31(vec3(id, 1.0)), hash31(vec3(id, 2.0))) - 0.5;
  float ember = smoothstep(0.2, 0.0, length(f - off * 0.6)) * step(0.72 - 0.12 * E, rnd);
  ember *= smoothstep(0.98, 1.08, d) * (1.0 - smoothstep(reach * 0.9, reach * 1.6, h));
  c += mix(orange, vec3(1.0, 0.85, 0.5), rnd) * ember * 1.3;
  return c;
}

vec3 aurora(float k) {
  // green at the base, through blue and pink, to purple at the top
  vec3 g = vec3(0.3, 1.0, 0.55), b = vec3(0.25, 0.6, 1.0), pk = vec3(1.0, 0.42, 0.75), pu = vec3(0.62, 0.36, 1.0);
  // Green holds most of the curtain; blue, pink, and purple come in toward the top.
  k = clamp(k, 0.0, 1.0);
  if (k < 0.45) return g;
  if (k < 0.65) return mix(g, b, (k - 0.45) / 0.2);
  if (k < 0.85) return mix(b, pk, (k - 0.65) / 0.2);
  return mix(pk, pu, (k - 0.85) / 0.15);
}

vec3 planet(vec2 p, float t, float E, float R) {
  float d = length(p);
  vec3 c = vec3(0.0);
  float grow = 1.0 + 0.2 * E + 0.6 * R;
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? -1.0 : 1.0; // the top pole (screen y is down), then the bottom
    vec2 v = vec2(p.x, p.y * s);    // this pole points along +v.y
    float th = atan(abs(v.x), v.y); // angle from the pole: 0 over it, pi/2 at the equator
    // A crown of curtains wreathing the pole, rising from the atmosphere and following its curve.
    float fold = fbm(vec3(th * 3.0, t * 0.25, s * 3.0 + uSeed)) - 0.5;
    float h = d - (0.9 + fold * 0.1);
    float height = (0.2 + 0.16 * E) * grow;
    float spread = 0.8 + 0.18 * E;
    float crown = 1.0 - smoothstep(spread * 0.55, spread, th);
    float curtain = smoothstep(-0.07, 0.02, h) * exp(-max(h, 0.0) / height) * crown;
    // Rays hang down the curtains; cloudier light drifts through them.
    float side = sign(v.x + 1e-4);
    float rays = 0.6 + 0.5 * pow(vnoise(vec3(th * 18.0 * side + fold * 6.0, t * 0.6, s * 5.0)), 1.4);
    // Clouds of light that swirl as they drift along the crown.
    vec3 cp = vec3(th * 4.0 * side + t * 0.2, h * 5.0 - t * 0.35, s + uSeed);
    float cloud = 0.15 + 1.3 * smoothstep(0.3, 0.8, fbm(cp + fbm3(cp * 1.8 + t * 0.2) * 0.9));
    float I = curtain * rays * cloud * (0.45 + 0.65 * E);
    I *= d < 0.97 ? 0.7 : 1.0; // over the disc it glows in the atmosphere, dimmer than against space
    // Green at the base, blue and pink higher, purple at the crown's top, drifting along it.
    float k = pow(clamp(h / (height * 2.6), 0.0, 1.0), 1.3) * 0.95 + 0.12 * (0.5 + 0.5 * sin(t * 0.4 + s + th * 4.0)); // mostly green, as auroras are
    c += aurora(k) * I;
  }
  float limb = exp(-pow((d - 1.03) / 0.05, 2.0)) * (0.05 + 0.08 * E);
  c += aurora(0.2 + 0.5 * abs(p.y)) * limb;
  return c * 1.5;
}

vec3 blackhole(vec2 p, float t, float E, float R) {
  float d = length(p);
  float ang = atan(p.y, p.x);
  float u = log(max(d, 0.001));
  // Inflow speeds up as the wait goes on (E grows): the storm's pull.
  float flow = t * (0.25 + 1.1 * E * E);
  float outer = 1.5 + 0.8 * E + 2.0 * R;
  float life = smoothstep(outer, outer * 0.8, d) * smoothstep(0.3, 0.42, d);
  vec3 c = vec3(0.0);
  // Particles on spiral lanes, falling inward in log radius: they appear at the rim from nowhere.
  for (int layer = 0; layer < 2; layer++) {
    float L = float(layer);
    float lanes = 26.0 + L * 18.0;
    vec2 g = vec2(ang / TAU * lanes + u * (4.0 + L * 2.0), (u + flow * (1.0 + L * 0.35)) * (6.0 + L * 3.0));
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float rnd = hash31(vec3(id, uSeed + L * 7.0));
    vec2 off = vec2(hash31(vec3(id, 1.0 + L)), hash31(vec3(id, 2.0 + L))) - 0.5;
    float pt = smoothstep(0.22, 0.0, length((f - off * 0.55) * vec2(1.0, 0.6))) * step(0.93 - 0.3 * min(E, 1.5), rnd);
    float hot = smoothstep(1.2, 0.35, d);
    c += mix(mix(COBALT, VIOLET, rnd), mix(AMBER, IVORY, hot), hot) * pt * (0.7 + 0.8 * hot) * life;
  }
  // Storm bands: the swirl the particles ride in.
  float storm = smoothstep(0.55, 0.9, fbm(vec3(ang * 3.0 + u * 5.0 + flow * 2.0, u * 6.0, uSeed)));
  c += mix(VIOLET, AMBER, smoothstep(1.0, 0.4, d)) * storm * life * 0.35 * E;
  // Spacetime straining: the photon ring cracks with light once the pull is strong.
  float crack = smoothstep(0.7, 0.95, vnoise(vec3(ang * 7.0, d * 3.0, t * 2.5))) * exp(-pow((d - 0.35) / 0.07, 2.0));
  c += mix(IVORY, AMBER, 0.3) * crack * smoothstep(0.9, 1.6, E) * 3.0;
  c += VIOLET * exp(-pow((d - 0.36) / 0.12, 2.0)) * smoothstep(1.0, 1.8, E) * 0.6; // the strain's glow
  // The release: a ring of light thrown out as the cosmos fills.
  c += IVORY * exp(-pow((d - (0.32 + R * 3.2)) / (0.05 + R * 0.25), 2.0)) * R * (1.0 - R) * 4.0;
  return c;
}

void main() {
  vec2 p = vUV;
  float t = uTime;
  vec3 c;
  if (uKind < 0.5) c = galaxy(p, t, uEnergy, uRelease);
  else if (uKind < 1.5) c = star(p, t, uEnergy, uRelease);
  else if (uKind < 2.5) c = planet(p, t, uEnergy, uRelease);
  else c = blackhole(p, t, uEnergy, uRelease);
  c = 1.0 - exp(-c * 1.3);
  // Fade at the quad's edge, so nothing is ever cut square.
  float edge = 1.0 - smoothstep(0.8, 1.0, max(abs(p.x), abs(p.y)) / ${'${EXT}'});
  finalColor = vec4(c * edge * uAlpha, 0.0);
}
`;

/** One object's loading energy: start, build with time and progress, then release or fade. */
export class EnergyFx {
  readonly root = new Container({ label: 'energy' });
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly geometry: Geometry;
  private readonly u: Record<string, unknown>;
  private t = 0;
  private progress = 0;
  private alpha = 0;
  /** Where it was last drawn: the release plays on there as the scene changes under it. */
  private last: { x: number; y: number; r: number } | null = null;
  /** Seconds into the ending, or -1 while it runs. */
  private ending = -1;
  private outcome: 'done' | 'failed' = 'done';
  /** Extra build (0..1) on top of time and progress, for the black hole's gentle and storm levels. */
  base = ENERGY_BASE;
  /** How fast it builds (energy per second). */
  rate = ENERGY_RATE;
  finished = false;

  constructor(parent: Container, readonly kind: EnergyKind, seed = 0.5) {
    const ext = EXTENT[kind];
    this.geometry = quadGeometry(ext, ext);
    const { shader, u } = makeShader(`energy-${kind}`, FRAGMENT.replace('${EXT}', ext.toFixed(2)), {
      uTime: { value: 0, type: 'f32' },
      uEnergy: { value: 0, type: 'f32' },
      uRelease: { value: 0, type: 'f32' },
      uSeed: { value: seed, type: 'f32' },
      uKind: { value: KIND_ID[kind], type: 'f32' },
      uAlpha: { value: 0, type: 'f32' },
    });
    this.u = u;
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    this.mesh.blendMode = 'add';
    this.root.addChild(this.mesh);
    parent.addChild(this.root);
  }

  setProgress(p: number): void {
    this.progress = Math.max(this.progress, Math.min(1, p));
  }

  /** Done: it flares out (the release). Failed or cancelled: it fades quietly. */
  end(outcome: 'done' | 'failed'): void {
    if (this.ending >= 0) return;
    this.ending = 0;
    this.outcome = outcome;
  }

  get ended(): boolean {
    return this.ending >= 0;
  }

  /** The energy now: it builds with the wait and with progress (decided 2026-10-07: long waits look like work). */
  energy(): number {
    return Math.min(ENERGY_PEAK, this.base + this.t * this.rate + this.progress * ENERGY_PROGRESS);
  }

  /** The gallery: hold the effect at this instant, fully gathered (frozen frames are repeatable). */
  holdAt(seconds: number): void {
    this.t = seconds;
    this.alpha = 1;
  }

  update(dt: number, at: { x: number; y: number; r: number } | null, reduced: boolean): void {
    if (this.finished) return;
    this.t += dt;
    if (at) this.last = at;
    const where = this.last;
    let release = 0;
    let fade = 1;
    // Ended before it ever showed: nothing to release or fade.
    if (this.ending >= 0 && this.alpha === 0) { this.destroy(); return; }
    if (this.ending >= 0) {
      this.ending += dt;
      const span = this.outcome === 'done' ? RELEASE_S : FADE_S;
      const k = Math.min(1, this.ending / span);
      if (this.outcome === 'done') { release = k; fade = Math.pow(1 - k, 1.5); } else fade = 1 - k;
      if (k >= 1) { this.destroy(); return; }
    }
    if (this.t >= QUIET_START_S || this.alpha > 0) this.alpha = Math.min(1, this.alpha + dt / 0.35); // gathers in
    this.root.visible = !!where;
    if (!where) return;
    this.root.position.set(where.x, where.y);
    this.root.scale.set(where.r);
    this.u.uTime = reduced ? 3.0 : this.t;
    this.u.uEnergy = reduced ? 0.6 : this.energy() + release * 0.8;
    this.u.uRelease = reduced ? 0 : release;
    this.u.uAlpha = this.alpha * fade;
  }

  destroy(): void {
    if (this.finished) return;
    this.finished = true;
    const shader = this.mesh.shader;
    this.root.destroy({ children: true });
    shader?.destroy();
    this.geometry.destroy();
  }
}

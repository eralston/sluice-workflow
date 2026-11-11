// 06 §7 star (Feature) on the signal ladder (09 §4): the core keeps one warm look, and the corona
// carries the rung. Ready: a dim disc with a faint grey glow (New: an outline sketch). Underway: blue
// rays, turning and shimmering, the brightest star in the sector. Nearing: a violet corona with a gold
// fringe, quickening. Accomplished: a still gold starburst crown (the mid-century Googie starburst).
import { Container, Graphics, Mesh, type Geometry, type Shader } from 'pixi.js';
import { NOISE } from './glsl';
import { drawOffLadderMarks } from './marks';
import { motion } from './motion';
import { ACTIVITY, beatOf, PROGRESS_GLSL, RUNG_COLOR, rgb, signalOf } from './progress';
import { makeShader, quadGeometry } from './quad';

const UV_HALF = 3.2;

const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uTime;
uniform float uPulse; // the progress beat's clock: speeds up to 2× in fast playback (05 §5)
uniform float uSeed;
uniform float uBright;
uniform float uRays;
uniform float uGhost;
uniform float uSketch;
uniform float uCrown;
uniform float uFringe;
uniform float uActivity;
uniform float uBeat;
uniform vec3 uSignal;
uniform float uMute;
// The corona's breath (2026-10-12): -1..1 over 20 s, the slowest heartbeat in the scene (0 in reduced motion).
uniform float uBreath;
${NOISE}
${PROGRESS_GLSL}
const float TAU = 6.2831853;
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
void main() {
  float d = length(vUV);
  float ang = atan(vUV.y, vUV.x);
  vec3 col = vec3(0.0);
  float a = 0.0;

  // Corona in the rung's color. It turns (once per 48 s, streaks counter-turning per 80 s) and
  // twinkles only as much as the rung is active: still when accomplished.
  float act = uActivity;
  float ra = ang + uTime * TAU / 48.0 * act;
  float sa = ang - uTime * TAU / 80.0 * act;
  float rays = fbm(vec3(cos(ra) * 4.5 + uSeed, sin(ra) * 4.5, d * 0.9 - uTime * 0.035 * act));
  float streak = fbm3(vec3(cos(sa) * 11.0, sin(sa) * 11.0, uSeed + uTime * 0.0125 * act));
  float beat = progressPulse(uPulse, 0.0, uBeat);
  float twinkle = 1.0 + act * (0.12 * beat - 0.04 + 0.12 * sin(ang * 5.0 + uTime * TAU / 32.0) * smoothstep(1.0, 1.4, d));
  // It breathes: the corona swells a little further and brighter, then settles, over 20 s.
  float halo = exp(-max(d - 1.0, 0.0) * 2.4 / (1.0 + 0.14 * uBreath));
  float corona = halo * (0.16 + uRays * 1.15 * pow(rays, 2.4) * (0.6 + 0.8 * streak)) * uBright * twinkle * (1.0 + 0.1 * uBreath);
  corona *= smoothstep(UV_HALF_F, UV_HALF_F * 0.7, d);
  // Nearing: gold creeps into the corona's outer reach.
  vec3 tint = mix(uSignal, LADDER_GOLD, uFringe * smoothstep(1.1, 2.2, d));
  col += tint * corona + tint * 0.3 * halo * halo * uBright;
  a += corona;

  // Accomplished: an eight-point starburst, long on the axes and short on the diagonals.
  if (uCrown > 0.0) {
    float w = 0.03 * (1.0 + d * 0.35);
    float axes = min(abs(vUV.x), abs(vUV.y));
    float diag = min(abs(vUV.x + vUV.y), abs(vUV.x - vUV.y)) * 0.7071;
    float burst = exp(-pow(axes / w, 2.0)) * exp(-max(d - 1.0, 0.0) * 1.4) + 0.6 * exp(-pow(diag / w, 2.0)) * exp(-max(d - 1.0, 0.0) * 2.2);
    burst *= smoothstep(0.95, 1.15, d) * smoothstep(UV_HALF_F, UV_HALF_F * 0.75, d);
    col += LADDER_GOLD * burst * 0.8 * uCrown;
    a += burst * uCrown;
  }
  col = 1.0 - exp(-col * 1.2); // soft tonemap on the corona only

  if (d < 1.0) {
    vec3 n = vec3(vUV, sqrt(1.0 - d * d));
    // Identity motion: the surface turns once per 48 s while its granulation boils (every rung).
    vec3 sn = rotY(n, uTime * TAU / 48.0);
    float gran = fbm(sn * 9.0 + vec3(uSeed, 0.0, uTime * 0.04));
    float limb = pow(n.z, 0.55);
    vec3 core = clamp(mix(vec3(1.0, 0.48, 0.14), vec3(1.0, 0.93, 0.72), limb) * (0.78 + 0.42 * gran), 0.0, 1.0);
    core *= mix(0.42, 1.0, uBright);
    // Ready: the core is muted toward steel grey, so pending work recedes behind active work.
    core = mix(core, vec3(dot(core, vec3(0.3, 0.59, 0.11))) * LADDER_READY * 1.15, uMute);
    // New: only a sketch of the star, an outline and a faint fill.
    float rim = smoothstep(0.9, 0.97, d);
    core = mix(core, LADDER_READY * (0.18 + 0.8 * rim), uSketch);
    float edge = smoothstep(1.0, 0.97, d);
    col = mix(col, core, edge * mix(1.0, 0.45 + 0.55 * rim, uSketch));
    a = max(a, edge * mix(1.0, 0.25 + 0.75 * rim, uSketch));
  }

  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(lum) * vec3(0.75, 0.85, 1.0), uGhost * 0.8);
  a *= 1.0 - uGhost * 0.6;
  col *= 1.0 - uGhost * 0.6;
  finalColor = vec4(col, clamp(a, 0.0, 1.0)) * uColor.a;
}
`.replace(/UV_HALF_F/g, UV_HALF.toFixed(2));

/** Rung → corona brightness, ray strength, crown, and gold fringe. */
export function starStage(stage: string) {
  const s = signalOf(stage);
  const look = {
    ready: { bright: s.sketch ? 0.3 : 0.42, rays: 0, crown: 0, fringe: 0 },
    underway: { bright: 1, rays: 1.05, crown: 0, fringe: 0 },
    nearing: { bright: 0.9, rays: 0.9, crown: 0, fringe: s.step ?? 0.5 },
    accomplished: { bright: 0.72, rays: 0.2, crown: 1, fringe: 0 },
    off: { bright: 0.4, rays: 0.1, crown: 0, fringe: 0 },
  }[s.rung];
  return { ...look, signal: s, ghost: s.ghost ? 1 : s.unknown ? 0.5 : 0 };
}

export class StarView {
  readonly root = new Container();
  private readonly mesh: Mesh<Geometry, Shader>;
  /** Off-ladder marks, drawn crisp outside the paint pass: the scene places them over the body. */
  readonly marks = new Graphics();
  private readonly geometry: Geometry;
  private readonly u: Record<string, unknown>;

  constructor(private readonly radius: number, seed: number) {
    this.breathPhase = ((seed >>> 0) % 628) / 100;
    this.geometry = quadGeometry(radius * UV_HALF, UV_HALF);
    const { shader, u } = makeShader('star', FRAGMENT, {
      uTime: { value: 0, type: 'f32' },
      uPulse: { value: 0, type: 'f32' },
      uSeed: { value: (seed % 9973) / 997.3, type: 'f32' },
      uBright: { value: 1, type: 'f32' },
      uRays: { value: 1, type: 'f32' },
      uGhost: { value: 0, type: 'f32' },
      uSketch: { value: 0, type: 'f32' },
      uCrown: { value: 0, type: 'f32' },
      uFringe: { value: 0, type: 'f32' },
      uActivity: { value: 1, type: 'f32' },
      uBeat: { value: 2.4, type: 'f32' },
      uSignal: { value: new Float32Array(rgb(RUNG_COLOR.underway)), type: 'vec3<f32>' },
      uMute: { value: 0, type: 'f32' },
      uBreath: { value: 0, type: 'f32' },
    });
    this.u = u;
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    this.mesh.blendMode = 'add';
    this.root.addChild(this.mesh);
  }

  setStage(stage: string): void {
    const s = starStage(stage);
    const rung = s.signal.rung;
    Object.assign(this.u, {
      uBright: s.bright, uRays: s.rays, uGhost: s.ghost, uSketch: s.signal.sketch ? 1 : 0, uCrown: s.crown,
      uFringe: s.fringe, uActivity: ACTIVITY[rung], uBeat: beatOf(rung), uMute: rung === 'ready' ? 0.75 : 0,
    });
    (this.u.uSignal as Float32Array).set(rgb(RUNG_COLOR[rung]));
    drawOffLadderMarks(this.marks, s.signal, this.radius);
  }

  tick(seconds: number): void {
    this.u.uTime = seconds;
    this.u.uPulse = motion.pulseTime;
    this.u.uBreath = motion.reduced ? 0 : Math.sin((2 * Math.PI * seconds) / 20 + this.breathPhase);
  }

  /** Where in its 20 s breath this star starts, from its seed (so two stars never breathe together). */
  private readonly breathPhase: number;

  destroy(): void {
    const shader = this.mesh.shader;
    this.marks.destroy();
    this.root.destroy({ children: true });
    shader?.destroy();
    this.geometry.destroy();
  }
}

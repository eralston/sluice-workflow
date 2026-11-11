// 06 §7 planet (Story) on the signal ladder (09 §4): the surface evolves (sketch → barren rock →
// terraforming → developed → lush), and the rim light and atmospheric halo carry the rung's color.
// Lit by its star. A closed world's glimmering city lights are the one motion kept after completion.
import { Container, Graphics, Mesh, type Geometry, type Shader } from 'pixi.js';
import { NOISE } from './glsl';
import { drawOffLadderMarks } from './marks';
import { motion } from './motion';
import { ACTIVITY, beatOf, PROGRESS_GLSL, RUNG_COLOR, rgb, signalOf } from './progress';
import { makeShader, quadGeometry } from './quad';

const UV_HALF = 1.3;

const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uTime;
uniform float uPulse; // the progress beat's clock: speeds up to 2× in fast playback (05 §5)
uniform float uSeed;
uniform float uTerraform;
uniform float uClouds;
uniform float uLights;
uniform float uBands;
uniform float uGrid;
uniform float uDormant;
uniform float uGhost;
uniform float uNeutral;
uniform vec3 uLightDir;
uniform vec3 uSignal;
uniform float uSignalAmt;
uniform float uFringe;
uniform float uSketch;
uniform float uActivity;
uniform float uBeat;
${NOISE}
${PROGRESS_GLSL}
// Distance to the nearest crater center (3D cell noise); only some cells hold a crater.
float craterField(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float best = 1.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 c = vec3(float(x), float(y), float(z));
    float h = hash31(i + c);
    if (h < 0.55) continue;
    vec3 o = vec3(hash31(i + c + 7.1), hash31(i + c + 3.3), hash31(i + c + 5.9));
    float size = 0.22 + 0.2 * fract(h * 13.0);
    best = min(best, length(c + o - f) / size);
  }
  return best;
}
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
void main() {
  float r = length(vUV);
  vec3 L = normalize(uLightDir);
  // The rung's color lights the rim and halo; nearing worlds gather gold at the limb.
  vec3 atmo = uSignal;
  if (uNeutral > 0.5) atmo = vec3(0.6);
  float beat = progressPulse(uPulse, 0.0, uBeat) * uActivity;

  if (r > 1.0) {
    // atmospheric halo, brighter on the sunward limb
    float g = smoothstep(1.0 + 0.22, 1.0, r);
    float lit = clamp(dot(normalize(vec3(vUV, 0.0)), L) * 0.7 + 0.45, 0.0, 1.0);
    float a = g * g * lit * (0.2 + 0.75 * uSignalAmt) * (0.9 + 0.25 * beat) * (1.0 - uGhost * 0.7) * (1.0 - 0.8 * uSketch);
    vec3 halo = mix(atmo, LADDER_GOLD, uFringe * smoothstep(1.02, 1.2, r));
    finalColor = vec4(halo * a, a) * uColor.a;
    return;
  }

  vec3 n = vec3(vUV, sqrt(1.0 - r * r));
  // Tempo (06 §7 motion): one turn every 48 s; clouds drift at their own rate for parallax.
  const float SPIN = 6.2831853 / 96.0; // one turn every 96 s (slowed 2026-10-12)
  vec3 pn = rotY(n, uTime * SPIN + uSeed * 6.2831);
  vec3 sp = pn * 1.7 + vec3(uSeed * 13.0, uSeed * 7.0, uSeed * 3.0);
  float h = fbm(sp);
  float h2 = fbm(sp * 3.1 + 5.0);

  // palettes vary by seed; never encode state
  float pal = fract(uSeed * 4.0);
  vec3 dust = mix(vec3(0.50, 0.36, 0.28), vec3(0.42, 0.40, 0.46), pal);
  vec3 rock = mix(vec3(0.28, 0.24, 0.27), vec3(0.33, 0.28, 0.22), pal);
  vec3 barren = mix(dust, rock, smoothstep(0.35, 0.65, h2)) * (0.7 + 0.6 * h);
  // Craters: dark pits with a lit rim, so a turning world visibly turns.
  float cr = craterField(sp * 2.6 + 2.0); // < 1 inside a crater
  barren *= 1.0 - 0.4 * smoothstep(0.95, 0.6, cr);
  barren += vec3(0.12, 0.10, 0.08) * smoothstep(0.85, 1.0, cr) * smoothstep(1.2, 1.0, cr); // lit rim

  float sea = mix(0.50, 0.53, pal);
  vec3 deep = vec3(0.04, 0.12, 0.30);
  vec3 shallow = vec3(0.10, 0.36, 0.52);
  vec3 green = mix(vec3(0.20, 0.44, 0.24), vec3(0.36, 0.46, 0.22), pal);
  vec3 high = vec3(0.50, 0.44, 0.32);
  vec3 lush = h < sea ? mix(deep, shallow, smoothstep(sea - 0.14, sea, h))
                      : mix(green, high, smoothstep(sea + 0.02, sea + 0.24, h));
  lush = mix(lush, vec3(0.92, 0.95, 1.0), smoothstep(0.80, 0.9, abs(pn.y) + h2 * 0.12));

  // terraform front: region where a slow noise field is below the progress value
  float field = fbm3(sp * 0.75 + 11.0) * 0.9 + 0.05;
  float m = smoothstep(-0.03, 0.03, uTerraform - field);
  vec3 col = mix(barren, lush, m);
  float front = 1.0 - smoothstep(0.0, 0.035, abs(uTerraform - field));
  // In progress: the shared progress pulse flows across the front, west to east (progress.ts).
  col += uSignal * 0.75 * front * uBands * (0.3 + 0.7 * progressPulse(uPulse, (pn.x + 1.0) * 0.45, uBeat));

  // clouds rotate a little faster than the surface
  vec3 cp = rotY(n, uTime * SPIN * 1.35 + uSeed * 3.0);
  float c = smoothstep(0.52, 0.78, fbm(cp * 2.3 + uSeed * 9.0)) * uClouds;
  // Cloud shadows: the same clouds sampled a little sunward darken the ground below.
  float shadow = smoothstep(0.52, 0.78, fbm(rotY(n + uLightDir * 0.04, uTime * SPIN * 1.35 + uSeed * 3.0) * 2.3 + uSeed * 9.0)) * uClouds;
  col *= 1.0 - 0.3 * shadow * (1.0 - c);
  col = mix(col, vec3(0.96, 0.97, 1.0), c * 0.85);

  if (uNeutral > 0.5) col = vec3(0.42, 0.44, 0.48) * (0.8 + 0.3 * h2);

  // lighting with a soft painterly terminator
  float ndl = dot(n, L);
  float wrap = smoothstep(-0.25, 0.65, ndl);
  wrap = mix(wrap, floor(wrap * 5.0 + 0.5) / 5.0, 0.25);
  vec3 lit = col * (0.05 + 1.05 * wrap);

  // Sunlight glinting off open water: it comes and goes as oceans turn under it.
  vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float glint = pow(max(dot(n, hv), 0.0), 60.0) * step(h, sea) * m * (1.0 - c);
  lit += vec3(1.0, 0.95, 0.85) * glint * 0.45;

  // city lights on the night side of settled land
  float night = 1.0 - smoothstep(-0.1, 0.2, ndl);
  // Settlements are dabs a few pixels wide (lower frequency), so the paint pass keeps them as dabs.
  float city = smoothstep(0.6, 0.66, fbm3(sp * 6.5)) * step(sea, h) * m;
  // The one motion kept after completion: the lights glimmer, each settlement on its own phase.
  lit += vec3(1.0, 0.78, 0.42) * city * night * uLights * 1.4 * (0.6 + 0.4 * sin(uTime * 1.3 + h2 * 60.0));

  // rim light
  float fres = pow(1.0 - n.z, 2.4);
  lit += mix(atmo, LADDER_GOLD, uFringe * 0.6) * fres * (0.25 + 0.6 * wrap) * (0.25 + 0.95 * uSignalAmt) * (0.9 + 0.3 * beat);

  // graticule: the wireframe of a New world's sensor sketch
  float lat = asin(clamp(pn.y, -1.0, 1.0));
  float lon = atan(pn.z, pn.x);
  float gl = smoothstep(0.93, 1.0, abs(cos(lat * 7.0))) + smoothstep(0.95, 1.0, abs(cos(lon * 6.0)));
  // New: only a sensor sketch of the world: a grey wireframe of its turning graticule and limb over
  // a dark fill, breathing very slowly (about 12 s).
  vec3 sketch = INK * 0.55 + LADDER_READY * (clamp(gl, 0.0, 1.0) * 0.7 + smoothstep(0.92, 0.99, r) * 0.9) * smoothstep(-0.2, 0.4, n.z + 0.3);
  sketch *= 0.88 + 0.12 * sin(uTime * 6.2831853 / 12.0);
  lit = mix(lit, sketch, uSketch);

  // brush texture
  lit *= 0.94 + 0.12 * vnoise(vec3(vUV.x * 18.0 + vUV.y * 6.0, vUV.y * 34.0, uSeed * 5.0));

  lit *= mix(1.0, 0.42, uDormant);
  float lum = dot(lit, vec3(0.3, 0.59, 0.11));
  lit = mix(lit, vec3(lum) * vec3(0.72, 0.82, 1.0), uGhost * 0.85);

  float alpha = smoothstep(1.0, 0.985, r) * (1.0 - uGhost * 0.55) * mix(1.0, 0.45 + 0.55 * max(clamp(gl, 0.0, 1.0), smoothstep(0.92, 0.99, r)), uSketch);
  finalColor = vec4(lit * alpha, alpha) * uColor.a;
}
`;

interface PlanetUniforms {
  terraform: number; clouds: number; lights: number; bands: number; grid: number;
  dormant: number; ghost: number; neutral: number; sketch: number; signalAmt: number; fringe: number;
}

/** Rung → surface and lighting (09 §4). Off-ladder marks come from marks.ts. */
export function planetStage(stage: string): PlanetUniforms & { signal: ReturnType<typeof signalOf> } {
  const signal = signalOf(stage);
  const base = { terraform: 0, clouds: 0, lights: 0, bands: 0, grid: 0, dormant: 0, ghost: 0, neutral: 0, sketch: 0, signalAmt: 0.3, fringe: 0, signal };
  switch (signal.rung) {
    case 'ready':
      if (signal.sketch) return { ...base, sketch: 1, signalAmt: 0.2 };
      return { ...base, terraform: 0.05, dormant: signal.deferred ? 1 : 0, signalAmt: 0.3 };
    case 'underway': return { ...base, terraform: 0.42, clouds: 0.3, bands: 1, signalAmt: 1 };
    case 'nearing': return { ...base, terraform: 0.78, clouds: 0.2, signalAmt: 0.85, fringe: signal.step ?? 0.5 };
    case 'accomplished': return { ...base, terraform: 1, clouds: 0.42, lights: 1, signalAmt: 0.75 };
    default: return signal.unknown ? { ...base, neutral: 1 } : { ...base, terraform: 0.3, ghost: 1 };
  }
}

export class PlanetView {
  readonly root = new Container();
  private readonly mesh: Mesh<Geometry, Shader>;
  /** Off-ladder marks, drawn crisp outside the paint pass: the scene places them over the body. */
  readonly marks = new Graphics();
  private readonly geometry: Geometry;
  private readonly u: Record<string, unknown>;

  constructor(private readonly radius: number, seed: number) {
    this.geometry = quadGeometry(radius * UV_HALF, UV_HALF);
    const { shader, u } = makeShader('planet', FRAGMENT, {
      uTime: { value: 0, type: 'f32' },
      uPulse: { value: 0, type: 'f32' },
      uSeed: { value: (seed % 10007) / 10007, type: 'f32' },
      uTerraform: { value: 0, type: 'f32' },
      uClouds: { value: 0, type: 'f32' },
      uLights: { value: 0, type: 'f32' },
      uBands: { value: 0, type: 'f32' },
      uGrid: { value: 0, type: 'f32' },
      uDormant: { value: 0, type: 'f32' },
      uGhost: { value: 0, type: 'f32' },
      uNeutral: { value: 0, type: 'f32' },
      uLightDir: { value: new Float32Array([-1, -0.4, 0.6]), type: 'vec3<f32>' },
      uSignal: { value: new Float32Array(rgb(RUNG_COLOR.ready)), type: 'vec3<f32>' },
      uSignalAmt: { value: 0.3, type: 'f32' },
      uFringe: { value: 0, type: 'f32' },
      uSketch: { value: 0, type: 'f32' },
      uActivity: { value: 0, type: 'f32' },
      uBeat: { value: 2.4, type: 'f32' },
    });
    this.u = u;
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    this.root.addChild(this.mesh);
  }

  setStage(stage: string): void {
    const s = planetStage(stage);
    Object.assign(this.u, {
      uTerraform: s.terraform, uClouds: s.clouds, uLights: s.lights, uBands: s.bands, uGrid: s.grid,
      uDormant: s.dormant, uGhost: s.ghost, uNeutral: s.neutral, uSketch: s.sketch, uSignalAmt: s.signalAmt,
      uFringe: s.fringe, uActivity: ACTIVITY[s.signal.rung], uBeat: beatOf(s.signal.rung),
    });
    (this.u.uSignal as Float32Array).set(rgb(RUNG_COLOR[s.signal.rung]));
    drawOffLadderMarks(this.marks, s.signal, this.radius, this.radius * 1.32);
  }

  /** Light comes from the star, which sits at the scene origin. */
  setLightFrom(starX: number, starY: number): void {
    const dx = starX - this.root.x;
    const dy = starY - this.root.y;
    const len = Math.hypot(dx, dy) || 1;
    const v = this.u.uLightDir as Float32Array;
    // The star sits behind the planets in the oblique view, so light arrives from above and slightly behind.
    v[0] = dx / len; v[1] = dy / len; v[2] = 0.3;
  }

  tick(seconds: number): void {
    this.u.uTime = seconds;
    this.u.uPulse = motion.pulseTime;
  }

  destroy(): void {
    const shader = this.mesh.shader;
    this.marks.destroy();
    this.root.destroy({ children: true });
    shader?.destroy();
    this.geometry.destroy();
  }
}

// 06 §7 anomaly (Bug) on the signal ladder (09 §4): the spiked silhouette is its identity (distinct
// from the planet sphere); its color changes entirely with the rung. Ready: a grey sensor wireframe
// (New: the wireframe alone; Ready: with a faint fill). Underway: blue turbulence with ripples at full strength. Nearing: contracting
// and violet, ripples slowing. Accomplished: sealed, the spikes folded into a still gold faceted knot.
import { Container, Graphics, Mesh, type Geometry, type Shader } from 'pixi.js';
import { NOISE } from './glsl';
import { drawOffLadderMarks } from './marks';
import { motion } from './motion';
import { ACTIVITY, beatOf, PROGRESS_GLSL, RUNG_COLOR, rgb, signalOf, type Signal } from './progress';
import { makeShader, quadGeometry } from './quad';

const UV_HALF = 2.2;

const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uTime;
uniform float uPulse; // the progress beat's clock: speeds up to 2× in fast playback (05 §5)
uniform float uSeed;
uniform float uIntensity;
uniform float uSize;
uniform float uWaves;
uniform float uSpike;
uniform float uSeal;
uniform float uSketch;
uniform float uWire;
uniform float uWireFill;
uniform float uGhost;
uniform float uActivity;
uniform float uBeat;
uniform vec3 uSignal;
${NOISE}
${PROGRESS_GLSL}
void main() {
  float d = length(vUV);
  float ang = atan(vUV.y, vUV.x);
  float act = uActivity;
  float spikes = 7.0;
  // The spikes turn and the outline wobbles only as much as the rung is active.
  float phase = ang * spikes * 0.5 + uTime * 0.24 * act + uSeed * 6.0;
  float spike = pow(abs(cos(phase)), 7.0);
  float wob = fbm3(vec3(cos(ang) * 2.0, sin(ang) * 2.0, uTime * 0.18 * act) + uSeed) - 0.5;
  float edge = uSize * (0.62 + 0.42 * spike * uSpike + 0.16 * wob * (1.0 - uSeal));
  // Sealed: a faceted knot, its outline a soft heptagon.
  float facet = floor((ang + 3.14159265) / 6.2831853 * spikes);
  float sector = fract((ang + 3.14159265) / 6.2831853 * spikes);
  float poly = uSize * 0.62 / cos((sector - 0.5) * 6.2831853 / spikes);
  edge = mix(edge, poly, uSeal);
  float inside = smoothstep(edge, edge - 0.05, d);
  // New: only the outline of the silhouette.
  float outline = smoothstep(edge - 0.12, edge - 0.04, d) * inside;
  inside = mix(inside, outline, uSketch);

  float turb = fbm(vec3(vUV * 2.6, uTime * 0.12 * (0.25 + act)) + uSeed * 3.0);
  vec3 dark = uSignal * 0.45;
  vec3 col = mix(dark, uSignal, smoothstep(0.3, 0.75, turb));
  col += mix(uSignal, vec3(1.0), 0.6) * pow(clamp(1.0 - d / max(edge, 0.01), 0.0, 1.0), 3.0) * uIntensity;
  // Facets catch the light differently (lit from the upper left), like a cut stone.
  float shade = 0.7 + 0.45 * hash31(vec3(facet, uSeed, 3.0)) * (0.6 + 0.4 * -sin(ang + 0.8));
  col = mix(col, uSignal * shade + vec3(1.0, 0.95, 0.8) * 0.18 * pow(1.0 - d / max(edge, 0.01), 2.0), uSeal);

  float outside = step(edge, d);
  float glow = exp(-(d - edge) * 3.5) * 0.45 * uIntensity * outside;
  // Ripples travel outward at the rung's beat: full when underway, lighter and quicker when nearing.
  float waves = uWaves * outside * smoothstep(edge + 1.1, edge, d) * pow(0.5 + 0.5 * sin(d * 16.0 - uPulse * 6.2831853 / uBeat), 8.0);

  vec3 outCol = col * inside * (0.35 + 0.75 * uIntensity) + uSignal * glow + uSignal * waves * 0.9;
  float a = clamp(inside * (0.5 + 0.5 * uIntensity) + glow + waves * 0.7, 0.0, 1.0);

  // Ready: a sensor wireframe of the anomaly, like a New world's sketch: grey contours tracing the
  // spiked silhouette at three sizes, and spokes out to each spike tip, breathing very slowly. New is
  // the wireframe alone; Ready adds a faint fill, its first solid form.
  if (uWire > 0.0) {
    float q = d / max(edge, 0.01);
    // Bold enough (several px at chart scale) that the paint pass keeps each line as its own stroke.
    float lw = 0.085 / max(uSize, 0.3);
    float contours = max(smoothstep(lw, lw * 0.4, abs(q - 1.0)), smoothstep(lw, lw * 0.4, abs(q - 0.55)) * 0.85);
    float spoke = smoothstep(0.075, 0.03, abs(sin(phase)) * d) * step(q, 1.0) * smoothstep(0.08, 0.25, q) * 0.9;
    float wire = max(contours, spoke);
    float fill = step(q, 1.0) * uWireFill;
    float breath = 0.88 + 0.12 * sin(uTime * 6.2831853 / 12.0);
    vec3 wireCol = LADDER_READY * (1.25 * wire + 0.3 * fill * (1.0 - wire)) * breath;
    float wireA = clamp(max(wire * 0.9, fill * 0.5), 0.0, 1.0) * breath;
    outCol = mix(outCol, wireCol, uWire);
    a = mix(a, wireA, uWire);
  }

  float lum = dot(outCol, vec3(0.3, 0.59, 0.11));
  outCol = mix(outCol, vec3(lum) * vec3(0.75, 0.85, 1.0), uGhost * 0.85);
  a *= 1.0 - uGhost * 0.6;
  outCol *= 1.0 - uGhost * 0.6;
  finalColor = vec4(outCol, a) * uColor.a;
}
`;

/** Rung → size, intensity, ripples, spikes, and seal (09 §4). */
export function anomalyStage(stage: string): { intensity: number; size: number; waves: number; spike: number; seal: number; sketch: number; wire: number; wireFill: number; ghost: number; signal: Signal } {
  const signal = signalOf(stage);
  const b = { intensity: 0.4, size: 0.72, waves: 0, spike: 1, seal: 0, sketch: 0, wire: 0, wireFill: 0, ghost: 0, signal };
  switch (signal.rung) {
    case 'ready': return { ...b, intensity: 0.28, size: 0.8, wire: 1, wireFill: signal.sketch ? 0 : 0.6 };
    case 'underway': return { ...b, intensity: 1, size: 1, waves: 1 };
    case 'nearing': return { ...b, intensity: 0.75, size: 0.62 - 0.08 * (signal.step ?? 0.5), waves: 0.55, spike: 0.8 };
    case 'accomplished': return { ...b, intensity: 0.6, size: 0.6, spike: 0.15, seal: 1 };
    default: return { ...b, intensity: 0.3, size: 0.6, ghost: signal.unknown ? 0.6 : 1 };
  }
}

export class AnomalyView {
  readonly root = new Container();
  private readonly mesh: Mesh<Geometry, Shader>;
  /** Off-ladder marks, drawn crisp outside the paint pass: the scene places them over the body. */
  readonly marks = new Graphics();
  private readonly geometry: Geometry;
  private readonly u: Record<string, unknown>;

  constructor(private readonly radius: number, seed: number) {
    this.geometry = quadGeometry(radius * UV_HALF, UV_HALF);
    const { shader, u } = makeShader('anomaly', FRAGMENT, {
      uTime: { value: 0, type: 'f32' },
      uPulse: { value: 0, type: 'f32' },
      uSeed: { value: (seed % 7919) / 791.9, type: 'f32' },
      uIntensity: { value: 0.5, type: 'f32' },
      uSize: { value: 0.8, type: 'f32' },
      uWaves: { value: 0, type: 'f32' },
      uSpike: { value: 1, type: 'f32' },
      uSeal: { value: 0, type: 'f32' },
      uSketch: { value: 0, type: 'f32' },
      uWire: { value: 0, type: 'f32' },
      uWireFill: { value: 0, type: 'f32' },
      uGhost: { value: 0, type: 'f32' },
      uActivity: { value: 0, type: 'f32' },
      uBeat: { value: 2.4, type: 'f32' },
      uSignal: { value: new Float32Array(rgb(RUNG_COLOR.ready)), type: 'vec3<f32>' },
    });
    this.u = u;
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    this.root.addChild(this.mesh);
  }

  setStage(stage: string): void {
    const s = anomalyStage(stage);
    Object.assign(this.u, {
      uIntensity: s.intensity, uSize: s.size, uWaves: s.waves, uSpike: s.spike, uSeal: s.seal, uSketch: s.sketch, uWire: s.wire, uWireFill: s.wireFill,
      uGhost: s.ghost, uActivity: ACTIVITY[s.signal.rung], uBeat: beatOf(s.signal.rung),
    });
    (this.u.uSignal as Float32Array).set(rgb(RUNG_COLOR[s.signal.rung]));
    drawOffLadderMarks(this.marks, s.signal, this.radius, this.radius * 1.5);
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

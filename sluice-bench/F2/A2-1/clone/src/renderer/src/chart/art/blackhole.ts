// The empty cosmos (decided 2026-10-07): a lonely, vast black hole, the galaxy scene before any
// project is chosen. A true-black event horizon; a thin photon ring; the accretion disc crossing in
// front, its far side lensed up and over the shadow as a halo; swirls of light and dark woven
// through it, and glittering specks drawn inward. Ambient only (05 §5): it encodes nothing.
// Screen-anchored like the hero aura; drawn with normal (premultiplied) blending, so the horizon is
// genuinely black over the nebula.
import { Container, Mesh, type Geometry, type Shader } from 'pixi.js';
import { NOISE } from './glsl';
import { makeShader, quadGeometry } from './quad';

const UV_HALF = 1.25;

const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uTime;
uniform float uSeed;
${NOISE}
const float HORIZON = 0.30;
void main() {
  vec2 p = vUV;
  float r = length(p);
  if (r > 1.22) { finalColor = vec4(0.0); return; }
  float ang = atan(p.y, p.x);
  float t = uTime * 6.2831853 / 48.0; // the 48 s tempo (06 §7)

  // The disc, seen nearly edge-on: a thin ellipse crossing the middle.
  vec2 q = vec2(p.x, p.y / 0.2);
  float dr = length(q);
  float dang = atan(q.y, q.x);
  float band = smoothstep(0.34, 0.44, dr) * (1.0 - smoothstep(0.82, 1.2, dr));
  // Matter spirals in: swirls of light, with dark lanes woven through.
  vec2 swirl = vec2(dang * 1.7 - log(dr + 0.02) * 3.4 + t * 2.0, dr * 5.0);
  float light = fbm(vec3(swirl, uSeed));
  float lanes = smoothstep(0.35, 0.65, fbm(vec3(swirl * 1.9 + 7.0, uSeed + 2.0)));
  float glitter = smoothstep(0.78, 0.95, fbm(vec3(q * 24.0 + vec2(t * 3.0, 0.0), uSeed + 9.0)));
  // Doppler beaming: the side turning toward us burns brighter.
  float beam = 0.8 + 0.35 * (-p.x / max(r, 0.001));
  vec3 hot = mix(IVORY, AMBER, smoothstep(0.42, 0.7, dr));
  vec3 cool = mix(AMBER, COBALT, 0.65);
  vec3 discCol = mix(hot, cool, smoothstep(0.55, 1.05, dr)) * (0.35 + 1.1 * light) * (0.45 + 0.55 * lanes) * beam;
  discCol += IVORY * glitter * 0.9;
  float disc = band * (0.55 + 0.45 * light);

  // The far side of the disc, bent up over (and under) the shadow by the hole's gravity: a halo.
  // Strongest over the top (the far disc's image), thinner beneath (its secondary image).
  float over = 0.55 + 0.45 * smoothstep(0.2, -0.6, p.y / max(r, 0.001));
  float halo = (exp(-pow((r - 0.37) / 0.045, 2.0)) * 0.7 + exp(-pow((r - 0.46) / 0.13, 2.0)) * 0.32) * over;
  float haloSwirl = fbm(vec3(ang * 2.2 + t * 1.2, r * 9.0, uSeed + 3.0));
  halo *= (0.5 + 0.85 * haloSwirl) * (0.85 + 0.25 * (-p.x / max(r, 0.001)));
  vec3 haloCol = mix(AMBER, IVORY, 0.35) * halo + VIOLET * 0.25 * halo * (1.0 - haloSwirl);
  // The photon ring: a hairline of light at the edge of the shadow.
  float ring = exp(-pow((r - HORIZON - 0.008) / 0.0035, 2.0)) * 0.55;

  vec3 col = haloCol + IVORY * ring;
  // The near half of the disc passes in front of the shadow; the far half is hidden behind it.
  bool front = p.y > 0.0;
  float inside = 1.0 - smoothstep(HORIZON - 0.004, HORIZON + 0.004, r);
  float discShown = disc * (front ? 1.0 : 1.0 - inside);
  col = col * (1.0 - inside) + discCol * discShown;
  // A faint dark well around it, so the nebula sinks toward the hole.
  float well = (1.0 - smoothstep(HORIZON, 1.15, r)) * 0.55;

  col = 1.0 - exp(-col * 1.25);
  float lum = clamp(max(max(col.r, col.g), col.b) * 1.3, 0.0, 1.0);
  float a = clamp(max(lum, max(inside * (front ? 1.0 - discShown : 1.0), well)), 0.0, 1.0);
  a *= 1.0 - smoothstep(1.1, 1.22, r);
  finalColor = vec4(col * a, a) * uColor.a;
}
`;

export class BlackHoleView {
  readonly root = new Container({ label: 'blackHole' });
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly geometry: Geometry;
  private readonly u: Record<string, unknown>;

  /** `radius`: the drawn half-size in screen px (the disc spans about the full width). */
  constructor(radius: number, seed = 0.37) {
    this.geometry = quadGeometry(radius * UV_HALF, UV_HALF);
    const { shader, u } = makeShader('blackhole', FRAGMENT, {
      uTime: { value: 0, type: 'f32' },
      uSeed: { value: seed, type: 'f32' },
    });
    this.u = u;
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    this.root.addChild(this.mesh);
  }

  setStage(): void {}

  tick(seconds: number): void {
    this.u.uTime = seconds;
  }

  destroy(): void {
    const shader = this.mesh.shader;
    this.root.destroy({ children: true });
    shader?.destroy();
    this.geometry.destroy();
  }
}

// 06 §7-style procedural spiral galaxy for the galaxy scene: one per pinned project.
import { Container, Mesh, type Geometry, type Shader } from 'pixi.js';
import { NOISE } from './glsl';
import { makeShader, quadGeometry } from './quad';

const UV_HALF = 1.2;

const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uTime;
uniform float uSeed;
${NOISE}
void main() {
  // Tilted disk to match the oblique chart (06 §3).
  vec2 p = vec2(vUV.x, vUV.y / 0.55);
  float r = length(p);
  if (r > 1.15) { finalColor = vec4(0.0); return; }
  // Tempo (06 §7 motion): the disc swirls, and the arm pattern repeats every 48 s (one arm's worth
  // of turn). Dust and stars turn with the arms; light flows in along each arm on the same loop.
  float arms = 2.0 + floor(fract(uSeed * 7.0) * 2.0);
  float turn = uTime * 6.2831853 / (48.0 * arms);
  float ang = atan(p.y, p.x) + turn;
  float spiral = ang * arms - log(r + 0.05) * 4.2;
  float arm = pow(0.5 + 0.5 * cos(spiral + uSeed * 6.28), 3.0);
  arm *= 0.8 + 0.2 * sin(log(r + 0.05) * 7.0 + uTime * 6.2831853 / 48.0);
  float cs = cos(turn), sn = sin(turn);
  vec2 q = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y); // disc space, turning with the arms
  float dust = fbm(vec3(q * 4.0, uSeed));
  float stars = smoothstep(0.62, 0.9, fbm(vec3(q * 18.0, uSeed + 4.0)));
  float disk = exp(-r * 2.6);
  float core = exp(-r * 9.0);

  vec3 hueA = mix(COBALT, VIOLET, fract(uSeed * 3.0));
  vec3 col = hueA * arm * (0.55 + 0.6 * dust) * disk * 2.4;
  col += mix(AMBER, IVORY, 0.4) * core * 2.2;
  col += CYAN * 0.35 * arm * stars * disk * 2.0;
  col += IVORY * stars * 0.5 * disk;
  col *= 1.0 - smoothstep(0.9, 1.15, r);
  col = 1.0 - exp(-col * 1.4);
  float a = clamp(max(max(col.r, col.g), col.b) * 1.2, 0.0, 1.0);
  finalColor = vec4(col, a) * uColor.a;
}
`;

export class GalaxyView {
  readonly root = new Container();
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly geometry: Geometry;
  private readonly u: Record<string, unknown>;

  constructor(radius: number, seed: number) {
    this.geometry = quadGeometry(radius * UV_HALF, UV_HALF);
    const { shader, u } = makeShader('galaxy', FRAGMENT, {
      uTime: { value: 0, type: 'f32' },
      uSeed: { value: (seed % 8191) / 819.1, type: 'f32' },
    });
    this.u = u;
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    this.mesh.blendMode = 'add';
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

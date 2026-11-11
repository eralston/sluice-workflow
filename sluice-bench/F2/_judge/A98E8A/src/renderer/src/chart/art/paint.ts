// The painterly pass (09 §7): make the chart read as a moving oil painting without costing smoothness.
//
// - PaintFilter: a generalized Kuwahara filter (four overlapping sectors, softly weighted by their
//   variance, after Papari et al.), which flattens detail into strokes of color with crisp edges; then
//   a faint brush-direction streak and a warm-highlight, cool-shadow glaze (Bonestell's thin oil
//   glazes over strongly raked light). It's used only on the "painted universe" (06 §1 layer rule):
//   baked once into each sky, and live over the celestial bodies at a small radius. Chart lines, the
//   reticle, mechanical art, and DOM labels stay crisp.
// - ImpastoFilter: lights the paint's ridges from the key light, so strokes read as raised paint and
//   small craft get a warm rim and a cool shadow edge (also used, lightly, on mechanical art).
// - CanvasTooth: one screen-space tiling texture of canvas weave over the whole picture, so painted
//   and crisp layers sit on the same surface. One quad, baked once.
import { Container, defaultFilterVert, Filter, GlProgram, Mesh, Renderer, Texture, TilingSprite, UniformGroup } from 'pixi.js';
import { NOISE } from './glsl';
import { makeShader, quadGeometry } from './quad';

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
// highp to match the vertex shader's declaration: a precision mismatch fails to link (and renders nothing).
uniform highp vec4 uInputSize;
uniform float uRadius;
uniform float uSharp;
uniform float uStreak;
uniform float uGlaze;
uniform float uBands;
${NOISE}
const int MAX_R = 4;
float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
void main() {
  vec2 px = uInputSize.zw;
  vec4 mean[4];
  float var[4];
  // Four overlapping square sectors around the pixel. A high uSharp makes each pixel take (almost)
  // the calmest sector's mean: flat patches of color with hard edges, like loaded brush strokes,
  // rather than a soft blend.
  for (int k = 0; k < 4; k++) {
    vec2 dir = vec2(k == 0 || k == 3 ? -1.0 : 1.0, k < 2 ? -1.0 : 1.0);
    vec4 sum = vec4(0.0);
    float sumL = 0.0;
    float sumL2 = 0.0;
    float n = 0.0;
    for (int j = 0; j <= MAX_R; j++) {
      if (float(j) > uRadius) break;
      for (int i = 0; i <= MAX_R; i++) {
        if (float(i) > uRadius) break;
        vec4 c = texture(uTexture, vTextureCoord + vec2(float(i), float(j)) * dir * px);
        float l = luma(c.rgb);
        sum += c;
        sumL += l;
        sumL2 += l * l;
        n += 1.0;
      }
    }
    mean[k] = sum / n;
    float m = sumL / n;
    var[k] = max(sumL2 / n - m * m, 0.0);
  }
  vec4 col = vec4(0.0);
  float wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    float w = 1.0 / (1.0 + pow(var[k] * 1500.0, uSharp));
    col += mean[k] * w;
    wsum += w;
  }
  col /= wsum;

  if (col.a > 0.001) {
    vec3 rgb = col.rgb / col.a; // un-premultiply to tone
    // Strokes follow the form: the streak runs along the image's contours (perpendicular to its
    // luminance gradient), the way a painter drags the brush around a sphere or along a swirl.
    vec2 p = vTextureCoord * uInputSize.xy;
    float lx = luma(texture(uTexture, vTextureCoord + vec2(2.0, 0.0) * px).rgb) - luma(texture(uTexture, vTextureCoord - vec2(2.0, 0.0) * px).rgb);
    float ly = luma(texture(uTexture, vTextureCoord + vec2(0.0, 2.0) * px).rgb) - luma(texture(uTexture, vTextureCoord - vec2(0.0, 2.0) * px).rgb);
    vec2 g = vec2(lx, ly);
    float th = 0.6 + 2.2 * vnoise(vec3(p * 0.006, 4.2)); // where the image is flat, a wandering stroke
    vec2 t = length(g) > 0.01 ? normalize(vec2(-g.y, g.x)) : vec2(cos(th), sin(th));
    vec2 q = vec2(dot(p, t), dot(p, vec2(-t.y, t.x)));
    float streak = vnoise(vec3(q.x * 0.045, q.y * 0.42, 1.7)) - 0.5;
    rgb *= 1.0 + streak * uStreak;
    // Planes of value, as in gouache: luminance pulled toward a few steps.
    float l = luma(rgb);
    // Never in the darks: stepping near-black space crushes it into ragged black blots.
    float stepped = floor(l * 7.0 + 0.5) / 7.0;
    rgb *= mix(1.0, (stepped + 0.02) / (l + 0.02), uBands * smoothstep(0.1, 0.25, l));
    // Glaze: warm the lights, cool the shadows.
    l = luma(rgb);
    rgb = mix(rgb, rgb * vec3(0.88, 0.95, 1.14), uGlaze * (1.0 - smoothstep(0.1, 0.5, l)));
    rgb = mix(rgb, rgb * vec3(1.07, 1.0, 0.88), uGlaze * smoothstep(0.55, 0.95, l));
    col.rgb = rgb * col.a;
  }
  finalColor = col;
}
`;

export interface PaintOptions { radius: number; sharp?: number; streak?: number; glaze?: number; bands?: number }

export class PaintFilter extends Filter {
  constructor({ radius, sharp = 6, streak = 0.2, glaze = 0.6, bands = 0.35 }: PaintOptions) {
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: FRAGMENT, name: 'paint-filter' }),
      resources: {
        // A real UniformGroup: Pixi 8.21 doesn't bind a plain object here (the filter renders nothing).
        paintUniforms: new UniformGroup({
          uRadius: { value: radius, type: 'f32' },
          uSharp: { value: sharp, type: 'f32' },
          uStreak: { value: streak, type: 'f32' },
          uGlaze: { value: glaze, type: 'f32' },
          uBands: { value: bands, type: 'f32' },
        }),
      },
      padding: Math.ceil(radius) + 3,
    });
  }
}

const IMPASTO_FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uStrength;
uniform float uReach;
float height(vec4 c) { return dot(c.rgb, vec3(0.3, 0.59, 0.11)) + c.a * 0.35; }
void main() {
  vec2 px = uInputSize.zw * uReach;
  vec4 c = texture(uTexture, vTextureCoord);
  // Treat the paint as a height field (brighter and more opaque = thicker paint) and light its ridges
  // from the upper left, the chart's key light: strokes and silhouettes catch a warm edge on one
  // side and a cool shadow on the other, like impasto under a gallery lamp.
  float hx = height(texture(uTexture, vTextureCoord + vec2(px.x, 0.0))) - height(texture(uTexture, vTextureCoord - vec2(px.x, 0.0)));
  float hy = height(texture(uTexture, vTextureCoord + vec2(0.0, px.y))) - height(texture(uTexture, vTextureCoord - vec2(0.0, px.y)));
  // Faint ridges (noise in dark space) don't catch light; only real strokes and edges do.
  float slope = -(hx * 0.62 + hy * 0.78);
  float lit = clamp(sign(slope) * max(abs(slope) - 0.012, 0.0) * 1.4, -1.0, 1.0) * uStrength;
  vec3 warm = vec3(1.0, 0.94, 0.82);
  vec3 cool = vec3(0.10, 0.12, 0.30);
  float up = max(lit, 0.0);
  float down = max(-lit, 0.0);
  // Highlights add warm light (premultiplied, so scaled by coverage); shadows darken toward cool ink.
  vec3 rgb = c.rgb + warm * up * c.a - c.rgb * down * 0.85 + cool * down * 0.35 * c.a;
  finalColor = vec4(max(rgb, 0.0), c.a);
}
`;

/** Impasto: lights the ridges of the paint (and silhouette edges) from the key light. Five taps. */
export class ImpastoFilter extends Filter {
  constructor(strength = 0.6, reach = 1.5) {
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: IMPASTO_FRAGMENT, name: 'impasto-filter' }),
      resources: {
        impastoUniforms: new UniformGroup({
          uStrength: { value: strength, type: 'f32' },
          uReach: { value: reach, type: 'f32' },
        }),
      },
      padding: 3,
    });
  }
}

const TOOTH_FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
${NOISE}
void main() {
  // Plain-weave canvas: two thread directions, each thread's thickness wandering a little, plus a
  // fine tooth of noise. Output is premultiplied: dark and light specks around transparent.
  vec2 p = (vUV * 0.5 + 0.5) * 256.0;
  float warp = sin(p.x * 1.571 + vnoise(vec3(p * 0.05, 1.0)) * 2.0);
  float weft = sin(p.y * 1.571 + vnoise(vec3(p * 0.05, 7.0)) * 2.0);
  float over = step(0.0, sin(p.x * 0.785) * sin(p.y * 0.785));
  float thread = mix(warp, weft, over) * 0.5 + 0.5;
  float tooth = vnoise(vec3(p * 0.9, 3.0)) - 0.5;
  float v = (thread - 0.5) * 0.7 + tooth * 0.6;
  float dark = max(-v, 0.0);
  float light = max(v, 0.0);
  float a = dark * 0.5 + light * 0.22;
  vec3 c = vec3(0.96, 0.92, 0.84) * light * 0.22;
  finalColor = vec4(c, a);
}
`;

/** A screen-space canvas weave over the whole picture. Strength is its alpha (default subtle). */
export class CanvasTooth {
  readonly root: TilingSprite;
  private readonly texture: Texture;

  constructor(renderer: Renderer, strength = 0.16) {
    const { shader } = makeShader('canvas-tooth', TOOTH_FRAGMENT, {});
    const geometry = quadGeometry(1, 1);
    const mesh = new Mesh({ geometry, shader });
    mesh.scale.set(128, 128);
    mesh.position.set(128, 128);
    const holder = new Container();
    holder.addChild(mesh);
    this.texture = renderer.generateTexture({ target: holder, resolution: 1 });
    holder.destroy({ children: true });
    geometry.destroy();
    shader.destroy();
    this.root = new TilingSprite({ texture: this.texture, width: 1, height: 1 });
    this.root.label = 'canvasTooth';
    this.root.alpha = strength;
    this.root.eventMode = 'none';
  }

  resize(width: number, height: number): void {
    this.root.width = width;
    this.root.height = height;
  }

  destroy(): void {
    this.root.destroy();
    this.texture.destroy(true);
  }
}

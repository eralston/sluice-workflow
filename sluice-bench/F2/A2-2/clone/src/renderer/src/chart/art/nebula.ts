// 06 §7 backdrop, one style per scene level so a zoom reads as travelling inward (06 §2):
//   galaxy  — intergalactic dark crossed by one broad, dim arc of gas (no spirals to mistake for projects);
//   sector  — inside a galactic disc: a band of star clouds and dust lanes, faint nebulae;
//   feature — deep in a nebula: domain-warped fBm through the palette ramp (the original look);
//   body    — close to a planet: a sparse starry sky with a few distant asteroids and comets.
// Baked to a texture per (level, seed, size); nothing in it animates (05 §5).
import { Container, Mesh, Renderer, Sprite, Texture } from 'pixi.js';
import { NOISE } from './glsl';
import { ImpastoFilter, PaintFilter } from './paint';
import { makeShader, quadGeometry } from './quad';

export type BackdropLevel = 'galaxy' | 'sector' | 'feature' | 'body';
const MODE: Record<BackdropLevel, number> = { galaxy: 0, sector: 1, feature: 2, body: 3 };

const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform float uSeed;
uniform float uAspect;
uniform float uMode;
/** 0: everything; 1: the paint layer (no stars); 2: stars only, for adding crisp over the paint. */
uniform float uLayer;
${NOISE}
const float TAU = 6.2831853;
float h1(float i, float k) { return hash31(vec3(i * 7.13 + k, uSeed, k * 3.7)); }

// Stars: one per cell above a rarity threshold (higher threshold = sparser sky).
float starField(vec2 uv, float density, float size, float rarity) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density) - 0.5;
  float h = hash31(vec3(cell, uSeed));
  if (h < rarity) return 0.0;
  vec2 off = vec2(hash31(vec3(cell, uSeed + 1.0)), hash31(vec3(cell, uSeed + 2.0))) - 0.5;
  float d = length(f - off * 0.7);
  return smoothstep(size, 0.0, d) * (h - rarity) / (1.0 - rarity);
}

// A broad arc of light and gas: the edge of a far galaxy's disc, seen as a sweep rather than a
// shape. Dust breaks it up; it stays dim so it never reads as something to click.
vec3 gasArc(vec2 p, vec2 c, float radius, float width) {
  float d = length(p - c) - radius;
  float gas = fbm(vec3(p * 1.4, uSeed + 11.0));
  float wisps = fbm(vec3(p * vec2(3.0, 1.6) + gas * 1.5, uSeed + 13.0));
  float band = exp(-(d * d) / (width * width));
  float halo = exp(-(d * d) / (width * width * 6.0));
  float dust = smoothstep(0.45, 0.72, fbm(vec3(p * 2.6, uSeed + 17.0)));
  float light = band * smoothstep(0.15, 0.7, gas) * (0.6 + 0.4 * wisps) * (1.0 - 0.6 * dust);
  return mix(COBALT, VIOLET, wisps) * (light * 0.45 + halo * 0.09) + mix(IVORY, AMBER, 0.5) * pow(light, 3.0) * 0.12;
}

vec3 nebula(vec2 p, out float n) {
  vec3 q = vec3(p, uSeed);
  float w1 = fbm(q * 1.1);
  float w2 = fbm(q * 1.1 + vec3(w1 * 2.2, w1 * 1.4, 0.0) + vec3(5.2, 1.3, 0.0));
  n = fbm(q * 1.5 + vec3(w2 * 2.6, w2 * 1.9, 0.3));
  vec3 col = INK * 0.9;
  col = mix(col, COBALT * 0.8, smoothstep(0.36, 0.78, n));
  col = mix(col, VIOLET * 0.9, smoothstep(0.46, 0.86, w2) * 0.8);
  col += AMBER * 0.22 * pow(smoothstep(0.58, 0.95, n * w1 * 1.7), 2.0);
  col += CYAN * 0.10 * pow(smoothstep(0.55, 0.92, w1), 3.0);
  col *= 0.68 + 0.32 * smoothstep(0.25, 0.62, fbm(q * 3.2 + 7.0)); // dark dust lanes
  float streak = vnoise(vec3(p.x * 2.5 + p.y * 7.0, p.y * 1.3 - p.x * 0.4, uSeed + 3.0));
  return col * (0.9 + 0.2 * streak); // painterly brush streaks
}

// A distant rock, lit from above like everything else (06 §7): lumpy outline, cratered shading.
vec3 asteroid(vec2 p, vec2 c, float size, float seed, inout float cover) {
  vec2 d = (p - c) / size;
  float len = length(d);
  if (len > 1.6) return vec3(0.0);
  float lump = 1.0 + 0.35 * (vnoise(vec3(normalize(d + 1e-4) * 1.6, seed)) - 0.5) + 0.12 * (vnoise(vec3(d * 3.0, seed + 4.0)) - 0.5);
  float inside = smoothstep(lump, lump - 0.12, len);
  float light = clamp(0.55 - d.y * 0.55 - d.x * 0.2, 0.0, 1.0);
  float crater = smoothstep(0.35, 0.65, vnoise(vec3(d * 4.5, seed + 9.0)));
  vec3 rock = mix(vec3(0.16, 0.15, 0.15), vec3(0.72, 0.66, 0.56), light) * (0.75 + 0.25 * crater);
  cover = max(cover, inside);
  return rock * inside;
}

// A comet: a bright head and a tail that streams away from its direction of travel.
vec3 comet(vec2 p, vec2 head, vec2 dir, float len, float seed) {
  vec2 q = p - head;
  float along = dot(q, -dir);
  float across = dot(q, vec2(-dir.y, dir.x));
  float width = 0.004 + max(along, 0.0) * 0.09;
  float tail = step(0.0, along) * exp(-along / len) * exp(-(across * across) / (width * width));
  tail *= 0.75 + 0.25 * vnoise(vec3(along * 40.0, across * 200.0, seed));
  float glow = exp(-dot(q, q) / 0.00012);
  // Pale blue, desaturated toward the sky: noticeable, but quieter than anything clickable.
  vec3 ice = mix(mix(CYAN, IVORY, 0.25), COBALT, 0.35);
  return ice * tail * 0.45 + mix(ice, IVORY, 0.3) * glow * 0.7;
}

void main() {
  vec2 p = vUV * vec2(uAspect, 1.0);
  vec2 sp = p; // star space
  vec3 col;
  float stars;
  vec3 starCol = vec3(0.0);

  if (uMode < 0.5) {
    // Galaxy: near-black intergalactic space crossed by one broad, dim arc of gas from the left
    // (the inspector covers the right). No spirals: the projects are the only galaxies to click.
    col = INK * 0.55 + COBALT * 0.04 * fbm(vec3(p * 0.8, uSeed));
    float side = h1(1.0, 0.0) < 0.5 ? -1.0 : 1.0;
    col += gasArc(p, vec2(-uAspect * 1.15, side * 1.9), 2.15 + 0.15 * h1(2.0, 0.0), 0.36);
    stars = starField(sp, 160.0, 0.16, 0.985) * 0.6 + starField(sp + 3.1, 70.0, 0.11, 0.99);
    starCol += mix(IVORY, CYAN, 0.3) * stars * 0.9;
  } else if (uMode < 1.5) {
    // Sector: a diagonal band of the galactic disc, thick with faint stars and split by dust.
    float tiltA = -0.35 + 0.25 * (h1(1.0, 0.0) - 0.5);
    vec2 nrm = vec2(-sin(tiltA), cos(tiltA));
    float b = dot(p, nrm) + 0.15 * (fbm(vec3(p * 0.9, uSeed + 2.0)) - 0.5);
    float band = exp(-b * b * 5.0);
    float clouds = fbm(vec3(p * 2.2, uSeed + 5.0));
    float dust = smoothstep(0.42, 0.7, fbm(vec3(p * vec2(1.6, 4.0) + vec2(b * 6.0, 0.0), uSeed + 8.0)));
    float neb;
    vec3 mist = nebula(p * 0.8, neb);
    col = mix(INK * 0.7, mist, 0.35);
    col += mix(COBALT, IVORY, 0.25) * band * clouds * 0.45;
    col += AMBER * 0.08 * band * smoothstep(0.55, 0.85, clouds);
    col *= 1.0 - 0.55 * band * dust;
    stars = starField(sp, 260.0, 0.2, mix(0.975, 0.86, band)) * 0.55 + starField(sp + 3.1, 100.0, 0.12, 0.975);
    starCol += mix(IVORY, CYAN, 0.3) * stars * (0.6 + 0.6 * band) * (1.0 - 0.6 * dust * band);
  } else if (uMode < 2.5) {
    // Star system: inside a nebula.
    float n;
    col = nebula(p * 1.15, n);
    stars = starField(sp, 220.0, 0.18, 0.965) * 0.55 + starField(sp + 3.1, 90.0, 0.12, 0.965);
    starCol += mix(IVORY, CYAN, 0.3) * stars * (0.5 + 0.8 * n);
  } else {
    // Planet close-up: a sparse, clear sky, a breath of color, distant rocks and comets.
    col = INK * 0.7 + COBALT * 0.06 * smoothstep(0.2, 0.8, fbm(vec3(p * 0.7, uSeed)));
    stars = starField(sp, 120.0, 0.13, 0.975) + starField(sp + 3.1, 45.0, 0.09, 0.985) * 1.2;
    starCol += mix(IVORY, CYAN, 0.25) * stars;
    float cover = 0.0;
    vec3 rocks = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float fi = float(i) + 10.0;
      // Keep rocks to the outer band, away from the scene's content in the middle.
      float ang = h1(fi, 1.0) * TAU;
      float rad = 0.78 + 0.18 * h1(fi, 2.0);
      vec2 c = vec2(cos(ang) * uAspect, sin(ang)) * rad;
      if (c.x > 0.42 * uAspect) c.x = -c.x; // the inspector covers the right of the view
      rocks += asteroid(p, c, 0.008 + 0.014 * h1(fi, 3.0) * h1(fi, 4.0), uSeed + fi, cover);
    }
    col = mix(col, rocks, cover);
    for (int i = 0; i < 2; i++) {
      float fi = float(i) + 20.0;
      // Comets cross the top or bottom of the visible chart (left of the inspector), heading sideways.
      float top = h1(fi, 1.0) < 0.5 ? -1.0 : 1.0;
      vec2 head = vec2(mix(-0.8, 0.25, h1(fi, 2.0)) * uAspect, top * (0.8 + 0.1 * h1(fi, 6.0)));
      float travel = (h1(fi, 7.0) < 0.5 ? 0.0 : 3.14159) + top * (0.15 + 0.2 * h1(fi, 3.0)); // tail angles away from the edge
      if (float(i) < 1.0 || h1(fi, 5.0) > 0.45) col += comet(p, head, vec2(cos(travel), sin(travel)), 0.25 + 0.15 * h1(fi, 4.0), uSeed + fi);
    }
  }

  float v = smoothstep(1.75, 0.35, length(vUV * vec2(1.0, 1.15)));
  // Stars are a pixel or two wide, so the paint would smear them away: they're baked as a separate
  // crisp layer, added over the painted sky.
  if (uLayer > 1.5) { finalColor = vec4(starCol * mix(0.6, 1.0, v), 0.0); return; }
  if (uLayer < 0.5) col += starCol;
  col *= mix(0.6, 1.0, v); // vignette
  finalColor = vec4(col, 1.0);
}
`;

/** Bakes the backdrop into a texture slightly larger than the view, so parallax never shows edges. */
export class NebulaBackdrop {
  readonly root = new Container({ label: 'nebula' });
  private sprite: Sprite | null = null;
  private texture: Texture | null = null;
  private level: BackdropLevel = 'feature';
  private size = { width: 0, height: 0 };
  private baked = '';
  /** Paint baked into the sky (09 §7): free per frame, since the sky never changes while shown. */
  painted = true;

  constructor(private readonly renderer: Renderer, private seed: number) {}

  /** Switch style for a scene level and seed (same inputs, same sky); rebakes only on change. */
  setLevel(level: BackdropLevel, seed: number): void {
    this.level = level;
    this.seed = seed;
    this.bake();
  }

  resize(width: number, height: number): void {
    this.size = { width, height };
    this.bake();
  }

  private bake(): void {
    const { width, height } = this.size;
    const key = `${this.level}|${this.seed}|${width}x${height}|${this.painted}`;
    if (!width || !height || key === this.baked) return;
    this.baked = key;
    const w = Math.ceil(width * 1.12);
    const h = Math.ceil(height * 1.12);
    const layer = (n: number) => {
      const { shader } = makeShader('nebula', FRAGMENT, {
        uSeed: { value: (this.seed % 1000) / 37, type: 'f32' },
        uAspect: { value: w / h, type: 'f32' },
        uMode: { value: MODE[this.level], type: 'f32' },
        uLayer: { value: n, type: 'f32' },
      });
      const mesh = new Mesh({ geometry, shader });
      mesh.scale.set(w / 2, h / 2);
      mesh.position.set(w / 2, h / 2);
      return mesh;
    };
    const geometry = quadGeometry(1, 1);
    const holder = new Container();
    // Full resolution: painted strokes upscaled from half resolution read as blur, not paint.
    const resolution = 1;
    // Oil on canvas: big flat strokes following the swirls of gas, value planes, and lit ridges.
    const paint = this.painted ? [new PaintFilter({ radius: 4, sharp: 6, streak: 0.28, glaze: 0.5, bands: 0.32 }), new ImpastoFilter(0.85, 1.5)] : null;
    if (paint) {
      const sky = layer(1);
      sky.filters = paint;
      const stars = layer(2);
      stars.blendMode = 'add';
      holder.addChild(sky, stars);
    } else {
      holder.addChild(layer(0));
    }
    const texture = this.renderer.generateTexture({ target: holder, resolution, frame: undefined });
    for (const m of holder.children as Mesh[]) m.shader?.destroy();
    holder.destroy({ children: true });
    geometry.destroy();
    paint?.forEach((f) => f.destroy());

    this.texture?.destroy(true);
    this.texture = texture;
    if (!this.sprite) {
      this.sprite = new Sprite(texture);
      this.root.addChild(this.sprite);
    } else {
      this.sprite.texture = texture;
    }
    this.sprite.width = w;
    this.sprite.height = h;
    this.sprite.position.set(-(w - width) / 2, -(h - height) / 2);
  }

  setPainted(on: boolean): void {
    this.painted = on;
    this.bake();
  }

  /** Shallow parallax from camera position (06 §4). */
  parallax(dx: number, dy: number): void {
    this.root.position.set(dx, dy);
  }

  textureCount(): number {
    return this.texture ? 1 : 0;
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.texture?.destroy(true);
    this.texture = null;
  }
}

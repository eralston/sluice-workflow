// A gently lit outline in one colour (2026-10-12): a soft glow that hugs an object's own silhouette, so
// a glance says what the object is *for* before what state it is in. State stays in the object's form
// and in the signal ladder's light (09). The aura has only two colours per object: its role colour
// for as long as the work is open, wireframe contact included, and victory gold (the ladder's own
// Accomplished gold) once it's done. Nothing in between, so hue never says "how far along" (INV-20:
// the forms differ too; hue is never alone).
//
// It is built from the same baked silhouette the art already draws: copies of its Graphics contexts,
// flattened to the aura colour by a colour matrix (every pixel takes the source's alpha), and laid
// behind the hull. Two parts:
// - the **rim**: the silhouette copied at eight small offsets round it, so a crisp band of the colour
//   shows just outside the hull's own edge. Its width is fixed on screen (RIM_PX), so however far out
//   the camera is, the object keeps a faithful outline in its colour (the minimum draw, 2026-10-12).
// - the **glow**: the silhouette blurred; the caller breathes it.
// One weight for every role (19 S1, 2026-10-14): the aura reads its own scale on screen each frame, so
// the rim is RIM_PX for an asteroid and a hive ship alike, at every zoom and in the gallery too, and the
// glow's reach is a share of the silhouette's size on screen between one minimum and one maximum.
// Before, each art passed its own spread in its own units, and only the hive told the aura its zoom:
// an asteroid's rim measured 0.3 px at the fit against the hive's 2 px, and a hive's blur 43 px.
// Normally it sits behind the hull, which covers its inside. An `outside` aura is for art whose body is
// painted (an asteroid's rock): the paint pass would smear a thin rim away, so the aura goes in the
// crisp marks layer, over the body, and erases its own inside so only the outline shows.
// Baked (27 C3, the `auraBake` profile switch): the outline's filter chains cost ~400 offscreen passes a frame on a dense pod,
// so an `outside` aura keeps its glow, keyline and rim each in a plain container cached as a texture at one texel per screen
// pixel, and draws three sprites. They are re-baked when the colour, the flare or the scale on screen (>2%) changes, never
// for alpha (the breath). With the switch off it is the live filters, as before.
import { AlphaFilter, BlurFilter, ColorMatrixFilter, Container, Graphics, GraphicsContext, Matrix } from 'pixi.js';
import { activeProfile, onProfile } from '../../profile';
import { SUCCESS } from './progress';

/**
 * The role colours, for the objects that wear an aura: each is the colour Azure DevOps paints that work
 * item type in its web app, so the chart primes the same reading (2026-10-12). The rest are proposals.
 */
export const AURA = {
  /** Enemies, "deadly red", whatever their swarm or colourway: ADO's Bug colour, rgb(204, 41, 61). */
  threat: 0xcc293d,
  /** Asteroids, "opportunity blue", whatever their material: ADO's User Story colour, rgb(0, 156, 204). */
  objective: 0x009ccc,
  /** Anything finished, "victory gold": the signal ladder's Accomplished gold (progress.ts SUCCESS). */
  accomplished: SUCCESS,
} as const;

/** A baked silhouette: its context and where it sits. */
export interface Silhouette { ctx: GraphicsContext; dx: number; dy: number }

/** The rim's width on screen, in pixels, at every zoom, for every role. */
export const RIM_PX = 2;
/**
 * The keyline (23 C1): a dark band just outside the rim, so the rim's neighbour is dark whatever is behind the piece
 * (a lit planet's face, a nebula): this much wider than the rim again, on screen, at every zoom. It is copies of the
 * silhouette tinted the night sky's colour (KEY_COLOR) at KEYLINE_ALPHA, drawn between the glow and the rim with
 * Pixi's normal blend, so it reads as the outline's shadow edge, not a second mark. It adds no filter pass and no
 * offscreen group (it shares the rim's); 0 width or alpha turns it off.
 * What renders (checked in Pixi 8.21): a container with a filter composites by the *filter's* blend mode, so the
 * glow and rim, which are filtered, are laid over the scene normally (alpha over), not added, whatever their
 * container's blendMode says. The weights below were tuned on that.
 */
export const KEYLINE_PX = 2;
/** The keyline's opacity. */
export const KEYLINE_ALPHA = 0.85;
/** The night sky's colour, for the keyline (near the chart's ink). */
const KEY_COLOR = 0x050914;
/** The rim's least brightness: it never breathes away (the glow does). */
export const RIM_ALPHA = 0.8;
/**
 * Each role colour's resting weight on its aura's brightness, rim and glow alike (the filtered aura lays over the scene by
 * alpha, so this is its alpha). 19 S1 set them by eye (0.85, 1.1) from ΔE. 23 C1 measured WCAG 2 contrast on the
 * rendered pixels (tests/drive/steps/c1-contrast.ts; numbers in 15 §8): red was 2.3:1 against the night sky,
 * under the 3:1 floor, blue 3.9. Red is now 1.25 (4.7:1; its red channel meets the cap, so it can go no
 * higher), blue 1.04 (4.9, the same). Gold rested at 1 (9.6:1) until 27 B3, which sets it at 0.68 so it rests at red's
 * and blue's contrast; a victory flares it to AURA_FLARE_WEIGHT and it settles back (below). Retune one and re-run the
 * drive, then update tests/unit/auraContrast.test.ts.
 */
export const AURA_BALANCE = { threat: 1.25, objective: 1.04, accomplished: 0.68 } as const;
/** Gold's weight at the peak of a victory's flare (27 B3): the weight it rested at before, brighter than red and blue. */
export const AURA_FLARE_WEIGHT = 1;
/** How long a victory's flare takes to ease back to gold's resting weight, in ms (the close's land plus echo; 15 §10). */
export const AURA_FLARE_MS = 1600;
/** A flare's share at `u` (0..1 across AURA_FLARE_MS): 1 at the land, a brief hold, then a smoothstep ease to 0. */
export function flareShare(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return 1 - t * t * (3 - 2 * t);
}
/** The glow's reach (its blur, in screen px) as a share of the silhouette's size on screen (the root of its bounds' area). */
export const GLOW_SHARE = 0.08;
/** The least the glow reaches past the silhouette on screen, in pixels, however far out the camera is. */
export const GLOW_MIN_PX = 4;
/** The most the glow reaches on screen, in pixels, however close the camera is. */
export const GLOW_MAX_PX = 12;
/** Scratch for reading the aura's place on screen. */
const scratch = new Matrix();
/** The eight directions the rim's copies sit in. */
const RIM_DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);
/** Every aura alive, for the test hooks' readings (03 §10). */
const live = new Set<Aura>();
/** Which parts of every aura draw: the test hooks' toggle, so a still can measure the outline alone. */
/** `all` draws the keyline too; `unkeyed` is everything but the keyline (23 C1: show with and without it). */
export type AuraParts = 'all' | 'none' | 'rim' | 'glow' | 'unkeyed';

/** One aura as drawn now, for the test hooks (03 §10): where, its colour, its rim and blur on screen. */
export interface AuraReading { x: number; y: number; color: number; rimPx: number; blurPx: number; rimAlpha: number; glowAlpha: number }

/** Every aura drawn now (visible and attached), centred on its bounds, in canvas CSS px. */
export function auraReadings(): AuraReading[] {
  return [...live].filter((a) => a.root.visible && a.root.parent).map((a) => a.reading());
}

/** The highest flare share among live, visible, attached, gold auras under `root` (the gallery's reading; 27 B3), else 0. */
export function auraFlareIn(root: Container): number {
  let best = 0;
  for (const a of live) {
    if (!a.root.visible || !a.root.parent) continue;
    let p: Container | null = a.root;
    while (p && p !== root) p = p.parent;
    if (p) best = Math.max(best, a.flareNow());
  }
  return best;
}

/** Draw every aura's parts, or none (the test hooks; nothing in the app calls it). */
export function showAuras(parts: AuraParts): void {
  for (const a of live) a.show(parts);
}

// Every aura follows the profile's `auraBake` switch, whoever hosts it (the chart, the gallery, a test).
onProfile((p) => { for (const a of live) a.setBaked(p.render.switches.auraBake); });

export class Aura {
  /** The glow's blur now, in screen px. */
  private reach = GLOW_MIN_PX;
  /** The rim copies' offset now, in the art's own units (RIM_PX on screen). */
  private rimW = 0;
  /** The keyline copies' offset now, in the art's own units (RIM_PX + KEYLINE_PX on screen). */
  private keyW = 0;
  /** Screen px per art unit, as last read (0: not yet drawn). */
  private px = 0;
  /** The silhouette's size in the art's own units: the root of its bounds' area. */
  private size = 0;
  /** Add this behind the hull: the keyline (normal blend), then the lit parts (added). */
  readonly root = new Container();
  /** The keyline, a flat dark copy of the silhouette grown past the rim, with an `outside` aura's inside erased. */
  private readonly keyline = new Container();
  private keyCopies: { g: Graphics; dx: number; dy: number; k: number }[] = [];
  private readonly glow = new Container();
  private readonly rim = new Container();
  /** An `outside` aura's own inside, erased: the glow's, the keyline's and the rim's (each the silhouette in `erase` blend). Live mode uses the first, inside its one group. */
  private readonly eraseGlow = new Container();
  private readonly eraseKey = new Container();
  private readonly eraseRim = new Container();
  /** Baked mode (27 C3): each part in a layer cached as a texture, under a top that carries its alpha and visibility. */
  private readonly layers: Container[] = [];
  private readonly tops: Container[] = [];
  private readonly pads: Graphics[] = [];
  /** Each layer's contents, scaled up by the bake's resolution so one local unit of the layer is one texel. */
  private readonly inners: Container[] = [];
  /** The bake's texels per art unit, and where its texture starts, in texels (27 C3: for snapping it to the screen's pixel grid). */
  private bakedRes = 0;
  private origin = { x: 0, y: 0 };
  /** What carries each part's alpha and visibility: the part itself when live, its top when baked. */
  private glowTop: Container = this.glow;
  private keyTop: Container = this.keyline;
  private rimTop: Container = this.rim;
  /** The live mode's one offscreen group, while live. */
  private group: Container | null = null;
  private baked = false;
  private readonly outside: boolean;
  private parts: readonly Silhouette[] = [];
  private shown: AuraParts = 'all';
  private alpha = 1;
  /** The silhouette's local bounds, for the layers' reach. */
  private bounds = { x: 0, y: 0, width: 0, height: 0 };
  /** The renderer's resolution, as last read. */
  private rr = 1;
  private bakeQueued = false;
  private lastM: Matrix | null = null;
  /** The rim's copies, with the offset of the part each copies. */
  private copies: { g: Graphics; dx: number; dy: number; k: number }[] = [];
  /** Contexts this aura made itself (polygons, circles), destroyed with it; baked art owns the rest. */
  private owned: GraphicsContext[] = [];
  /** A victory's flare share now (27 B3). */
  private flare = 0;

  /**
   * @param color    the aura's colour (0xRRGGBB)
   * @param _spread  ignored since 19 S1: the reach is shared (GLOW_SHARE), not each art's own
   */
  constructor(private color: number, _spread?: number, opts: { outside?: boolean } = {}) {
    this.outside = !!opts.outside;
    // Read its own scale on screen before each frame is drawn: whoever owns the art, at any zoom.
    this.root.onRender = (r) => this.measure(r.resolution);
    live.add(this);
    if (this.outside) {
      for (let i = 0; i < 3; i++) {
        const layer = new Container();
        const top = new Container();
        top.addChild(layer);
        this.layers.push(layer);
        this.tops.push(top);
        this.pads.push(new Graphics());
        this.inners.push(new Container());
      }
    }
    this.baked = this.outside && activeProfile().render.switches.auraBake;
    this.build();
  }

  /** Lay the parts out for the current mode. Bottom to top: the glow (added), the keyline (dark copies, normal blend: a dark edge over the glow, so the rim's neighbour is dark), the rim (added). */
  private build(): void {
    this.root.removeChildren();
    if (this.group) { const fs = this.group.filters; this.group.filters = []; this.group.destroy(); for (const f of Array.isArray(fs) ? fs : fs ? [fs] : []) f.destroy(); this.group = null; }
    if (!this.outside) {
      // No filter and no group of its own: it costs only its copies.
      this.root.addChild(this.glow, this.keyline, this.rim);
      this.glowTop = this.glow; this.keyTop = this.keyline; this.rimTop = this.rim;
    } else if (!this.baked) {
      // One offscreen group (any filter makes one), so the eraser cuts the aura and nothing beneath it. The keyline sits inside it
      // too, so the eraser cuts its inside as well. (Pixi 8.21 composites a filtered container normally, whatever its
      // blendMode: see the note on KEYLINE_PX.)
      const g = new Container();
      g.filters = [new AlphaFilter({ alpha: 1 })];
      g.addChild(this.glow, this.keyline, this.rim, this.eraseGlow);
      this.group = g;
      this.root.addChild(g);
      this.glowTop = this.glow; this.keyTop = this.keyline; this.rimTop = this.rim;
      for (const l of this.layers) l.cacheAsTexture(false);
    } else {
      // The parts' own alpha is the live mode's (setAlpha put it on glow and rim); here the tops carry it, so clear it or it applies twice (the dim rim).
      this.glow.alpha = 1; this.rim.alpha = 1;
      // Three cached layers, each erased apart: alpha-over composites associatively, so it equals erasing the group.
      const content = [this.glow, this.keyline, this.rim];
      const erasers = [this.eraseGlow, this.eraseKey, this.eraseRim];
      this.layers.forEach((l, i) => {
        const inner = this.inners[i]!;
        l.removeChildren(); inner.removeChildren();
        inner.addChild(content[i]!, erasers[i]!);
        l.addChild(this.pads[i]!, inner);
      });
      this.root.addChild(...this.tops);
      [this.glowTop, this.keyTop, this.rimTop] = this.tops as [Container, Container, Container];
    }
    this.keyline.alpha = this.baked ? 1 : KEYLINE_ALPHA;
    this.keyTop.alpha = KEYLINE_ALPHA;
    this.setAlpha(this.alpha);
    this.show(this.shown);
  }

  /** Switch between the live filters and the baked layers (the `auraBake` profile switch). Only an `outside` aura bakes. */
  setBaked(on: boolean): void {
    on = on && this.outside;
    if (on === this.baked) return;
    this.baked = on;
    this.build();
    this.fill(this.parts);
  }

  /** Replace the silhouette(s) the aura follows, from baked art. */
  set(parts: readonly Silhouette[]): void {
    this.fill(parts);
  }

  /** Follow a polygon (flat x, y pairs, in the art's own units). */
  setPolygon(points: readonly number[]): void {
    this.fill(points.length >= 6 ? [this.own(new GraphicsContext().poly([...points]).fill({ color: 0xffffff }))] : []);
  }

  /** Follow a circle round the origin. */
  setCircle(r: number): void {
    this.fill(r > 0 ? [this.own(new GraphicsContext().circle(0, 0, r).fill({ color: 0xffffff }))] : []);
  }

  /**
   * Follow shapes drawn for it (any fill or stroke, in the art's own units): an open structure whose
   * gaps must stay clear, like a platform's bands round its core. The aura owns the contexts.
   */
  setShapes(ctxs: readonly GraphicsContext[]): void {
    this.fill(ctxs.map((c) => this.own(c)));
  }

  private own(ctx: GraphicsContext): Silhouette {
    this.owned.push(ctx);
    return { ctx, dx: 0, dy: 0 };
  }

  /** A flat fill of the aura colour, keeping the source's alpha. */
  private flatten(): ColorMatrixFilter {
    const flat = new ColorMatrixFilter();
    flat.matrix = this.matrix();
    return flat;
  }

  private matrix(): ColorMatrixFilter['matrix'] {
    // Gold alone flares (27 B3): from its resting weight toward AURA_FLARE_WEIGHT by the flare's share.
    const k = this.color === AURA.threat ? AURA_BALANCE.threat : this.color === AURA.objective ? AURA_BALANCE.objective
      : AURA_BALANCE.accomplished + (AURA_FLARE_WEIGHT - AURA_BALANCE.accomplished) * this.flare;
    // Scaled colour under an added blend is scaled alpha; the channel at the cap (deadly red's red at 1.25) clips there, which is the most a role can brighten.
    const r = Math.min(1, (((this.color >> 16) & 255) / 255) * k);
    const g = Math.min(1, (((this.color >> 8) & 255) / 255) * k);
    const b = Math.min(1, ((this.color & 255) / 255) * k);
    return [0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 0, 0, 0, 0, 1, 0];
  }

  /** Change colour (a role colour, or victory gold once done), keeping the shape. */
  setColor(color: number): void {
    if (color === this.color) return;
    this.color = color;
    this.rewrite();
  }

  /** A victory's flare, 0..1 (27 B3): gold's weight rises from rest toward AURA_FLARE_WEIGHT by this. Red and blue ignore it. */
  setFlare(share: number): void {
    const s = Math.min(1, Math.max(0, share));
    if (s === this.flare) return;
    this.flare = s;
    if (this.color === AURA.accomplished) this.rewrite();
  }

  /** The flare share now, and whether the aura is gold (for auraFlareIn). */
  flareNow(): number {
    return this.color === AURA.accomplished ? this.flare : 0;
  }

  private rewrite(): void {
    for (const f of [this.glow.filters?.[0], this.rim.filters?.[0]]) if (f instanceof ColorMatrixFilter) f.matrix = this.matrix();
    this.rebake();
  }

  private fill(parts: readonly Silhouette[]): void {
    this.parts = parts;
    for (const c of [...this.glow.removeChildren(), ...this.rim.removeChildren(), ...this.keyline.removeChildren(), ...this.erasersAll().flatMap((e) => e.removeChildren())]) c.destroy();
    this.keyCopies = [];
    const stale = this.owned.filter((ctx) => !parts.some((p) => p.ctx === ctx));
    this.owned = this.owned.filter((ctx) => parts.some((p) => p.ctx === ctx));
    for (const ctx of stale) ctx.destroy();
    this.glow.filters = [];
    this.rim.filters = [];
    this.copies = [];
    if (!parts.length) return;
    for (const p of parts) {
      const g = new Graphics(p.ctx);
      g.position.set(p.dx, p.dy);
      this.glow.addChild(g);
      RIM_DIRS.forEach((_, k) => {
        const c = new Graphics(p.ctx);
        this.rim.addChild(c);
        this.copies.push({ g: c, dx: p.dx, dy: p.dy, k });
        const kc = new Graphics(p.ctx);
        kc.tint = KEY_COLOR;
        this.keyline.addChild(kc);
        this.keyCopies.push({ g: kc, dx: p.dx, dy: p.dy, k });
      });
    }
    for (const target of this.erasersNow()) {
      for (const p of parts) {
        const e = new Graphics(p.ctx);
        e.position.set(p.dx, p.dy);
        e.blendMode = 'erase';
        target.addChild(e);
      }
    }
    const b = this.glow.getLocalBounds();
    this.size = Math.sqrt(Math.max(0, b.width * b.height));
    this.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    this.px = 0; // measured afresh at the next frame
    this.placeRim();
    this.glow.filters = [this.flatten(), new BlurFilter({ strength: this.reach, quality: 3, resolution: 1 })];
    this.rim.filters = [this.flatten()];
    this.rebake();
  }

  private erasersAll(): Container[] {
    return [this.eraseGlow, this.eraseKey, this.eraseRim];
  }

  /** The erasers that hold copies now: none for an inside aura, the group's one when live, one a layer when baked. */
  private erasersNow(): Container[] {
    return !this.outside ? [] : this.baked ? this.erasersAll() : [this.eraseGlow];
  }

  /**
   * Bake the layers afresh: one texel per device pixel, reaching the glow's blur, the keyline and the rim, which cacheAsTexture's
   * bounds (the silhouette's) do not include, via an invisible rect. Each layer's contents sit in an `inner` scaled by the
   * resolution, so the layer's own units are texels (its bounds land on whole texels) and the sprite is scaled back down;
   * `snap` then puts the texture on the screen's pixel grid, so the sprite shows the same pixels the live copies would.
   * Not for alpha. Pixi reads a cached group's size before `onRender` runs, so a request made while drawing is queued past the frame (measure).
   */
  private rebake(): void {
    if (!this.baked || !this.copies.length) return;
    const px = this.px || 1;
    // The live group clips the glow to the bounds of its copies (the keyline's, RIM_PX + KEYLINE_PX out), so the glow shows no
    // further out than that; every layer's texture covers the same box, or the baked glow would light the pixels past the keyline.
    const pad = (RIM_PX + KEYLINE_PX) / px;
    const res = Math.max(0.05, px * this.rr);
    const { x, y, width, height } = this.bounds;
    const x0 = Math.floor((x - pad) * res); const y0 = Math.floor((y - pad) * res);
    const x1 = Math.ceil((x + width + pad) * res); const y1 = Math.ceil((y + height + pad) * res);
    this.bakedRes = res;
    this.origin = { x: x0, y: y0 };
    for (const g of this.pads) g.clear().rect(x0, y0, x1 - x0, y1 - y0).fill({ color: 0xffffff, alpha: 0 });
    // Rasterise at the phase the screen's pixel grid sees: `snap` will shift the sprite by (dx, dy) to land on whole pixels,
    // so the contents are shifted the other way inside the texture (a texel is a device pixel), and a still aura shows exactly the live pixels.
    const ph = this.phase();
    for (const i of this.inners) { i.scale.set(res); i.position.set(-ph.x * this.rr, -ph.y * this.rr); }
    for (const l of this.layers) {
      l.scale.set(1 / res);
      l.cacheAsTexture({ resolution: 1, antialias: true, scaleMode: 'nearest' });
    }
  }

  /** The shift, in screen px, that puts the baked texture's first texel on a whole device pixel (under one pixel). */
  private shift(m: Matrix): { x: number; y: number } {
    const u = this.origin.x / this.bakedRes; const v = this.origin.y / this.bakedRes;
    const sx = m.a * u + m.c * v + m.tx; const sy = m.b * u + m.d * v + m.ty;
    return { x: Math.round(sx * this.rr) / this.rr - sx, y: Math.round(sy * this.rr) / this.rr - sy };
  }

  /** `shift` at the transform as last measured; none before the first measure. */
  private phase(): { x: number; y: number } {
    return this.lastM ? this.shift(this.lastM) : { x: 0, y: 0 };
  }

  /** Move the baked sprites so their texels fall on whole device pixels (the shift is under one pixel). */
  private snap(m: Matrix): void {
    const { x: dx, y: dy } = this.shift(m);
    const det = m.a * m.d - m.b * m.c || 1e-9;
    const lx = (m.d * dx - m.c * dy) / det; const ly = (m.a * dy - m.b * dx) / det;
    for (const t of this.tops) t.position.set(lx, ly);
  }

  private placeRim(): void {
    for (const c of this.copies) {
      const [ux, uy] = RIM_DIRS[c.k]!;
      c.g.position.set(c.dx + ux * this.rimW, c.dy + uy * this.rimW);
    }
    for (const c of this.keyCopies) {
      const [ux, uy] = RIM_DIRS[c.k]!;
      c.g.position.set(c.dx + ux * this.keyW, c.dy + uy * this.keyW);
    }
  }

  /**
   * Its scale on screen, read before each frame: the rim is RIM_PX wide, and the glow (a blur, which
   * Pixi measures in screen px) reaches GLOW_SHARE of the silhouette's size on screen, between
   * GLOW_MIN_PX and GLOW_MAX_PX. Changes under 2% are left alone.
   */
  private measure(rr: number): void {
    if (!this.copies.length) return;
    this.rr = rr;
    const m = this.root.getGlobalTransform(scratch, false);
    const px = Math.max(Math.hypot(m.a, m.b), 1e-6);
    if (this.baked && this.bakedRes) this.snap(m);
    this.lastM = this.lastM ? this.lastM.copyFrom(m) : m.clone();
    if (this.px && Math.abs(px - this.px) <= this.px * 0.02) return;
    this.px = px;
    this.reach = Math.min(GLOW_MAX_PX, Math.max(GLOW_MIN_PX, GLOW_SHARE * this.size * px));
    const blur = this.glow.filters?.[1];
    // A live filter works in css px; inside a cached layer its space is texels, 1/rr of a css px.
    if (blur instanceof BlurFilter) blur.strength = this.baked ? this.reach * rr : this.reach;
    this.rimW = RIM_PX / px;
    this.keyW = (RIM_PX + KEYLINE_PX) / px;
    this.placeRim();
    if (this.baked && !this.bakeQueued) {
      this.bakeQueued = true;
      queueMicrotask(() => { this.bakeQueued = false; if (live.has(this)) this.rebake(); });
    }
  }

  /** Kept for the art that still passes its zoom: the aura reads its own scale now (measure). */
  setZoom(_pxPerUnit: number): void {}

  /** As drawn now (auraReadings). */
  reading(): AuraReading {
    const b = this.root.getBounds();
    return {
      x: b.x + b.width / 2, y: b.y + b.height / 2, color: this.color,
      rimPx: this.rimW * this.px, blurPx: this.reach, rimAlpha: this.rimTop.alpha, glowAlpha: this.glowTop.alpha,
    };
  }

  /** Which parts draw (showAuras). */
  show(parts: AuraParts): void {
    this.shown = parts;
    this.root.renderable = parts !== 'none';
    this.keyTop.renderable = parts === 'all' && KEYLINE_PX > 0 && KEYLINE_ALPHA > 0;
    this.rimTop.renderable = parts !== 'glow';
    this.glowTop.renderable = parts !== 'rim';
  }

  /** How bright the glow is now (0 hides the aura): the caller breathes it; the rim stays steady. */
  setAlpha(a: number): void {
    this.alpha = a;
    this.glowTop.alpha = a;
    // Live, Pixi does not apply the rim container's alpha through its filter (measured 27 C3: the live rim composites at full strength
    // whatever RIM_ALPHA says), so the baked rim, whose top is a plain sprite, is drawn at 1 to look the same.
    this.rimTop.alpha = a > 0.01 ? (this.baked ? 1 : Math.max(RIM_ALPHA, a)) : 0;
    this.root.visible = a > 0.01;
  }

  destroy(): void {
    live.delete(this);
    for (const c of [...this.glow.removeChildren(), ...this.rim.removeChildren(), ...this.keyline.removeChildren(), ...this.erasersAll().flatMap((e) => e.removeChildren())]) c.destroy();
    this.glow.filters = [];
    this.rim.filters = [];
    for (const l of this.layers) l.cacheAsTexture(false);
    this.root.destroy({ children: true });
    for (const c of [...this.tops, ...this.erasersAll()]) c.destroy({ children: true });
    for (const ctx of this.owned) ctx.destroy();
    this.owned = [];
  }
}

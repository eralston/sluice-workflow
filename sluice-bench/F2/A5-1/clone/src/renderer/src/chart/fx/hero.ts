// The hero aura (05 §6, 06 §5; decided 2026-10-04): the followed ship is the star of the show, so it
// wears a gentle spotlight you can't lose track of, even while the selection reticle wanders and
// everything else moves. The timeline's cyan, so it ties to the ruler and stays low-contrast, with
// slowly turning rays and a few orbiting motes: it avoids every signal-ladder hue (grey, blue,
// violet, gold: 09 §1), so it never reads as a state. When play starts it makes an entrance: light gathers into the ship, flashes, and
// sends two shockwaves out before settling into its glow.
//
// Drawn in screen space (like the selection reticle) and owned by the chart, not the scene, so it
// survives scene changes and seeks; it fades in and out rather than popping. Ambient motion: wall
// time, never the playback rate (05 §5).
import { Container, Graphics, Sprite } from 'pixi.js';
import { easeIn, easeInOut, easeOut, glowTexture } from './effects';

/** The timeline's cyan (--cyan): the aura is the ruler's color, so "who I follow" ties to "where I am in time". */
const TIMELINE = 0x83dde2;
const WARM = TIMELINE;
const IVORY = TIMELINE;
/** A paler cyan for the brief bloom, so the entrance has a little lift without turning white. */
const BLOOM = 0xc4f1f3;
/** The entrance's length (s): gather, flash, shockwaves, settle. */
export const WARMUP_S = 2.6;
const GATHER_S = 1.0;
const MOTES = 14;
const RAYS = 8;

export class HeroAura {
  readonly root = new Container({ label: 'heroAura' });
  private readonly halo = glowSprite();
  private readonly flash = glowSprite();
  private readonly rays = new Graphics();
  private readonly rings = new Graphics();
  private readonly motes: Sprite[] = [];
  private t = 0;
  /** Seconds into the entrance, or -1 when it isn't running. */
  private warm = -1;
  /** 0..1: fades in when the ship is in the scene, out when it isn't. */
  private vis = 0;

  constructor(parent: Container) {
    this.rays.blendMode = 'add';
    this.rings.blendMode = 'add';
    this.root.addChild(this.halo, this.rays, this.rings, this.flash);
    for (let i = 0; i < MOTES; i++) {
      const m = glowSprite();
      m.tint = WARM;
      this.motes.push(m);
      this.root.addChild(m);
    }
    this.halo.tint = WARM;
    this.flash.tint = BLOOM;
    this.root.visible = false;
    parent.addChild(this.root);
  }

  /** The entrance, as play starts. */
  warmup(): void {
    this.warm = 0;
  }

  get warming(): boolean {
    return this.warm >= 0;
  }

  get visible(): number {
    return this.vis;
  }

  /**
   * One frame. `at`: the ship's screen position and radius (px), or null when it isn't in this scene.
   * Reduced motion keeps only a steady halo and a static ring: no entrance, no turning, no motes.
   */
  update(dt: number, at: { x: number; y: number; r: number } | null, reduced: boolean): void {
    this.t += dt;
    this.vis += ((at ? 1 : 0) - this.vis) * Math.min(1, dt * 6);
    if (!at && this.vis < 0.01) {
      this.vis = 0;
      this.root.visible = false;
      return;
    }
    if (!at) return; // fading out where it last was
    this.root.visible = true;
    const { x, y } = at;
    const r = Math.max(22, at.r);
    if (reduced) this.warm = -1;
    if (this.warm >= 0) {
      this.warm += dt;
      if (this.warm >= WARMUP_S) this.warm = -1;
    }
    const w = this.warm;
    const vis = this.vis;

    // Steady glow: a slow breath (4 s), stronger during the entrance.
    const breath = reduced ? 0 : 0.5 + 0.5 * Math.sin(this.t * ((Math.PI * 2) / 4));
    const charge = w < 0 ? 1 : easeOut(w / GATHER_S); // the glow builds as light gathers
    const burst = w < 0 ? 0 : Math.max(0, 1 - Math.abs(w - GATHER_S) / 0.5); // peaks at the flash
    const haloSize = r * (3.4 + 0.4 * breath + 1.0 * burst) * (0.6 + 0.4 * charge);
    this.halo.position.set(x, y);
    this.halo.width = this.halo.height = haloSize * 2;
    this.halo.alpha = vis * (0.11 + 0.04 * breath + 0.16 * burst) * charge;

    // The flash: one white bloom at the top of the gather.
    this.flash.position.set(x, y);
    this.flash.width = this.flash.height = r * (2.4 + 2.6 * burst) * 2;
    this.flash.alpha = vis * 0.28 * burst * burst;

    // Rays: eight long and eight short, turning slowly in opposite directions; they grow out during
    // the entrance. Thin tapered slivers, so they read as radiance, not as a dial.
    const g = this.rays.clear();
    const grow = w < 0 ? 1 : easeInOut(Math.max(0, (w - 0.3) / 1.3));
    if (grow > 0.01) {
      const spin = reduced ? 0 : this.t * 0.12;
      for (let i = 0; i < RAYS; i++) {
        const long = i % 2 === 0;
        const a = spin * (long ? 1 : -1.6) + (i * Math.PI * 2) / RAYS + (long ? 0 : Math.PI / RAYS);
        const len = r * (long ? 3.0 : 2.1) * (0.9 + 0.1 * breath) * grow * (1 + 0.2 * burst);
        const half = 0.08 * (long ? 1 : 0.8);
        const r0 = r * 1.15;
        g.moveTo(x + Math.cos(a - half) * r0, y + Math.sin(a - half) * r0)
          .lineTo(x + Math.cos(a) * (r0 + len), y + Math.sin(a) * (r0 + len))
          .lineTo(x + Math.cos(a + half) * r0, y + Math.sin(a + half) * r0)
          .closePath()
          .fill({ color: WARM, alpha: vis * (long ? 0.15 : 0.1) * (0.65 + 0.35 * breath) + vis * 0.1 * burst * (long ? 1 : 0.6) });
      }
    }

    // Rings: a thin steady ring (static in reduced motion), and the entrance's two shockwaves.
    const rg = this.rings.clear();
    rg.circle(x, y, r * 1.95).stroke({ width: 1.25, color: IVORY, alpha: vis * (reduced ? 0.3 : 0.12 + 0.06 * breath) });
    if (w >= GATHER_S) {
      for (let i = 0; i < 2; i++) {
        const u = (w - GATHER_S - i * 0.22) / 1.15;
        if (u <= 0 || u >= 1) continue;
        rg.circle(x, y, r * (1.3 + 5.5 * easeOut(u))).stroke({ width: 2 * (1 - u) + 0.6, color: IVORY, alpha: vis * 0.3 * (1 - u) });
      }
    }

    // Motes: three orbit slowly at rest; in the entrance, fourteen converge on the ship from afar.
    this.motes.forEach((m, i) => {
      const seed = (i * 2.399963) % (Math.PI * 2); // golden-angle spread
      if (reduced) {
        m.visible = false;
        return;
      }
      if (w >= 0 && w < GATHER_S + 0.1) {
        const u = easeIn(Math.min(1, w / GATHER_S));
        const dist = r * (9 - 7.6 * u) * (0.75 + 0.25 * ((i % 3) / 2));
        const a = seed + this.t * 0.6 * (1 - u) + u * 0.8;
        m.position.set(x + Math.cos(a) * dist, y + Math.sin(a) * dist * 0.8);
        m.width = m.height = 5 + 5 * u;
        m.alpha = vis * (0.12 + 0.35 * u);
        m.visible = true;
      } else if (i < 3) {
        const a = this.t * 0.5 + (i * Math.PI * 2) / 3;
        const dist = r * 2.5;
        m.position.set(x + Math.cos(a) * dist, y + Math.sin(a) * dist * 0.8);
        m.width = m.height = 9;
        m.alpha = vis * (0.3 + 0.12 * Math.sin(this.t * 1.7 + i));
        m.visible = true;
      } else {
        m.visible = false;
      }
    });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

function glowSprite(): Sprite {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.blendMode = 'add';
  return s;
}

// Protected moments and their marks (05 §5): the cast's freeze, the eclipse, the glow tell. Split out of
// director.ts (2026-10-10, no behaviour change).
import type { ViewNode } from '@shared/contracts/view';
import { Container, Graphics, Sprite } from 'pixi.js';
import type { GraphScene } from '../scenes/GraphScene';
import { easeIn, glowTexture, type Fx } from './effects';

/** A short eclipse (05 §5): the body being passed dims on the side the other crosses, then clears. */
export class Eclipse implements Fx {
  readonly kind = 'accent';
  private t = 0;
  private readonly g = new Graphics();
  constructor(layer: Container, private readonly under: () => readonly [number, number] | null, private readonly over: () => readonly [number, number] | null, private readonly r: number, private readonly dur: number) {
    layer.addChild(this.g);
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const a = this.under();
    const b = this.over();
    this.g.clear();
    if (a && b) {
      // The shadow sits on the passed body, offset toward the one in front of it.
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const off = Math.min(this.r * 0.45, l * 0.5);
      this.g.circle(a[0] + (dx / l) * off, a[1] + (dy / l) * off, this.r * 0.95).fill({ color: 0x02060d, alpha: 0.55 * Math.sin(Math.PI * u) });
    }
    return u < 1;
  }
  destroy(): void {
    this.g.destroy();
  }
}

/**
 * A protected moment (05 §5, decided 2026-10-03): for its window, nothing but the moment itself may
 * move its cast. Matching nodes are frozen in the glide layer (later layout changes wait), and other
 * moves of them start once it ends. Runs on the accent clock, like the moment's choreography.
 */
export class Protect implements Fx {
  readonly kind = 'accent';
  private t = 0;
  private readonly frozen: string[];
  constructor(private readonly scene: GraphScene, readonly eventKey: string, readonly matches: (n: ViewNode) => boolean, private readonly dur: number) {
    this.frozen = scene.targetNodes().filter(matches).map((n) => n.projectionKey);
    for (const pk of this.frozen) scene.freeze(pk);
  }
  /** Effect-seconds left. */
  get remaining(): number {
    return Math.max(0, this.dur - this.t);
  }
  update(dt: number): boolean {
    this.t += dt;
    return this.t < this.dur;
  }
  /** Lets one of its nodes go early (a close's glide, 22 C3): it follows its layout again now. */
  release(pk: string): void {
    const i = this.frozen.indexOf(pk);
    if (i < 0) return;
    this.frozen.splice(i, 1);
    this.scene.thaw(pk);
  }
  destroy(): void {
    for (const pk of this.frozen) this.scene.thaw(pk);
  }
}

/** A soft glow building on an object before its beat (the tell, 05 §5). */
export class GlowTell implements Fx {
  readonly kind = 'travel';
  private t = 0;
  private readonly s: Sprite;
  constructor(layer: GraphScene, x: number, y: number, r: number, color: number, private readonly dur: number) {
    this.s = new Sprite(glowTexture());
    this.s.anchor.set(0.5);
    this.s.tint = color;
    this.s.blendMode = 'add';
    this.s.position.set(x, y);
    this.s.width = this.s.height = r * 2.6;
    this.s.alpha = 0;
    layer.fxLayer().addChild(this.s);
  }
  update(dt: number): boolean {
    this.t += dt;
    this.s.alpha = 0.4 * easeIn(Math.min(1, this.t / this.dur));
    return this.t < this.dur + 0.15;
  }
  destroy(): void {
    this.s.destroy();
  }
}

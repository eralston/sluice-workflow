// Loaded by level (decided 2026-10-07): the Load more beacon, and the faint outlines that stand in for
// an unexplored Feature's children. Neither is a work state, so both stay off the ladder's colors
// (09): Load more is ivory on a navigation ring, and the outlines are a dim dashed grey.
import { Container, Graphics } from 'pixi.js';
import { motion } from './motion';

const IVORY = 0xf4f0de;
const RING = 0x9fb3c8;
const GHOST = 0x8a94a6;

/** A beacon ring with a bold + (06 §3): selecting it loads the next page of older Features. */
export class LoadMoreView {
  readonly root = new Container();
  private readonly halo = new Graphics();
  private readonly g = new Graphics();

  constructor(private readonly r: number) {
    this.halo.circle(0, 0, r * 1.15).fill({ color: RING, alpha: 0.16 });
    this.halo.blendMode = 'add';
    this.g.circle(0, 0, r * 0.82).fill({ color: 0x0b1a30, alpha: 0.85 }).stroke({ color: RING, width: r * 0.1, alpha: 0.95 });
    for (let i = 0; i < 12; i++) {
      // tick marks around the ring: a beacon, not a body
      const a = (i / 12) * Math.PI * 2;
      this.g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9).lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    this.g.stroke({ color: RING, width: r * 0.06, alpha: 0.7 });
    const arm = r * 0.46;
    const w = r * 0.2;
    this.g.roundRect(-arm, -w / 2, arm * 2, w, w / 2).fill({ color: IVORY });
    this.g.roundRect(-w / 2, -arm, w, arm * 2, w / 2).fill({ color: IVORY });
    this.root.addChild(this.halo, this.g);
  }

  setStage(): void {}
  tick(): void {
    this.halo.alpha = motion.reduced ? 0.8 : 0.55 + 0.45 * Math.max(0, Math.sin(motion.pulseTime * 1.6));
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** An unexplored child: a dim dashed outline where a planet will be once the Feature is entered. */
export class GhostView {
  readonly root = new Container();
  /** Drawn crisp, outside the paint pass: thin dashes would wash out in it. */
  readonly marks = new Container();

  constructor(r: number) {
    const g = new Graphics();
    const dashes = 10;
    for (let i = 0; i < dashes; i++) {
      const a0 = (i / dashes) * Math.PI * 2;
      g.arc(0, 0, r * 0.7, a0, a0 + (Math.PI / dashes) * 1.1);
      g.stroke({ color: GHOST, width: Math.max(1.5, r * 0.14), alpha: 0.7 });
    }
    this.marks.addChild(g);
  }

  setStage(): void {}
  tick(): void {}
  destroy(): void {
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}

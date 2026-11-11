// Marks for states off the signal ladder (09 §1), shared by every celestial object: Deferred's pause
// bars, Removed's dashed ghost outline, Rejected's strike, and an unknown state's "?" (INV-11).
import type { Graphics } from 'pixi.js';
import type { Signal } from './progress';

const IVORY = 0xf4f0de;
const INK = 0x081629;

export function dashedCircle(g: Graphics, r: number, segments: number): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / segments / 2;
    g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a1);
  }
}

/** Draw the off-ladder marks for a signal around a body of radius r (the outline ring at `ring`). */
export function drawOffLadderMarks(g: Graphics, s: Signal, r: number, ring = r * 1.4): void {
  g.clear();
  if (s.deferred) {
    g.roundRect(-r * 0.35, -r * 0.45, r * 0.22, r * 0.9, 2).roundRect(r * 0.13, -r * 0.45, r * 0.22, r * 0.9, 2);
    g.fill({ color: INK, alpha: 0.65 });
  }
  if (s.ghost) {
    dashedCircle(g, ring, 16);
    g.stroke({ width: 1.5, color: IVORY, alpha: 0.5 });
  }
  if (s.strike) {
    g.moveTo(-ring * 0.8, ring * 0.8).lineTo(ring * 0.8, -ring * 0.8).stroke({ width: 2, color: IVORY, alpha: 0.7 });
  }
  if (s.unknown) {
    const x = r * 0.75;
    const y = -r * 0.75;
    g.circle(x, y, 9).fill({ color: INK, alpha: 0.85 }).stroke({ width: 1.5, color: IVORY });
    g.moveTo(x - 2.5, y - 3).arc(x, y - 2.5, 2.8, Math.PI, 0.6).lineTo(x, y + 1).stroke({ width: 1.5, color: IVORY });
    g.circle(x, y + 4, 1).fill({ color: IVORY });
  }
}

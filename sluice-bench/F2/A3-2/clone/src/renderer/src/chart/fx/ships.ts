// Ships at work (06 §5): escorts in a review formation, guest ships, and the lead-in tell. Split out of
// director.ts (2026-10-10, no behaviour change).
import { Sprite } from 'pixi.js';
import { lighten } from '../art/lit';
import { ShipView } from '../art/ships';
import { avatarColor, initialsOf } from '@shared/scene/avatar';
import type { GraphScene } from '../scenes/GraphScene';
import { avatarCircle } from '../labels';
import { easeIn, easeInOut, easeOut, glowTexture, type Fx } from './effects';
import { CYAN, GATHER_S, LEAVE_S } from './timing';
import type { DirectorHost } from './director';

/** An approver whose ship lives in this scene: it escorts the vessel, then returns to its resting place. */
export class Escort implements Fx {
  readonly kind = 'accent'; // the formation keeps one clock, so its ships and beams stay together at any rate
  private t = 0;
  private from: [number, number] = [0, 0];
  constructor(private readonly scene: GraphScene, private readonly pk: string, private readonly start: [number, number], private readonly slot: () => [number, number], private readonly leaveAt: number, private readonly vessel: () => [number, number] | null) {
    scene.own(pk);
    scene.placeAt(pk, start[0], start[1]);
  }
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const home = this.scene.goalOf(this.pk) ?? this.start;
    const slot = this.slot();
    let p: [number, number];
    if (t < GATHER_S) {
      const k = easeInOut(t / GATHER_S);
      p = [this.start[0] + (slot[0] - this.start[0]) * k, this.start[1] + (slot[1] - this.start[1]) * k];
      if (Math.abs(slot[0] - this.start[0]) > 1e-6) this.scene.faceView(this.pk, slot[0] - this.start[0]);
    } else if (t < this.leaveAt) {
      p = slot;
      this.from = slot;
      const v = this.vessel();
      if (v && Math.abs(v[0] - slot[0]) > 1e-6) this.scene.faceView(this.pk, v[0] - slot[0]); // nose toward the work
    } else {
      const k = easeInOut((t - this.leaveAt) / LEAVE_S);
      p = [this.from[0] + (home[0] - this.from[0]) * k, this.from[1] + (home[1] - this.from[1]) * k];
      if (Math.abs(home[0] - this.from[0]) > 1e-6) this.scene.faceView(this.pk, home[0] - this.from[0]);
    }
    this.scene.placeAt(this.pk, p[0], p[1]);
    return t < this.leaveAt + LEAVE_S;
  }
  destroy(): void {
    this.scene.release(this.pk);
    this.scene.restoreFacing(this.pk);
  }
}

/**
 * An approver with no ship in this scene: a guest ship (an effect view, never a projection node, so
 * layout and seeks are untouched) that flies in from out of view wearing its captain's picture, the
 * same circle a resident ship shows while playing (06 §4), holds its slot in the formation, then
 * departs out of view without a trail.
 */
export class GuestShip implements Fx {
  readonly kind = 'accent';
  private t = 0;
  private readonly ship: ShipView;
  private readonly tag: HTMLDivElement;
  private from: [number, number] = [0, 0];
  constructor(
    private readonly host: DirectorHost, scene: GraphScene, private readonly slot: () => [number, number], private readonly entry: [number, number], private readonly exit: [number, number],
    private readonly leaveAt: number, private readonly vessel: () => [number, number] | null, seed: number, private readonly r: number, name: string, private readonly arriveS: number, image?: string,
  ) {
    this.ship = new ShipView(seed, r);
    this.ship.root.position.set(entry[0], entry[1]);
    this.ship.root.alpha = arriveS > 0 ? 1 : 0;
    scene.fxLayer().addChild(this.ship.root);
    this.tag = document.createElement('div');
    this.tag.className = 'guest-tag';
    this.tag.title = name;
    const initials = initialsOf(name);
    this.tag.append(avatarCircle({ initials, color: avatarColor(initials), ...(image ? { image } : {}) }));
    host.labelHost.appendChild(this.tag);
  }
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const slot = this.slot();
    let p: [number, number];
    let alpha = 1;
    if (t < this.arriveS) {
      const k = easeOut(t / this.arriveS);
      p = [this.entry[0] + (slot[0] - this.entry[0]) * k, this.entry[1] + (slot[1] - this.entry[1]) * k];
      this.ship.face(slot[0] - this.entry[0]);
    } else if (t < this.leaveAt) {
      p = slot;
      this.from = slot;
      if (this.arriveS <= 0) alpha = Math.min(1, t / 0.4); // busy: a fade-in at its slot, no long flight
      const v = this.vessel();
      if (v) this.ship.face(v[0] - slot[0]);
    } else {
      const u = Math.min(1, (t - this.leaveAt) / LEAVE_S);
      const k = easeIn(u);
      p = [this.from[0] + (this.exit[0] - this.from[0]) * k, this.from[1] + (this.exit[1] - this.from[1]) * k];
      this.ship.face(this.exit[0] - this.from[0]);
      alpha = 1 - Math.max(0, (u - 0.5) / 0.5);
    }
    this.ship.root.position.set(p[0], p[1]);
    this.last = p;
    this.ship.root.alpha = alpha;
    this.ship.tick(0);
    // Hug the top of the ship, as a resident's compact label does (labels.ts).
    const s = this.host.worldToScreen(p[0], p[1]);
    const top = this.host.worldToScreen(p[0], p[1] - this.r * 0.55);
    this.tag.style.opacity = String(alpha);
    this.tag.style.transform = `translate(${Math.round(s.x - this.tag.offsetWidth / 2)}px, ${Math.round(top.y - this.tag.offsetHeight)}px)`;
    return t < this.leaveAt + LEAVE_S;
  }
  /** Where the guest ship is drawn (for the support streams); its last place once it's gone. */
  private last: [number, number] = [0, 0];
  get at(): [number, number] {
    return this.last;
  }

  destroy(): void {
    this.ship.destroy();
    this.tag.remove();
  }
}

/** A captain's ship winding up before it flies (the tell): it turns toward its heading and its engines glow. */
export class ShipTell implements Fx {
  readonly kind = 'travel';
  private t = 0;
  private readonly engine: Sprite;
  constructor(private readonly scene: GraphScene, private readonly pk: string, at: [number, number], r: number, dir: [number, number], private readonly dur: number) {
    scene.faceView(pk, dir[0]);
    this.engine = new Sprite(glowTexture());
    this.engine.anchor.set(0.5);
    this.engine.tint = lighten(CYAN, 0.3);
    this.engine.blendMode = 'add';
    this.engine.position.set(at[0] - dir[0] * r * 0.9, at[1] - dir[1] * r * 0.9);
    this.engine.width = this.engine.height = r * 1.4;
    this.engine.alpha = 0;
    scene.fxLayer().addChild(this.engine);
  }
  update(dt: number): boolean {
    this.t += dt;
    this.engine.alpha = 0.85 * easeInOut(Math.min(1, this.t / this.dur));
    return this.t < this.dur + 0.3;
  }
  destroy(): void {
    this.scene.restoreFacing(this.pk);
    this.engine.destroy();
  }
}

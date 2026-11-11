// How each object comes into the scene (2026-10-13): one command, `enter`, and the theme's Entrance.
//   asteroid      a gentle spiral round its planet (1 s), as a radar outline that resolves into its
//                 look when it isn't one already and isn't yet worked
//   hive ship     through a rift: the art's own, about a second (a sketch on the radar simply shows)
//   captain ship  out of warp: in from behind along its heading, stretched, with a streak (0.6 s)
//   anything else a fade
// `quiet` is the episode's opening, where many arrive together: no settle ring, no flash. Kept apart
// from ./commands (the beams) so the two can change independently.
import { Graphics } from 'pixi.js';
import type { Fx } from '../../chart/fx/effects';
import type { CommandCall, CommandDef, Entrance, FxHost } from '../../chart/fx/types';
import type { GraphScene } from '../../chart/scenes/GraphScene';

export interface EnterArgs { pk: string; quiet?: boolean }

/** A captain ship's drop out of warp, in seconds. */
const WARP_S = 0.6;

/** A captain's ship dropping out of warp at its place: in from behind along its heading, stretched, then a flash. */
class WarpIn implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private t = 0;
  constructor(private readonly scene: GraphScene, private readonly pk: string, private readonly dir: number, private readonly quiet: boolean, private readonly px: number) {
    this.g.blendMode = 'add';
    scene.fxLayer().addChild(this.g);
    scene.fadeView(pk, 0);
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / WARP_S);
    const k = 1 - (1 - u) ** 3;
    const reach = 90 * this.px;
    this.scene.offsetView(this.pk, -this.dir * reach * (1 - k), 0);
    this.scene.fadeView(this.pk, Math.min(1, u / 0.35));
    const at = this.scene.liveOf(this.pk);
    const g = this.g.clear();
    if (at) {
      const [x, y] = [at[0] - this.dir * reach * (1 - k), at[1]];
      const tail = reach * 0.9 * (1 - k);
      if (tail > 1e-3) g.moveTo(x - this.dir * tail, y).lineTo(x, y).stroke({ width: 1.6 * this.px, color: 0xe8fbff, alpha: 0.6 * (1 - k) });
      if (!this.quiet && u > 0.75) {
        const f = (u - 0.75) / 0.25;
        g.circle(at[0], at[1], (8 + 10 * f) * this.px).stroke({ width: 1.2 * this.px, color: 0xe8fbff, alpha: 0.5 * (1 - f) });
      }
    }
    if (u >= 1) {
      this.scene.offsetView(this.pk, 0, 0);
      this.scene.fadeView(this.pk, 1);
    }
    return u < 1;
  }
  destroy(): void {
    this.scene.offsetView(this.pk, 0, 0);
    this.scene.fadeView(this.pk, 1);
    this.g.destroy();
  }
}

/** A timer for an entrance the scene or the art plays itself, so the moment counts while it runs. */
class Wait implements Fx {
  readonly kind = 'accent';
  private t = 0;
  constructor(private readonly dur: number) {}
  update(dt: number): boolean {
    return (this.t += dt) < this.dur;
  }
  destroy(): void {}
}

function enter(host: FxHost, a: EnterArgs): Fx {
  const scene = host.stage();
  const node = scene.targetNodes().find((n) => n.projectionKey === a.pk);
  if (!node || !scene.hasView(a.pk)) return new Wait(0);
  if (host.reduced()) {
    scene.fadeView(a.pk, 1);
    return new Wait(0);
  }
  if (node.kind === 'objective') {
    // Round its planet: the nearest seat (a piece stands on its own planet's dark side).
    const dist = (n: { world: { x: number; y: number } }) => Math.hypot(n.world.x - node.world.x, n.world.y - node.world.y);
    const home = scene.targetNodes().filter((n) => n.kind === 'seat').sort((p, q) => dist(p) - dist(q))[0];
    scene.fadeView(a.pk, 1);
    scene.arrive(a.pk, 0, { center: home ? { x: home.world.x, y: home.world.y } : null, spiral: 0.9, dur: 1, quiet: a.quiet });
    if (node.piece?.signal.rung === 'ready' && !node.piece.signal.sketch) host.act(a.pk, 'contact');
    return new Wait(1);
  }
  if (node.kind === 'threat') {
    scene.fadeView(a.pk, 1);
    // A contact still on the radar (a sketch) isn't a ship yet: it simply shows. A ship comes through a rift.
    if (node.piece?.signal.sketch) return new Wait(0);
    host.act(a.pk, 'emerge');
    return new Wait(1);
  }
  if (node.kind === 'captain') return new WarpIn(scene, a.pk, scene.facingOf(a.pk) ?? 1, !!a.quiet, host.px());
  scene.fadeView(a.pk, 1);
  return new Wait(0);
}

export const entranceCommands: CommandDef[] = [
  {
    // An entrance is the object coming into being on screen: never cut (it would be left hidden).
    name: 'enter', tier: 'essential', weight: 0.5, value: 5, cuttable: false, clock: 'accent', reduced: 'same',
    make: (host: FxHost, a: EnterArgs): Fx => enter(host, a),
  } satisfies CommandDef<EnterArgs>,
] as CommandDef[];

/** One object's entrance. */
export const enterCmd = (args: EnterArgs, delayMs = 0): CommandCall => ({ cmd: 'enter', args, delayMs });

/** The theme's Entrance: asteroids, hive ships and captains make theirs; anything else fades. */
export const entrance: Entrance = (node, quiet) =>
  node.kind === 'objective' || node.kind === 'threat' || node.kind === 'captain' ? [enterCmd({ pk: node.projectionKey, quiet })] : null;

// The command host (v1, 14 §2.8): what a CommandDef's `make` may reach. The director's host (the
// scene, the hierarchy, screen mapping, labels), plus the runner's services a command needs to draw
// and chain: the effect layer, one screen pixel, reduced motion, follow-ups, the one-grand-burst
// booking, and art acts on a node's view. Built once per interpreter over its runner.
import type { Container } from 'pixi.js';
import { motion } from '../art/motion';
import type { GraphScene } from '../scenes/GraphScene';
import type { DirectorHost } from './director';
import type { Fx } from './effects';
import type { FxRunner, RunMeta } from './movers';
import { ornamentOk } from './timing';

export interface FxHost extends DirectorHost {
  /** The mounted scene. Commands are made only while one is mounted (throws otherwise). */
  stage(): GraphScene;
  layer(): Container;
  /** One screen pixel, in world units. */
  px(): number;
  /** Reduced motion (INV-20). */
  reduced(): boolean;
  /** Calm enough for ornament (05 §5 tiers). */
  calm(): boolean;
  /** Run `fn` after `delayS` effect-seconds on the given clock (follow-ups). */
  at(delayS: number, fn: () => void, clock?: 'travel' | 'accent'): void;
  /** Start a follow-up effect (a ring when a spark lands). */
  add(f: Fx, meta?: RunMeta): void;
  /** One grand burst at a time: the delay before a grand flare wanting `wantS` may burst (≤ `capS`). Books it. */
  grandSlot(wantS: number, capS: number): number;
  /** A grand flare is bursting now: lesser flares shrink. */
  bursting(): boolean;
  /** Plays a transient art act on a node's view (14 §3 step 9); false when its view has none. */
  act(pk: string, act: string, slot?: number | readonly number[]): boolean;
}

/**
 * The scene's art-act seam. GraphScene doesn't expose its views yet; when it gains
 * `actView(pk, act)` (forwarding to `AssetView.act`), acts play, and until then they're skipped.
 */
interface ActSeam { actView?(pk: string, act: string, slot?: number | readonly number[]): boolean }

export function makeHost(base: DirectorHost, runner: FxRunner, volatility: () => number): FxHost {
  const stage = (): GraphScene => {
    const s = base.scene();
    if (!s) throw new Error('no scene mounted');
    return s;
  };
  return {
    scene: () => base.scene(),
    hierarchy: () => base.hierarchy(),
    worldToScreen: (x, y) => base.worldToScreen(x, y),
    labelHost: base.labelHost,
    onGo: (key, captain) => base.onGo(key, captain),
    flashLabel: (pk) => base.flashLabel(pk),
    plateWorld: (pk) => base.plateWorld?.(pk) ?? null,
    stage,
    layer: () => stage().fxLayer(),
    px: () => 1 / stage().currentScale(),
    reduced: () => motion.reduced,
    calm: () => ornamentOk(volatility()),
    at: (d, fn, clock) => runner.at(d, fn, clock),
    add: (f, meta) => runner.add(f, meta),
    grandSlot: (want, cap) => runner.grandSlot(want, cap),
    bursting: () => runner.bursting(),
    act: (pk, act, slot) => {
      const s = base.scene() as (GraphScene & ActSeam) | null;
      return s?.actView?.(pk, act, slot) ?? false;
    },
  };
}

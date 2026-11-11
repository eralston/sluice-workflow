// The command registry (v1, 14 §2.8): named, weighted effects that a maneuver's phases issue. Each
// seed command wraps one v0 effect (effects.ts, moves.ts, moments.ts) or a v1 mover (movers.ts), with
// its weight and tier from the v0 director's volatility meter and budget (05 §5), its clock, and its
// reduced-motion substitute (INV-20). A theme may override any of them by name (its `commands`).
// The `cmd` builders below are how choreographies write calls with typed arguments.
import { crewTimes } from '@shared/engine/maneuvers';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { CastRole, Phase, PlannedManeuver } from '@shared/contracts/maneuver';
import { GEOMETRY } from '@shared/engine/solar/version';
import { fnv1a32 } from '@shared/hash';
import { Container, Graphics } from 'pixi.js';
import { lighten } from '../art/lit';
import { easeInOut, easeOut, easeUndock, Flare, Ink, Ring, Spark, Support, Tractor, type Anchor, type FlareSpec, type Fx } from './effects';
import { approachOf, ringApproachOf } from './approach';
import { HoldFor, Sortie } from './movers';
import { Pursue } from './moves';
import type { FxHost } from './host';
import type { CastView, CastViews, CommandCall, CommandDef } from './types';
import { CYAN, REPEAT_VALUE, TRACTOR, TRACTOR_S } from './timing';

// ---- Arguments ----

/** A point effect: where, how big (world units), and its colour. */
export interface PointArgs { at: Anchor; r: number; color?: number }
export interface FlareArgs extends PointArgs {
  scale?: number; linger?: number;
  /** The completion flare: essential, never ducked, one bursting at a time. */
  grand?: boolean;
  /** Sparks in this colour (ornament: dropped unless calm). */
  sparks?: number;
  /** A grand flare waits for the previous one at most this long (s; the beat's end). */
  capS?: number;
}
export interface RingArgs extends PointArgs { r1?: number; durS?: number; alpha?: number }
export interface LineArgs { from: Anchor; to: Anchor; color?: number; durS?: number }
export interface InkArgs extends LineArgs {
  reverse?: boolean;
  /** A held edge the ink reveals, released when it finishes (or at once under reduced motion). */
  edge?: string;
}
export interface SparkArgs extends LineArgs { size?: number }
export interface BeamArgs extends LineArgs { toR: number }
/** A mover takes a node over; `start` is filled in by the runner (where the node is drawn now). */
export interface MoverArgs { pk: string; start?: [number, number] }
export interface PursueArgs extends MoverArgs {
  /** Seconds to its goal: its own layout target, or with `to`, out to that point. */
  durS: number;
  /** A sortie: fly out to this live point, hold `holdS` nosed toward `look`, then back in `backS`. */
  to?: Anchor; look?: Anchor; holdS?: number; backS?: number;
  /** A sortie: stay parked this long after the hold (plate shut) before flying back, when the captain's next turn follows soon (P4). */
  waitS?: number;
  /** A sortie that passes through its spot without stopping (27 F2): no hold, `backS` the leg on, its plate riding with it for this long. */
  rideS?: number;
  /**
   * Other places to park, in order after `to` (22 B9): the first whose parked ship, with `clearPx`
   * screen px round it for its own plate, stands clear of `avoid`'s plate is chosen, once, as it sets
   * off, so a captain never parks over the plate of the work it is working.
   */
  toChoices?: Anchor[]; avoid?: string; clearPx?: number;
  lift?: number; wake?: number; face?: boolean; ease?: 'inOut' | 'out' | 'undock';
}
export interface HoldArgs extends MoverArgs { durS: number }
export interface ProtectArgs { eventKey: string; keys: CanonicalKey[]; durS: number }
export interface InsigniaArgs extends PointArgs { shape: string; durS?: number; calledAt?: number }

/** Every insignia lit this session (test hook `insignias()`, 23 D2): its shape, when it was asked for, and when it lit (`performance.now()`). */
export const insigniaLog: { id: string; calledAt: number | null; litAt: number }[] = [];

/** An anchor's point now (a live anchor may be gone: null). */
export function pointOf(a: Anchor): [number, number] | null {
  const p = typeof a === 'function' ? a() : a;
  return p ? [p[0], p[1]] : null;
}

const fixed = (a: Anchor): [number, number] => pointOf(a) ?? [0, 0];
const live = (a: Anchor | undefined) => () => (a === undefined ? null : pointOf(a));

// ---- Typed call builders (for choreographies) ----

const call = <A>(name: string) => (args: A, delayMs = 0): CommandCall => ({ cmd: name, args, delayMs });

/** A call that repeats a meaning another cue gives (15 §8 effect-audit): it mutes first (27 E1). */
export const repeats = (c: CommandCall): CommandCall => ('act' in c ? c : { ...c, value: REPEAT_VALUE });

export const cmd = {
  flare: call<FlareArgs>('flare'),
  ring: call<RingArgs>('ring'),
  ink: call<InkArgs>('ink'),
  spark: call<SparkArgs>('spark'),
  tractor: call<BeamArgs>('tractor'),
  support: call<BeamArgs>('support'),
  pursue: call<PursueArgs>('pursue'),
  hold: call<HoldArgs>('hold'),
  protect: call<ProtectArgs>('protect'),
  insignia: call<InsigniaArgs>('insignia'),
  /** An art act on one cast member's view (a jump, a break-up); `slot` the compound slot or slots it plays on (a volley's tenders dock together, 27 E6). */
  act: (key: CanonicalKey, act: string, delayMs = 0, slot?: number | readonly number[]): CommandCall => ({ act: { key, act, ...(slot !== undefined ? { slot } : {}) }, ...(delayMs ? { delayMs } : {}) }),
};

/** A phase's length in a planned maneuver, in ms at 1× (0 when it has none). */
export function phaseMs(m: PlannedManeuver, phase: Phase): number {
  return m.phases.find((p) => p.phase === phase)?.durMs ?? 0;
}

/** Where a phase starts in a planned maneuver, in ms from its start (or where the last one ends). */
export function phaseAtMs(m: PlannedManeuver, phase: Phase): number {
  const p = m.phases.find((x) => x.phase === phase);
  return p ? p.atMs : m.phases.reduce((e, x) => Math.max(e, x.atMs + x.durMs), 0);
}

// ---- A small kit for choreographies ----

/**
 * How long a flying crew holds at the work, from the act's start (their arrival) until they leave
 * (22 B9, `crewTimes`): through the work, a second after it with their plates open, then the fold.
 */
export function crewHoldMs(m: PlannedManeuver): number {
  const t = crewTimes(m.phases);
  // A quiet turn (22 C6) isn't named, and a montage (27 E5b, P-24) names no crew, so neither holds a turn: the ships leave as the work ends.
  if (m.quiet || m.plate) return Math.max(0, workEndMs(m.phases) - t.openMs);
  return t.leaveMs - t.openMs;
}

/** Where a maneuver's work ends: its land's end, else its act's (the crew's own measure, `crewTimes`). */
function workEndMs(phases: PlannedManeuver['phases']): number {
  const end = (p: string) => { const x = phases.find((q) => q.phase === p); return x ? x.atMs + x.durMs : undefined; };
  return end('land') ?? end('act') ?? 0;
}

/** The first view of a cast part, if it's in the scene. */
export function one(c: CastViews, role: CastRole): CastView | undefined {
  return c[role]?.[0];
}

/** A cast member's drawn radius now (world units): its floored size when zoomed out. */
export function drawnR(v: CastView): number {
  return v.drawnR?.() ?? v.node.world.r;
}

/** Where a captain aims for a cast member: its host (a tender's station), else itself. */
export function aimOf(v: CastView): CastView {
  return v.host ?? v;
}

/** A cast member still in the scene (not left this beat). */
export function present(c: CastViews, role: CastRole): CastView[] {
  return (c[role] ?? []).filter((v) => !v.gone);
}

/** The turns off the work's side a sortie may park at instead (radians), in order, to keep off the work's plate (22 B9). */
const PARK_TURNS = [0.45, -0.45, 0.9, -0.9];
/** The ring's neighbouring slots a sortie may park at instead, in order, to keep off the work's plate (22 D6). */
const RING_TURNS = [1, -1, 2, -2];
/** A fan of this many radians (a strike run's spacing, 0.8) is one loiter slot round the ring (22 D6). */
const FAN_PER_SLOT = 0.8;
/** The room a parked ship keeps round it for its own plate, screen px (22 B9). */
const PARK_CLEAR_PX = 26;

/**
 * A ship's sortie to work `target`: out over `outMs` to a point beside it, holding there `holdMs`
 * nosed toward it, then back to its own place over `backMs`. With the planet the work is on
 * (`around`, the cast's seat), it comes in on the work's side of that planet, outside its face (22
 * A10), turned a little either way if it would park over the work's plate (22 B9); without one, on
 * the side it comes from. It parks where it arrives.
 */
export function sortie(ship: CastView, target: CastView, outMs: number, holdMs: number, backMs: number, delayMs = 0, around?: CastView | null, fan = 0): CommandCall {
  // On a planet's loiter ring (22 D6): its slot nearest the work, a fanned ship that many slots round,
  // and the plate-dodging choices the neighbouring slots.
  const planned = around && !around.gone && around.key !== target.key ? around.node.loiterR : undefined;
  if (planned) {
    const pitch = () => 2 * Math.max(2 * drawnR(ship), 4 * GEOMETRY.shipR);
    // The ring as the scene draws it at this scale (its effective node's, `placeLoiterRings`), as at rest.
    const ringR = planned;
    const k = fan ? Math.sign(fan) * Math.ceil(Math.abs(fan) / FAN_PER_SLOT - 1e-9) : 0;
    const at = (more: number) => ringApproachOf(target.at, around!.at, ringR, pitch, k + more);
    const more = (fan ? RING_TURNS.filter((t) => Math.sign(t) === Math.sign(fan)) : RING_TURNS);
    return cmd.pursue({
      pk: ship.node.projectionKey, durS: outMs / 1000, holdS: holdMs / 1000, backS: backMs / 1000,
      to: at(0), toChoices: more.map(at), avoid: target.node.projectionKey, clearPx: PARK_CLEAR_PX, look: target.at, wake: 4,
    }, delayMs);
  }
  const from = pointOf(ship.at);
  const gap = () => drawnR(target) * 1.3 + drawnR(ship) * 1.6;
  const planet = around && !around.gone && around.key !== target.key ? around.at : null;
  const clear = planet ? () => drawnR(around!) + drawnR(ship) * 1.6 : undefined;
  const at = (turn: number) => approachOf(target.at, planet, from ?? target.at, gap, fan + turn, clear);
  return cmd.pursue({
    pk: ship.node.projectionKey, durS: outMs / 1000, holdS: holdMs / 1000, backS: backMs / 1000,
    // Round the work's side of its planet, a little either way if it would park over the work's plate (22 B9).
    // A fanned ship (a strike run's) turns only outward, away from its neighbours.
    to: at(0), ...(planet ? { toChoices: (fan ? PARK_TURNS.filter((t) => Math.sign(t) === Math.sign(fan)) : PARK_TURNS).map(at), avoid: target.node.projectionKey, clearPx: PARK_CLEAR_PX } : {}), look: target.at, wake: 4,
  }, delayMs);
}

/**
 * A parking place clear of a node's plate (22 B9): of `choices` in order, the first whose ship (its
 * radius plus `clearPx` screen px for its own plate) misses the plate's rect; failing all, the one
 * whose centre stands furthest from it. Chosen on first ask once the plate is known, then kept, so
 * the ship never changes its mind mid-flight. No plate shown: the first.
 */
export function clearOfPlate(host: FxHost, choices: Anchor[], pk: string, clearPx: number, shipR: () => number): () => [number, number] | null {
  let pick: number | null = null;
  return () => {
    if (pick === null) {
      const r = host.plateWorld?.(pk) ?? null;
      if (!r) return pointOf(choices[0]!);
      const pad = shipR() + clearPx * host.px();
      // The clearance of a ship there: its distance outside the plate (inside: how deep, negative), less its room.
      const gapOf = (p: [number, number]) => {
        const dx = Math.max(r.x0 - p[0], 0, p[0] - r.x1);
        const dy = Math.max(r.y0 - p[1], 0, p[1] - r.y1);
        const inside = -Math.min(p[0] - r.x0, r.x1 - p[0], p[1] - r.y0, r.y1 - p[1]);
        return (dx || dy ? Math.hypot(dx, dy) : inside) - pad;
      };
      const pts = choices.map((c) => pointOf(c));
      const clear = pts.findIndex((p) => !!p && gapOf(p) > 0);
      pick = clear >= 0 ? clear : pts.reduce((best, p, i) => (p && (best < 0 || gapOf(p) > gapOf(pts[best]!)) ? i : best), -1);
      if (pick < 0) pick = 0;
    }
    return pointOf(choices[pick]!);
  };
}

/** A point `dist` out from `at`, at a seeded angle (a retreat's heading): deterministic per maneuver. */
export function away(at: Anchor, seed: number, dist: number): [number, number] {
  const p = pointOf(at) ?? [0, 0];
  const a = ((seed % 360) / 180) * Math.PI;
  return [p[0] + Math.cos(a) * dist, p[1] + Math.sin(a) * dist];
}

// ---- Effects only commands need ----

/** A grand flare waiting for the previous one to settle (one grand burst at a time), then bursting. */
class LateFlare implements Fx {
  readonly kind = 'accent';
  readonly grand: boolean;
  private inner: Flare | null = null;
  private t = 0;
  constructor(private readonly make: () => Flare, private readonly wait: number, grand: boolean) {
    this.grand = grand;
    if (wait <= 1e-3) this.inner = make();
  }
  update(dt: number): boolean {
    if (this.inner) return this.inner.update(dt);
    this.t += dt;
    if (this.t >= this.wait) this.inner = this.make();
    return true;
  }
  duck(k: number): void {
    this.inner?.duck?.(k);
  }
  destroy(): void {
    this.inner?.destroy();
  }
}

/**
 * An insignia (18 §5): an award's mark, drawn once over the piece that earned it. A small n-point
 * star (n from the shape id) inside a ring, fading up, turning a little, and fading out. Ornament.
 */
export class Insignia implements Fx {
  readonly kind = 'accent';
  private readonly root = new Container();
  private readonly g = new Graphics();
  private t = 0;
  private dim = 1;
  constructor(layer: Container, private readonly at: () => [number, number] | null, private readonly r: number, private readonly shape: string, private readonly color: number, private readonly dur: number, private readonly px: number) {
    this.g.blendMode = 'add';
    this.root.addChild(this.g);
    layer.addChild(this.root);
  }
  duck(k: number): void {
    this.dim = k;
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const p = this.at();
    if (p) this.root.position.set(p[0], p[1] - this.r * 1.6);
    const fade = Math.min(1, u / 0.15) * (1 - Math.max(0, (u - 0.75) / 0.25)) * this.dim;
    const n = 4 + (fnv1a32(this.shape) % 4);
    const s = this.r * 0.45 * (0.8 + 0.2 * easeOut(Math.min(1, u * 3)));
    const pts: number[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2 + u * 0.4;
      const k = i % 2 === 0 ? s : s * 0.45;
      pts.push(Math.cos(a) * k, Math.sin(a) * k);
    }
    this.g.clear()
      .circle(0, 0, s * 1.35).stroke({ width: 1.5 * this.px, color: this.color, alpha: 0.7 * fade })
      .poly(pts).fill({ color: lighten(this.color, 0.3), alpha: 0.85 * fade });
    return u < 1;
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

// ---- The seed commands ----

const EASE = { inOut: easeInOut, out: easeOut, undock: easeUndock } as const;

/**
 * Weights, tiers and budgets follow the v0 director (05 §5): flares 1 (a grand one counts 3 and is
 * essential), moves 1.5, beams 1, lines and sparks 0.5, rings and marks 0.25, holds and protects 0.
 * Moves, lines, beams and protects are never cut (continuity); decoration is.
 */
export const SEED_COMMANDS: readonly CommandDef[] = Object.freeze([
  {
    name: 'flare', tier: 'narrative', weight: 1, value: 6, cuttable: true, clock: 'accent', reduced: 'ring',
    make(host: FxHost, a: FlareArgs): Fx {
      const layer = host.layer();
      const px = host.px();
      const spec: FlareSpec = { scale: a.scale ?? 1.6, linger: a.linger ?? 3, grand: a.grand, sparks: a.sparks };
      // Ornament off unless calm: lesser flares lose their sparks, and shrink while a grand one bursts.
      const plain = !spec.grand && !host.calm() ? { ...spec, sparks: undefined } : spec;
      const shown = !spec.grand && host.bursting() ? { ...plain, scale: 1 + (plain.scale - 1) * 0.7 } : plain;
      const wait = spec.grand ? host.grandSlot(0, a.capS ?? 4) : 0;
      return new LateFlare(() => {
        const [x, y] = fixed(a.at);
        return new Flare(layer, x, y, a.r, a.color ?? CYAN, shown, px);
      }, wait, !!spec.grand);
    },
  } satisfies CommandDef<FlareArgs>,
  {
    name: 'ring', tier: 'narrative', weight: 0.25, value: 1.5, cuttable: true, clock: 'accent', reduced: 'same',
    make(host: FxHost, a: RingArgs): Fx {
      const [x, y] = fixed(a.at);
      return new Ring(host.layer(), x, y, a.r, a.r1 ?? a.r * 1.4, a.color ?? CYAN, a.durS ?? 0.9, host.px(), a.alpha ?? 0.8);
    },
  } satisfies CommandDef<RingArgs>,
  {
    name: 'ink', tier: 'narrative', weight: 0.5, value: 5, cuttable: false, clock: 'travel', reduced: 'snap',
    make(host: FxHost, a: InkArgs): Fx {
      const scene = host.stage();
      if (a.edge) scene.holdEdge(a.edge);
      const done = a.edge ? () => scene.releaseEdge(a.edge!) : undefined;
      return new Ink(host.layer(), [a.from, a.to], a.color ?? CYAN, a.durS ?? 1, host.px(), a.reverse ?? false, done);
    },
  } satisfies CommandDef<InkArgs>,
  {
    name: 'spark', tier: 'narrative', weight: 0.5, value: 3, cuttable: true, clock: 'accent', reduced: 'skip',
    make(host: FxHost, a: SparkArgs): Fx {
      return new Spark(host.layer(), a.from, a.to, a.color ?? CYAN, a.durS ?? 0.9, host.px(), a.size ?? 12);
    },
  } satisfies CommandDef<SparkArgs>,
  {
    name: 'tractor', tier: 'narrative', weight: 1, value: 10, cuttable: false, clock: 'accent', reduced: 'skip',
    make(host: FxHost, a: BeamArgs): Fx {
      return new Tractor(host.layer(), a.from, a.to, a.toR, a.color ?? TRACTOR, a.durS ?? TRACTOR_S, host.px());
    },
  } satisfies CommandDef<BeamArgs>,
  {
    name: 'support', tier: 'narrative', weight: 1, value: 10, cuttable: false, clock: 'accent', reduced: 'skip',
    make(host: FxHost, a: BeamArgs): Fx {
      return new Support(host.layer(), a.from, a.to, a.toR, a.color ?? TRACTOR, a.durS ?? TRACTOR_S, host.px());
    },
  } satisfies CommandDef<BeamArgs>,
  {
    // Under reduced motion the node just takes its new place (the scene snaps), so the move is skipped.
    name: 'pursue', tier: 'essential', weight: 1.5, value: 15, cuttable: false, clock: 'travel', moves: true, reduced: 'snap',
    make(host: FxHost, a: PursueArgs): Fx {
      const scene = host.stage();
      const start = a.start ?? (scene.liveOf(a.pk) as [number, number] | null) ?? [0, 0];
      if (a.to !== undefined) {
        const to = a.toChoices?.length && a.avoid ? clearOfPlate(host, [a.to, ...a.toChoices], a.avoid, a.clearPx ?? 0, () => scene.drawnR?.(a.pk) ?? 0) : live(a.to);
        // A guest new this beat jumps in at its spot on its first sortie, never flying out (22 C8, K-13).
        return new Sortie(scene, a.pk, start, to, live(a.look ?? a.to), a.durS, a.holdS ?? 0, a.backS ?? a.durS, a.wake ?? 0, scene.takeJump(a.pk), a.waitS ?? 0, a.rideS !== undefined ? { rideS: a.rideS } : null);
      }
      return new Pursue(scene, a.pk, start, a.durS, { lift: a.lift, wake: a.wake, face: a.face, ease: a.ease ? EASE[a.ease] : undefined });
    },
  } satisfies CommandDef<PursueArgs>,
  {
    name: 'hold', tier: 'essential', weight: 0, value: 0, cuttable: false, clock: 'travel', moves: true, reduced: 'same',
    make(host: FxHost, a: HoldArgs): Fx {
      const scene = host.stage();
      const at = a.start ?? (scene.liveOf(a.pk) as [number, number] | null) ?? [0, 0];
      return new HoldFor(scene, a.pk, at, a.durS);
    },
  } satisfies CommandDef<HoldArgs>,
  {
    // Made by the interpreter through the runner (it keeps the protect's actors); this `make` is
    // the fallback for a theme that issues one itself.
    name: 'protect', tier: 'essential', weight: 0, value: 0, cuttable: false, clock: 'travel', reduced: 'same',
    make(host: FxHost, a: ProtectArgs): Fx {
      const keys = new Set(a.keys);
      let t = 0;
      const scene = host.stage();
      const frozen = scene.targetNodes().filter((n) => keys.has(n.canonicalKey)).map((n) => n.projectionKey);
      for (const pk of frozen) scene.freeze(pk);
      return {
        kind: 'travel',
        update: (dt: number) => (t += dt) < a.durS,
        destroy: () => { for (const pk of frozen) scene.thaw(pk); },
      };
    },
  } satisfies CommandDef<ProtectArgs>,
  {
    name: 'insignia', tier: 'ornament', weight: 0.25, value: 0.5, cuttable: true, clock: 'accent', reduced: 'ring',
    make(host: FxHost, a: InsigniaArgs): Fx {
      insigniaLog.push({ id: a.shape, calledAt: a.calledAt ?? null, litAt: performance.now() });
      if (insigniaLog.length > 64) insigniaLog.shift(); // a test hook's log: never grows without bound
      return new Insignia(host.layer(), live(a.at), a.r, a.shape, a.color ?? 0xffc76b, a.durS ?? 2.4, host.px());
    },
  } satisfies CommandDef<InsigniaArgs>,
] as CommandDef[]);

// ---- The registry ----

const defs = new Map<string, CommandDef>();

function seed(): void {
  defs.clear();
  for (const d of SEED_COMMANDS) defs.set(d.name, d);
}
seed();

/** Registers a command; a later def with the same name overrides it (a theme's override). */
export function registerCommand(def: CommandDef): void {
  defs.set(def.name, def);
}

export function commandByName(name: string): CommandDef | undefined {
  return defs.get(name);
}

/** Every registered command, by name (tests, the gallery). */
export function allCommands(): CommandDef[] {
  return [...defs.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Back to the seed commands (a theme switch, tests). */
export function resetCommands(): void {
  seed();
}

/**
 * The call to make under reduced motion (INV-20): the same call, a ring where it was, another
 * command, or null to skip it. `snap` is a skip whose end state the scene already shows; an ink
 * that was revealing a held edge releases it at once.
 */
export function reducedCall(def: CommandDef, c: { cmd: string; args: unknown; delayMs?: number; value?: number }, host: FxHost): { cmd: string; args: unknown; delayMs?: number; value?: number } | null {
  const r = def.reduced;
  if (r === 'same') return c;
  if (r === 'skip') return null;
  if (r === 'snap') {
    const edge = (c.args as Partial<InkArgs>)?.edge;
    if (edge) host.stage().releaseEdge(edge);
    return null;
  }
  if (r === 'ring') {
    const a = c.args as Partial<PointArgs & BeamArgs>;
    const at = a.at ?? a.to ?? a.from;
    if (at === undefined) return null;
    const r0 = (a.r ?? a.toR ?? 12 * host.px()) * 1.2;
    return { cmd: 'ring', args: { at, r: r0, r1: r0, color: a.color ?? CYAN, durS: 0.9, alpha: 0.9 } satisfies RingArgs, delayMs: c.delayMs };
  }
  return { ...c, cmd: r.use };
}

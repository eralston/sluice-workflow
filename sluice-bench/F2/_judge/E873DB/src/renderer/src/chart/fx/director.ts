// 05 §5 — the AnimationDirector: plays one beat's accents on the current scene, once, on the frame
// after the beat's state is applied. Accents whose entity has no projection here are skipped, never
// deferred. It also owns jump trails: the lingering streaks a departing captain leaves, labelled
// with where they went and a Go button.
//
// Continuity (05 §5, 2026-10-03): the scene glides every node to its new layout, so most change of
// place needs no effect at all. Effects that do move something take the node over and *pursue* its
// live target, and lines reach for live anchors, so nothing jumps when the layout shifts mid-flight.
// Which effects play is gated by a volatility meter: essential always, narrative unless the scene
// is busy, ornament only when it's calm.
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Snapshot, ViewEdge, ViewGraph, ViewNode } from '@shared/contracts/view';
import { workItemId } from '@shared/contracts/keys';
import { MAX_TRAILS } from '@shared/playback/constants';
import { ENGAGEMENT, type Engagement } from '@shared/playback/engagement';
import { BOARD } from '@shared/scene/board';
import type { PlannedAccent } from '@shared/playback/plan';
import { lighten } from '../art/lit';
import { motion } from '../art/motion';
import { NEARING, PROGRESS, READY, RUNG_COLOR, signalOf, SUCCESS } from '../art/progress';
import type { GraphScene } from '../scenes/GraphScene';
import { After, Beam, easeOut, easeUndock, Flare, Glyph, Implode, Ink, Intent, Ring, Spark, Support, Tractor, type Anchor, type FlareSpec, type Fx } from './effects';
import type { Hierarchy } from '@shared/hierarchy/types';
import { ARRIVE_S, BERTH_S, BODY_KINDS, BUSY, BUSY_ECHOES, CALM, CYAN, DISPERSE_AFTER_S, DUCK, ECHO_DELAY_S, ECHO_S, FLARE_KINDS, GATHER_S, GRAND_BURST_S, GUEST_ARRIVE_S, INCH_PX, JOIN_S, LAUNCH_FLY_S, LAUNCH_INTENT_S, MOVE_S, NAV_GREEN, OVERLOAD, RECAP_MAX, RECAP_STEP_S, ROUTE_INK_S, STAGGER_S, TARGET_KINDS, TRACTOR, TRACTOR_LEAD_S, TRACTOR_S, TRAIL_COLOR, clip, ornamentOk } from './timing';
import { activeProfile } from '../../profile';
import { Departure, FadeIn, Hold, OrbitTravel, Pursue, RadarMove, Withdraw } from './moves';
import { Escort, GuestShip, ShipTell } from './ships';
import { Eclipse, GlowTell, Protect } from './moments';
import { JumpTrail, destinationOf, exitDir } from './trails';
import type { FxDirector } from './types';

export interface BeatContext {
  plan: PlannedAccent[];
  /** How much the ships do (Activity, 05 §5). Absent: Calm, the pace before the dial. */
  eng?: Engagement;
  history: ScopeHistory;
  /** State after the beat. */
  snapshot: Snapshot;
  before: { graph: ViewGraph; nodes: ViewNode[] };
  after: ViewGraph;
}

export interface DirectorHost {
  scene(): GraphScene | null;
  /** The hierarchy the scenes belong to: a scene's layout, and where an item lives. */
  hierarchy(): Hierarchy;
  worldToScreen(x: number, y: number): { x: number; y: number };
  labelHost: HTMLElement;
  /** A trail's Go button: open the destination's scene. */
  /** `captain`: a ship's departure trail; Go follows them there (05 §5). */
  onGo(key: CanonicalKey, captain?: CanonicalKey): void;
  /** Show a label's title briefly (a new or changed Task, 06 §4). */
  flashLabel(projectionKey: string): void;
  /** A node's shown plate, in world units, or null (22 B9: a sortie parks clear of its work's plate). Optional. */
  plateWorld?(projectionKey: string): { x0: number; y0: number; x1: number; y1: number } | null;
}

/** The flare for a stage change (06 §5 flare table): bigger with each rung. */
function flareFor(fromStage: string | undefined, toStage: string | undefined): { color: number; spec: FlareSpec } | null {
  const to = signalOf(toStage ?? '');
  switch (to.rung) {
    case 'accomplished': return { color: SUCCESS, spec: { scale: 2, linger: 6, grand: true } };
    case 'nearing': return { color: NEARING, spec: { scale: 1.75, linger: 4, sparks: SUCCESS } };
    case 'underway': return { color: PROGRESS, spec: { scale: 1.6, linger: 4 } };
    case 'ready': return fromStage === toStage ? null : { color: READY, spec: { scale: 1.25, linger: 2 } };
    default: return null; // off the ladder: a quiet ghosting fade (the stage look itself)
  }
}

/** A captain's ship flying: across the scene to a new assignment, or in from the edge. */

/**
 * The radar ping (06 §5): a Task changing band collapses to a point, runs as a spark along its spoke,
 * and re-expands in its new band; `onLand` plays the landing (its rung's flare, an echo).
 */

/** A captain's ship winding up before it flies (the tell): it turns, backs off a touch, engines glow. */

export class AnimationDirector implements FxDirector {
  private fx: Fx[] = [];
  private trails: JumpTrail[] = [];
  /** Lead-in tells for the next beat (05 §5): cancelled when it plays, or by any seek. */
  private tells: Fx[] = [];
  /** The beat the tells were for, and which of its events already showed their beam. */
  private told: { index: number; beams: Set<string> } | null = null;
  private pending: BeatContext | null = null;
  /** Effect clock (s), and when the next grand flare may burst. */
  private clock = 0;
  private grandFree = 0;
  /** The effect steering each node, so a new move takes over from where the node is, never a jump. */
  private readonly movers = new Map<string, Fx>();
  /** Effects retired early (taken over, cut): skipped by the update pass, whichever list holds them. */
  private readonly dead = new WeakSet<Fx>();

  constructor(private readonly host: DirectorHost) {}

  /** Play a beat's accents once the scene has laid out its new state (next update). */
  queue(ctx: BeatContext): void {
    this.pending = ctx;
  }

  /** Seek, lens toggle, or scene change: cancel every effect, tell, and trail (INV-15). */
  clear(): void {
    this.pending = null;
    for (const f of [...this.fx, ...this.tells]) f.destroy();
    this.fx = [];
    this.tells = [];
    this.told = null;
    this.movers.clear();
    for (const t of this.trails) t.destroy();
    this.trails = [];
    this.host.scene()?.releaseAllEdges();
    this.host.scene()?.thawAll();
    this.host.scene()?.landAllStages();
  }

  activeCount(): number {
    return this.fx.length + this.tells.length;
  }

  trailCount(): number {
    return this.trails.length;
  }

  /**
   * The volatility meter (05 §5 tiers): how much is moving on screen right now. Flights and pings
   * weigh most, grand flares more than lesser ones, lines least; nodes still gliding count a little.
   */
  volatility(): number {
    let v = 0;
    for (const f of this.fx) {
      if (f instanceof After) continue;
      if (f instanceof Flare) v += f.grand ? 3 : 1;
      else if (f instanceof Pursue || f instanceof RadarMove || f instanceof Departure || f instanceof Escort || f instanceof GuestShip) v += 1.5;
      else if (f instanceof Tractor || f instanceof Support) v += 1;
      else if (f instanceof Hold || f instanceof Protect) continue;
      else if (f instanceof Beam || f instanceof Ink || f instanceof Spark || f instanceof Intent) v += 0.5;
      else v += 0.25;
    }
    return v + (this.host.scene()?.glidingCount() ?? 0) * 0.3 + this.bias;
  }

  /** Test hook: extra volatility, to exercise the tiers deterministically. */
  bias = 0;

  /** Live effects by type, for the test hooks. */
  census(): { flares: number; grand: number; sparks: number; beams: number; inks: number; rings: number; moves: number; guests: number; glyphs: number; started: number } {
    const c = { flares: 0, grand: 0, sparks: 0, beams: 0, inks: 0, rings: 0, moves: 0, guests: 0, glyphs: 0, started: this.tractorsStarted };
    for (const f of [...this.fx, ...this.tells]) {
      if (f instanceof Flare) { c.flares++; if (f.grand) c.grand++; }
      else if (f instanceof Spark) c.sparks++;
      else if (f instanceof Beam || f instanceof Tractor || f instanceof Support) c.beams++;
      else if (f instanceof Ink || f instanceof Intent) c.inks++;
      else if (f instanceof Ring) c.rings++;
      else if (f instanceof Pursue || f instanceof RadarMove || f instanceof Departure || f instanceof Escort) c.moves++;
      else if (f instanceof GuestShip) { c.moves++; c.guests++; }
      else if (f instanceof Glyph) c.glyphs++;
    }
    return c;
  }

  /** Calm enough for ornament (the recap, the dawn sweep, seed sparks). */
  calm(): boolean {
    return ornamentOk(this.volatility());
  }

  /**
   * Once per frame, after the scene's layout pass. `frozen`: the user paused, so effects hold in
   * place. `scheduleDtMs`: schedule time elapsed this frame (trails age on playback time).
   */
  update(dtMs: number, scheduleDtMs: number, frozen: boolean): void {
    const scene = this.host.scene();
    if (!scene) return;
    if (this.pending) {
      const ctx = this.pending;
      this.pending = null;
      this.spawn(scene, ctx);
    }
    if (!frozen) {
      const dt = dtMs / 1000;
      this.clock += dt * motion.pulse;
      // Effects may spawn follow-ups as they finish (an arrival ring): those join after this pass.
      const step = (list: Fx[]) => list.filter((f) => {
        if (this.dead.has(f)) return false;
        let alive: boolean;
        try {
          alive = f.update(dt * (f.kind === 'travel' ? motion.travel : motion.pulse));
        } catch (e) {
          // One broken effect must never stop playback: retire it and carry on.
          console.error('effect failed; retired', e);
          alive = false;
        }
        if (!alive) this.retire(f);
        return alive;
      });
      const running = this.fx;
      this.fx = [];
      const kept = step(running);
      this.fx = [...kept, ...this.fx];
      this.tells = step(this.tells);
      // Ducking: while a grand flare bursts, everything decorative dims so the moment stays clear.
      const bursting = this.fx.some((f) => f.grand && f instanceof Flare && f.age < GRAND_BURST_S * 1.6);
      for (const f of this.fx) if (!f.grand) f.duck?.(bursting ? DUCK : 1);
    }
    for (const t of this.trails) {
      t.age += scheduleDtMs;
      t.render();
    }
    this.trails = this.trails.filter((t) => {
      if (t.done) t.destroy();
      return !t.done;
    });
  }

  private retire(f: Fx): void {
    if (this.dead.has(f)) return;
    this.dead.add(f);
    f.destroy();
    for (const [pk, m] of this.movers) if (m === f) this.movers.delete(pk);
  }

  /** Effects the budget may cut: decoration. Never a move (cutting one would snap its node) or a pending step. */
  private cuttable(f: Fx): boolean {
    return !f.grand && !(f instanceof After || f instanceof Hold || f instanceof Protect || f instanceof Pursue || f instanceof RadarMove || f instanceof Departure || f instanceof Intent || f instanceof Ink || f instanceof Escort || f instanceof GuestShip || f instanceof Tractor || f instanceof Support);
  }

  /** Tractor beams started since this director was made (a running total, for the test hooks). */
  private tractorsStarted = 0;

  private add(f: Fx): void {
    if (f instanceof Tractor) this.tractorsStarted++;
    this.fx.push(f);
    // Budget: past the cap, cut the oldest decorative effect. Moves, pending steps, and revealing
    // ink are never cut (continuity), so the cap counts only what may go.
    while (this.fx.filter((x) => this.cuttable(x)).length > activeProfile().render.limits.maxActiveFx) {
      const i = this.fx.findIndex((x) => this.cuttable(x));
      if (i < 0) break;
      const [cut] = this.fx.splice(i, 1);
      if (cut) this.retire(cut);
    }
  }

  /**
   * Start a node's move. A move already steering it is retired first, and the new one starts where the
   * node is drawn now. With a `delay` (stagger), the node is held where it is until the move begins,
   * so it never drifts toward its new place and snaps back.
   */
  private move(scene: GraphScene, pk: string, make: (from: [number, number]) => Fx, from: [number, number], delay = 0, owner?: string): void {
    const prev = this.movers.get(pk);
    // A protected moment's cast (05 §5): only the moment moves it; anything else starts once it ends.
    const wait = this.blockedFor(scene, pk, owner);
    if (wait > delay + 1e-3) {
      if (prev) {
        // Let the moment's own mover finish, then start from wherever it left the node.
        this.fx.push(new After(wait, () => this.move(scene, pk, make, (scene.liveOf(pk) as [number, number] | null) ?? from, 0, owner)));
        return;
      }
      delay = wait;
    }
    let start = from;
    if (prev) {
      start = (scene.liveOf(pk) as [number, number] | null) ?? from;
      this.fx = this.fx.filter((f) => f !== prev);
      this.retire(prev);
    }
    if (delay > 1e-3) {
      const hold = new Hold(scene, pk, start);
      this.movers.set(pk, hold);
      this.fx.push(hold);
      this.fx.push(new After(delay, () => {
        if (this.movers.get(pk) !== hold) return; // something else took the node over meanwhile
        this.move(scene, pk, make, start);
      }));
      return;
    }
    const f = make(start);
    this.movers.set(pk, f);
    this.add(f);
  }

  /** How long a node stays protected from movers other than `owner` (effect-seconds; 0 if free). */
  private blockedFor(scene: GraphScene, pk: string, owner?: string): number {
    let wait = 0;
    let node: ViewNode | undefined;
    for (const f of this.fx) {
      if (!(f instanceof Protect) || f.eventKey === owner || this.dead.has(f)) continue;
      node ??= scene.targetNodes().find((n) => n.projectionKey === pk);
      if (node && f.matches(node)) wait = Math.max(wait, f.remaining);
    }
    return wait;
  }

  /** Run `fn` now, or after `delay` effect-seconds (stagger, follow-ups). */
  private at(delay: number, fn: () => void): void {
    if (delay <= 1e-3) fn();
    else this.fx.push(new After(delay, fn));
  }

  /**
   * The tell (05 §5): during the gap before a beat, while playing, the actors wind up: ships turn and
   * their engines glow, an actor's beam reaches for the item, a body's rim brightens, a station's bay
   * glows. Narrative tier: skipped when the scene is busy. Tells move at the playback rate, so they end
   * on the beat.
   */
  tell(ctx: BeatContext, beatIndex: number, leadS: number): void {
    const scene = this.host.scene();
    const eng = ctx.eng ?? ENGAGEMENT.calm;
    if (!scene || motion.reduced || (!eng.ignoreLoad && this.volatility() >= BUSY)) return;
    for (const t of this.tells) t.destroy();
    this.tells = [];
    this.told = { index: beatIndex, beams: new Set() };
    const px = 1 / scene.currentScale();
    const now = scene.effectiveNodes();
    const after = new Map(ctx.after.nodes.map((n) => [n.projectionKey, n])); // projected: no live layout yet
    const of = (key: CanonicalKey, kinds: Set<string>) => now.filter((n) => n.canonicalKey === key && kinds.has(n.kind) && scene.hasView(n.projectionKey));
    const ships = new Set<string>();
    for (const a of ctx.plan) {
      if (a.name.startsWith('stageShift.')) {
        const targets = of(a.entityKey, BODY_KINDS).filter((n) => n.selectable || n.kind === 'star');
        const to = signalOf(a.toStage ?? '').rung;
        for (const n of targets) this.tells.push(new GlowTell(scene, n.world.x, n.world.y, n.world.r, RUNG_COLOR[to === 'off' ? 'ready' : to], leadS));
      } else if (a.name === 'launch') {
        const pk = [...after.values()].find((n) => n.kind === 'flight' && n.canonicalKey === a.entityKey)?.projectionKey;
        const st = pk ? stationOf(ctx.after, after, pk) : undefined;
        const at = st ? now.find((n) => n.projectionKey === st.projectionKey) : undefined;
        if (at) this.tells.push(new GlowTell(scene, at.world.x, at.world.y, at.world.r * 0.7, PROGRESS, leadS));
      }
    }
    // Every ship about to fly (to new work, a new assignment, or out of the scene) turns and warms its
    // engines; a ship staying put, or only gliding a short way, does nothing.
    const leaving = new Set(ctx.plan.filter((p) => p.name === 'captainJump' && p.leaving).map((p) => p.leaving!));
    for (const ship of now.filter((n) => n.kind === 'captain')) {
      if (ships.has(ship.projectionKey) || this.blockedFor(scene, ship.projectionKey) > 0) continue; // held by a protected moment
      const next = after.get(ship.projectionKey);
      let dir: [number, number] | null = null;
      if (!next) dir = leaving.has(ship.canonicalKey) ? exitDir(ship, ctx.after) : null;
      else if (next.attach?.to !== ship.attach?.to) {
        // Moving to work beside something else: head toward it (the projection's positions are hints).
        const goal = now.find((n) => n.projectionKey === next.attach?.to) ?? next;
        const dx = goal.world.x - ship.world.x;
        const dy = goal.world.y - ship.world.y;
        const l = Math.hypot(dx, dy);
        if (l / px >= INCH_PX) dir = [dx / l, dy / l];
      }
      if (!dir) continue;
      ships.add(ship.projectionKey);
      this.tells.push(new ShipTell(scene, ship.projectionKey, [ship.world.x, ship.world.y], ship.world.r, dir, leadS));
    }
  }

  /**
   * The recap bloom (06 §5): playing reached the end, so everything accomplished in the range glows
   * once, in the order it finished. Ornament: it waits (up to a few seconds) for the scene to calm.
   * Never on open, and never on a seek.
   */
  recap(keys: CanonicalKey[]): void {
    const scene = this.host.scene();
    if (!scene) return;
    let waited = 0;
    const tryNow = () => {
      if (this.volatility() >= CALM && waited < 4) {
        waited += 0.25;
        this.at(0.25, tryNow);
        return;
      }
      const px = 1 / scene.currentScale();
      const layer = scene.fxLayer();
      const now = scene.targetNodes();
      let i = 0;
      for (const key of keys) {
        const n = now.find((x) => x.canonicalKey === key && (BODY_KINDS.has(x.kind) || x.kind === 'flight') && (x.selectable || x.kind === 'star') && scene.hasView(x.projectionKey));
        if (!n) continue;
        if (i >= RECAP_MAX) break;
        this.at(0.2 + i++ * RECAP_STEP_S, () => this.add(motion.reduced
          ? new Ring(layer, n.world.x, n.world.y, n.world.r * 1.1, n.world.r * 1.3, SUCCESS, 1, px, 0.8)
          : new Flare(layer, n.world.x, n.world.y, n.world.r, SUCCESS, { scale: 1.45, linger: 2.4 }, px)));
      }
    };
    this.at(0.3, tryNow);
  }

  private spawn(scene: GraphScene, ctx: BeatContext): void {
    for (const t of this.tells) t.destroy(); // the beat has come: the wind-up gives way to the act
    this.tells = [];
    this.told = null;
    const px = 1 / scene.currentScale();
    const layer = scene.fxLayer();
    // Accents aim where this beat's state puts things (targets), starting from where they were drawn.
    const now = scene.targetNodes();
    const before = new Map(ctx.before.nodes.map((n) => [n.projectionKey, n]));
    const after = new Map(now.map((n) => [n.projectionKey, n]));
    const of = (key: CanonicalKey, kinds?: Set<string>) => now.filter((n) => n.canonicalKey === key && (!kinds || kinds.has(n.kind)) && scene.hasView(n.projectionKey));
    const live = (pk: string): Anchor => () => scene.liveOf(pk);
    const goal = (pk: string): Anchor => () => scene.goalOf(pk);
    const screenDist = (a: ViewNode, b: ViewNode) => Math.hypot(a.world.x - b.world.x, a.world.y - b.world.y) / px;
    const reduced = motion.reduced;
    const hier = this.host.hierarchy();
    // A field of systems (the sector): changes inside a system glint on its star instead (05 §5).
    const isSector = hier.resolve(ctx.after.sceneKey)?.def.layout === 'field';
    const beatS = Math.max(0.5, ...ctx.plan.map((a) => a.durationMs / 1000));
    let sectorPulsed = false;
    const beamed = new Set<string>();
    const echoed = new Set<string>();

    // Tiers (05 §5): essential always; narrative unless overloaded (and rationed when busy); ornament only when calm.
    const v = this.volatility() + ctx.plan.length * 0.6;
    const eng = ctx.eng ?? ENGAGEMENT.calm;
    const calm = ornamentOk(v);
    // Maximum activity lets the scene be full: the load tiers no longer ration beams (Activity, 05 §5).
    const busy = !eng.ignoreLoad && v >= BUSY;
    const narrative = eng.ignoreLoad || v < OVERLOAD;
    let echoes = 0;

    // Stagger (05 §5): parent outward: Features, then Stories and Bugs, then Tasks, then PRs. Every
    // Task in the beat shares one delay, so a wave of Tasks moves as one.
    const levelOf = (a: PlannedAccent) => {
      if (a.prKey || a.name === 'launch' || a.name === 'dock' || a.name === 'withdraw') return 3;
      return hier.rankOf(ctx.snapshot, a.entityKey);
    };
    const levels = [...new Set(ctx.plan.map(levelOf))].sort();
    // Plus any wait for a protected moment in this beat whose cast it would move (05 §5).
    const delayOf = (a: PlannedAccent) => levels.indexOf(levelOf(a)) * STAGGER_S + (a.afterMs ?? 0) / 1000;

    // Protected moments (05 §5): register each one's cast before anything in the beat moves.
    for (const a of ctx.plan) {
      const p = a.protect;
      if (!p || !of(a.entityKey).length) continue; // only where the moment is on screen
      const people = new Set(p.people);
      const entities = new Set(p.entities);
      const matches = (n: ViewNode) => p.whole || entities.has(n.canonicalKey) || (p.lane && n.kind === 'flight') || (n.kind === 'captain' && people.has(n.canonicalKey));
      this.add(new Protect(scene, a.eventKey, matches, delayOf(a) + p.windowMs / 1000));
    }

    const flareAt = (n: ViewNode, color: number, spec: FlareSpec, delay = 0) => {
      if (reduced) {
        this.at(delay, () => this.add(new Ring(layer, n.world.x, n.world.y, n.world.r * 1.2, n.world.r * 1.2, color, 1.5, px, 0.9)));
        return;
      }
      let start = delay;
      if (spec.grand) {
        // One grand burst at a time: a second waits for the first to settle, within its own beat.
        start = Math.min(Math.max(delay, this.grandFree - this.clock), beatS);
        this.grandFree = this.clock + start + GRAND_BURST_S;
      }
      // Ornament off unless calm: lesser flares lose their sparks.
      const plain = !spec.grand && !calm ? { ...spec, sparks: undefined } : spec;
      this.at(start, () => {
        // Lesser flares shrink while a grand one bursts.
        const shrink = !spec.grand && this.grandFree > this.clock;
        this.add(new Flare(layer, n.world.x, n.world.y, n.world.r, color, shrink ? { ...plain, scale: 1 + (plain.scale - 1) * 0.7 } : plain, px));
      });
    };
    /** The echo (06 §5): completion travels up the hierarchy, along the spoke or orbit, and rings the parent. */
    const echo = (n: ViewNode, key: CanonicalKey, delay: number) => {
      if (reduced || !narrative || isSector) return;
      if (busy && echoes >= BUSY_ECHOES) return;
      const parentKey = ctx.snapshot.workItems.get(key)?.parentKey;
      const parent = parentKey ? of(parentKey, BODY_KINDS)[0] : undefined;
      if (!parent) return;
      echoes++;
      const limb: Anchor = () => {
        const p = scene.liveOf(parent.projectionKey);
        const c = scene.liveOf(n.projectionKey) ?? [n.world.x, n.world.y];
        if (!p) return null;
        const dx = c[0] - p[0];
        const dy = c[1] - p[1];
        const l = Math.hypot(dx, dy) || 1;
        return [p[0] + (dx / l) * parent.world.r, p[1] + (dy / l) * parent.world.r];
      };
      this.at(delay, () => this.add(new Spark(layer, live(n.projectionKey), limb, SUCCESS, ECHO_S, px, 10, () => {
        if (echoed.has(parent.projectionKey)) return;
        echoed.add(parent.projectionKey); // one ring on the parent per beat, however many echoes reach it
        this.add(new Ring(layer, parent.world.x, parent.world.y, parent.world.r * 1.0, parent.world.r * 1.14, lighten(SUCCESS, 0.2), 1.2, px, 0.6));
      })));
    };
    /**
     * Cause → effect (06 §5): the actor's ship (never the assignee's) works the item with a tractor
     * beam. The projection has already moved the ship's resting place to where it now works, so if it
     * moved far enough to fly, the beam engages on arrival; otherwise at once. Returns the delay it adds
     * before the change shows.
     */
    const engaged = new Map<string, ViewNode>();
    /** Which protected moment engaged a ship, so its flight there counts as the moment's own move. */
    const engagedBy = new Map<string, string>();
    const flightOf = (ship: ViewNode) => {
      const was = before.get(ship.projectionKey);
      return was && screenDist(was, ship) >= INCH_PX ? MOVE_S : 0;
    };
    /** Ship actions started this beat, the guests summoned, and when each ship's beam may start (stagger). */
    let actions = 0;
    let guests = 0;
    const engagedAt = new Map<string, number>();
    const acted = new Set<CanonicalKey>();
    /** A person with no ship in the scene comes in as a guest, works the item with a beam, and leaves. */
    const summon = (actor: CanonicalKey, item: ViewNode, delay: number): number => {
      if (isSector || guests >= eng.maxGuests || acted.has(actor)) return 0;
      const who = ctx.history.entities.captains.find((x) => x.key === actor);
      if (!who) return 0;
      guests++;
      acted.add(actor);
      const shipR = now.find((n) => n.kind === 'captain')?.world.r ?? 29 * px;
      const dir = exitDir(item, ctx.after);
      const reach = 260 * px;
      const itemAt = () => scene.liveOf(item.projectionKey) as [number, number] | null;
      const slot = (): [number, number] => {
        const c = itemAt() ?? [item.world.x, item.world.y];
        return [c[0] + dir[0] * (item.world.r + shipR * 2.4), c[1] + dir[1] * (item.world.r + shipR * 2.4)];
      };
      const p0 = slot();
      const entry: [number, number] = [p0[0] + dir[0] * reach, p0[1] + dir[1] * reach];
      const hold = TRACTOR_S + 0.2;
      this.at(delay, () => {
        const guest = new GuestShip(this.host, scene, slot, entry, entry, GUEST_ARRIVE_S + hold, itemAt, who.shipSeed, shipR, who.displayName, GUEST_ARRIVE_S, who.avatar);
        this.add(guest);
        this.at(GUEST_ARRIVE_S, () => this.add(new Tractor(layer, () => guest.at, itemAt, item.world.r, TRACTOR, TRACTOR_S, px)));
      });
      return GUEST_ARRIVE_S + TRACTOR_LEAD_S;
    };
    const beamFrom = (a: PlannedAccent, item: ViewNode | undefined, delay: number, actor = a.actorKey): number => {
      if (!actor || !item || reduced || !narrative) return 0;
      if (busy && beamed.size >= 1) return 0; // rationed when busy: one per beat
      if (actions >= eng.actionsPerBeat) return 0;
      const ship = now.find((n) => n.kind === 'captain' && n.canonicalKey === actor);
      if (!ship) {
        const lead = summon(actor, item, delay);
        if (lead) actions++;
        return lead;
      }
      if (beamed.has(ship.projectionKey)) return 0;
      beamed.add(ship.projectionKey); // one per ship per beat
      acted.add(actor);
      actions++;
      engaged.set(ship.projectionKey, item);
      if (eng.staggerS > 0 && actions > 1) engagedAt.set(ship.projectionKey, (actions - 1) * eng.staggerS);
      if (a.protect) engagedBy.set(ship.projectionKey, a.eventKey);
      return Math.max(0, flightOf(ship) + TRACTOR_LEAD_S - delay);
    };
    /**
     * Sector scale (05 §5): a descendant's change shows on its Feature's star as a glyph (a glint for a
     * Story or Bug, specks for Tasks, a spoke for a PR), at most one of each per star per beat, plus
     * one soft `sectorPulse` wash per beat for the whole sector.
     */
    const glyphed = new Set<string>();
    const pulseFeatureOf = (key: CanonicalKey, color = CYAN) => {
      if (!isSector) return;
      const kind = ctx.snapshot.workItems.get(key)?.kind;
      // The star of the system that holds it.
      const stage = hier.stageOf(ctx.snapshot, key, ctx.history);
      const star = stage ? of(stage.key, new Set(['star']))[0] : undefined;
      if (!star) return;
      if (!sectorPulsed) {
        sectorPulsed = true; // at most one sector pulse per beat (05 §5)
        this.add(new Ring(layer, star.world.x, star.world.y, star.world.r, star.world.r * (reduced ? 1 : 1.8), lighten(CYAN, 0.3), 1.4, px, 0.55));
      }
      const look = prGlyph.has(key) ? 'spoke' : kind === 'task' ? 'specks' : kind === 'story' || kind === 'bug' ? 'glint' : null;
      if (!look || reduced || glyphed.has(`${star.projectionKey}|${look}`)) return;
      glyphed.add(`${star.projectionKey}|${look}`);
      this.add(new Glyph(layer, live(star.projectionKey) as () => [number, number], star.world.r, look, color, px));
    };
    /** Items a PR glyph is drawn for (a PR has no projection at sector scale: it shows on its work's star). */
    const prGlyph = new Set<CanonicalKey>();
    const pulsePr = (prKey: CanonicalKey, color: number) => {
      const link = ctx.snapshot.links.find((l) => l.kind === 'pr' && l.fromKey === prKey);
      if (!link) return;
      prGlyph.add(link.toKey);
      pulseFeatureOf(link.toKey, color);
      prGlyph.delete(link.toKey);
    };
    /** A body that left the scene (reparent, area move): fade where it was, and leave a trail to Go to. */
    const leftScene = (was: ViewNode, dest: { key: CanonicalKey; label: string } | null) => {
      this.add(new Ring(layer, was.world.x, was.world.y, was.world.r, was.world.r * 0.4, RUNG_COLOR.off, 1.1, px, 0.6));
      if (!dest) return;
      const dir = exitDir(was, ctx.after);
      const reach = 220 * px;
      const from: [number, number] = [was.world.x, was.world.y];
      const to: [number, number] = [from[0] + dir[0] * reach * 0.8, from[1] + dir[1] * reach * 0.8];
      while (this.trails.length >= MAX_TRAILS) this.trails.shift()?.destroy();
      this.trails.push(new JumpTrail(this.host, scene, from, to, px, dest));
      if (!reduced) this.add(new Spark(layer, from, to, TRAIL_COLOR, ECHO_S, px, 16));
    };
    /** Reveal a held line with ink between live anchors, then hand it to the static drawing. */
    const inkEdge = (e: ViewEdge, from: Anchor, to: Anchor, color: number, dur: number, delay = 0) => {
      scene.holdEdge(e.key);
      if (reduced) {
        scene.releaseEdge(e.key);
        return;
      }
      this.at(delay, () => this.add(new Ink(layer, [from, to], color, dur, px, false, () => scene.releaseEdge(e.key))));
    };

    const jumpers = new Set<CanonicalKey>();
    for (const a of ctx.plan) {
      const delay = delayOf(a);
      switch (a.name) {
        case 'stageShift.feature': case 'stageShift.story': case 'stageShift.bug': case 'stageShift.task': {
          const f = flareFor(a.fromStage, a.toStage);
          const from = signalOf(a.fromStage ?? '').rung;
          const to = signalOf(a.toStage ?? '').rung;
          const reopen = from === 'accomplished' && to !== 'accomplished' && to !== 'off';
          const targets = of(a.entityKey, FLARE_KINDS).filter((n) => n.selectable || n.kind === 'star');
          if (!targets.length) pulseFeatureOf(a.entityKey, to === 'off' ? RUNG_COLOR.off : RUNG_COLOR[to]);
          const lead = beamFrom(a, targets[0], delay);
          for (const n of targets) {
            const was = before.get(n.projectionKey);
            const moved = n.radar && was && Math.hypot(was.world.x - n.world.x, was.world.y - n.world.y) > 1;
            scene.claimStage(n.projectionKey); // its new look lands with its flare, after the cause (06 §5)
            const land = () => {
              scene.landStage(n.projectionKey);
              if (n.kind === 'missionPoint') this.host.flashLabel(n.projectionKey); // which Task just moved
              const at = scene.goalOf(n.projectionKey) ?? [n.world.x, n.world.y];
              const here = { ...n, world: { ...n.world, x: at[0], y: at[1] } };
              if (reopen && !reduced) this.add(new Implode(layer, at[0], at[1], n.world.r, SUCCESS, RUNG_COLOR[to], px));
              else if (f) {
                // In the radar, Tasks get the smaller flares; the grand one is for planets and PRs.
                const spec = n.kind === 'missionPoint' && f.spec.grand ? { scale: 1.7, linger: 3.5, sparks: SUCCESS } : f.spec;
                flareAt(here, f.color, spec);
              }
              if (to === 'accomplished') echo(here, a.entityKey, ECHO_DELAY_S);
            };
            if (moved && !reduced) {
              // Held where it was until its ping begins (stagger, the actor's beam), never drifting ahead.
              this.move(scene, n.projectionKey, (start) => new RadarMove(scene, n.projectionKey, start, f?.color ?? CYAN, px, land), [was.world.x, was.world.y], delay + lead);
            } else this.at(delay + lead, land);
          }
          // A Task dot in a Feature system isn't selectable, but its completion still echoes to its planet.
          if (!targets.length && to === 'accomplished') for (const dot of of(a.entityKey, new Set(['missionPoint']))) echo(dot, a.entityKey, delay);
          // A Task removed from the radar dissolves where it was.
          if (to === 'off') {
            for (const was of ctx.before.nodes) {
              if (was.canonicalKey !== a.entityKey || !was.radar || after.has(was.projectionKey)) continue;
              this.at(delay, () => {
                this.add(new Ring(layer, was.world.x, was.world.y, was.world.r * 1.2, was.world.r * 0.2, RUNG_COLOR.off, 1.2, px, 0.7));
                if (!reduced) this.add(new Flare(layer, was.world.x, was.world.y, was.world.r, RUNG_COLOR.off, { scale: 1.3, linger: 2 }, px));
              });
            }
          }
          break;
        }
        case 'emerge.feature': case 'emerge.story': case 'emerge.bug': case 'emerge.task': {
          const fresh = of(a.entityKey).filter((n) => !before.has(n.projectionKey));
          if (!fresh.length) pulseFeatureOf(a.entityKey);
          for (const n of fresh) {
            if (n.kind === 'missionPoint') this.at(delay + 0.3, () => this.host.flashLabel(n.projectionKey)); // name the new Task
            // Ornament: a seed spark where the child will appear, just ahead of its fade-up.
            const seed = calm && !reduced;
            // The one arrival motion (decided 2026-10-08): along its orbit, with a streak and a ring.
            scene.arrive(n.projectionKey, delay + (seed ? 0.3 : 0));
            if (seed) this.at(delay, () => {
              this.add(new Ring(layer, n.world.x, n.world.y, n.world.r * 0.1, n.world.r * 0.55, lighten(CYAN, 0.6), 0.5, px, 0.95));
              this.add(new Ring(layer, n.world.x, n.world.y, n.world.r * 0.6, n.world.r * 1.6, lighten(CYAN, 0.4), a.durationMs / 1000, px, 0.6));
            });
          }
          break;
        }
        case 'captainJump':
          if (a.leaving) jumpers.add(a.leaving);
          if (a.arriving) jumpers.add(a.arriving);
          break;
        case 'orbitDraw': case 'orbitFade': {
          const graph = a.name === 'orbitDraw' ? ctx.after : ctx.before.graph;
          const nodes = a.name === 'orbitDraw' ? after : before;
          for (const e of graph.edges) {
            const child = nodes.get(e.to);
            if (e.kind !== 'orbit' || child?.canonicalKey !== a.entityKey || e.geometry?.kind !== 'ellipse') continue;
            const parent = nodes.get(e.from);
            if (a.name === 'orbitDraw') {
              // A radar Task's link inks along its spoke; an orbit inks around (held until then).
              if (e.geometry.band && parent) inkEdge(e, live(parent.projectionKey), live(child.projectionKey), CYAN, a.durationMs / 1000, delay);
              else {
                scene.holdEdge(e.key);
                if (reduced) scene.releaseEdge(e.key);
                else this.at(delay, () => this.add(new Ink(layer, ellipseFrom(e, child), CYAN, a.durationMs / 1000, px, false, () => scene.releaseEdge(e.key))));
              }
            } else if (!reduced) {
              this.at(delay, () => this.add(new Ink(layer, ellipseFrom(e, child), CYAN, a.durationMs / 1000, px, true)));
            }
          }
          if (a.name === 'orbitDraw') pulseFeatureOf(a.entityKey);
          if (a.name === 'orbitFade') {
            // Reparented out of this scene: the body leaves a trail to its new parent (06 §5).
            for (const was of ctx.before.nodes) {
              if (was.canonicalKey !== a.entityKey || after.has(was.projectionKey) || !BODY_KINDS.has(was.kind) || !was.selectable) continue;
              const parentKey = ctx.snapshot.workItems.get(a.entityKey)?.parentKey;
              const parent = parentKey ? ctx.snapshot.workItems.get(parentKey) : undefined;
              leftScene(was, parent ? { key: parent.key, label: `${parent.type} #${workItemId(parent.key)} · ${clip(parent.title)}` } : null);
            }
          }
          break;
        }
        case 'routeInk': case 'routeRetract': {
          if (ctx.plan.some((p) => p.name === 'launch' && p.entityKey === a.prKey)) break; // the launch chain inks it
          if (isSector && a.prKey) { pulsePr(a.prKey, PROGRESS); break; }
          const graph = a.name === 'routeInk' ? ctx.after : ctx.before.graph;
          const nodes = a.name === 'routeInk' ? after : before;
          for (const e of graph.edges) {
            const from = nodes.get(e.from);
            const to = nodes.get(e.to);
            if ((e.kind !== 'route' && e.kind !== 'routeContinuation') || !from || !to || from.canonicalKey !== a.prKey || to.canonicalKey !== a.itemKey) continue;
            if (a.name === 'routeInk') inkEdge(e, live(from.projectionKey), live(to.projectionKey), PROGRESS, a.durationMs / 1000, delay);
            else if (!reduced) this.at(delay, () => this.add(new Ink(layer, [[from.world.x, from.world.y], [to.world.x, to.world.y]], PROGRESS, a.durationMs / 1000, px, true)));
          }
          break;
        }
        case 'launch': {
          if (isSector) { pulsePr(a.entityKey, PROGRESS); break; }
          // The intent chain (05 §5): the bay's line reaches for the lane slot, the vessel undocks and
          // follows it (the line consumed behind it), then the route inks on to the linked work.
          for (const v0 of of(a.entityKey, new Set(['flight']))) {
            const pk = v0.projectionKey;
            const station = stationOf(ctx.after, after, pk);
            const edges = ctx.after.edges.filter((e) => e.from === pk && (e.kind === 'route' || e.kind === 'routeContinuation'));
            for (const e of edges) scene.holdEdge(e.key);
            const reveal = () => {
              for (const e of edges) {
                const to = after.get(e.to);
                if (!to || to.kind === 'station' || reduced) scene.releaseEdge(e.key);
                else inkEdge(e, live(pk), live(to.projectionKey), PROGRESS, ROUTE_INK_S);
              }
            };
            const author = ctx.plan.find((p) => p.name === 'authorBeam' && p.prKey === a.entityKey);
            const ship = author ? now.find((n) => n.kind === 'captain' && n.canonicalKey === author.authorKey) : undefined;
            if (!before.has(pk)) this.add(new FadeIn(scene, pk, 0.6));
            if (!station || reduced) {
              reveal();
              continue;
            }
            const intent = new Intent(layer, [station.world.x, station.world.y], goal(pk), PROGRESS, LAUNCH_INTENT_S, px);
            const dock: [number, number] = [station.world.x, station.world.y];
            // The author's ship (INV-08) now works at this PR: it flies to meet the vessel in the lane
            // and takes it in its tractor beam as it arrives.
            const begin = delay;
            if (ship && author) beamFrom(author, v0, delay, author.authorKey ?? undefined);
            // The vessel waits at its bay (held from now) while the intent line reaches out, then undocks and follows it.
            const total = LAUNCH_INTENT_S + LAUNCH_FLY_S;
            const f = LAUNCH_INTENT_S / total;
            this.move(scene, pk, (start) => new Pursue(scene, pk, start, total, {
              ease: (u) => (u < f ? 0 : easeUndock((u - f) / (1 - f))),
              face: false,
              onDone: () => { intent.finish(); reveal(); },
            }), dock, begin);
            this.at(begin, () => {
              this.add(intent);
              this.add(new Ring(layer, dock[0], dock[1], station.world.r * 0.8, station.world.r * 1.4, lighten(PROGRESS, 0.3), 1.0, px, 0.6));
            });
          }
          break;
        }
        case 'authorBeam': {
          if (ctx.plan.some((p) => p.name === 'launch' && p.entityKey === a.prKey)) break; // part of the launch chain
          const ship = now.find((n) => n.kind === 'captain' && n.canonicalKey === a.authorKey);
          const vessel = of(a.prKey!, new Set(['flight']))[0];
          if (ship && vessel) beamFrom(a, vessel, delayOf(a), a.authorKey ?? undefined);
          break;
        }
        case 'dock': {
          if (isSector) { pulsePr(a.entityKey, SUCCESS); break; }
          for (const v of of(a.entityKey, new Set(['flight']))) {
            const was = before.get(v.projectionKey) ?? v;
            const station = stationOf(ctx.after, after, v.projectionKey);
            scene.claimStage(v.projectionKey);
            const finish = () => {
              scene.landStage(v.projectionKey); // the gold stripe and check arrive with the flare
              // A merged PR is a completion: the grand gold flare, and the station's bay flashes gold.
              flareAt(v, SUCCESS, { scale: 2, linger: 6, grand: true });
              if (station) this.add(new Ring(layer, station.world.x, station.world.y, station.world.r * 0.7, station.world.r * 1.5, lighten(SUCCESS, 0.2), 1.3, px, 0.8));
            };
            if (a.approvedBy?.length) {
              this.formation(scene, ctx, a.eventKey, v, was, a.authorKey, a.approvedBy, delay, finish, busy);
              continue;
            }
            const lead = beamFrom(a, v, delay);
            // No approvers known: the vessel eases into its berth (the glide carries it), then flares.
            const settle = screenDist(was, v) >= INCH_PX ? 1.0 : 0;
            this.at(delay + lead + settle, finish);
          }
          break;
        }
        case 'withdraw':
          if (isSector) { pulsePr(a.entityKey, RUNG_COLOR.off); break; }
          for (const v of of(a.entityKey, new Set(['flight']))) {
            this.at(delay, () => {
              if (!reduced) this.add(new Withdraw(scene, v.projectionKey));
              this.add(new Ring(layer, v.world.x, v.world.y, v.world.r, v.world.r * 1.5, RUNG_COLOR.off, a.durationMs / 1000, px, 0.5));
            });
          }
          break;
        case 'sectorRekey': {
          // A move into this scene Arrives, a move out Departs (the scene's exit join), any kind of body.
          for (const n of of(a.entityKey, BODY_KINDS)) if (!before.has(n.projectionKey)) scene.arrive(n.projectionKey, delay);
          for (const n of ctx.before.nodes) {
            if (n.canonicalKey !== a.entityKey || n.kind !== 'star' || after.has(n.projectionKey)) continue;
            // An area move: the star leaves for its new sector, with a trail to Go to (06 §5).
            const area = a.toArea?.split('\\').pop() ?? a.toArea ?? '';
            leftScene(n, { key: a.entityKey, label: `${area} · ${clip(n.label)}` });
          }
          break;
        }
        default:
          break;
      }
    }

    // Scene-diff accents (02 §4): a station powering up, a star's first orbit, a body moving to a new parent.
    for (const n of now) {
      if (n.kind === 'station' && !before.has(n.projectionKey)) {
        this.add(new FadeIn(scene, n.projectionKey, 0.8));
        this.add(new Ring(layer, n.world.x, n.world.y, n.world.r * 0.7, n.world.r * 1.5, NAV_GREEN, 0.9, px, 0.7));
      }
      if (n.kind === 'star') {
        const children = (g: ViewGraph) => g.edges.filter((e) => e.kind === 'orbit' && e.from === n.projectionKey).length;
        if (before.has(n.projectionKey) && children(ctx.before.graph) === 0 && children(ctx.after) > 0) {
          flareAt(n, RUNG_COLOR[signalOf(n.stage).rung], { scale: 1.5, linger: 3 }); // starBloom: a corona forms
        }
      }
      const was = before.get(n.projectionKey);
      // Reparented within the scene: a long way travels an arc; a short one just glides ("worth an inch").
      if ((n.kind === 'planet' || n.kind === 'anomaly') && n.selectable && was && !reduced && screenDist(was, n) >= INCH_PX) {
        // It moves when its own change starts: after any protected moment that change waits for (05 §5).
        const wait = Math.max(0, ...ctx.plan.filter((a) => a.entityKey === n.canonicalKey && a.name !== 'shipAction').map((a) => delayOf(a)));
        // On a board, a move along its own ring follows the orbit (05 §5, decided 2026-10-09).
        if (this.orbitTravel(scene, ctx, n, was, px, wait)) continue;
        const d = Math.hypot(was.world.x - n.world.x, was.world.y - n.world.y);
        this.move(scene, n.projectionKey, (start) => new Pursue(scene, n.projectionKey, start, MOVE_S * 1.2, { lift: d * 0.25, face: false }), [was.world.x, was.world.y], wait);
      }
    }

    // Every change has hands on it (Activity, 05 §5): whoever made it, and, at higher levels, the other
    // person in it, takes the thing in a tractor beam, unless an accent above already did.
    if (eng.lightActions) {
      const targetOf = (a: PlannedAccent): ViewNode | undefined => {
        const key = a.name === 'routeInk' || a.name === 'routeRetract' ? a.itemKey ?? a.entityKey : a.entityKey;
        return of(key, TARGET_KINDS).find((n) => n.selectable || n.kind === 'star' || n.kind === 'flight' || n.kind === 'missionPoint');
      };
      for (const a of ctx.plan) {
        const item = targetOf(a);
        if (!item) continue;
        const at = delayOf(a);
        beamFrom(a, item, at);
        if (a.subjectKey) beamFrom(a, item, at, a.subjectKey);
      }
    }

    this.flyCaptains(scene, ctx, jumpers, before, after, px, engaged, engagedBy, engagedAt);
  }

  /**
   * A board body moving along its own ring (05 §5, the board): travel the orbit, bowing out to the
   * emptier neighbouring ring while it passes others, or, with no room either side, pass in front with
   * a short eclipse. False when it changed rings (a reassignment), so the usual arc carries it.
   */
  private orbitTravel(scene: GraphScene, ctx: BeatContext, n: ViewNode, was: ViewNode, px: number, delay = 0): boolean {
    const board = ctx.after.board;
    if (!board) return false;
    const orbitOf = (g: ViewGraph, pk: string) => {
      const e = g.edges.find((x) => x.kind === 'orbit' && x.to === pk);
      return e?.geometry?.kind === 'ellipse' ? e.geometry : null;
    };
    const ring = orbitOf(ctx.after, n.projectionKey);
    const old = orbitOf(ctx.before.graph, n.projectionKey);
    if (!ring || !old || Math.abs(ring.rx - old.rx) > 1) return false;
    const angle = (x: number, y: number) => Math.atan2((y - ring.cy) / ring.ry, (x - ring.cx) / ring.rx);
    const a0 = angle(was.world.x, was.world.y);
    const a1 = angle(n.world.x, n.world.y);
    const [lo, hi] = a0 < a1 ? [a0, a1] : [a1, a0];
    // Who it passes: the bodies on this ring whose angle lies between where it was and where it goes.
    const on = (rx: number) => ctx.after.nodes.filter((m) => m !== n && (m.kind === 'planet' || m.kind === 'anomaly') && m.selectable && Math.abs((orbitOf(ctx.after, m.projectionKey)?.rx ?? -1) - rx) < 1);
    const between = (m: ViewNode, r: { cx: number; cy: number; rx: number; ry: number }) => {
      const a = Math.atan2((m.world.y - r.cy) / r.ry, (m.world.x - r.cx) / r.rx);
      return a > lo && a < hi;
    };
    const passed = on(ring.rx).filter((m) => between(m, ring));
    const idx = board.rings.findIndex((r) => Math.abs(r.rx - ring.rx) < 1);
    const neighbours = [board.rings[idx + 1], board.rings[idx - 1]].filter((r): r is NonNullable<typeof r> => !!r);
    const room = neighbours.map((r) => ({ r, busy: on(r.rx).filter((m) => between(m, { cx: ring.cx, cy: ring.cy, rx: r.rx, ry: r.ry })).length }));
    const free = passed.length ? room.filter((x) => x.busy === 0).sort((a, b) => b.r.rx - a.r.rx)[0] : undefined;
    const bow = passed.length && free ? { rx: ring.rx + (free.r.rx - ring.rx) * BOARD.passLift, ry: ring.ry + (free.r.ry - ring.ry) * BOARD.passLift } : null;
    const layer = scene.fxLayer();
    const eclipse = passed.length && !free ? () => {
      for (const m of passed) this.add(new Eclipse(layer, () => scene.liveOf(m.projectionKey), () => scene.liveOf(n.projectionKey), m.world.r, BOARD.eclipseS));
    } : undefined;
    const d = Math.hypot(was.world.x - n.world.x, was.world.y - n.world.y);
    const dur = Math.min(MOVE_S * 1.6, Math.max(MOVE_S, (d / px) / 600)); // a long way round takes a little longer
    this.move(scene, n.projectionKey, (start) => new OrbitTravel(scene, n.projectionKey, start, ring, a0, a1, dur, bow, eclipse), [was.world.x, was.world.y], delay);
    return true;
  }

  /** captainJump (06 §5): diff each involved captain's ship between the two layouts. */
  /**
   * The review formation (06 §5, decided 2026-10-03): the PR's **author leads** and its **approvers fly
   * in support**. The author takes the point, just above the vessel, and works it with the tractor
   * beam; the reviewers take the wings of a V behind, and stream energy into the author, who glows
   * with it. Their joined effort carries the vessel home to the grand flare; then they disperse:
   * guests out of view without a trail, residents back to their resting places. The beams tell who
   * led and who supported, so no ship is marked out (no role chips). Essential tier: when busy, guests fade in at their slots; reduced motion shows a
   * ring each.
   */
  private formation(scene: GraphScene, ctx: BeatContext, moment: string, v: ViewNode, was: ViewNode, author: CanonicalKey | undefined, approvers: CanonicalKey[], delay: number, finish: () => void, busy: boolean): void {
    const layer = scene.fxLayer();
    const px = 1 / scene.currentScale();
    const now = scene.targetNodes();
    const vessel = () => scene.liveOf(v.projectionKey) as [number, number] | null;
    const shipR = now.find((n) => n.kind === 'captain')?.world.r ?? 29 * px;
    const crew = [
      ...(author ? [{ key: author, role: 'Author' }] : []),
      ...approvers.filter((k) => k !== author).map((key) => ({ key, role: 'Reviewer' })),
    ];
    // Slots relative to the live vessel: the author at the point, reviewers alternating left and
    // right on the wings of a V, each a step further back (up) and out.
    const point = v.world.r + shipR * 2.6;
    const slot = (i: number) => () => {
      const c = vessel() ?? [v.world.x, v.world.y];
      const lead = author ? 0 : -1;
      const rank = author ? i : i + 1; // without an author, the reviewers still form the wings
      if (rank === 0 && lead === 0) return [c[0], c[1] - point] as [number, number];
      const wing = Math.ceil(rank / 2);
      const side = rank % 2 === 1 ? -1 : 1;
      return [c[0] + side * wing * shipR * 3.4, c[1] - point - wing * shipR * 2.2] as [number, number];
    };
    if (motion.reduced) {
      crew.forEach((_, i) => {
        const p = slot(i)();
        this.add(new Ring(layer, p[0], p[1], shipR, shipR * 1.4, TRACTOR, 1.5, px, 0.9));
      });
      this.at(delay, finish);
      return;
    }
    const supportAt = delay + GATHER_S;
    const tractorAt = supportAt + 0.4; // the author engages once the team's energy reaches them
    const homeAt = supportAt + JOIN_S;
    const leaveAt = GATHER_S + JOIN_S + BERTH_S + DISPERSE_AFTER_S; // relative to each ship's start
    const holdS = JOIN_S + BERTH_S + 0.6;
    // Hold the vessel in the lane while the crew gathers and the author's beam takes it, then berth it.
    this.move(scene, v.projectionKey, (start) => new Pursue(scene, v.projectionKey, start, BERTH_S, { face: false, onDone: finish, kind: 'accent' }), [was.world.x, was.world.y], homeAt, moment);
    const reach = 260 * px;
    // Each crew member's live position, once their ship (resident or guest) exists.
    const where = new Map<number, () => [number, number] | null>();
    crew.forEach(({ key, role }, i) => {
      const resident = now.find((x) => x.kind === 'captain' && x.canonicalKey === key);
      const s = slot(i);
      if (resident) where.set(i, () => scene.liveOf(resident.projectionKey) as [number, number] | null);
      this.at(delay, () => {
        if (resident) {
          const at = (scene.liveOf(resident.projectionKey) as [number, number] | null) ?? [resident.world.x, resident.world.y];
          this.move(scene, resident.projectionKey, (start) => new Escort(scene, resident.projectionKey, start, s, leaveAt, vessel), at, 0, moment);
        } else {
          const c = ctx.history.entities.captains.find((x) => x.key === key);
          const side = i % 2 === 0 ? -1 : 1;
          const p0 = s();
          const entry: [number, number] = [p0[0] + side * reach, p0[1] - reach * 0.45];
          const exit: [number, number] = [p0[0] + side * reach * 1.2, p0[1] - reach * 0.6];
          const guest = new GuestShip(this.host, scene, s, entry, exit, leaveAt, vessel, c?.shipSeed ?? i, shipR, c?.displayName ?? role, busy ? 0 : GATHER_S, c?.avatar);
          where.set(i, () => guest.at);
          this.add(guest);
        }
      });
    });
    const authorAt = author ? where.get(0) ?? slot(0) : undefined;
    // The reviewers empower the author: warm streams from each wing into the point.
    if (author) {
      crew.forEach((m, i) => {
        if (m.role !== 'Reviewer') return;
        this.at(supportAt, () => this.add(new Support(layer, () => (where.get(i) ?? slot(i))(), () => (where.get(0) ?? slot(0))(), shipR, SUCCESS, holdS, px)));
      });
      // The author works the PR with the tractor beam, carrying it home.
      this.at(tractorAt, () => this.add(new Tractor(layer, () => authorAt!(), vessel, v.world.r, TRACTOR, holdS - 0.4, px)));
    } else {
      // No author known: the reviewers' beams join on the vessel directly.
      crew.forEach((_, i) => this.at(supportAt, () => this.add(new Tractor(layer, () => (where.get(i) ?? slot(i))(), vessel, v.world.r, TRACTOR, holdS, px))));
    }
  }

  /**
   * Ships (06 §5): every ship whose resting place moved this beat (a new assignment, or new work)
   * flies there once, along an arc, and stays; a short hop just glides. A ship that works something
   * this beat (`engaged`) takes it in its tractor beam on arrival, or at once if it didn't move.
   * Arrivals and departures from the scene come from assignments (`who`).
   */
  private flyCaptains(scene: GraphScene, ctx: BeatContext, who: Set<CanonicalKey>, before: Map<string, ViewNode>, after: Map<string, ViewNode>, px: number, engaged: Map<string, ViewNode>, engagedBy: Map<string, string>, engagedAt: Map<string, number>): void {
    const layer = scene.fxLayer();
    const reach = 220 * px; // a short flight, then out of view
    const ships = (m: Map<string, ViewNode>, all = false) => [...m.values()].filter((n) => n.kind === 'captain' && (all || who.has(n.canonicalKey)));
    const tractor = (ship: ViewNode) => {
      const item = engaged.get(ship.projectionKey);
      if (!item) return;
      this.at(engagedAt.get(ship.projectionKey) ?? 0, () => {
        this.add(new Tractor(layer, () => scene.liveOf(ship.projectionKey), () => scene.liveOf(item.projectionKey), item.world.r, TRACTOR, TRACTOR_S, px));
        // Nose toward the work while the beam holds.
        const s = scene.liveOf(ship.projectionKey);
        if (s) scene.faceView(ship.projectionKey, item.world.x - s[0]);
        this.at(TRACTOR_S, () => scene.restoreFacing(ship.projectionKey));
      });
    };
    for (const now of ships(after, true)) {
      const was = before.get(now.projectionKey);
      const nose = (now.attach?.dirX ?? 1) > 0 ? -1 : 1; // ships face their assignment
      if (motion.reduced) {
        if (!was || who.has(now.canonicalKey)) this.add(new FadeIn(scene, now.projectionKey, 0.3));
        continue;
      }
      if (was) {
        // Across the scene to where it now works: one arc with a brief wake, and it stays. A short hop just glides.
        const d = Math.hypot(was.world.x - now.world.x, was.world.y - now.world.y);
        if (d / px < INCH_PX) {
          tractor(now);
          continue;
        }
        // Along its home track (the board, 06 §3): from one place on the track to another, it follows the
        // track's curve, then takes hold of its work below.
        const track = now.track && was.track && Math.abs(was.track.rx - now.track.rx) < 1 ? now.track : null;
        if (track) {
          const angle = (n: ViewNode) => Math.atan2(n.world.y / track.ry, n.world.x / track.rx);
          const dur = Math.min(MOVE_S * 1.6, Math.max(MOVE_S, (d / px) / 600));
          this.move(scene, now.projectionKey, (start) => new OrbitTravel(scene, now.projectionKey, start, { cx: 0, cy: 0, ...track }, angle(was), angle(now), dur, null), [was.world.x, was.world.y], 0, engagedBy.get(now.projectionKey));
          this.at(dur, () => tractor(now));
          continue;
        }
        this.move(scene, now.projectionKey, (start) => new Pursue(scene, now.projectionKey, start, MOVE_S, { lift: d * 0.18, wake: 5, onDone: () => tractor(now) }), [was.world.x, was.world.y], 0, engagedBy.get(now.projectionKey));
      } else if (who.has(now.canonicalKey) || engaged.has(now.projectionKey)) {
        // In from out of view, decelerating along its nose (no overshoot), then an arrival ring.
        const start: [number, number] = [now.world.x - nose * reach, now.world.y - reach * 0.12];
        this.move(scene, now.projectionKey, (s) => new Pursue(scene, now.projectionKey, s, ARRIVE_S, {
          ease: easeOut, wake: 5,
          onDone: () => {
            this.add(new Ring(layer, now.world.x, now.world.y, now.world.r * 0.6, now.world.r * 1.4, lighten(CYAN, 0.4), 0.9, px, 0.8));
            tractor(now);
          },
        }), start);
      }
    }
    for (const was of ships(before)) {
      if (after.has(was.projectionKey)) continue;
      // Left the scene: fly out, and leave a trail to where they went.
      const dest = destinationOf(ctx, was.canonicalKey, new Set(ctx.after.nodes.map((n) => n.canonicalKey)));
      const unit = exitDir(was, ctx.after);
      const from: [number, number] = [was.world.x, was.world.y];
      const to: [number, number] = [from[0] + unit[0] * reach * 0.8, from[1] + unit[1] * reach * 0.8];
      const leaveTrail = () => {
        if (!dest) return;
        while (this.trails.length >= MAX_TRAILS) this.trails.shift()?.destroy();
        this.trails.push(new JumpTrail(this.host, scene, from, to, px, { ...dest, captain: was.canonicalKey }));
      };
      if (motion.reduced) leaveTrail();
      else this.add(new Departure(scene, from, unit, reach, was.seed, was.world.r, px, leaveTrail));
    }
  }
}

/** The station a vessel routes to (its first route edge ending at a station). */
function stationOf(g: ViewGraph, nodes: Map<string, ViewNode>, flightPk: string): ViewNode | undefined {
  for (const e of g.edges) {
    if (e.kind !== 'route' || e.from !== flightPk) continue;
    const to = nodes.get(e.to);
    if (to?.kind === 'station') return to;
  }
  return undefined;
}

/** Points around an orbit, starting at the child's place on it. */
function ellipseFrom(e: ViewEdge, child: ViewNode): [number, number][] {
  const { cx, cy, rx, ry } = e.geometry!;
  const a0 = Math.atan2((child.world.y - cy) / ry, (child.world.x - cx) / rx);
  return Array.from({ length: 65 }, (_, i) => {
    const a = a0 + (i / 64) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number];
  });
}


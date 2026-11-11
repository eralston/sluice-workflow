// The ManeuverInterpreter (v1, 14 §3 step 9): plays a solar beat's planned maneuvers. For each one
// it registers the protect (before anything in the beat moves), claims its cast's new looks, runs
// the theme's choreography phase by phase on the beat's clock (each phase's calls go through the
// command registry), and lands the look at the maneuver's land. Rule ids, casts, timing and
// protection come from shared pace data; what each phase draws comes from the theme. Nothing here
// knows a rule by name.
//
// Gating follows the v0 director (05 §5): a volatility meter (Σ command weights + 0.3 × gliding
// nodes + bias), essential always, narrative unless overloaded (decoration rationed when busy),
// ornament only when calm; one grand burst at a time. A maneuver never starts while another event's
// protect holds any of its actors (14 §4), so light work waits for the moment it would cross.
//
// It also says which hover-only pieces carry a label now (19 L7): each piece a maneuver casts shows its
// title from the beat's tell (or a short lead before the maneuver) to a linger after its land or echo,
// on the beat's clock, so it follows what's actually played; a seek clears them (INV-15).
import type { CanonicalKey } from '@shared/contracts/keys';
import type { CastRole, PlannedManeuver } from '@shared/contracts/maneuver';
import type { NodeKind, ViewNode } from '@shared/contracts/view';
import { ATTENTION_MAX, CREW_FOLD_MS, CREW_OPEN_MIN_MS, CROWD_MIN, VOLLEY_TURN_MS, PASS_PLATE_MS, claimMs, crewTimes, nearWaits } from '@shared/engine/maneuvers';
import { RULE, ruleById, type PaceRule } from '@shared/engine/pace';
import { decodePiece, encodePiece } from '@shared/engine/stageCode';
import { fnv1a32 } from '@shared/hash';
import { GEOMETRY } from '@shared/engine/solar/version';
import type { Award } from '@shared/engine/types';
import { ENGAGEMENT, type Engagement } from '@shared/playback/engagement';
import { motion } from '../../art/motion';
import { RUNG_COLOR, SUCCESS } from '../../art/progress';
import type { GraphScene } from '../../scenes/GraphScene';
import { cmd, commandByName, phaseAtMs, phaseMs, reducedCall, type FlareArgs, type MoverArgs } from '../commands';
import type { DirectorHost } from '../director';
import type { Anchor } from '../effects';
import { makeHost, type FxHost } from '../host';
import { GlowTell } from '../moments';
import { FxRunner, Sortie } from '../movers';
import { FadeIn } from '../moves';
import { BUSY, CALM, CAST_LABEL_FADE_MS, CAST_LABEL_LINGER_MS, OVERLOAD, RECAP_MAX, RECAP_STEP_S, muteFloor, ornamentOk, valuePerCost } from '../timing';
import type { CastView, CastViews, CommandCall, CommandDef, FxBeat, FxDirector } from '../types';
import { CastLabels, type CastNote, type CastWindow } from './castLabels';
import { noteOf, partOf } from '@shared/engine/eventLine';
import { eventOf, partsOf, sweepNote } from '@shared/packs/events';
import { ambientWork, entranceOf, finaleOf, maneuverFor } from './registry';
import { rlog } from '../../../devlog';

/** Which node a cast key means, per part (a person's seat and ship share a key, 14 §9 D1). */
export const PREFER: Record<CastRole, readonly NodeKind[]> = {
  subject: ['objective', 'threat', 'facility'],
  agent: ['captain'],
  support: ['captain'],
  seat: ['seat'],
  fromSeat: ['seat'],
  toSeat: ['seat'],
  facility: ['facility'],
  attachment: [],
  guard: [],
  frontier: ['objective', 'threat'],
  target: ['objective', 'threat'],
};

/** The opening (2026-10-13): when the first entrance starts, the most that may start apart, how far apart, and how long it all may take. */
const OPENING_LEAD_MS = 450;
const OPENING_MAX = 28;
const OPENING_STEP_MS = 110;
const OPENING_SPAN_MS = 3000;

/** A day's breather (22 C6, M-28): the star's breath, and how long the spotlit captain stays named (s). */
const SPOTLIGHT = 0xffe2a8;
export const SPOTLIGHT_S = 3;
/** A roll call's part (22 C6, M-29): the team, never a count or a rank (INV-19). */
const ROLL_CALL = 'Crew';

/** The parts that move or act: a protect elsewhere holds a maneuver back if it holds one of these. */
const ACTORS: readonly CastRole[] = ['subject', 'agent', 'support', 'attachment', 'target'];

/** The parts whose piece shows its label while the maneuver plays (19 L7): what it changes or aims at. */
const LABELLED: readonly CastRole[] = ['subject', 'frontier', 'target'];

/** The non-subject parts whose pending look a maneuver claims and lands at its land (14 §3 step 9). */
const LOOKS: readonly CastRole[] = ['seat', 'fromSeat', 'toSeat', 'facility', 'attachment'];

/** Where one claimed look lands (effect-seconds), whether a protected moment owns it, and which (for the dev log). */
type Land = { s: number; protect: boolean; rule: string; variant?: string; own?: boolean };

/** A fade-up runs on the beat's clock, so a reveal lands on its maneuver's act at any rate. */
const FADE = { name: 'fade', weight: 0, cuttable: false, clock: 'travel' } as const;

/** The v0 census's keys, plus the maneuvers started. */
export type InterpreterCensus = {
  flares: number; grand: number; sparks: number; beams: number; inks: number; rings: number;
  moves: number; guests: number; glyphs: number; started: number; maneuvers: number;
  /** Captains' idle work live now (2026-10-12). */
  idle: number;
};

export class ManeuverInterpreter implements FxDirector {
  private readonly runner = new FxRunner();
  /** Captains' idle work (2026-10-12): ambient, like identity motion, so it isn't a live command (INV-15). */
  private readonly idleRunner = new FxRunner();
  private readonly host: FxHost;
  private pending: FxBeat | null = null;
  private maneuversStarted = 0;
  private readonly warned = new Set<string>();
  /** Pieces' labels in play (19 L7), on a clock at the travel rate that holds while paused, as the beat's does. */
  private readonly castLabels = new CastLabels();
  /** Test hook: extra volatility. */
  bias = 0;

  constructor(base: DirectorHost) {
    this.host = makeHost(base, this.runner, () => this.volatility());
  }

  queue(ctx: FxBeat): void {
    this.pending = ctx;
  }

  /** 14 §4 (INV-15): destroy every command, tell and trail, then release edges, thaw and land stages. */
  clear(): void {
    this.pending = null;
    this.runner.clear();
    this.idleRunner.clear();
    this.idleNext.clear(); // every ship's idle rhythm starts again after a seek
    this.castLabels.clear(); // a seek snaps every piece's label away (INV-15)
    const scene = this.host.scene();
    scene?.releaseAllEdges();
    scene?.thawAll();
    scene?.landAllStages();
    scene?.endJumps(); // a guest waiting to jump in shows where it is
  }

  activeCount(): number {
    return this.runner.fx.length + this.runner.tells.length;
  }

  /** The interpreter leaves no jump trails (a captain's region change is the scene's own departure). */
  trailCount(): number {
    return 0;
  }

  volatility(): number {
    let v = 0;
    for (const f of this.runner.live()) {
      const w = this.runner.metaOf(f)?.weight ?? 0;
      v += f.grand ? w * 3 : w;
    }
    return v + (this.host.scene()?.glidingCount() ?? 0) * 0.3 + this.bias;
  }

  calm(): boolean {
    return ornamentOk(this.volatility());
  }

  census(): InterpreterCensus {
    const c: InterpreterCensus = {
      flares: 0, grand: 0, sparks: 0, beams: 0, inks: 0, rings: 0, moves: 0, guests: 0, glyphs: 0, idle: 0,
      started: this.runner.started.get('tractor') ?? 0, maneuvers: this.maneuversStarted,
    };
    for (const f of this.idleRunner.live()) if (this.idleRunner.metaOf(f)) c.idle++;
    for (const f of [...this.runner.live(), ...this.runner.tells]) {
      switch (this.runner.metaOf(f)?.name) {
        case 'flare': c.flares++; if (f.grand) c.grand++; break;
        case 'spark': c.sparks++; break;
        case 'tractor': case 'support': c.beams++; break;
        case 'ink': c.inks++; break;
        case 'ring': c.rings++; break;
        case 'pursue': c.moves++; break;
        case 'insignia': c.glyphs++; break;
        default: break;
      }
    }
    return c;
  }

  update(dtMs: number, _scheduleDtMs: number, frozen: boolean): void {
    const scene = this.host.scene();
    if (!scene) return;
    if (this.pending) {
      const ctx = this.pending;
      this.pending = null;
      try {
        this.spawn(scene, ctx);
      } catch (e) {
        // A broken choreography must never stop playback: the beat's looks land on their own.
        console.error('maneuvers failed; skipped', e);
      }
    }
    this.runner.step(dtMs, frozen);
    this.castLabels.step((dtMs / 1000) * motion.travel, frozen, dtMs / 1000); // paused, they fade on the wall clock
    this.idleRunner.step(dtMs, false); // idle work plays while paused
    this.idle(scene);
  }

  // ---- Idle work (2026-10-12) ----

  /** When each resting ship next works the piece beside it (wall-clock ms), and how many bouts it has had. */
  private readonly idleNext = new Map<string, { at: number; n: number }>();
  private idleAt = 0;

  /**
   * A captain at rest beside a piece that's under way (Underway or Nearing) works it now and then: the
   * theme's idle work, a faint beam or a short volley. Each ship keeps its own seeded rhythm, every 9 to
   * 22 s, quicker where people worked the piece lately (`ViewNode.activity`). Ornament: only when the
   * scene is calm, never in reduced motion, never over a protected moment or a ship that's moving.
   * Wall time, so it plays while paused.
   */
  private idle(scene: GraphScene): void {
    const work = ambientWork();
    const now = performance.now();
    if (!work || now - this.idleAt < 400) return;
    this.idleAt = now;
    if (motion.reduced || !ornamentOk(this.volatility())) return;
    const nodes = scene.targetNodes();
    const byPk = new Map(nodes.map((n) => [n.projectionKey, n]));
    for (const ship of nodes) {
      if (ship.kind !== 'captain' || !ship.attach || !scene.hasView(ship.projectionKey)) continue;
      const piece = byPk.get(ship.attach.work ?? ship.attach.to); // a ship rests off its work's planet (22 A9)
      const rung = piece?.piece?.signal.rung;
      if (!piece || (rung !== 'underway' && rung !== 'nearing') || !scene.hasView(piece.projectionKey)) continue;
      const activity = piece.activity ?? 0;
      const gap = (22 - 13 * activity) * 1000;
      const seed = fnv1a32(ship.projectionKey);
      let next = this.idleNext.get(ship.projectionKey);
      if (!next) {
        next = { at: now + (seed % 1000) / 1000 * gap, n: 0 };
        this.idleNext.set(ship.projectionKey, next);
        continue;
      }
      if (now < next.at) continue;
      next.at = now + gap * (0.8 + 0.4 * (((seed >>> 10) + next.n * 7919) % 1000) / 1000);
      // Not while it's held in a moment or on its way somewhere.
      if (this.runner.protectedFor([ship.canonicalKey, piece.canonicalKey]) > 0) continue;
      // Parked and still (22 A10): drawn where its glide is, and that glide arrived at its place.
      const live = scene.liveOf(ship.projectionKey);
      const goal = scene.goalOf(ship.projectionKey);
      const place = scene.targetOf(ship.projectionKey);
      const px = scene.currentScale();
      if (!live || !goal || !place || Math.hypot(live[0] - goal[0], live[1] - goal[1]) * px > 4 || Math.hypot(goal[0] - place[0], goal[1] - place[1]) * px > 4) continue;
      const view = (n: ViewNode): CastView => ({ key: n.canonicalKey, node: n, at: () => scene.liveOf(n.projectionKey), drawnR: () => scene.drawnR?.(n.projectionKey) ?? n.world.r });
      for (const c of work.work(view(ship), view(piece), activity, next.n++)) this.issueIdle(c);
    }
  }

  /**
   * The day's breather (22 C6, 05 §8 M-28), as a day turn's night ends: the star breathes, and the
   * captain limelight spotlights works the piece they rest beside (the theme's idle work), named *On
   * {its title}*, or, with no piece, is named by their planet. Ornament: never in reduced motion.
   */
  spotlight(person: CanonicalKey | null, untilS = 0): void {
    const scene = this.host.scene();
    if (!scene || motion.reduced) return;
    const nodes = scene.targetNodes();
    const byPk = new Map(nodes.map((n) => [n.projectionKey, n]));
    const star = nodes.find((n) => n.kind === 'star');
    if (star) {
      const r = star.world.r;
      for (let i = 0; i < 2; i++) this.issueIdle(cmd.ring({ at: () => scene.liveOf(star.projectionKey), r: r * 1.1, r1: r * 2.4, color: SPOTLIGHT, durS: 1.4, alpha: 0.5 }, i * 600));
    }
    if (!person) return;
    const ship = nodes.find((n) => n.kind === 'captain' && n.canonicalKey === person && scene.hasView(n.projectionKey));
    if (!ship) return;
    const piece = ship.attach ? byPk.get(ship.attach.work ?? ship.attach.to) : undefined;
    const home = nodes.find((n) => n.kind === 'seat' && n.canonicalKey === person);
    const work = ambientWork();
    const view = (n: ViewNode): CastView => ({ key: n.canonicalKey, node: n, at: () => scene.liveOf(n.projectionKey), drawnR: () => scene.drawnR?.(n.projectionKey) ?? n.world.r });
    if (piece && work && (piece.kind === 'objective' || piece.kind === 'threat')) for (const c of work.work(view(ship), view(piece), 1, 0)) this.issueIdle(c);
    const what = piece && (piece.kind === 'objective' || piece.kind === 'threat') ? piece.label : home?.label;
    // Named only if the budget has room (22 C10), and folded before the day's first beat (`untilS`, from
    // now): a maneuver's labels never give way to a breather's.
    const toS = Math.min(SPOTLIGHT_S, untilS - CREW_FOLD_MS / 1000);
    if (what && toS > 0.6 && this.castLabels.hasRoom()) this.castLabels.showCrew(ship.projectionKey, 0, toS, `On ${what}`, `spotlight:${person}`);
  }

  // ---- Pieces' labels in play (19 L7) ----

  /** The hover-only pieces whose label shows now, by projection key, with its opacity (no fade in reduced motion). */
  labelled(): ReadonlyMap<string, number> {
    return this.castLabels.now(!motion.reduced);
  }

  /** The acting captains whose plates are unfurled to their names (22 B9). */
  crew(): ReadonlyMap<string, { u: number; text: string; eventKey: string }> {
    // A ship names itself as it flies its turn: parked on its sortie, and only then (22 B9). One not on
    // a sortie (held back by a protect, or not yet set off) isn't there yet.
    const flying = (pk: string) => {
      const m = this.runner.movers.get(pk);
      return m instanceof Sortie ? m.crewOpen(CREW_FOLD_MS / 1000) : 0;
    };
    return this.castLabels.crew(!motion.reduced, flying);
  }

  /** The note each labelled piece wears now (22 B6). */
  notes(): ReadonlyMap<string, CastNote> {
    return this.castLabels.notes();
  }

  /** The events whose notes show now (22 B5: History marks their rows). */
  nowPlaying(): string[] {
    return this.castLabels.playing();
  }

  /**
   * Shows the label of each piece a maneuver casts (`LABELLED`) from `fromS` to `toS` from now,
   * effect-seconds; `opts` marks a tell's, or carries the maneuver's own span and its note (22 B6).
   */
  private labelCast(cast: CastViews, fromS: number, toS: number, opts: CastWindow = {}, only?: CanonicalKey | ReadonlySet<CanonicalKey>): void {
    for (const pk of this.litOf(cast, only)) this.castLabels.show(pk, fromS, toS, opts);
  }

  /**
   * The pieces whose plates a maneuver's cast lights (`LABELLED`), once each; a montage (27 E5b) lights only
   * `only`, and a volley's turn (27 E6) only its set.
   */
  private litOf(cast: CastViews, only?: CanonicalKey | ReadonlySet<CanonicalKey>): string[] {
    const seen = new Set<string>();
    const out = only === undefined ? undefined : typeof only === 'string' ? (k: CanonicalKey) => k !== only : (k: CanonicalKey) => !only.has(k);
    for (const role of LABELLED) {
      for (const v of cast[role] ?? []) {
        const pk = v.node.projectionKey;
        if (v.gone || v.host || seen.has(pk) || !v.node.labelOnHover || out?.(v.key)) continue;
        seen.add(pk);
      }
    }
    return [...seen];
  }

  /** How many pieces' plates a maneuver's cast lights: what's left of the budget names its crew (22 C10). */
  private litPieces(cast: CastViews): number {
    return this.litOf(cast).length;
  }

  /**
   * The lead-in (05 §5): each coming maneuver's subject glows in its new rung's colour. Narrative. The
   * tell lights no plates (R11, 27 E2): a piece's plate opens from its maneuver's act, in `play`.
   */
  tell(ctx: FxBeat, _beatIndex: number, leadS: number): void {
    const scene = this.host.scene();
    const eng = ctx.eng ?? ENGAGEMENT.calm;
    if (!scene || motion.reduced || (!eng.ignoreLoad && this.volatility() >= BUSY)) return;
    this.runner.dropTells();
    const seen = new Set<string>();
    for (const m of ctx.maneuvers ?? []) {
      if (ruleById(m.id)?.tier === 'ornament') continue;
      for (const v of this.views(scene, ctx, m).subject ?? []) {
        if (v.gone || seen.has(v.node.projectionKey) || !scene.hasView(v.node.projectionKey)) continue;
        seen.add(v.node.projectionKey);
        const rung = m.to?.rung ?? 'ready';
        const n = v.node;
        this.runner.tells.push(new GlowTell(scene, n.world.x, n.world.y, n.world.r, RUNG_COLOR[rung === 'off' ? 'ready' : rung], leadS));
      }
    }
  }

  /**
   * The recap bloom (06 §5): what was accomplished glows once, in order, then each award's insignia
   * shows on its holder's ship (18 §3: the viewer's, never anyone else's), or, with no holder, over
   * the piece that earned it. Ornament: it waits (up to a few seconds) for calm.
   */
  recap(keys: CanonicalKey[], awards: (Award & { holder?: CanonicalKey })[] = [], opts: { finale?: boolean } = {}): void {
    const scene = this.host.scene();
    if (!scene) return;
    let waited = 0;
    const tryNow = () => {
      if (this.volatility() >= CALM && waited < 4) {
        waited += 0.25;
        this.runner.at(0.25, tryNow);
        return;
      }
      const now = scene.targetNodes();
      const find = (key: CanonicalKey) => now.find((n) => n.canonicalKey === key && n.selectable && n.kind !== 'captain' && scene.hasView(n.projectionKey));
      let i = 0;
      // The round has ended here: the theme's finale plays in the bloom's place, then the awards.
      const finale = opts.finale && scene.currentGraph()?.solar ? finaleOf() : null;
      if (finale) {
        const view = (n: ViewNode): CastView => ({ key: n.canonicalKey, node: n, at: () => scene.liveOf(n.projectionKey), drawnR: () => scene.drawnR?.(n.projectionKey) ?? n.world.r });
        const drawn = now.filter((n) => scene.hasView(n.projectionKey));
        const star = drawn.find((n) => n.kind === 'star');
        const finished = keys.map(find).filter((n): n is ViewNode => !!n && (n.kind === 'objective' || n.kind === 'threat')).map(view);
        const ships = drawn.filter((n) => n.kind === 'captain');
        const { calls, awardsAtMs, rollCall } = finale({
          star: star ? view(star) : null, finished,
          ships: ships.map(view), seats: drawn.filter((n) => n.kind === 'seat').map(view),
        });
        // The finale is the moment (22 C6, M-27): no load gate drops its commands.
        for (const c of calls) this.issue(scene, c, ENGAGEMENT.calm, undefined, true);
        // The roll call (M-29): every captain in the formation named as it holds, the team's victory.
        if (rollCall && !motion.reduced) for (const s of ships) this.castLabels.showCrew(s.projectionKey, rollCall.fromMs / 1000, rollCall.toMs / 1000, ROLL_CALL, 'finale');
        this.showAwards(scene, awards, find, awardsAtMs / 1000);
        return;
      }
      for (const key of keys) {
        const n = find(key);
        if (!n) continue;
        if (i >= RECAP_MAX) break;
        this.issue(scene, cmd.flare({ at: [n.world.x, n.world.y], r: n.world.r, color: SUCCESS, scale: 1.45, linger: 2.4 }, (0.2 + i++ * RECAP_STEP_S) * 1000), ENGAGEMENT.calm, undefined, true);
      }
      this.showAwards(scene, awards, find, i * RECAP_STEP_S);
    };
    this.runner.at(0.3, tryNow);
  }

  /**
   * A beat earned the viewer awards (23 D2): their insignia light from the beat's start, on their ship,
   * with no wait for calm (the recap's wait made them lag up to 4 s) and not dropped by load.
   */
  insignia(awards: (Award & { holder?: CanonicalKey })[], calledAt = performance.now()): void {
    const scene = this.host.scene();
    if (!scene || !awards.length) return;
    const now = scene.targetNodes();
    const find = (key: CanonicalKey) => now.find((n) => n.canonicalKey === key && n.selectable && n.kind !== 'captain' && scene.hasView(n.projectionKey));
    this.showAwards(scene, awards, find, 0, true, calledAt);
  }

  /** Each award's insignia on its holder's ship (18 §3), riding it, or over the piece that earned it, from `afterS`. */
  private showAwards(scene: GraphScene, awards: (Award & { holder?: CanonicalKey })[], find: (key: CanonicalKey) => ViewNode | undefined, afterS: number, onBeat = false, stamp?: number): void {
    const now = scene.targetNodes();
    const ship = (key: CanonicalKey) => now.find((n) => n.canonicalKey === key && n.kind === 'captain' && scene.hasView(n.projectionKey));
    let i = 0;
    const calledAt = stamp ?? performance.now();
    for (const a of awards) {
      const n = a.holder ? ship(a.holder) : a.pieces.map(find).find((x) => !!x);
      if (!n) continue;
      const pk = n.projectionKey;
      this.issue(scene, cmd.insignia({ at: () => scene.liveOf(pk) ?? [n.world.x, n.world.y], r: n.world.r, shape: a.id, color: SUCCESS, calledAt }, (afterS + (onBeat ? 0 : 0.4) + i++ * RECAP_STEP_S) * 1000), ENGAGEMENT.calm, undefined, onBeat);
    }
  }

  // ---- The opening (2026-10-13) ----

  /**
   * The episode begins: the system wakes from its star outward. The star breathes once (the planets
   * are already there), and then everything that was already here when the round began makes its
   * entrance, seat by seat in the plan's order (its asteroids, then its hive ships, then its captain),
   * the frontier last: the theme's quiet entrances, no tells or settle rings. They start at most every
   * 110 ms, so about six are in motion at once; past OPENING_MAX the rest just fade up with the last.
   * The schedule's orientation (3 s in a solar region) holds the first beat back while it plays.
   * Reduced motion: nothing (the board is simply there). A seek ends it (INV-15).
   */
  opening(): void {
    const scene = this.host.scene();
    const entrance = entranceOf();
    if (!scene || !entrance || motion.reduced) return;
    const nodes = scene.targetNodes().filter((n) => scene.hasView(n.projectionKey));
    const star = nodes.find((n) => n.kind === 'star');
    const seats = nodes.filter((n) => n.kind === 'seat');
    if (star) this.issue(scene, cmd.flare({ at: [star.world.x, star.world.y], r: star.world.r, color: 0xfff1d6, scale: 1.5, linger: 2.2 }), ENGAGEMENT.calm);
    // The frontier belt comes in with its first piece, not ahead of it (19 S2).
    scene.hideGuides();
    // The planets are simply there (they set the order, not an entrance of their own).
    const order = new Map<string, number>(seats.map((n, i) => [n.canonicalKey, i]));
    // Which seat each piece and ship belongs to, for the order.
    const formations = new Map(scene.solarFormations().map((f) => [f.id, f.seat]));
    const seatOf = (n: ViewNode): string | null => n.platform?.seat ?? (n.cluster ? formations.get(n.cluster.id) ?? null : null) ?? (n.kind === 'captain' ? n.canonicalKey : null);
    const rank = (n: ViewNode) => (n.kind === 'objective' ? 0 : n.kind === 'threat' ? 1 : 2);
    const entrants = nodes.filter((n) => n.kind === 'objective' || n.kind === 'threat' || n.kind === 'captain')
      .map((n) => ({ n, seat: order.get(seatOf(n) ?? '') ?? seats.length }))
      .sort((a, b) => a.seat - b.seat || rank(a.n) - rank(b.n) || (a.n.projectionKey < b.n.projectionKey ? -1 : 1));
    const step = Math.min(OPENING_STEP_MS, (OPENING_SPAN_MS - 1000) / Math.max(1, entrants.length));
    entrants.forEach(({ n }, i) => {
      const pk = n.projectionKey;
      scene.fadeView(pk, 0);
      const at = OPENING_LEAD_MS + Math.min(i, OPENING_MAX) * step;
      const calls = i < OPENING_MAX ? entrance(n, true) : null;
      if (!calls?.length) { this.runner.add(new FadeIn(scene, pk, 0.5, at / 1000), FADE); return; }
      for (const c of calls) this.issue(scene, { ...c, delayMs: (c.delayMs ?? 0) + at } as CommandCall, ENGAGEMENT.calm);
    });
    // Stations muster their tenders.
    for (const f of nodes.filter((n) => n.kind === 'facility')) this.host.act(f.projectionKey, 'muster');
  }

  // ---- A beat ----

  private spawn(scene: GraphScene, ctx: FxBeat): void {
    this.runner.dropTells(); // the beat has come: the wind-up gives way to the act
    const eng = ctx.eng ?? ENGAGEMENT.calm;
    const before = new Set(ctx.before.nodes.map((n) => n.projectionKey));
    const all = [...(ctx.maneuvers ?? [])].sort((a, b) => a.afterMs - b.afterMs || (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // Tiers (05 §5): essential always; narrative unless overloaded; ornament (light work) unless busy.
    const v = this.volatility() + all.length * 0.6;
    const plays = all.filter((m) => {
      const tier = ruleById(m.id)?.tier ?? 'narrative';
      if (tier === 'essential' || eng.ignoreLoad) return true;
      return tier === 'narrative' ? v < OVERLOAD : v < BUSY;
    });
    // Each starts at its planned time, or once an earlier beat's protected moment that holds one of
    // its actors ends. The planner has already ordered this beat's own maneuvers (light work aside,
    // below), so their protects mustn't push anything planned ahead of them (a facility's jump-in before its first merge had
    // played after it, at a facility hidden all the while; 2026-10-13).
    const carry = new Map(plays.map((m) => [m, this.runner.protectedFor(actorsOf(m), m.eventKey)]));
    const startS = new Map<PlannedManeuver, number>(plays.map((m) => [m, Math.max(m.afterMs / 1000, carry.get(m)!)]));
    // Protected moments first (05 §5): each one's cast is held before anything in the beat moves.
    for (const m of plays.filter((x) => x.protect)) {
      const s = startS.get(m)!;
      const subject = this.views(scene, ctx, m).subject ?? [];
      if (!subject.some((x) => !x.gone) && !m.protect!.keys.some((k) => scene.targetNodes().some((n) => n.canonicalKey === k))) continue;
      this.runner.protect(scene, m.eventKey, m.protect!.keys, s + m.protect!.windowMs / 1000, { name: 'protect', weight: 0, cuttable: false, clock: 'travel' });
    }
    // Light work isn't in the planner's order, so it waits for this beat's protects too.
    for (const m of plays) {
      if ((ruleById(m.id) as PaceRule | undefined)?.light) startS.set(m, Math.max(startS.get(m)!, this.runner.protectedFor(actorsOf(m), m.eventKey)));
    }
    // A captain whose turn in this beat comes later (22 A11: one thing at a time) holds where they are
    // until their first sortie, so the beat's new layout doesn't glide them toward it first: they
    // travel once, then work (22 A10). Not a ship another move is steering (a sortie still coming back).
    // A guest new to the scene this beat (22 C8, K-13) jumps in where its first sortie parks, rather than
    // entering at its rest and then flying out: by its first sortie's start, here.
    const jumpers = new Map<string, number>();
    if (!motion.reduced) {
      const firstS = new Map<string, number>();
      for (const m of plays) {
        const v = this.views(scene, ctx, m);
        const at = startS.get(m)! + phaseAtMs(m, 'gather') / 1000;
        for (const ship of [...(v.agent ?? []), ...(v.support ?? [])]) {
          if (ship.gone || ship.node.kind !== 'captain') continue;
          const pk = ship.node.projectionKey;
          firstS.set(pk, Math.min(firstS.get(pk) ?? Infinity, at));
        }
      }
      // The runner's delayed move holds it where it is; its sortie takes over from there (the hold is the
      // move it replaces, so it starts where the ship is drawn). Should none come, it flies home after.
      for (const [pk, at] of firstS) {
        if (!before.has(pk)) { jumpers.set(pk, at); continue; }
        const from = scene.liveOf(pk) as [number, number] | null;
        if (at > 0.05 && from && !this.runner.movers.has(pk)) {
          this.runner.move(scene, pk, (f) => new Sortie(scene, pk, f, () => scene.goalOf(pk), () => null, 0.6, 0, 0), from, at + 0.5);
        }
      }
    }
    // A captain whose next turn sets off soon after this one's release waits parked near the work (P4, 05 P-7).
    const waits = motion.reduced ? new Map() : nearWaits(plays, (m) => startS.get(m)! * 1000);
    const revealed = new Set<string>();
    const lands = new Map<string, Land>();
    // Hidden until its jump. Should no sortie take it (a maneuver that doesn't fly it), it enters at its
    // rest after all, a moment after its turn was to begin.
    for (const [pk, at] of jumpers) {
      scene.markJump(pk);
      revealed.add(pk);
      this.runner.at(at + 0.6, () => {
        if (!scene.takeJump(pk)) return;
        const n = scene.targetNodes().find((x) => x.projectionKey === pk);
        const calls = n ? entranceOf()?.(n, false) : null;
        if (!calls?.length) { this.runner.add(new FadeIn(scene, pk, 0.6), FADE); return; }
        for (const c of calls) this.issue(scene, c, eng);
      }, 'travel');
    }
    // A crowd of arrivals in one beat (a sprint's first hour, a big triage) comes in as the opening does:
    // quietly, a little apart, with no tells or rings each (2026-10-13).
    // A sector sweep (27 E7) brings its own crowd in, in its own order: it is never one of these.
    const arrivals = plays.filter((m) => !m.sweep && maneuverFor(m.id)?.reveals);
    const crowd = arrivals.length >= CROWD_MIN ? new Map(arrivals.map((m, i) => [m, i])) : null;
    for (const m of plays) {
      const s = startS.get(m)!;
      const i = crowd?.get(m);
      if (i !== undefined) this.enterQuietly(scene, ctx, m, s + (i * Math.min(OPENING_STEP_MS, 2400 / arrivals.length)) / 1000, before, revealed, lands);
      else this.play(scene, ctx, m, s, eng, before, revealed, lands, waits.get(m));
      this.maneuversStarted++;
    }
    // Each claimed look lands once, at the land of the maneuver that owns it (14 §3 step 9).
    for (const [pk, l] of lands) {
      this.runner.at(l.s, () => {
        scene.landStage(pk);
        // A station's look (its form among it) and the maneuver that landed it: the dev log, redacted.
        const n = scene.targetNodes().find((x) => x.projectionKey === pk);
        if (n?.kind === 'facility') rlog('station-look', { key: n.canonicalKey, type: l.rule, via: l.variant ?? 'plain', outcome: l.protect ? 'protected' : 'open', atMs: Math.round(l.s * 1000) });
      }, 'travel');
    }
    // Anything new to the scene that no maneuver brings in makes the theme's entrance (an asteroid
    // moved into the sprint curves in round its planet, a hive ship comes through a rift), else fades
    // up; never pops (05 §5). They start a little apart, so a crowd doesn't land at once.
    const entrance = entranceOf();
    const newcomers = scene.targetNodes().filter((n) => !before.has(n.projectionKey) && !revealed.has(n.projectionKey) && scene.hasView(n.projectionKey));
    const quiet = newcomers.length >= CROWD_MIN; // a crowd comes in quietly, as the opening does
    const gap = quiet ? Math.min(OPENING_STEP_MS, 2400 / newcomers.length) : 120;
    let k = 0;
    for (const n of newcomers) {
      if (motion.reduced) continue;
      const calls = entrance?.(n, quiet);
      if (!calls?.length) { this.runner.add(new FadeIn(scene, n.projectionKey, 0.6), FADE); continue; }
      scene.fadeView(n.projectionKey, 0);
      const delay = k++ * gap;
      for (const c of calls) this.issue(scene, { ...c, delayMs: (c.delayMs ?? 0) + delay } as CommandCall, eng);
    }
  }

  /**
   * One maneuver: claim its cast's new looks, schedule its phases, reveal what's new. The looks it
   * claims go in `lands`, landed by `spawn` once every maneuver has had its say.
   */
  private play(scene: GraphScene, ctx: FxBeat, m: PlannedManeuver, s: number, eng: Engagement, before: Set<string>, revealed: Set<string>, lands: Map<string, Land>, near?: ReadonlyMap<CanonicalKey, number>): void {
    const def = maneuverFor(m.id);
    const at = (ms: number) => s + ms / 1000;
    // The look lands at the maneuver's land, else as its act ends; new objects show from its act.
    const landS = at(m.phases.some((p) => p.phase === 'land') ? phaseAtMs(m, 'land') : actEndMs(m));
    const revealS = at(claimMs(m.phases));
    const cast = this.views(scene, ctx, m);
    const subjects = (cast.subject ?? []).filter((v) => !v.gone && scene.hasView(v.node.projectionKey));
    // A station already on the board never jumps in again (22 C11, G-4): it was summoned once, in this
    // region, when the region first needed it. (A PR serving two regions can be one region's first need
    // and not the other's.)
    if (m.id === RULE.facilityEnter && subjects.some((v) => before.has(v.node.projectionKey))) return;
    // Its pieces' labels (19 L7, R11, 27 E2): from its act, once its cast has arrived (`claimMs`), to a linger after its land or echo.
    // A quiet turn (22 C6: limelight didn't name it) plays unlabelled: no plate, no note, no name.
    // A sector sweep (27 E7, M-32) names no one: the star wears its one note, the count and the sprint.
    if (m.sweep) this.noteSweep(scene, ctx, m, at);
    else if (ruleById(m.id)?.tier !== 'ornament' && !m.quiet && m.volley) this.nameVolley(ctx, cast, m, at);
    else if (ruleById(m.id)?.tier !== 'ornament' && !m.quiet) {
      const endS = at(endOfLandMs(m)) + CAST_LABEL_LINGER_MS / 1000;
      const fromS = at(claimMs(m.phases));
      // While it plays, the plate wears its event's note (22 B6), in History's words: the action, or
      // for a PR's event the PR named, since the work it serves wears it.
      const e = eventOf(ctx.history, m.eventKey);
      const note = e ? noteOf(partsOf(ctx.history, e), e.kind.startsWith('pr_')) : undefined;
      this.labelCast(cast, fromS, endS, { holdFromS: fromS, holdToS: at(endOfLandMs(m)), eventKey: m.eventKey, ...(note ? { note } : {}) }, m.plate);
      // The captains who fly in it (22 B9): their plates unfurl to their names and parts once they have
      // arrived, and fold before they leave. Only a maneuver they travel for (it has a gather): a captain
      // whose ship stays put isn't named as it glides to a new rest.
      // A montage (27 E5b, P-24) lights its one plate and names no crew.
      if (e && !m.plate && m.phases.some((p) => p.phase === 'gather') && (ruleById(m.id) as PaceRule | undefined)?.turn !== false) {
        const parts = partsOf(ctx.history, e);
        // Open as the ships arrive, a second past the work, folded before they leave (22 B9, `crewTimes`).
        const crew = crewTimes(m.phases);
        // A ship that passes through (27 F2) carries its plate along for `PASS_PLATE_MS` from the pass; it parks nowhere.
        if ((ruleById(m.id) as PaceRule | undefined)?.passes) crew.closeMs = crew.openMs + PASS_PLATE_MS;
        // Named within the budget (22 C10): what its pieces' plates leave of it, the author first, then
        // the reviewers in order; any beyond keep their picture.
        let names = ATTENTION_MAX - Math.min(ATTENTION_MAX, this.litPieces(cast));
        for (const role of ['agent', 'support'] as const) {
          for (const v of cast[role] ?? []) {
            if (v.gone || v.node.kind !== 'captain' || names <= 0) continue;
            names--;
            this.castLabels.showCrew(v.node.projectionKey, at(crew.openMs), at(crew.closeMs), partOf(e, parts, role, !!m.arc?.holders?.includes(v.key)), m.eventKey);
          }
        }
      }
    }
    // A close glides (22 C3, M-22): its subject leaves the moment's protect as the slide starts, so the
    // scene's glide carries it to its platform under the turn's cover, not after the echo.
    if (def?.slides && m.phases.some((p) => p.phase === def.slides) && !motion.reduced) {
      const pks = subjects.map((v) => v.node.projectionKey);
      this.runner.at(at(phaseAtMs(m, def.slides)), () => { for (const pk of pks) this.runner.release(m.eventKey, pk); }, 'travel');
    }
    // Its subjects' part in a guide, held as it was before the beat until its phase (a reassigned
    // piece keeps the frontier belt as it was until it flies); only where its subject is drawn.
    if (def?.freezes && subjects.length && !motion.reduced) {
      const { guide, until } = def.freezes;
      const pks = subjects.map((v) => v.node.projectionKey);
      scene.freezeGuide(guide, ctx.before.graph, pks);
      this.runner.at(at(phaseAtMs(m, until)), () => this.host.scene()?.thawGuide(guide, pks), 'travel');
    }
    for (const v of subjects) {
      const pk = v.node.projectionKey;
      if (!before.has(pk)) {
        if (revealed.has(pk)) continue;
        revealed.add(pk);
        // A choreography that brings its subject in itself keeps it hidden until its entrance.
        if (def?.reveals && !motion.reduced) scene.fadeView(pk, 0);
        else if (!motion.reduced) this.runner.add(new FadeIn(scene, pk, 0.7, revealS), FADE);
        continue;
      }
      this.claim(scene, pk, landS, m, lands);
    }
    // The rest of the cast whose look the moment changes (a seat's megastructure or research count,
    // a facility's bays) waits for the same land, so it comes in with the flare, not ahead of it. A
    // close that slides (22 C3) blossoms as the slide ends: the rest lands then, with the blossom.
    const slideEnd = def?.slides && m.phases.some((p) => p.phase === def.slides) ? at(phaseAtMs(m, def.slides) + phaseMs(m, def.slides)) : landS;
    for (const role of LOOKS) {
      for (const v of cast[role] ?? []) {
        const pk = v.node.projectionKey; // an attachment's view is its facility's
        if (!v.gone && (before.has(pk) || this.holdNewcomer(scene, m, v.node)) && scene.hasView(pk)) this.claim(scene, pk, slideEnd, m, lands, !!def?.owns?.includes(role));
      }
    }
    if (!def) {
      // No choreography for this rule in the theme: a plain ring where the change lands (or where a
      // piece that left this beat was).
      if (!this.warned.has(m.id)) {
        this.warned.add(m.id);
        console.warn(`no maneuver for rule ${m.id}`);
      }
      this.runner.at(landS, () => {
        for (const v of cast.subject ?? []) this.issue(scene, cmd.ring({ at: v.at, r: v.node.world.r, r1: v.node.world.r * 1.5, color: RUNG_COLOR[m.to?.rung ?? 'ready'] }), eng, m.eventKey);
      }, 'travel');
      return;
    }
    for (const span of m.phases) {
      const fn = def.phase[span.phase];
      if (!fn) continue;
      this.runner.at(at(span.atMs), () => {
        const live = this.host.scene();
        if (!live) return;
        let calls: CommandCall[];
        try {
          calls = fn(this.views(live, ctx, m), m);
        } catch (e) {
          console.error(`maneuver ${m.id} ${span.phase} failed; skipped`, e);
          return;
        }
        const cast = this.views(live, ctx, m);
        // The ship of a captain with a next turn close behind stays parked a while after its hold (P4).
        const stays = new Map<string, number>();
        if (near?.size) for (const role of ['agent', 'support'] as const) for (const v of cast[role] ?? []) { const w = near.get(v.key); if (w !== undefined) stays.set(v.node.projectionKey, w / 1000 + 0.2); }
        for (const c of calls) {
          if ('cmd' in c && c.cmd === 'pursue') {
            const args = c.args as { pk?: string };
            const waitS = args.pk !== undefined ? stays.get(args.pk) : undefined;
            if (waitS !== undefined) { this.issue(live, { ...c, args: { ...args, waitS } }, eng, m.eventKey); continue; }
          }
          this.issue(live, c, eng, m.eventKey);
        }
      }, 'travel');
    }
  }

  /**
   * A volley's naming turns (27 E6, M-31, P-6): turn i opens `i × VOLLEY_TURN_MS` after the claim. Its plates
   * wear its member's note and event (History marks that member's row *now*), and end as the next turn opens,
   * a fade sooner when the next turn's labels and these plates' fading would pass `ATTENTION_MAX`; the last
   * lingers as a maneuver's plates do. Its names unfurl, hold their least open time and fold within the turn,
   * each a drawn captain once, in the part they had in their own member's merge.
   */
  private nameVolley(ctx: FxBeat, cast: CastViews, m: PlannedManeuver, at: (ms: number) => number): void {
    const turns = m.volley!.turns;
    const claim = claimMs(m.phases);
    const openS = (CREW_FOLD_MS + CREW_OPEN_MIN_MS) / 1000;
    const crew = [...(cast.agent ?? []), ...(cast.support ?? [])];
    const drawn = (key: CanonicalKey) => crew.find((v) => v.key === key && !v.gone && v.node.kind === 'captain');
    const names = m.phases.some((p) => p.phase === 'gather') && !m.plate && (ruleById(m.id) as PaceRule | undefined)?.turn !== false;
    turns.forEach((turn, i) => {
      const fromS = at(claim + i * VOLLEY_TURN_MS);
      const e = eventOf(ctx.history, turn.eventKey);
      const note = e ? noteOf(partsOf(ctx.history, e), e.kind.startsWith('pr_')) : undefined;
      const next = turns[i + 1];
      let holdToS: number;
      let toS: number;
      if (!next) {
        holdToS = Math.max(at(endOfLandMs(m)), fromS + openS);
        toS = holdToS + CAST_LABEL_LINGER_MS / 1000;
      } else {
        const nextS = at(claim + (i + 1) * VOLLEY_TURN_MS);
        const mine = this.litOf(cast, new Set(turn.plates));
        const theirs = this.litOf(cast, new Set(next.plates));
        const leaving = mine.filter((pk) => !theirs.includes(pk)).length;
        const nextNamed = names ? next.names.filter((n) => drawn(n.key)).length : 0;
        // A plate that won't carry on still holds its place as it fades: end it a fade sooner when the next turn needs the room.
        holdToS = theirs.length + nextNamed + leaving > ATTENTION_MAX ? nextS - CAST_LABEL_FADE_MS / 1000 : nextS;
        toS = holdToS;
      }
      if (turn.plates.length) this.labelCast(cast, fromS, toS, { holdFromS: fromS, holdToS, eventKey: turn.eventKey, ...(note ? { note } : {}) }, new Set(turn.plates));
      if (!names) return;
      for (const n of turn.names) {
        const v = drawn(n.key);
        const ev = n.eventKey === turn.eventKey ? e : eventOf(ctx.history, n.eventKey);
        if (!v || !ev) continue;
        const text = partOf(ev, partsOf(ctx.history, ev), n.part === 'agent' ? 'agent' : 'support', n.part === 'holder');
        this.castLabels.showCrew(v.node.projectionKey, fromS, fromS + openS, text, n.eventKey, true);
      }
    });
  }

  /**
   * A sector sweep's one note (27 E7, M-32, R9, R12): the star's plate wears the count it reveals and the sprint, from
   * the claim to a linger past its end, for the carrier's event (History marks that one row *now*).
   */
  private noteSweep(scene: GraphScene, ctx: FxBeat, m: PlannedManeuver, at: (ms: number) => number): void {
    const nodes = scene.targetNodes();
    const star = nodes.find((n) => n.kind === 'star');
    if (!star || !m.sweep) return;
    // R9: the count is what the sweep reveals, the swept pieces the board holds (a piece the pace facts place in
    // the region before the board does, such as one created elsewhere that moves in later, isn't counted).
    const swept = new Set<string>(m.cast.subject ?? []);
    const here = nodes.filter((n) => swept.has(n.canonicalKey));
    const counts = { objective: here.filter((n) => n.kind === 'objective').length, threat: here.filter((n) => n.kind === 'threat').length };
    if (counts.objective + counts.threat === 0) return;
    const fromS = at(claimMs(m.phases));
    const holdToS = at(endOfLandMs(m));
    this.castLabels.show(star.projectionKey, fromS, holdToS + CAST_LABEL_LINGER_MS / 1000, { holdFromS: fromS, holdToS, eventKey: m.eventKey, note: sweepNote(ctx.history, counts) });
  }

  /** One of a crowd of arrivals: its subject hidden, then the theme's quiet entrance at `s`; its look lands then too. */
  private enterQuietly(scene: GraphScene, ctx: FxBeat, m: PlannedManeuver, s: number, before: Set<string>, revealed: Set<string>, lands: Map<string, Land>): void {
    const entrance = entranceOf();
    for (const v of this.views(scene, ctx, m).subject ?? []) {
      const pk = v.node.projectionKey;
      if (v.gone || !scene.hasView(pk) || revealed.has(pk)) continue;
      if (before.has(pk)) { this.claim(scene, pk, s, { ...m, protect: undefined }, lands); continue; }
      revealed.add(pk);
      if (motion.reduced) continue;
      scene.fadeView(pk, 0);
      const calls = entrance?.(v.node, true);
      if (!calls?.length) { this.runner.add(new FadeIn(scene, pk, 0.5, s), FADE); continue; }
      for (const c of calls) this.issue(scene, { ...c, delayMs: (c.delayMs ?? 0) + s * 1000 } as CommandCall, ENGAGEMENT.calm);
    }
  }

  /**
   * A facility new to the scene this beat that the maneuver holds (its first merge, which changes its
   * form): it comes in as it was before that merge, with none of the round's merges counted, so its
   * jump-in shows its first form and the merge's land plays the transformation (2026-10-13).
   */
  private holdNewcomer(scene: GraphScene, m: PlannedManeuver, node: ViewNode): boolean {
    if (node.kind !== 'facility' || !m.holds?.includes(node.canonicalKey)) return false;
    const piece = decodePiece(node.stage);
    if (!piece?.merged) return false;
    const before = { ...piece };
    delete before.merged;
    return scene.holdStage(node.projectionKey, encodePiece(before));
  }

  /**
   * Claims `pk`'s pending look for a maneuver landing at `s`. When several maneuvers in a beat share
   * a node, one that owns the look wins (`ManeuverDef.owns`), then a protected moment's land (its flare
   * is the one the look must meet), then the earliest.
   */
  private claim(scene: GraphScene, pk: string, s: number, m: PlannedManeuver, lands: Map<string, Land>, own = false): void {
    const protect = !!m.protect;
    const land: Land = { s, protect, rule: m.id, ...(m.variant ? { variant: m.variant } : {}), ...(own ? { own } : {}) };
    const had = lands.get(pk);
    if (had) {
      // A moment that owns the look (a seat's completion) lands it, whoever else casts it.
      if (!!had.own !== own) {
        if (own) lands.set(pk, land);
        return;
      }
      if ((protect && !had.protect) || (protect === had.protect && s < had.s)) lands.set(pk, land);
      return;
    }
    if (scene.claimStage(pk)) lands.set(pk, land);
  }

  /** One call of idle work: an ornament command on the idle runner, never an act or a mover. */
  private issueIdle(c: CommandCall): void {
    if ('act' in c) return;
    const def = commandByName(c.cmd);
    if (!def || def.moves) return;
    const meta = { name: def.name, weight: def.weight, cuttable: def.cuttable, clock: def.clock };
    this.idleRunner.at((c.delayMs ?? 0) / 1000, () => {
      if (!this.host.scene() || motion.reduced) return;
      try {
        this.idleRunner.add(def.make(this.host, c.args), meta);
      } catch (e) {
        console.error(`idle ${def.name} failed; skipped`, e);
      }
    });
  }

  /** Issues one call: an art act at once, or a command through the registry after its delay. */
  private issue(scene: GraphScene, c: CommandCall, eng: Engagement, owner?: string, essential = false): void {
    if ('act' in c) {
      // A person's seat and ship share a key (D1): the first of their views that has the act plays it.
      const play = () => {
        const live = this.host.scene();
        if (!live) return;
        for (const n of live.targetNodes()) {
          if (n.canonicalKey === c.act.key && live.hasView(n.projectionKey) && this.host.act(n.projectionKey, c.act.act, c.act.slot)) break;
        }
      };
      if (c.delayMs) this.runner.at(c.delayMs / 1000, play, 'travel');
      else play();
      return;
    }
    let def = commandByName(c.cmd);
    if (!def) {
      if (!this.warned.has(`cmd:${c.cmd}`)) {
        this.warned.add(`cmd:${c.cmd}`);
        console.warn(`no command ${c.cmd}`);
      }
      return;
    }
    let use: { cmd: string; args: unknown; delayMs?: number; value?: number } | null = c;
    if (motion.reduced) {
      use = reducedCall(def, c, this.host);
      if (!use) return;
      def = commandByName(use.cmd) ?? def;
    }
    const d = def;
    const args = use.args;
    const value = c.value ?? d.value; // a repeat stays a repeat under reduced motion's substitute (27 E1)
    this.runner.at((use.delayMs ?? 0) / 1000, () => this.make(d, args, value, eng, owner, essential), 'travel');
  }

  /** Makes a command's effect now, if its value per cost clears the load's floor (an `essential` call, the finale's, always: 22 C6, M-27). */
  private make(def: CommandDef, args: unknown, value: number, eng: Engagement, owner?: string, essential = false): void {
    const scene = this.host.scene();
    if (!scene) return;
    const v = this.volatility();
    const tier = essential || (def.name === 'flare' && (args as FlareArgs).grand) ? 'essential' : def.tier;
    // The mute rule (27 E1, 15 §10): value per cost against the floor for this load.
    if (tier !== 'essential' && valuePerCost(value, def.weight) < muteFloor(v, eng.ignoreLoad)) return;
    const meta = { name: def.name, weight: def.weight, cuttable: def.cuttable, clock: def.clock };
    try {
      if (def.moves) {
        const pk = (args as MoverArgs).pk;
        if (!scene.hasView(pk)) return;
        const from = (scene.liveOf(pk) as [number, number] | null) ?? scene.goalOf(pk) ?? [0, 0];
        this.runner.move(scene, pk, (start) => def.make(this.host, { ...(args as object), start }), from, 0, owner, meta);
      } else this.runner.add(def.make(this.host, args), meta);
    } catch (e) {
      console.error(`command ${def.name} failed; skipped`, e);
    }
  }

  // ---- The cast as the choreography sees it ----

  /** Every cast part's views, resolved against the scene now (and the beat's before, for what left). */
  private views(scene: GraphScene, ctx: FxBeat, m: PlannedManeuver): CastViews {
    const now = scene.targetNodes();
    const out: CastViews = {};
    for (const [role, keys] of Object.entries(m.cast) as [CastRole, CanonicalKey[]][]) {
      const list: CastView[] = [];
      for (const key of keys ?? []) {
        const v = this.viewOf(scene, now, ctx, role, key);
        if (v) list.push(v);
        else if (role === 'agent' || role === 'support') {
          // No ship here (a reviewer-only guest): the choreography may jump one in.
          const seed = ctx.history?.entities?.captains?.find((c) => c.key === key)?.shipSeed ?? fnv1a32(key);
          ((out.away ??= {})[role] ??= []).push({ key, seed });
        }
      }
      if (list.length) out[role] = list;
    }
    out.board = scene.solarBoard() ?? undefined;
    return out;
  }

  private viewOf(scene: GraphScene, now: ViewNode[], ctx: FxBeat, role: CastRole, key: CanonicalKey): CastView | null {
    const kinds = PREFER[role];
    const here = now.filter((n) => n.canonicalKey === key && scene.hasView(n.projectionKey));
    const pick = kinds.length ? kinds.map((k) => here.find((n) => n.kind === k)).find((n) => !!n) ?? (role === 'subject' ? here[0] : undefined) : undefined;
    if (pick) return { key, node: pick, at: () => scene.liveOf(pick.projectionKey), drawnR: () => scene.drawnR?.(pick.projectionKey) ?? pick.world.r, anchor: (name) => scene.anchorOf(pick.projectionKey, name), plate: () => this.host.plateWorld?.(pick.projectionKey) ?? null };
    // A compound's child (an attachment, a guard) is drawn inside its facility: its slot there.
    const slot = this.slotOf(scene, now, key) ?? this.slotOf(scene, now, key, ctx.before.nodes);
    if (slot) return slot;
    // Left the scene this beat (a landed objective): where it was.
    const was = ctx.before.nodes.find((n) => n.canonicalKey === key && (!kinds.length || kinds.includes(n.kind)));
    if (was) return { key, node: was, at: [was.world.x, was.world.y] as Anchor, gone: true };
    return null;
  }

  /**
   * An attachment's slot in its facility. `from` is the board whose compounds are searched (the beat's
   * target board by default). An attachment that leaves its facility this beat (`attachment.merge`,
   * `.settle`) has its slot only on the BEFORE board, so that board is searched too, and the facility
   * that carries it is the same one on the target board (matched by projection key), which holds the view.
   */
  private slotOf(scene: GraphScene, now: ViewNode[], key: CanonicalKey, from: ViewNode[] = now): CastView | null {
    for (const f0 of from) {
      const s = f0.compound?.slots.find((x) => x.key === key && x.role === 'attachment');
      const f = from === now ? f0 : now.find((n) => n.projectionKey === f0.projectionKey);
      if (!s || !f || !scene.hasView(f.projectionKey)) continue;
      const k = (scene.drawnR?.(f.projectionKey) ?? f.world.r) / GEOMETRY.facilityR; // the facility's drawn size against its planned one
      const dx = Math.cos(s.angle) * s.dist * k;
      const dy = Math.sin(s.angle) * s.dist * k;
      const node: ViewNode = { ...f, canonicalKey: key, world: { x: f.world.x + dx, y: f.world.y + dy, r: GEOMETRY.satelliteR * k } };
      const at = () => {
        const c = scene.liveOf(f.projectionKey);
        return c ? ([c[0] + dx, c[1] + dy] as const) : null;
      };
      const host: CastView = { key: f.canonicalKey, node: f, at: () => scene.liveOf(f.projectionKey), drawnR: () => scene.drawnR?.(f.projectionKey) ?? f.world.r };
      return { key, node, at, host, slot: s.slot };
    }
    return null;
  }
}

function actorsOf(m: PlannedManeuver): CanonicalKey[] {
  return m.protect?.keys ?? [...new Set(ACTORS.flatMap((r) => m.cast[r] ?? []))].sort();
}

/** When a maneuver's land or echo ends (ms from its start), else its act's end, else its whole run. */
function endOfLandMs(m: PlannedManeuver): number {
  const ends = m.phases.filter((p) => p.phase === 'land' || p.phase === 'echo').map((p) => p.atMs + p.durMs);
  return ends.length ? Math.max(...ends) : actEndMs(m) || m.durationMs;
}

function actEndMs(m: PlannedManeuver): number {
  const act = m.phases.find((p) => p.phase === 'act');
  return act ? act.atMs + act.durMs : 0;
}

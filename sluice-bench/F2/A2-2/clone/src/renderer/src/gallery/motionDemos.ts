// Gallery demos for the motions that are not a maneuver (v1.3 F7, F8; 06 §8). Each is a real GraphScene
// (and, for the finale and the opening, a real ManeuverInterpreter) looping through steps on the end
// state of the `pod-sprint` fixture's busiest region (invented names, INV-18):
//   Arrive and Depart (05 §5): the scene's own motion for a body coming into a scene and leaving it,
//     whatever the cause (ARRIVE_S, DEPART_S in chart/fx/timing.ts): planets and pieces here arrive
//     from the stream (`apply(…, 'data')`) and depart on a beat.
//   Entrances (theme/starChart/entrance.ts): how playback brings things in, the episode's opening:
//     asteroids spiral in, hive ships come through a rift, ships drop out of warp.
//   The finale (theme/starChart/finales.ts): the round's end, with the viewer's awards.
// R (reduced motion) and the test hooks are the maneuver demos' (maneuverDemos.ts). Development only.
import { Container, Text } from 'pixi.js';
import type { ViewGraph, ViewNode } from '@shared/contracts/view';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Award } from '@shared/engine/types';
import { SOLAR } from '@shared/hierarchy/solar';
import { motion } from '../chart/art/motion';
import { signalOf } from '../chart/art/progress';
import { ManeuverInterpreter } from '../chart/fx/v1/interpreter';
import { ARRIVE_S, DEPART_S } from '../chart/fx/timing';
import { GraphScene } from '../chart/scenes/GraphScene';
import { activeTheme } from '../theme/registry';
import { crop, demoMotion, demoRegion, fixtureNote, HOLD_S, missingFixtureSection, REST_S, reducedListeners, TIMEOUT_S, VIEW_H, VIEW_W } from './maneuverDemos';
import type { ArtView, Item, Section } from './types';

declare global {
  interface Window {
    /** Gallery test hooks for these demos (tests/e2e/gallery-assets.spec.ts). */
    __starChartGalleryMotion?: { list(): MotionStats[] };
  }
}

export interface MotionStats {
  id: string;
  /** The step the loop is in now. */
  step: string;
  loops: number;
  reducedLoops: number;
  /** Loops whose step never cleared within TIMEOUT_S of its minimum. */
  stuck: number;
  /** Arrivals and departures the scene has started (Arrive/Depart), and commands live now. */
  arrived: number;
  departed: number;
  active: number;
  /**
   * The last finished loop that ran in one motion mode from its first frame to its last (a toggle
   * restarts every demo, so a loop that saw the mode change is never recorded here): seconds each step
   * took (entry to leaving it), the most commands live at once, and the Arrive/Depart motions it counted.
   */
  full: LoopRecord | null;
  reduced: LoopRecord | null;
}

export interface LoopRecord { stepS: Record<string, number>; peak: number; arrived: number; departed: number }

/** One step of a loop: what it does on entry, the least it holds, and what must be true before the next. */
interface Step { name: string; run?: () => void; minS: number; done?: () => boolean }

const live = new Set<LoopDemo>();
reducedListeners.add(() => { for (const d of live) d.restart(); });

/** The world box round `nodes`, padded and widened to the viewport's shape. */
function fit(nodes: ViewNode[], pad: number): { cx: number; cy: number; w: number; h: number } {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const n of nodes) {
    b.x0 = Math.min(b.x0, n.world.x - n.world.r); b.x1 = Math.max(b.x1, n.world.x + n.world.r);
    b.y0 = Math.min(b.y0, n.world.y - n.world.r); b.y1 = Math.max(b.y1, n.world.y + n.world.r);
  }
  if (!nodes.length) return { cx: 0, cy: 0, w: 1100, h: (1100 * VIEW_H) / VIEW_W };
  let w = b.x1 - b.x0 + 2 * pad;
  let h = b.y1 - b.y0 + 2 * pad;
  if (w / h < VIEW_W / VIEW_H) w = (h * VIEW_W) / VIEW_H;
  else h = (w * VIEW_H) / VIEW_W;
  return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w, h };
}

/** A graph holding only the nodes `keep` allows, and the edges between them. */
function only(g: ViewGraph, keep: (n: ViewNode) => boolean): ViewGraph {
  const kept = new Set(g.nodes.filter(keep).map((n) => n.projectionKey));
  return { ...g, nodes: g.nodes.filter((n) => kept.has(n.projectionKey)), edges: g.edges.filter((e) => kept.has(e.from) && kept.has(e.to)) };
}

/** A looping scene: its steps in order, then again. Reduced motion is the maneuver demos' (R). */
abstract class LoopDemo implements ArtView {
  readonly root = new Container({ label: 'motionDemo' });
  protected readonly scene: GraphScene;
  protected readonly fx: ManeuverInterpreter;
  protected readonly labelHost = document.createElement('div');
  private readonly cam = new Container();
  private readonly caption = new Text({ text: '', style: { fontFamily: 'Menlo, monospace', fontSize: 10, fill: 0xf4f0de } });
  private scale = 1;
  private idx = 0;
  private t = 0;
  private last: number | null = null;
  private captioned = '';
  private peak = 0;
  /** The motion mode this loop began in, whether it has held since, its step times, and the motion counts at its start. */
  private loopReduced = false;
  private pure = true;
  private loopStepS: Record<string, number> = {};
  private loopFrom = { arrived: 0, departed: 0 };
  readonly stats: MotionStats;
  protected abstract readonly steps: Step[];

  constructor(id: string) {
    this.scene = new GraphScene({ onSelect: () => {}, onEnter: () => {}, onHover: () => {} });
    this.fx = new ManeuverInterpreter({
      scene: () => this.scene,
      hierarchy: () => SOLAR,
      worldToScreen: (x, y) => this.cam.toGlobal({ x, y }),
      labelHost: this.labelHost,
      onGo: () => {},
      flashLabel: () => {},
    });
    this.scene.setAssetCtx({ theme: activeTheme()?.id ?? 'star-chart', viewer: null, captain: null });
    this.caption.alpha = 0.5;
    this.caption.position.set(-VIEW_W / 2 + 4, VIEW_H / 2 - 14);
    this.root.addChild(this.cam, this.caption);
    this.cam.addChild(this.scene.root);
    this.stats = { id, step: 'rest', loops: 0, reducedLoops: 0, stuck: 0, arrived: 0, departed: 0, active: 0, full: null, reduced: null };
  }

  /** Frames the scene on `box` and registers the demo; subclasses call it once their first graph is applied. */
  protected frame(box: { cx: number; cy: number; w: number; h: number }): void {
    this.scale = Math.min(VIEW_W / box.w, VIEW_H / box.h);
    this.cam.scale.set(this.scale);
    this.cam.position.set(-box.cx * this.scale, -box.cy * this.scale);
    this.scene.setCameraScale(this.scale);
    live.add(this);
  }

  /** The cleared state the first step starts from. */
  protected abstract reset(): void;

  setStage(): void {}

  restart(): void {
    this.fx.clear();
    this.reset();
    this.idx = 0;
    this.t = 0;
    this.peak = 0;
    this.loopReduced = demoMotion.reduced;
    this.pure = true;
    this.loopStepS = {};
    this.loopFrom = { arrived: this.scene.motionCount.arrive, departed: this.scene.motionCount.depart };
    this.enter();
  }

  private enter(): void {
    this.steps[this.idx]!.run?.();
    this.stats.step = this.steps[this.idx]!.name;
  }

  tick(seconds: number): void {
    // The gallery's clock: paused or frozen, the demo holds where it is.
    const dt = this.last === null || seconds < this.last ? 0 : Math.min(0.1, seconds - this.last);
    this.last = seconds;
    const frozen = dt === 0;
    const was = motion.reduced;
    motion.reduced = demoMotion.reduced;
    try {
      this.scene.setReduced(demoMotion.reduced);
      this.scene.tick(seconds);
      this.scene.setCameraScale(this.scale);
      this.fx.update(dt * 1000, dt * 1000, frozen);
      this.scene.glide(dt * 1000, frozen);
      if (!frozen) this.advance(dt);
    } finally {
      motion.reduced = was;
    }
    this.stats.active = this.fx.activeCount();
    this.peak = Math.max(this.peak, this.stats.active);
    if (demoMotion.reduced !== this.loopReduced) this.pure = false;
    this.stats.arrived = this.scene.motionCount.arrive;
    this.stats.departed = this.scene.motionCount.depart;
    const text = `${demoMotion.reduced ? 'reduced' : 'full'} motion · ${this.stats.step}`; // short: it sits in the corner, clear of the planets
    if (text !== this.captioned) { this.captioned = text; this.caption.text = text; }
  }

  private advance(dt: number): void {
    this.t += dt;
    const step = this.steps[this.idx]!;
    if (this.t < step.minS) return;
    if (step.done && !step.done()) {
      if (this.t >= step.minS + TIMEOUT_S) { this.stats.stuck++; this.restart(); }
      return;
    }
    this.loopStepS[step.name] = this.t;
    if (this.idx + 1 < this.steps.length) {
      this.idx++;
      this.t = 0;
      this.enter();
      return;
    }
    if (this.pure && demoMotion.reduced === this.loopReduced) {
      const rec: LoopRecord = { stepS: { ...this.loopStepS }, peak: this.peak, arrived: this.scene.motionCount.arrive - this.loopFrom.arrived, departed: this.scene.motionCount.depart - this.loopFrom.departed };
      if (this.loopReduced) this.stats.reduced = rec;
      else this.stats.full = rec;
    }
    if (demoMotion.reduced) this.stats.reducedLoops++;
    else this.stats.loops++;
    this.restart();
  }

  destroy(): void {
    live.delete(this);
    this.fx.clear();
    this.scene.dispose();
    this.root.destroy({ children: true });
  }
}

/** The pod's end state without ships, and the same board with only its star: what Arrive and Depart move between. */
class ArriveDepartDemo extends LoopDemo {
  private readonly full: ViewGraph;
  private readonly bare: ViewGraph;
  protected readonly steps: Step[];

  constructor(id: string, graph: ViewGraph) {
    super(id);
    // Planets and pieces are what Arrive and Depart move; ships keep their own accents (05 §5).
    const bodies = only(graph, (n) => n.kind === 'star' || n.kind === 'seat' || n.kind === 'objective' || n.kind === 'threat');
    this.bare = only(bodies, (n) => n.kind === 'star');
    this.full = crop(bodies, fit(bodies.nodes, 0), new Set(bodies.nodes.map((n) => n.projectionKey)));
    this.steps = [
      { name: 'rest', minS: REST_S },
      { name: 'arrive', run: () => this.scene.apply(this.full, 'data'), minS: 0.2, done: () => this.scene.activeMotions() === 0 },
      { name: 'present', minS: HOLD_S },
      { name: 'depart', run: () => this.scene.apply(this.bare, 'beat'), minS: 0.2, done: () => this.scene.activeMotions() === 0 },
      { name: 'gone', minS: HOLD_S / 2 },
    ];
    this.scene.apply(this.full, 'jump');
    this.frame(fit(this.scene.targetNodes(), 160));
    this.restart();
  }

  protected reset(): void {
    this.scene.apply(this.bare, 'jump');
  }
}

/** The theme's entrances: the episode's opening on the whole board, ships and all. */
class OpeningDemo extends LoopDemo {
  private readonly full: ViewGraph;
  private readonly board: ViewGraph;
  private seen = false;
  protected readonly steps: Step[];

  constructor(id: string, graph: ViewGraph) {
    super(id);
    this.full = graph;
    this.board = only(graph, (n) => n.kind !== 'objective' && n.kind !== 'threat' && n.kind !== 'captain');
    this.steps = [
      { name: 'rest', minS: REST_S },
      {
        name: 'opening', minS: 1,
        run: () => { this.seen = false; this.scene.apply(this.full, 'jump'); this.fx.opening(); },
        // Reduced motion issues nothing (the board is simply there), so there is nothing to wait for.
        done: () => { if (this.fx.activeCount() > 0) this.seen = true; return demoMotion.reduced || (this.seen && this.fx.activeCount() === 0); },
      },
      { name: 'present', minS: HOLD_S },
    ];
    this.scene.apply(graph, 'jump');
    // Framed twice: the system, then where the scene draws it at that scale, ships and all (they stand off in screen terms).
    this.frame(fit(this.scene.targetNodes().filter((n) => n.kind === 'star' || n.kind === 'seat'), 420));
    this.frame(fit(this.scene.targetNodes().filter((n) => n.kind === 'star' || n.kind === 'seat' || n.kind === 'captain'), 160));
    this.restart();
  }

  protected reset(): void {
    this.scene.apply(this.board, 'jump');
  }
}

/** The round's end: the finale, then the viewer's awards on their ship. */
class FinaleDemo extends LoopDemo {
  private readonly graph: ViewGraph;
  private readonly keys: CanonicalKey[];
  private readonly awards: (Award & { holder?: CanonicalKey })[];
  private seen = false;
  protected readonly steps: Step[];

  constructor(id: string, graph: ViewGraph) {
    super(id);
    this.graph = graph;
    // What the round finished (platforms glint in this order) and the viewer: the first ship's captain, with two awards.
    this.keys = graph.nodes.filter((n) => (n.kind === 'objective' || n.kind === 'threat') && signalOf(n.stage).rung === 'accomplished').map((n) => n.canonicalKey).sort();
    const viewer = graph.nodes.filter((n) => n.kind === 'captain').map((n) => n.canonicalKey).sort()[0];
    const award = (aid: string): Award & { holder?: CanonicalKey } => ({ id: aid, earnedAt: { eventKey: 'demo', atUtc: 0 }, pieces: [], reason: 'gallery demo', ...(viewer ? { holder: viewer } : {}) });
    this.awards = [award('clear-skies'), award('steady-hands')];
    this.steps = [
      { name: 'rest', minS: REST_S },
      {
        name: 'finale', minS: 1,
        run: () => { this.seen = false; this.fx.recap(this.keys, this.awards, { finale: true }); },
        done: () => { if (this.fx.activeCount() > 0) this.seen = true; return this.seen && this.fx.activeCount() === 0; },
      },
      { name: 'present', minS: HOLD_S },
    ];
    this.scene.apply(graph, 'jump');
    // Framed twice: the system, then where the scene draws it at that scale, ships and all (they stand off in screen terms).
    this.frame(fit(this.scene.targetNodes().filter((n) => n.kind === 'star' || n.kind === 'seat'), 420));
    this.frame(fit(this.scene.targetNodes().filter((n) => n.kind === 'star' || n.kind === 'seat' || n.kind === 'captain'), 160));
    this.restart();
  }

  protected reset(): void {
    this.scene.apply(this.graph, 'jump');
  }
}

let hooked = false;

/**
 * The Arrive/Depart row (planets and pieces; the opening's entrances) and the finale cell, each a wide
 * clipped cell looping on the fixture's busiest region. R toggles reduced motion with the maneuver demos.
 */
export function motionSections(): Section[] {
  activeTheme(); // the theme's assets, entrances and finale register before any demo is built
  if (!hooked && typeof window !== 'undefined') {
    hooked = true;
    window.__starChartGalleryMotion = { list: () => [...live].map((d) => ({ ...d.stats })) };
  }
  const region = fixtureNote() ? null : demoRegion();
  if (!region) return [missingFixtureSection('arrive-depart', 'Arrive and Depart'), missingFixtureSection('finale', 'The round\'s end')];
  const g = region.graph;
  // The whole board, trimmed to the system (no mega-lists, nothing far off the frontier).
  const frame = g.nodes.filter((n) => n.kind === 'star' || n.kind === 'seat');
  const system = crop(g, fit(frame, 420), new Set(frame.map((n) => n.projectionKey)));
  const cell = (id: string, title: string, note: string, make: () => ArtView): Item => ({ id, title, note, wide: true, make });
  return [
    {
      key: 'arrive-depart',
      title: 'Arrive and Depart · bodies coming into a scene and leaving it, then the opening\'s entrances (R: reduced motion)',
      clip: true,
      items: [
        cell('bodies', 'Arrive / Depart · planets and pieces', `from the stream and on a beat · ARRIVE_S ${ARRIVE_S} s, DEPART_S ${DEPART_S} s; reduced: a 0.3 s fade · ${region.label}`, () => new ArriveDepartDemo('arrive-depart:bodies', g)),
        cell('opening', 'Entrances · the episode opening', `asteroids spiral in, hive ships through a rift, ships out of warp · reduced: nothing, the board is simply there · ${region.label}`, () => new OpeningDemo('arrive-depart:opening', system)),
      ],
    },
    {
      key: 'finale',
      title: 'The round\'s end · the finale and the viewer\'s awards (R: reduced motion)',
      clip: true,
      items: [cell('finale', 'Finale · star flare, platform glints, ships form up', `the round's-end finale (glint is its platform sparkle; allClear and seat glints play in the maneuver demos), then the viewer's awards on their ship · ${region.label}`, () => new FinaleDemo('finale', system))],
    },
  ];
}

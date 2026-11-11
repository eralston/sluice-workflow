// 06 §4 scene adapter: reconcile display objects by projection key; never rebuild on React render.
// One adapter serves every scale (galaxy, sector, feature, body); the ViewGraph carries the layout.
import { Circle, Color, Container, Graphics, Text, type Filter } from 'pixi.js';
import type { NamePlate } from '../labels';
import { DEFAULT_THEME } from '@shared/contracts/settings';
import type { ViewEdge, ViewGraph, ViewNode } from '@shared/contracts/view';
import { fnv1a32 } from '@shared/hash';
import { BOARD } from '@shared/scene/board';
import { hitRadius, screenRadius, visualHitRadius } from '@shared/scene/sizing';
import { guideMembers, guideWanted, holdMembers, releaseMembers, type HeldMember } from './guidePresence';
import { placeInScreen } from './placement';
import { assetFor } from '../assets/registry';
import type { AssetCtx, AssetDef } from '../assets/types';
import { isFramed } from '../framing';
import { ARRIVE_S, BODY_KINDS, DEPART_S, FLARE_KINDS, GUIDE_FADE_MS } from '../fx/timing';
import { activeTheme } from '../../theme/registry';
import type { ThemeGuide } from '../../theme/types';
import { AnomalyView } from '../art/anomaly';
import { GalaxyView } from '../art/galaxy';
import { GhostView, LoadMoreView } from '../art/loadmore';
import { FlightView, StationView, TaskDotView } from '../art/infrastructure';
import { PlanetView } from '../art/planet';
import { RUNG_COLOR } from '../art/progress';
import { BeaconView, ShipView } from '../art/ships';
import { StarView } from '../art/star';
import { motion } from '../art/motion';
import { EVENT_LOOP_S } from '../art/dreadnoughts';
import type { Ambient } from '../assets/types';

interface NodeViewLike {
  readonly root: Container;
  /** Marks kept crisp outside the paint pass (off-ladder states); positioned over root each tick. */
  readonly marks?: Container;
  setStage(stage: string): void;
  tick(seconds: number): void;
  destroy(): void;
  /** v1 asset views (14 §2.8): optional heading, light and transient acts, asked for by shape, not class. */
  face?(dir: number): void;
  setLightFrom?(x: number, y: number): void;
  /** The camera's scale on this view, in pixels per art unit (an aura keeps a readable reach). */
  setZoom?(pxPerUnit: number): void;
  act?(name: string, slot?: number | readonly number[]): void;
  /** Its surroundings (2026-10-12): how lately its node was worked, where the nearest captain is. */
  ambient?(a: Ambient): void;
  /** A look it eases into itself (a station's standby, 19 M1) lands now: a seek, scene entry (INV-15). */
  settle?(): void;
  /** A named hardpoint of its art (23 C5; `emitter`), in px from its origin, before the view's scale. */
  anchor?(name: string): readonly [number, number] | null;
  /** The share of its light it draws now, when it dims by its own shader (a vacated world, 23 C3). */
  lightShare?(): number;
  /** A station's drawn tenders and dock bay (23 C6, a test hook). */
  tenders?(): { slot: number; x: number; y: number; docking: boolean }[];
  bay?(): { x: number; y: number };
}

/**
 * What an entry is and can do (17 D7): from its asset's capabilities for a v1 node, else from the v0
 * kind tables. `celestial` bodies scale with the world (no screen floor); `moving` ones Arrive and
 * Depart; `flare`, `body` and `framed` are for the effect directors and the camera.
 */
export interface EntryCaps { celestial: boolean; moving: boolean; flare: boolean; body: boolean; framed: boolean }

/** The depth bias of a piece that overlays a planet (`AssetDef.over`): past any screen y. */
const OVER_Z = 1e7;

interface NodeEntry {
  node: ViewNode;
  view: NodeViewLike;
  /** The v1 asset that made the view; unset for the v0 switch. */
  asset?: AssetDef;
  caps: EntryCaps;
  hit: Container | null;
  /** The world radius the view was built at: a hardware node whose radius changes keeps its view, scaled (22 C3). */
  builtR: number;
  /** The view's resting scale (the mechanical floor at this zoom); effects scale relative to it. */
  rest: number;
  /** An effect's scale on top of the resting scale (a radar dot collapsing and re-expanding). */
  fxScale?: number;
  /**
   * The glide layer (05 §5 continuity): where the node is drawn, easing toward its layout target
   * with a critically damped spring, so a re-layout never teleports anything.
   */
  shown: { x: number; y: number; vx: number; vy: number };
  /** An effect's offset from the shown position (a flight, a launch). */
  off: { x: number; y: number };
  /** An effect steers this node: the spring holds it at its target and the effect's offset does the rest. */
  owned: number;
  /** The stage the view shows (it may lag the node's stage until its change lands, 06 §5). */
  shownStage: string;
  /** A stage swap in progress: the view dips, swaps at the trough, and comes back (stage polish). */
  swap?: { stage: string; t: number };
  /** A v1 asset's light source (its star), re-aimed once the view is placed (setLightFrom reads its root). */
  lightAt?: { x: number; y: number };
  /** Where it was drawn last frame, and whether it is travelling now (a ship or station points the way it goes, 22). */
  lastDrawn?: { x: number; y: number };
  /** Whether its view was drawn last frame: a move made while hidden (an entrance placing it) isn't travel. */
  wasDrawn?: boolean;
  moving?: boolean;
  /** Its heading has come from travel: the resting rule (toward its work, or the star) no longer turns it. */
  travelled?: boolean;
}

/** Whether a node's view can turn (a v1 asset's `face?`, or a v0 ship's or flight's). */
const turns = (e: NodeEntry): boolean => typeof (e.view as { face?: unknown }).face === 'function';
/** The kinds that point the way they travel (22): ships and stations. */
const TRAVELS: ReadonlySet<string> = new Set(['captain', 'facility', 'station']);
/** Horizontal screen speed (px/s) above which a ship turns to its travel, and how much it must lead its vertical speed. */
const TURN_PX_S = 12;
const TURN_LEAD = 0.35;
/** A move this long (screen px) in one frame is a snap (a seek, a scene entry), not travel. */
const SNAP_PX = 240;

/** How long a stage swap's dip lasts (s); the swap happens at its middle, under the flare's swell. */
const SWAP_S = 0.5;
/**
 * A claimed look that its maneuver never landed (a cut effect) shows anyway after this long on the
 * travel clock its land is timed on (s, 22 C9, 05 §8 P-18): a safety, never a deadline a land beats.
 */
export const CLAIM_SAFETY_S = 30;

/**
 * Arrive and Depart (decided 2026-10-08; 05 §5): one motion for an object coming into a scene and one
 * for one leaving it, whatever the cause (data streaming in, a creation or removal in playback, a
 * carry-over). Arrive comes in along its orbit from about 40° back, easing out, with a thin streak and a
 * soft ring as it settles; Depart carries on along the orbit and out, easing in, fading over its last
 * 45%. They run on wall time (live data arrives while playback is paused) and are never cut: past the
 * budget, the rest take a short fade. Their lengths are `ARRIVE_S` and `DEPART_S` (fx/timing, v1.3 F2).
 */
const CHEAP_S = 0.3;
const ARC = (40 * Math.PI) / 180;
/** At most this many full motions start per second; each one this long after the last. */
const MOTION_PER_S = 12;
const MOTION_STAGGER_S = 0.06;
/** Bodies that arrive and depart; mechanical art (ships, vessels, stations) keeps its own accents. */
const MOVING_KINDS = new Set<ViewNode['kind']>(['galaxy', 'star', 'planet', 'anomaly', 'missionPoint']);
/** Bodies that scale with the world: no screen floor on their view (06 §2). */
const CELESTIAL_KINDS = new Set<ViewNode['kind']>(['galaxy', 'star', 'planet', 'anomaly']);

/** An entry's capabilities: its asset's when it has one (v1), else the v0 kind tables'. */
function capsFor(node: ViewNode, def: AssetDef | undefined): EntryCaps {
  if (def) return { celestial: def.layer === 'celestial', moving: def.moving, flare: def.flare, body: def.body, framed: def.framed };
  return { celestial: CELESTIAL_KINDS.has(node.kind), moving: MOVING_KINDS.has(node.kind), flare: FLARE_KINDS.has(node.kind), body: BODY_KINDS.has(node.kind), framed: isFramed(node) };
}
type MotionKind = 'arrive' | 'depart';
/** `radial`: a radar Task moves only along its spoke (06 §3), in from or out past its band. */
interface Motion {
  kind: MotionKind; t: number; delay: number; dur: number; cheap: boolean; center: { x: number; y: number } | null; radial: boolean; trail: [number, number][]; ring: number;
  /** The view plays its own (a hive ship backing into a rift): no travel, and it fades only at the very end (2026-10-13). */
  own?: boolean;
  /** An arrival that curves in from this much further out (1: twice the radius), gently (2026-10-13). */
  spiral?: number;
  /** A quiet one (an episode's opening): no streak, no settle ring. */
  quiet?: boolean;
}

/** How an arrival comes in (`arrive`): round what, how far out it starts, how long, and how quietly. */
export interface ArriveOpts { center?: { x: number; y: number } | null; spiral?: number; dur?: number; quiet?: boolean }

/** Glide spring: ω = 1/τ with τ ≈ 0.3 s; critically damped, it settles in about a second. */
const GLIDE_W = 1 / 0.3;
/** How the next layout pass moves nodes: glide (a beat), snap (a seek, scene entry), or keep (zoom). */
type LayoutCause = 'glide' | 'snap' | 'zoom';

/** A quiet project's galaxy (nothing saved, nothing this range): same size, drawn dimmer (decided 2026-10-07). */
const QUIET_ALPHA = 0.42;

export interface SceneCallbacks {
  onSelect(node: ViewNode): void;
  onEnter(node: ViewNode): void;
  /** True when the press became a drag (a pan): its release is not a click (decided 2026-10-07). */
  suppressTap?(): boolean;
  onHover(node: ViewNode | null): void;
}

/** The act every v1 asset view has: its resting look, now (theme/starChart/assets/adapt.ts). */
const REST_ACT = 'rest';

/** Two taps on the same node within this window count as a double-click. */
export const DOUBLE_TAP_MS = 350;

const CYAN = 0x83dde2;
/** The planets' city-light gold (planet shader): the chart's color for success. */
const GOLD = 0xffc76b;
/** Progress blue (art/progress.ts): routes of open PRs, and their cargo motes. */
const BLUE = 0x5aa9ff;
const fract = (x: number) => x - Math.floor(x);


export class GraphScene {
  readonly root = new Container({ label: 'scene' });
  private readonly orbitalGuides = new Container({ label: 'orbitalGuides' });
  private readonly geography = new Container({ label: 'geography' });
  /**
   * Painted pieces that overlay their planet (`AssetDef.over`), drawn over the planets' names, which sit
   * between this layer and `geography` (22 D7: the name is the planet's lowest orbit).
   */
  private readonly overBodies = new Container({ label: 'overBodies' });
  /** The planets' names, crisp (outside the paint pass), each in screen px at the camera's scale. */
  private readonly nameLayer = new Container({ label: 'planetNames' });
  private readonly nameplates = new Map<string, { root: Container; sig: string }>();
  private readonly infrastructure = new Container({ label: 'infrastructure' });
  private readonly traffic = new Container({ label: 'traffic' });
  /** Mechanical art (stations, pins, vessels, ships): one container, kept crisp (no paint filter, 09 §7). */
  private readonly hardware = new Container({ label: 'hardware' });
  /** v1 hardware assets' crisp marks (a station's satellites), over their hulls and outside the paint pass. */
  private readonly hardwareMarks = new Container({ label: 'hardwareMarks' });
  /** v1 guides (the frontier belt, formation halos): one Graphics per theme guide, under the orbits. */
  private readonly guideLayer = new Container({ label: 'guides' });
  private readonly guideGraphics = new Map<string, Graphics>();
  /**
   * Nodes whose part in a guide a moment holds as it was before its beat (19 S2), by guide id: a
   * reassigned piece keeps the belt as it was until it flies.
   */
  private readonly heldMembers = new Map<string, Map<string, HeldMember>>();
  /** How shown each guide with a `shownBy` list is (19 S2), 0..1, and where it's fading to. */
  private readonly guidePresence = new Map<string, { at: number; to: number }>();
  /** The guides to draw; null reads the active theme's (only for scenes with `graph.solar`). */
  private guides: readonly ThemeGuide[] | null = null;
  /** What v1 assets may know beyond their node (14 §4): the theme, the viewer, their ship style. */
  private assetCtx: AssetCtx = { theme: DEFAULT_THEME, viewer: null, captain: null };
  /** The asset context changed: the next apply rebuilds every asset view. */
  private assetCtxStale = false;
  /**
   * Art acts playing, by projection key, and the pulse clock each began at. An act's art loops on
   * `motion.pulseTime` (up to 2× while playing fast), so the scene rests it after one loop of that
   * clock; the adapter's own wall-clock timeout still ends it when the pulse is still (reduced motion).
   */
  private readonly acting = new Map<string, number>();
  private readonly localEffects = new Container({ label: 'localEffects' });
  private readonly marks = new Container({ label: 'marks' });
  private readonly orbitsBack = new Graphics({ label: 'orbitsBack' });
  /** The far half of a solar region's seat ring (22): faint but plainly there, under the planets, so the ring reads as one line. */
  private readonly ringBack = new Graphics({ label: 'ringBack' });
  /** The Task radar's bands, accretion glow, and uncertain-link dashes (06 §3). */
  private readonly radarGuides = new Graphics({ label: 'radarGuides' });
  private readonly routes = new Graphics({ label: 'routes' });
  /** Blue cargo motes flowing along open PRs' station routes (redrawn each tick). */
  private readonly swarm = new Graphics({ label: 'cargoMotes' });
  private cargo: { at: (t: number) => readonly [number, number]; nx: number; ny: number; len: number; seed: number }[] = [];
  /**
   * Front halves of orbits, one Graphics per parent. They sit in the crisp guide layer, just under
   * the painted bodies: inside the paint pass a thin line smears into the sky (09 §7).
   */
  private readonly orbitsFront = new Map<string, Graphics>();
  private readonly nodes = new Map<string, NodeEntry>();
  private graph: ViewGraph | null = null;
  private lastScale = 0;
  private readonly effective = new Map<string, ViewNode>();
  private lastTap: { pk: string; at: number } | null = null;
  /** Each ship's and vessel's resting heading, so a flight accent can restore it. */
  private readonly facing = new Map<string, number>();
  private cause: LayoutCause = 'snap';
  /**
   * Protected moments (05 §5): a frozen node glides toward the goal it had when frozen; later layout
   * changes wait until it thaws, then the spring carries it on. Counted, so moments may overlap.
   */
  private readonly frozen = new Map<string, { at: { x: number; y: number }; count: number }>();
  /** Edges hidden until their ink reveals them (05 §5: lines are revealed, never popped). */
  private readonly held = new Set<string>();
  private reduced = false;
  /** Arrivals in flight, by projection key; departures keep their entry here until they're gone. */
  private readonly motions = new Map<string, Motion>();
  /** `guides`: the ids of the guides it kept shown (19 S2), which wait for it to be gone. */
  private readonly leaving = new Map<string, { entry: NodeEntry; m: Motion; guides?: string[] }>();
  private readonly streaks = new Graphics({ label: 'arriveDepart' });
  /** Stale badges (02 §3): on objects ADO wouldn't re-read, drawn crisp with the other off-ladder marks. */
  private readonly staleMarks = new Graphics({ label: 'staleMarks' });
  private motionBudget = { windowAt: 0, count: 0, nextAt: 0 };
  private wallAt = performance.now();
  private leaveSeq = 0;
  /** Counted arrivals and departures, for the e2e hooks. */
  readonly motionCount = { arrive: 0, depart: 0 };

  constructor(private readonly cb: SceneCallbacks) {
    this.streaks.blendMode = 'add';
    this.orbitalGuides.addChild(this.guideLayer, this.orbitsBack, this.ringBack, this.radarGuides, this.routes, this.swarm);
    this.geography.sortableChildren = true;
    this.overBodies.sortableChildren = true;
    this.hardware.addChild(this.infrastructure, this.traffic);
    this.marks.addChild(this.staleMarks);
    this.root.addChild(this.orbitalGuides, this.geography, this.nameLayer, this.overBodies, this.marks, this.hardware, this.hardwareMarks, this.localEffects, this.streaks);
  }

  /** The painterly pass (09 §7): paint over celestial bodies, impasto texture on hardware; null = off. */
  setPaint(paint: { bodies: Filter[]; hardware: Filter[] } | null): void {
    this.geography.filters = paint?.bodies ?? [];
    this.overBodies.filters = paint?.bodies ?? [];
    this.hardware.filters = paint?.hardware ?? [];
  }

  mount(graph: ViewGraph): void {
    this.apply(graph);
  }

  /**
   * Diff nodes and edges, the enter / update / exit join: create new, update changed, remove gone.
   * `beat` (playing crossed a beat): positions glide, and what leaves Departs. `data` (decided
   * 2026-10-08: the stream brought new facts): the same, and what's new Arrives. `jump` (a seek, a lens
   * toggle, scene entry): everything simply is where it is (INV-15).
   */
  apply(graph: ViewGraph, cause: 'beat' | 'jump' | 'data' = 'jump'): void {
    const prev = this.graph;
    const live = prev?.sceneKey === graph.sceneKey && cause !== 'jump';
    const prevNodes = new Map((prev?.nodes ?? []).map((n) => [n.projectionKey, n]));
    this.graph = graph;
    this.cause = cause !== 'jump' && !this.reduced ? 'glide' : 'snap';
    if (cause === 'jump') this.endMotions();
    const byPk = new Map(graph.nodes.map((n) => [n.projectionKey, n]));
    const parentOf = new Map(graph.edges.filter((e) => e.kind === 'orbit').map((e) => [e.to, byPk.get(e.from)]));
    const stationFor = new Map(
      graph.edges.filter((e) => e.kind === 'route' && byPk.get(e.to)?.kind === 'station').map((e) => [e.from, byPk.get(e.to)!]),
    );
    const seen = new Set<string>();
    const rebuildAssets = this.assetCtxStale;
    this.assetCtxStale = false;
    for (const node of graph.nodes) {
      seen.add(node.projectionKey);
      let entry = this.nodes.get(node.projectionKey);
      let fresh = false;
      // A radius change rebuilds only a v0 view: a v1 asset (a closing piece's platform, a smaller
      // station) keeps its view and scales, so it glides to its new place rather than jumping (22 C3, G-2).
      if (!entry || (entry.node.world.r !== node.world.r && !entry.asset) || entry.node.kind !== node.kind || entry.node.asset !== node.asset
        || (entry.asset && (rebuildAssets || entry.asset.rebuildOn?.(entry.node, node, this.assetCtx)))) {
        if (entry) this.destroyEntry(node.projectionKey, entry);
        entry = this.createEntry(node);
        this.nodes.set(node.projectionKey, entry);
        fresh = true;
        // New to the scene, from the stream: it Arrives (playback's arrivals come from the director).
        if (live && cause === 'data' && !prevNodes.has(node.projectionKey) && entry.caps.moving) this.arrive(node.projectionKey);
      }
      entry.node = node;
      if (node.kind === 'galaxy') entry.view.root.alpha = node.flags.quiet ? QUIET_ALPHA : 1;
      if (fresh) {
        entry.shownStage = node.stage;
        entry.view.setStage(node.stage);
      } else this.stageTo(node.projectionKey, entry, node.stage);
      if (entry.asset) this.orientAsset(node, entry, graph, parentOf.get(node.projectionKey));
      else {
        if (entry.view instanceof PlanetView) {
          const star = parentOf.get(node.projectionKey);
          if (star?.kind === 'star') entry.view.setLightFrom(star.world.x, star.world.y);
          else entry.view.setLightFrom(node.world.x - 900, node.world.y - 700); // close-up: light from upper left
        }
        if (entry.view instanceof ShipView) this.setFacing(node.projectionKey, entry, -(node.attach?.dirX ?? 1)); // nose toward its assignment
        if (entry.view instanceof FlightView) {
          const st = stationFor.get(node.projectionKey);
          if (st) this.setFacing(node.projectionKey, entry, st.world.x - node.world.x);
        }
      }
    }
    const kept = live ? this.guideKeepers(prev!) : null;
    for (const [pk, entry] of this.nodes) {
      if (seen.has(pk)) continue;
      // A moving object Departs; so does one with a departure of its own (a guest's warp out, 22 C8).
      if (live && (entry.caps.moving || (entry.asset?.departAct && !this.reduced))) this.depart(pk, entry, motionCenter(prev!, entry.node), kept?.get(pk));
      else this.destroyEntry(pk, entry);
    }
    for (const pk of [...this.pendingStage.keys()]) if (!seen.has(pk)) this.pendingStage.delete(pk);
    if (prev?.sceneKey !== graph.sceneKey) {
      // A new scene's guides are simply there.
      this.guidePresence.clear();
      this.heldMembers.clear();
    }
    this.drawOrbits(graph);
    this.lastScale = 0; // force a layout pass (targets, hit areas) on the next frame
  }

  /**
   * A v1 asset's light and heading, asked for by shape (`setLightFrom?`, `face?`) rather than class:
   * lit from its orbit's star, else the solar region's star, else the upper left; a ship noses
   * toward its assignment, anything else that turns faces the star.
   */
  private orientAsset(node: ViewNode, entry: NodeEntry, graph: ViewGraph, parent: ViewNode | undefined): void {
    const view = entry.view;
    const star = parent?.kind === 'star' ? parent.world : graph.solar?.star;
    if (view.setLightFrom) {
      entry.lightAt = star ? { x: star.x, y: star.y } : { x: node.world.x - 900, y: node.world.y - 700 };
      view.setLightFrom(entry.lightAt.x, entry.lightAt.y);
    }
    if (view.face) {
      // Only on a turn: an art's face() may rebuild its layers, which would cut short a running act.
      const dir = (node.attach ? -node.attach.dirX : star ? star.x - node.world.x : 1) || 1;
      // Its first heading, and a thing that never travels; once it has moved, its travel sets it (`faceByTravel`).
      if (!entry.travelled && Math.sign(dir) !== Math.sign(this.facing.get(node.projectionKey) ?? 0)) this.setFacing(node.projectionKey, entry, dir);
    }
  }

  /**
   * What v1 assets may know beyond their node (the viewer, their ship style). A change rebuilds every
   * asset view on the next apply, and re-applies the current graph now.
   */
  setAssetCtx(ctx: AssetCtx): void {
    const a = this.assetCtx;
    if (a.theme === ctx.theme && a.viewer === ctx.viewer && JSON.stringify(a.captain) === JSON.stringify(ctx.captain)) return;
    this.assetCtx = ctx;
    this.assetCtxStale = true;
    if (this.graph) this.apply(this.graph, 'jump');
  }

  /** The guides to draw under a solar region (the theme's, by default); null goes back to the default. */
  setGuides(guides: readonly ThemeGuide[] | null): void {
    this.guides = guides;
    if (this.graph) this.drawOrbits(this.graph);
  }

  /** An entry's capabilities (17 D7), for the effect directors; null when it has no view. */
  capsOf(pk: string): EntryCaps | null {
    return this.nodes.get(pk)?.caps ?? null;
  }

  /**
   * Play a transient art act on a node's view (a jump, a break-up): only an act its asset lists
   * (`AssetDef.acts`), or `rest`. False when the view has no such act, so a caller can try the
   * person's other view (a seat and its ship share a key).
   */
  actView(pk: string, name: string, slot?: number | readonly number[]): boolean {
    const entry = this.nodes.get(pk);
    const v = entry?.view;
    if (!v?.act) return false;
    if (name === REST_ACT) {
      this.acting.delete(pk);
      v.act(name);
      return true;
    }
    if (!entry!.asset?.acts?.includes(name)) return false;
    v.act(name, slot);
    this.acting.set(pk, motion.pulseTime);
    return true;
  }

  setSelection(): void {
    // Selection is drawn by the chart's screen-space reticle (06 §4).
  }

  /**
   * Apply the label-sized floors for mechanical objects (06 §2), re-place attached objects in screen
   * terms, and size hit areas (≥ 12 px). Called whenever the camera scale changes.
   */
  setCameraScale(scale: number): void {
    if (scale === this.lastScale) return;
    this.lastScale = scale;
    const prevTargets = new Map([...this.effective].map(([pk, n]) => [pk, { x: n.world.x, y: n.world.y }]));
    this.effective.clear();
    for (const entry of this.nodes.values()) {
      const { node, view } = entry;
      // A v1 asset's own screen floor, if it sets one; otherwise the kind's (sizing.ts). Floors are for
      // selectable objects (15 §5), as the kinds' are: a decorative mark (the round's preview, 19 P1) has none.
      const floor = node.selectable && entry.asset?.floorPx !== undefined ? entry.asset.floorPx * (node.floorScale ?? 1) : undefined; // an outer-ring station's is scaled (22 C11)
      const floored = floor !== undefined ? Math.max(screenRadius(node, scale), floor) : screenRadius(node, scale);
      const sr = node.maxScale ? Math.min(floored, node.world.r * node.maxScale * scale) : floored; // a ring station keeps to its slot (22 C11)
      const k = entry.builtR > 0 ? sr / (entry.builtR * scale) : 1; // against the size its view was built at
      if (!entry.caps.celestial) {
        entry.rest = k;
        view.root.scale.set(k * (entry.fxScale ?? 1));
      } else if (entry.builtR > 0 && node.world.r / entry.builtR !== entry.rest) {
        // A celestial body is drawn at its world size: one whose radius changed since it was built scales there.
        entry.rest = node.world.r / entry.builtR;
        view.root.scale.set(entry.rest * (entry.fxScale ?? 1));
      }
      view.setZoom?.(scale * view.root.scale.x);
      this.effective.set(node.projectionKey, { ...node, world: { ...node.world, r: sr / scale } });
    }
    // Formations, the PR lane, and every attached or travelling object, placed in screen terms (placement.ts).
    placeInScreen(this.effective, scale, this.graph?.lane, this.graph?.solar);
    // A ring station the station pass drew smaller, to fit its spot (22 C11): its view follows.
    for (const [pk, e] of this.effective) {
      if (e.kind !== 'facility') continue;
      const entry = this.nodes.get(pk);
      if (!entry || entry.builtR <= 0) continue;
      const k = e.world.r / entry.builtR;
      if (Math.abs(k - entry.rest) > 1e-6) {
        entry.rest = k;
        entry.view.root.scale.set(k * (entry.fxScale ?? 1));
        entry.view.setZoom?.(scale * entry.view.root.scale.x);
      }
    }
    // The minimum target grows a hit circle only as far as halfway to its nearest neighbour (never
    // below the object's own size), so dense scenes never have two targets claiming one spot.
    const targets = [...this.effective.values()].filter((n) => n.selectable);
    for (const [pk, entry] of this.nodes) {
      const e = this.effective.get(pk)!;
      if (!entry.hit) continue;
      let nearest = Infinity;
      // A piece overlays its planet (13 §3, v4), so the planet isn't a neighbour that crowds its hit.
      const overlays = e.kind === 'objective' || e.kind === 'threat';
      for (const o of targets) if (o.projectionKey !== pk && !(overlays && o.kind === 'seat')) nearest = Math.min(nearest, Math.hypot(o.world.x - e.world.x, o.world.y - e.world.y));
      const half = nearest / 2 - 0.5 / scale;
      const floor = entry.asset?.hitFloorPx !== undefined ? entry.asset.hitFloorPx / scale : 0;
      const want = Math.max(hitRadius(e, scale), floor);
      // Formation members touch (13 §3): their hits stop halfway to the nearest neighbour, even under
      // their visual size. Their screen pitch (placeFormation.ts) keeps that at 12 px or more (VC-3).
      const r = e.cluster ? Math.max(0, Math.min(Math.max(visualHitRadius(e, scale), want), half)) : Math.max(visualHitRadius(e, scale), Math.min(want, half));
      entry.hit.hitArea = new Circle(0, 0, r);
    }
    this.settle(prevTargets);
    if (this.graph) this.drawOrbits(this.graph); // orbit widths are in screen pixels
  }

  /**
   * After a layout pass, move the shown positions by the pass's cause: a beat glides (the spring
   * carries them), a seek or scene entry snaps, and a zoom keeps each node's lag relative to its
   * target, so zooming never sets anything gliding.
   */
  private settle(prev: Map<string, { x: number; y: number }>): void {
    if (this.cause === 'snap') this.frozen.clear(); // a seek or scene entry: the new state is simply there
    for (const [pk, entry] of this.nodes) {
      const t = this.effective.get(pk)!.world;
      const was = prev.get(pk);
      if (this.cause === 'snap' || !was) {
        entry.shown = { x: t.x, y: t.y, vx: 0, vy: 0 };
      } else if (this.cause === 'zoom') {
        entry.shown.x += t.x - was.x;
        entry.shown.y += t.y - was.y;
      }
      this.place(entry);
      // A v1 asset is lit from where it's drawn: a fresh view's root was still at the origin when
      // its node was applied, so its light is re-aimed now that it's placed.
      if (entry.lightAt) entry.view.setLightFrom?.(entry.lightAt.x, entry.lightAt.y);
    }
    this.cause = 'zoom';
  }

  /** Put a node's view and hit area where it's shown, plus any effect offset. */
  private place(entry: NodeEntry): void {
    const x = entry.shown.x + entry.off.x;
    const y = entry.shown.y + entry.off.y;
    entry.view.root.position.set(x, y);
    entry.hit?.position.set(entry.shown.x, entry.shown.y);
    // Painted bodies sort by depth (lower on screen is nearer). A piece that overlays its seat's planet
    // (`AssetDef.over`) always draws over the bodies that don't, wherever it sits on the planet's
    // disc: by depth alone, one on the planet's upper half went behind it (2026-10-12).
    if (entry.view.root.parent === this.geography || entry.view.root.parent === this.overBodies) entry.view.root.zIndex = y + (entry.asset?.over ? OVER_Z : 0);
  }

  /**
   * Draws the planets' names (22 D7) between the planets and the objects over them. Each plate is the
   * DOM plate's place and inks (`NamePlate`, screen px); `toWorld` maps a screen point to the scene's.
   * The layer is the scene's, scaled with the camera, so each plate is drawn at 1 / `scale` to stay in screen px.
   */
  setNamePlates(plates: readonly NamePlate[], scale: number, toWorld: (x: number, y: number) => { x: number; y: number }): void {
    const seen = new Set<string>();
    for (const p of plates) {
      seen.add(p.key);
      const w = p.rect.x1 - p.rect.x0;
      const h = p.rect.y1 - p.rect.y0;
      const sig = `${p.text}|${Math.round(w)}|${Math.round(h)}|${p.ink.title}|${p.ink.line}|${p.ink.glass}|${p.ink.size}|${p.ink.weight}`;
      let e = this.nameplates.get(p.key);
      if (!e) {
        e = { root: new Container({ label: `name:${p.key}` }), sig: '' };
        this.nameLayer.addChild(e.root);
        this.nameplates.set(p.key, e);
      }
      if (e.sig !== sig) {
        e.sig = sig;
        e.root.removeChildren().forEach((c) => c.destroy());
        const cut = Math.min(6, h / 2); // the holo frame's cut corners (holoLabel.ts framePath, a plate below its object)
        const glass = new Color(p.ink.glass);
        const line = new Color(p.ink.line);
        const frame = new Graphics()
          .poly([0, 0, w - cut, 0, w, cut, w, h, cut, h, 0, h - cut])
          .fill({ color: glass.toNumber(), alpha: glass.alpha })
          .stroke({ color: line.toNumber(), alpha: line.alpha, width: 1 });
        const text = new Text({
          text: p.text,
          style: { fontFamily: p.ink.family, fontSize: p.ink.size, fontWeight: p.ink.weight as never, fill: new Color(p.ink.title).toNumber(), align: 'center', wordWrap: true, wordWrapWidth: Math.max(10, w - 20 + 6), lineHeight: p.ink.size * 1.25 },
        });
        text.anchor.set(0.5);
        text.position.set(w / 2, h / 2);
        e.root.addChild(frame, text);
        e.root.pivot.set(w / 2, h / 2);
      }
      const c = toWorld((p.rect.x0 + p.rect.x1) / 2, (p.rect.y0 + p.rect.y1) / 2);
      e.root.position.set(c.x, c.y);
      e.root.scale.set(1 / scale);
    }
    for (const [key, e] of this.nameplates) {
      if (seen.has(key)) continue;
      e.root.destroy({ children: true });
      this.nameplates.delete(key);
    }
  }

  /**
   * Advance the glide layer (05 §5) by wall time; frozen while the user has paused. Lines follow
   * every frame, from where things are drawn.
   */
  glide(dtMs: number, frozen: boolean): void {
    // Guides on wall time, after the director has spawned the frame's beat (so a newcomer it hides
    // for its entrance never counts as drawn for a frame first).
    this.stepGuides(Math.min(0.1, dtMs / 1000));
    if (!frozen) {
      const dt = Math.min(0.1, dtMs / 1000);
      this.stepStages(dt);
      for (const [pk, entry] of this.nodes) {
        const t = this.frozen.get(pk)?.at ?? this.effective.get(pk)?.world;
        if (!t) continue;
        const s = entry.shown;
        // An owned node is drawn where its effect put it: the spring moves underneath, not the node.
        const held = entry.owned ? { x: s.x + entry.off.x, y: s.y + entry.off.y } : null;
        if (this.reduced) {
          entry.shown = { x: t.x, y: t.y, vx: 0, vy: 0 };
        } else if (Math.abs(s.x - t.x) + Math.abs(s.y - t.y) + Math.abs(s.vx) + Math.abs(s.vy) > 1e-3) {
          // Critically damped: a'' = −2ω a' − ω² (a − target).
          s.vx += (-2 * GLIDE_W * s.vx - GLIDE_W * GLIDE_W * (s.x - t.x)) * dt;
          s.vy += (-2 * GLIDE_W * s.vy - GLIDE_W * GLIDE_W * (s.y - t.y)) * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
        } else {
          entry.shown = { x: t.x, y: t.y, vx: 0, vy: 0 };
        }
        if (held) entry.off = { x: held.x - entry.shown.x, y: held.y - entry.shown.y };
        this.place(entry);
      }
      this.faceByTravel(dt);
    }
    if (this.graph) this.drawRoutes(this.graph, this.liveMap());
  }

  /** Reduced motion (05 §7): layout changes snap instead of gliding. */
  setReduced(on: boolean): void {
    this.reduced = on;
  }

  /** Nodes where they're drawn right now: shown position plus effect offset, floored radius. */
  private liveMap(): Map<string, ViewNode> {
    const out = new Map<string, ViewNode>();
    for (const [pk, entry] of this.nodes) {
      const e = this.effective.get(pk) ?? entry.node;
      out.set(pk, { ...e, world: { ...e.world, x: entry.shown.x + entry.off.x, y: entry.shown.y + entry.off.y } });
    }
    return out;
  }

  /**
   * A ship or station points the way it travels (22), whatever moves it: a glide to a new place, a
   * sortie, an entrance. From where it is drawn each frame, so an arc's bend or a leg's end points never
   * leave it pointing against its motion. It turns as soon as its horizontal speed is decisive, and
   * not on mostly vertical motion; still, it holds its heading (a ship nosed toward its work stays so).
   * While it moves, the movers' own `faceView` calls and the resting rule stand aside (`entry.moving`).
   */
  private faceByTravel(dt: number): void {
    if (this.reduced || dt <= 0) return;
    const scale = this.currentScale();
    for (const [pk, entry] of this.nodes) {
      if (!TRAVELS.has(entry.node.kind) || !turns(entry)) continue; // a v0 station's view can't turn
      const at = { x: entry.shown.x + entry.off.x, y: entry.shown.y + entry.off.y };
      const prev = entry.lastDrawn;
      const drew = entry.wasDrawn;
      entry.lastDrawn = at;
      entry.wasDrawn = entry.view.root.alpha > 0.05;
      if (!prev || !drew) continue;
      const dx = (at.x - prev.x) * scale;
      const dy = (at.y - prev.y) * scale;
      if (Math.hypot(dx, dy) > SNAP_PX) { entry.moving = false; continue; }
      const vx = dx / dt;
      const vy = dy / dt;
      entry.moving = Math.hypot(vx, vy) > TURN_PX_S;
      if (!entry.moving || Math.abs(vx) < TURN_PX_S || Math.abs(vx) < TURN_LEAD * Math.abs(vy)) continue;
      const now = this.facing.get(pk);
      if (now === undefined || Math.sign(vx) !== Math.sign(now)) this.setFacing(pk, entry, vx);
      entry.travelled = true;
    }
  }

  private setFacing(pk: string, entry: NodeEntry, dir: number): void {
    dir = Math.sign(dir) || 1; // east 1, west -1: never a raw offset (the warp-in scales its slide by it)
    this.facing.set(pk, dir);
    if (entry.asset) entry.view.face?.(dir);
    else (entry.view as ShipView | FlightView).face(dir);
  }

  // --- Hooks for the AnimationDirector (05 §5) ---------------------------------------------

  /** World-space layer for accent effects, above everything in the scene. */
  fxLayer(): Container {
    return this.localEffects;
  }

  /** Ships that jump in at their first sortie's spot this beat (22 C8, K-13), until a sortie takes them. */
  private readonly jumps = new Set<string>();
  /** A guest ship new this beat jumps in where it will park, rather than entering at its rest (K-13): hidden until then. */
  markJump(pk: string): void {
    this.jumps.add(pk);
    this.fadeView(pk, 0);
  }
  /** Every guest still waiting to jump in is simply there (a seek, the director cleared: INV-15). */
  endJumps(): void {
    for (const pk of this.jumps) this.fadeView(pk, 1);
    this.jumps.clear();
  }
  /** Whether a ship was to jump in, and it's taken now: the first sortie that asks flies it as a jump. */
  takeJump(pk: string): boolean {
    return this.jumps.delete(pk);
  }

  /** The camera scale the scene was last laid out at (world units per screen px is its inverse). */
  currentScale(): number {
    return this.lastScale || 1;
  }

  /** Move a node's view off where it's shown (flights, launches); (0, 0) puts it back. */
  offsetView(pk: string, dx: number, dy: number): void {
    const entry = this.nodes.get(pk);
    if (!entry) return;
    entry.off = { x: dx, y: dy };
    this.place(entry);
  }

  /**
   * Pursuit (05 §5): an effect takes a node over and draws it at an absolute point. The node's shown
   * position keeps gliding toward its layout target meanwhile, and the effect pursues *that* (its
   * goal, `goalOf`), so a target that jumps mid-flight becomes a goal that glides, and an effect
   * that ends at its goal hands the node back without a seam.
   */
  own(pk: string): void {
    const entry = this.nodes.get(pk);
    if (entry) entry.owned++;
  }

  release(pk: string): void {
    const entry = this.nodes.get(pk);
    if (!entry) return;
    entry.owned = Math.max(0, entry.owned - 1);
    if (!entry.owned) this.offsetView(pk, 0, 0);
  }

  /** Draw an owned node at an absolute world point. */
  placeAt(pk: string, x: number, y: number): void {
    const entry = this.nodes.get(pk);
    if (entry) this.offsetView(pk, x - entry.shown.x, y - entry.shown.y);
  }

  /**
   * Stage changes land with their cause (06 §5 polish): on a beat, a node's new stage waits until the
   * director lands it (when its flare swells, after the actor's beam), then swaps under a short dip.
   * A change the director doesn't claim by the next frame (a silent beat, an object off its plan)
   * applies at once; a seek, scene entry, or reduced motion applies it immediately.
   */
  private readonly pendingStage = new Map<string, { stage: string; frames: number; claimed: boolean; age: number }>();

  private stageTo(pk: string, entry: NodeEntry, stage: string): void {
    if (stage === entry.shownStage && !this.pendingStage.has(pk)) return;
    if (this.cause === 'glide' && stage !== entry.shownStage) {
      this.pendingStage.set(pk, { stage, frames: 0, claimed: false, age: 0 });
      return;
    }
    this.pendingStage.delete(pk);
    entry.swap = undefined;
    entry.view.root.alpha = 1;
    entry.shownStage = stage;
    entry.view.setStage(stage);
    if (this.cause === 'snap') entry.view.settle?.(); // a seek or scene entry: no easing either (19 M1)
  }

  shownStages(): Record<string, string> {
    return Object.fromEntries([...this.nodes].map(([pk, e]) => [pk, e.shownStage]));
  }

  /** How shown each guide is now, by id: 0 not drawn, 1 fully (a fade in between). */
  guidesShown(): Record<string, number> {
    return Object.fromEntries([...this.guideGraphics].map(([id, g]) => [id, g.visible ? g.alpha : 0]));
  }

  /**
   * Whether a node is still making its entrance (22 A8): hidden or fading up for it, sliding in (a
   * warp-in's offset), or arriving. Its plate waits until it's done.
   */
  entering(pk: string): boolean {
    const e = this.nodes.get(pk);
    if (!e) return false;
    // A warp-in slides its view in unowned; a flight owns its node and offsets it too, and that isn't an
    // entrance (a ship's plate stays up while it flies).
    return (e.view.root as Container & { __restAlpha?: number }).__restAlpha !== undefined
      || this.motions.has(pk) || (!e.owned && (e.off.x !== 0 || e.off.y !== 0));
  }

  /** How drawn each of these nodes' views is now (0 while hidden for an entrance), by projection key; absent without a view. */
  viewAlphas(pks: readonly string[]): Record<string, number> {
    return Object.fromEntries(pks.flatMap((pk) => {
      const e = this.nodes.get(pk);
      return e ? [[pk, e.view.root.alpha]] : [];
    }));
  }

  /** A station's drawn tenders and dock bay, in px from its view's origin, by slot (23 C6; a test hook). */
  tendersOf(pk: string): { tenders: { slot: number; x: number; y: number; docking: boolean }[]; bay: { x: number; y: number } } | null {
    const v = this.nodes.get(pk)?.view;
    return v?.tenders && v.bay ? { tenders: v.tenders(), bay: v.bay() } : null;
  }

  /** Each of these nodes' views' tint now, as a 0..1 grey (its green channel; 1 untinted), by projection key (19 M1). */
  viewTints(pks: readonly string[]): Record<string, number> {
    return Object.fromEntries(pks.flatMap((pk) => {
      const e = this.nodes.get(pk);
      const share = e?.view.lightShare?.();
      return e ? [[pk, Math.round((share ?? ((e.view.root.tint >> 8) & 0xff) / 255) * 1000) / 1000]] : [];
    }));
  }

  /**
   * Show `stage` now and keep the node's own stage pending, claimed, for the director to land: a node
   * new to the scene this beat that must come in as it was before the maneuver that changes it (a
   * facility arriving with its first merge comes in in its first form; 2026-10-13). Only the
   * director calls it, as it spawns a beat (never on a seek). False when the node has no view.
   */
  holdStage(pk: string, stage: string): boolean {
    const entry = this.nodes.get(pk);
    if (!entry || stage === entry.shownStage) return false;
    this.pendingStage.set(pk, { stage: entry.shownStage, frames: 0, claimed: true, age: 0 });
    entry.shownStage = stage;
    entry.view.setStage(stage);
    return true;
  }

  /** The director will land this node's stage change (returns false if there's none pending). */
  claimStage(pk: string): boolean {
    const p = this.pendingStage.get(pk);
    if (p) p.claimed = true;
    return !!p;
  }

  /** Land a claimed stage change now: the dip and swap. */
  landStage(pk: string): void {
    const p = this.pendingStage.get(pk);
    const entry = this.nodes.get(pk);
    if (!p || !entry) return;
    this.pendingStage.delete(pk);
    if (this.reduced) {
      entry.shownStage = p.stage;
      entry.view.setStage(p.stage);
      return;
    }
    entry.swap = { stage: p.stage, t: 0 };
  }

  /**
   * Holds `pks`' part in a guide as `graph` (the scene before a beat) had it, until `thawGuide`
   * (2026-10-13, 19 S2): a reassigned piece keeps the frontier belt as it was until it flies, so the
   * belt fades as the last unassigned piece leaves it, or as one comes to it, not ahead of the flight.
   * Counted per node, so moments may overlap; the other nodes follow the scene meanwhile.
   */
  freezeGuide(id: string, graph: ViewGraph, pks: readonly string[]): void {
    const guide = this.guidesFor(graph).find((x) => x.id === id);
    if (!guide?.shownBy || !pks.length) return;
    let held = this.heldMembers.get(id);
    if (!held) this.heldMembers.set(id, (held = new Map()));
    holdMembers(held, guide.shownBy(graph), pks);
  }

  /** Lets `pks` count for a held guide as the scene has them again. */
  thawGuide(id: string, pks: readonly string[]): void {
    const held = this.heldMembers.get(id);
    if (!held) return;
    releaseMembers(held, pks);
    if (!held.size) this.heldMembers.delete(id);
  }

  /** A seek or scene change: every pending stage shows at once, every art act rests and every eased look lands (INV-15). */
  landAllStages(): void {
    this.heldMembers.clear();
    this.snapGuides();
    for (const entry of this.nodes.values()) if (entry.asset) entry.view.act?.(REST_ACT);
    this.acting.clear();
    for (const [pk, p] of this.pendingStage) {
      const entry = this.nodes.get(pk);
      if (!entry) continue;
      entry.swap = undefined;
      entry.view.root.alpha = 1;
      entry.shownStage = p.stage;
      entry.view.setStage(p.stage);
    }
    this.pendingStage.clear();
    for (const entry of this.nodes.values()) {
      if (entry.swap) {
        entry.shownStage = entry.swap.stage;
        entry.view.setStage(entry.swap.stage);
        entry.view.root.alpha = 1;
        entry.swap = undefined;
      }
      entry.view.settle?.(); // a look a view eases into lands too (a station's standby, 19 M1)
    }
  }

  /** Advance pending stages and swaps (wall time; held while paused). */
  private stepStages(dt: number): void {
    for (const [pk, p] of this.pendingStage) {
      p.frames++;
      // On the clock its land is timed on (the travel clock, 22 C9, P-18), so a slow rate or a long
      // queued beat never shows a look before its land.
      p.age += dt * motion.travel;
      // Unclaimed after a frame, or claimed but never landed (a cut effect): show it anyway.
      if ((!p.claimed && p.frames >= 2) || p.age > CLAIM_SAFETY_S) {
        const entry = this.nodes.get(pk);
        this.pendingStage.delete(pk);
        if (entry) { entry.shownStage = p.stage; entry.view.setStage(p.stage); }
      }
    }
    for (const entry of this.nodes.values()) {
      const w = entry.swap;
      if (!w) continue;
      const before = w.t;
      w.t += dt;
      if (before < SWAP_S / 2 && w.t >= SWAP_S / 2) {
        entry.shownStage = w.stage;
        entry.view.setStage(w.stage);
      }
      entry.view.root.alpha = 1 - 0.45 * Math.sin(Math.PI * Math.min(1, w.t / SWAP_S));
      if (w.t >= SWAP_S) {
        entry.view.root.alpha = 1;
        entry.swap = undefined;
      }
    }
  }

  /** Hold a node's glide goal where its layout puts it now (a protected moment's cast, 05 §5). */
  freeze(pk: string): void {
    const f = this.frozen.get(pk);
    if (f) { f.count++; return; }
    const t = this.effective.get(pk)?.world;
    if (t) this.frozen.set(pk, { at: { x: t.x, y: t.y }, count: 1 });
  }

  /** Let a frozen node follow its layout again: it glides to wherever that is now. */
  thaw(pk: string): void {
    const f = this.frozen.get(pk);
    if (!f) return;
    if (--f.count <= 0) this.frozen.delete(pk);
  }

  /** A seek or scene change: nothing stays frozen. */
  thawAll(): void {
    this.frozen.clear();
  }

  /** A node's layout target (where it's going), as a live anchor for pursuit and beams. */
  targetOf(pk: string): [number, number] | null {
    const t = this.effective.get(pk)?.world;
    return t ? [t.x, t.y] : null;
  }

  /** A node's goal: its shown position, gliding toward its layout target. What pursuit aims at. */
  goalOf(pk: string): [number, number] | null {
    const e = this.nodes.get(pk);
    return e ? [e.shown.x, e.shown.y] : null;
  }

  /** Where a node is drawn this frame. */
  liveOf(pk: string): [number, number] | null {
    const e = this.nodes.get(pk);
    return e ? [e.shown.x + e.off.x, e.shown.y + e.off.y] : null;
  }

  /**
   * A named hardpoint of a node's art in world units now (23 C5; `emitter`: where a station's beam leaves):
   * its drawn position plus the art's anchor at the view's scale. Null when the node has no view or its art
   * has no such point.
   */
  anchorOf(pk: string, name: string): [number, number] | null {
    const e = this.nodes.get(pk);
    const at = this.liveOf(pk);
    const a = e?.view.anchor?.(name);
    if (!e || !at || !a) return null;
    return [at[0] + a[0] * e.view.root.scale.x, at[1] + a[1] * e.view.root.scale.y];
  }

  /** Nodes moving this frame: gliding, offset, or steered by an effect (dynamic labels, 06 §4). */
  movingKeys(): Set<string> {
    const out = new Set<string>();
    const tol = 0.5 / (this.lastScale || 1);
    for (const [pk, e] of this.nodes) {
      const t = this.effective.get(pk)?.world;
      if (e.owned > 0 || Math.abs(e.off.x) + Math.abs(e.off.y) > tol || (t && Math.hypot(e.shown.x - t.x, e.shown.y - t.y) > tol)) out.add(pk);
    }
    return out;
  }

  /** How many nodes are still gliding (for the director's volatility meter). */
  glidingCount(): number {
    let n = 0;
    for (const [pk, e] of this.nodes) {
      const t = this.effective.get(pk)?.world;
      if (t && Math.hypot(e.shown.x - t.x, e.shown.y - t.y) > 0.5 / (this.lastScale || 1)) n++;
    }
    return n;
  }

  /** Lines are revealed, never popped: a held edge isn't drawn until its ink releases it. */
  holdEdge(key: string): void {
    this.held.add(key);
  }

  releaseEdge(key: string): void {
    this.held.delete(key);
  }

  releaseAllEdges(): void {
    this.held.clear();
  }

  heldEdges(): string[] {
    return [...this.held];
  }

  /** Scale a node's view relative to its resting size (1 restores it). */
  scaleView(pk: string, k: number): void {
    const entry = this.nodes.get(pk);
    if (!entry) return;
    entry.fxScale = k === 1 ? undefined : k;
    entry.view.root.scale.set(entry.rest * k);
  }

  /** Fade a node's view (emerging objects); 1 restores the stage's own alpha. */
  fadeView(pk: string, alpha: number): void {
    const entry = this.nodes.get(pk);
    if (!entry) return;
    const r = entry.view.root as Container & { __restAlpha?: number };
    if (r.__restAlpha === undefined) r.__restAlpha = r.alpha;
    r.alpha = r.__restAlpha * alpha;
    if (alpha >= 1) delete r.__restAlpha;
  }

  /** Point a ship or vessel along its travel; restoreFacing puts it back to its resting heading. */
  faceView(pk: string, dir: number): void {
    const e = this.nodes.get(pk);
    if (e?.moving && TRAVELS.has(e.node.kind)) return; // while it moves, its travel points it
    const v = e?.view;
    if (e?.asset) v?.face?.(dir);
    else if (v instanceof ShipView || v instanceof FlightView) v.face(dir);
  }

  /** The solar plan's formations (which seat each group of pieces belongs to), when the scene is a region. */
  solarFormations(): readonly { id: string; seat: string }[] {
    return this.graph?.solar?.formations ?? [];
  }

  /** The solar plan's board: the frontier belt's rectangle round the star, in world units (27 D2), or null outside a region. */
  solarBoard(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const s = this.graph?.solar;
    return s ? { minX: s.star.x - s.frontier.rx1, maxX: s.star.x + s.frontier.rx1, minY: s.star.y - s.frontier.ry1, maxY: s.star.y + s.frontier.ry1 } : null;
  }

  /** Which way a node's view faces (1 east, −1 west), when it turns. */
  facingOf(pk: string): number | undefined {
    return this.facing.get(pk);
  }

  restoreFacing(pk: string): void {
    const e = this.nodes.get(pk);
    const v = e?.view;
    const dir = this.facing.get(pk);
    if (dir === undefined) return;
    if (e?.asset) v?.face?.(dir);
    else if (v instanceof ShipView || v instanceof FlightView) v.face(dir);
  }

  hasView(pk: string): boolean {
    return this.nodes.has(pk);
  }

  /** A node's drawn radius in world units (its screen floor applied), or null when it isn't drawn. */
  drawnR(pk: string): number | null {
    return this.effective.get(pk)?.world.r ?? null;
  }

  /** Nodes as drawn this frame: floored radii, shown (gliding) positions. */
  effectiveNodes(): ViewNode[] {
    const live = this.liveMap();
    return this.graph?.nodes.map((n) => live.get(n.projectionKey) ?? n) ?? [];
  }

  /** Nodes at their layout targets: where this beat's state puts them (accents aim here). */
  targetNodes(): ViewNode[] {
    return this.graph?.nodes.map((n) => this.effective.get(n.projectionKey) ?? n) ?? [];
  }

  /** Hit circles in world units, straight from the scene (VC-3 checks the truth, not a model of it). */
  hitCircles(): { projectionKey: string; kind: string; label: string; x: number; y: number; r: number }[] {
    const out = [];
    for (const [pk, { node, hit }] of this.nodes) {
      if (!hit) continue;
      const c = hit.hitArea as Circle;
      out.push({ projectionKey: pk, kind: node.kind, label: node.label, x: hit.x, y: hit.y, r: c.radius });
    }
    return out;
  }

  /**
   * Don't draw galaxies outside the view (decided 2026-10-07: an org can hold hundreds). Only
   * galaxies: in other scenes off-screen objects still feed effects and trails.
   */
  cull(view: { minX: number; minY: number; maxX: number; maxY: number }): void {
    for (const { node, view: v } of this.nodes.values()) {
      if (node.kind !== 'galaxy') continue;
      const m = node.world.r * 1.3;
      v.root.visible = node.world.x + m >= view.minX && node.world.x - m <= view.maxX && node.world.y + m >= view.minY && node.world.y - m <= view.maxY;
    }
  }

  tick(seconds: number): void {
    // An act rests after one loop of the pulse clock it plays on (at 2× it would otherwise loop twice).
    for (const [pk, from] of this.acting) {
      if (motion.pulseTime - from < EVENT_LOOP_S && motion.pulseTime >= from) continue;
      this.acting.delete(pk);
      this.nodes.get(pk)?.view.act?.(REST_ACT);
    }
    for (const { view, asset } of this.nodes.values()) {
      view.tick(seconds);
      const marks = view.marks;
      if (!marks) continue;
      // Marks follow the view's transform: its place and its scale (a floored hull's satellites).
      marks.position.copyFrom(view.root.position);
      marks.scale.copyFrom(view.root.scale);
      if (asset) marks.alpha = view.root.alpha; // an asset's marks fade with it (v0 marks keep theirs)
    }
    for (const { entry } of this.leaving.values()) entry.view.tick(seconds);
    this.tellAmbient();
    this.drawSwarm(seconds);
    this.drawStale();
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.wallAt) / 1000); // wall time: arrivals play while paused
    this.wallAt = now;
    this.stepMotions(dt);
  }

  private ambientAt = 0;

  /**
   * Tells each view about its surroundings, about four times a second (2026-10-12): how lately its node
   * was worked, and a threat which way the nearest captain is as drawn now. Views that don't listen
   * cost nothing.
   */
  private tellAmbient(): void {
    const now = performance.now();
    if (now - this.ambientAt < 250) return;
    this.ambientAt = now;
    let ships: [number, number][] | null = null;
    for (const { node, view } of this.nodes.values()) {
      if (!view.ambient) continue;
      const a: Ambient = { activity: node.activity ?? 0 };
      if (node.kind === 'threat') {
        ships ??= [...this.nodes.values()].filter((e) => e.node.kind === 'captain').map((e) => [e.view.root.x, e.view.root.y]);
        const [x, y] = [view.root.x, view.root.y];
        let best: [number, number] | null = null;
        let d = Infinity;
        for (const [sx, sy] of ships) {
          const dd = Math.hypot(sx - x, sy - y);
          if (dd < d) { d = dd; best = [sx - x, sy - y]; }
        }
        a.toward = best;
      }
      view.ambient(a);
    }
  }

  /** Arrive (05 §5): an object new to the scene comes in along its orbit, after `delay` s. Counted; never cut. */
  arrive(pk: string, delay = 0, o: ArriveOpts = {}): void {
    const entry = this.nodes.get(pk);
    if (!entry || this.motions.has(pk)) return;
    const center = o.center !== undefined ? o.center : this.graph ? motionCenter(this.graph, entry.node) : null;
    const m = this.motion('arrive', center, entry.node.kind === 'missionPoint');
    m.delay = Math.max(m.delay, delay);
    if (o.spiral !== undefined) m.spiral = o.spiral;
    if (o.quiet) m.quiet = true;
    if (o.dur !== undefined && !m.cheap) m.dur = o.dur;
    this.motions.set(pk, m);
    entry.owned++;
    this.fadeView(pk, 0);
    // Hidden at its starting point from now, so nothing leaps when it sets off.
    const start = this.motionAt(m, { x: entry.shown.x, y: entry.shown.y }, entry.node.world.r, 0);
    this.offsetView(pk, start.x - entry.shown.x, start.y - entry.shown.y);
    this.motionCount.arrive++;
  }

  /** Arrivals and departures still in flight (tests and the gallery). */
  activeMotions(): number {
    return this.motions.size + this.leaving.size;
  }

  private depart(pk: string, entry: NodeEntry, center: { x: number; y: number } | null, guides?: string[]): void {
    this.nodes.delete(pk);
    this.facing.delete(pk);
    this.pendingStage.delete(pk);
    if (this.motions.delete(pk)) entry.owned = Math.max(0, entry.owned - 1);
    if (entry.hit) { entry.hit.removeAllListeners(); entry.hit.destroy(); entry.hit = null; } // gone from the scene: not clickable
    const m = this.motion('depart', center, entry.node.kind === 'missionPoint');
    // An asset with its own departure (a hive ship backing into a rift) plays it in place.
    const own = entry.asset?.departAct;
    if (own && !this.reduced && entry.view.act) {
      entry.view.act(own);
      m.own = true;
      m.dur = entry.asset?.departS ?? 1;
    }
    this.leaving.set(`${pk}#${++this.leaveSeq}`, guides?.length ? { entry, m, guides } : { entry, m });
    this.motionCount.depart++;
  }

  /** A motion, full or cheap by the budget: at most MOTION_PER_S full ones a second, staggered. */
  private motion(kind: MotionKind, center: { x: number; y: number } | null, radial = false): Motion {
    const now = performance.now() / 1000;
    const b = this.motionBudget;
    if (now - b.windowAt >= 1) { b.windowAt = now; b.count = 0; }
    const cheap = this.reduced || b.count >= MOTION_PER_S;
    let delay = 0;
    if (!cheap) {
      b.count++;
      delay = Math.max(0, b.nextAt - now);
      b.nextAt = now + delay + MOTION_STAGGER_S;
    }
    return { kind, t: 0, delay, dur: cheap ? CHEAP_S : kind === 'arrive' ? ARRIVE_S : DEPART_S, cheap, center, radial: radial && center !== null, trail: [], ring: -1 };
  }

  /** Where a motion draws its object at progress `k` (0..1), around `home` (its place in the layout). */
  private motionAt(m: Motion, home: { x: number; y: number }, r: number, k: number): { x: number; y: number } {
    if (m.cheap || m.own) return home;
    const c = m.center ?? { x: home.x - r * 6, y: home.y + r * 8 }; // no orbit: a short arc from below left
    const dx = home.x - c.x;
    const dy = home.y - c.y;
    const rad = Math.hypot(dx, dy) || r * 4;
    const a0 = Math.atan2(dy, dx);
    if (m.radial) {
      // Along the spoke only: in from 30% further out, or on out past the band.
      const f = m.kind === 'arrive' ? 1 + 0.3 * (1 - (1 - (1 - k) ** 3)) : 1 + 0.4 * k ** 2.2;
      return { x: c.x + dx * f, y: c.y + dy * f };
    }
    if (m.kind === 'arrive') {
      const e = 1 - (1 - k) ** 3;
      const a = a0 - ARC * (1 - e);
      const out = rad * (1 + (m.spiral ?? 0) * (1 - e));
      return { x: c.x + Math.cos(a) * out, y: c.y + Math.sin(a) * out };
    }
    const e = k ** 2.2;
    const a = a0 + ARC * e;
    const out = rad * (1 + 0.6 * e);
    return { x: c.x + Math.cos(a) * out, y: c.y + Math.sin(a) * out };
  }

  private stepMotions(dt: number): void {
    const g = this.streaks.clear();
    const px = 1 / (this.lastScale || 1);
    const draw = (m: Motion, at: { x: number; y: number }, r: number, alpha: number) => {
      if (m.cheap) return;
      m.trail.push([at.x, at.y]);
      if (m.trail.length > 9) m.trail.shift();
      const n = m.trail.length;
      for (let i = 1; i < n; i++) {
        const [x0, y0] = m.trail[i - 1]!;
        const [x1, y1] = m.trail[i]!;
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: Math.max(0.6, r * 0.12 / px) * px * (i / n), color: CYAN, alpha: 0.55 * alpha * (i / n) ** 2 });
      }
    };
    for (const [pk, m] of this.motions) {
      const entry = this.nodes.get(pk);
      if (!entry) { this.motions.delete(pk); continue; }
      if (m.delay > 0) { m.delay -= dt; continue; }
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const home = { x: entry.shown.x, y: entry.shown.y };
      const r = this.effective.get(pk)?.world.r ?? entry.node.world.r;
      const at = this.motionAt(m, home, r, k);
      this.offsetView(pk, at.x - home.x, at.y - home.y);
      this.fadeView(pk, Math.min(1, k / (m.cheap ? 1 : 0.4)));
      if (!m.quiet) draw(m, at, r, 1 - k);
      if (k >= 1) {
        if (m.ring < 0 && !m.cheap && !m.quiet) m.ring = 0;
        if (m.ring >= 0 && m.ring < 0.5) {
          m.ring += dt;
          const q = m.ring / 0.5;
          g.circle(home.x, home.y, r * (1 + 0.6 * q)).stroke({ width: 1.2 * px, color: CYAN, alpha: 0.5 * (1 - q) });
          continue;
        }
        this.motions.delete(pk);
        entry.owned = Math.max(0, entry.owned - 1);
        this.fadeView(pk, 1);
        if (!entry.owned) this.offsetView(pk, 0, 0);
      }
    }
    for (const [id, { entry, m }] of this.leaving) {
      if (m.delay > 0) { m.delay -= dt; continue; }
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const home = { x: entry.shown.x, y: entry.shown.y };
      const at = this.motionAt(m, home, entry.node.world.r, k);
      entry.view.root.position.set(at.x, at.y);
      entry.view.marks?.position.set(at.x, at.y);
      entry.view.root.alpha = m.cheap ? 1 - k : m.own ? 1 - Math.max(0, (k - 0.85) / 0.15) : 1 - Math.max(0, (k - 0.55) / 0.45);
      if (entry.view.marks) entry.view.marks.alpha = entry.view.root.alpha;
      if (!m.own) draw(m, at, entry.node.world.r, k < 0.55 ? 1 : entry.view.root.alpha);
      if (k >= 1) {
        entry.view.destroy();
        this.leaving.delete(id);
      }
    }
  }

  /** A seek or scene change: arrivals land, departures are simply gone (INV-15). */
  private endMotions(): void {
    this.endJumps();
    for (const [pk] of this.motions) {
      const entry = this.nodes.get(pk);
      if (!entry) continue;
      entry.owned = Math.max(0, entry.owned - 1);
      this.fadeView(pk, 1);
      if (!entry.owned) this.offsetView(pk, 0, 0);
    }
    this.motions.clear();
    for (const { entry } of this.leaving.values()) entry.view.destroy();
    this.leaving.clear();
    this.streaks.clear();
  }

  /**
   * Cargo in motion (09 §4): a sparse scatter of points of progress-blue light flowing from an open
   * PR's vessel to its station. Motion marks work underway, so completed PRs have none. Ambient
   * (05 §5): it never encodes an event, and it freezes with the ambient clock.
   */
  private drawSwarm(seconds: number): void {
    const g = this.swarm;
    g.clear();
    if (!this.cargo.length) return;
    const px = 1 / (this.lastScale || 1);
    for (const path of this.cargo) {
      const screenLen = path.len / px;
      const n = Math.max(3, Math.min(7, Math.round(screenLen / 45)));
      const speed = 18 / Math.max(40, screenLen); // about 18 px per second along the path
      for (let k = 0; k < n; k++) {
        const phase = fract(Math.sin((path.seed + k * 17.31) * 12.9898) * 43758.5453);
        const t = fract(phase + k / n + seconds * speed * (0.75 + 0.5 * phase));
        const [x, y] = path.at(t);
        const wobble = Math.sin(seconds * (0.6 + phase) + phase * 20) * 5 * px;
        const fade = Math.pow(Math.sin(Math.PI * t), 0.7);
        const glint = 0.55 + 0.45 * Math.sin(seconds * (1.6 + phase * 1.4) + phase * 13);
        const cx = x + path.nx * wobble;
        const cy = y + path.ny * wobble;
        g.circle(cx, cy, 3.2 * px).fill({ color: BLUE, alpha: 0.18 * fade * glint });
        g.circle(cx, cy, 1.2 * px).fill({ color: 0xcfe6ff, alpha: 0.9 * fade * glint });
      }
    }
  }

  /**
   * A badge on each object whose facts ADO refused on the last sync (02 §3, decided 2026-10-09): what
   * you see is the last we knew. It sits at the upper left, where no ladder ornament goes — the
   * unknown-state "?" takes the upper right — and is sized in screen pixels, so it reads at any zoom.
   * Ivory on ink, like the other off-ladder marks: never a hue, so it can't be read as a work state
   * (INV-20).
   */
  private drawStale(): void {
    const g = this.staleMarks.clear();
    const scale = this.lastScale || 1;
    const px = 1 / scale;
    for (const [pk, entry] of this.nodes) {
      if (!entry.node.flags.stale) continue;
      const r = (this.effective.get(pk) ?? entry.node).world.r;
      const x = entry.shown.x + entry.off.x - r * 0.72;
      const y = entry.shown.y + entry.off.y - r * 0.72;
      const rad = Math.max(5 * px, Math.min(9 * px, r * 0.22));
      g.circle(x, y, rad).fill({ color: 0x081629, alpha: 0.85 }).stroke({ width: 1.4 * px, color: 0xf4f0de, alpha: 0.75 });
      // A clock face: this is about when we last heard, not about the work.
      g.moveTo(x, y).lineTo(x, y - rad * 0.55).moveTo(x, y).lineTo(x + rad * 0.45, y + rad * 0.2)
        .stroke({ width: 1.3 * px, color: 0xf4f0de, alpha: 0.9 });
    }
  }

  currentGraph(): ViewGraph | null {
    return this.graph;
  }

  dispose(): void {
    this.endMotions();
    for (const [pk, entry] of this.nodes) this.destroyEntry(pk, entry);
    for (const g of this.orbitsFront.values()) g.destroy();
    this.orbitsFront.clear();
    this.guideGraphics.clear(); // destroyed with the root below
    this.guidePresence.clear();
    this.heldMembers.clear();
    this.root.destroy({ children: true });
    this.graph = null;
  }

  private createEntry(node: ViewNode): NodeEntry {
    const r = node.world.r;
    let view: NodeViewLike | null = null;
    let layer = this.geography;
    let marksLayer = this.marks;
    // A v1 node is drawn by its theme asset (14 §3 step 6); every other node by the v0 switch below.
    let asset = assetFor(node);
    if (asset) {
      try {
        view = asset.make(node, this.assetCtx);
        if (asset.layer !== 'celestial') {
          layer = asset.layer === 'infrastructure' ? this.infrastructure : this.traffic;
          marksLayer = this.hardwareMarks;
        }
      } catch (err) {
        // An adapter that can't draw this node: fall back to the v0 switch, never a dead scene.
        console.warn(`asset ${asset.id} could not draw ${node.projectionKey}`, err);
        asset = undefined;
      }
    }
    if (!view) switch (node.role === 'unexplored' ? 'ghost' : node.kind) {
      case 'ghost': view = new GhostView(r); break;
      case 'overflow': view = new LoadMoreView(r); break;
      case 'star': view = new StarView(r, node.seed); break;
      case 'anomaly': view = new AnomalyView(r, node.seed); break;
      case 'planet': view = new PlanetView(r, node.seed); break;
      case 'galaxy': view = new GalaxyView(r, node.seed); break;
      case 'station': view = new StationView(r, node.seed); layer = this.infrastructure; break;
      case 'missionPoint': view = new TaskDotView(r); layer = this.infrastructure; break;
      case 'flight': view = new FlightView(r, node.seed); layer = this.traffic; break;
      case 'captain': view = new ShipView(node.seed, r); layer = this.traffic; break;
      case 'assignmentBeacon': view = new BeaconView(node.seed, r); layer = this.traffic; break;
      default: view = new TaskDotView(r); break;
    }
    if (asset?.over && layer === this.geography) layer = this.overBodies; // over its planet, and over the planet's name
    layer.addChild(view.root);
    if (node.kind === 'galaxy' && node.flags.quiet) view.root.alpha = QUIET_ALPHA;
    if (view.marks) marksLayer.addChild(view.marks);
    let hit: Container | null = null;
    if (node.selectable) {
      hit = new Container({ label: `hit:${node.projectionKey}` });
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.hitArea = new Circle(0, 0, hitRadius(node, 1));
      const pk = node.projectionKey;
      hit.on('pointertap', () => {
        const current = this.nodes.get(pk)?.node;
        if (!current || this.cb.suppressTap?.()) return;
        const now = performance.now();
        const double = this.lastTap?.pk === pk && now - this.lastTap.at < DOUBLE_TAP_MS;
        this.lastTap = double ? null : { pk, at: now };
        if (double) this.cb.onEnter(current);
        else this.cb.onSelect(current);
      });
      hit.on('pointerover', () => this.cb.onHover(this.nodes.get(pk)?.node ?? null));
      hit.on('pointerout', () => this.cb.onHover(null));
      // Smaller targets on top so a ship beside a planet stays clickable.
      hit.zIndex = -r;
      this.localEffects.sortableChildren = true;
      this.localEffects.addChild(hit);
    }
    return { node, view, asset, caps: capsFor(node, asset), hit, builtR: node.world.r, rest: 1, shown: { x: node.world.x, y: node.world.y, vx: 0, vy: 0 }, off: { x: 0, y: 0 }, owned: 0, shownStage: '' };
  }

  private destroyEntry(pk: string, entry: NodeEntry): void {
    if (entry.hit) {
      entry.hit.removeAllListeners();
      entry.hit.destroy();
    }
    entry.view.destroy();
    this.nodes.delete(pk);
    this.facing.delete(pk);
    this.acting.delete(pk);
  }

  private drawOrbits(graph: ViewGraph): void {
    const back = this.orbitsBack;
    back.clear();
    this.ringBack.clear();
    for (const g of this.orbitsFront.values()) g.clear();
    const SEG = 96;
    const used = new Set<string>();
    const drawn = new Set<string>();
    let ringDrawn = false;
    for (const e of graph.edges) {
      if (e.kind !== 'orbit' || e.geometry?.kind !== 'ellipse') continue;
      if (e.geometry.band) continue; // a radar Task's band: drawn once, below, from graph.radar
      // A board's ring is its swimlane band alone (drawBoard): no thin orbit line over it (decided 2026-10-09).
      const geo = e.geometry;
      if (graph.board?.rings.some((r) => Math.abs(r.rx - geo.rx) < 1)) continue;
      if (this.held.has(e.key)) continue; // its ink is drawing it
      // Mirrored bodies share one orbit; draw each ring once so it doesn't double in brightness.
      const ringKey = `${e.from}|${Math.round(e.geometry.cx)}|${Math.round(e.geometry.cy)}|${Math.round(e.geometry.rx)}${e.geometry.arc ? `|${e.to}` : ''}`;
      if (drawn.has(ringKey)) continue;
      drawn.add(ringKey);
      let front = this.orbitsFront.get(e.from);
      if (!front) {
        front = new Graphics({ label: `orbitsFront:${e.from}` });
        this.orbitsFront.set(e.from, front);
        this.orbitalGuides.addChildAt(front, this.orbitalGuides.getChildIndex(this.orbitsBack) + 1);
      }
      used.add(e.from);
      const { cx, cy, rx, ry, arc } = e.geometry;
      if (arc && graph.solar) {
        // A solar region's planets all stand on one ring (13 §3, v4): draw it once, whole, however many
        // planets there are or where they fall. Each seat's own short arc (`arcSpan`) is the layout's
        // clearance, not the line: drawn per seat, the arcs met, overlapped and left gaps by the planets'
        // spacing, near halves bright and far halves lost, so the ring looked broken.
        const sameRing = `${e.from}|${Math.round(cx)}|${Math.round(cy)}|${Math.round(rx)}|${Math.round(ry)}|ring`;
        if (drawn.has(sameRing)) continue;
        drawn.add(sameRing);
        ringDrawn = true;
        const dashed = graph.edges.filter((o) => o.kind === 'orbit' && o.from === e.from && o.geometry?.kind === 'ellipse' && Math.abs(o.geometry.rx - rx) < 1).every((o) => o.uncertain);
        const STEPS = 120;
        for (let i = 0; i < STEPS; i++) {
          if (dashed && i % 2 === 1) continue;
          const a0 = (i / STEPS) * Math.PI * 2;
          const a1 = ((i + 1) / STEPS) * Math.PI * 2;
          const g = Math.sin((a0 + a1) / 2) > 0 ? front : this.ringBack;
          g.moveTo(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry).lineTo(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry);
        }
        continue;
      }
      if (arc) {
        // A seat's orbit is a short arc through its planet (13 §3, v2): the half with sin > 0 passes in
        // front of the plane's centre (the near half), the rest is the faint far half.
        const segs = Math.max(8, Math.ceil(((arc.to - arc.from) * 180) / Math.PI / 2.5));
        for (let i = 0; i < segs; i++) {
          const a0 = arc.from + ((arc.to - arc.from) * i) / segs;
          const a1 = arc.from + ((arc.to - arc.from) * (i + 1)) / segs;
          const g = Math.sin((a0 + a1) / 2) > 0 ? front : back;
          if (e.uncertain && i % 2 === 1) continue; // dashed, like an uncertain route
          g.moveTo(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry).lineTo(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry);
        }
        continue;
      }
      for (const [g, t0] of [[back, Math.PI], [front, 0]] as const) {
        g.moveTo(cx + Math.cos(t0) * rx, cy + Math.sin(t0) * ry);
        for (let i = 1; i <= SEG / 2; i++) {
          const a = t0 + (i / (SEG / 2)) * Math.PI;
          // An uncertain orbit (the retrospective lens, 02 §6) is dashed, like an uncertain route.
          if (e.uncertain && i % 2 === 0) g.moveTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
          else g.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
        }
      }
      if (rx > 200) {
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const len = i % 6 === 0 ? 9 : 4;
          const g = Math.sin(a) > 0.01 ? front : back; // ticks where the halves meet belong to the faint back half
          g.moveTo(cx + Math.cos(a) * (rx - len), cy + Math.sin(a) * (ry - len * (ry / rx)))
            .lineTo(cx + Math.cos(a) * (rx + len), cy + Math.sin(a) * (ry + len * (ry / rx)));
        }
      }
    }
    // Widths in screen pixels at the current zoom, so orbits read the same at every scale.
    const px = 1 / (this.lastScale || 1);
    back.stroke({ width: px, color: CYAN, alpha: 0.05 });
    if (ringDrawn) this.ringBack.stroke({ width: 1.1 * px, color: CYAN, alpha: 0.2 });
    this.drawRadar(graph, px);
    this.drawBoard(graph, back, px);
    this.drawGuides(graph, px);
    for (const [key, g] of this.orbitsFront) {
      // Low priority, but plainly visible where the orbit passes in front.
      // A soft wide glow under a fine line, so the canvas weave can't break it into dots.
      if (used.has(key)) g.stroke({ width: 5 * px, color: CYAN, alpha: 0.06 }).stroke({ width: 1.3 * px, color: CYAN, alpha: 0.45 });
      else {
        g.destroy();
        this.orbitsFront.delete(key);
      }
    }
  }

  /**
   * The guides hook (v1, 14 §2.8): each theme guide draws into its own Graphics, cleared first, under
   * the orbits. Only scenes with a solar setup read the theme's guides, so v0 scenes draw nothing here.
   */
  private guidesFor(graph: ViewGraph) {
    return this.guides ?? (graph.solar ? activeTheme()?.guides ?? [] : []);
  }

  private drawGuides(graph: ViewGraph, px: number): void {
    const guides = this.guidesFor(graph);
    const ids = new Set(guides.map((g) => g.id));
    for (const [id, g] of this.guideGraphics) {
      if (ids.has(id)) continue;
      g.destroy();
      this.guideGraphics.delete(id);
    }
    for (const guide of guides) {
      let g = this.guideGraphics.get(guide.id);
      if (!g) {
        g = new Graphics({ label: `guide:${guide.id}` });
        this.guideGraphics.set(guide.id, g);
        this.guideLayer.addChild(g);
      }
      guide.draw(g.clear(), graph, px);
      if (!guide.shownBy) {
        this.guidePresence.delete(guide.id);
        g.alpha = 1;
        g.visible = true;
        continue;
      }
      // In play it follows its nodes, frame by frame (stepGuides); a seek, a new scene and reduced
      // motion snap it to whether it has any (INV-15).
      const p = this.guidePresence.get(guide.id);
      if (!p || this.cause === 'snap') {
        const to = guide.shownBy(graph).length ? 1 : 0;
        this.guidePresence.set(guide.id, { at: to, to });
      }
      this.showGuide(guide.id);
    }
    for (const id of this.guidePresence.keys()) if (!ids.has(id)) this.guidePresence.delete(id);
  }

  /** Each node a guide with `shownBy` counts in `graph` (held ones as they were), with those guides' ids. */
  private guideKeepers(graph: ViewGraph): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const guide of this.guidesFor(graph)) {
      if (!guide.shownBy) continue;
      for (const pk of guideMembers(guide.shownBy(graph), this.heldMembers.get(guide.id))) out.set(pk, [...out.get(pk) ?? [], guide.id]);
    }
    return out;
  }

  /** Whether a guide with `shownBy` is wanted now: one of its nodes drawn, or one it waits on still leaving. */
  private guideWanted(guide: ThemeGuide & Required<Pick<ThemeGuide, 'shownBy'>>, graph: ViewGraph): boolean {
    const members = guideMembers(guide.shownBy(graph), this.heldMembers.get(guide.id));
    let leaving = 0;
    for (const l of this.leaving.values()) if (l.guides?.includes(guide.id)) leaving++;
    // Drawn: its view is on the board and not hidden for an entrance still to come.
    return guideWanted(members, (pk) => (this.nodes.get(pk)?.view.root.alpha ?? 0) > 0, leaving);
  }

  /**
   * The opening (13 §4) hides the cast for its entrances: a guide that shows for its nodes hides with
   * them now, and comes in as the first of them does.
   */
  hideGuides(): void {
    for (const [id, p] of this.guidePresence) {
      p.at = 0;
      this.showGuide(id);
    }
  }

  private showGuide(id: string): void {
    const p = this.guidePresence.get(id);
    const g = this.guideGraphics.get(id);
    if (!p || !g) return;
    g.alpha = p.at;
    g.visible = p.at > 0;
  }

  /** Every guide is where it's going, now (a seek): shown when it has nodes at the playhead (INV-15). */
  private snapGuides(): void {
    const graph = this.graph;
    for (const [id, p] of this.guidePresence) {
      const guide = graph ? this.guidesFor(graph).find((x) => x.id === id) : undefined;
      if (graph && guide?.shownBy) p.to = guide.shownBy(graph).length ? 1 : 0;
      p.at = p.to;
      this.showGuide(id);
    }
  }

  /**
   * Fade the guides toward shown or not as their nodes come and go (wall time, so a fade finishes
   * while paused, as arrivals do); under reduced motion they're simply there or not.
   */
  private stepGuides(dt: number): void {
    const step = this.reduced ? 1 : dt / (GUIDE_FADE_MS / 1000);
    const graph = this.graph;
    for (const [id, p] of this.guidePresence) {
      const guide = graph ? this.guidesFor(graph).find((x) => x.id === id) : undefined;
      if (graph && guide?.shownBy) p.to = this.guideWanted(guide as ThemeGuide & Required<Pick<ThemeGuide, 'shownBy'>>, graph) ? 1 : 0;
      if (p.at === p.to) continue;
      p.at = p.at < p.to ? Math.min(p.to, p.at + step) : Math.max(p.to, p.at - step);
      this.showGuide(id);
    }
  }

  /**
   * The Task radar (06 §3): three front arcs around the planet, read like radar rings, each faintly
   * in its rung's color. Under the inner band, an accretion glow in gold grows with the share of
   * Tasks accomplished: it describes the Tasks, not the planet, whose look is its own stage (INV-04).
   * An uncertain link (the retrospective lens) dashes a short stretch of band around its Task.
   */
  /**
   * The board's column boundaries (06 §3, decided 2026-10-09): a faint tick across the outer ring where
   * one column ends and the next begins. Never labelled on the chart; the map key explains them.
   */
  private drawBoard(graph: ViewGraph, g: Graphics, px: number): void {
    const board = graph.board;
    if (!board) return;
    // Each ring is a person's swimlane (decided 2026-10-09): a soft transparent band along its front arc,
    // thick enough that the bodies sit inside it. No edge lines: the band alone reads as the lane.
    for (const r of board.rings) {
      const end = Math.atan2(r.depth / r.ry, r.span / r.rx); // the right end; the left is its mirror
      const arc = (rx: number, ry: number) => {
        const pts: number[] = [];
        for (let i = 0; i <= 48; i++) {
          const a = end + ((Math.PI - 2 * end) * i) / 48;
          pts.push(Math.cos(a) * rx, Math.sin(a) * ry);
        }
        return pts;
      };
      g.poly(arc(r.rx, r.ry), false).stroke({ width: BOARD.bandWidth, color: CYAN, alpha: 0.085, cap: 'round' });
    }
    const ticks = board.ticks;
    if (!ticks.length) return;
    const len = 16 * px;
    for (const t of ticks) {
      g.moveTo(t.x - t.nx * len, t.y - t.ny * len).lineTo(t.x + t.nx * len, t.y + t.ny * len);
    }
    g.stroke({ width: 1.6 * px, color: CYAN, alpha: 0.35 });
  }

  private drawRadar(graph: ViewGraph, px: number): void {
    const g = this.radarGuides;
    g.clear();
    const radar = graph.radar;
    if (!radar) return;
    const [a0, a1] = radar.arc;
    const arc = (rx: number, ry: number, from = a0, to = a1, dashed = false) => {
      const n = Math.max(8, Math.ceil(Math.abs(to - from) / 0.03));
      g.moveTo(radar.cx + Math.cos(from) * rx, radar.cy + Math.sin(from) * ry);
      for (let i = 1; i <= n; i++) {
        const a = from + ((to - from) * i) / n;
        const x = radar.cx + Math.cos(a) * rx;
        const y = radar.cy + Math.sin(a) * ry;
        if (dashed && i % 2 === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };
    const settled = radar.bands.find((b) => b.band === 'accomplished');
    if (settled && settled.count > 0 && radar.spokes > 0) {
      const share = settled.count / radar.spokes;
      arc(settled.rx, settled.ry);
      g.stroke({ width: (10 + 26 * share) * px, color: RUNG_COLOR.accomplished, alpha: 0.05 + 0.12 * share, cap: 'round' });
    }
    for (const b of radar.bands) {
      const color = RUNG_COLOR[b.band];
      arc(b.rx, b.ry);
      g.stroke({ width: 5 * px, color, alpha: 0.05 }).stroke({ width: 1.2 * px, color, alpha: b.count ? 0.4 : 0.22 });
      // End ticks, like a radar scope's range marks.
      for (const a of [a0, a1]) {
        const x = radar.cx + Math.cos(a) * b.rx;
        const y = radar.cy + Math.sin(a) * b.ry;
        const nx = Math.cos(a);
        const ny = Math.sin(a) * 0.5;
        const l = Math.hypot(nx, ny) || 1;
        g.moveTo(x - (nx / l) * 7 * px, y - (ny / l) * 7 * px).lineTo(x + (nx / l) * 7 * px, y + (ny / l) * 7 * px);
      }
      g.stroke({ width: 1.2 * px, color, alpha: 0.35 });
    }
    for (const e of graph.edges) {
      if (!e.uncertain || !e.geometry?.band) continue;
      const n = this.nodes.get(e.to)?.node;
      if (!n?.radar) continue;
      arc(e.geometry.rx, e.geometry.ry, n.radar.angle - 0.09, n.radar.angle + 0.09, true);
    }
    g.stroke({ width: 1.6 * px, color: CYAN, alpha: 0.6 });
  }

  /**
   * PR routes (06 §5 lines): a soft marker-width band on a gentle arc rather than a pencil line, sized
   * in screen pixels so it reads the same at any zoom. Its peak stays well under the selection
   * reticle's contrast, the strongest line on the chart. Uncertain links and Task → parent
   * continuations use the same band, dashed and fainter.
   */
  private drawRoutes(graph: ViewGraph, byPk: Map<string, ViewNode>): void {
    const g = this.routes;
    g.clear();
    const px = 1 / (this.lastScale || 1); // one screen pixel in world units
    const curve = (e: ViewEdge) => {
      const a = byPk.get(e.from);
      const b = byPk.get(e.to);
      if (!a || !b) return null;
      // Gentle arc: control point lifted perpendicular to the segment.
      const dx = b.world.x - a.world.x;
      const dy = b.world.y - a.world.y;
      const len = Math.hypot(dx, dy) || 1;
      const lift = Math.min(60, len * 0.12);
      const cx = (a.world.x + b.world.x) / 2 + (-dy / len) * lift;
      const cy = (a.world.y + b.world.y) / 2 + (dx / len) * lift;
      const at = (t: number) => {
        const u = 1 - t;
        return [u * u * a.world.x + 2 * u * t * cx + t * t * b.world.x, u * u * a.world.y + 2 * u * t * cy + t * t * b.world.y] as const;
      };
      return { a, b, cx, cy, len, at };
    };
    // A completed PR keeps only its path to the station, in still gold; its links to the work
    // drop away, and so does a Task's continuation once no unfinished PR still runs through it.
    const done = (pk: string) => byPk.get(pk)?.stage === 'flight.completed';
    const toStation = (e: ViewEdge) => byPk.get(e.to)?.kind === 'station';
    const routes = graph.edges.filter((e) => e.kind === 'route' && !this.held.has(e.key));
    const live = routes.filter((e) => !done(e.from));
    const unloaded = routes.filter((e) => done(e.from) && toStation(e));
    const stillLinked = new Set(live.filter((e) => !toStation(e)).map((e) => e.to));
    const solid = live.filter((e) => !e.uncertain);
    const dashed = [
      ...live.filter((e) => e.uncertain),
      ...graph.edges.filter((e) => e.kind === 'routeContinuation' && stillLinked.has(e.from) && !this.held.has(e.key)),
    ];
    // Layers from wide and faint to narrow and brighter: a soft glow with no hard edge.
    const BAND: [number, number][] = [[12, 0.035], [7, 0.06], [3.5, 0.09], [1.5, 0.12]];
    for (const [width, alpha] of BAND) {
      for (const e of solid) {
        const c = curve(e);
        if (c) g.moveTo(c.a.world.x, c.a.world.y).quadraticCurveTo(c.cx, c.cy, c.b.world.x, c.b.world.y);
      }
      g.stroke({ width: width * px, color: BLUE, alpha, cap: 'round' });
    }
    this.cargo = [];
    for (const e of solid.filter(toStation)) {
      const c = curve(e);
      if (!c) continue;
      const dx = c.b.world.x - c.a.world.x;
      const dy = c.b.world.y - c.a.world.y;
      this.cargo.push({ at: c.at, nx: -dy / c.len, ny: dx / c.len, len: c.len, seed: fnv1a32(e.key) % 1000 });
    }
    for (const [width, alpha] of BAND) {
      for (const e of unloaded) {
        const c = curve(e);
        if (c) g.moveTo(c.a.world.x, c.a.world.y).quadraticCurveTo(c.cx, c.cy, c.b.world.x, c.b.world.y);
      }
      g.stroke({ width: width * px, color: GOLD, alpha: alpha * 0.55, cap: 'round' }); // done: calmer than open work
    }
    for (const [width, alpha] of BAND) {
      for (const e of dashed) {
        const c = curve(e);
        if (!c) continue;
        const steps = Math.max(6, Math.floor((c.len / px) / 12)); // 12 px dashes and gaps on screen
        for (let i = 0; i < steps; i += 2) {
          const [x0, y0] = c.at(i / steps);
          const [x1, y1] = c.at((i + 1) / steps);
          g.moveTo(x0, y0).lineTo(x1, y1);
        }
      }
      g.stroke({ width: width * px, color: BLUE, alpha: alpha * 0.7, cap: 'butt' }); // round caps would fill the gaps
    }
  }
}

export { hitRadius };

/**
 * The world point a node's motion turns about: its orbit parent's centre; for a radar Task, the
 * radar's body (the scene's selectable planet or anomaly nearest the middle).
 */
function motionCenter(graph: ViewGraph, node: ViewNode): { x: number; y: number } | null {
  const e = graph.edges.find((x) => x.kind === 'orbit' && x.to === node.projectionKey);
  const p = e ? graph.nodes.find((n) => n.projectionKey === e.from) : undefined;
  if (p) return { x: p.world.x, y: p.world.y };
  if (node.kind !== 'missionPoint') return null;
  const body = graph.nodes.filter((n) => n.kind === 'planet' || n.kind === 'anomaly').sort((a, b) => b.world.r - a.world.r)[0];
  return body ? { x: body.world.x, y: body.world.y } : null;
}

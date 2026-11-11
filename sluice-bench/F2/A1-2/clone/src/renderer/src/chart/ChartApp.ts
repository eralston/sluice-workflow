// Owns the Pixi Application, stage layers (06 §4), camera, scene lifecycle, transitions, and test hooks (03 §10).
// v1 (14 §3): the theme's assets draw solar nodes (the asset context says who the viewer is), a
// SwitchingDirector plays solar beats' maneuvers and every other scene's accents, holo plates grow
// their rows in place (19 L2), and the overlays (the hover ring) sit beside the labels.
import 'pixi.js/unsafe-eval'; // CSP forbids eval; Pixi's polyfill avoids `new Function`
import { Application, Container, Graphics, Rectangle, Sprite, Texture, type Ticker } from 'pixi.js';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ViewGraph, ViewNode } from '@shared/contracts/view';
import { fnv1a32, seededRandom } from '@shared/hash';
import { advanceMotion, motion } from './art/motion';
import { NebulaBackdrop, type BackdropLevel } from './art/nebula';
import { CanvasTooth, ImpastoFilter, PaintFilter } from './art/paint';
import { liveResourceCount } from './art/quad';
import { CameraController, type CamState } from './camera';
import { EnergyFx, type EnergyKind } from './fx/explore';
import { HeroAura } from './fx/hero';
import { BlackHoleView } from './art/blackhole';
import { rlog, warn } from '../devlog';
import { activeProfile, onProfile } from '../profile';
import type { Award } from '@shared/engine/types';
import type { AssetCtx } from './assets/types';
import type { FxBeat, FxDirector } from './fx/types';
// The maneuver registry fills from the theme, so it subscribes before the theme is made active.
import './fx/v1/registry';
import { SwitchingDirector, type SwitchingCensus } from './fx/v1/switching';
import '../theme/starChart'; // registers the Star Chart theme (14 §8)
import { activeTheme, useTheme } from '../theme/registry';
import { kindNames } from '../vocab';
import { createOverlays, type OverlayStack } from './overlays';
import { actionFrame, boundsOf, BOARD_MS, CLIMAX_MS, climaxFrame, fitFor, FOLLOW_MS, followTarget, FRAME_MS, type FollowCtx } from './framing';
import { LabelLayer } from './labels';
import { plateTopInset } from '@shared/plateInset';
import type { KindPlates } from './holo/holoLabel';
import { DOUBLE_TAP_MS, GraphScene } from './scenes/GraphScene';
import { hasScreenFloor, hitRadius, MIN_TARGET_PX, screenRadius, targetScale, TOUCH_TARGET_PX } from '@shared/scene/sizing';
import { BACKLOG } from '@shared/hierarchy/backlog';
import { isRootScene } from '@shared/hierarchy/sceneKey';
import type { Hierarchy } from '@shared/hierarchy/types';

export interface ChartCallbacks {
  /** Single click: select. */
  onSelect(node: ViewNode): void;
  /** Double-click, or wheel-zoom through a centered node: enter its scene. */
  onEnter(node: ViewNode, via: 'dblclick' | 'wheel'): void;
  /** Wheel-zoom out past the threshold: go up a level. */
  onZoomOut(): void;
  onHover(node: ViewNode | null): void;
  /** Called on user pan/zoom (used to suspend camera follow later). */
  onUserCamera?(): void;
  /** A jump trail's Go button (05 §5): open the destination item's scene. */
  onGo?(key: CanonicalKey, captain?: CanonicalKey): void;
  /** An expanded plate's row was pressed (v1): select its object, by key (it may not be drawn: a landed piece). */
  onPick?(key: CanonicalKey): void;
  /**
   * An expanded plate's row's container link was pressed (v1, read-only, INV-21): the container's key when
   * projection carries it, else the row's piece (whose parent is the container).
   */
  onOpenContainer?(at: { container: CanonicalKey } | { piece: CanonicalKey }): void;
  /** The events whose notes the plates wear changed (22 B5, B6): History marks the same rows *now*. */
  onNowPlaying?(eventKeys: string[]): void;
}

export interface ChartCounts {
  displayObjects: number;
  textures: number;
  activeFx: number;
  tickerCallbacks: number;
}

export interface ShowOptions {
  /** 'in' zooms toward `focus`; 'out' pulls back; 'none' cuts. */
  direction: 'in' | 'out' | 'none';
  durationMs?: number;
  /** World point in the outgoing scene to zoom toward. */
  focus?: { x: number; y: number };
  /** Restore this camera instead of fitting (Back navigation). */
  camera?: CamState;
  /** Mount afresh even if the scene key is the same (a reboot onto a different galaxy), fitting the camera. */
  remount?: boolean;
  /**
   * Why the same scene re-renders: 'beat' (playing crossed a beat) glides objects to their new places;
   * 'jump' (a seek, a lens toggle, the default) snaps them, with no catch-up motion (INV-15).
   * 'data' (decided 2026-10-08): the stream brought new facts; what's new Arrives, what's gone Departs.
   */
  cause?: 'beat' | 'jump' | 'data';
}

interface Transition {
  snapshot: Sprite;
  texture: Texture;
  t: number;
  dur: number;
  direction: 'in' | 'out';
  focus: { x: number; y: number };
}

const INSPECTOR_WIDTH = 380; // fx/director.ts's SIDE_PANEL_PX keeps jump trails clear of it
/**
 * The player bar over the top of the view (decided 2026-10-04): scenes fit below it. With the fit's
 * own 40 px padding, a scene's top starts about 80 px down, clear of the bar (which ends near 58 px);
 * reserving more costs the densest Feature its tap-target spacing (the density harness).
 */
const PLAYER_HEIGHT = 40;
const TWINKLE_COUNT = 140;
/** Twinkling stars thin out as you zoom in: the close-up sky is clear and sparse. */
const TWINKLE_SHARE: Record<BackdropLevel, number> = { galaxy: 0.5, sector: 1, feature: 0.8, body: 0.3 };
/** Wheel zoom crosses a scale boundary past these multiples of the fitted scale (06 §3). */
// High enough that a dense scene can be explored zoomed in before it hands off to a child scene.
const ZOOM_IN_THROUGH = 3.5;
const ZOOM_OUT_THROUGH = 0.5;
/** Ignore wheel input this long after a transition, so trackpad momentum can't tunnel two levels. */
const WHEEL_COOLDOWN_MS = 550;
/**
 * After a press on the chart is released, the automatic camera (frame-the-action, the follow camera)
 * stays still this much longer (decided 2026-10-09): enough for the second click of a double-click, or a
 * click followed by a drag, never to chase a moving target.
 */
const CAMERA_HOLD_AFTER_MS = 1500;
/** Reduced motion's scene change: a short crossfade (05 §7). */
const REDUCED_TRANSITION_MS = 150;
/** How long the camera takes to bring a picked object into view. */
const REVEAL_MS = 600;
/** A press that moves farther than this (screen px) is a pan, not a click (decided 2026-10-07). */
const DRAG_PX = 4;
/** A zoomable node must be within this fraction of the short viewport side from center to be entered. */
const CENTER_TOLERANCE = 0.16;

export class ChartApp {
  private readonly layers = {
    backdrop: new Container({ label: 'backdrop' }),
    outgoingScene: new Container({ label: 'outgoingScene' }),
    worldCamera: new Container({ label: 'worldCamera' }),
    canvas: new Container({ label: 'canvas' }),
    selectionOverlay: new Container({ label: 'selectionOverlay' }),
    transitionOverlay: new Container({ label: 'transitionOverlay' }),
  };
  private readonly camera: CameraController;
  private readonly labels: LabelLayer;
  private readonly nebula: NebulaBackdrop;
  /** The painterly pass (09 §7): live over celestial bodies, baked into skies, canvas over all. */
  private readonly paint = {
    bodies: [new PaintFilter({ radius: 3, sharp: 6, streak: 0.22, bands: 0.35 }), new ImpastoFilter(0.75, 1.5)],
    // Mechanical art stays crisp: its gouache facets are already the painting (09 §7).
    hardware: [],
  };
  private readonly tooth: CanvasTooth;
  private painted = activeProfile().render.switches.paint;
  private offProfile: (() => void) | null = null;
  private readonly twinkle = new Container({ label: 'twinkle' });
  private readonly reticle = new Graphics({ label: 'selectionReticle' });
  /** The followed ship's aura (05 §6): screen-space, owned by the chart so it survives scene changes. */
  private hero!: HeroAura;
  /**
   * Loading energy (decided 2026-10-07): the objects whose data is loading, and the camera before it
   * eased in (null when it didn't). Ended effects stay in `energies` until their release has played.
   */
  private energies: { fx: EnergyFx; key: CanonicalKey | null }[] = [];
  private exploring: { before: CamState | null } | null = null;
  /** The empty cosmos's black hole: a gentle pull while it waits, a storm while the cosmos fills. */
  private cosmos: { fx: EnergyFx; level: 'gentle' | 'storm' } | null = null;
  /** The empty cosmos (decided 2026-10-07): shown while the galaxy has no projects to show. */
  private blackHole: BlackHoleView | null = null;
  private heroKey: CanonicalKey | null = null;
  private readonly debugGfx = new Graphics({ label: 'debug' });
  private readonly wipe = new Graphics({ label: 'wipe' });
  /** The dawn sweep (06 §5): a soft band of morning light crossing the backdrop. */
  private readonly dawnGfx = new Graphics({ label: 'dawn' });
  private dawnT: number | null = null;
  private dotTexture: Texture | null = null;
  private scene: GraphScene | null = null;
  private graph: ViewGraph | null = null;
  /** The events whose notes the plates wore last frame, joined (22 B5). */
  private nowPlaying = '';
  private transition: Transition | null = null;
  private selected: CanonicalKey | null = null;
  private hovered: CanonicalKey | null = null;
  private debug = false;
  private elapsed = 0;
  private frozenAt: number | null = null;
  private fitScale = 1;
  private wheelLockUntil = 0;
  /** The current press moved past DRAG_PX: it's a pan, and its release is not a click (decided 2026-10-07). */
  private dragged = false;
  private lastLabelTap: { pk: string; at: number } | null = null;
  private resolveReady: (() => void) | null = null;
  ready: Promise<void> = Promise.resolve();
  private readonly frameCallbacks = new Set<(dtMs: number) => void>();
  private readonly director: SwitchingDirector;
  /** v1 overlays over the labels (the hover ring); display only in v0 scenes. */
  private readonly overlays: OverlayStack;
  /** What v1 assets are told about the viewer (14 §4); applied to every scene mounted. */
  private assetCtx: AssetCtx | null = null;
  /**
   * An expanded plate's row is lit (v1): its objects' labels come forward, like a History card's (a
   * PR's row lights every piece it serves, 19 L6).
   */
  private lit: readonly CanonicalKey[] | null = null;
  /** Schedule time advanced this frame, and whether the user has paused (effects hold). */
  private scheduleDt = 0;
  private fxFrozen = false;
  /** When playback last advanced (wall ms): labels stay compact until a few seconds after (06 §4). */
  private lastPlayedAt = -Infinity;

  private constructor(private readonly app: Application, private readonly labelHost: HTMLElement, private readonly cb: ChartCallbacks) {
    app.stage.addChild(...Object.values(this.layers));
    this.camera = new CameraController(this.layers.worldCamera);
    this.labels = new LabelLayer(labelHost, {
      press: (node, e) => this.pressLabel(node, e),
      hover: (node) => this.setHover(node),
      // An expanded plate's rows (19 L2): a lit row brings its objects' labels forward and rings them.
      light: (keys) => {
        this.lit = keys;
        this.labels.setHighlight(keys ?? this.hovered, this.selected);
        this.overlays.light(keys);
      },
      pick: (key) => this.cb.onPick?.(key),
      open: (url, key) => this.openRowLink(url, key),
      // The chart's name after a plate's identity line (22 B3): the kind's, in its paradigm's words.
      metaphor: (node) => kindNames(node.kind, this.hier.levels.some((l) => l.layout === 'solar') ? 'solar' : 'backlog')?.chart.toLowerCase(),
      roleWord: (role) => activeTheme()?.words.role?.[role]?.one,
    });
    activeTheme(); // the default theme until the settings choose (setAssetCtx)
    this.overlays = createOverlays(labelHost, {
      light: (keys) => { this.lit = keys; this.labels.setHighlight(keys ?? this.hovered, this.selected); },
    });
    this.director = new SwitchingDirector({
      scene: () => (this.transition ? null : this.scene),
      hierarchy: () => this.hier,
      worldToScreen: (x, y) => this.camera.worldToScreen(x, y),
      labelHost,
      onGo: (key, captain) => this.cb.onGo?.(key, captain),
      flashLabel: (pk) => this.labels.flash(pk, performance.now()),
      plateWorld: (pk) => {
        const r = this.labels.rectOf(pk);
        if (!r) return null;
        const a = this.camera.screenToWorld(r.x0, r.y0);
        const b = this.camera.screenToWorld(r.x1, r.y1);
        return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
      },
    });
    this.nebula = new NebulaBackdrop(app.renderer, fnv1a32('backdrop|feature'));
    this.dawnGfx.blendMode = 'add';
    this.layers.backdrop.addChild(this.nebula.root, this.twinkle, this.dawnGfx);
    this.hero = new HeroAura(this.layers.selectionOverlay);
    this.layers.selectionOverlay.addChild(this.reticle, this.debugGfx);
    this.tooth = new CanvasTooth(app.renderer);
    this.layers.canvas.addChild(this.tooth.root);
    this.layers.transitionOverlay.addChild(this.wipe);
    this.buildTwinkle();
    this.applyProfile();
    this.offProfile = onProfile(() => this.applyProfile());
    this.bindInput();
    app.renderer.on('resize', this.onResize);
    this.onResize(app.screen.width, app.screen.height);
    app.ticker.add(this.onTick);
  }

  /** `--stack-bottom`, published by OverlayStack on the stage (an inline style: reading it costs no layout). */
  private stackBottom(): number {
    const v = this.app.canvas.parentElement?.parentElement?.style.getPropertyValue('--stack-bottom') ?? '';
    return Number.parseFloat(v) || 0;
  }
  static async create(canvasHost: HTMLElement, labelHost: HTMLElement, cb: ChartCallbacks): Promise<ChartApp> {
    const app = new Application();
    await app.init({
      preference: 'webgl',
      resizeTo: canvasHost,
      antialias: true,
      background: 0x081629,
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });
    app.canvas.setAttribute('aria-label', 'Star chart');
    app.canvas.tabIndex = -1;
    canvasHost.prepend(app.canvas);
    return new ChartApp(app, labelHost, cb);
  }

  /** Mount a new scene (with a transition) or reconcile the current one. */
  show(graph: ViewGraph, opts: ShowOptions = { direction: 'none' }): void {
    this.ready = new Promise((r) => (this.resolveReady = r));
    const sameScene = this.scene && this.graph?.sceneKey === graph.sceneKey && !opts.remount;
    if (sameScene) {
      this.scene!.apply(graph, opts.cause ?? 'jump');
      if ((opts.cause ?? 'jump') === 'jump') this.labels.settleArrivals(); // a seek snaps (INV-15)
    } else {
      this.director.clear(); // a new scene renders its current state with no earlier accents (INV-15)
      this.setHover(null); // the old scene's hover never got its pointerout (its hit areas are gone)
      if (this.scene && opts.direction !== 'none') this.beginTransition(opts);
      else this.finishTransition();
      this.setBackdrop(graph.sceneKey);
      this.scene?.dispose();
      this.scene = new GraphScene({
        onSelect: (n) => this.cb.onSelect(n),
        onEnter: (n) => this.cb.onEnter(n, 'dblclick'),
        suppressTap: () => this.dragged,
        onHover: (n) => this.setHover(n),
      });
      this.layers.worldCamera.addChild(this.scene.root);
      this.scene.setPaint(this.painted ? this.paint : null);
      if (this.assetCtx) this.scene.setAssetCtx(this.assetCtx);
      this.directed = null; // a new scene's camera is nobody's yet (27 E9)
      this.scene.mount(graph);
      const fit = fitFor(this.camera, graph);
      this.fitScale = fit.scale;
      this.setLimits(graph);
      if (opts.camera) this.camera.set(opts.camera);
      else this.camera.set(fit);
      if (this.transition && !motion.reduced) {
        // Ease the new scene in from slightly further out (in) or closer (out).
        const end = { ...this.camera.state };
        this.camera.set({ ...end, scale: end.scale * (opts.direction === 'in' ? 0.82 : 1.2) });
        this.camera.tweenTo(end, this.transition.dur);
      }
    }
    if (sameScene) this.camera.setContent(boundsOf(graph, this.fitScale));
    this.setEmptyCosmos(graph.sceneKey === 'galaxy' && graph.nodes.length === 0);
    this.graph = graph;
    this.labels.sync(graph.nodes.filter((n) => n.labelled), isRootScene(graph.sceneKey) ? 'galaxy' : this.hier.resolve(graph.sceneKey)?.def.id, graph.lists);
    this.labels.setLanes(graph.board?.heads ?? []);
    this.labels.setColumns(graph.board?.columns ?? []);
    this.labels.setHighlight(this.hovered, this.selected);
    if (!sameScene) this.lit = null;
    this.overlays.sync(graph);
    this.app.ticker.addOnce(() => requestAnimationFrame(() => {
      if (!this.transition) this.resolveReady?.();
    }));
  }

  /**
   * Show an object picked from outside the chart (an In view row, a search result; decided
   * 2026-10-07): if it's off screen, or smaller than a touch target, glide to centre it, zooming in
   * gently just as far as a touch target. Returns whether the camera moved. Not a user camera move:
   * following and framing carry on.
   */
  reveal(key: CanonicalKey): boolean {
    if (!this.scene || this.transition) return false;
    const node = this.targetNodes().find((n) => n.canonicalKey === key && n.selectable);
    if (!node) { warn('reveal-missing', { key }); return false; }
    const cur = this.camera.state;
    const r = node.kind === 'galaxy' ? node.world.r * 0.8 : node.world.r;
    const want = hasScreenFloor(node) || r <= 0 ? cur.scale : Math.max(cur.scale, TOUCH_TARGET_PX / (2 * r));
    const { min, max } = this.camera.zoomRange();
    const scale = Math.min(max, Math.max(min, Math.min(want, this.fitScale * 2.5)));
    const m = r * 1.3 + 40 / scale;
    const v = this.camera.viewBounds(24);
    const inView = node.world.x - m >= v.minX && node.world.x + m <= v.maxX && node.world.y - m >= v.minY && node.world.y + m <= v.maxY;
    if (inView && scale <= cur.scale * 1.001) return false;
    const to = { x: node.world.x, y: node.world.y, scale };
    if (motion.reduced) this.camera.set(to);
    else this.camera.tweenTo(to, REVEAL_MS);
    return true;
  }

  /**
   * Whether the automatic camera should keep still (decided 2026-10-09): while a pointer is pressed on
   * the chart, and for CAMERA_HOLD_AFTER_MS after it's let go. Framing and the follow camera slide the
   * view on their own, and that was moving things just as you went to click them. A manual pan or zoom
   * still suspends them outright, as before; this only covers the moment around a click.
   */
  cameraHeld(): boolean {
    return performance.now() < this.cameraHeldUntil;
  }
  private cameraHeldUntil = 0;
  private readonly onPress = (): void => { this.cameraHeldUntil = Number.POSITIVE_INFINITY; };
  private readonly onRelease = (): void => {
    if (this.cameraHeldUntil === Number.POSITIVE_INFINITY) this.cameraHeldUntil = performance.now() + CAMERA_HOLD_AFTER_MS;
  };

  /**
   * The frame-the-action camera (slice 3b): when a High beat's objects are off-screen, pan (or zoom
   * out) to bring them in, never zooming in on its own. Returns whether the camera moved.
   */
  frameAction(keys: Set<CanonicalKey>): boolean {
    if (!this.scene || this.transition || keys.size === 0 || this.cameraHeld()) return false;
    const to = actionFrame(this.camera, this.targetNodes(), keys);
    if (!to) return false;
    if (motion.reduced) this.camera.set(to);
    else this.camera.tweenTo(to, FRAME_MS);
    return true;
  }

  /**
   * The follow camera (decided 2026-10-04; principles revised the same day):
   * 1. Frame the captain's **working set** in this Feature, not just the moment: the ship, what it's
   *    beside, every work item their story has touched here, and each PR with its station and linked
   *    work (a PR always brings its repository).
   * 2. **Context only grows** within a Feature (a ratchet): the frame never tightens mid-story.
   * 3. **When the work spans the network** (about 55% of the scene either way), show the whole system,
   *    and stay there until the captain leaves the Feature.
   * 4. **Zoom in only at the start** (Play, Resume, arriving in a Feature); afterwards only outward.
   * 5. Called at a beat's lead-in, so the camera has arrived before the act.
   * 6. Calm: small changes are ignored, moves take 900 ms, and the frame keeps clear of the player,
   *    the follow bar, and the side panel.
   * `reset` starts a fresh working set (Play, Resume). A new scene starts one too.
   */
  followFrame(shipKey: CanonicalKey, focus: CanonicalKey[], reset = false): boolean {
    if (!this.scene || this.transition || !this.graph) return false;
    const sceneKey = this.graph.sceneKey;
    if (reset || this.followCtx?.scene !== sceneKey) this.followCtx = { scene: sceneKey, keys: new Set(), whole: false, fresh: true };
    const ctx = this.followCtx!;
    for (const k of focus) ctx.keys.add(k); // the working set still grows while the camera holds still
    if (this.cameraHeld()) return false;
    const to = followTarget(this.camera, this.graph, this.targetNodes(), shipKey, ctx, this.fitScale);
    if (!to) return false;
    if (motion.reduced) this.camera.set(to);
    else this.camera.tweenTo(to, FOLLOW_MS);
    return true;
  }

  /** The follow camera's working set for the scene it's in (followFrame). */
  private followCtx: FollowCtx | null = null;

  /**
   * The directed camera (27 E9, 05 §6): the director's last request. It owns the camera only while the
   * camera's target is still what it asked for, so a user pan or zoom, frame-the-action, follow, reveal,
   * resetView and setCamera all end it with no hooks at those sites.
   */
  private directed: { shot: 'climax' | 'board'; to: CamState } | null = null;

  /** Whether the director's last shot still holds: the camera's target is still where it sent it. */
  private directedHolds(): boolean {
    const d = this.directed;
    if (!d) return false;
    const t = this.camera.target;
    return Math.abs(t.x - d.to.x) < 0.5 && Math.abs(t.y - d.to.y) < 0.5 && Math.abs(t.scale / d.to.scale - 1) < 1e-3;
  }

  /** The director's shot if it still holds, else null (playback reads it to pull back after a climax). */
  directedShot(): 'climax' | 'board' | null {
    return this.directedHolds() ? this.directed!.shot : null;
  }

  /** Ease toward a climax's cast (27 E9). Returns whether the camera moved. */
  directClimax(keys: ReadonlySet<CanonicalKey>): boolean {
    if (!this.scene || this.transition || motion.reduced || this.cameraHeld()) return false;
    const to = climaxFrame(this.camera, this.targetNodes(), keys, this.fitScale);
    if (!to) return false;
    this.camera.tweenTo(to, CLIMAX_MS);
    this.directed = { shot: 'climax', to };
    return true;
  }

  /** Ease back to the fitted board (27 E9), unless the camera is already headed there. */
  directBoard(): boolean {
    if (!this.scene || !this.graph || this.transition || motion.reduced || this.cameraHeld()) return false;
    const to = fitFor(this.camera, this.graph);
    const t = this.camera.target;
    if (Math.abs(t.x - to.x) < 0.5 && Math.abs(t.y - to.y) < 0.5 && Math.abs(t.scale / to.scale - 1) < 1e-3) {
      this.directed = { shot: 'board', to };
      return false;
    }
    this.camera.tweenTo(to, BOARD_MS);
    this.directed = { shot: 'board', to };
    return true;
  }

  /** A seek (INV-15, R-1): a director's shot that still holds snaps to the fitted board; a camera others moved is left alone. */
  directSeek(): void {
    if (!this.graph || !this.directedHolds()) return;
    const to = fitFor(this.camera, this.graph);
    this.camera.set(to);
    this.directed = { shot: 'board', to };
  }

  /** Test hook: who holds the camera now, where it's headed, and the fitted board (27 E9). */
  directedCamera(): { shot: 'climax' | 'board' | null; target: CamState; fit: CamState } {
    return { shot: this.directedShot(), target: { ...this.camera.target }, fit: this.graph ? fitFor(this.camera, this.graph) : { ...this.camera.target } };
  }

  /** Run a callback every frame with the clamped wall delta (playback advances here). Returns an unsubscribe. */
  onFrame(cb: (dtMs: number) => void): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  /** Play one beat's accents (05 §5), or its maneuvers (v1); they spawn once the scene has laid out the new state. */
  playBeat(ctx: FxBeat): void {
    this.director.queue(ctx);
  }

  /** The lead-in for the next beat (05 §5): its actors wind up during the gap. */
  tellBeat(ctx: FxBeat, beatIndex: number, leadS: number): void {
    this.director.tell(ctx, beatIndex, leadS);
  }

  /**
   * Playing reached the end: the range's accomplishments glow once, in order (06 §5), then the
   * viewer's awards. Each award may carry its `holder` (playHooks' ShownAward): the interpreter puts
   * its insignia on that ship, never anyone else's (18 §3).
   */
  recap(keys: CanonicalKey[], awards: Award[] = [], opts?: { finale?: boolean }): void {
    this.director.recap(keys, awards, opts);
  }

  /** The episode begins (2026-10-13): what's already in the scene makes its entrance. */
  opening(): void {
    this.director.opening?.();
  }

  /** A beat earned the viewer an award (18 §3): its insignia lights on their ship, an ornament. */
  insignia(awards: Award[]): void {
    if (!awards.length) return;
    if (this.director.insignia) this.director.insignia(awards, performance.now());
    else this.director.recap([], awards);
  }

  /**
   * Who the v1 assets draw for (the viewer and their ship style) and the theme pack (14 §4). A change
   * makes the theme active and rebuilds the scene's asset views in place.
   */
  setAssetCtx(ctx: AssetCtx): void {
    if (activeTheme()?.id !== ctx.theme) useTheme(ctx.theme);
    this.assetCtx = ctx;
    this.scene?.setAssetCtx(ctx);
  }

  /**
   * The ruler crossed a compressed night: a faint dawn light sweeps the sky (06 §5). In a solar region
   * it's a day turn's breather (22 C6, M-28): the star breathes and `spotlight` is named at their work.
   */
  dawn(spotlight: CanonicalKey | null = null, untilS = 0): void {
    // Ornament (05 §5 tiers): only when the scene is calm.
    if (!motion.reduced && this.director.calm()) this.dawnT = 0;
    this.director.spotlight(spotlight, untilS);
  }

  /** Cancel every accent and jump trail (seek, lens toggle). */
  clearAccents(): void {
    this.director.clear();
    this.dawnT = null;
    this.dawnGfx.clear();
  }

  /** The director's volatility meter (05 §5 tiers), for the test hooks. */
  volatility(): number {
    return this.director.volatility();
  }

  /** Test hooks: live effects by type; a volatility bias; held edges; nodes still gliding. */
  fxCensus(): SwitchingCensus {
    return this.director.census();
  }

  /** Test hook: live commands and tells (v1's interpreter in a solar scene, else the v0 director's effects). */
  liveCommands(): number {
    return (this.director as FxDirector).activeCount();
  }

  biasVolatility(v: number): void {
    this.director.bias = v;
  }

  heldEdges(): string[] {
    return this.scene?.heldEdges() ?? [];
  }

  glidingCount(): number {
    return this.scene?.glidingCount() ?? 0;
  }

  /** Called by playback each frame: schedule time advanced, and whether the user has paused. */
  notePlayback(scheduleDtMs: number, frozen: boolean): void {
    this.scheduleDt = scheduleDtMs;
    this.fxFrozen = frozen;
    if (scheduleDtMs > 0) this.lastPlayedAt = performance.now();
  }

  trailCount(): number {
    return this.director.trailCount();
  }

  /** Tear down and remount the current scene (AC-03 leak check). */
  remount(): void {
    const g = this.graph;
    if (!g) return;
    this.director.clear();
    this.finishTransition();
    this.scene?.dispose();
    this.scene = null;
    this.graph = null;
    this.labels.clear();
    this.overlays.clear();
    this.show(g);
  }

  /** `byEntry`: the selection a scene entry makes; it keeps the star selected without opening its Features list (B2). */
  select(key: CanonicalKey | null, byEntry = false): void {
    this.selected = key;
    this.labels.setSelectedByEntry(byEntry && key !== null);
    this.labels.setHighlight(this.hovered, key);
  }

  /** P toggles the painterly pass, to compare painted and plain. */
  setPaint(on: boolean): void {
    this.painted = on;
    this.scene?.setPaint(on ? this.paint : null);
    this.nebula.setPainted(on);
    this.tooth.root.visible = on;
  }

  /** Re-apply the profile's render switches (15 §11): paint and twinkle. Ornament and the effects cap are read where they act. */
  private applyProfile(): void {
    const sw = activeProfile().render.switches;
    this.setPaint(sw.paint);
    this.twinkle.visible = sw.twinkle;
  }

  twinkleOn(): boolean {
    return this.twinkle.visible;
  }

  paintOn(): boolean {
    return this.painted;
  }

  setDebug(on: boolean): void {
    this.debug = on;
    this.labels.setDebug(on);
    if (!on) this.debugGfx.clear();
  }

  /** Test hook: freeze ambient animation at a fixed time so screenshots are deterministic (VC-1). */
  freezeAmbient(seconds: number | null): void {
    this.frozenAt = seconds;
  }

  /**
   * Frame times over the last few seconds (slice 5 profiling): the median is the feel of it, and the
   * 95th percentile is where a stutter would show. Raw `deltaMS`, not the clamped `dt`, so a long
   * frame is counted at its true length. A ring buffer, so sampling costs nothing to speak of.
   */
  private readonly frames = new Float32Array(240);
  private frameAt = 0;
  private frameCount = 0;
  private sampleFrame(ms: number): void {
    this.frames[this.frameAt] = ms;
    this.frameAt = (this.frameAt + 1) % this.frames.length;
    if (this.frameCount < this.frames.length) this.frameCount++;
  }

  /** Frame times in ms: how many were sampled, the median, the 95th percentile, and the worst. */
  frameStats(): { samples: number; p50: number; p95: number; worst: number } {
    const n = this.frameCount;
    if (!n) return { samples: 0, p50: 0, p95: 0, worst: 0 };
    const xs = Array.from(this.frames.slice(0, n)).sort((a, b) => a - b);
    const at = (q: number) => xs[Math.min(n - 1, Math.floor(q * n))]!;
    const round = (x: number) => Math.round(x * 10) / 10;
    return { samples: n, p50: round(at(0.5)), p95: round(at(0.95)), worst: round(xs[n - 1]!) };
  }

  counts(): ChartCounts {
    return {
      displayObjects: countDisplayObjects(this.app.stage),
      textures: this.nebula.textureCount() + (this.dotTexture ? 1 : 0) + liveResourceCount() + (this.transition ? 1 : 0),
      activeFx: (this.transition ? 1 : 0) + this.director.activeCount(),
      tickerCallbacks: this.app.ticker.count,
    };
  }

  /** The hero aura's subject: the followed captain (05 §6), or null. */
  setHero(key: CanonicalKey | null): void {
    this.heroKey = key;
  }

  /** The hero's entrance, as play starts. */
  heroWarmup(): void {
    if (this.heroKey) this.hero.warmup();
  }

  heroState(): { key: string | null; visible: number; warming: boolean } {
    return { key: this.heroKey, visible: this.hero.visible, warming: this.hero.warming };
  }

  /** The captain being followed (05 §6), for their ship's compact label. */
  setFollowed(key: CanonicalKey | null): void {
    this.labels.setFollowed(key);
  }

  /** Test hook: place the camera without counting as the user's pan. */
  setCameraForTest(state: CamState): void {
    this.camera.set(state);
  }

  shownStages(): Record<string, string> {
    return this.scene?.shownStages() ?? {};
  }

  guidesShown(): Record<string, number> {
    return this.scene?.guidesShown() ?? {};
  }

  /**
   * What the cast plates say now (22 B6, B8, tests): each lit piece's opacity and note, by projection
   * key, and the events whose notes show (History's *now* rows).
   */
  annotations(): { lit: Record<string, number>; notes: Record<string, { text: string; eventKey: string }>; playing: string[] } {
    return { lit: Object.fromEntries(this.director.labelled()), notes: Object.fromEntries(this.director.notes()), playing: this.director.nowPlaying() };
  }

  /** Which way each of these nodes' views faces (1 east, -1 west), where it turns (tests). */
  facings(pks: readonly string[]): Record<string, number> {
    return Object.fromEntries(pks.flatMap((pk) => { const f = this.scene?.facingOf(pk); return f === undefined ? [] : [[pk, f]]; }));
  }

  viewAlphas(pks: readonly string[]): Record<string, number> {
    return this.scene?.viewAlphas(pks) ?? {};
  }

  tenders(pk: string) {
    return this.scene?.tendersOf(pk) ?? null;
  }

  viewTints(pks: readonly string[]): Record<string, number> {
    return this.scene?.viewTints(pks) ?? {};
  }

  cameraState(): CamState {
    return { ...this.camera.state };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return this.camera.worldToScreen(x, y);
  }

  /** Nodes at their layout targets (where the glide is taking them). */
  targetNodes(): ViewNode[] {
    return this.scene?.targetNodes() ?? this.graph?.nodes ?? [];
  }

  /** Nodes as drawn right now (label-sized floors and attachments applied). */
  nodesNow(): ViewNode[] {
    return this.scene?.effectiveNodes() ?? this.graph?.nodes ?? [];
  }

  /** Hit circles in screen px, for VC-3 and the density harness. */
  hitCirclesScreen(): { projectionKey: string; kind: string; label: string; x: number; y: number; r: number }[] {
    const s = this.camera.state.scale;
    return (this.scene?.hitCircles() ?? []).map((c) => ({ ...c, ...this.camera.worldToScreen(c.x, c.y), r: c.r * s }));
  }

  isTransitioning(): boolean {
    return this.transition !== null;
  }

  destroy(): void {
    window.removeEventListener('pointerup', this.onRelease);
    window.removeEventListener('pointercancel', this.onRelease);
    this.app.ticker.remove(this.onTick);
    this.offProfile?.();
    this.director.clear();
    this.app.renderer.off('resize', this.onResize);
    this.finishTransition();
    this.scene?.dispose();
    this.labels.clear();
    this.overlays.clear();
    this.nebula.destroy();
    this.tooth.destroy();
    for (const f of [...this.paint.bodies, ...this.paint.hardware]) f.destroy();
    this.dotTexture?.destroy(true);
    this.app.destroy(true, { children: true });
  }

  // --- transitions (06 §3): snapshot the outgoing view, crossfade under an instrument-grid wipe ---

  private beginTransition(opts: ShowOptions): void {
    this.finishTransition(); // an interrupted transition ends where it is; the new one starts from there
    const { width, height } = this.app.screen;
    this.labelHost.style.opacity = '0';
    this.reticle.clear();
    this.wipe.clear();
    // The stage's local space is screen space, so the snapshot lines up at (0, 0).
    const texture = this.app.renderer.generateTexture({ target: this.app.stage, frame: new Rectangle(0, 0, width, height) });
    const snapshot = new Sprite(texture);
    snapshot.width = width;
    snapshot.height = height;
    this.layers.outgoingScene.addChild(snapshot);
    const focus = opts.focus ? this.camera.worldToScreen(opts.focus.x, opts.focus.y) : { x: width / 2, y: height / 2 };
    // Reduced motion (05 §7): a 150 ms crossfade, with no zoom.
    const dur = motion.reduced ? REDUCED_TRANSITION_MS : opts.durationMs ?? 700;
    this.transition = { snapshot, texture, t: 0, dur, direction: opts.direction === 'out' ? 'out' : 'in', focus };
    this.layers.worldCamera.alpha = 0;
  }

  private stepTransition(dt: number): void {
    const tr = this.transition;
    if (!tr) return;
    tr.t = Math.min(tr.dur, tr.t + dt);
    const k = tr.t / tr.dur;
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const { width, height } = this.app.screen;
    // The outgoing view zooms about the focus point and fades.
    const s = motion.reduced ? 1 : tr.direction === 'in' ? 1 + ease * 0.6 : 1 - ease * 0.25;
    tr.snapshot.alpha = 1 - ease;
    tr.snapshot.width = width * s;
    tr.snapshot.height = height * s;
    tr.snapshot.position.set(tr.focus.x * (1 - s), tr.focus.y * (1 - s));
    this.layers.worldCamera.alpha = ease;
    if (!motion.reduced) this.drawWipe(k); // the grid sweep is motion: off in reduced motion
    if (tr.t >= tr.dur) {
      this.finishTransition();
      this.resolveReady?.();
    }
  }

  private finishTransition(): void {
    const tr = this.transition;
    if (!tr) return;
    tr.snapshot.destroy();
    tr.texture.destroy(true);
    this.transition = null;
    this.wheelLockUntil = performance.now() + WHEEL_COOLDOWN_MS;
    this.wipe.clear();
    this.layers.worldCamera.alpha = 1;
    this.labelHost.style.opacity = '';
  }

  /** A band of chart grid sweeping across the view. */
  private drawWipe(k: number): void {
    const g = this.wipe;
    const { width, height } = this.app.screen;
    g.clear();
    const x = -200 + (width + 400) * k;
    const band = 220;
    const step = 28;
    for (let gx = Math.floor((x - band) / step) * step; gx < x; gx += step) g.moveTo(gx, 0).lineTo(gx, height);
    for (let gy = 0; gy < height; gy += step) g.moveTo(Math.max(0, x - band), gy).lineTo(Math.max(0, x), gy);
    g.stroke({ width: 1, color: 0x83dde2, alpha: 0.18 * Math.sin(k * Math.PI) });
    g.moveTo(x, 0).lineTo(x, height).stroke({ width: 2, color: 0x83dde2, alpha: 0.5 * Math.sin(k * Math.PI) });
  }

  /**
   * The zoom range and the area the user can move over, for a scene at its fit. The range is
   * relative to the fit, so zoom-through thresholds are always reachable (06 §3), and never so far
   * out that what you can click is under MIN_TARGET_PX across (decided 2026-10-07).
   */
  private setLimits(graph: ViewGraph): void {
    const floor = graph.sceneKey === 'galaxy' ? targetScale(graph.nodes, MIN_TARGET_PX) : 0;
    this.camera.setZoomRange(Math.min(this.fitScale, Math.max(this.fitScale * 0.35, floor)), this.fitScale * 6);
    this.camera.setContent(boundsOf(graph, this.fitScale));
  }

  private setEmptyCosmos(on: boolean): void {
    if (on && !this.blackHole) {
      this.blackHole = new BlackHoleView(1);
      this.layers.backdrop.addChild(this.blackHole.root);
    } else if (!on && this.blackHole) {
      this.blackHole.destroy();
      this.blackHole = null;
    }
  }

  /**
   * Where the black hole sits (screen px): centred across the usable view, a little above middle, so
   * the call to action and the quote fit below it. Null when it isn't shown.
   */
  emptyCosmosAnchor(): { x: number; y: number; r: number } | null {
    if (!this.blackHole) return null;
    const { width, height } = this.app.screen;
    const usableW = width - INSPECTOR_WIDTH;
    const usableH = height - PLAYER_HEIGHT;
    const r = Math.min(usableW, usableH) * 0.26;
    return { x: usableW / 2, y: PLAYER_HEIGHT + usableH * 0.34, r };
  }

  /** Zoom about the view's centre (the + and − keys), with zoom-through like a pinch. */
  zoomBy(factor: number): void {
    if (this.transition || performance.now() < this.wheelLockUntil) return;
    rlog('zoom', { factor, via: 'button-or-key' });
    const c = this.camera.centerScreen();
    this.camera.zoomAt(c.x, c.y, factor);
    this.cb.onUserCamera?.();
    this.zoomThrough(factor, c);
  }

  /**
   * The hierarchy the scenes belong to (decided 2026-10-07): the sky per level, and the director's
   * walks; and its paradigm's holo plates for nodes with no asset (19 R1), or none (the v0 views).
   */
  private hier: Hierarchy = BACKLOG;
  setHierarchy(h: Hierarchy, plates?: KindPlates): void {
    this.hier = h;
    this.labels.setPlates(plates ?? null);
  }

  /**
   * Something is loading for these objects (decided 2026-10-07): each gathers energy by kind. With
   * `ease`, the camera eases about 1.15× toward the first; `gentle` keeps the glow faint (a team's
   * stars while its history loads). `endExplore` ends them: done flares out; failed fades.
   */
  explore(keys: CanonicalKey | CanonicalKey[], opts: { ease?: boolean; gentle?: boolean } = {}): void {
    // One loading moment (decided 2026-10-07): asked again for what's already gathering, it carries on.
    const wanted = new Set(Array.isArray(keys) ? keys : [keys]);
    const running = this.energies.filter((e) => !e.fx.ended && e.key);
    if (this.exploring && running.length === wanted.size && running.every((e) => wanted.has(e.key!))) return;
    this.endExplore('failed');
    const nodes = (Array.isArray(keys) ? keys : [keys])
      .map((k) => this.nodesNow().find((n) => n.canonicalKey === k && n.kind !== 'captain'))
      .filter((n): n is ViewNode => !!n);
    if (!nodes.length) return;
    rlog('explore', { kind: nodes[0]!.kind, count: nodes.length });
    const kindOf = (n: ViewNode): EnergyKind => (n.kind === 'galaxy' ? 'galaxy' : n.kind === 'star' ? 'star' : 'planet');
    for (const n of nodes) {
      const fx = new EnergyFx(this.layers.selectionOverlay, kindOf(n), (n.seed % 997) / 997);
      if (opts.gentle) { fx.base = 0.12; fx.rate = 0.03; }
      this.energies.push({ fx, key: n.canonicalKey });
    }
    const before = opts.ease === false ? null : { ...this.camera.state };
    this.exploring = { before };
    if (before) {
      const node = nodes[0]!;
      const { max } = this.camera.zoomRange();
      this.camera.tweenTo({ x: before.x + (node.world.x - before.x) * 0.25, y: before.y + (node.world.y - before.y) * 0.25, scale: Math.min(max, before.scale * 1.15) }, motion.reduced ? 1 : 700);
    }
  }

  exploreProgress(fraction: number): void {
    for (const e of this.energies) if (!e.fx.ended) e.fx.setProgress(fraction);
  }

  endExplore(outcome: 'done' | 'failed'): void {
    if (!this.exploring) return;
    rlog('explore-end', { outcome });
    if (outcome === 'failed' && this.exploring.before) this.camera.tweenTo(this.exploring.before, motion.reduced ? 1 : 300);
    for (const e of this.energies) e.fx.end(outcome);
    this.exploring = null;
  }

  get isExploring(): boolean {
    return this.exploring !== null;
  }

  /**
   * The empty cosmos's black hole while the app waits on the network (decided 2026-10-07): a gentle
   * pull (connecting, finding your projects), a storm that accelerates while the cosmos fills, and,
   * when it's done, a release that tears open as the galaxies arrive. Idle after a storm releases;
   * after a gentle pull it just fades.
   */
  cosmosEnergy(level: 'idle' | 'gentle' | 'storm'): void {
    const prev = this.cosmos?.level ?? 'idle';
    if (level === prev) return;
    if (level === 'idle') {
      this.cosmos!.fx.end(prev === 'storm' ? 'done' : 'failed');
      this.energies.push({ fx: this.cosmos!.fx, key: null }); // plays out with the others
      this.cosmos = null;
      return;
    }
    if (!this.cosmos) {
      if (!this.blackHole) return;
      this.cosmos = { fx: new EnergyFx(this.layers.selectionOverlay, 'blackhole', 0.37), level };
    }
    this.cosmos.level = level;
    if (level === 'storm') this.cosmosPeak = 'storm';
    else if (this.cosmosPeak === 'idle') this.cosmosPeak = 'gentle';
    this.cosmos.fx.base = level === 'storm' ? 0.65 : 0.3;
    this.cosmos.fx.rate = level === 'storm' ? 0.22 : 0.015;
    rlog('cosmos-energy', { level });
  }

  /** The strongest the black hole has been (tests: a fast load can storm between two looks). */
  private cosmosPeak: 'idle' | 'gentle' | 'storm' = 'idle';

  /** Test hook: the energies drawn now, by kind, and the black hole's level (and its peak). */
  /** Arrivals and departures in the current scene (tests). */
  motionState(): { arrive: number; depart: number; active: number } {
    const s = this.scene;
    return s ? { ...s.motionCount, active: s.activeMotions() } : { arrive: 0, depart: 0, active: 0 };
  }

  energyState(): { kinds: string[]; cosmos: string; cosmosPeak: string } {
    return { kinds: this.energies.filter((e) => !e.fx.ended).map((e) => e.fx.kind), cosmos: this.cosmos?.level ?? 'idle', cosmosPeak: this.cosmosPeak };
  }

  /** Back to the scene's opening frame (the 0 key). */
  resetView(): void {
    if (!this.graph || this.transition) return;
    this.camera.tweenTo(fitFor(this.camera, this.graph), motion.reduced ? 1 : 500);
    this.cb.onUserCamera?.();
  }

  /**
   * The scrollbars (decided 2026-10-07): each axis only when the scene can't fit on it even zoomed all
   * the way out, with the view's share of the content and its position.
   */
  scrollState(): { x: { start: number; size: number } | null; y: { start: number; size: number } | null } | null {
    const s = this.camera.scrollState();
    const over = this.camera.overflowAt(this.camera.zoomRange().min);
    if (!s || !over || (!over.x && !over.y)) return null;
    return { x: over.x ? s.x : null, y: over.y ? s.y : null };
  }

  /** Drag the scroll rail: move by a fraction of the scene's span. */
  scrollByFraction(fx: number, fy: number): void {
    if (this.transition) return;
    this.camera.scrollByFraction(fx, fy);
    this.cb.onUserCamera?.();
  }

  /** Cross a scale boundary when wheel zoom goes far enough (06 §3). */
  private zoomThrough(factor: number, anchor: { x: number; y: number }): void {
    const ratio = this.camera.state.scale / this.fitScale;
    if (factor > 1 && ratio >= ZOOM_IN_THROUGH) {
      const target = this.centeredEnterable() ?? this.enterableAt(anchor);
      if (target) {
        this.wheelLockUntil = Number.POSITIVE_INFINITY; // until the transition finishes
        this.cb.onEnter(target, 'wheel');
      }
    } else if (factor < 1 && (ratio <= ZOOM_OUT_THROUGH || this.camera.state.scale <= this.camera.zoomRange().min * 1.001)) {
      // Pinching out at the zoom floor goes up a level, so the floor never traps you in a scene.
      this.wheelLockUntil = Number.POSITIVE_INFINITY; // until the transition finishes, like zooming in
      this.cb.onZoomOut();
      if (!this.transition) this.releaseWheel(); // nowhere to go back to
    }
  }

  /** The enterable node nearest the view center, if it's close enough to count as aimed at. */
  centeredEnterable(): ViewNode | null {
    const c = this.camera.centerScreen();
    const { width, height } = this.app.screen;
    let best: { node: ViewNode; d: number } | null = null;
    for (const n of this.nodesNow()) {
      if (!n.selectable || !(n.zoomTo || n.kind === 'galaxy')) continue;
      const p = this.camera.worldToScreen(n.world.x, n.world.y);
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      const reach = Math.max(n.world.r * this.camera.state.scale, CENTER_TOLERANCE * Math.min(width - INSPECTOR_WIDTH, height));
      if (d <= reach && (!best || d < best.d)) best = { node: n, d };
    }
    return best?.node ?? null;
  }

  /** The enterable node directly under a screen point (wheel zoom anchors on the cursor). */
  private enterableAt(p: { x: number; y: number }): ViewNode | null {
    for (const n of this.nodesNow()) {
      if (!n.selectable || !(n.zoomTo || n.kind === 'galaxy')) continue;
      const s = this.camera.worldToScreen(n.world.x, n.world.y);
      if (Math.hypot(s.x - p.x, s.y - p.y) <= hitRadius(n, this.camera.state.scale) * this.camera.state.scale) return n;
    }
    return null;
  }

  /**
   * The captain's ship nearest a window point, within its hit circle (never under a 22 px reach), or
   * null (23 E8: a picture dropped on a ship). `x`/`y` are client coordinates.
   */
  captainAt(clientX: number, clientY: number): ViewNode | null {
    const r = this.app.canvas.getBoundingClientRect();
    const p = { x: clientX - r.left, y: clientY - r.top };
    const scale = this.camera.state.scale;
    let best: { node: ViewNode; d: number } | null = null;
    for (const n of this.nodesNow()) {
      if (n.kind !== 'captain' && n.kind !== 'assignmentBeacon') continue; // a beacon's key is its captain's
      const s = this.camera.worldToScreen(n.world.x, n.world.y);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d <= Math.max(hitRadius(n, scale) * scale, 22) && (!best || d < best.d)) best = { node: n, d };
    }
    return best?.node ?? null;
  }

  /** Unlock wheel input if an enter request was refused (e.g. a galaxy with no sectors). */
  releaseWheel(): void {
    if (!this.transition) this.wheelLockUntil = performance.now() + WHEEL_COOLDOWN_MS;
  }

  // --- frame loop ---

  /**
   * Each scene level has its own sky (06 §2), seeded by the scene so a place always looks the same.
   * The outgoing snapshot already holds the old sky, so the transition crossfades between them.
   */
  private setBackdrop(sceneKey: string): void {
    // The sky is the level's (its hierarchy says which); the seed is the whole scene key.
    const level: BackdropLevel = isRootScene(sceneKey) ? 'galaxy' : this.hier.resolve(sceneKey)?.def.backdrop ?? 'sector';
    this.nebula.setLevel(level, fnv1a32(`backdrop|${sceneKey}`));
    const shown = Math.round(TWINKLE_COUNT * TWINKLE_SHARE[level]);
    this.twinkle.children.forEach((s, i) => (s.visible = i < shown));
  }

  /** Light an object as if hovered (a History card, 06 §4): its label comes forward. Null clears. */
  hoverKey(key: CanonicalKey | null): void {
    this.hovered = key;
    this.labels.setHighlight(this.lit ?? this.hovered, this.selected);
  }

  private setHover(n: ViewNode | null): void {
    this.hovered = n?.canonicalKey ?? null;
    this.labels.setPointed(this.hovered); // the pointer's own hover: the label it reads opens fully
    this.labels.setHighlight(this.lit ?? this.hovered, this.selected);
    this.cb.onHover(n);
  }

  /**
   * An expanded plate's row's container link (v1): main opens only allowlisted keys (INV-21), so the app
   * opens it by key: the container's own, else found through the row that carries the link.
   */
  private openRowLink(url: string | null, key?: CanonicalKey): void {
    if (key) { this.cb.onOpenContainer?.({ container: key }); return; }
    if (!url) return;
    for (const list of Object.values(this.graph?.lists ?? {})) {
      const row = list.rows.find((r) => r.subtitle?.url === url);
      if (row) { this.cb.onOpenContainer?.({ piece: row.key }); return; }
    }
  }

  private onResize = (w: number, h: number): void => {
    this.nebula.resize(w, h);
    this.tooth.resize(w, h);
    this.placeTwinkle(w, h);
    this.camera.setViewport(w, h, INSPECTOR_WIDTH, PLAYER_HEIGHT);
    if (this.graph) {
      const fit = fitFor(this.camera, this.graph);
      this.fitScale = fit.scale;
      this.setLimits(this.graph);
      this.camera.set(fit);
    }
  };

  private onTick = (ticker: Ticker): void => {
    const dt = Math.min(ticker.deltaMS, 100); // clamp after sleep/resume (05 §5)
    this.sampleFrame(ticker.deltaMS);
    this.elapsed = this.frozenAt ?? this.elapsed + dt / 1000;
    if (this.frozenAt !== null) motion.pulseTime = this.frozenAt;
    else advanceMotion(dt / 1000);
    for (const cb of this.frameCallbacks) cb(dt);
    this.stepTransition(dt);
    this.camera.update(dt);
    const cam = this.camera.state;
    this.nebula.parallax(-cam.x * 0.015 * cam.scale, -cam.y * 0.015 * cam.scale);
    this.twinkle.position.set(-cam.x * 0.04 * cam.scale, -cam.y * 0.04 * cam.scale);
    if (this.twinkle.visible) {
      this.twinkle.children.forEach((s, i) => {
        s.alpha = 0.35 + 0.65 * Math.abs(Math.sin(this.elapsed * (0.3 + (i % 7) * 0.11) + i));
      });
    }
    if (this.blackHole) {
      const a = this.emptyCosmosAnchor()!;
      this.blackHole.root.position.set(a.x, a.y);
      this.blackHole.root.scale.set(a.r);
      this.blackHole.tick(motion.reduced ? 9 : this.elapsed); // a still frame in reduced motion
    }
    this.scene?.cull(this.camera.viewBounds(-(INSPECTOR_WIDTH + 80))); // the side panel is translucent: keep what shows through it
    this.scene?.tick(this.elapsed);
    this.scene?.setCameraScale(cam.scale);
    this.scene?.setReduced(motion.reduced);
    this.director.update(dt, this.scheduleDt, this.fxFrozen);
    this.scene?.glide(dt, this.fxFrozen);
    if (!this.fxFrozen) this.drawDawn(dt);
    this.scheduleDt = 0;
    if (this.transition) this.hero.update(dt / 1000, null, motion.reduced);
    if (!this.transition) {
      this.labels.position(this.camera, this.app.screen.width, this.app.screen.height, this.nodesNow(), {
        // Paused, nothing counts as moving: full labels return once the playback has been still a moment.
        lastPlayedAt: this.lastPlayedAt, moving: this.fxFrozen ? new Set() : this.scene?.movingKeys() ?? new Set(), now: performance.now(),
        cast: this.director.labelled(), // the pieces a maneuver casts now show their titles (19 L7)
        notes: this.director.notes(), // and why (22 B6)
        crew: this.director.crew(), // the acting captains' names (22 B9)
        rightInset: this.camera.right,
        // The overlay stack's measured bottom (OverlayStack: the partial-history line and the banners) pushes a capped plate down;
        // the plate adds its own margin, so the stack counts less that, and the player alone leaves the inset as it was.
        topInset: plateTopInset(this.camera.top, this.stackBottom()),
        entering: (pk) => this.scene?.entering(pk) ?? false, // ships and stations arrive before their plates (22 A8)
        reduced: motion.reduced,
      });
      this.labels.placeLanes(this.camera);
      this.scene?.setNamePlates(this.labels.nameplates(), this.camera.state.scale, (x, y) => this.camera.screenToWorld(x, y)); // the planets' names, under what's over the planets (22 D7)
      // History marks the events whose notes show (22 B5): handed over as they change, not every frame.
      const playing = this.director.nowPlaying();
      const said = playing.join('|');
      if (said !== this.nowPlaying) {
        this.nowPlaying = said;
        this.cb.onNowPlaying?.(playing);
      }
      // v1 overlays read the tiers the labels just chose, then hand back what they cover (overlays.ts).
      const live = this.nodesNow();
      this.overlays.focus({ expanded: this.labels.expanded() });
      this.overlays.position(this.camera, this.app.screen.width, this.app.screen.height, live);
      this.labels.obstacles(this.overlays.rects());
      this.drawReticle();
      this.drawHero(dt / 1000);
    }
    this.drawEnergy(dt / 1000); // through transitions too: a release flares as the scene changes
    if (this.debug) this.drawDebug();
  };

  private drawDawn(dt: number): void {
    if (this.dawnT === null) return;
    const DAWN_MS = 1600;
    this.dawnT += dt;
    const g = this.dawnGfx.clear();
    const k = this.dawnT / DAWN_MS;
    if (k >= 1) {
      this.dawnT = null;
      return;
    }
    const { width, height } = this.app.screen;
    const x = -width * 0.25 + width * 1.5 * k;
    const band = width * 0.05;
    const env = Math.sin(Math.PI * k);
    for (let i = -6; i <= 6; i++) {
      g.rect(x + i * band, 0, band, height).fill({ color: 0xffe2b0, alpha: 0.035 * env * (1 - Math.abs(i) / 7) });
    }
  }

  private drawEnergy(dt: number): void {
    const scale = this.camera.state.scale;
    const live = this.transition ? [] : this.nodesNow();
    for (const e of this.energies) {
      const node = e.key ? live.find((n) => n.canonicalKey === e.key && n.kind !== 'captain') : undefined;
      const p = node ? this.camera.worldToScreen(node.world.x, node.world.y) : null;
      e.fx.update(dt, node && p ? { x: p.x, y: p.y, r: screenRadius(node, scale) } : null, motion.reduced);
    }
    this.energies = this.energies.filter((e) => !e.fx.finished);
    if (this.cosmos) this.cosmos.fx.update(dt, this.emptyCosmosAnchor(), motion.reduced);
  }

  /** The hero aura follows the followed ship wherever it's drawn (not during a scene transition). */
  private drawHero(dt: number): void {
    const ship = this.heroKey ? this.nodesNow().find((n) => n.kind === 'captain' && n.canonicalKey === this.heroKey) : undefined;
    const p = ship ? this.camera.worldToScreen(ship.world.x, ship.world.y) : null;
    this.hero.update(dt, ship && p ? { x: p.x, y: p.y, r: ship.world.r * this.camera.state.scale } : null, motion.reduced);
  }

  private drawReticle(): void {
    const g = this.reticle;
    g.clear();
    const node = this.nodesNow().find((n) => n.canonicalKey === this.selected && n.selectable);
    if (!node) return;
    const p = this.camera.worldToScreen(node.world.x, node.world.y);
    const factor = node.kind === 'galaxy' ? 0.7 : node.kind === 'star' ? 1.5 : 1.55;
    const r = Math.max(18, node.world.r * this.camera.state.scale * factor);
    const spin = this.elapsed * 0.2; // slow: draws the eye without pulling at it
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      g.moveTo(p.x + Math.cos(a + 0.2) * r, p.y + Math.sin(a + 0.2) * r).arc(p.x, p.y, r, a + 0.2, a + Math.PI / 2 - 0.2);
      g.moveTo(p.x + Math.cos(a) * (r + 4), p.y + Math.sin(a) * (r + 4)).lineTo(p.x + Math.cos(a) * (r + 12), p.y + Math.sin(a) * (r + 12));
    }
    g.stroke({ width: 1.5, color: 0xf4f0de, alpha: 0.95 }); // ivory: amber/gold now means accomplished (09 §6)
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    g.clear();
    for (const n of this.nodesNow()) {
      if (!n.selectable) continue;
      const p = this.camera.worldToScreen(n.world.x, n.world.y);
      g.circle(p.x, p.y, hitRadius(n, this.camera.state.scale) * this.camera.state.scale);
    }
    g.stroke({ width: 1, color: 0xff00ff, alpha: 0.8 });
  }

  private buildTwinkle(): void {
    const dot = new Graphics().circle(8, 8, 8).fill({ color: 0xffffff, alpha: 0.04 }).circle(8, 8, 3).fill({ color: 0xffffff, alpha: 0.3 }).circle(8, 8, 1.4).fill({ color: 0xffffff });
    this.dotTexture = this.app.renderer.generateTexture({ target: dot, resolution: 2 });
    dot.destroy();
    for (let i = 0; i < TWINKLE_COUNT; i++) {
      const s = new Sprite(this.dotTexture);
      s.anchor.set(0.5);
      this.twinkle.addChild(s);
    }
  }

  private placeTwinkle(w: number, h: number): void {
    const rnd = seededRandom(fnv1a32('twinkle'));
    this.twinkle.children.forEach((s) => {
      s.position.set(rnd() * w * 1.1 - w * 0.05, rnd() * h * 1.1 - h * 0.05);
      const size = 0.25 + rnd() * rnd() * 0.75;
      s.scale.set(size);
      (s as Sprite).tint = rnd() < 0.15 ? 0xf1b75b : rnd() < 0.3 ? 0x83dde2 : 0xf4f0de;
    });
  }

  /**
   * A press on a label (decided 2026-10-07): the label is its object's button. Released in place, a
   * click selects and a double-click enters; moved past DRAG_PX, it pans, like a press anywhere.
   */
  private pressLabel(node: ViewNode, e: PointerEvent): void {
    const start = { x: e.clientX, y: e.clientY };
    let last = start;
    let panning = false;
    const move = (m: PointerEvent) => {
      if (!panning && Math.hypot(m.clientX - start.x, m.clientY - start.y) > DRAG_PX) panning = true;
      if (!panning || this.transition) return;
      this.camera.panBy(m.clientX - last.x, m.clientY - last.y);
      last = { x: m.clientX, y: m.clientY };
      this.cb.onUserCamera?.();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (panning) rlog('pan', { via: 'label', dx: Math.round(last.x - start.x), dy: Math.round(last.y - start.y) });
      if (panning || this.transition) return;
      const now = performance.now();
      const double = this.lastLabelTap?.pk === node.projectionKey && now - this.lastLabelTap.at < DOUBLE_TAP_MS;
      this.lastLabelTap = double ? null : { pk: node.projectionKey, at: now };
      const found = this.nodesNow().find((n) => n.projectionKey === node.projectionKey);
      if (!found) warn('label-node-gone', { key: node.canonicalKey, nodeKind: node.kind });
      const current = found ?? node;
      rlog('label-press', { key: current.canonicalKey, nodeKind: current.kind, outcome: double ? 'enter' : 'select' });
      if (double) this.cb.onEnter(current, 'dblclick');
      else this.cb.onSelect(current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private bindInput(): void {
    const canvas = this.app.canvas;
    // One log entry per wheel gesture (a pause of 250 ms ends it): its pan, or its zoom.
    let gesture: { kind: 'wheel-pan' | 'wheel-zoom'; dx: number; dy: number; factor: number; events: number; timer: number } | null = null;
    const noteWheel = (kind: 'wheel-pan' | 'wheel-zoom', dx: number, dy: number, factor: number) => {
      if (gesture && gesture.kind !== kind) { window.clearTimeout(gesture.timer); flush(); }
      gesture ??= { kind, dx: 0, dy: 0, factor: 1, events: 0, timer: 0 };
      gesture.dx += dx; gesture.dy += dy; gesture.factor *= factor; gesture.events++;
      window.clearTimeout(gesture.timer);
      gesture.timer = window.setTimeout(flush, 250);
    };
    const flush = () => {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      rlog(g.kind, g.kind === 'wheel-pan' ? { dx: Math.round(g.dx), dy: Math.round(g.dy), events: g.events } : { factor: Number(g.factor.toFixed(3)), events: g.events, scale: Number(this.camera.state.scale.toFixed(4)) });
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (this.transition) return;
      // The wheel zooms, everywhere (decided 2026-10-07, revising "scroll pans"): a mouse wheel, a
      // trackpad's two-finger scroll, and a pinch (Ctrl+wheel). Big scenes move by their scrollbars and drag.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      if (performance.now() < this.wheelLockUntil) return;
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015));
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      noteWheel('wheel-zoom', 0, 0, factor);
      this.camera.zoomAt(anchor.x, anchor.y, factor);
      this.cb.onUserCamera?.();
      this.zoomThrough(factor, anchor);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    // Labels are buttons now (they take the pointer), so the wheel over one still moves the chart.
    this.labelHost.addEventListener('wheel', onWheel, { passive: false });
    // A press anywhere on the chart, labels included (they are DOM buttons the Pixi stage never sees),
    // holds the automatic camera until a moment after release.
    canvas.addEventListener('pointerdown', this.onPress);
    this.labelHost.addEventListener('pointerdown', this.onPress);
    window.addEventListener('pointerup', this.onRelease);
    window.addEventListener('pointercancel', this.onRelease);

    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    // Press-and-drag pans from anywhere, objects included; under DRAG_PX it stays a click.
    let drag: { x: number; y: number; sx: number; sy: number } | null = null;
    stage.on('pointerdown', (e) => {
      drag = { x: e.global.x, y: e.global.y, sx: e.global.x, sy: e.global.y };
      this.dragged = false;
    });
    stage.on('globalpointermove', (e) => {
      if (!drag) return;
      if (!this.dragged && Math.hypot(e.global.x - drag.sx, e.global.y - drag.sy) <= DRAG_PX) return;
      this.dragged = true;
      this.camera.panBy(e.global.x - drag.x, e.global.y - drag.y);
      drag = { ...drag, x: e.global.x, y: e.global.y };
      this.cb.onUserCamera?.();
    });
    const end = () => {
      if (drag && this.dragged) rlog('pan', { via: 'drag', dx: Math.round(drag.x - drag.sx), dy: Math.round(drag.y - drag.sy) });
      drag = null;
    };
    stage.on('pointerup', end);
    stage.on('pointerupoutside', end);
  }
}

function countDisplayObjects(root: Container): number {
  let n = 1;
  for (const c of root.children) n += countDisplayObjects(c);
  return n;
}

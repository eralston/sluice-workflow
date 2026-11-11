// Shared by the Star Chart adapters: an art view behind the asset interface, and synthetic nodes for
// gallery samples. The adapter's view takes the node's neutral stage (engine/stageCode.ts) and hands
// the art its own grammar (stageCodec.ts); acts are transient looks a maneuver plays. An act ends on
// its own after ACT_S of the scene clock, or sooner at the next stage or the `rest` act, so a resting
// look stays a pure function of the snapshot (14 §4, INV-12). Only methods the art has are exposed
// (`face`, `setLightFrom`), so GraphScene's capability checks see the art's own shape.
import { Graphics, type Container } from 'pixi.js';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { NodeKind, PieceState, ViewNode } from '@shared/contracts/view';
import { encodePiece } from '@shared/engine/stageCode';
import type { Signal } from '@shared/engine/types';
import type { AssetCtx, AssetView } from '../../../chart/assets/types';
import { EVENT_LOOP_S } from '../../../chart/art/dreadnoughts';
import type { ArtView } from '../../../gallery/types';

/** The act that puts the resting look back, on every adapter view. */
export const REST = 'rest';

/** How long an act's look holds before the resting look comes back: one loop of the art's moments. */
export const ACT_S = EVENT_LOOP_S;

/**
 * An act's overlay (22 C3, M-25): drawn over the art, in its own units, from `u` 0 to 1 across
 * `OVERLAY_S` of the scene clock, then cleared. For the acts that show a change as it happens (facets
 * cut, gantries rising) rather than a moment of the art's own.
 */
export type Overlay = ((g: Graphics, u: number) => void) & {
  /** Its own length in seconds, when it isn't `OVERLAY_S` (a guest's warp out, 22 C8). */
  durS?: number;
  /** Called when the overlay is cleared (ends, rest, a seek, another overlay, destroy): puts back what it changed (INV-15). */
  end?: () => void;
};
/** How long an act's overlay plays: about a maneuver's act phase (seconds). */
export const OVERLAY_S = 1.4;

/** An act: draws a transient look on the art, from the resting stage, or returns an overlay to play. */
/** `null` means nothing to play (a victory's flare under reduced motion, 27 B3): no state is set. */
export type Act<V> = (art: V, stage: string, slot?: number | readonly number[]) => void | Overlay | null;

import type { Ambient } from '../../../chart/assets/types';

export class AdaptedView<V extends ArtView> implements AssetView {
  readonly root: Container;
  readonly marks?: Container;
  readonly layer?: 'celestial' | 'hardware';
  face?: (dir: number) => void;
  setLightFrom?: (x: number, y: number) => void;
  setZoom?: (pxPerUnit: number) => void;
  /** What the scene around it is doing (2026-10-12): how lately it was worked, where the nearest captain is. */
  ambient?: (a: Ambient) => void;
  /** A named hardpoint of the art (`emitter`), when it has any (23 C5). */
  anchor?: (name: string) => readonly [number, number] | null;
  /** The art's own light share, when it dims by its shader (a vacated world, 23 C3). */
  lightShare?: () => number;
  tenders?: () => { slot: number; x: number; y: number; docking: boolean }[];
  bay?: () => { x: number; y: number };
  /** The last neutral stage set: what `rest` returns to. */
  private stage = '';
  /** Whether an act's look is showing, and the clock it started at (null until the next tick). */
  private acting = false;
  private actFrom: number | null = null;
  /** The act's overlay playing, its layer, and the clock it started at (null until the next tick). */
  private overlay: { draw: Overlay; g: Graphics; from: number | null } | null = null;

  /**
   * `restore` undoes what an act changed outside the stage's look (a captain's pose); it runs on
   * every `rest`, so it must be a no-op when nothing changed.
   */
  constructor(
    readonly art: V,
    private readonly look: (stage: string) => string | null,
    private readonly acts: Readonly<Record<string, Act<V>>> = {},
    private readonly restore?: (art: V) => void,
  ) {
    this.root = art.root;
    this.marks = art.marks;
    this.layer = art.layer;
    if (art.face) this.face = (dir) => art.face!(dir);
    if (art.setLightFrom) this.setLightFrom = (x, y) => art.setLightFrom!(x, y);
    const zoom = (art as { setZoom?: (px: number) => void }).setZoom;
    if (zoom) this.setZoom = (px) => zoom.call(art, px);
    const amb = (art as { ambient?: (a: Ambient) => void }).ambient;
    if (amb) this.ambient = (a) => amb.call(art, a);
    const anc = (art as { anchor?: (name: string) => readonly [number, number] | null }).anchor;
    if (anc) this.anchor = (name) => anc.call(art, name);
    const ten = (art as { tenders?: AdaptedView<V>['tenders'] }).tenders;
    if (ten) { this.tenders = () => ten.call(art)!; this.bay = () => (art as unknown as { bay(): { x: number; y: number } }).bay(); }
    if ('surfaceShare' in art) this.lightShare = () => (art as unknown as { surfaceShare: number }).surfaceShare;
  }

  /** Sets the neutral stage. A look of null leaves the art as it is (a captain carries no rung). */
  setStage(stage: string): void {
    this.stage = stage;
    const s = this.look(stage);
    if (s === null) return;
    this.art.setStage(s);
    this.acting = false; // the stage's look replaced the act's
  }

  /**
   * Plays a transient look, which ends by itself after ACT_S (a replay of the act restarts it);
   * `rest` restores the stage's look now. An act the art lacks does nothing.
   */
  act(name: string, slot?: number | readonly number[]): void {
    if (name === REST) return this.rest();
    const play = Object.hasOwn(this.acts, name) ? this.acts[name] : undefined; // never Object.prototype's
    if (!play) return;
    const drawn = play(this.art, this.stage, slot);
    if (drawn === null) return;
    if (typeof drawn === 'function') {
      this.clearOverlay();
      const g = new Graphics();
      g.blendMode = 'add';
      this.root.addChild(g);
      this.overlay = { draw: drawn, g, from: null };
      return;
    }
    this.acting = true;
    this.actFrom = null;
  }

  private clearOverlay(): void {
    if (!this.overlay) return;
    const { g, draw } = this.overlay;
    this.overlay = null;
    draw.end?.();
    g.destroy();
  }

  tick(seconds: number): void {
    if (this.acting) {
      // Timed on the clock the view is ticked with; a clock that steps back restarts the count.
      if (this.actFrom === null || seconds < this.actFrom) this.actFrom = seconds;
      else if (seconds - this.actFrom >= ACT_S) this.rest();
    }
    const o = this.overlay;
    if (o) {
      if (o.from === null || seconds < o.from) o.from = seconds;
      const u = (seconds - o.from) / (o.draw.durS ?? OVERLAY_S);
      if (u >= 1) this.clearOverlay();
      else {
        o.g.clear();
        o.draw(o.g, Math.max(0, u));
      }
    }
    this.art.tick(this.artTime(seconds));
  }

  /** The clock the art is ticked with: the scene's, unless a view slows its art (a station on standby, 19 M1). */
  protected artTime(seconds: number): number {
    return seconds;
  }

  private rest(): void {
    this.acting = false;
    this.actFrom = null;
    this.setStage(this.stage);
    this.restore?.(this.art);
    this.clearOverlay();
  }

  destroy(): void {
    this.clearOverlay();
    this.art.destroy();
  }
}

// ---- Gallery samples ----

/** Invented people and repos (fixture-style keys; never real ADO data, INV-18). */
const ORG = 'sample-org';
export const sampleKey = {
  person: (n: number) => `id:${ORG}:00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as CanonicalKey,
  item: (n: number) => `wi:${ORG}:${n}` as CanonicalKey,
  repo: (n: number) => `repo:${ORG}:00000000-0000-4000-9000-${String(n).padStart(12, '0')}` as CanonicalKey,
};

/** No viewer: every look from its seed. */
export const NO_VIEWER: AssetCtx = { theme: 'star-chart', viewer: null, captain: null };

/** A node as the projection would give it, for a gallery cell through the same factory. */
export function sampleNode(o: {
  key: CanonicalKey; kind: NodeKind; asset: string; seed: number; r: number; piece?: PieceState; label?: string;
  compound?: ViewNode['compound'];
}): ViewNode {
  return {
    projectionKey: `sample:${o.asset}:${o.key}`, canonicalKey: o.key, kind: o.kind, asset: o.asset,
    world: { x: 0, y: 0, r: o.r }, stage: o.piece ? encodePiece(o.piece) : '', seed: o.seed, label: o.label ?? o.asset,
    openable: false, selectable: false, labelled: false, flags: {}, evidence: [],
    ...(o.piece ? { piece: o.piece } : {}), ...(o.compound ? { compound: o.compound } : {}),
  };
}

/** A piece for a sample, with an invented category. */
export function samplePiece(role: PieceState['role'], signal: Signal, extra: Partial<PieceState> = {}): PieceState {
  const category = signal.rung === 'accomplished' ? 'Completed' : signal.rung === 'off' ? 'Removed'
    : signal.rung === 'ready' ? 'Proposed' : 'InProgress';
  return { role, signal, category, ...extra };
}

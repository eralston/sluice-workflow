// 14 §2.8 — the asset registry's shapes (v1). An asset is a drawable kind of object: a factory over
// the art, its layer, its capabilities (which replace v0's kind tables), its floors and label rank,
// and gallery samples built through the same factory. Theme adapters fill it (theme/<id>/assets).
import type { CanonicalKey } from '@shared/contracts/keys';
import type { CaptainStyle } from '@shared/contracts/settings';
import type { ViewNode } from '@shared/contracts/view';
import type { ArtView, Item } from '../../gallery/types';
import type { HoloSpec } from '../holo/holoLabel';

/** What an asset may know beyond its node: applied at asset time, never in shared projection (14 §4). */
export interface AssetCtx {
  /** The active theme's id. */
  theme: string;
  /** The person this copy of the app is for, or null. */
  viewer: CanonicalKey | null;
  /** The viewer's own ship style, or null for their seeded look. */
  captain: CaptainStyle | null;
}

/** An art view with optional transient acts (a jump, a break-up), played by maneuvers. */
/**
 * What the scene tells a view about its surroundings (2026-10-12), a few times a second: how lately
 * its node was worked (`ViewNode.activity`), and for a threat, which way the nearest captain is.
 */
export interface Ambient { activity?: number; toward?: readonly [number, number] | null }

/**
 * `settle`: a view that eases between looks itself (a station going on standby, 19 M1) lands its
 * current stage's look now. The scene calls it after a stage it applies without play (a seek, scene
 * entry, reduced motion; INV-15).
 */
export interface AssetView extends ArtView {
  /** `slot`: the compound slot the act is about (23 C6: a station's tender), when it has one. */
  act?(name: string, slot?: number | readonly number[]): void; ambient?(a: Ambient): void; settle?(): void;
  /**
   * A named hardpoint (23 C5; `emitter`: where a finishing beam leaves), in px from the view's origin at its
   * current form and heading, before the view's own scale; null for a name it lacks.
   */
  anchor?(name: string): readonly [number, number] | null;
  /** How much of its light the view draws now, 0..1, when it dims by its own shader (a vacated world, 23 C3); read by `viewTints`. */
  lightShare?(): number;
  /** A station's drawn tenders and dock bay, in px from the view's origin (23 C6, a test hook). */
  tenders?(): { slot: number; x: number; y: number; docking: boolean }[];
  bay?(): { x: number; y: number };
}

export interface AssetDef {
  /** The registry id the theme binds roles to (`roleAsset`). */
  id: string;
  /** Celestial art takes the paint pass; hardware stays crisp in its sublayer (`ArtView.layer` is only celestial or hardware). */
  layer: 'celestial' | 'infrastructure' | 'traffic';
  /** Capabilities, in place of MOVING_KINDS, FRAMED_KINDS, FLARE_KINDS and BODY_KINDS. */
  moving: boolean; framed: boolean; flare: boolean; body: boolean;
  /** Screen floor and hit floor in px (VC-3), and label rank. */
  floorPx?: number; hitFloorPx?: number; rank: number;
  /** A holographic label (chart/holo, 2026-10-12) in place of the standard plate: its frame and variant. */
  label?: HoloSpec;
  /**
   * Draws over every painted body that isn't `over`, whatever their depth: a piece that overlays its
   * seat's planet (13 §3) must never sink behind it (2026-10-12).
   */
  over?: boolean;
  /** Where an upright label's connector meets the art: its top or bottom edge, as a fraction of `world.r`. */
  labelRim?: number;
  /** The acts its view can play. */
  acts?: readonly string[];
  /**
   * Its own departure (2026-10-13): an act the view plays as it leaves the scene, in place, for
   * `departS` seconds (a hive ship backing into a closing rift), instead of the scene's orbit Depart.
   */
  departAct?: string;
  departS?: number;
  /** Decodes `node.stage` into the art's own grammar. */
  make(node: ViewNode, ctx: AssetCtx): AssetView;
  /** Whether a change (the viewer, say) needs a new view rather than a stage change. */
  rebuildOn?(prev: ViewNode, next: ViewNode, ctx: AssetCtx): boolean;
  /** Gallery cells through the same factory. */
  samples?(): Item[];
}

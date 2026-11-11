// The pluggable hierarchy (decided 2026-10-07): a chain of scene levels under the galaxy, each a
// layout fed by its own data source. Backlog (Area Path or Epic → Feature → Story/Bug → Task) and
// Sprints (sprint → pod → story → task) are two chains over the same layouts and art. v1 adds a
// third, Solar (round → region, 14 §2.5), whose region level has its own layout. Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory, SectorRef } from '../contracts/history';
import type { SyncLevel } from '../contracts/ipc';
import type { CanonicalKey } from '../contracts/keys';
import type { SceneKey, Snapshot, ViewNode } from '../contracts/view';
import type { DomainPack, RoundFacts } from '../engine/types';
import type { ScheduleOptions } from '../playback/schedule';
import type { ProjectCtx } from '../scene/project/ctx';
import type { SceneRef } from './sceneKey';

export type { SceneRef } from './sceneKey';

/** The sky behind a level (the nebula's mode). */
export type BackdropLevel = 'galaxy' | 'sector' | 'feature' | 'body';

/**
 * A field of small orreries (the sector): members laid out in balanced rows, each with a miniature
 * of its own children. Members and minis are nodes the source builds; the layout places them.
 */
export interface FieldSource {
  /** Every member ever (slot order, INV-14): the layout gives each a fixed place. */
  order(h: ScopeHistory, ref: SceneRef): CanonicalKey[];
  /** A member's node (kind 'star') when it's a member at the playhead, else null. World is set by the layout. */
  member(ctx: ProjectCtx, ref: SceneRef, key: CanonicalKey, pk: string): ViewNode | null;
  /** The miniature's children ever, slot order, already capped. */
  miniOrder(h: ScopeHistory, key: CanonicalKey): CanonicalKey[];
  /** A miniature child's node (planet or anomaly) when it's shown at the playhead, else null. */
  mini(ctx: ProjectCtx, key: CanonicalKey, childKey: CanonicalKey, pk: string): ViewNode | null;
  /** Ghost miniatures for a member whose children aren't loaded yet. */
  unexplored?(h: ScopeHistory, key: CanonicalKey): { planets: number; anomalies: number } | null;
  /** A Load more beacon in the next free slot, with its caption. */
  loadMore?(h: ScopeHistory): { meta: string } | null;
  /** The one member this field passes straight through to (06 §3), counted over the whole history. */
  passThrough?(h: ScopeHistory, ref: SceneRef): CanonicalKey | null;
  /**
   * A member's preview, drawn in place of its miniature (Solar's round, 19 P1): what its region opens
   * with, as counts first. Set, the layout reserves the preview's fixed footprint and `miniOrder` is
   * unused; null draws no preview for that member.
   */
  preview?(ctx: ProjectCtx, key: CanonicalKey): FieldPreview | null;
}

/**
 * A region's preview in the round (19 P1, R3): its seats' planets, then its objectives and threats as
 * counts. Seat slots stay put while history streams (INV-14): a person who joins takes a free slot,
 * and a slot's place depends on its number alone (`previewSlot`).
 */
export interface FieldPreview {
  /** The region's seats (the region's own rule, `seatsOf`), each in its slot on the preview's rings, with its look. */
  seats: { person: CanonicalKey; slot: number; stage: string }[];
  /** Objectives and threats in the region at the playhead, on the ladder (Off ones aren't counted). */
  objectives: number;
  threats: number;
}

/** An orrery (the star system): a centre, its children on rings, and each child's mission points. */
export interface SystemSource {
  /** The centre's node (kind 'star'), or null before it exists. World is set by the layout. */
  center(ctx: ProjectCtx, ref: SceneRef, pk: string): ViewNode | null;
  /** Every child ever, slot order, already capped. */
  order(h: ScopeHistory, ref: SceneRef): CanonicalKey[];
  /** A child's node (planet or anomaly) when it's shown at the playhead, else null. */
  child(ctx: ProjectCtx, ref: SceneRef, childKey: CanonicalKey, pk: string): ViewNode | null;
  /** Whether the child's link to the centre is uncertain (02 §6). */
  uncertain(ctx: ProjectCtx, ref: SceneRef, childKey: CanonicalKey): boolean;
  /** A child's mission points shown now, slot order (the layout caps them). */
  points(ctx: ProjectCtx, childKey: CanonicalKey): CanonicalKey[];
  /** A mission point's node. */
  point(ctx: ProjectCtx, key: CanonicalKey, pk: string): ViewNode;
}

/** A close-up (the body): a centre with its points on the radar. */
export interface RadarSource {
  /** The centre's node (planet or anomaly), or null before it exists. */
  center(ctx: ProjectCtx, ref: SceneRef, pk: string): ViewNode | null;
  /** Every point ever (the spokes, INV-14), already capped. */
  spokes(h: ScopeHistory, ref: SceneRef): CanonicalKey[];
  /** The points shown at the playhead. */
  current(ctx: ProjectCtx, ref: SceneRef): CanonicalKey[];
  point(ctx: ProjectCtx, key: CanonicalKey, pk: string): ViewNode;
  uncertain(ctx: ProjectCtx, ref: SceneRef, key: CanonicalKey): boolean;
}

/** A solar region (v1, 14 §2.5): its star and the neutral board the solar layout plans from. */
export interface SolarSource {
  /** The region's star (the v0 aggregate look), or null before it exists. World is set by the layout. */
  center(ctx: ProjectCtx, ref: SceneRef, pk: string): ViewNode | null;
  /** The round's facts for this region, over the whole loaded history (memoised per bundle). */
  facts(h: ScopeHistory, ref: SceneRef): RoundFacts;
  /** The pack that reads the bundle: its words and read-only links (17 W2-T1). */
  pack?(h: ScopeHistory): DomainPack;
  /**
   * A seat's title (2026-10-12): the theme's name for the person's place, stable for a given loaded
   * history. Unset or null: the person's display name.
   */
  seatTitle?(h: ScopeHistory, person: CanonicalKey): string | null;
}

/** A level's words, in both vocabularies (06 §4 learnability). */
export interface LevelVocab {
  /** The breadcrumb's type for an entry at this level. `typeName` is the node's own ADO type. */
  typeLabel(ref: SceneRef, typeName?: string, h?: ScopeHistory): string;
  /** The breadcrumb glyph before the label. */
  glyph(ref: SceneRef): string;
  /** The player's "Load history to play this ‹noun›". */
  playNoun: string;
  /** The same noun in the words of the pack that reads `h` (23 D5); absent: `playNoun`. */
  playNounFor?(h: ScopeHistory): string;
  /** Entering a scene of this level from the Inspector. */
  enter: { chart: string; ado: (typeName?: string, h?: ScopeHistory) => string };
  /** The breadcrumb draws this level as the team pill, with this word. */
  pill?(ref: SceneRef, h?: ScopeHistory): string;
  /** Load more's In view row tooltip. */
  loadMoreTip?: string;
}

interface LevelBase {
  id: string;
  variants?: readonly string[];
  backdrop: BackdropLevel;
  /** Scene transition length into (or out of) this level (06 §3). */
  durationMs: number;
  vocab: LevelVocab;
  /** What the player loads for a scene here: the scope's own history, this scene's, or its parent's. */
  historyScene: 'scope' | 'self' | 'parent';
  /** Keys the scene can show (highlights, in-view ticks); null for everything. */
  sceneKeys(h: ScopeHistory, ref: SceneRef): Set<CanonicalKey> | null;
  /**
   * A further test on the events touching the scene's keys, for its schedule (22 C12: a Solar region
   * plays a PR's events only while the PR serves its work). Absent: every touching event plays.
   */
  sceneEvents?(h: ScopeHistory, ref: SceneRef): (e: AnyTimelineEvent) => boolean;
  /**
   * A current-state load to run before entering (loaded by level), or null. `focus` (decided
   * 2026-10-08): a streaming scope brings this scene's first look to the front, and entering waits for it.
   */
  enterLoad?(h: ScopeHistory, ref: SceneRef): SyncLevel | { kind: 'focus' } | null;
  /** v1 (13 §2): whether a scene here can play. Default true; Solar's round level sets false. */
  playable?: boolean;
}

export type LevelDef = LevelBase & (
  | { layout: 'field'; source: FieldSource }
  | { layout: 'system'; source: SystemSource }
  | { layout: 'radar'; source: RadarSource }
  | { layout: 'solar'; source: SolarSource }
);

export type LayoutKind = LevelDef['layout'];

/** A chain of levels under the galaxy. levels[0] is the scope level: where a bundle is loaded. */
export interface Hierarchy {
  id: string;
  levels: readonly LevelDef[];
  resolve(scene: string): { def: LevelDef; index: number; ref: SceneRef } | null;
  format(ref: SceneRef): SceneKey;
  /** The scope's own scene (its sector). */
  sceneForScope(scope: { sector: SectorRef }): SceneRef;
  // The family walks take the bundle too: a member needn't be a work item (a Sprints pod is an area
  // path, and which pod holds an item depends on the sprint's pods).
  /** The scenes below the scope level that lead to an entity at a snapshot (search and follow's goTo). */
  pathTo(s: Snapshot, key: CanonicalKey, h: ScopeHistory): SceneRef[];
  /** A scene ref's breadcrumb label and type name at a snapshot, or null when it isn't there. */
  labelOf(s: Snapshot, h: ScopeHistory, ref: SceneRef): { label: string; typeName?: string } | null;
  /** A beat's focus for an item (05 §3 step 2): the close-up that shows it, or null. */
  focusOf(s: Snapshot, key: CanonicalKey, h: ScopeHistory): CanonicalKey | null;
  /** Following (05 §6): the close-up above an item, and whether it's in the scope at all. */
  closeUpOf(s: Snapshot, key: CanonicalKey, h: ScopeHistory): { body: CanonicalKey | null; inScope: boolean };
  /** Following's stage (05 §6): the scene the camera travels to for an item, as a ref. */
  stageOf(s: Snapshot, key: CanonicalKey, h: ScopeHistory): SceneRef | null;
  /** Items outside every member of the scope (the Uncharted tray, INV-10). */
  uncharted(s: Snapshot, h: ScopeHistory): CanonicalKey[];
  /** Stagger order within a beat (05 §5): parent outward. */
  rankOf(s: Snapshot, key: CanonicalKey): number;
  vocab: { uncharted: { chart: string; ado: string; reason: string } };
  /**
   * v1 (14 §2.6): schedule hooks for this chain's bundles, spread into the options `buildScene` and
   * `buildHighlights` pass. Unset for v0 chains, so their schedules stay byte-identical.
   */
  /** Its schedule hooks (14 §2.6), for the scene `ref` when a scene's own schedule is built (22 C6: its region's captains). */
  pacing?: (h: ScopeHistory, ref?: SceneRef) => Partial<ScheduleOptions>;
}

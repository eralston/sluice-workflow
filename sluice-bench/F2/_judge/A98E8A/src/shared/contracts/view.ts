// 03 §5 — snapshot and view model.
import type { EvidenceRef } from './events';
import type { RunState } from './facts';
import type { Role, Rung, ScopeHistory } from './history';
import type { CanonicalKey, UtcMs } from './keys';
import type { FeatureTally } from '../featureRow';
import type { CompoundSlot, Formation, SeatSlot, Signal, SolarPlan } from '../engine/types';

export type Lens = 'knownThen' | 'currentObserved';

export interface WorkItemState {
  key: CanonicalKey;
  type: string;
  kind: 'epic' | 'feature' | 'story' | 'bug' | 'task' | 'other';
  title: string;
  rawState: string;
  category: string;
  stage: string;
  reopened: boolean;
  areaPath: string;
  /** Its sprint (`System.IterationPath`), when it has one (Sprints mode, decided 2026-10-07). */
  iterationPath?: string;
  assigneeKey: CanonicalKey | null;
  /** When the current assignee took the item; ships anchor to the assignment held longest (INV-07). */
  assignedAt: UtcMs | null;
  parentKey: CanonicalKey | null;
  lastEventAt: UtcMs | null;
}

export interface PrState {
  key: CanonicalKey;
  repoKey: CanonicalKey;
  title: string;
  status: 'active' | 'completed' | 'abandoned';
  statusUncertain: boolean;
  authorKey: CanonicalKey | null;
}

export interface SnapshotLink {
  kind: 'parent' | 'dependency' | 'pr';
  fromKey: CanonicalKey;
  toKey: CanonicalKey;
  uncertain: boolean;
}

export interface Snapshot {
  atUtc: UtcMs;
  lens: Lens;
  workItems: ReadonlyMap<CanonicalKey, WorkItemState>;
  prs: ReadonlyMap<CanonicalKey, PrState>;
  links: SnapshotLink[];
}

/**
 * A scene: the galaxy, or `level[:variant]:key` for a level of the active hierarchy (03 §5a). Widened
 * for the Sprints chain (decided 2026-10-07); build and read keys only through the hierarchy's codec.
 */
export type SceneKey = 'galaxy' | `${string}:${string}`;

/** The Backlog chain's scene keys (03 §5a), for tests that build them by hand. */
export type BacklogSceneKey =
  | 'galaxy'
  | `sector:${'area' | 'epic'}:${CanonicalKey}`
  | `feature:${CanonicalKey}`
  | `body:${CanonicalKey}`;

export type NodeKind =
  | 'galaxy' | 'sector' | 'star' | 'planet' | 'anomaly' | 'missionPoint' | 'station' | 'flight'
  | 'captain' | 'assignmentBeacon' | 'trayItem' | 'overflow'
  // v1 (14 §2.4): the solar board. Its ship stays 'captain', told apart by `asset: 'agent'`.
  | 'seat' | 'objective' | 'threat' | 'facility';
export type EdgeKind = 'orbit' | 'route' | 'routeContinuation' | 'dependency';

export interface ViewNode {
  projectionKey: string;
  canonicalKey: CanonicalKey;
  kind: NodeKind;
  role?: string;
  world: { x: number; y: number; r: number };
  /** Drawn smaller than its kind (an outer-ring station, 22 C11): its screen floor scales by this too. Unset: 1. */
  floorScale?: number;
  /** At most this many times its world size on screen, floor or not (a ring station keeps to its slot's room, 22 C11). */
  maxScale?: number;
  stage: string;
  seed: number;
  label: string;
  typeName?: string;
  rawState?: string;
  openable: boolean;
  /** Can be picked and listed (false for tiny decorative projections, e.g. mini planets in a sector). */
  selectable: boolean;
  /** Whether to draw a DOM callout label. */
  labelled: boolean;
  /** Secondary label line (e.g. `#201 · Resolved`, `PR 9001 · active`). */
  meta?: string;
  /** Third label line: the person behind the item — assignee for work items, author for PRs. */
  meta2?: string;
  /**
   * The inspector's line where it says more than the plate's `meta` (19 P1, Q11: a Solar pod star's
   * plate gives its path and item count, the inspector keeps the done count too). Unset: `meta`.
   */
  detail?: string;
  /**
   * Counts by role at the playhead (22 A3): a Solar pod star's objectives and threats, and how many
   * are done. The renderer words them in the Names toggle's register for the plate
   * (`12 asteroids · 4 hive ships`) and the inspector; `meta` stays a plain fallback.
   */
  roleCounts?: { objective: number; threat: number; done: number };
  /**
   * A Solar pod star's Features (B3, 15 §6 `feature-row`): every Feature with at least one of the pod's pieces under
   * it now, most pieces first (ties by Feature id). Text on the plate and in the Inspector only: no object is drawn
   * (INV-10). Present, possibly empty, on a pod star that has a Feature at any point of the loaded round (`featureLines`).
   */
  features?: FeatureTally[];
  /**
   * The lines the plate reserves for the Features row (B3, R4): the most the row needs at any point of the loaded round
   * (`min(1, Features ever)`: `+N more` shares the line, 27 B2), so stepping or seeking never changes the plate's height or flips its side.
   * Unset on a pod that never has a Feature: no row, no blank line (R9).
   */
  featureLines?: number;
  /** An Area Path's full path (22 A4): the inspector shows it; a Solar star's plate doesn't. */
  path?: string;
  /**
   * A circle at the label's left (06 §4), for any label: a picture (an inline data:image URL), or
   * initials on a color when there's no picture or it fails to load.
   */
  avatar?: { initials: string; color: number; image?: string };
  /** Scene to open when this node is activated (click, Enter). */
  zoomTo?: SceneKey;
  /** Preferred label side from the layout (06 §4); the label layer tries it first. */
  labelSide?: 'above' | 'below' | 'left' | 'right';
  /**
   * Label layout (06 §4): 'horizontal' tries left/right before above/below (economizes vertical
   * space); 'vertical' tries above/below before left/right.
   */
  labelLayout?: 'horizontal' | 'vertical';
  /**
   * The way the label stands out from its object, a unit vector in world axes (v1, 2026-10-12): a
   * label that points at its object (a pointer line to its rim) hangs out along it. Unset: `labelSide`.
   */
  labelDir?: { x: number; y: number };
  /** Always the compact label (the title), unless pointed at or selected: dense grids (galaxies), the region's star (v1.1). */
  labelCompact?: boolean;
  /**
   * Placed beside another node in *screen* terms (06 §2 sizing): the renderer puts it at
   * target + dir·(hit(target) + hit(self) + gap), so it never collides however far the camera zooms out.
   * `work`: the piece a ship rests by when it rests at that piece's planet, off its face (22 A9); its
   * idle work aims at it.
   */
  attach?: {
    to: string; dirX: number; dirY: number; work?: string;
    /**
     * Its loiter slot by its planet (22 D3), by arrival: the renderer lays it on the planet's loiter
     * ring (`ViewNode.loiterR`) at this slot, a ship's drawn length apart, and never moves it to make room.
     */
    loiter?: number;
  };
  /** A planet's loiter ring (22 D3): its captains rest on it, its name hangs just past it. World units from its centre. */
  loiterR?: number;
  /**
   * What the loiter ring clears at a far zoom (`loiterRingAt`): its outermost trophy shell's radius with
   * `trophies`, else the planet's rim. World units from its centre.
   */
  loiterWithin?: { r: number; trophies: boolean };
  /** A plate that hangs on its own ray only (22 D7: a piece's, outward from its planet): it never turns to find room. */
  labelFixed?: boolean;
  /**
   * A ship at home on its lane's track (the board, 06 §3, decided 2026-10-09): the renderer keeps it on
   * this orbit, sliding along it to the nearest spot clear of every body.
   */
  track?: { rx: number; ry: number; span: number };
  /**
   * Rides a route between two nodes (an in-flight PR). The renderer slides it to the first spot near
   * `t` that collides with nothing, in screen terms (06 §2 sizing).
   */
  along?: { from: string; to: string; t: number; normal: number; lane?: { y: number; halfHeight: number; x?: number } };
  // `lane`: the vessel stays in the horizontal band between the children and the station row (06 §3),
  // at the point where its route crosses the band, spreading sideways within it when crowded.
  /** Layout slot index, for map debug. */
  slot?: number;
  /**
   * A Task in a close-up's radar (06 §3): its spoke angle (fixed by slot order, INV-14) and the band
   * its displayed stage puts it in.
   */
  radar?: { angle: number; band: 'ready' | 'underway' | 'accomplished' };
  /** The label shows only on hover or selection (Ready and Accomplished Tasks in the radar, 06 §4). */
  labelOnHover?: boolean;
  /** A body's radar tally (06 §3), inner band first: a label line like "14 accomplished · 6 underway · 1 ready". */
  tally?: { band: 'ready' | 'underway' | 'accomplished'; count: number }[];
  /** `standby`: a facility on standby (19 M1, as `piece.standby`): its plate drops to the Place tier. */
  flags: { reopened?: boolean; uncertain?: boolean; stale?: boolean; selected?: boolean; quiet?: boolean; unexplored?: boolean; standby?: boolean };
  evidence: EvidenceRef[];
  // ---- v1 (14 §2.4): all optional, never set by v0 builders ----
  /**
   * The asset that draws it: a neutral role id the theme binds to its own asset (`'objective'`,
   * `'agent'`). Unset: the v0 switch on `kind`.
   */
  asset?: string;
  /** Its theme-neutral state; `stage` is `encodePiece(piece)`. */
  piece?: PieceState;
  /** A piece's steps (its children of role 'step', Off ones included), in slot order: the inspector lists them (19 L7). */
  stepKeys?: CanonicalKey[];
  /** A formation member: which formation, its place in it, and the formation's size. */
  cluster?: { id: string; index: number; size: number };
  /**
   * How lately anyone worked a piece (v1, 2026-10-12): 1 just now, halving every day of history since
   * the piece or one of its steps last changed, quantised to quarters (0 when quiet). The theme's
   * ambient effects (welding glints, idle beams) grow denser with it. A facility's is measured the same
   * way from its PRs' last event (19 M1). Never a measure of a person.
   */
  activity?: number;
  /** A finished piece's slot on its seat's trophy ring (13 §3, 22 D2): the seat, its role, and its place there. */
  platform?: { seat: string; role: 'objective' | 'threat'; index: number };
  /** A compound (a facility): its children in fixed slots, past the cap counted in `more`. */
  compound?: {
    slots: (CompoundSlot & { signal: Signal })[]; more: number;
    intensity: number; summoner: CanonicalKey | null; guards: number;
  };
}

/** v1 (14 §2.4): a piece's state with no theme in it, from which its stage string is encoded. */
export interface PieceState {
  role: Role | 'seat' | 'agent';
  signal: Signal;
  category: string;
  /** Children of role 'step', in slot order, at most 6: not started, active, completed. */
  steps?: ('n' | 'a' | 'c')[];
  /** A seat: its own share of Accomplished, 0..1, quantised to 0.05. */
  share?: number;
  /** A facility: how busy it is, and how many attachments are open. */
  intensity?: number;
  open?: number;
  /**
   * A facility (23 C6): which of its tender slots hold an open PR, one bit each (bit n is slot n, below the
   * compound cap), so a gap stays where it is. `open` still counts every open PR, the "+N" past the cap among them.
   */
  slots?: number;
  /**
   * A facility: how many PRs count as merged into it at the snapshot (03 §5d: the round's merges so
   * far, or its earlier merges when none fall in the round). Only written when above zero. A theme may mark the first merge (the Star Chart's stations take their second form on it).
   */
  merged?: number;
  /**
   * A facility on standby (19 M1): none of its attachments is open, and none has opened or settled for
   * long enough that its activity is under `STANDBY_BELOW`. Only written when true. A theme quiets it.
   */
  standby?: boolean;
  /**
   * A seat (23 C3): holds nothing at the playhead (its last piece has left, or none has come yet). Only
   * written when true. A theme dims the planet and turns its lights off; the planet stays (INV-14).
   */
  vacant?: boolean;
  /**
   * A vacant seat none of whose work has come yet this round (v1.4 B4; `seatReason` would say `later`, not `held`).
   * Only written with `vacant`. A theme plays first light when the seat's first piece arrives; a later return eases.
   */
  awaiting?: boolean;
}

/** v1: an expanded label listing a piece's children (12 §6), at most ROW_BUDGET rows. */
export interface MegaList {
  title: string; rows: MegaRow[]; more: number;
  /**
   * A station's pipeline line (B2): `text` is `Last run: passed · 2 h ago`, empty when the repository has no read run;
   * `state` picks the neutral dot. Present on every station's list, so the plate reserves the line's space from its first draw (R4).
   */
  run?: { text: string; state?: RunState };
}
export interface MegaRow {
  key: CanonicalKey; label: string; meta?: string; rung: Rung;
  /** What the row is, as a neutral role: the renderer names it in the chart's words after `meta` (22 B3). */
  role?: Role;
  /**
   * The pieces a row stands for when it isn't drawn itself (a facility's PR, 19 L6), in order: hovering
   * the row lights them all, and a press selects the first. Unset: the row is its own object.
   */
  serves?: CanonicalKey[];
  /**
   * A line under the row: the work a facility's PR serves (19 L6), or a container, with a read-only
   * link to it at the source when it has one (INV-21).
   */
  subtitle?: {
    label: string; url: string | null;
    /** The container's key, which main's allowlisted open takes. */
    key?: CanonicalKey;
  };
  /** A facility's PR: its stat line (votes, pushes, threads, size band), one quiet T3 line under the subtitle (B1). */
  stat?: string;
}

export interface ViewEdge {
  key: string;
  kind: EdgeKind;
  from: string;
  to: string;
  uncertain: boolean;
  evidence: EvidenceRef[];
  /**
   * Orbit edges carry their projected ellipse (centered on the parent). A radar Task's edge is its
   * band (06 §3); the band guides are drawn from `ViewGraph.radar`, so the edge marks the link only.
   */
  geometry?: { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; band?: boolean; arc?: { from: number; to: number } };
}

/**
 * The PR lane in screen terms (06 §3): the renderer and camera fit place the lane and the station row
 * below `childrenBottom` with at least these world offsets, and never less than a label's room above
 * and below each vessel on screen (sizing.laneRows).
 */
export interface LaneSpec {
  childrenBottom: number; laneOffset: number; stationOffset: number;
  /** Reserve a row above the lane for child labels that drop below their child (Feature systems). */
  childLabelRow?: boolean;
}

export interface ViewGraph {
  sceneKey: SceneKey;
  atUtc: UtcMs;
  layoutVersion: number;
  nodes: ViewNode[];
  edges: ViewEdge[];
  trays: { uncharted: CanonicalKey[]; unlinked: CanonicalKey[] };
  coverage: ScopeHistory['coverage'];
  lane?: LaneSpec;
  /** The Task radar of a body close-up (06 §3): three front-arc bands around the planet. */
  radar?: RadarSpec;
  /** A system laid out as a board (06 §3, decided 2026-10-09): its column ticks and lane heads. */
  board?: BoardSpec;
  /** v1: a solar region's fixed setup, for the guides (frontier belt, formation halos) and framing. */
  solar?: {
    star: { x: number; y: number }; seats: SeatSlot[]; frontier: SolarPlan['frontier']; formations: Formation[];
    /**
     * The pieces in the frontier belt at the playhead, by projection key, in key order (19 S2): the
     * belt is drawn only while one of them is.
     */
    unassigned: string[];
    /**
     * Every station's planned spot, in the plan's order (arrival, then key), drawn yet or not, so the
     * renderer's station pass keeps them clear of each other whoever is on the board (W4-T2), with its
     * ring (22 C11: an outer one settles inward first, staying inside the frontier belt).
     */
    stations?: { facility: CanonicalKey; x: number; y: number; mode?: 'inner' | 'outer'; size?: number }[];
  };
  /** v1: mega-labels, by projection key. */
  lists?: Record<string, MegaList>;
}

export interface BoardSpec {
  /** Every ring: its index and lane, ellipse radii around the centre, and its ends' half-span and depth. */
  rings: { index: number; lane: number; rx: number; ry: number; span: number; depth: number; track: { span: number; depth: number; rx: number; ry: number } }[];
  /** Column boundaries on the outer ring, with the orbit's outward normal there. */
  ticks: { x: number; y: number; nx: number; ny: number }[];
  /** Each lane's head, at its first ring's left end: whose lane it is (null is Unassigned). */
  heads: { x: number; y: number; people: (CanonicalKey | null)[]; name: string; avatars: NonNullable<ViewNode['avatar']>[] }[];
  /** B4: the team board's columns, left to right (a split column is one heading over its two halves), each with the place of its heading; absent without a team board (the four ladder columns, unlabelled). */
  columns?: { x: number; y: number; name: string; /** A split column: its heading carries Doing / Done sub-labels. */ split: boolean }[];
}

export interface RadarSpec {
  /** The planet's projection key, and its center. */
  center: string;
  cx: number;
  cy: number;
  /** Front arc, radians (y down): from the left end, through the front, to the right end. */
  arc: readonly [number, number];
  /** Inner to outer. `count`: Tasks in the band at the playhead. */
  bands: { band: 'ready' | 'underway' | 'accomplished'; rx: number; ry: number; count: number }[];
  /** Every Task ever linked (the spokes), for the accretion glow's share. */
  spokes: number;
}

// 14 §2 — the v1 engine's types, in one file so every later task compiles against final shapes.
// The engine knows roles, categories, rungs, signals, seats, rounds, regions and moves; never a
// pack's type or state names, and never a theme's words (the literal fence, tests/unit). Pure.
import type { AnyTimelineEvent, Priority } from '../contracts/events';
import type { Role, Rung, ScopeHistory, StateMapping, UtcRange } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import type { Snapshot } from '../contracts/view';
import type { EventLine } from '../playback/describe';
import type { EventParts } from './eventLine';

export type { MappedState, Role, Rung, StateMapping } from '../contracts/history';
export type { MegaList, MegaRow, PieceState } from '../contracts/view';

// ---- 2.2 Signals, pieces and moves ----

/** What a look needs to know about a piece's state (09): its rung, plus the off-ladder marks. */
export interface Signal {
  rung: Rung;
  /** Ready's first form: a wireframe on sensors. */
  sketch?: boolean;
  /** A sub-step within the rung (Nearing's gathering gold, for one). */
  step?: number;
  deferred?: boolean; ghost?: boolean; strike?: boolean;
  /** No mapping for the state (INV-11): neutral, with its raw name. */
  unknown?: boolean;
}

/** A piece as the engine sees it at one instant. `type` is opaque: a mapping lookup key only. */
export interface Piece {
  key: CanonicalKey; role: Role; type: string; title: string; category: string;
  signal: Signal; seat: CanonicalKey | null; parent: CanonicalKey | null; steps: CanonicalKey[];
  region: string | null; reopened: boolean;
}

/** Every event, normalised once. Maneuver rules and achievements read moves, never raw events. */
export type Move =
  | { m: 'appear'; key: CanonicalKey; role: Role; to: Signal; seat: CanonicalKey | null }
  | { m: 'climb'; key: CanonicalKey; role: Role; from: Signal; to: Signal; actor: CanonicalKey | null }
  | { m: 'reseat'; key: CanonicalKey; role: Role; from: CanonicalKey | null; to: CanonicalKey | null; actor: CanonicalKey | null }
  /** Round or region membership. */
  | { m: 'enter' | 'leave'; key: CanonicalKey; role: Role }
  | { m: 'bind' | 'unbind'; child: CanonicalKey; parent: CanonicalKey; rel: 'step' | 'container' | 'attachment' }
  | { m: 'attach'; key: CanonicalKey; facility: CanonicalKey; author: CanonicalKey | null }
  | { m: 'settle'; key: CanonicalKey; facility: CanonicalKey; to: Signal; approvers: CanonicalKey[]; actor: CanonicalKey | null }
  | { m: 'retitle'; key: CanonicalKey };

export type MoveKind = Move['m'];

/** A pack's reading of its own events: moves, and optionally its own priority and focus. */
export interface EventAdapter {
  id: string;
  /** Pure; reads the mapping and the bundle's entity facts only. */
  moves(h: ScopeHistory, e: AnyTimelineEvent): Move[];
  /** Optional overrides. Unset means the ingest-baked `e.priority` and v0 focus. */
  priority?(h: ScopeHistory, e: AnyTimelineEvent, mv: readonly Move[]): Priority;
  focusOf?(h: ScopeHistory, e: AnyTimelineEvent, s: Snapshot): CanonicalKey;
  describe(h: ScopeHistory, e: AnyTimelineEvent, mv: readonly Move[], t: Terminology): EventLine;
  /**
   * The event's line in parts (22 B4), in the source register's words: History's rows and the notes
   * in play. Unset: `eventParts` with the engine's words for an attachment's end.
   */
  event?(h: ScopeHistory, e: AnyTimelineEvent, t: Terminology): EventParts;
}

// ---- Terminology (12 §1): the words, in the chart or the source register ----

/** A word, one and many; `short` is the source's own abbreviation, where identity lines use it (`PR`, 22 B3). */
export interface Noun { one: string; many: string; short?: string }
export type Register = 'chart' | 'source';
export type LevelWord = 'workspace' | 'round' | 'region' | 'seat' | 'frontier';
export interface SourceWords {
  role: Partial<Record<Role, Noun>>;
  /** A person, as the one who acts (12 §3). Absent: the engine's word. */
  agent?: Noun;
  level: Record<LevelWord, Noun>;
  rung: Record<Rung, string>;
  /** The source's own name, for "Open in …". */
  source: string;
}
export interface Terminology {
  register: Register;
  noun(r: Role | 'agent', n?: number): string;
  /** A role's word as an identity line gives it: the source's abbreviation where it has one (`PR`), else `noun`. */
  short(r: Role): string;
  level(k: LevelWord): string;
  rung(r: Rung): string;
  typeName(type: string): string;
}

// ---- Domain packs ----

/** A pack's achievement and pacing thresholds (18 §5). SDLC: 3 working days, K = 2, a 12-hour day. */
export interface PackThresholds { swiftDays: number; wipK: number; dayHours: number }

export interface DomainPack {
  id: string;
  title: string;
  /** Fixture packs ship their own; SDLC reads config/state-mapping.json. */
  mapping?: StateMapping;
  words: SourceWords;
  adapter: EventAdapter;
  thresholds: PackThresholds;
  /** A read-only web link to a container at the source (INV-21), or null. */
  containerUrl?(h: ScopeHistory, key: CanonicalKey): string | null;
}

// ---- Round facts: the neutral board, precomputed over the loaded history ----

export interface Interval { from: UtcMs; to: UtcMs | null }

export interface PieceFacts {
  key: CanonicalKey; role: Role;
  member: Interval[];
  seatAt: { from: UtcMs; seat: CanonicalKey | null }[];
  signalAt: { from: UtcMs; signal: Signal }[];
  steps: CanonicalKey[]; parent: CanonicalKey | null;
  /** The parent over time, one entry per change (`parentAtTime` reads it). Absent: `parent` throughout. */
  parentAt?: { from: UtcMs; parent: CanonicalKey | null }[];
}

export interface AttachmentFacts {
  key: CanonicalKey; facility: CanonicalKey; author: CanonicalKey | null;
  open: Interval; links: CanonicalKey[]; approvers: CanonicalKey[];
  signalAt: { from: UtcMs; signal: Signal }[];
}

/** The input to the solar plan and to achievements. */
export interface RoundFacts {
  round: UtcRange;
  region: string;
  pieces: ReadonlyMap<CanonicalKey, PieceFacts>;
  /** Everyone who held an objective or threat in the region during the round, in first-join order. */
  seats: CanonicalKey[];
  attachments: ReadonlyMap<CanonicalKey, AttachmentFacts>;
  /** By event key. */
  moves: ReadonlyMap<string, Move[]>;
  /** When each event in `moves` happened, by event key. Absent on hand-built facts: nothing is dated. */
  at?: ReadonlyMap<string, UtcMs>;
  /**
   * Each facility's first merged attachment within the round (`firstMerges`): the merge that
   * transforms it on playback (2026-10-13; it was the first in the whole history). Absent on
   * hand-built facts: no merge is anyone's first.
   */
  firstMerge?: ReadonlyMap<CanonicalKey, CanonicalKey>;
  /** Each facility's attachments merged within the round, in merge order (`roundMerges`): what counts toward its form. */
  merges?: ReadonlyMap<CanonicalKey, readonly CanonicalKey[]>;
  /**
   * A whole round's facts may carry each of its regions' own, by region key (2026-10-13): a rule
   * about one region (a seat completing there, its last threat falling) reads the region its piece
   * is in, the same facts that region's scene is drawn from. Absent: the facts are one region.
   */
  regions?: ReadonlyMap<CanonicalKey, RoundFacts>;
  /**
   * The region whose scene these facts are planned for (22 C9 review): a rule about that scene (a
   * facility's first need, S-9) reads that region only. Set by `sceneFacts`; absent: any region.
   */
  scene?: CanonicalKey;
}

/** Facts for a round with nothing in it: the boot crutch's answer (17, W1-T5). */
export function emptyRoundFacts(round: UtcRange, region: string): RoundFacts {
  return { round, region, pieces: new Map(), seats: [], attachments: new Map(), moves: new Map() };
}

// ---- 2.3 Solar layout outputs (the fixed setup, 14 §4) ----

export interface SeatSlot {
  person: CanonicalKey; index: number; angle: number; rx: number; ry: number; x: number; y: number;
  /** Half the span (radians, either side of `angle`) of the orbit arc drawn through the planet. */
  arc: number;
  /** Its mandala (22 Block D): the slots round and on its planet, fixed for the round. */
  mandala?: SeatMandala;
}

/** A seat's mandala (22 D1–D3): what the renderer needs to lay its slots out at any scale. */
export interface SeatMandala {
  /** Its pieces' drawn radius on the planet (a busy planet's are smaller), and the room each slot has. */
  pieceR: number; room: number;
  /** Trophy slots (every piece that closes here in the round), and their shells' radii, counts and turns. */
  trophies: number; shells: { r: number; n: number; turn: number }[];
  /** The loiter ring's radius: the captains' (D3), past the trophy shells by one more trophy slot. */
  loiterR: number;
}

export interface PieceSlot {
  seat: CanonicalKey | 'frontier'; piece: CanonicalKey; mode: 'free' | 'formation' | 'frontier' | 'platform';
  x: number; y: number; r: number; formation?: string; index: number;
}

/**
 * A seat's pieces of one role, in its planet's region: `cx, cy` is the lattice centre both roles of a seat
 * share, `offsets` each member's cell from it (by arrival index), `outerR` the disc round the cells.
 */
export interface Formation {
  id: string; seat: CanonicalKey; role: 'objective' | 'threat';
  cx: number; cy: number; memberR: number; pitch: number; outerR: number;
  offsets: { x: number; y: number }[]; members: CanonicalKey[];
}

export interface CompoundSlot {
  key: CanonicalKey; role: 'attachment' | 'guard'; slot: number; angle: number; dist: number;
  from: UtcMs; to: UtcMs | null;
}

/** A facility's place (22 C11): on the inner ring (serving two or more seats, or none), or the outer (serving one). */
export interface StationSlot {
  facility: CanonicalKey; serves: CanonicalKey[]; mode: 'inner' | 'outer';
  /** Its drawn size against a facility's (22 C11): 1 on the inner ring, `OUTER_SIZE` on the outer. */
  size: number;
  x: number; y: number; enterAt: UtcMs; summoner: CanonicalKey | null; slots: CompoundSlot[]; cap: number;
}

export interface SolarPlan {
  version: number;
  star: { x: number; y: number; r: number };
  seats: SeatSlot[];
  /** By `${seat}|${piece}`. */
  slots: ReadonlyMap<string, PieceSlot>;
  /** A finished piece's platform in low orbit on its seat's lit edge, by `${seat}|${piece}` (13 §3, v4). */
  platforms: ReadonlyMap<string, PieceSlot>;
  formations: Formation[];
  frontier: { rx0: number; rx1: number; ry0: number; ry1: number };
  stations: StationSlot[];
}

// ---- 2.9 Achievements (18 §5) ----

export interface Award {
  id: string;
  earnedAt: { eventKey: string; atUtc: UtcMs };
  pieces: CanonicalKey[];
  reason: string;
}

export interface AchievementRule {
  id: string;
  /** The insignia's id. */
  shape: string;
  earn(f: RoundFacts, viewer: CanonicalKey, th: PackThresholds): Award | null;
}

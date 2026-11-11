// 14 §2.8 — a theme pack (v1): the one remix table. It says which asset draws each neutral role,
// which commands and maneuvers it adds or overrides, which guides it draws under the scene, and its
// chart-register words. Theme words live here and below; never in src/shared (12 §1).
import type { Graphics } from 'pixi.js';
import type { ViewGraph, PieceState } from '@shared/contracts/view';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { Move, SourceWords, Terminology } from '@shared/engine/types';
import type { AssetDef } from '../chart/assets/types';
import type { AmbientWork, CommandDef, Entrance, Finale, ManeuverDef } from '../chart/fx/types';

/** A drawing under the scene's objects, from the graph's fixed setup (the frontier belt, formation halos). */
export interface ThemeGuide {
  id: string;
  /** Draws into `g` (cleared by the caller); `px` is one screen pixel in world units. */
  draw(g: Graphics, graph: ViewGraph, px: number): void;
  /**
   * The nodes, by projection key, that keep it shown (19 S2); absent, it always shows. It shows while
   * one of them is drawn (in play, from its entrance to its departure), and fades in or out over
   * `GUIDE_FADE_MS` as they come and go; a seek snaps it to whether the list is empty (INV-15). Its
   * drawing stays laid out either way (INV-14).
   */
  shownBy?(graph: ViewGraph): readonly string[];
}

/** What the guided tour points at (23 E7): a kind of object on the Comet Pod chart, or the player. */
export type TourTarget = 'star' | 'seat' | 'objective' | 'threat' | 'facility' | 'agent' | 'player';
/** A step's title is the ADO word (R12), with the chart's word beside it as `alias` (drawn quieter); no alias when the two words agree. */
export interface TourStep { target: TourTarget; title: string; alias?: string; body: string }

/**
 * The theme's reading copy (23 E6, 14 §8): the "How to read the chart" prose, the guided tour's steps
 * and the `+N more` string. `c` is the chart register (the theme's own words), `s` the source register
 * (the loaded bundle's pack): a theme or pack swap rewrites the prose without touching the settings tab.
 */
export interface ReadCopy {
  /** The sentences of the "How to read the chart" paragraph. */
  paragraph(c: Terminology, s: Terminology): string[];
  /** The tour's steps, in order. */
  tour(c: Terminology, s: Terminology): TourStep[];
  /** The quiet button after a list's top rows: `+3 more`. */
  more(n: number): string;
  /** The same button when the list is open: `show fewer`. */
  fewer(): string;
}

export interface ThemePack {
  id: string;
  title: string;
  /** Neutral role → registered asset id. */
  roleAsset: Record<PieceState['role'], string>;
  assets: AssetDef[];
  commands: CommandDef[];
  maneuvers: ManeuverDef[];
  guides: ThemeGuide[];
  /** The chart register's words. */
  words: Partial<SourceWords>;
  /** The reading copy: how-to-read prose, the guided tour and `+N more` (23 E6). */
  readCopy: ReadCopy;
  /** What the chart shows for an event, in the theme's words (22 B4), beneath History's line; null for nothing drawn. */
  action?(h: ScopeHistory, e: AnyTimelineEvent, mv: readonly Move[], t: Terminology): string | null;
  /** How each object comes into the scene (2026-10-13): mid-episode, and quietly in the opening. */
  entrance?: Entrance;
  /** What captains at rest do with the work beside them (2026-10-12): faint, occasional, ornament. */
  ambient?: AmbientWork;
  /** The round's end (2026-10-13): played once when playback reaches the end of a round that's over. */
  finale?: Finale;
  /** A seat's own title (2026-10-12), stable over a loaded history; null keeps the person's name. */
  seatTitle?(h: ScopeHistory, person: CanonicalKey): string | null;
}

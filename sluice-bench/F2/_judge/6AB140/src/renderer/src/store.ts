import { create } from 'zustand';
import type { ScopeHistory } from '@shared/contracts/history';
import type { AreaFavorite, EpicSummary, IterationSummary, Paradigm, ProjectSummary, Scope, SyncLevel, SyncProgressMsg } from '@shared/contracts/ipc';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { NetError } from '@shared/contracts/neterror';
import type { Beat, Rate } from '@shared/contracts/playback';
import type { Lens, SceneKey, Snapshot, ViewGraph } from '@shared/contracts/view';
import type { CamState } from './chart/camera';
import { loadActivity } from './engagement';
import type { ActivityLevel } from '@shared/playback/engagement';

export interface NavEntry {
  sceneKey: SceneKey;
  scope?: Scope;
  label: string;
  /** ADO type shown beside the crumb ("Area Path", "Epic", "Feature", "User Story", "Bug"). */
  typeLabel?: string;
  /** Saved when leaving this level, restored on Back (AC-08). */
  camera?: CamState;
  selectedKey?: CanonicalKey;
  /** A sector holding only one Feature: shown in the breadcrumb, but entry and Back pass through it (06 §3). */
  passThrough?: boolean;
}

/** The playback session as the UI sees it (05 §2), refreshed a few times a second while playing. */
export interface PlaybackView {
  x: number;
  totalMs: number;
  status: 'paused' | 'playing' | 'ended';
  rate: Rate;
  /** The ruler's source time (moves through gaps) and the displayed state's source time. */
  rulerUtc: number;
  stateUtc: number;
  remainingMs: number;
  beats: Beat[];
  /** The latest beat at or before the playhead, or -1. */
  beatIndex: number;
}

interface ChartState {
  /** Fixture data or the connected ADO org (slice 4). */
  mode: 'fixture' | 'ado';
  /** Which hierarchy the chart walks (decided 2026-10-07): Solar (the v1 default, 14 §7), Sprints or Backlog. */
  paradigm: Paradigm;
  /** The Connect panel, behind the mode chip. */
  connectOpen: boolean;
  /** Where the Connect panel opens to: its project list (from "Add more projects"), or the top. */
  connectFocus: 'projects' | 'token' | null;
  /** ADO mode: a project entered with nothing saved yet opens its Area Path picker (decided 2026-10-07). */
  pickAreaFor: CanonicalKey | null;
  /** The sync in progress for the scope being opened (ADO mode), or null. */
  sync: (SyncProgressMsg & { label: string; level?: SyncLevel['kind']; projectKey?: string }) | null;
  /** Loaded by level (decided 2026-10-07): a scene's history being loaded on request, for the player. */
  /** `jobId: ''` is the moment between the click and the first progress event (23 B8): the widget says Starting…. */
  historyLoad: { jobId: string; days: number; done: number; total: number } | null;
  /**
   * The last history request that didn't finish (decided 2026-10-22), for the player to offer a retry:
   * the scene it was for, the days asked, and how it ended. Cleared when a request is made or lands.
   */
  /**
   * ADO refused the token where that stops the work (decided 2026-10-22; `refusesToken`): the sync or the
   * stream that was refused, or a call that threw. `family` is what was refused, when known. Cleared when a
   * new token is entered.
   */
  tokenRefused: { family: string | null; at: number } | null;
  historyAttempt: { sceneKey: string; days: number; outcome: 'failed' | 'cancelled' } | null;
  /** A quiet catch-up of scenes played before is running. */
  catchingUp: boolean;
  /** A sprint streaming in behind its first look (decided 2026-10-08): the work still queued. */
  stream: { pending: number; /** B6: what `pending` is out of, and whether that total is exact yet. */ total?: number; exact?: boolean } | null;
  /** The breadcrumb's + picker is open (decided 2026-10-08). */
  adding: boolean;
  /**
   * ADO couldn't be reached, so the chart is running from the cache (AC-31, decided 2026-10-09).
   * Cleared by the next read that gets through.
   */
  offline: boolean;
  /** A background refresh of the open scope is running (reopen, or the Refresh control). */
  refreshing: boolean;
  projects: ProjectSummary[];
  stack: NavEntry[];
  history: ScopeHistory | null;
  snapshot: Snapshot | null;
  graph: ViewGraph | null;
  /** The galaxy's chooser: saved Area Paths, and the Backlog's Epics or the Sprints' sprints. */
  chooser: { projectKey: CanonicalKey; favorites: AreaFavorite[]; epics: EpicSummary[]; sprints?: IterationSummary[] } | null;
  selectedKey: CanonicalKey | null;
  hoverKey: CanonicalKey | null;
  debug: boolean;
  keyOpen: boolean;
  /** The events the chart is playing now, by key (22 B6): their notes are on the plates, and History marks their rows. */
  nowPlaying: string[];
  error: string | null;
  /** The network details behind `error`, when it was a failed ADO call (decided 2026-10-07). */
  errorNet: NetError | null;
  /** Null until a scope's history is loaded. */
  playback: PlaybackView | null;
  lens: Lens;
  /** Reduced motion (05 §7): follows the OS setting unless toggled in the app. */
  reducedMotion: boolean;
  /** How much the ships do (05 §5): Calm, Lively or Maximum. */
  activity: ActivityLevel;
  /**
   * The side panel's top box (decided 2026-10-04): In view or History. `panelTab` is what shows;
   * `panelChoice` is the user's last manual pick. Play shows History; reaching the end returns to
   * the user's pick; pausing leaves it.
   */
  panelTab: 'inView' | 'history';
  panelChoice: 'inView' | 'history';
  /** Highlights (05 §3): play only the beats that touch the current view. */
  highlights: boolean;
  /** All events (23 D1): a larger schedule budget, so no beat's accent is cut. This session only; never saved. */
  allEvents: boolean;
  /** The keyboard-shortcut overlay (?). */
  helpOpen: boolean;
  /**
   * Following a captain (05 §6): the camera goes to the scene of each of their anchors. `suspended`
   * after the user's own pan, zoom, or navigation; `text` is the last anchor followed; `note` says the
   * next one is outside this view.
   */
  follow: { captain: CanonicalKey; callSign: string; suspended: boolean; text: string | null; note: string | null } | null;
  /** The frame-the-action camera (Z): on while playing; a manual pan or zoom suspends it. */
  framing: 'on' | 'suspended' | 'off';
  set: (patch: Partial<Omit<ChartState, 'set'>>) => void;
}

export const useChart = create<ChartState>((set) => ({
  mode: 'fixture',
  paradigm: 'solar',
  connectOpen: false,
  connectFocus: null,
  pickAreaFor: null,
  sync: null,
  historyLoad: null,
  historyAttempt: null,
  tokenRefused: null,
  catchingUp: false,
  stream: null,
  adding: false,
  offline: false,
  refreshing: false,
  projects: [],
  stack: [],
  history: null,
  snapshot: null,
  graph: null,
  chooser: null,
  selectedKey: null,
  hoverKey: null,
  debug: false,
  keyOpen: false,
  nowPlaying: [],
  error: null,
  errorNet: null,
  playback: null,
  lens: 'knownThen',
  activity: loadActivity(),
  reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  panelTab: 'inView',
  panelChoice: 'inView',
  highlights: false,
  allEvents: false,
  helpOpen: false,
  follow: null,
  framing: 'on',
  set: (patch) => set(patch),
}));

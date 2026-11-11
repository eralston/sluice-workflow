// 03 §4 — the main -> renderer bundle.
import type { AnyTimelineEvent, Observation } from './events';
import type { CanonicalKey, OrgKey, UtcMs } from './keys';
import type { BoardColumnFact, PrStats, RepoRun } from './facts';

export type SectorRef =
  | { kind: 'area'; areaKey: CanonicalKey; path: string }
  | { kind: 'epic'; epicKey: CanonicalKey }
  | SprintSector;

/** A pod (Sprints mode): a saved Area Path whose items, and its sub-paths' items, it gathers. */
export interface SprintPod { areaKey: CanonicalKey; path: string; label: string }

/**
 * A sprint (decided 2026-10-07): an iteration with dates, seen through the chosen pods. Its members
 * are the Stories and Bugs that were in the sprint at any moment between its start and finish, in
 * one of the pods, with their Tasks; its dates are the playback range.
 */
export interface SprintSector {
  kind: 'sprint'; iterationKey: CanonicalKey; path: string; startUtc: UtcMs; finishUtc: UtcMs; pods: SprintPod[];
}

export interface Scope {
  projectKey: CanonicalKey;
  sector: SectorRef;
}

export interface UtcRange {
  startUtc: UtcMs;
  endUtc: UtcMs;
}

export type WorkKind = 'epic' | 'feature' | 'story' | 'bug' | 'task';

/**
 * v1 (14 §2.1): what a piece is for on the board, whatever its pack calls it. Each mapped type
 * declares one; read it through `resolveRole`, never from the type name.
 */
export type Role = 'objective' | 'threat' | 'step' | 'container' | 'facility' | 'attachment' | 'guard';
/** v1: the step on the signal ladder (09), stored in the mapping rather than parsed from stage names. */
export type Rung = 'ready' | 'underway' | 'nearing' | 'accomplished' | 'off';

/** One raw state's meaning. v0's category and stage stay required, so v0 code reads the same mapping unchanged. */
export interface MappedState {
  category: string;
  stage: string;
  /** v1 signal fields (14 §2.1), all optional: absent, the engine falls back to v0's reading of `stage`. */
  rung?: Rung; sketch?: boolean; step?: number; deferred?: boolean; ghost?: boolean; strike?: boolean;
}

export interface StateMapping {
  version: number;
  unknownStage: string;
  types: Record<string, { kind: WorkKind; role?: Role; states: Record<string, MappedState> }>;
  /** v1: non-work-item pieces. SDLC: repo → facility, PR → attachment. */
  entities?: {
    facility?: { noun?: string };
    attachment?: { states: Partial<Record<'active' | 'completed' | 'abandoned', MappedState>> };
  };
}

/**
 * Current state (decided 2026-10-07: current state first, history only when asked). What ADO says
 * now about items and PRs whose history isn't loaded: replay starts from it, and events (for entities
 * with history) apply on top. The seeded "initial" snapshot 03 §4 set aside for scale-up.
 */
export interface CurrentWorkItem {
  key: CanonicalKey; type: string; title: string; state: string; areaPath: string;
  assigneeKey: CanonicalKey | null; createdAt: UtcMs; changedAt: UtcMs;
  /** Its sprint, when it has one. */
  iterationPath?: string;
}
export interface CurrentPr {
  key: CanonicalKey; repoKey: CanonicalKey; title: string; status: 'active' | 'completed' | 'abandoned';
  authorKey: CanonicalKey | null; createdAt: UtcMs; closedAt: UtcMs | null;
}
export interface CurrentState {
  at: UtcMs;
  workItems: CurrentWorkItem[];
  prs: CurrentPr[];
  links: { kind: 'parent' | 'dependency' | 'pr'; fromKey: CanonicalKey; toKey: CanonicalKey }[];
}

/** Something a sync couldn't read (slice 7): a PR or a repo, with the status ADO gave (0: no response). */
export interface MissingThing { kind: 'pr' | 'repo'; key: CanonicalKey; status: number; seen: boolean }

/** A work item entering a board column (B4): its column from `at` until its next placement. `column: ''` is off the board. */
export interface BoardPlacement { key: CanonicalKey; at: UtcMs; column: string; done: boolean }

/**
 * The team's board (B4, 03 §3): its columns in order and each item's column over time, from
 * `System.BoardColumn`. Present only when the scope's team board was read; the v0 board lays work out in
 * these columns (06 §3), and Solar never reads it. Absent: work is placed by state, as before.
 */
export interface ScopeBoard { columns: BoardColumnFact[]; placements: BoardPlacement[] }

export interface ScopeHistory {
  schemaVersion: 1;
  derivationVersion: number;
  scope: { orgKey: OrgKey; projectKey: CanonicalKey; sector: SectorRef };
  range: UtcRange;
  coverage: {
    syncedAt: UtcMs | null; historyFrom: UtcMs; partial: boolean; notes: string[];
    /** Entities whose history is loaded. Absent: every entity's is (fixtures, full syncs). */
    history?: CanonicalKey[];
    /**
     * Entities ADO wouldn't give us this time (403 or 404 after we'd seen them): their last known
     * facts are kept and shown, marked stale (02 §3; decided 2026-10-09). Scope-level age is
     * `syncedAt`; this says which objects in particular are older than that.
     */
    stale?: CanonicalKey[];
    /**
     * PRs and repos that couldn't be read on the last sync (slice 7, decided 2026-10-10), for the
     * coverage panel. `seen`: read before, so its last known facts are drawn (and it's in `stale`);
     * otherwise it isn't on the chart at all. The next sync asks for each again.
     */
    missing?: MissingThing[];
    /** Features whose subtrees are loaded (current state at least). Absent: all of them. */
    explored?: CanonicalKey[];
    /** Where more can be loaded (Load more): the team's older Features, and Features with older children. */
    more?: { team: boolean; features: CanonicalKey[] };
    /** Scenes whose history was loaded on request, with the days asked for ('team' or a Feature's key). */
    played?: { scene: 'team' | CanonicalKey; days: number; at: UtcMs;
      /** B7: items whose history couldn't be read this time (a 5xx or a timeout); Retry asks for these only. */
      missing?: CanonicalKey[];
      /** B7: the revisions feed stopped at its page cap (04 §5c); the next load resumes it. */
      capped?: true }[];
  };
  entities: {
    projects: { key: CanonicalKey; name: string; adoUrl: string }[];
    workItems: { key: CanonicalKey; type: string; adoUrl: string }[];
    /** `run` (B2): the latest pipeline run on the repository's default branch, as of the last read; absent: none, or not read. */
    repos: { key: CanonicalKey; name: string; adoUrl: string; run?: RepoRun & { readAt?: UtcMs } }[];
    prs: { key: CanonicalKey; repoKey: CanonicalKey; adoUrl: string; /** B1: the plate's stat line; absent when none was read. */ stats?: PrStats }[];
    /** `avatar`: the person's ADO picture as an inline data:image URL, when they uploaded one (06 §4). */
    /** `handAdded`: that picture is one the user added by hand (slice 6), so it can be changed or removed. */
    captains: { key: CanonicalKey; displayName: string; shipSeed: number; callSign: string; avatar?: string; handAdded?: boolean }[];
    /** Unexplored Features' children by kind, from their current links (for their miniatures). */
    childCounts?: { key: CanonicalKey; stories: number; bugs: number }[];
  };
  /** State as of `current.at` for entities without history (see CurrentState). */
  current?: CurrentState;
  events: AnyTimelineEvent[];
  observations: Observation[];
  unlinkedPrs: CanonicalKey[];
  stateMapping: StateMapping;
  /** B4: the team's board columns and where each item sat in them; absent when none was read. */
  board?: ScopeBoard;
  /**
   * v1: the domain pack that reads this bundle (`/^[a-z][a-z0-9-]{0,39}$/`). Omitted means 'sdlc':
   * SDLC bundles always omit it, on both sides, so AC-27 (fixture ↔ fake ADO) stays equal.
   */
  domainPack?: string;
}

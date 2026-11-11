// 03 §2 — source facts: normalized projections of ADO responses, the only thing persisted (never
// whole payloads: INV-16, INV-18). Pure types, shared by the main process (sync, DB) and the pure
// derivation in src/shared/ingest.
import type { Guid, UtcMs } from './keys';

export interface IdentityRefFact { id: Guid; displayName: string; uniqueName?: string; imageUrl?: string }

export interface RevisionFact {                   // one per work-item revision
  itemId: number; rev: number; changedAt: UtcMs;   // System.ChangedDate
  type: string; title: string; state: string; areaPath: string;
  /** System.IterationPath (its sprint). Absent in revisions cached before 2026-10-07. */
  iterationPath?: string;
  assignedTo: IdentityRefFact | null; projectId: Guid;
  /** System.ChangedBy (slice 3a): the actor; unknown means absent, never the assignee (04 §4). */
  changedBy: IdentityRefFact | null;
  /**
   * System.BoardColumn (B4): the column of the team board this item sat in at this revision. Absent for
   * an item not on a board, and in revisions cached before 2026-10-27 (migration 007 re-reads them).
   */
  boardColumn?: string;
  /** System.BoardColumnDone (B4): in the Done half of a split column. Kept only when true. */
  boardColumnDone?: true;
  /**
   * A seeded revision (B5, 04 §5c): the item's current fields stored as rev 1 at its creation time, standing in for
   * history the revisions feed's window did not cover. Replaced by the real rev 1 the next time the item is read whole.
   */
  seed?: true;
}

/** One column of a team's board (B4; `GET …/work/boards/{board}/columns`), in the board's order. */
export interface BoardColumnFact {
  name: string;
  /** `incoming` (the first column), `inProgress`, `outgoing` (the last). */
  type: 'incoming' | 'inProgress' | 'outgoing';
  /** A split column has a Doing half and a Done half. */
  split: boolean;
}

export type RelationTarget =
  | { kind: 'wi'; id: number }
  | { kind: 'pr'; projectId: Guid; repoId: Guid; prId: number }
  | { kind: 'other'; url: string };                // commits, branches, hyperlinks: kept but ignored

export interface RelationFact {
  rel: 'parent' | 'child' | 'predecessor' | 'successor' | 'pr' | 'other';
  rawRel: string; target: RelationTarget;
}

export interface UpdateFact {                     // one per work-item update
  itemId: number; updateId: number; rev: number | null;
  sourceAt: UtcMs | null;                          // see 04 §4. null => undated
  added: RelationFact[]; removed: RelationFact[];
}

/**
 * Reviewers' current votes on a PR, counted by kind (B1; 04 §6a-1). Only nonzero counts are kept, and
 * `votes` is absent when nobody has voted. 10 approved, 5 approved with suggestions, -5 waiting for the
 * author, -10 rejected; 0 is no vote. Current votes only: no history, and never an event (INV-07).
 */
export interface PrVotes { approved?: number; suggestions?: number; waiting?: number; rejected?: number }

/**
 * What the station plate's PR stat line shows (B1, 15 §6 `pr-stat`). Every field is optional: a call that
 * failed or was refused leaves its fact out, and the line shows what it has. Volume, never merit (INV-19).
 */
export interface PrStats {
  votes?: PrVotes;
  /** Iterations of the PR (`/iterations`): one per push. */
  pushes?: number;
  /** Threads a person started: system and deleted threads are not counted. */
  threads?: number;
  /** Files changed in the last iteration (`/iterations/{last}/changes`). */
  files?: number;
}

export interface PullRequestFact {
  projectId: Guid; repoId: Guid; prId: number; title: string;
  status: 'active' | 'completed' | 'abandoned';
  createdAt: UtcMs; closedAt: UtcMs | null; author: IdentityRefFact | null;
  /** Who completed or abandoned it (04 §4), when ADO says. */
  closedBy: IdentityRefFact | null;
  targetRef: string; adoUrl: string;
  /** The source branch's last commit (`lastMergeSourceCommit`), when ADO says: a push moves it (B1: skips re-reading iterations and changes). */
  lastCommit?: string;
  /** Read beside the record (B1): kept in its own column, so a re-read of the record never loses it. */
  stats?: PrStats;
}

/**
 * The result of a repository's latest pipeline run on its default branch (B2, 15 §6 `run-line`), in the
 * chart's neutral words. Partially succeeded and canceled are their own honest words; a run still going is
 * `running`, one waiting for an agent `queued`.
 */
export type RunState = 'passed' | 'partly' | 'failed' | 'canceled' | 'running' | 'queued';
/** A run: its result, and when it finished (when it started, for one still going). */
export interface RepoRun { state: RunState; at: UtcMs }

export interface RepoFact {
  projectId: Guid; repoId: Guid; name: string; adoUrl: string;
  /** The default branch's full ref (`refs/heads/main`), when ADO says (an empty repo has none). The run is read on it. */
  defaultBranch?: string;
  /** B2: the latest run on the default branch, read beside the record (own column). Absent: no pipeline has run, or not read yet (see `runReadAt`). */
  run?: RepoRun;
  /** B2: when the run was last read (the clock); absent: never. Cache only. */
  runReadAt?: UtcMs;
}
export interface ProjectFact { projectId: Guid; name: string; adoUrl: string }
export interface AreaNodeFact { projectId: Guid; nodeId: number; path: string; hasChildren: boolean }
/** An iteration in the project's tree (decided 2026-10-07): a sprint when it has dates. Paths as work items carry them. */
export interface IterationNodeFact { projectId: Guid; nodeId: number; path: string; startUtc: UtcMs | null; finishUtc: UtcMs | null }

/** An item as ADO says it is now (hydrate's fields), for current state without history (decided 2026-10-07). */
export interface CurrentItemFact {
  itemId: number; projectId: Guid; type: string; title: string; state: string; areaPath: string;
  iterationPath?: string;
  assignedTo: IdentityRefFact | null; createdAt: UtcMs; changedAt: UtcMs;
}

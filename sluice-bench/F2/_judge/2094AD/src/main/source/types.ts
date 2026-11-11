// The data source behind the chart (decided 2026-10-07): fixtures in memory, or an ADO org through
// the cache. IPC handlers ask the active source; neither the handlers nor the renderer branch on which.
import type { ScopeHistory } from '@shared/contracts/history';
import type { AreaFavorite, AreaNodeView, EpicSummary, IterationSummary, ProjectSummary, Range, Scope, SyncLevel } from '@shared/contracts/ipc';
import type { SourceCaps, SourceMode } from '@shared/contracts/source';

export interface ChartSource {
  readonly mode: SourceMode;
  readonly caps: SourceCaps;
  range(): Range;
  /** `cacheOnly`: from the cache, without asking ADO (an offline start, AC-31). Fixtures have no other kind. */
  projects(cacheOnly?: boolean): Promise<ProjectSummary[]> | ProjectSummary[];
  recentProjects(): Promise<ProjectSummary[]> | ProjectSummary[];
  favorites(projectKey: string): Promise<AreaFavorite[]> | AreaFavorite[];
  epics(projectKey: string): Promise<EpicSummary[]> | EpicSummary[];
  searchEpics(projectKey: string, text: string): Promise<EpicSummary[]> | EpicSummary[];
  areaTree(projectKey: string): Promise<AreaNodeView[]>;
  /** A project's sprints that have started, newest first (Sprints mode, decided 2026-10-07). */
  iterations(projectKey: string): Promise<IterationSummary[]> | IterationSummary[];
  startSync(scope: Scope, range: Range, level?: SyncLevel): { jobId: string };
  /** Where the user is looking in a streaming scope (decided 2026-10-08). */
  focus(scope: Scope, sceneKey: string): Promise<void>;
  load(scope: Scope, range: Range): ScopeHistory;
  openInAdo(key: string): Promise<void>;
}

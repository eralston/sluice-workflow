// The renderer's side of a hierarchy (decided 2026-10-07): the choices it makes that need the data
// source (which scope a project opens on, the scope level's ▾ menu). Scenes, layouts, and vocabulary
// are in the shared hierarchy.
import type { Hierarchy } from '@shared/hierarchy/types';
import type { GalaxyMeta } from '@shared/scene/project/galaxy';
import type { KindPlates } from '../chart/holo/holoLabel';
import type { Scope, AreaFavorite } from '@shared/contracts/ipc';
import type { NavEntry } from '../store';

/** Which lists the galaxy's project plate offers (decided 2026-10-07): sprints and pods, or saved Area Paths and Epics. */
export type ChooserKind = 'sprints' | 'backlog';

export interface ScopeChoice { scope: Scope; label: string }

/** An entry in the scope level's ▾ menu. */
export interface ScopeSibling extends ScopeChoice {
  key: string;
  meta?: string;
  /** Section heading inside the menu, e.g. "◇ Saved Area Paths". */
  group?: string;
  current: boolean;
}

export interface HierarchyUi {
  hierarchy: Hierarchy;
  /**
   * v1 (14 §1.4): the project plate's lists, so nav and the Inspector ask the hierarchy rather than
   * the paradigm. The registry fills it in for the v0 hierarchies, which predate it.
   */
  chooser?: ChooserKind;
  /**
   * v1.1 (19 R1): holo plates for the nodes with no asset (galaxies, stars), by level and kind. Absent:
   * they keep the standard navy plate (the v0 views).
   */
  plates?: KindPlates;
  /** What a galaxy's subtitle says (19 L3): `counts` drops v0's leading "Project". Absent: v0's full line. */
  galaxyMeta?: GalaxyMeta;
  /** The scope a project opens on when none is remembered; 'pick' to choose one (an empty project); null for none. */
  defaultScope(projectKey: Scope['projectKey']): Promise<ScopeChoice | 'pick' | null>;
  /** The scope level's ▾ menu: the other scopes in its project. */
  scopeSiblings(entry: NavEntry & { scope: Scope }): Promise<ScopeSibling[]>;
  /**
   * The open scope after the project's saved Area Paths change (decided 2026-10-08), when they're part
   * of it (a sprint's pods): it changes in place. Absent: they're siblings, not members (Backlog).
   */
  rescope?(scope: Scope, favorites: AreaFavorite[]): Scope | null;
}

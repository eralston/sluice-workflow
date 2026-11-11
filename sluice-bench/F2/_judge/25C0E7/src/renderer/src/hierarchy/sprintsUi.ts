// The Sprints hierarchy's choices (decided 2026-10-07): a project opens on its current sprint (else the
// most recent one), seen through its saved Area Paths as pods. With no saved area, an ADO project
// offers its area tree; the sprint's ▾ lists the project's sprints, newest first.
import type { AreaFavorite, IterationSummary, Scope } from '@shared/contracts/ipc';
import type { CanonicalKey } from '@shared/contracts/keys';
import { SPRINTS } from '@shared/hierarchy/sprints';
import { caps } from '../data/caps';
import type { HierarchyUi, ScopeChoice, ScopeSibling } from './types';

const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
/** "Sep 14 – Sep 27": the last day shown is the day before the (exclusive) finish. */
export const sprintDates = (s: IterationSummary): string => `${fmt.format(s.startUtc)} – ${fmt.format(s.finishUtc - 1)}`;

/**
 * The sprint scope for an iteration, through the project's saved Area Paths: only the pods whose team
 * runs that sprint, when ADO says (slice 7, decided 2026-10-10: teams on their own cadences).
 */
export function sprintScope(projectKey: CanonicalKey, sprint: IterationSummary, favorites: AreaFavorite[]): Scope {
  const runs = sprint.pods ? new Set<string>(sprint.pods) : null;
  const pods = [...favorites].filter((f) => !f.unavailable && (!runs || runs.has(f.areaKey))).sort((a, b) => a.displayOrder - b.displayOrder)
    .map((f) => ({ areaKey: f.areaKey, path: f.path, label: f.label }));
  return { projectKey, sector: { kind: 'sprint', iterationKey: sprint.key, path: sprint.path, startUtc: sprint.startUtc, finishUtc: sprint.finishUtc, pods } };
}

/** The sprint to open on: the one running now, else the most recent (the list is newest first). */
export function currentSprint(sprints: IterationSummary[], now = Date.now()): IterationSummary | undefined {
  return sprints.find((s) => s.startUtc <= now && now < s.finishUtc) ?? sprints[0];
}

export const sprintsUi: HierarchyUi = {
  hierarchy: SPRINTS,
  async defaultScope(projectKey) {
    const [favorites, sprints] = await Promise.all([window.starChart.favorites.list(projectKey), window.starChart.iterations.list(projectKey)]);
    if (!favorites.some((f) => !f.unavailable)) return caps().areaTree ? 'pick' : null;
    const range = await window.starChart.history.range();
    const sprint = currentSprint(sprints, range.endUtc - 1);
    if (!sprint) return null;
    return { scope: sprintScope(projectKey, sprint, favorites), label: sprint.label } satisfies ScopeChoice;
  },
  async scopeSiblings(entry) {
    const projectKey = entry.scope.projectKey;
    const [favorites, sprints] = await Promise.all([window.starChart.favorites.list(projectKey), window.starChart.iterations.list(projectKey)]);
    const now = entry.scope.sector.kind === 'sprint' ? entry.scope.sector.iterationKey : null;
    return sprints.map((s): ScopeSibling => ({
      key: s.key, label: s.label, meta: sprintDates(s), group: '◷ Sprints', current: s.key === now, scope: sprintScope(projectKey, s, favorites),
    }));
  },
  // The pods are the saved Area Paths: adding or removing one changes the open sprint in place.
  rescope(scope, favorites) {
    const sp = scope.sector;
    if (sp.kind !== 'sprint') return null;
    return sprintScope(scope.projectKey, { key: sp.iterationKey, path: sp.path, label: '', startUtc: sp.startUtc, finishUtc: sp.finishUtc }, favorites);
  },
};

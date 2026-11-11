// The Backlog hierarchy's choices (06 §3): a project opens on its first saved Area Path, else its
// first Epic; with neither, an ADO project offers its area tree. The sector's ▾ lists both.
import { BACKLOG } from '@shared/hierarchy/backlog';
import { caps } from '../data/caps';
import type { HierarchyUi, ScopeSibling } from './types';

export const backlogUi: HierarchyUi = {
  hierarchy: BACKLOG,
  async defaultScope(projectKey) {
    const favorites = await window.starChart.favorites.list(projectKey);
    const fav = [...favorites].sort((a, b) => a.displayOrder - b.displayOrder).find((f) => !f.unavailable);
    if (fav) return { scope: { projectKey: fav.projectKey, sector: { kind: 'area', areaKey: fav.areaKey, path: fav.path } }, label: fav.label };
    // Only without a saved area are Epics needed (they're the slow lookup).
    const epics = await window.starChart.epics.list(projectKey).catch(() => []);
    const epic = epics[0];
    if (epic) return { scope: { projectKey, sector: { kind: 'epic', epicKey: epic.key } }, label: epic.title };
    return caps().areaTree ? 'pick' : null;
  },
  async scopeSiblings(entry) {
    const projectKey = entry.scope.projectKey;
    const [favorites, epics] = await Promise.all([window.starChart.favorites.list(projectKey), window.starChart.epics.list(projectKey)]);
    const out: ScopeSibling[] = [];
    for (const f of [...favorites].sort((a, b) => a.displayOrder - b.displayOrder)) {
      const current = entry.scope.sector.kind === 'area' && entry.scope.sector.areaKey === f.areaKey;
      out.push({ key: f.areaKey, label: f.label, meta: f.path, group: '◇ Saved Area Paths', current, scope: { projectKey, sector: { kind: 'area', areaKey: f.areaKey, path: f.path } } });
    }
    for (const e of epics) {
      const current = entry.scope.sector.kind === 'epic' && entry.scope.sector.epicKey === e.key;
      out.push({ key: e.key, label: e.title, meta: `#${e.id} · ${e.featureCount} Features`, group: '⬡ Epics', current, scope: { projectKey, sector: { kind: 'epic', epicKey: e.key } } });
    }
    return out;
  },
};

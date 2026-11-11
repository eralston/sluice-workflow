// Breadcrumb sibling menus (06 §4): what each crumb's ▾ lists, and where each choice goes. Split out
// of nav.ts (2026-10-10, no behaviour change).
import { activeHierarchy, activeUi } from './hierarchy';
import { useChart } from './store';
import { caps } from './data/caps';
import { levelIdOf } from '@shared/hierarchy/sceneKey';
import type { CrumbLevel } from '@shared/hierarchy/crumbs';
import { graphFor, openProject, openSector, removeArea, unpinProject, scopeEntryOf, switchEntry } from './nav';

export interface Sibling {
  key: string;
  label: string;
  /** Section heading inside the menu, e.g. "Saved Area Paths" or "Epics". */
  group?: string;
  /** Secondary text, e.g. "#104 · Active". */
  meta?: string;
  current: boolean;
  /** A member of a set you choose (decided 2026-10-08): shown with a check, and choosing it removes it. */
  checked?: boolean;
  go(): void;
}

/** Siblings of a breadcrumb level, for its ▾ menu: same parent, same kind of thing. */
export async function siblingsOf(level: CrumbLevel): Promise<Sibling[]> {
  const st = useChart.getState();
  const sectorEntry = scopeEntryOf(st.stack);
  if (level.kind === 'project') {
    const current = sectorEntry?.scope?.projectKey;
    return st.projects.map((p) => ({
      key: p.key, label: p.name, meta: `${p.favoriteCount} saved area${p.favoriteCount === 1 ? '' : 's'}`, current: p.key === current,
      go: () => { if (p.key !== current) void openProject(p.key, 1); },
    }));
  }
  const entry = st.stack[level.index];
  const adding = { key: 'add', group: '', current: false, go: () => st.set({ adding: true }) };
  // All projects (ADO mode): the pinned set, to unpin from; and Add (decided 2026-10-08).
  if (level.index === 0 && caps().areaTree) {
    if (st.projects.length < 1) return [];
    return [
      ...st.projects.map((p) => ({ key: p.key, label: p.name, group: '◎ Projects in the chart', current: false, checked: true, go: () => void unpinProject(p.key) })),
      { ...adding, label: '+ Add a project…' },
    ];
  }
  if (!entry?.scope) return [];
  if (activeHierarchy().resolve(entry.sceneKey)?.index === 0) {
    const scoped = { ...entry, scope: entry.scope };
    const out: Sibling[] = (await activeUi().scopeSiblings(scoped)).map(({ scope, ...sib }) => ({
      ...sib, go: () => { if (!sib.current) void openSector(scope, sib.label, level.index); },
    }));
    // A sprint's pods are a set you choose: remove one here, or add one.
    const sector = entry.scope.sector;
    if (sector.kind === 'sprint' && caps().areaTree) {
      const projectKey = entry.scope.projectKey;
      for (const p of sector.pods) out.push({ key: p.areaKey, label: p.label, group: '◇ Pods · saved Area Paths', current: false, checked: true, go: () => void removeArea(projectKey, p.areaKey) });
      out.push({ ...adding, label: '+ Add an Area Path…' });
    }
    return out;
  }
  // Deeper levels: siblings are the parent scene's nodes that open a scene of this level.
  const parent = st.stack[level.index - 1];
  if (!parent) return [];
  const { graph } = graphFor(parent);
  const levelId = levelIdOf(entry.sceneKey);
  return graph.nodes
    .filter((n) => n.zoomTo && levelIdOf(n.zoomTo) === levelId)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
    .map((n) => ({
      key: n.canonicalKey, label: n.label, meta: n.meta, current: n.zoomTo === entry.sceneKey,
      go: () => { if (n.zoomTo !== entry.sceneKey) switchEntry(level.index, n); },
    }));
}

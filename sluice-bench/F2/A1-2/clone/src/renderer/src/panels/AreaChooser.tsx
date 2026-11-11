// The empty project (decided 2026-10-07): entering a project with no saved Area Paths opens this
// plate over the galaxy. Its Area Paths, A–Z, each with a checkbox that saves (or removes) it at
// once; the call to action opens the first saved one once at least one is.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AreaFavorite, AreaNodeView } from '@shared/contracts/ipc';
import type { CanonicalKey } from '@shared/contracts/keys';
import { loadChooser, openProject, refreshProjects } from '../nav';
import { SOURCE_CAPS } from '@shared/contracts/source';
import { useChart } from '../store';
import { warn } from '../devlog';
import { Busy } from './Busy';

export function AreaChooser() {
  const projectKey = useChart((s) => (SOURCE_CAPS[s.mode].areaTree && s.stack.length === 1 ? s.pickAreaFor : null));
  const projectName = useChart((s) => s.projects.find((p) => p.key === s.pickAreaFor)?.name ?? 'this project');
  const [nodes, setNodes] = useState<AreaNodeView[] | null>(null);
  const [saved, setSaved] = useState<AreaFavorite[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const plateRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!projectKey) return;
    let live = true;
    setNodes(null);
    setFilter('');
    setError(null);
    void Promise.all([window.starChart.areas.tree(projectKey), window.starChart.favorites.list(projectKey)]).then(([tree, favs]) => {
      if (!live) return;
      setNodes(tree);
      setSaved(favs);
      window.setTimeout(() => plateRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(), 0);
    }, () => { warn('area-tree-failed', { key: projectKey }); if (live) setError('Couldn’t read this project’s Area Paths.'); });
    // The tree comes from the cache at once; when the background refresh finds a change, apply it.
    const off = window.starChart.onChooserChanged((e) => {
      if (e.projectKey !== projectKey || e.what !== 'areas') return;
      void Promise.all([window.starChart.areas.tree(projectKey), window.starChart.favorites.list(projectKey)]).then(([tree, favs]) => {
        if (live) { setNodes(tree); setSaved(favs); }
      }, () => undefined);
    });
    return () => { live = false; off(); };
  }, [projectKey]);

  const close = () => {
    const key = useChart.getState().pickAreaFor;
    useChart.getState().set({ pickAreaFor: null });
    if (key) { void loadChooser(key as CanonicalKey); void refreshProjects(); }
  };
  useEffect(() => {
    if (!projectKey) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [projectKey]);

  const rows = useMemo(() => {
    const t = filter.trim().toLowerCase();
    return [...(nodes ?? [])]
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
      .filter((n) => !t || n.path.toLowerCase().includes(t));
  }, [nodes, filter]);

  if (!projectKey) return null;
  const isSaved = (n: AreaNodeView) => saved.some((f) => f.areaKey === n.areaKey);
  // Shown at once, saved behind it; a failed save puts the box back.
  const toggle = async (n: AreaNodeView, on: boolean) => {
    const before = saved;
    const f: AreaFavorite = { areaKey: n.areaKey, projectKey: n.projectKey, path: n.path, label: n.label, displayOrder: Math.max(-1, ...saved.map((x) => x.displayOrder)) + 1, unavailable: false };
    setSaved(on ? [...saved, f] : saved.filter((x) => x.areaKey !== n.areaKey));
    setBusy(true);
    try {
      if (on) await window.starChart.favorites.save(f);
      else await window.starChart.favorites.remove(n.areaKey);
    } catch {
      setSaved(before);
      setError('Couldn’t save that choice. Try again.');
    } finally { setBusy(false); }
  };
  const first = [...saved].sort((a, b) => a.displayOrder - b.displayOrder)[0];
  const chart = () => {
    if (!first) return;
    useChart.getState().set({ pickAreaFor: null });
    // Open the project the active view's way (decided 2026-10-07): Backlog, the first saved team;
    // Sprints, the current sprint through the saved Area Paths.
    void openProject(first.projectKey);
  };
  const cta = saved.length === 0 ? 'Choose at least one team' : saved.length === 1 ? `Chart ${first!.label}` : `Chart these ${saved.length} teams`;

  return (
    <div className="area-chooser" role="dialog" aria-label={`Charting ${projectName}`}>
      <section className="cosmos__plate area-chooser__plate" ref={plateRef}>
        <button type="button" className="connect__close area-chooser__close" aria-label="Close" onClick={close} data-tip="Back to the galaxy" data-tip-keys="Esc · your choices are kept">×</button>
        <h1 className="cosmos__title">Charting {projectName}</h1>
        <p className="cosmos__line">Choose the teams to chart: the Area Paths whose work you want to see.</p>
        <input type="search" className="object-list__filter" placeholder={nodes ? `Filter ${nodes.length} Area Paths` : 'Reading Area Paths…'} aria-label="Filter Area Paths"
          value={filter} onChange={(e) => setFilter(e.target.value)} disabled={!nodes} />
        {error && <p className="connect__msg connect__msg--error">{error}</p>}
        {!nodes && !error && <Busy label="Reading Area Paths…" />}
        <ul className="area-chooser__list" aria-label="Area Paths">
          {rows.map((n) => (
            <li key={n.areaKey}>
              <label style={{ paddingLeft: 4 + (filter ? 0 : Math.max(0, n.depth - 1) * 14) }}>
                <input type="checkbox" checked={isSaved(n)} onChange={(e) => void toggle(n, e.target.checked)} />
                <span className="area-chooser__name">{n.label}</span>
                <span className="muted mono area-chooser__path">{n.path}</span>
              </label>
            </li>
          ))}
          {nodes && rows.length === 0 && <li className="muted small">Nothing matches “{filter}”.</li>}
        </ul>
        <p className="muted small">{saved.length} saved</p>
        <button type="button" className="cosmos__cta" disabled={!first || busy} onClick={chart}
          data-tip="Open the first team you saved" data-tip-keys="The others are in the team switcher">{cta}</button>
      </section>
    </div>
  );
}

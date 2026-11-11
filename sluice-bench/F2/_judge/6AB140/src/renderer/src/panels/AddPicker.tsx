// The breadcrumb's + (decided 2026-10-08; 06 §3): add to the set the scene is drawn from, where you
// are. In the galaxy, a project to pin; at a scope's scene, an Area Path to save (a sprint gains it as a
// pod in place). Search first, the whole list beneath; what's already in shows a check.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { AreaNodeView, ProjectSummary } from '@shared/contracts/ipc';
import { addArea, addProject, type Addable } from '../nav';
import { useChart } from '../store';
import { Busy } from './Busy';

type Row = { key: string; label: string; meta?: string; depth: number; inChart: boolean; add: () => Promise<void> };

/** The candidates for an Addable, from the cache-first lists (one lookup, then instant). */
export async function addCandidates(what: Addable): Promise<Row[]> {
  if (what.kind === 'project') {
    const all: ProjectSummary[] = await window.starChart.projects.list();
    const anyPinned = all.some((p) => p.pinned);
    return [...all].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((p) => ({
      key: p.key, label: p.name, depth: 0, inChart: !anyPinned || p.pinned,
      meta: p.favoriteCount ? `${p.favoriteCount} saved area${p.favoriteCount === 1 ? '' : 's'}` : undefined,
      add: () => addProject(p.key),
    }));
  }
  const [tree, favorites] = await Promise.all([window.starChart.areas.tree(what.projectKey), window.starChart.favorites.list(what.projectKey)]);
  const saved = new Set(favorites.filter((f) => !f.unavailable).map((f) => f.areaKey));
  return tree.filter((n: AreaNodeView) => n.depth > 0).map((n) => ({
    key: n.areaKey, label: n.label, meta: n.path, depth: n.depth - 1, inChart: saved.has(n.areaKey), add: () => addArea(n),
  }));
}

/**
 * The picker, opened beneath the + crumb; or from the Inspector (19 N1), above its button (`up`: `y`
 * is then the distance from the window's bottom), closing through its own `onClose`.
 */
export function AddPicker({ what, x, y, up, onClose }: { what: Addable; x: number; y: number; up?: boolean; onClose?: () => void }) {
  const set = useChart((s) => s.set);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [working, setWorking] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = onClose ?? (() => set({ adding: false }));

  useEffect(() => {
    let live = true;
    void addCandidates(what).then((r) => { if (live) setRows(r); }, () => { if (live) setRows([]); });
    return () => { live = false; };
  }, [what]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  });

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = rows ?? [];
    return (t ? list.filter((r) => r.label.toLowerCase().includes(t) || (r.meta ?? '').toLowerCase().includes(t)) : list).slice(0, 80);
  }, [rows, q]);
  const choose = async (r: Row) => {
    if (r.inChart || working) return;
    setWorking(r.key);
    try { await r.add(); } finally { setWorking(null); close(); }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === 'Enter' && document.activeElement?.tagName === 'INPUT') {
      const first = shown.find((r) => !r.inChart);
      if (first) void choose(first);
    }
  };
  const noun = what.kind === 'project' ? 'project' : 'Area Path';
  const a = what.kind === 'project' ? 'a' : 'an';

  return (
    <div ref={ref} className="add-picker" role="dialog" aria-label={`Add ${a} ${noun}`} style={up ? { left: x, bottom: y } : { left: x, top: y }} onKeyDown={onKeyDown}>
      <div className="add-picker__head">Add {a} {noun}{what.kind === 'area' ? ' · a pod in every sprint' : ''}</div>
      <input autoFocus type="search" placeholder={`Find ${a} ${noun}`} aria-label={`Find ${a} ${noun}`} value={q} onChange={(e) => setQ(e.target.value)} />
      {rows === null ? <div className="add-picker__empty"><Busy label={`Loading ${noun}s…`} /></div> : (
        <ul className="add-picker__list" role="listbox">
          {shown.length === 0 && <li className="add-picker__empty muted">Nothing matches</li>}
          {shown.map((r) => (
            <li key={r.key}>
              <button type="button" role="option" aria-selected={false} aria-disabled={r.inChart} className="add-picker__row"
                style={{ paddingLeft: 8 + (q ? 0 : r.depth * 14) }} onClick={() => void choose(r)}
                data-tip={r.inChart ? 'Already in the chart' : `Add ${r.label}`} data-tip-keys={r.inChart ? 'Remove it from its ▾ menu' : undefined}>
                <span>{r.inChart ? '✓ ' : ''}{r.label}</span>
                {working === r.key ? <Busy label="Adding…" /> : r.meta && q ? <span className="muted mono">{r.meta}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

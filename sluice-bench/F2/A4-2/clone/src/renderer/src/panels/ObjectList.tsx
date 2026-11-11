import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { keyKind, workItemId } from '@shared/contracts/keys';
import type { NodeKind, ViewNode } from '@shared/contracts/view';
import { enterSelected, loadMore, reveal, select } from '../nav';
import { isRootScene } from '@shared/hierarchy/sceneKey';
import { useCaps } from '../data/caps';
import { activeHierarchy } from '../hierarchy';
import { useChart } from '../store';
import { KIND_ORDER, kindNames } from '../vocab';

/** Over this many rows, the list offers a filter (decided 2026-10-07: 188 projects). */
const FILTER_AT = 20;

/** A row matches by its name, or by work item ID ("#201" or "201"). */
function matches(n: ViewNode, q: string): boolean {
  if (!q) return true;
  const t = q.trim().toLowerCase().replace(/^#/, '');
  if (n.label.toLowerCase().includes(t)) return true;
  return keyKind(n.canonicalKey) === 'wi' && String(workItemId(n.canonicalKey)).startsWith(t);
}

/**
 * Keyboard equivalent of canvas picking (INV-20, AC-02), grouped by ADO type. Click or Enter selects
 * and brings the object into view (decided 2026-10-07); Enter on the selected row, or a double-click,
 * zooms into it, matching double-click on the canvas.
 */
export function ObjectList() {
  const { graph, selectedKey, paradigm } = useChart();
  const { chartedCaption } = useCaps();
  const inAdoGalaxy = chartedCaption && isRootScene(graph?.sceneKey) && (graph?.nodes.length ?? 0) > 0;
  const listRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const revealTimer = useRef<number | undefined>(undefined);
  const nodes = useMemo(() => {
    const seen = new Set<string>();
    return (graph?.nodes ?? [])
      .filter((n) => n.selectable)
      .map((n) => (n.kind === 'assignmentBeacon' ? { ...n, kind: 'captain' as NodeKind } : n)) // a person is one row
      .filter((n) => (seen.has(n.canonicalKey) ? false : (seen.add(n.canonicalKey), true)));
  }, [graph]);
  const shown = useMemo(() => nodes.filter((n) => matches(n, filter)), [nodes, filter]);
  const groups = KIND_ORDER.map((kind) => ({ kind, items: shown.filter((n) => n.kind === kind).sort(bySlot) })).filter((g) => g.items.length);
  const more = graph?.nodes.find((n) => n.role === 'loadMore');
  const loading = useChart((st) => st.sync?.level === 'more');
  const pick = (key: ViewNode['canonicalKey']) => { select(key); reveal(key); };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      const key = (document.activeElement as HTMLElement | null)?.dataset.key;
      if (!key) return;
      e.preventDefault();
      if (key === useChart.getState().selectedKey) void enterSelected();
      else pick(key as ViewNode['canonicalKey']);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(listRef.current?.querySelectorAll('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
    next?.focus();
    // Moving through the rows brings each into view, once the keys settle.
    const key = next?.dataset.key as ViewNode['canonicalKey'] | undefined;
    window.clearTimeout(revealTimer.current);
    if (key) revealTimer.current = window.setTimeout(() => reveal(key), 160);
  };

  return (
    <nav className="object-list" aria-label="Objects in view">
      {nodes.length > FILTER_AT && (
        <input type="search" className="object-list__filter" placeholder={`Filter ${nodes.length} objects`} aria-label="Filter objects in view"
          value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setFilter(''); }} />
      )}
      {filter && shown.length === 0 && <p className="muted small">Nothing matches “{filter}”.</p>}
      {inAdoGalaxy && (
        <button type="button" className="object-list__more" onClick={() => useChart.getState().set({ connectOpen: true, connectFocus: 'projects' })}
          data-tip="Choose which projects show as galaxies" data-tip-keys="Opens the data source panel">
          Not finding a project? Add more projects
        </button>
      )}
      <div ref={listRef} onKeyDown={onKeyDown}>
        {groups.map(({ kind, items }) => {
          const names = kindNames(kind, paradigm)!;
          // Group by the real ADO type when the node carries one (e.g. "Requirement" in other processes).
          const one = items.length === 1;
          const typeName = items[0]?.typeName;
          const ado = typeName ? (one ? typeName : `${typeName}s`.replace(/ys$/, 'ies')) : one ? names.ado : names.adoPlural;
          return (
            <section key={kind} className="object-list__group" aria-label={ado}>
              <h4 className="object-list__group-head">
                {ado} <span className="metaphor">· {plural(names.chart.toLowerCase(), items.length)}</span>
                <span className="object-list__count">{items.length}</span>
              </h4>
              <ul>
                {items.map((n) => (
                  <li key={n.projectionKey}>
                    <button
                      type="button"
                      data-key={n.canonicalKey}
                      aria-pressed={n.canonicalKey === selectedKey}
                      onClick={() => pick(n.canonicalKey)}
                      onDoubleClick={() => { select(n.canonicalKey); void enterSelected(); }}
                    >
                      <span className="object-list__glyph" aria-hidden="true">{names.glyph}</span>
                      <span className="object-list__label">{n.label}</span>
                      {/* ADO wouldn't give us this one on the last sync: it's what we last knew (02 §3). */}
                      {n.flags.stale && <span className="object-list__stale" title="ADO wouldn’t read this on the last sync: this is what was last known">last known</span>}
                      <span className="object-list__state">{n.flags.unexplored ? 'not yet explored' : n.rawState ?? (n.kind === 'flight' ? n.meta?.split(' · ').pop() : '')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {more && !filter && (
        // Loaded by level (decided 2026-10-07): the team's older Features, like the Load more beacon.
        <button type="button" className="object-list__more" aria-busy={loading} disabled={loading} onClick={() => void loadMore()} data-log="load-more"
          data-tip={activeHierarchy().levels[0]?.vocab.loadMoreTip ?? 'Load more'} data-tip-keys="The next 15, newest first">
          {loading ? 'Loading more…' : 'Load more…'}
        </button>
      )}
    </nav>
  );
}

const plural = (word: string, n: number) => (n === 1 ? word : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`);

function bySlot(a: ViewNode, b: ViewNode): number {
  return (a.slot ?? 0) - (b.slot ?? 0) || (a.label < b.label ? -1 : 1);
}

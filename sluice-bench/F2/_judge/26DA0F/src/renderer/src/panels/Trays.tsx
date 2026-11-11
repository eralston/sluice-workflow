import { useState } from 'react';
import { workItemId } from '@shared/contracts/keys';
import { isRootScene } from '@shared/hierarchy/sceneKey';
import { activeHierarchy } from '../hierarchy';
import { useChart } from '../store';

/** Uncharted work and unlinked PRs: shown, never hidden or given invented parents (INV-10). */
export function Trays() {
  const { graph, snapshot, history } = useChart();
  const [open, setOpen] = useState<'uncharted' | 'unlinked' | null>(null);
  if (!graph || isRootScene(graph.sceneKey) || !snapshot || !history) return null;
  // Its words are the hierarchy's: outside every member of the scope (the Backlog's "no Feature parent").
  const words = activeHierarchy().vocab.uncharted;
  const uncharted = graph.trays.uncharted.map((k) => snapshot.workItems.get(k)).filter(Boolean);
  const unlinked = graph.trays.unlinked.map((k) => snapshot.prs.get(k)).filter(Boolean);
  if (!uncharted.length && !unlinked.length) return null;
  const captains = new Map(history.entities.captains.map((c) => [c.key, c]));
  const repos = new Map(history.entities.repos.map((r) => [r.key, r.name]));
  return (
    <section className="trays" aria-label="Trays">
      {/* Compact chips by default so the trays never cover the chart; click to expand. */}
      <div className="tray-chips">
        {uncharted.length > 0 && (
          <button type="button" className="tray-chip" aria-expanded={open === 'uncharted'} onClick={() => setOpen(open === 'uncharted' ? null : 'uncharted')}>
            {words.ado} <span className="metaphor">· {words.chart}</span> · {uncharted.length}
          </button>
        )}
        {unlinked.length > 0 && (
          <button type="button" className="tray-chip" aria-expanded={open === 'unlinked'} onClick={() => setOpen(open === 'unlinked' ? null : 'unlinked')}>
            Unlinked PRs · {unlinked.length}
          </button>
        )}
      </div>
      {open === 'uncharted' && uncharted.length > 0 && (
        <div className="tray">
          <div className="tray__head">{words.ado} <span className="metaphor">· {words.chart}</span> · {uncharted.length}</div>
          <ul>
            {uncharted.map((wi) => (
              <li key={wi!.key}>
                <span className="mono">#{workItemId(wi!.key)}</span> {wi!.title} <span className="muted">{wi!.type} · {words.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open === 'unlinked' && unlinked.length > 0 && (
        <div className="tray">
          <div className="tray__head">Unlinked PRs · {unlinked.length}</div>
          <ul>
            {unlinked.map((pr) => (
              <li key={pr!.key}>
                <span className="mono">PR {pr!.key.slice(pr!.key.lastIndexOf(':') + 1)}</span> {pr!.title}{' '}
                <span className="muted">{repos.get(pr!.repoKey)} · {pr!.authorKey ? captains.get(pr!.authorKey)?.callSign : 'unknown author'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

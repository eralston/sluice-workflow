// The loading moment (decided 2026-10-08): opening a scope from the galaxy shows a plate over the
// galaxy itself, in the Connect panel's style, with the step in plain words, a progress line, and
// Cancel (Esc). It follows the galaxy on screen, the way the empty cosmos's plate follows the black hole.
// Deeper in, a small banner says what's still streaming in behind the scene, or which level is loading.
import { useEffect, useState, type RefObject } from 'react';
import type { ChartApp } from '../chart/ChartApp';
import { cancelSync } from '../nav';
import { useChart } from '../store';
import { fillText } from '@shared/streamCount';

/** A sprint's first look, step by step (sprintStream.ts: three calls). */
const SPRINT_STEPS = ['Finding the sprint’s stories', 'Reading where each one stands', 'Reading their Features', 'Charting'];
const PHASE: Record<string, string> = { discover: 'Finding Features', history: 'Reading history', prs: 'Reading pull requests', derive: 'Charting', done: 'Charting', failed: 'Failed' };

function stepText(sync: NonNullable<ReturnType<typeof useChart.getState>['sync']>): { text: string; frac: number | null } {
  if (sync.level === 'sprint') {
    const i = Math.min(sync.done, SPRINT_STEPS.length - 1);
    return { text: `${SPRINT_STEPS[i]} · ${Math.min(sync.done + 1, 3)} of 3`, frac: sync.total > 0 ? sync.done / sync.total : 0 };
  }
  if (sync.level === 'team') return { text: 'Reading the team’s Features as they are now', frac: null };
  if (sync.level) return { text: 'Reading current state', frac: null };
  return { text: `${PHASE[sync.phase] ?? 'Syncing'}${sync.total > 0 ? ` · ${sync.done} of ${sync.total}` : '…'}`, frac: sync.total > 0 ? sync.done / sync.total : null };
}

export function LoadingPlate({ chart }: { chart: RefObject<ChartApp | null> }) {
  const sync = useChart((s) => s.sync);
  const stack = useChart((s) => s.stack);
  const projects = useChart((s) => s.projects);
  const graph = useChart((s) => s.graph);
  const [at, setAt] = useState<{ x: number; y: number; r: number } | null>(null);
  const onGalaxy = stack.length === 1 && !!sync?.projectKey;
  const galaxy = onGalaxy ? graph?.nodes.find((n) => n.kind === 'galaxy' && n.canonicalKey === sync!.projectKey) : undefined;

  // Follow the galaxy on screen; hidden while the scene is changing.
  useEffect(() => {
    if (!galaxy) { setAt(null); return; }
    let raf = 0;
    const loop = () => {
      const c = chart.current;
      const p = c && !c.isTransitioning() ? c.worldToScreen(galaxy.world.x, galaxy.world.y) : null;
      const r = c ? galaxy.world.r * c.cameraState().scale : 0;
      setAt((q) => (p ? (q && q.x === p.x && q.y === p.y && q.r === r ? q : { x: p.x, y: p.y, r }) : null));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [galaxy, chart]);

  // Esc cancels the load here, before it would mean Back.
  useEffect(() => {
    if (!sync || sync.phase === 'failed') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); cancelSync(); } };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [sync]);

  if (sync && galaxy && at) {
    const { text, frac } = stepText(sync);
    const project = projects.find((p) => p.key === sync.projectKey)?.name ?? '';
    return (
      <div className="loading-plate" role="status" aria-live="polite" style={{ left: at.x, top: at.y }}>
        <div className="loading-plate__head">{project}</div>
        <div className="loading-plate__title">Opening {sync.label}</div>
        <div className="loading-plate__step">{text}</div>
        <div className={`loading-plate__progress${frac === null ? ' loading-plate__progress--open' : ''}`} aria-hidden="true">
          <span style={frac === null ? undefined : { width: `${Math.round(frac * 100)}%` }} />
        </div>
        <button type="button" className="connect__link" onClick={cancelSync} data-tip="Stop opening it" data-tip-keys="Esc · what's read so far is kept">Cancel</button>
      </div>
    );
  }
  return null;
}

/** The banners (the sync's step, and the quiet "Filling in" line): they live in the overlay stack under the player (06 §3, 23 B9). */
export function LoadingBanner() {
  const sync = useChart((s) => s.sync);
  const stream = useChart((s) => s.stream);
  const stack = useChart((s) => s.stack);
  const graph = useChart((s) => s.graph);
  const onGalaxy = stack.length === 1 && !!sync?.projectKey;
  const galaxy = onGalaxy ? graph?.nodes.find((n) => n.kind === 'galaxy' && n.canonicalKey === sync!.projectKey) : undefined;
  // While the plate over the galaxy is up, the sync's step is the plate's; the banner is for deeper levels.
  if (sync && galaxy) return null;
  if (sync) {
    const { text } = stepText(sync);
    return (
      <div className="sync-banner" role="status" aria-live="polite">
        <span>{sync.level ? 'Exploring' : 'Syncing'} {sync.label}: {text}{sync.partial ? ' (partial)' : ''}</span>
        <button type="button" className="connect__link" onClick={cancelSync} data-tip="Stop this sync" data-tip-keys="What's saved so far is kept">Cancel</button>
      </div>
    );
  }
  if (stream && stack.length > 1) {
    return (
      <div className="sync-banner sync-banner--quiet" role="status" aria-live="polite" data-tip="The rest of this sprint is streaming in" data-tip-keys="Counts reads of ADO, not the player’s items · what you look at comes first">
        <span>{fillText(stream.pending, stream.total, stream.exact)}</span>
      </div>
    );
  }
  return null;
}

// How old what you're looking at is (04 §6, decided 2026-10-09): the open scope's last successful
// sync, whether the chart is running from the cache, and what its coverage doesn't include. Refresh
// re-reads the scope now — otherwise a refresh happens when you reopen it (04 §5, step 7).
import { useEffect, useRef, useState } from 'react';
import { frameStats, refreshScope } from '../nav';
import { rlog } from '../devlog';
import { useChart } from '../store';
import { Busy } from './Busy';

/** "4 min ago", "2 days ago", or an absolute date once it's older than a week. */
export function ago(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d <= 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString();
}

/** Why one thing couldn't be read, in a few words. */
function whyMissing(status: number): string {
  if (status === 403) return 'not allowed (403)';
  if (status === 404) return 'not found (404)';
  if (status === 0) return 'no response';
  return `ADO answered ${status}`;
}

export function Coverage() {
  const history = useChart((s) => s.history);
  const offline = useChart((s) => s.offline);
  const refreshing = useChart((s) => s.refreshing);
  const mode = useChart((s) => s.mode);
  const snapshot = useChart((s) => s.snapshot);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The relative time has to keep up on its own.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);
  // Opening it profiles this view (slice 5): the cache's size on disk beside the frame times, into the
  // dev log, so a slow scope can be compared with a fast one afterwards.
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void window.starChart.cache.stats().then((s) => {
      if (!live) return;
      setSize(s.bytes);
      rlog('profile', { bytes: s.bytes, ...frameStats() });
    }, () => undefined);
    return () => { live = false; };
  }, [open]);

  // Fixtures carry every fact, so there's nothing to be out of date about.
  if (mode !== 'ado') return null;
  // No scope open (the galaxy): there's no sync to date, but "offline" is still worth saying, with a way
  // to try again — a start with no connection opens on the cached projects (AC-31).
  if (!history) {
    if (!offline) return null;
    return (
      <div className="coverage">
        <span className="coverage__offline" data-tip="ADO couldn’t be reached" data-tip-keys="These are the projects last known; ↻ tries again">Offline</span>
        <button type="button" className="coverage__refresh" onClick={() => void refreshScope()} disabled={refreshing}
          aria-label="Try ADO again" data-tip="Ask ADO for the projects again" data-tip-keys="It clears Offline when it answers">
          {refreshing ? <Busy label="Trying…" /> : '↻'}
        </button>
      </div>
    );
  }
  const { syncedAt, partial, notes, stale } = history.coverage;
  const missing = history.coverage.missing ?? [];
  const when = syncedAt ? ago(syncedAt) : 'not yet';
  // With the exact objects in hand, the sync's general note about them would only say it twice.
  const gaps = notes.filter((n) => !(stale?.length && n.includes('could not be read')));
  if (stale?.length) {
    gaps.push(stale.length === 1
      ? 'One work item couldn’t be read on the last sync; it shows what was last known.'
      : `${stale.length} work items couldn’t be read on the last sync; they show what was last known.`);
  }

  return (
    <div className="coverage" ref={ref}>
      {offline && <span className="coverage__offline" data-tip="ADO couldn’t be reached" data-tip-keys="This is the cache; Refresh tries again">Offline</span>}
      <button type="button" className={`coverage__when${partial ? ' is-partial' : ''}`} aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-tip={syncedAt ? `Synced ${new Date(syncedAt).toUTCString()}` : 'This scope hasn’t finished a sync yet'}
        data-tip-keys={partial ? 'Some of it is missing: open for what' : undefined}>
        Synced {when}{partial ? ' · partial' : ''}
      </button>
      <button type="button" className="coverage__refresh" onClick={() => void refreshScope()} disabled={refreshing}
        aria-label="Refresh this scope" data-tip="Read this scope from ADO again" data-tip-keys="It also refreshes when you reopen it">
        {refreshing ? <Busy label="Refreshing…" /> : '↻'}
      </button>
      {open && (
        <div className="coverage__panel" role="dialog" aria-label="Coverage">
          <div className="coverage__head">What this view holds</div>
          <p>Last full read: {syncedAt ? new Date(syncedAt).toUTCString() : 'none yet'}.</p>
          {size !== null && <p className="muted">Cache {(size / 1e6).toFixed(1)} MB · frames {frameStats().p50}/{frameStats().p95} ms (median/95th)</p>}
          {gaps.length === 0 ? <p className="muted">Nothing is known to be missing.</p> : (
            <ul>{gaps.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
          {/* What couldn't be read, one by one (slice 7): the last known title when we have it. */}
          {missing.length > 0 && (
            <ul className="coverage__missing">
              {missing.map((m) => (
                <li key={m.key}>
                  <span className="mono">{m.kind === 'pr' ? `PR ${m.key.split(':').pop()}` : 'Repo'}</span>{' '}
                  {m.kind === 'pr' ? snapshot?.prs.get(m.key)?.title ?? '' : history.entities.repos.find((r) => r.key === m.key)?.name ?? ''}
                  <span className="muted"> · {whyMissing(m.status)}{m.seen ? ' · last known shown' : ' · not on the chart'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

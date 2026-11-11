// Request activity (decided 2026-10-07). In the status bar: an abacus of chips, one per kind of work,
// a bead per call, arriving as work starts and leaving once it's done; failures stay. The panel
// (over the side panel) lists calls in progress, recent results, and errors with their Details.
import { useEffect, useState } from 'react';
import { chips as chipsOf, loudErrors, phraseOf } from '@shared/activity';
import { useActivity } from '../activityStore';
import { cancelSync } from '../nav';
import { useChart } from '../store';
import { ErrorDetails } from './ErrorDetails';

/** Re-render on a light tick while anything is showing, so successes age out and timers count. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return active ? now : Date.now();
}

const MAX_BEADS = 8;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} s` : `${Math.round(n)} ms`);

/** A bead per call: filled while it's in flight, hollow once it's done (decided 2026-10-07). */
function Beads({ active, done }: { active: number; done: number }) {
  const filled = Math.min(active, MAX_BEADS);
  const hollow = Math.min(done, MAX_BEADS - filled);
  return (
    <span className="chip__beads" aria-hidden="true">
      {Array.from({ length: filled }, (_, i) => <span key={`a${i}`} className="bead bead--on" />)}
      {Array.from({ length: hollow }, (_, i) => <span key={`d${i}`} className="bead" />)}
      {active + done > MAX_BEADS && <span className="chip__more">+{active + done - MAX_BEADS}</span>}
    </span>
  );
}

/**
 * The one network indicator (decided 2026-10-09): what ADO is being asked for, how far along, and what
 * failed — in the status bar's right-hand button, which also opens the list. It was two things, a row
 * of per-family chips on the left and a plain button on the right; this is the chips' abacus folded
 * into the button. A bead per call across every kind of work, the busiest kind named, and a throttle
 * wait said plainly.
 */
export function ActivityButton() {
  const state = useActivity();
  const { active, setPanel, panelOpen } = state;
  // Quiet failures (a PAT that can't read pictures, decided 2026-10-09) are in the panel, not here.
  const errors = loudErrors(state);
  const reduced = useChart((s) => s.reducedMotion);
  const anything = active.size > 0 || errors.length > 0 || state.recent.some((r) => Date.now() - (r.endedAt ?? 0) < 2000);
  const now = useNow(anything);
  const all = chipsOf(state, now);
  const total = all.reduce((a, c) => ({ active: a.active + c.active, done: a.done + c.done }), { active: 0, done: 0 });
  // What to name: a failure first, then a wait, then whatever is busiest.
  const lead = all.find((c) => c.failed) ?? all.find((c) => c.waitingMs !== null) ?? [...all].sort((a, b) => b.active - a.active)[0];
  const waiting = all.find((c) => c.waitingMs !== null)?.waitingMs ?? null;
  const tone = errors.length ? 'activity-button--errors' : waiting !== null ? 'activity-button--waiting' : '';
  const label = waiting !== null ? `Waiting ${ms(waiting)}` : lead && total.active > 0 ? lead.phrase : 'Requests';
  return (
    <button type="button" className={`activity-button ${tone}${reduced ? ' activity-button--still' : ''}`} aria-expanded={panelOpen}
      onClick={() => setPanel(!panelOpen)} role="status" aria-live="polite"
      data-tip={total.active > 0 ? `${total.active} request${total.active === 1 ? '' : 's'} in progress${total.done ? `, ${total.done} just done` : ''}` : 'Requests to ADO'}
      data-tip-keys={waiting !== null ? `ADO asked to wait ${ms(waiting)}` : 'In progress, recent, and errors'} data-log="activity-panel">
      <span className="activity-button__label">{label}</span>
      {(total.active > 0 || total.done > 0) && <Beads active={total.active} done={total.done} />}
      {errors.length > 0 && <span className="activity-button__errors">{errors.length}</span>}
    </button>
  );
}

export function ActivityPanel() {
  const state = useActivity();
  const sync = useChart((s) => s.sync);
  const now = useNow(state.panelOpen);
  useEffect(() => {
    if (!state.panelOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); state.setPanel(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state.panelOpen]);
  if (!state.panelOpen) return null;
  const active = [...state.active.values()].sort((a, b) => a.startedAt - b.startedAt);
  // Trouble first; the expected ones (quiet) follow, muted, so they don't bury it.
  const errors = [...state.errors].sort((a, b) => Number(!!a.quiet) - Number(!!b.quiet));
  const quiet = errors.filter((e) => e.quiet).length;
  // The statuses actually seen, so the note says what happened rather than a fixed 401.
  const quietStatuses = [...new Set(errors.filter((e) => e.quiet).map((e) => e.status))].sort().join(' or ');
  return (
    <section className="activity-panel" role="dialog" aria-label="Requests">
      <header className="connect__head">
        <span>Requests</span>
        <button type="button" className="connect__close" aria-label="Close" onClick={() => state.setPanel(false)} data-tip="Close" data-tip-keys="Esc">×</button>
      </header>
      {sync && sync.phase !== 'failed' && (
        <div className="activity-panel__job">
          <span>Syncing: {sync.phase}{sync.total ? ` ${sync.done} of ${sync.total}` : ''}</span>
          <button type="button" className="connect__link" onClick={cancelSync} data-tip="Stop this sync" data-tip-keys="What's saved so far is kept">Cancel</button>
        </div>
      )}
      <h3 className="inspector__h3">In progress · {active.length}</h3>
      <ul className="activity-panel__list">
        {active.slice(0, 80).map((c) => (
          <li key={c.id}><span>{phraseOf(c.family).icon} {phraseOf(c.family).phrase}</span><span className="muted mono">{c.waitUntil && c.waitUntil > now ? `waiting ${ms(c.waitUntil - now)}` : ms(now - c.startedAt)}</span></li>
        ))}
        {active.length === 0 && <li className="muted small">Nothing loading.</li>}
      </ul>
      {errors.length > 0 && (
        <>
          <h3 className="inspector__h3">Errors · {errors.length} <button type="button" className="connect__link" onClick={() => state.dismiss('all')}>Dismiss all</button></h3>
          {quiet > 0 && (
            <p className="activity-panel__quiet muted small">
              {quiet === errors.length ? 'All' : `${quiet} of these`} expected: ADO won’t give us these pictures ({quietStatuses}), so initials stand in.
              They’re listed here but don’t mark the Requests button.
            </p>
          )}
          <ul className="activity-panel__errors">
            {errors.map((e) => (
              <li key={e.id} className={e.quiet ? 'is-quiet' : undefined}>
                <div className="activity-panel__error-head">
                  <span>{phraseOf(e.family).phrase} failed{e.status ? ` (${e.status})` : ' (no response)'}{e.quiet ? ' · expected' : ''}</span>
                  <button type="button" className="connect__link" onClick={() => state.dismiss(e.id)}>Dismiss</button>
                </div>
                {e.net && <ErrorDetails net={e.net} />}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="inspector__h3">Recent</h3>
      <ul className="activity-panel__list">
        {state.recent.slice(0, 50).map((c) => (
          <li key={c.id} className={c.ok ? undefined : 'is-failed'}>
            <span>{phraseOf(c.family).icon} {phraseOf(c.family).phrase}</span>
            <span className="muted mono">{c.status ?? '—'} · {ms(c.ms ?? 0)}{(c.attempts ?? 1) > 1 ? ` · ${c.attempts} tries` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

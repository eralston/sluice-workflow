// The Connect panel, behind the mode chip (slice 4, decided 2026-10-04): fixture or ADO mode, the org
// URL and PAT, the access check (04 §2), pinned projects, and the cache (04 §8). The PAT field is
// uncontrolled and clears on submit: the token never sits in React or store state (INV-17, AC-25).
// v1 (17 W2-T6): the contents are `ConnectBody`, so the Settings modal's Connection tab shows the same
// controls. `ConnectPanel` is the floating shell around them, and stands down while a mounted modal
// hosts the tab. `connectOpen` opens either one.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthStatus, CacheStats, CapabilityMatrix, ProjectSummary } from '@shared/contracts/ipc';
import { reboot } from '../nav';
import { ErrorDetails } from './ErrorDetails';
import { Busy } from './Busy';
import { explainError } from '../errors';
import type { NetError } from '@shared/contracts/neterror';
import { useChart } from '../store';
import { useSettings } from '../settings/store';
import { refusalWords, useTokenRefusal } from './TokenNotice';



function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function ModeChip() {
  const mode = useChart((s) => s.mode);
  const open = useChart((s) => s.connectOpen);
  const set = useChart((s) => s.set);
  const refusal = useTokenRefusal();
  return (
    <button type="button" className="mode-chip" data-mode={mode} data-alert={refusal ? 'token' : undefined} aria-expanded={open} aria-controls="connect-panel"
      data-tip={refusal ? refusalWords(refusal).headline : mode === 'ado' ? 'Data source: your Azure DevOps organization' : 'Data source: synthetic demo data'} data-tip-keys={refusal ? 'Open to enter a new token' : 'Connect, choose projects, cache'}
      onClick={() => set({ connectOpen: !open })}>
      {mode === 'ado' ? 'ADO' : 'FIXTURE'}
    </button>
  );
}

/** The floating Connect panel (v0 and any paradigm without the Settings modal). */
export function ConnectPanel() {
  const hosted = useSettings((s) => s.hostsConnection);
  const set = useChart((s) => s.set);
  if (hosted) return null;
  return (
    <ConnectBody frame={(body) => (
      <section id="connect-panel" className="connect" role="dialog" aria-label="Connection">
        <header className="connect__head">
          <span>Data source</span>
          <button type="button" className="connect__close" aria-label="Close" onClick={() => set({ connectOpen: false })}>×</button>
        </header>
        {body}
      </section>
    )} />
  );
}

/**
 * The Connect controls, without a frame: `frame` wraps them (the floating panel's, or the Settings
 * tab's). Mounted while closed, so what was typed and found survives closing, as it always did.
 */
export function ConnectBody({ frame }: { frame: (body: ReactNode) => ReactNode }) {
  const open = useChart((s) => s.connectOpen);
  const mode = useChart((s) => s.mode);
  const set = useChart((s) => s.set);
  const patRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [orgUrl, setOrgUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; net?: NetError | null } | null>(null);
  const [matrix, setMatrix] = useState<CapabilityMatrix | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [stats, setStats] = useState<CacheStats | null>(null);
  /** `az` is on the PATH and logged in (04 §1a): the Sign in button shows only then. */
  const [azOk, setAzOk] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  /** Unchecking Select all starts a fresh pick: shown as all unchecked until one is chosen (nothing saved yet). */
  const [picking, setPicking] = useState(false);
  const [projectFilter, setProjectFilter] = useState('');
  const projectsHead = useRef<HTMLHeadingElement>(null);
  const projectFilterRef = useRef<HTMLInputElement>(null);
  const focus = useChart((s) => s.connectFocus);
  const refusal = useTokenRefusal();
  // Opened to enter a new token (the refused-token notice or a loading widget): the field is ready.
  useEffect(() => {
    if (!open || focus !== 'token') return;
    patRef.current?.scrollIntoView({ block: 'center' });
    patRef.current?.focus();
    useChart.getState().set({ connectFocus: null });
  }, [open, focus]);
  // Opened from "Add more projects" (or the empty cosmos): go straight to the project list.
  useEffect(() => {
    if (!open || focus !== 'projects' || !projects.length) return;
    projectsHead.current?.scrollIntoView({ block: 'start' });
    (projectFilterRef.current ?? projectsHead.current)?.focus?.();
    useChart.getState().set({ connectFocus: null });
  }, [open, focus, projects.length]);

  const refresh = async () => {
    const s = await window.starChart.auth.status();
    setStatus(s);
    void window.starChart.auth.azAvailable().then((r) => setAzOk(r.available), () => setAzOk(false));
    if (s.orgUrl) setOrgUrl((u) => u || s.orgUrl!);
    setStats(await window.starChart.cache.stats());
    if (s.connected && useChart.getState().mode === 'ado') {
      try { setProjects(await window.starChart.projects.list()); } catch { setProjects([]); }
    } else setProjects([]);
  };
  useEffect(() => {
    if (open) void refresh();
    else { setConfirmPurge(false); setMessage(null); }
  }, [open, mode]);

  if (!open) return null;

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setMessage(null);
    try { await fn(); } catch (e) { const { message: text, net } = explainError(e); setMessage({ kind: 'error', text, net }); } finally { setBusy(null); }
  };

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    const field = patRef.current;
    const pat = field?.value ?? '';
    if (field) field.value = ''; // cleared before the call: the field never holds it afterwards
    void run('connect', () => finishConnect(window.starChart.auth.setPat(orgUrl, pat)));
  };
  const finishConnect = async (attempt: Promise<{ ok: boolean; error?: string; net?: NetError }>) => {
    const r = await attempt;
    if (!r.ok) { setMessage({ kind: 'error', text: r.error ?? 'Couldn’t connect.', net: r.net ?? null }); return; }
    setMessage({ kind: 'ok', text: mode === 'ado' ? 'Connected.' : 'Connected. Switch to ADO to use it.' });
    set({ tokenRefused: null }); // the new token answers the old refusal
    setMatrix(null);
    if (mode === 'ado') await reboot();
    await refresh();
  };
  const signInAz = () => void run('az', () => finishConnect(window.starChart.auth.azSignIn(orgUrl)));

  const switchMode = (m: 'fixture' | 'ado') => void run('mode', async () => {
    await window.starChart.mode.set(m);
    set({ mode: m });
    await reboot();
    await refresh();
  });

  // A checked box means "on the chart". Nothing pinned means every project shows (the usual case).
  const noneChosen = projects.every((p) => !p.pinned);
  const shown = (p: ProjectSummary) => (picking ? p.pinned : noneChosen || p.pinned);
  const allShown = !picking && (noneChosen || projects.every((p) => p.pinned));
  const savePins = (next: ProjectSummary[]) => void run('pin', async () => {
    setProjects(next);
    const pins = next.filter((p) => p.pinned).map((p) => p.key);
    // Every project chosen is the same as none: store it as "all", so new projects show up too.
    await window.starChart.projects.setPinned(pins.length === next.length ? [] : pins);
    await reboot();
  });
  const pin = (key: string, on: boolean) => {
    // From "all", unchecking one keeps the rest; while picking, checking adds to the pick.
    const base = picking ? projects : projects.map((p) => ({ ...p, pinned: noneChosen ? true : p.pinned }));
    const next = base.map((p) => (p.key === key ? { ...p, pinned: on } : p));
    setPicking(false);
    if (next.every((p) => !p.pinned)) { setPicking(true); setProjects(next); return; } // nothing left: back to picking
    savePins(next);
  };
  const selectAll = (on: boolean) => {
    if (on) { setPicking(false); savePins(projects.map((p) => ({ ...p, pinned: false }))); return; }
    setPicking(true);
    setProjects(projects.map((p) => ({ ...p, pinned: false })));
  };
  // Your recent projects first (newest first, with a tag), then A–Z (decided 2026-10-07).
  const byName = [...projects].sort((a, b) => (b.recentAt ?? 0) - (a.recentAt ?? 0) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const listed = projectFilter ? byName.filter((p) => p.name.toLowerCase().includes(projectFilter.trim().toLowerCase())) : byName;

  return frame(
    <>
      <div className="toggle connect__mode" role="group" aria-label="Data source">
        <button type="button" aria-pressed={mode === 'fixture'} disabled={!!busy} onClick={() => switchMode('fixture')}>Fixture</button>
        <button type="button" aria-pressed={mode === 'ado'} disabled={!!busy} onClick={() => switchMode('ado')}>ADO</button>
      </div>
      <p className="muted small">{mode === 'fixture' ? 'Synthetic data with invented names. Nothing leaves this Mac.' : 'Your Azure DevOps organization, read-only. Cached on this Mac.'}</p>

      {refusal && mode === 'ado' && (
        <div className="connect__msg connect__msg--error connect__refused" role="alert">
          <strong>{refusalWords(refusal).headline}.</strong> {refusalWords(refusal).detail}
        </div>
      )}
      <form className="connect__form" onSubmit={connect}>
        <label>
          <span>Organization URL</span>
          <input type="url" name="org" placeholder="https://dev.azure.com/your-org" value={orgUrl} onChange={(e) => setOrgUrl(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span>Personal access token</span>
          <input ref={patRef} type="password" name="pat" placeholder={status?.hasPat ? 'Saved. Enter a new one to replace it' : 'Read scopes: Project and team, Work items, Code'} autoComplete="off" spellCheck={false} />
        </label>
        <div className="connect__row">
          <button type="submit" className="enter-link" disabled={!!busy} aria-busy={busy === 'connect'} data-tip="Check the token and connect" data-tip-keys="Read-only">{busy === 'connect' ? <Busy label="Connecting…" /> : 'Connect'}</button>
          {azOk && (
            <button type="button" className="connect__link" data-log="az-sign-in" disabled={!!busy} aria-busy={busy === 'az'} onClick={signInAz}
              data-tip="Use your Azure CLI sign-in instead of a token" data-tip-keys="Kept in memory, renewed hourly">
              {busy === 'az' ? <Busy label="Signing in…" /> : 'Sign in with Azure CLI'}
            </button>
          )}
          {status?.hasPat && (
            <button type="button" className="connect__link" disabled={!!busy} onClick={() => void run('clear', async () => { await window.starChart.auth.clear(); set({ tokenRefused: null }); setMatrix(null); await refresh(); if (mode === 'ado') await reboot(); })}>
              {status.method === 'az' ? 'Sign out of Azure CLI' : 'Forget token'}
            </button>
          )}
        </div>
        <p className="muted small connect__status">
          {status?.connected ? `Connected to ${status.orgUrl}.` : status?.orgUrl ? `Not connected: enter a token for ${status.orgUrl}.` : 'Not connected.'}
          {status?.method === 'az' && ' Signed in with the Azure CLI; the sign-in is renewed hourly.'}
          {status && ` The token is kept ${status.storage === 'keychain' ? 'in the macOS Keychain' : 'in memory for this run only'}.`}
        </p>
      </form>
      {message && (
        <div className={`connect__msg connect__msg--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
          {message.net && <ErrorDetails net={message.net} />}
        </div>
      )}

      {status?.connected && (
        <>
          <h3 className="inspector__h3">Access</h3>
          <button type="button" className="connect__link" disabled={!!busy} onClick={() => void run('probe', async () => setMatrix(await window.starChart.probe.run()))}>
            {busy === 'probe' ? <Busy label="Checking access…" /> : 'Check access'}
          </button>
          {matrix && (
            <table className="probe">
              <tbody>
                {matrix.rows.map((r, i) => (
                  <tr key={i} data-status={r.status}>
                    <td className="mono">{r.family}</td>
                    <td className="probe__status mono">{r.status}</td>
                    <td className="small">{r.note || r.endpoint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {mode === 'ado' && status?.connected && projects.length === 0 && <Busy label="Listing projects…" />}
      {mode === 'ado' && projects.length > 0 && (
        <>
          <h3 className="inspector__h3" ref={projectsHead}>Projects on the chart</h3>
          <label className="connect__all">
            <input type="checkbox" checked={allShown} ref={(el) => { if (el) el.indeterminate = !allShown && !picking && projects.some(shown); }}
              disabled={!!busy} onChange={(e) => selectAll(e.target.checked)} /> Select all
            <span className="muted small"> · {picking ? 'pick the projects to show; until you do, all are shown' : allShown ? `all ${projects.length} shown` : `${projects.filter(shown).length} of ${projects.length} shown`}</span>
          </label>
          {projects.length > 20 && (
            <input type="search" className="object-list__filter" placeholder={`Filter ${projects.length} projects`} aria-label="Filter projects"
              value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} ref={projectFilterRef} />
          )}
          <ul className="connect__projects">
            {listed.map((p) => (
              <li key={p.key}>
                <label>
                  <input type="checkbox" checked={shown(p)} disabled={!!busy} onChange={(e) => pin(p.key, e.target.checked)} /> {p.name}
                  {p.recentAt && <span className="connect__recent-tag">recent</span>}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="inspector__h3">Cache</h3>
      {stats && <p className="small"><span className="connect__size">{bytes(stats.bytes)}</span> <span className="muted mono connect__path">{stats.path}</span></p>}
      <button type="button" className="connect__link" disabled={!!busy}
        onClick={() => {
          if (!confirmPurge) { setConfirmPurge(true); return; }
          setConfirmPurge(false);
          void run('purge', async () => { await window.starChart.cache.purge(); await refresh(); if (mode === 'ado') await reboot(); setMessage({ kind: 'ok', text: 'Cache purged.' }); });
        }}>
        {confirmPurge ? 'Purge: delete every cached fact?' : 'Purge cache'}
      </button>
      <Diagnostics />
    </>,
  );
}

/**
 * The diagnostic log (slice 7, decided 2026-10-10): a redacted record of what the app asked ADO and
 * how it went (no tokens, no work data), the last 3 runs, to attach to a problem report. Opt-in in a
 * packaged build; developer runs always keep one.
 */
function Diagnostics() {
  const [d, setD] = useState<{ on: boolean; packaged: boolean } | null>(null);
  const [shown, setShown] = useState<boolean | null>(null);
  useEffect(() => { void window.starChart.diagnostics.get().then(setD, () => undefined); }, []);
  if (!d) return null;
  return (
    <div className="connect__diagnostics">
      <h3 className="inspector__h3">Diagnostic log</h3>
      <label className="connect__toggle">
        <input type="checkbox" checked={d.on} disabled={!d.packaged}
          onChange={(e) => { const on = e.target.checked; setD({ ...d, on }); setShown(null); void window.starChart.diagnostics.set(on).then(setD); }} />
        Keep a diagnostic log <span className="muted">(no tokens or work data)</span>
      </label>
      {!d.packaged && <p className="muted small">Developer runs always keep one.</p>}
      {d.on && (
        <button type="button" className="connect__link" onClick={() => void window.starChart.diagnostics.show().then(setShown)}>Show log file</button>
      )}
      {shown === false && <p className="muted small">Nothing has been written yet.</p>}
    </div>
  );
}

// The empty cosmos (decided 2026-10-07): before any project is chosen, the galaxy is a lonely black
// hole with a call to action below it, the start of onboarding, and a rotating quote about the
// universe, for mood rather than information. Quotes live in config/cosmos-quotes.txt.
import { useEffect, useRef, useState } from 'react';
import quotesRaw from '@config/cosmos-quotes.txt?raw';
import type { AuthStatus, ProjectSummary } from '@shared/contracts/ipc';
import { parseQuotes, QUOTE_ALPHA } from '@shared/scene/cosmos';
import type { ChartApp } from '../chart/ChartApp';
import { useActivity } from '../activityStore';
import { cosmosEnergy, reboot } from '../nav';
import { SOURCE_CAPS } from '@shared/contracts/source';
import { isRootScene } from '@shared/hierarchy/sceneKey';
import { useChart } from '../store';
import { Busy } from './Busy';

const QUOTES = parseQuotes(quotesRaw);
/** How long each quote stays, and its crossfade (none in reduced motion). */
export const QUOTE_MS = 14_000;
const FADE_MS = 1200;

export function EmptyCosmos({ chart }: { chart: React.RefObject<ChartApp | null> }) {
  const empty = useChart((s) => SOURCE_CAPS[s.mode].needsConnection && s.stack.length === 1 && isRootScene(s.stack[0]?.sceneKey) && s.projects.length === 0);
  const connectOpen = useChart((s) => s.connectOpen);
  const reduced = useChart((s) => s.reducedMotion);
  const set = useChart((s) => s.set);
  const [anchor, setAnchor] = useState<{ x: number; y: number; r: number } | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [recent, setRecent] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState(() => Math.floor(Math.random() * Math.max(1, QUOTES.length)));
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<number | undefined>(undefined);
  const calls = useActivity((a) => a.active.size);

  // The black hole's pull while the app waits on the network here (decided 2026-10-07): gentle while
  // connecting or finding your projects, a storm while the cosmos fills, released as the galaxies
  // arrive. A short gap between calls doesn't count as idle.
  useEffect(() => {
    const level = !empty ? 'idle' : busy ? 'storm' : calls > 0 ? 'gentle' : 'idle';
    if (level !== 'idle' || !empty) { cosmosEnergy(level); return; }
    const id = window.setTimeout(() => cosmosEnergy('idle'), 400);
    return () => window.clearTimeout(id);
  }, [empty, busy, calls]);

  // Follow the black hole on screen (it moves with the window size).
  useEffect(() => {
    if (!empty) return;
    let raf = 0;
    const loop = () => {
      const a = chart.current?.emptyCosmosAnchor() ?? null;
      setAnchor((p) => (p && a && p.x === a.x && p.y === a.y && p.r === a.r ? p : a));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [empty, chart]);

  // Where onboarding stands: re-read whenever the Connect panel closes.
  useEffect(() => {
    if (!empty || connectOpen) return;
    let live = true;
    void (async () => {
      const s = await window.starChart.auth.status();
      if (!live) return;
      setStatus(s);
      if (s.connected) {
        setRecent(null);
        try { const r = await window.starChart.projects.recent(); if (live) setRecent(r); } catch { if (live) setRecent([]); }
      }
    })();
    return () => { live = false; };
  }, [empty, connectOpen]);

  // The quotes turn slowly.
  useEffect(() => {
    if (!empty || QUOTES.length < 2) return;
    const every = window.starChart.env.testMode ? 1500 : QUOTE_MS; // tests needn't wait 14 s for a turn
    const id = window.setInterval(() => {
      if (reduced) { setQuote((q) => (q + 1) % QUOTES.length); return; }
      setFading(true);
      fadeTimer.current = window.setTimeout(() => { setQuote((q) => (q + 1) % QUOTES.length); setFading(false); }, FADE_MS / 2);
    }, every);
    return () => { window.clearInterval(id); window.clearTimeout(fadeTimer.current); };
  }, [empty, reduced]);

  if (!empty || !anchor) return null;
  const openConnect = (focus: 'projects' | null) => set({ connectOpen: true, connectFocus: focus });
  const choose = (keys: string[]) => {
    setBusy(true);
    void window.starChart.projects.setPinned(keys).then(() => reboot()).finally(() => setBusy(false));
  };
  const demo = () => {
    setBusy(true);
    void window.starChart.mode.set('fixture').then(async () => { set({ mode: 'fixture' }); await reboot(); }).finally(() => setBusy(false));
  };
  const q = QUOTES[quote];
  const connected = !!status?.connected;

  return (
    <div className="cosmos" style={{ left: anchor.x, top: anchor.y + anchor.r * 0.62 }}>
      <section className="cosmos__plate" aria-label="Building your cosmos">
        <h1 className="cosmos__title">Building Your Cosmos</h1>
        <button type="button" className="cosmos__subtitle" onClick={() => openConnect('projects')}
          data-tip="Choose which projects become galaxies" data-tip-keys="Opens the data source panel">
          Select your Azure DevOps projects
        </button>
        {!connected && (
          <>
            <p className="cosmos__line">Connect to your organization to chart the projects you work in.</p>
            <button type="button" className="cosmos__cta" disabled={busy} onClick={() => openConnect(null)}
              data-tip="Sign in with an organization URL and a personal access token" data-tip-keys="Read-only">
              Connect to Azure DevOps
            </button>
            <button type="button" className="cosmos__quiet" disabled={busy} onClick={demo}
              data-tip="Look around a made-up organization first" data-tip-keys="Synthetic data · invented names">
              or explore a demo cosmos
            </button>
          </>
        )}
        {connected && recent === null && <p className="cosmos__line"><Busy label="Finding your recent projects…" /></p>}
        {connected && recent && recent.length > 0 && (
          <>
            <p className="cosmos__line">Your most recent projects, from the work you changed or were assigned:</p>
            <ol className="cosmos__recent">{recent.map((p) => <li key={p.key}>{p.name}</li>)}</ol>
            <button type="button" className="cosmos__cta" disabled={busy} onClick={() => choose(recent.map((p) => p.key))}
              data-tip="Chart these projects as galaxies" data-tip-keys="Change them any time from the mode chip">
              {busy ? <Busy label="Adding…" /> : `Add ${recent.length === 1 ? 'this project' : `these ${recent.length}`}`}
            </button>
            <span className="cosmos__or">
              <button type="button" className="cosmos__quiet" disabled={busy} onClick={() => openConnect('projects')}>Choose others</button>
              {' · '}
              <button type="button" className="cosmos__quiet" disabled={busy} onClick={() => choose([])}>show all projects</button>
            </span>
          </>
        )}
        {connected && recent && recent.length === 0 && (
          <>
            <p className="cosmos__line">No recent work found for you here. Choose the projects to chart.</p>
            <button type="button" className="cosmos__cta" disabled={busy} onClick={() => openConnect('projects')}>Choose projects</button>
            <button type="button" className="cosmos__quiet" disabled={busy} onClick={() => choose([])}>or show all projects</button>
          </>
        )}
      </section>
      {q && (
        <figure className="cosmos__quote" aria-live="off" style={{ opacity: fading ? 0 : 1, color: `rgba(244, 240, 222, ${QUOTE_ALPHA})`, transition: reduced ? 'none' : `opacity ${FADE_MS / 2}ms ease` }}>
          <blockquote>{q.text}</blockquote>
          {q.by && <figcaption>{q.by}</figcaption>}
        </figure>
      )}
    </div>
  );
}

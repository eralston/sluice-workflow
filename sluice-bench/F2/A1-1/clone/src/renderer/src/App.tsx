import { useEffect, useRef, useState } from 'react';
import { ChartApp } from './chart/ChartApp';
import { addable, attachChart, back, boot, cancelSync, enterNode, enterSelected, goTo, onUserNavigate, reveal, search, select, type SearchResult, setParadigm } from './nav';
import { addCandidates } from './panels/AddPicker';
import { caps } from './data/caps';
import {
  attachPlaybackChart, follow, nextInView, nudgeRate, prevBeat, prevInView, resumeFollow, setHighlights, setLens, step, suspendFollow,
  suspendFraming, toEnd, toggleEvents, toggleFraming, togglePlay, toStart,
} from './playback';
import { ConnectPanel, ModeChip } from './panels/Connect';
import { EmptyCosmos } from './panels/EmptyCosmos';
import { Coverage } from './panels/Coverage';
import { LoadingBanner, LoadingPlate } from './panels/LoadingPlate';
import { OverlayStack } from './panels/OverlayStack';
import { TokenNotice } from './panels/TokenNotice';
import { AreaChooser } from './panels/AreaChooser';
import { Tooltip } from './panels/Tooltip';
import { ActivityButton, ActivityPanel } from './panels/Activity';
import { installActivity } from './activityStore';
import { ErrorDetails } from './panels/ErrorDetails';
import { explainError } from './errors';
import { ZoomControls } from './panels/ZoomControls';
import { FollowBar } from './panels/FollowBar';
import { Breadcrumb } from './panels/Breadcrumb';
import { Inspector } from './panels/Inspector';
import { MapKey } from './panels/MapKey';
import { ViewPanel } from './panels/ViewPanel';
import { Transport } from './panels/Transport';
import { Trays } from './panels/Trays';
import { useChart } from './store';
import { installTestHooks } from './testHooks';
import { installDevLog, rlog, warn } from './devlog';
import { SettingsButton } from './settings/SettingsButton';
import { SettingsModal } from './settings/SettingsModal';
import { loadSettings, onSettingsChange, settingsOpen, useSettings } from './settings/store';
import { assetCtxFor } from './settings/viewer';
import { installPictureDrop } from './chart/pictureDrop';
import { DropNote } from './panels/DropNote';
import { Tour, TourOffer } from './tour/Tour';
import './v1/plan'; // registers the solar beat planner (playHooks.ts)
import { useAwards } from './v1/awards'; // and the achievements recap hook

export function App() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartApp | null>(null);
  const { stack, debug, keyOpen, error, errorNet, paradigm, set } = useChart();
  const awards = useAwards();

  useEffect(() => {
    let disposed = false;
    let chart: ChartApp | null = null;
    const unsubs: (() => void)[] = [];
    (async () => {
      try {
        chart = await ChartApp.create(canvasHost.current!, labelHost.current!, {
          onSelect: (node) => {
            rlog('tap', { key: node.canonicalKey, nodeKind: node.kind, outcome: 'select' });
            select(node.canonicalKey);
            if (node.kind === 'captain') follow(node.canonicalKey); // clicking a ship selects and follows its captain (05 §6)
          },
          onEnter: (node, via) => {
            rlog('tap', { key: node.canonicalKey, nodeKind: node.kind, outcome: 'enter', via });
            select(node.canonicalKey);
            void enterNode(node).then((ok) => {
              if (!ok) { warn('enter-nowhere', { key: node.canonicalKey, nodeKind: node.kind }); chartRef.current?.releaseWheel(); }
            });
          },
          onZoomOut: () => back(),
          onHover: (node) => set({ hoverKey: node?.canonicalKey ?? null }),
          onGo: (key, captain) => {
            goTo(key);
            if (captain) follow(captain); // Go on a departure trail follows the captain there
          },
          onUserCamera: () => { suspendFollow(); suspendFraming(); },
          // v1 expanded plates' rows (19 L2): a press selects the row's object (and shows it); a container link opens it at the source.
          onPick: (key) => { select(key); reveal(key); },
          onNowPlaying: (keys) => set({ nowPlaying: keys }), // History's *now* rows (22 B5)
          onOpenContainer: (at) => {
            const key = 'container' in at ? at.container : useChart.getState().snapshot?.workItems.get(at.piece)?.parentKey;
            if (key && caps().openInAdo) void window.starChart.openInAdo(key);
          },
        });
        onUserNavigate(suspendFollow);
        if (disposed) { chart.destroy(); return; }
        chartRef.current = chart;
        attachChart(chart);
        attachPlaybackChart(chart);
        // The viewer and their ship style (v1, 14 §4) reach the theme's assets; a change re-shows the scene.
        const c = chart;
        const syncAssets = () => c.setAssetCtx(assetCtxFor(useSettings.getState().settings, useChart.getState().history));
        unsubs.push(onSettingsChange(syncAssets), useChart.subscribe((s, p) => { if (s.history !== p.history) syncAssets(); }));
        void loadSettings().then(syncAssets);
        unsubs.push(installPictureDrop(canvasHost.current!, chart));
        installDevLog();
        installActivity();
        await boot();
        if (window.starChart.env.testMode) installTestHooks(chart);
      } catch (e) {
        const { message, net } = explainError(e);
        set({ error: message, errorNet: net });
      }
    })();
    return () => {
      disposed = true;
      for (const u of unsubs) u();
      attachChart(null);
      attachPlaybackChart(null);
      chart?.destroy();
      chartRef.current = null;
    };
  }, [set]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen()) return; // Settings has the keys while it's open (its own ↑/↓, Esc)
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      // Playback keys (05 §2; ? shows them all). Arrow keys inside a list keep moving through it.
      const inList = e.target instanceof HTMLElement && !!e.target.closest('[role="list"], [role="listbox"], .objects');
      const playKeys: Record<string, () => void> = {
        ' ': togglePlay,
        ArrowRight: e.shiftKey ? nextInView : step,
        ArrowLeft: e.shiftKey ? prevInView : prevBeat,
        Home: toStart,
        End: toEnd,
        '[': () => nudgeRate(-1),
        ']': () => nudgeRate(1),
      };
      const act = playKeys[e.key];
      if (act && !e.metaKey && !(e.key === ' ' && e.target instanceof HTMLButtonElement) && !(inList && e.key.startsWith('Arrow'))) {
        e.preventDefault();
        act();
        return;
      }
      if (!e.metaKey && !e.ctrlKey) {
        const st = useChart.getState();
        if (e.key === 'h' || e.key === 'H') { setHighlights(!st.highlights); return; }
        if (e.key === 'l' || e.key === 'L') { setLens(st.lens === 'knownThen' ? 'currentObserved' : 'knownThen'); return; }
        if (e.key === 'e' || e.key === 'E') { toggleEvents(); return; }
        if (e.key === '?') { set({ helpOpen: !st.helpOpen }); return; }
        if (e.key === 'z' || e.key === 'Z') { toggleFraming(); return; }
        if (e.key === 'f' || e.key === 'F') {
          // Follow the selected captain, or resume following.
          const captain = st.graph?.nodes.find((n) => n.kind === 'captain' && n.canonicalKey === st.selectedKey);
          if (captain) follow(captain.canonicalKey);
          else if (st.follow?.suspended) resumeFollow();
          return;
        }
      }
      // Enter on a selected object zooms into it. Buttons handle their own Enter (the object list does the same).
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        void enterSelected();
        return;
      }
      // Zoom from the keyboard (decided 2026-10-07): scroll pans now, so a mouse still has a way to zoom.
      if (!e.metaKey && !e.ctrlKey && (e.key === '+' || e.key === '=')) { chartRef.current?.zoomBy(1.25); return; }
      if (!e.metaKey && !e.ctrlKey && (e.key === '-' || e.key === '_')) { chartRef.current?.zoomBy(0.8); return; }
      if (!e.metaKey && !e.ctrlKey && e.key === '0') { chartRef.current?.resetView(); return; }
      if (e.key === 'k' || e.key === 'K') set({ keyOpen: !useChart.getState().keyOpen });
      if (e.key === 'd' || e.key === 'D') {
        const next = !useChart.getState().debug;
        set({ debug: next });
        chartRef.current?.setDebug(next);
      }
      if (e.key === 'p' || e.key === 'P') chartRef.current?.setPaint(!chartRef.current.paintOn()); // compare painted vs plain
      if (e.key === 'Escape' && useChart.getState().helpOpen) { set({ helpOpen: false }); return; }
      // Esc while a level loads cancels it (decided 2026-10-07): the object settles where it was.
      if (e.key === 'Escape' && useChart.getState().sync?.level) { cancelSync(); return; }
      if (e.key === 'Escape' || (e.key === 'ArrowLeft' && e.metaKey)) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set]);

  return (
    <div className="app" data-paradigm={paradigm}>
      <header className="titlebar">
        <span className="titlebar__brand">STAR CHART</span>
        <Breadcrumb />
        {stack.length > 1 && <button type="button" className="back" onClick={back} aria-label="Back" data-tip="Up one level" data-tip-keys="Esc · ⌘← · pinch out">‹ Back</button>}
        <Search />
        <ParadigmSwitch />
        <button type="button" className="key-button" aria-pressed={keyOpen} onClick={() => set({ keyOpen: !keyOpen })} data-tip="What each object and look means" data-tip-keys="K">Key</button>
        <ModeChip />
        <SettingsButton />
      </header>
      <main className="stage">
        <div className="chart-host" ref={canvasHost}>
          <div className="labels" ref={labelHost} />
        </div>
        <Transport />
        <DropNote />
        <Trays />
        <MapKey />
        <div className="sidepanel">
          <ViewPanel />
          <Inspector />
        </div>
        <Scrollbars chart={chartRef} />
        <ZoomControls chart={chartRef} />
        <EmptyCosmos chart={chartRef} />
        <AreaChooser />
        <ActivityPanel />
        <LoadingPlate chart={chartRef} />
        <ConnectPanel />
        <TokenNotice />
        <Tour />
        <OverlayStack>
          {error && (
            <div className="error" role="alert">
              <div className="error__head">
                <span>{error}</span>
                <button type="button" className="error__close" aria-label="Dismiss" onClick={() => set({ error: null, errorNet: null })} data-tip="Dismiss" data-tip-keys="Nothing is retried">×</button>
              </div>
              {errorNet && <ErrorDetails net={errorNet} />}
            </div>
          )}
          <LoadingBanner />
          <FollowBar />
        </OverlayStack>
      </main>
      <KeyHelp />
      <TourOffer />
      <SettingsModal awards={awards} />
      <Tooltip />
      <footer className="statusbar">
        <Coverage />
        <StatusAsOf />
        <span className="muted">Click to select · Double-click, Enter, or scroll in to enter · Esc or scroll out to go back · Space to play · ? for keys · K for map key · P to toggle paint · D for map debug</span>
        {debug && <DebugReadout chart={chartRef.current} />}
        <ActivityButton />
      </footer>
    </div>
  );
}

/**
 * Scrollbars (decided 2026-10-07): only on an axis the scene can't fit even zoomed all the way out
 * (the galaxy of a large org). Thumbs drag; a click on a track pages by one view.
 */
function Scrollbars({ chart }: { chart: React.RefObject<ChartApp | null> }) {
  const [st, setSt] = useState<ReturnType<ChartApp['scrollState']>>(null);
  useEffect(() => {
    let raf = 0;
    const same = (a: { start: number; size: number } | null | undefined, b: { start: number; size: number } | null | undefined) =>
      (!a && !b) || (!!a && !!b && Math.abs(a.start - b.start) < 1e-4 && Math.abs(a.size - b.size) < 1e-4);
    const loop = () => {
      const next = chart.current?.scrollState() ?? null;
      setSt((prev) => (same(prev?.x, next?.x) && same(prev?.y, next?.y) ? prev : next));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [chart]);
  if (!st) return null;
  const bar = (axis: 'x' | 'y', s: { start: number; size: number }) => {
    const drag = (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const track = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
      const len = axis === 'x' ? track.width : track.height;
      let last = axis === 'x' ? e.clientX : e.clientY;
      const move = (m: PointerEvent) => {
        const p = axis === 'x' ? m.clientX : m.clientY;
        chart.current?.scrollByFraction(axis === 'x' ? (p - last) / len : 0, axis === 'y' ? (p - last) / len : 0);
        last = p;
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    const page = (e: React.MouseEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const at = axis === 'x' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
      const dir = at < s.start ? -1 : at > s.start + s.size ? 1 : 0;
      if (dir) chart.current?.scrollByFraction(axis === 'x' ? dir * s.size : 0, axis === 'y' ? dir * s.size : 0);
    };
    const style = axis === 'x' ? { left: `${s.start * 100}%`, width: `${Math.max(4, s.size * 100)}%` } : { top: `${s.start * 100}%`, height: `${Math.max(4, s.size * 100)}%` };
    return (
      <div className={`scrollbar scrollbar--${axis}`} onClick={page} data-log={`scrollbar-${axis}`} aria-hidden="true">
        <div className="scrollbar__thumb" style={style} onPointerDown={drag} onClick={(e) => e.stopPropagation()} />
      </div>
    );
  };
  return <>{st.y && bar('y', st.y)}{st.x && bar('x', st.x)}</>;
}

/** ADO mode: the sync behind the scope being opened (04 §5), with its phase and a Cancel. */
/**
 * Sprints or Backlog (decided 2026-10-07): which hierarchy the chart walks. Sprints is the default and
 * centres on how a team works each sprint; Backlog is the general-purpose view. Remembered; switching
 * returns to the galaxy.
 */
function ParadigmSwitch() {
  const paradigm = useChart((s) => s.paradigm);
  // v1 (13 Q9): Solar hides the switch; the v0 views are reached by pin (or Settings' developer toggle).
  if (paradigm === 'solar') return null;
  return (
    <div className="toggle toggle--paradigm" role="group" aria-label="View">
      <button type="button" aria-pressed={paradigm === 'sprints'} data-log="paradigm-sprints" onClick={() => void setParadigm('sprints')}
        data-tip="Sprints: each sprint, its pods, and their stories" data-tip-keys="Sprint → Area Path → Story → Task">Sprints</button>
      <button type="button" aria-pressed={paradigm === 'backlog'} data-log="paradigm-backlog" onClick={() => void setParadigm('backlog')}
        data-tip="Backlog: the whole hierarchy" data-tip-keys="Area Path or Epic → Feature → Story → Task">Backlog</button>
    </div>
  );
}

/** The ? overlay: every keyboard shortcut (05 §2). */
function KeyHelp() {
  const open = useChart((s) => s.helpOpen);
  const set = useChart((s) => s.set);
  if (!open) return null;
  const rows: [string, string][] = [
    ['Space', 'Play / pause'], ['← / →', 'Previous / next beat'], ['Shift ← / →', 'Previous / next big moment in this view'],
    ['Home / End', 'Start / end'], ['[ / ]', 'Slower / faster'], ['H', 'Highlights: only the big moments'], ['L', 'Known then / Retrospective'],
    ['E', 'In view / History'], ['Scroll / pinch', 'Zoom (drag to move)'], ['+ / − / 0', 'Zoom in / out / back to the opening view'], ['F', 'Follow the selected captain / resume'], ['Z', 'Keep the action in view: on / off'], ['Enter', 'Open the selected object'], ['Esc', 'Back'], ['K', 'Map key'], ['P', 'Paint on / off'], ['?', 'These keys'],
  ];
  return (
    <div className="key-help" role="dialog" aria-label="Keyboard shortcuts" onClick={() => set({ helpOpen: false })}>
      <dl>{rows.map(([k, v]) => <div key={k}><dt className="mono">{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}

function StatusAsOf() {
  const snapshot = useChart((s) => s.snapshot);
  return <span>As of {snapshot ? new Date(snapshot.atUtc).toUTCString() : '—'}</span>;
}

function DebugReadout({ chart }: { chart: ChartApp | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  if (!chart) return null;
  const c = chart.cameraState();
  const f = chart.frameStats();
  return <span className="mono">cam {c.x.toFixed(0)},{c.y.toFixed(0)} ×{c.scale.toFixed(2)} · frame {f.p50}/{f.p95}/{f.worst} ms · {JSON.stringify(chart.counts())}</span>;
}

function Search() {
  const hasHistory = useChart((s) => Boolean(s.history));
  const inGalaxy = useChart((s) => s.stack.length === 1 && s.stack[0]?.sceneKey === 'galaxy' && (s.projects.length > 1 || caps().areaTree));
  const top = useChart((s) => s.stack.at(-1)?.sceneKey);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  // Things not in the chart yet, to add (decided 2026-10-08): the + crumb's list, read once per scene.
  const [extra, setExtra] = useState<{ key: string; label: string; meta?: string; add: () => Promise<void> }[]>([]);
  const candidates = useRef<{ at: string | undefined; list: Promise<Awaited<ReturnType<typeof addCandidates>>> } | null>(null);
  const lookFor = (text: string) => {
    const what = addable();
    const t = text.trim().toLowerCase();
    if (!what || t.length < 2) { setExtra([]); return; }
    if (candidates.current?.at !== top) candidates.current = { at: top, list: addCandidates(what).catch(() => []) };
    void candidates.current!.list.then((rows) => setExtra(rows.filter((r) => !r.inChart && (r.label.toLowerCase().includes(t) || (r.meta ?? '').toLowerCase().includes(t))).slice(0, 5)));
  };
  if (!hasHistory && !inGalaxy) return null;
  const clear = () => { setQ(''); setResults([]); setExtra([]); };
  const choose = (r: SearchResult) => {
    if (r.type === 'Project') { select(r.key); reveal(r.key); } else goTo(r.key);
    clear();
  };
  return (
    <div className="search">
      <input
        type="search"
        placeholder={inGalaxy && !hasHistory ? 'Search projects' : 'Search ID or title'}
        aria-label="Search work items"
        value={q}
        onChange={(e) => { setQ(e.target.value); setResults(search(e.target.value)); lookFor(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) choose(results[0]);
          else if (e.key === 'Enter' && extra[0]) { void extra[0].add(); clear(); }
          if (e.key === 'Escape') clear();
        }}
      />
      {(results.length > 0 || extra.length > 0) && (
        <ul className="search__results" role="listbox">
          {results.map((r) => (
            <li key={r.key}>
              <button type="button" onClick={() => choose(r)}>
                {r.type !== 'Project' && <span className="mono">#{r.id}</span>} {r.title} <span className="muted">{r.type}</span>
              </button>
            </li>
          ))}
          {extra.length > 0 && <li className="search__group">Not in the chart</li>}
          {extra.map((r) => (
            <li key={`add-${r.key}`}>
              <button type="button" className="search__add" onClick={() => { void r.add(); clear(); }} data-tip={`Add ${r.label}`} data-tip-keys={r.meta}>
                <span className="search__plus">+ Add</span> {r.label} {r.meta && <span className="muted">{r.meta}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The guided tour's overlay (23 E7, 13 §7, 06 §9) and its first-launch offer. A step is a holo plate (the R1
// label style: dark glass, cyan line, a pointer from the plate's elbow to the object's rim) anchored to a
// live object each frame, with a ring round the object. Keys: Esc closes, ←/→ step. Reduced motion: no
// pulse, and the pod advances a beat at a time while a step waits for its object.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { holoCandidates, holoVerticalCandidates, type HoloPlacement } from '../chart/holo/holoLabel';
import { liveScreen } from '../nav';
import { useChart } from '../store';
import { loadSettings, patchSettings, useSettings } from '../settings/store';
import { readTerms } from '../settings/tabs/Read';
import { activeTheme, themeById } from '../theme/registry';
import type { TourStep } from '../theme/types';
import { endTour, reach, startTour, targetNow, tourAvailable, type TourAnchor } from './tourRun';
import { useTour } from './tourStore';
import './tour.css';

const PLATE_W = 300;

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** What a plate should not cover, in canvas px, with what covering it costs: chrome and the ringed object most, labels and objects least. */
function obstacles(anchor: TourAnchor): { box: Box; w: number }[] {
  const host = document.querySelector('.chart-host')?.getBoundingClientRect();
  if (!host) return [];
  const rel = (r: DOMRect): Box => ({ x0: r.left - host.left, y0: r.top - host.top, x1: r.right - host.left, y1: r.bottom - host.top });
  const out: { box: Box; w: number }[] = [];
  for (const sel of ['.transport', '.sidepanel', '.zoom-controls']) {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r && r.width) out.push({ box: rel(r), w: 100 });
  }
  const R = anchor.r + 8;
  out.push({ box: { x0: anchor.x - R, y0: anchor.y - R, x1: anchor.x + R, y1: anchor.y + R + 34 }, w: 50 }); // the object, and the name under it
  for (const o of liveScreen()) {
    if (Math.hypot(o.x - anchor.x, o.y - anchor.y) < 1) continue;
    out.push({ box: { x0: o.x - o.r, y0: o.y - o.r, x1: o.x + o.r, y1: o.y + o.r }, w: 5 });
  }
  for (const el of document.querySelectorAll('.labels .callout, .labels .holo')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) out.push({ box: rel(r), w: 3 });
  }
  return out;
}

/** The places a plate may go for this anchor: out the way it faces, then the other way, then upright; the player's bar also sweeps along its lower edge. */
function candidatesFor(anchor: TourAnchor, box: { w: number; h: number }, size: { w: number; h: number }): HoloPlacement[] {
  if (anchor.box) {
    const out: HoloPlacement[] = [];
    const y0 = anchor.y + 14;
    for (let x0 = 8; x0 + size.w <= box.w - 8; x0 += 40) {
      const px = Math.min(Math.max(anchor.x, x0 + 10), x0 + size.w - 10);
      out.push({ rect: { x0, y0, x1: x0 + size.w, y1: y0 + size.h }, side: 'below', leader: [[px, anchor.y], [px, y0]] });
    }
    return out;
  }
  const dx = anchor.dir?.x ?? anchor.x - box.w / 2;
  const dy = anchor.dir?.y ?? anchor.y - box.h / 2;
  const len = Math.hypot(dx, dy) || 1;
  const a = { cx: anchor.x, cy: anchor.y, r: anchor.r + 6 };
  return [
    ...holoCandidates({ ...a, dirX: dx / len, dirY: dy / len }, size.w, size.h),
    ...holoCandidates({ ...a, dirX: -dx / len, dirY: -dy / len }, size.w, size.h),
    ...holoVerticalCandidates(a, size.w, size.h, dy > 0 ? 'above' : 'below'),
  ];
}

/** The steps for the open scene, in the theme's words. */
function useSteps(): TourStep[] {
  const history = useChart((s) => s.history);
  const theme = useSettings((s) => s.settings.theme);
  const pack = themeById(theme) ?? activeTheme();
  const { chart, source } = readTerms(history, pack?.words);
  return pack?.readCopy.tour(chart, source) ?? [];
}

export function Tour() {
  const { phase, step, failed, set } = useTour();
  const steps = useSteps();
  const reduced = useChart((s) => s.reducedMotion);
  const [anchor, setAnchor] = useState<TourAnchor | null>(null);
  const [waiting, setWaiting] = useState(true);
  const plate = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: PLATE_W, h: 150 });
  const [box, setBox] = useState({ w: 800, h: 600 });
  const cur = steps[step];
  const target = cur?.target; // the steps are rebuilt every render: effects key on the target alone
  const open = phase !== 'off';

  // Keys: Esc closes, ←/→ step. Captured, so the chart's own shortcuts (Back, beat stepping) stay out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); void endTour(); return; }
      if (phase !== 'step') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); if (step < steps.length - 1) set({ step: step + 1 }); else void endTour(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (step > 0) set({ step: step - 1 }); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, phase, step, steps.length, set]);

  // A new step starts unanchored and waiting, before paint, so the ring never shows on the last step's object.
  useLayoutEffect(() => { setWaiting(true); setAnchor(null); }, [phase, step, target]);

  // A step plays the pod until its object is drawn, then holds there.
  useEffect(() => {
    if (phase !== 'step' || !target) return;
    let live = true;
    void reach(target, () => live).then(() => { if (live) setWaiting(false); });
    return () => { live = false; };
  }, [phase, step, target]);

  // Follow the object every frame (the camera eases while the pod frames the action).
  useEffect(() => {
    if (phase !== 'step' || !target) { setAnchor(null); return; }
    let raf = 0;
    const loop = () => {
      const host = document.querySelector('.chart-host')?.getBoundingClientRect();
      if (host) setBox((b) => (b.w === host.width && b.h === host.height ? b : { w: host.width, h: host.height }));
      const t = targetNow(target);
      setAnchor((a) => (!t ? null : a && Math.abs(a.x - t.x) < 0.5 && Math.abs(a.y - t.y) < 0.5 && Math.abs(a.r - t.r) < 0.5 ? a : t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, target]);

  useLayoutEffect(() => {
    const el = plate.current;
    if (el && (el.offsetHeight !== size.h)) setSize((s) => ({ ...s, h: el.offsetHeight }));
  });

  // Focus the Next button on each step so Enter advances.
  useEffect(() => { if (phase === 'step') plate.current?.querySelector<HTMLElement>('[data-tour="next"]')?.focus(); }, [phase, step]);

  if (!open) return null;
  const last = step >= steps.length - 1;

  let placed: HoloPlacement | null = null;
  if (phase === 'step' && anchor) {
    const fits = (p: HoloPlacement) => p.rect.x0 >= 8 && p.rect.y0 >= 8 && p.rect.x1 <= box.w - 8 && p.rect.y1 <= box.h - 8;
    const hits = obstacles(anchor);
    // The place that fits and covers the least (the first on a tie): chrome and the ringed object cost most.
    let bestCost = Infinity;
    for (const c of candidatesFor(anchor, box, size).filter(fits)) {
      const cost = hits.reduce((n, o) => n + (overlaps(c.rect, o.box) ? o.w : 0), 0);
      if (cost < bestCost) { bestCost = cost; placed = c; if (cost === 0) break; }
    }
  }
  // No place fits (a cramped window): the plate stays inside the canvas, the pointer still drawn.
  const pos = placed
    ? { left: placed.rect.x0, top: placed.rect.y0 }
    : { left: Math.max(8, (box.w - size.w) / 2), top: Math.max(8, box.h / 2 - size.h / 2) };

  return (
    <div className={reduced ? 'tour tour--reduced' : 'tour'} role="dialog" aria-modal="false" aria-label="Guided tour" data-testid="tour" data-step={phase === 'step' ? step : undefined} data-anchored={placed ? 'true' : 'false'}>
      {anchor && (
        <svg className="tour__lines" width={box.w} height={box.h} aria-hidden="true">
          {anchor.box
            ? <rect className="tour__ring" x={anchor.box.x - 4} y={anchor.box.y - 4} width={anchor.box.w + 8} height={anchor.box.h + 8} rx={6} />
            : <circle className="tour__ring" cx={anchor.x} cy={anchor.y} r={anchor.r + 6} />}
          {placed && <polyline className="tour__leader" points={placed.leader.map((p) => p.join(',')).join(' ')} />}
        </svg>
      )}
      <div className="tour__plate" ref={plate} style={{ ...pos, width: size.w }} data-testid="tour-plate">
        {phase === 'loading' && !failed && <p className="tour__body" role="status">Opening Halcyon Reach’s Comet Pod…</p>}
        {failed && <p className="tour__body" role="alert">The demo pod couldn’t be opened, so the tour can’t play.</p>}
        {phase === 'step' && cur && (
          <>
            <p className="tour__count mono">{step + 1} of {steps.length}</p>
            <h3 className="tour__title">{cur.title}{cur.alias && <> · <span className="metaphor">{cur.alias}</span></>}</h3>
            <p className="tour__body">{cur.body}</p>
            {waiting && <p className="tour__wait muted small" role="status">Waiting for it to appear…</p>}
          </>
        )}
        <div className="tour__actions">
          <button type="button" className="enter-link enter-link--quiet" data-log="tour-close" data-tour="close" onClick={() => void endTour()}>{failed ? 'Close' : 'Skip tour'}</button>
          {phase === 'step' && (
            <>
              <button type="button" className="enter-link enter-link--quiet" data-log="tour-back" data-tour="back" disabled={step === 0} onClick={() => set({ step: step - 1 })}>← Back</button>
              <button type="button" className="enter-link" data-log="tour-next" data-tour="next" onClick={() => (last ? void endTour() : set({ step: step + 1 }))}>{last ? 'Done' : 'Next →'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The first-launch offer: once, ever (`UserSettings.tourOffered`); Settings › Read always has the tour. */
export function TourOffer() {
  const loaded = useSettings((s) => s.loaded);
  const offered = useSettings((s) => s.settings.tourOffered === true);
  const phase = useTour((s) => s.phase);
  const [armed, setArmed] = useState(false);
  const [answered, setAnswered] = useState(false);
  const env = window.starChart?.env;
  // Specs open fresh userData each time; only those that ask (STAR_CHART_TOUR_OFFER) see the offer.
  const allowed = !env?.testMode || env.tourOffer;

  useEffect(() => { void loadSettings(); }, []);
  // Offered once: marked the moment it is armed, so closing the app without answering still counts.
  useEffect(() => {
    if (!allowed || !loaded || offered || armed || !tourAvailable()) return;
    setArmed(true);
    void patchSettings({ tourOffered: true });
  }, [allowed, loaded, offered, armed]);

  if (!armed || answered || phase !== 'off') return null;
  return (
    <div className="tour-offer" role="region" aria-label="Guided tour" data-testid="tour-offer">
      <p className="tour-offer__text">New here? A one-minute tour plays the demo pod and points at each part of the chart.</p>
      <div className="tour__actions">
        <button type="button" className="enter-link enter-link--quiet" data-log="tour-decline" onClick={() => setAnswered(true)}>Not now</button>
        <button type="button" className="enter-link" data-log="tour-accept" onClick={() => { setAnswered(true); void startTour(); }}>Take the tour</button>
      </div>
      <p className="muted small">It is always under Settings › How to read the chart.</p>
    </div>
  );
}

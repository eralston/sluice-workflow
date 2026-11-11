// The guided tour's engine (23 E7, 13 §7, 06 §9). It opens Halcyon Reach's Comet Pod in the fixture, so it
// never reads or writes ADO (INV-21): from ADO mode it switches the data source to Fixture, and `endTour`
// puts it back. A step waits for its object by playing the pod (4x; one beat at a time under reduced
// motion) and pausing the moment the object is drawn on screen. Objects are found through the scene's own
// live nodes (`liveScreen`), never by coordinates of the tour's own.
import { backTo, enterNode, liveScreen, openProject, reboot } from '../nav';
import { pause, play, setRate, step as stepBeat, toStart } from '../playback';
import { closeSettings } from '../settings/store';
import { useChart } from '../store';
import type { TourTarget } from '../theme/types';
import type { Rate } from '@shared/contracts/playback';
import { useTour } from './tourStore';

export const TOUR_PROJECT = 'Halcyon Reach';
export const TOUR_POD = 'Comet Pod';
/** How long a step waits for its object before it shows without a pointer, in ms. */
export const TOUR_WAIT_MS = 25_000;
/** A node counts as drawn once its view is this opaque. */
export const SEEN_ALPHA = 0.95;
/** How long the pod keeps playing after an object is first seen, so its entrance finishes before the hold (ms). */
export const SETTLE_MS = 900;
const pinned = new Map<TourTarget, string>();
let priorRate: Rate | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let run = 0;

async function waitFor<T>(fn: () => T | null | undefined | false, token: number, ms = 20_000): Promise<T | null> {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (token !== run) return null;
    const v = fn();
    if (v) return v;
    await sleep(80);
  }
  return null;
}

/** The ADO-free route to the tour: whether this build can play it from the current view. */
export function tourAvailable(): boolean {
  return useChart.getState().paradigm === 'solar';
}

/** Opens the tour: to the Comet Pod, paused at the start, then the first step. */
export async function startTour(): Promise<void> {
  const tour = useTour.getState();
  if (tour.phase !== 'off' || !tourAvailable()) return;
  const token = ++run;
  closeSettings();
  useChart.getState().set({ connectOpen: false, helpOpen: false });
  const prior = useChart.getState().mode;
  priorRate = useChart.getState().playback?.rate ?? null;
  tour.set({ phase: 'loading', step: 0, priorMode: prior, failed: false });
  try {
    if (prior !== 'fixture') {
      await window.starChart.mode.set('fixture', { transient: true }); // never saved: a quit mid-tour boots into the saved mode
      useChart.getState().set({ mode: 'fixture' });
    }
    await reboot(); // the galaxy, afresh
    const galaxy = await waitFor(() => useChart.getState().graph?.nodes.find((n) => n.kind === 'galaxy' && n.label === TOUR_PROJECT), token);
    if (!galaxy) throw new Error('no demo project');
    await openProject(galaxy.canonicalKey);
    const star = await waitFor(() => {
      const g = useChart.getState().graph;
      return g?.sceneKey.startsWith('sprint:') ? g.nodes.find((n) => n.kind === 'star' && n.label === TOUR_POD) : null;
    }, token);
    if (!star) throw new Error('no demo pod');
    await enterNode(star);
    await waitFor(() => useChart.getState().graph?.sceneKey.startsWith('pod:') && liveScreen().length > 0, token);
    if (token !== run) return;
    pause();
    toStart();
    useTour.getState().set({ phase: 'step', step: 0 });
  } catch {
    if (token === run) useTour.getState().set({ failed: true });
  }
}

/** Closes the tour and puts the data source back. */
export async function endTour(): Promise<void> {
  const tour = useTour.getState();
  if (tour.phase === 'off') return;
  run++; // any wait in flight stops
  pause();
  if (priorRate) setRate(priorRate);
  priorRate = null;
  const prior = tour.priorMode;
  tour.set({ phase: 'off', step: 0, priorMode: null, failed: false });
  if (prior && prior !== useChart.getState().mode) {
    await window.starChart.mode.set(prior, { transient: true }); // the saved mode was never touched
    useChart.getState().set({ mode: prior });
    await reboot();
  } else {
    backTo(0);
  }
}

/** The on-screen object a step points at now, or null when it isn't drawn (or is off the canvas). */
export interface TourAnchor { x: number; y: number; r: number; /** The player's whole bar, outlined instead of a ring. */ box?: { x: number; y: number; w: number; h: number }; /** Which way the plate goes out (the player's bar sits at the top, so down); unset: away from the canvas centre. */ dir?: { x: number; y: number } }

export function targetNow(target: TourTarget): TourAnchor | null {
  if (target === 'player') {
    const el = document.querySelector('.transport');
    const host = document.querySelector('.chart-host');
    if (!el || !host) return null;
    const b = el.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return { x: b.left + b.width / 2 - h.left, y: b.bottom - h.top, r: 4, box: { x: b.left - h.left, y: b.top - h.top, w: b.width, h: b.height }, dir: { x: 0, y: 1 } };
  }
  const host = document.querySelector('.chart-host canvas')?.getBoundingClientRect();
  if (!host) return null;
  const kind = target === 'agent' ? 'captain' : target;
  const margin = 40;
  const hits = liveScreen().filter(({ node, x, y }) =>
    node.kind === kind && x > margin && y > margin && x < host.width - margin && y < host.height - margin);
  // Only what is actually drawn: a node is in the scene before its entrance has made it visible.
  const seen = hits.filter((h) => h.alpha >= SEEN_ALPHA);
  const key = pinned.get(target);
  const best = seen.find((h) => h.node.projectionKey === key) ?? seen.sort((a, b) => b.r - a.r)[0];
  if (best) pinned.set(target, best.node.projectionKey); // one object per step, not whichever is biggest this frame
  return best ? { x: best.x, y: best.y, r: Math.max(best.r, 14) } : null;
}

/**
 * Plays the pod until `target` is drawn, then pauses. Resolves true when it is on screen, false when
 * it timed out (the plate then shows without a pointer) or the step changed meanwhile.
 */
export async function reach(target: TourTarget, isCurrent: () => boolean): Promise<boolean> {
  pinned.delete(target);
  if (targetNow(target)) { pause(); return true; }
  const reduced = useChart.getState().reducedMotion;
  const end = performance.now() + TOUR_WAIT_MS;
  if (!reduced) { setRate(4); play(); }
  while (performance.now() < end && isCurrent()) {
    if (targetNow(target)) {
      // First seen: let the entrance finish before holding on it.
      if (reduced) { stepBeat(); await sleep(350); } else await sleep(SETTLE_MS);
      pause();
      return isCurrent() && !!targetNow(target);
    }
    if (reduced) { stepBeat(); await sleep(350); } else await sleep(100);
    if (useChart.getState().playback?.status === 'ended') break;
  }
  pause();
  return isCurrent() && !!targetNow(target);
}

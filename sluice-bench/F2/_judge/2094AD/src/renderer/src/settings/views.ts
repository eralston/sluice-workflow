// The developer toggle for the views (13 Q9): the app opens in Solar, and the v0 views (Sprints and
// Backlog) are reached only from Settings → Theme (or by pin, STAR_CHART_PARADIGM). Choosing one
// keeps the cog in the title bar under it (`devView`), so the way back to Solar is the same toggle.
// The App can call `chooseView` (or `backToSolar`) from anywhere else too, a key or a menu (17 W3-T1).
// The choice is remembered (23 E3): `UserSettings.devParadigm`, read by main at boot when nothing pins
// a view, so a v0 view chosen here is the one the next launch opens in (Solar again by choosing it).
import type { Paradigm } from '@shared/contracts/ipc';
import { setParadigm } from '../nav';
import { useChart } from '../store';
import { closeSettings, useSettings } from './store';

export interface ViewChoice { id: Paradigm; title: string; note: string }

/** What the toggle offers, Solar first. */
export const DEV_VIEWS: readonly ViewChoice[] = [
  { id: 'solar', title: 'Solar', note: 'v1: each team’s sprint as a solar system' },
  { id: 'sprints', title: 'Sprints (v0)', note: 'v0 board: sprint → Area Path → Story → Task' },
  { id: 'backlog', title: 'Backlog (v0)', note: 'v0 hierarchy: Area Path or Epic → Feature → Story → Task' },
];

/**
 * Switches the view: closes Settings and reboots into `p` at the galaxy (nav.setParadigm). Choosing
 * a v0 view marks it as the toggle's, so the cog stays to come back; choosing Solar clears that. If
 * the switch fails, the mark follows the view the app is now in, so a v0 view keeps the cog.
 */
export async function chooseView(p: Paradigm): Promise<void> {
  closeSettings();
  useSettings.getState().set({ devView: p !== 'solar' });
  try {
    await setParadigm(p); // also remembers it (devParadigm)
  } catch (e) {
    // Boot may have switched before it threw: any v0 view the toggle reached keeps the cog.
    useSettings.getState().set({ devView: useChart.getState().paradigm !== 'solar' });
    throw e;
  }
}

/** Back to Solar from a v0 view (the cog under v0, or any later shortcut). */
export const backToSolar = (): Promise<void> => chooseView('solar');

/** Whether Settings' cog shows: always in Solar, and in a v0 view the toggle chose. */
export function showsSettings(paradigm: Paradigm, devView: boolean): boolean {
  return paradigm === 'solar' || devView;
}

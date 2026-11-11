// The viewer's achievements in the renderer (v1, 18 §3, 14 §1.4): computed for the solar region on
// screen, only while Settings' switch is on and a viewer is chosen, and only ever the viewer's
// (18 §1). Each award is shown on the viewer's own ship: its insignia lights as the earning beat
// plays and again in the recap (the recap hook below), and Settings → Your captain lists them.
// Registered on import.
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import { achievementsFor } from '@shared/engine/achievements';
import { roundFacts } from '@shared/engine/facts';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { useMemo } from 'react';
import { activeHierarchy } from '../hierarchy';
import { registerRecapHook, type ShownAward } from '../playHooks';
import { useSettings } from '../settings/store';
import { orgOf, viewerOf } from '../settings/viewer';
import { useChart } from '../store';
import { isSolarScene } from './plan';
import { termsFor } from './lines';

/** "Local" for Swift passage's working hours: the viewer's own zone, as playback's schedule uses. */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const NONE: ShownAward[] = [];

/** One cached answer per bundle: the last scene and viewer asked for. */
const cache = new WeakMap<ScopeHistory, { sceneKey: string; viewer: CanonicalKey; awards: ShownAward[] }>();

/** The viewer's awards in a scene: [] outside a solar region, with the switch off, or with no viewer. */
export function awardsIn(h: ScopeHistory | null, sceneKey: string | null | undefined): ShownAward[] {
  if (!h || !sceneKey || !isSolarScene(sceneKey)) return NONE;
  const s = useSettings.getState().settings;
  const viewer = viewerOf(s, orgOf(h));
  if (!s.achievements || !viewer) return NONE;
  const hit = cache.get(h);
  if (hit && hit.sceneKey === sceneKey && hit.viewer === viewer) return hit.awards;
  const ref = activeHierarchy().resolve(sceneKey)!.ref;
  const pack = packFor(h);
  // Reasons in the chart's own words (the theme's register), whatever the Names toggle says.
  const awards = achievementsFor(roundFacts(h, ref, pack), viewer, pack, { tz: TZ, terms: termsFor(h, 'chart') })
    .map((a) => ({ ...a, holder: viewer }));
  cache.set(h, { sceneKey, viewer, awards });
  return awards;
}

/** The awards for the scene on screen (Settings → Your captain, the test hooks). */
export function currentAwards(): ShownAward[] {
  const st = useChart.getState();
  return awardsIn(st.history, st.graph?.sceneKey);
}

/** The same, as a hook: recomputed when the bundle, the scene or the settings change. */
export function useAwards(): ShownAward[] {
  const history = useChart((s) => s.history);
  const sceneKey = useChart((s) => s.graph?.sceneKey);
  const settings = useSettings((s) => s.settings);
  return useMemo(() => awardsIn(history, sceneKey), [history, sceneKey, settings]);
}

registerRecapHook(({ history, sceneKey }) => awardsIn(history, sceneKey));

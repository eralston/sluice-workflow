// The play gate (v1, 13 §2, 14 §1.4): where the episode may play. A level whose `playable` is false
// (the round: a map of regions, too small to read) never plays, and neither does the galaxy in a
// chain that gates its levels, so in Solar only the region plays. v0 chains declare no gate, so
// their galaxy and every level play as before. playback.ts asks before Play, Step and the beat
// keys; the player shows its "open a … to play" plate where this is false.
import { isRootScene } from '@shared/hierarchy/sceneKey';
import type { Hierarchy } from '@shared/hierarchy/types';
import { activeHierarchy } from './hierarchy';
import { useChart } from './store';

/** Whether a chain gates playback by level (any level says `playable: false`). v0 chains don't. */
export function gatesPlay(hier: Hierarchy): boolean {
  return hier.levels.some((l) => l.playable === false);
}

/** Whether a scene of the chain plays: not a gated chain's galaxy, nor a level with `playable: false`. */
export function playableAt(sceneKey: string | undefined, hier: Hierarchy = activeHierarchy()): boolean {
  if (!gatesPlay(hier)) return true;
  if (!sceneKey || isRootScene(sceneKey)) return false;
  return hier.resolve(sceneKey)?.def.playable !== false;
}

/** Whether the scene on screen plays (14 §1.4). */
export function playableHere(): boolean {
  return playableAt(useChart.getState().graph?.sceneKey);
}


// The v1 gallery families (13-game-design.md §4), one module each so they can be designed side by
// side. Each cycling cell steps through its states and colourways every CYCLE_S seconds.
import type { Section } from '../types';
import { sections as worlds } from './worlds';
import { sections as asteroids } from './asteroids';
import { sections as swarm } from './swarm';
import { sections as stations } from './stations';
import { sections as fleet } from './fleet';

/** Every v1 family clips its cells: their effects reach well past the art. */
export const V1_SECTIONS: Section[] = [...worlds, ...asteroids, ...swarm, ...stations, ...fleet].map((s) => ({ ...s, clip: true }));

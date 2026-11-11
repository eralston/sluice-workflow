// The Star Chart theme's words (12 §2–§3, the "Game form" column): the chart register. Terminology
// (engine/terminology.ts) takes these as `opts.chart`; anything left out falls back to the engine's
// own words, so the rungs keep their ladder names (09 §1). Never a source name ("User Story") here.
import type { SourceWords } from '@shared/engine/types';

export const words: Partial<SourceWords> = {
  role: {
    objective: { one: 'asteroid', many: 'asteroids' },
    threat: { one: 'enemy ship', many: 'enemy ships' },
    step: { one: 'augmentation', many: 'augmentations' },
    facility: { one: 'station', many: 'stations' },
    attachment: { one: 'tender shuttle', many: 'tender shuttles' },
    guard: { one: 'point defense', many: 'point defenses' },
    // Containers aren't drawn (12 §3): the engine's word stands.
  },
  agent: { one: 'captain', many: 'captains' },
  level: {
    workspace: { one: 'galaxy', many: 'galaxies' },
    round: { one: 'sector', many: 'sectors' },
    region: { one: 'solar system', many: 'solar systems' },
    seat: { one: 'homeworld', many: 'homeworlds' }, // the kind map's word too (22 B2)
    frontier: { one: 'frontier belt', many: 'frontier belts' },
  },
};

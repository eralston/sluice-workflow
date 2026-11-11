// v1 gallery family: worlds, the seat planets (13-game-design.md §4.1). One cell per world line steps
// through the five stages of own share; then outcomes accumulating on each line's surface; then seed
// variety within each line, and the seed picking the line.
import { fnv1a32 } from '@shared/hash';
import { WorldView, worldLineOf, worldRung, type WorldLine } from '../../chart/art/worlds';
import type { CycleStep, Item, Section } from '../types';

/** Close to a seat planet's size in the system view. */
const R = 46;
const SHARES = [0, 25, 50, 75, 100] as const;
const SHARE_NAME = ['0', '¼', '½', '¾', '1'];

const STAGE_LOOK: Record<WorldLine, string[]> = {
  terran: ['barren rock', 'first green in the lowlands', 'terraforming front, clouds form', 'developed, city glints', 'lush, city lights'],
  glacial: ['storm-scoured ice', 'ice breaking, dark seas', 'thaw, heavy rain bands', 'rain world, green coasts', 'ocean world, coastal lights'],
  volcanic: ['molten, cracked with fire', 'crust cooling into black plates', 'canyons opening, steam vents', 'riven canyons, first cliff lights', 'canyon world, cliff cities lit'],
};
/** How the rung shows on the rim and halo at each share. */
const RUNG_LIGHT = [
  'Ready: grey rim, receding; a 12 s breath',
  'Underway: blue rim and halo; the 2.4 s pulse runs the line of change',
  'Underway: blue rim and halo; the 2.4 s pulse runs the line of change',
  'Nearing: violet rim, gold creeping in at the limb; quicker pulse',
  'Accomplished: soft gold halo, still; only the settlement lights glimmer',
];
const LINE_NAME: Record<WorldLine, string> = { terran: 'Terran', glacial: 'Glacial', volcanic: 'Volcanic' };
const LINES: WorldLine[] = ['terran', 'glacial', 'volcanic'];

/** Invented people: each line's demo seed, and seeds for variety. */
const seed = (name: string) => fnv1a32(`person|${name}`);
const LINE_SEED: Record<WorldLine, number> = { terran: seed('orla'), glacial: seed('yuna'), volcanic: seed('mirren') };
const VARIETY = ['ines', 'bram', 'kasimir', 'yuna', 'oskar'];

const shareSteps = (line: WorldLine): CycleStep[] => SHARES.map((pct, i) => ({
  label: `share ${SHARE_NAME[i]} · ${STAGE_LOOK[line][i]}`,
  stage: `world.${line}.${pct}`,
  rung: worldRung(pct / 100),
  note: RUNG_LIGHT[i],
}));

const OUTCOMES: [number, number, string][] = [
  [0, 0, 'no outcomes yet'],
  [1, 0, '1 megastructure'],
  [1, 1, '1 megastructure · 1 research facility'],
  [2, 2, '2 megastructures · 2 research facilities'],
  [4, 4, '4 of each (the most shown)'],
];
const OUTCOME_SHARE: Record<WorldLine, number> = { terran: 75, glacial: 100, volcanic: 50 };
const outcomeSteps = (line: WorldLine): CycleStep[] => OUTCOMES.map(([m, r, label]) => ({
  label,
  stage: `world.${line}.${OUTCOME_SHARE[line]}.m${m}r${r}`,
  rung: worldRung(OUTCOME_SHARE[line] / 100),
  note: 'Megastructure (landed objective): gold arcology wheel. Research facility (defeated threat): white dome with three pods',
}));

const items: Item[] = [
  ...LINES.map((line) => ({
    id: `${line}-share`,
    title: `${LINE_NAME[line]} · own share 0 → 1`,
    note: STAGE_LOOK[line].join(' → '),
    ado: ['Assignee in the pod’s sprint: share of own Stories and Bugs Closed'],
    make: () => new WorldView(R, LINE_SEED[line], { line }),
    cycle: shareSteps(line),
  })),
  ...LINES.map((line) => ({
    id: `${line}-outcomes`,
    title: `${LINE_NAME[line]} · outcomes accumulate (share ${SHARE_NAME[SHARES.indexOf(OUTCOME_SHARE[line] as (typeof SHARES)[number])]})`,
    note: 'Outcomes on the surface',
    ado: ['Closed Stories (megastructures) and Closed Bugs (research facilities)'],
    make: () => new WorldView(R, LINE_SEED[line], { line }),
    cycle: outcomeSteps(line),
  })),
  ...LINES.map((line) => ({
    id: `${line}-seeds`,
    title: `${LINE_NAME[line]} · seed variety (share 1)`,
    note: 'Seed varies the look only; never the state',
    make: () => new WorldView(R, seed(VARIETY[0]!), { line }),
    cycle: VARIETY.map((name) => ({
      label: `seed “${name}”`,
      make: () => new WorldView(R, seed(name), { line }),
      stage: `world.${line}.100.m1r1`,
      rung: 'accomplished' as const,
    })),
  })),
  {
    id: 'seed-line',
    title: 'Terran, Glacial or Volcanic · the seed picks the line (share ½)',
    note: 'Each person’s line comes from their stable seed, like their ship',
    make: () => new WorldView(R, seed(VARIETY[0]!)),
    cycle: VARIETY.map((name) => ({
      label: `seed “${name}” · ${LINE_NAME[worldLineOf(seed(name))]}`,
      make: () => new WorldView(R, seed(name)),
      stage: 'world.50.m1r0',
      rung: 'underway' as const,
    })),
  },
];

export const sections: Section[] = [
  { key: 'v1-worlds', title: 'Worlds · seat planets: Terran, Glacial and Volcanic lines, transformed by own share', items },
];

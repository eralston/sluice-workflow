// v1 gallery family: objective asteroids (13-game-design.md §4.2). One cell per material cycling every
// state, cells cycling the step augmentations, seeds per material, and the three at chart size.
// Every cycle has seven steps, so each review copy shows one coherent column of the family.
import { Container } from 'pixi.js';
import { AsteroidView, type AsteroidMaterial } from '../../chart/art/asteroids';
import { AtlasAsteroidView } from '../../chart/art/asteroidAtlas';
import { AURA_FLARE_MS, flareShare } from '../../chart/art/aura';
import { motion } from '../../chart/art/motion';
import { HiveShipView, SWARMS } from '../../chart/art/swarm';
import { BAKE_SEEDS } from '../../chart/art/asteroidAtlasKeys';
import type { Rung } from '../../chart/art/progress';
import type { ArtView, CycleStep, Item, Section } from '../types';

const R = 36;
const CHART_R = 24;

interface State { key: string; label: string; rung: Rung; note: string; steps: string }

/** The six looks (plus Ready to Accept), with the Tasks a Story typically has at each. */
const STATES: State[] = [
  { key: 'sketch', label: 'New', rung: 'ready', note: 'Sensor contact: a radar wireframe, already in its blue outline. Story · New', steps: 'nnn' },
  { key: 'ready', label: 'Ready', rung: 'ready', note: 'Rough, worn stone; the material barely shows. Story · Ready', steps: 'nnn' },
  { key: 'underway', label: 'Active', rung: 'underway', note: 'Laser-cut facets bare the material; cut lines glow blue. Story · Active', steps: 'can' },
  { key: 'resolved', label: 'Resolved', rung: 'nearing', note: 'Gantry arches rising over it, crane jibs at the tips, violet work light. Story · Resolved', steps: 'cca' },
  { key: 'accept', label: 'Ready to Accept', rung: 'nearing', note: 'The arches nearly meet at the crown, gold creeping into the foot lights. Story · Ready to Accept', steps: 'ccc' },
  { key: 'accomplished', label: 'Closed', rung: 'accomplished', note: 'Orbital emblem: a round orb (22 A12): a gold hoop round the processed core and its compact mine (two crossing catwalk bands, two girders, gold rivets), gently lit, nearly still, in a round victory-gold outline. Story · Closed', steps: '' },
  { key: 'ghost', label: 'Removed', rung: 'off', note: 'A drifting ghost: desaturated, dashed. Story · Removed', steps: '' },
];

const stage = (material: AsteroidMaterial, state: string, steps: string) => `asteroid.${material}.${state}:${steps}`;

const stateCycle = (material: AsteroidMaterial): CycleStep[] =>
  STATES.map((s) => ({ label: s.label, stage: stage(material, s.key, s.steps), rung: s.rung, note: s.note }));

const TITLE: Record<AsteroidMaterial, string> = {
  metal: 'metal (iron-nickel)',
  crystal: 'crystal',
  energy: 'energy (core in dark rock)',
};

const SEEDS: Record<AsteroidMaterial, number> = { metal: 11, crystal: 23, energy: 707 };

/** Three asteroids side by side at their chart size, sharing one stage cycle. */
class ChartSize implements ArtView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'celestial' as const;
  private readonly views: AsteroidView[];
  constructor() {
    this.views = (['metal', 'crystal', 'energy'] as AsteroidMaterial[]).map((m, i) => {
      const v = new AsteroidView(CHART_R, SEEDS[m] + 100, m);
      v.root.x = v.marks.x = (i - 1) * 120;
      this.root.addChild(v.root);
      this.marks.addChild(v.marks);
      return v;
    });
  }
  setStage(stage: string): void {
    // The stage names a state and steps; each asteroid keeps its own material.
    const rest = stage.split('.').slice(2).join('.');
    for (const v of this.views) v.setStage(`asteroid.${v.material}.${rest}`);
  }
  setLightFrom(x: number, y: number): void {
    for (const v of this.views) v.setLightFrom(x - this.root.x, y - this.root.y);
  }
  tick(seconds: number): void {
    for (const v of this.views) v.tick(seconds);
  }
  destroy(): void {
    for (const v of this.views) v.destroy();
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}

/**
 * The three outlines side by side (27 B3): an open asteroid (blue), an open hive ship (red) and a closed platform (gold).
 * Gold rests at red's and blue's contrast; once per loop a victory flares it to full, and it settles over AURA_FLARE_MS.
 * No flare under reduced motion.
 */
class OutlineFlare implements ArtView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'celestial' as const;
  private readonly rock = new AsteroidView(R, SEEDS.metal, 'metal');
  private readonly ship = new HiveShipView({ style: 0, colourway: 0 }, 58);
  private readonly platform = new AsteroidView(R, SEEDS.metal, 'metal');
  private from: number | null = null;
  constructor() {
    this.rock.setStage(stage('metal', 'underway', 'can'));
    this.ship.setStage(`threat.${SWARMS[0]!.key}.ready`);
    this.platform.setStage(stage('metal', 'accomplished', ''));
    [this.rock, this.ship, this.platform].forEach((v, i) => {
      v.root.x = v.marks.x = (i - 1) * 130;
      this.root.addChild(v.root);
      this.marks.addChild(v.marks);
    });
  }
  setStage(): void {}
  tick(seconds: number): void {
    const flareS = AURA_FLARE_MS / 1000;
    if (this.from === null || seconds < this.from) this.from = seconds;
    const phase = (seconds - this.from) % (flareS + 2);
    this.platform.setAuraFlare(motion.reduced || phase >= flareS ? 0 : flareShare(phase / flareS));
    for (const v of [this.rock, this.ship, this.platform]) v.tick(seconds);
  }
  destroy(): void {
    for (const v of [this.rock, this.ship, this.platform]) v.destroy();
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}

/** Procedural (left) and atlas-baked (right) side by side at the same stage (23 C7); the atlas holds no steps. */
class AtlasPair implements ArtView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'celestial' as const;
  private readonly views: (AsteroidView | AtlasAsteroidView)[];
  constructor(m: AsteroidMaterial) {
    // Seeds are the atlas's own bake seeds, so the pair shows the same rock.
    this.views = [new AsteroidView(R, BAKE_SEEDS[m][0]!, m), new AtlasAsteroidView(R, BAKE_SEEDS[m][0]!, m)];
    this.views.forEach((v, i) => {
      v.root.x = v.marks.x = (i - 0.5) * 120;
      this.root.addChild(v.root);
      this.marks.addChild(v.marks);
    });
  }
  setStage(stage: string): void { for (const v of this.views) v.setStage(stage); }
  setLightFrom(x: number, y: number): void { for (const v of this.views) v.setLightFrom(x - this.root.x, y - this.root.y); }
  tick(seconds: number): void { for (const v of this.views) v.tick(seconds); }
  destroy(): void {
    for (const v of this.views) v.destroy();
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}

const atlasCells: Item[] = (['metal', 'crystal', 'energy'] as AsteroidMaterial[]).map((m) => ({
  id: `atlas-${m}`,
  title: `atlas · ${m}: procedural (left) beside baked (right)`,
  note: 'The baked atlas (assets/atlas, 23 C7) beside the procedural art, every state it covers; its outline is a live layer',
  ado: ['User Story'],
  wide: true,
  make: () => new AtlasPair(m),
  cycle: STATES.map((s) => ({ label: s.label, stage: stage(m, s.key, ''), rung: s.rung, note: s.note })),
}));

const materialCells: Item[] = (['metal', 'crystal', 'energy'] as AsteroidMaterial[]).map((m) => ({
  id: `states-${m}`,
  title: `asteroid · ${TITLE[m]}`,
  note: 'Every state of one Story',
  ado: ['User Story'],
  make: () => new AsteroidView(R, SEEDS[m], m),
  cycle: stateCycle(m),
}));

/** Step mixes: 0 of 3 done → 3 of 3 done, then six working at once. */
const AUG_METAL: [string, string, string][] = [
  ['underway', 'nnn', '3 steps, none started: strap outlines, waiting'],
  ['underway', 'ann', '1 of 3 working: a plate going on under a blue light'],
  ['underway', 'aan', '2 of 3 working'],
  ['underway', 'can', '1 done (gold rivet), 1 working, 1 waiting'],
  ['underway', 'cca', '2 done, 1 working'],
  ['underway', 'ccc', 'All 3 done: plates fixed, still'],
  ['underway', 'aaaaaa', 'Six at once: every strap working'],
];
const AUG_CRYSTAL: [string, string, string][] = [
  ['ready', 'nnnnnn', '6 steps planned: six strap outlines'],
  ['underway', 'annnnn', '1 of 6 working'],
  ['underway', 'caannn', '1 done, 2 working'],
  ['underway', 'cccaan', '3 done, 2 working'],
  ['underway', 'ccccca', '5 done, 1 working'],
  ['underway', 'cccccc', 'All 6 done'],
  ['resolved', 'cccccc', 'All done, under the rising arches'],
];
const augCycle = (material: AsteroidMaterial, mixes: [string, string, string][]): CycleStep[] =>
  mixes.map(([state, steps, note]) => ({
    label: `${state === 'underway' ? 'Active' : state === 'ready' ? 'Ready' : 'Resolved'} · ${steps.replace(/n/g, '○').replace(/a/g, '●').replace(/c/g, '★')}`,
    stage: stage(material, state, steps), rung: state === 'underway' ? 'underway' : state === 'ready' ? 'ready' : 'nearing', note,
  }));

const augCells: Item[] = [
  { id: 'aug-metal', title: 'augmentations · metal', note: 'Tasks as plates strapped to the rim', ado: ['Task · New / Active / Closed'], make: () => new AsteroidView(R, 41, 'metal'), cycle: augCycle('metal', AUG_METAL) },
  { id: 'aug-crystal', title: 'augmentations · crystal, six sockets', note: 'Tasks as plates strapped to the rim', ado: ['Task · New / Active / Closed'], make: () => new AsteroidView(R, 53, 'crystal'), cycle: augCycle('crystal', AUG_CRYSTAL) },
];

const seedCells: Item[] = (['metal', 'crystal', 'energy'] as AsteroidMaterial[]).map((m) => ({
  id: `seeds-${m}`,
  title: `seeds · ${m}`,
  note: 'Seed varies the shape only',
  ado: ['User Story · Active'],
  make: () => new AsteroidView(R, 1000, m),
  cycle: [101, 202, 303, 404, 505, 606, 707].map((seed) => ({
    label: `seed ${seed}`, rung: 'underway' as Rung, note: 'Active, steps ●★○',
    make: () => {
      const v = new AsteroidView(R, seed, m);
      v.setStage(stage(m, 'underway', 'acn'));
      return v;
    },
  })),
}));

/** The Accomplished platform: every material, several seeds, at gallery and chart size. */
const platformCells: Item[] = (['metal', 'crystal', 'energy'] as AsteroidMaterial[]).map((m) => ({
  id: `platform-${m}`,
  title: `orbital platform · ${m}`,
  note: 'Closed Story: an orbital emblem, seeds vary the core and the tilt of its bands',
  ado: ['User Story · Closed'],
  make: () => {
    const v = new AsteroidView(R, SEEDS[m], m);
    v.setStage(stage(m, 'accomplished', ''));
    return v;
  },
  cycle: [101, 202, 303, 404, 505, 606, 707].map((seed) => ({
    label: `seed ${seed}`, rung: 'accomplished' as Rung, note: 'Orbital emblem: a round gold orb, lit gold, nearly still',
    make: () => {
      const v = new AsteroidView(R, seed, m);
      v.setStage(stage(m, 'accomplished', ''));
      return v;
    },
  })),
}));

const flareCell: Item = {
  id: 'outline-flare',
  title: 'outlines · victory gold beside red and blue (27 B3)',
  note: 'Gold rests at red\'s and blue\'s contrast; a victory flares it to full, then it settles over 1.6 s',
  wide: true,
  make: () => new OutlineFlare(),
};

const offCell: Item = {
  id: 'off-ladder',
  title: 'off the ladder · metal',
  note: 'Deferred, Removed, unknown',
  make: () => new AsteroidView(R, 71, 'metal'),
  cycle: [
    { label: 'Ready', stage: 'asteroid.metal.ready:nn', rung: 'ready', note: 'For comparison' },
    { label: 'Deferred', stage: 'asteroid.metal.deferred:nn', rung: 'ready', note: 'Ready, dimmed, with pause bars' },
    { label: 'Removed', stage: 'asteroid.metal.ghost', rung: 'off', note: 'A drifting ghost, dashed' },
    { label: 'unknown', stage: 'asteroid.metal.mystery', rung: 'off', note: 'Neutral grey with “?” (INV-11)' },
    { label: 'Ready', stage: 'asteroid.metal.ready:nn', rung: 'ready', note: 'For comparison' },
    { label: 'Deferred', stage: 'asteroid.metal.deferred:nn', rung: 'ready', note: 'Ready, dimmed, with pause bars' },
    { label: 'Removed', stage: 'asteroid.metal.ghost', rung: 'off', note: 'A drifting ghost, dashed' },
  ],
};

const chartCell: Item = {
  id: 'chart-size',
  title: `at chart size (r ${CHART_R}) · metal, crystal, energy`,
  note: 'Readable small',
  ado: ['User Story'],
  wide: true,
  make: () => new ChartSize(),
  cycle: stateCycle('metal'),
};

export const sections: Section[] = [
  {
    key: 'v1-asteroids',
    title: 'v1 · Objectives: asteroids (User Stories), with step augmentations (Tasks)',
    items: [...materialCells, ...atlasCells, chartCell, ...platformCells, flareCell, ...augCells, offCell, ...seedCells],
  },
];

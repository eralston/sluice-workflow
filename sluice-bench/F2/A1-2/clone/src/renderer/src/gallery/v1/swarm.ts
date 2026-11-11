// v1 gallery family: threats, the enemy hive ships (13-game-design.md §4.3). Each swarm cycles
// through every look up the ladder (east, then west), through every hostile colourway, and through
// mixes of its steps (which weapon pods are live). A captain ship sits beside one for scale. Development only.
import { Container, Graphics } from 'pixi.js';
import { HOSTILE, HiveShipView, SWARMS, THREAT_LOOKS } from '../../chart/art/swarm';
import { seedFor, ShipView } from '../../chart/art/ships';
import type { ArtView, CycleStep, Item, Section } from '../types';

const stageOf = (style: number, look: string, steps?: string) => `threat.${SWARMS[style]!.key}.${look}${steps ? `|${steps}` : ''}`;

/** Each swarm's home colourway in the gallery, so the three read apart at a glance. */
const HOME = [0, 5, 2];

/** The lifecycle ends on `platform`: an orbital emblem hanging in low orbit on the planet's lit edge. The old on-planet `facility` look is deprecated and hidden. */
const lookCycle = (style: number): CycleStep[] => THREAT_LOOKS.filter((l) => l.key !== 'facility').map((l) => ({
  label: l.label, stage: stageOf(style, l.key), rung: l.rung, note: `${l.sdlc} · ${l.note}`,
}));

const colourCycle = (style: number): CycleStep[] => HOSTILE.map((c, cw) => ({
  label: c.name, stage: stageOf(style, 'underway'), rung: 'underway',
  note: `Colourway ${cw + 1} of ${HOSTILE.length}`,
  make: () => new HiveShipView({ style, colourway: cw }),
}));

/** Steps are weapon pods: n and a charging (New, Active), c dark and disabled (Closed). */
const LOCK_MIXES: [string, string, string][] = [
  ['ready', 'nnn', 'Three Tasks, all New: pods marked'],
  ['underway', 'ann', 'One Task Active: its pod under fire'],
  ['underway', 'aan', 'Two Active, one New'],
  ['underway', 'cac', 'Two Closed: pods dark and disabled'],
  ['nearing', 'cca', 'Resolved, one Task still Active'],
  ['nearing', 'ccc', 'Resolved, every Task Closed'],
  ['underway', 'a', 'A single Task'],
  ['underway', '', 'No Tasks: every pod live'],
];
const STEP_NAME = { n: 'New', a: 'Active', c: 'Closed' } as const;
const lockCycle = (style: number): CycleStep[] => LOCK_MIXES.map(([look, steps, note]) => ({
  label: steps ? [...steps].map((s) => STEP_NAME[s as keyof typeof STEP_NAME]).join(' · ') : 'no steps',
  stage: stageOf(style, look, steps || '-'), rung: look === 'ready' ? 'ready' : look === 'nearing' ? 'nearing' : 'underway', note,
}));

/** A captain ship beside a hive ship, to check the footprint (13 §4.5: about the same size). */
class ScaleCheck implements ArtView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'hardware' as const;
  private readonly ship = new ShipView(seedFor(1, 7), 70);
  private readonly threat = new HiveShipView({ style: 0, colourway: 0 });
  constructor() {
    this.ship.root.position.set(-60, 30);
    this.ship.root.scale.set(0.75);
    this.threat.root.position.set(40, -10);
    this.threat.marks.position.set(40, -10);
    this.threat.root.scale.set(0.75);
    this.threat.marks.scale.set(0.75);
    this.threat.setStage(stageOf(0, 'ready'));
    this.threat.face(-1);
    this.root.addChild(this.ship.root, this.threat.root);
    this.marks.addChild(this.threat.marks);
  }
  setStage(): void {}
  tick(seconds: number): void {
    this.ship.tick(seconds);
    this.threat.tick(seconds);
  }
  destroy(): void {
    this.ship.destroy();
    this.threat.destroy();
  }
}

/**
 * The on-chart size ladder (art audit 2026-10-12): the three swarms, both headings, at a threat's
 * floor (about 29 px long, sizing.ts) and at about 58 px, in the Ready look. Flat: silhouettes.
 */
class Ladder implements ArtView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'hardware' as const;
  private readonly ships: HiveShipView[] = [];

  constructor(flat = false) {
    const body = new Container();
    if (flat) {
      this.root.addChild(new Graphics().roundRect(-200, -88, 400, 176, 6).fill({ color: 0xe9e3cf }));
      body.tint = 0x0b1220;
      this.marks.visible = false;
    }
    this.root.addChild(body);
    const put = (style: number, dir: number, len: number, x: number, y: number) => {
      const v = new HiveShipView({ style, colourway: HOME[style]! }, len);
      v.setStage(stageOf(style, 'ready'));
      v.face(dir);
      for (const c of [v.root, v.marks]) c.position.set(x, y);
      body.addChild(v.root);
      this.marks.addChild(v.marks);
      this.ships.push(v);
    };
    SWARMS.forEach((_, style) => [1, -1].forEach((dir, d) => put(style, dir, 29, (style * 2 + d - 2.5) * 62, -60)));
    SWARMS.forEach((_, style) => [1, -1].forEach((dir, d) => put(style, dir, 58, (style * 2 + d - 2.5) * 66, 0 + (d ? 38 : 0))));
  }

  setStage(): void {}
  tick(seconds: number): void {
    for (const s of this.ships) s.tick(seconds);
  }
  destroy(): void {
    for (const s of this.ships) s.destroy();
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}

const items: Item[] = [
  { id: 'ladder', title: 'Size ladder · 29 px, then 58 px', note: 'The smallest and the usual on-chart sizes (sizing.ts)', wide: true, ado: ['Bug · Ready'], make: () => new Ladder() },
  { id: 'ladder-flat', title: 'Size ladder · silhouettes', note: 'Reads as a bug-ship by shape alone', wide: true, make: () => new Ladder(true) },
  ...SWARMS.flatMap((sw, style): Item[] => [
    {
      id: `${sw.key}-east`, title: `${sw.name} · every look · east`, note: sw.nod, wide: true,
      ado: ['Bug'], stage: stageOf(style, 'sketch'), cycle: lookCycle(style),
      make: () => new HiveShipView({ style, colourway: HOME[style]! }),
    },
    {
      id: `${sw.key}-west`, title: `${sw.name} · every look · west`, note: sw.nod, face: -1,
      ado: ['Bug'], stage: stageOf(style, 'sketch'), cycle: lookCycle(style),
      make: () => new HiveShipView({ style, colourway: (HOME[style]! + 3) % HOSTILE.length }),
    },
    {
      id: `${sw.key}-colourways`, title: `${sw.name} · colourways`, note: 'Hostile palette only',
      ado: ['Bug · Active'], stage: stageOf(style, 'underway'), cycle: colourCycle(style),
      make: () => new HiveShipView({ style, colourway: 0 }),
    },
    {
      id: `${sw.key}-locks`, title: `${sw.name} · weapon pods (Tasks)`, note: 'Each Task is one weapon pod; Closed goes dark', face: style === 1 ? -1 : 1,
      ado: ['Task · New, Active, Closed'], stage: stageOf(style, 'underway'), cycle: lockCycle(style),
      make: () => new HiveShipView({ style, colourway: (HOME[style]! + 1) % HOSTILE.length }),
    },
  ]),
  {
    id: 'scale', title: 'Scale · beside a captain ship', note: 'Both at 0.75×: the same footprint (INV-19)', wide: true,
    ado: ['Bug · Ready; a person'], make: () => new ScaleCheck(),
  },
];

export const sections: Section[] = [
  { key: 'v1-swarm', title: 'Threats · enemy hive ships (Bugs): Reaver, Brood and Stinger swarms', items },
];

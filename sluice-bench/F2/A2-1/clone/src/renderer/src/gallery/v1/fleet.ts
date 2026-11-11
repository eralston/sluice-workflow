// v1 gallery family: the fleet, hero captain ships (13-game-design.md §4.5). One cell per hull and
// heading, each cycling through every colourway; the Mecha fighter's transformation; and two lineups
// at small size, one in colour and one as flat silhouettes (each faction must read by shape alone).
import { Container, Graphics } from 'pixi.js';
import { CaptainView, COLOURWAYS, FACTIONS, FLEET_HULLS, posesOf } from '../../chart/art/fleet';
import type { ArtView, CycleStep, Item, Section } from '../types';

const SIZE = 35; // half-length: about 70 px long
const SMALL = 20; // about 40 px long
const N = COLOURWAYS.length;
const titleOf = (h: number) => `${FACTIONS.find((f) => f.key === FLEET_HULLS[h]!.faction)!.title} · ${FLEET_HULLS[h]!.name}`;
const ADO = ['Person: assignee, PR author or reviewer (no state)'];

/** Every colourway in turn, starting from `from`. */
const colourSteps = (h: number, dir: number, from: number): CycleStep[] =>
  Array.from({ length: N }, (_, i) => {
    const c = (from + i) % N;
    return { label: COLOURWAYS[c]!.name, note: `${FLEET_HULLS[h]!.nod} · ${dir > 0 ? 'east' : 'west'}`, make: () => new CaptainView({ hull: h, colourway: c }, SIZE) };
  });

/** All nine hulls in three faction rows; flat silhouettes on an ivory card when `flat`. */
class Lineup implements ArtView {
  readonly root = new Container();
  readonly layer = 'hardware' as const;
  private readonly ships: CaptainView[] = [];

  constructor(offset: number, private readonly flat = false) {
    const ships = new Container();
    if (flat) {
      this.root.addChild(new Graphics().roundRect(-200, -88, 400, 176, 6).fill({ color: 0xe9e3cf }));
      ships.tint = 0x0b1220; // v8 tint is inherited: every face goes to one ink tone
    }
    this.root.addChild(ships);
    for (let h = 0; h < FLEET_HULLS.length; h++) {
      const v = new CaptainView({ hull: h, colourway: (offset + h * 3) % N }, SMALL);
      v.face(h % 2 ? -1 : 1);
      v.root.position.set((((h % 3) - 1) * 125), (Math.floor(h / 3) - 1) * 56);
      ships.addChild(v.root);
      this.ships.push(v);
    }
  }

  setStage(): void {}
  tick(seconds: number): void {
    for (const s of this.ships) s.tick(seconds);
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/**
 * The on-chart size ladder (art audit 2026-10-12): all nine hulls in a row at the smallest size a
 * captain ship shows (sizing.ts floor, about 29 px long), then in a grid at about 58 px, the usual
 * size. A ship that doesn't read as a ship here fails, whatever it looks like close up.
 */
class Ladder implements ArtView {
  readonly root = new Container();
  readonly layer = 'hardware' as const;
  private readonly ships: CaptainView[] = [];

  constructor(offset: number, flat = false) {
    const ships = new Container();
    if (flat) {
      this.root.addChild(new Graphics().roundRect(-200, -88, 400, 176, 6).fill({ color: 0xe9e3cf }));
      ships.tint = 0x0b1220;
    }
    this.root.addChild(ships);
    const put = (h: number, size: number, x: number, y: number) => {
      const v = new CaptainView({ hull: h, colourway: (offset + h * 3) % N }, size);
      v.face(h % 2 ? -1 : 1);
      v.root.position.set(x, y);
      ships.addChild(v.root);
      this.ships.push(v);
    };
    for (let h = 0; h < FLEET_HULLS.length; h++) put(h, 14.5, (h - 4) * 43, -70);
    for (let h = 0; h < FLEET_HULLS.length; h++) put(h, 29, ((h % 3) - 1) * 125, -26 + Math.floor(h / 3) * 46);
  }

  setStage(): void {}
  tick(seconds: number): void {
    for (const s of this.ships) s.tick(seconds);
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

const hullCells = (dir: number): Item[] => FLEET_HULLS.map((hull, h) => ({
  id: `fleet-${h}-${dir > 0 ? 'east' : 'west'}`,
  title: `${titleOf(h)} · ${dir > 0 ? 'east' : 'west'}`,
  note: hull.nod,
  ado: ADO,
  face: dir,
  make: () => new CaptainView({ hull: h, colourway: 0 }, SIZE),
  cycle: colourSteps(h, dir, dir > 0 ? h % N : (h + 4) % N),
}));

const transforming = FLEET_HULLS.findIndex((h) => Object.keys(h.poses).length > 1);

export const sections: Section[] = [
  {
    key: 'v1-fleet',
    title: `Fleet · captain ships (${FLEET_HULLS.length} hulls × ${N} colourways; Trek, Wars, Mecha)`,
    items: [
      {
        id: 'fleet-lineup', title: 'Lineup · 40 px', note: 'Rows: Trek, Wars, Mecha. Alternate headings', ado: ADO, wide: true,
        make: () => new Lineup(0),
        cycle: Array.from({ length: N }, (_, i) => ({ label: `colourways from ${COLOURWAYS[i]!.name}`, make: () => new Lineup(i) })),
      },
      {
        id: 'fleet-silhouette', title: 'Silhouettes · 40 px', note: 'Shape alone must tell the faction (INV-20)', wide: true,
        make: () => new Lineup(0, true),
      },
      { id: 'fleet-ladder', title: 'Size ladder · 29 px, then 58 px', note: 'The smallest and the usual on-chart sizes (sizing.ts)', ado: ADO, wide: true, make: () => new Ladder(0) },
      { id: 'fleet-ladder-flat', title: 'Size ladder · silhouettes', note: 'Reads as a ship, and as its faction, by shape alone', wide: true, make: () => new Ladder(0, true) },
      ...hullCells(1),
      ...[1, -1].map((dir) => ({
        id: `fleet-transform-${dir}`, title: `${titleOf(transforming)} · transformation · ${dir > 0 ? 'east' : 'west'}`,
        note: 'Fighter, then hybrid: the legs swing down, the arms and head come out', ado: ADO, face: dir,
        make: () => new CaptainView({ hull: transforming, colourway: 1 }, SIZE),
        cycle: [0, 1].flatMap((k) => posesOf(transforming).map((pose): CycleStep => ({
          label: pose, note: `${pose} · ${COLOURWAYS[(1 + k * 3) % N]!.name}`,
          make: () => new CaptainView({ hull: transforming, colourway: (1 + k * 3) % N }, SIZE, pose),
        }))),
      })),
      ...hullCells(-1),
    ],
  },
];

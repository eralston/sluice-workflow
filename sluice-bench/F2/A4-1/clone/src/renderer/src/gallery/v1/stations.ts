// v1 gallery family: stations (13-game-design.md §4.4). Facilities as faction dreadnoughts, with
// their satellites: tender shuttles (PRs) and point defense (pipelines). Each step builds its own
// view (`make`), so steps that aren't on the signal ladder show no rung chip.
import { Container, Graphics } from 'pixi.js';
import { colourways, DreadnoughtView, FACTION_NOD, FACTION_TITLE, FACTIONS, SHUTTLE_CAP, stationStage, type Faction, type GuardMode, type StationAct } from '../../chart/art/dreadnoughts';
import type { Pose } from '../../chart/art/mechaStation';
import { seedFor, ShipView } from '../../chart/art/ships';
import { FLOOR_PX } from '@shared/scene/sizing';
import type { ArtView, CycleStep, Item, Section } from '../types';

/**
 * The gallery's hull length, px: about 3.4× its ~70 px captain ship, a size for reading the art. On the chart a
 * hull is as long as a planet's radius (several ship lengths), and at the screen floors twice a ship (13 §4.4, 15 §5).
 */
const L = 240;
const SEED: Record<Faction, number> = { trek: 11, wars: 23, mecha: 37 };
const REPO = ['Repository (no state)'];
/** A station's floor, px long: FLOOR_PX.facility is a half-length (sizing.ts), so the floor is twice it. */
const FLOOR_LEN = Math.round(2 * (FLOOR_PX.facility ?? 0));

interface StationOpts { i?: number; pr?: number; pm?: number; ds?: number | readonly number[]; pd?: GuardMode; colourway?: number; form?: Pose; tf?: number; go?: boolean }

const stationFor = (faction: Faction, act: StationAct, o: StationOpts = {}) =>
  new DreadnoughtView({ faction, colourway: o.colourway ?? 0, length: L, seed: SEED[faction], stage: stationStage(faction, act, o) });
const station = (faction: Faction, act: StationAct, o: StationOpts = {}) => () => stationFor(faction, act, o);

function states(f: Faction, form?: Pose): CycleStep[] {
  const station = (faction: Faction, act: StationAct, o: StationOpts = {}) => () => stationFor(faction, act, { ...o, ...(form ? { form } : {}) });
  return [
    { label: 'Jump-in', note: 'Summoned: space folds and the station slides out, slow and heavy', make: station(f, 'jump', { i: 0.3 }) },
    { label: 'Idle', note: 'Windows shimmer; slow navigation beacons', make: station(f, 'idle', { i: 0.4, pr: 2 }) },
    { label: 'Intensity 0', note: 'Little of its linked work done: few lit bays, faint shield and drives', make: station(f, 'idle', { i: 0, pr: 2 }) },
    { label: 'Intensity ½', note: 'Half its linked work done', make: station(f, 'idle', { i: 0.5, pr: 2 }) },
    { label: 'Intensity 1', note: 'All its linked work done: every bay lit, full shield and drive glow', make: station(f, 'idle', { i: 1, pr: 2 }) },
    { label: 'Intake', note: 'Tractoring supplies in from an asteroid (Haul)', make: station(f, 'intake', { i: 0.5, pr: 2 }) },
    { label: 'Covering fire', note: 'Slow, sparse, rhythmic batteries, outward only', make: station(f, 'cover', { i: 0.6, pr: 2 }) },
    { label: 'Guards · idle', note: 'Point defense parked, grey lamps (pipeline idle)', rung: 'ready', make: station(f, 'idle', { i: 0.5, pd: 'idle' }) },
    { label: 'Guards · tracking', note: 'A run starts: the turrets charge, then track a contact', rung: 'underway', make: station(f, 'idle', { i: 0.5, pd: 'tracking' }) },
    { label: 'Guards · firing', note: 'Enemy fire is stopped short of the hull', rung: 'underway', make: station(f, 'idle', { i: 0.5, pd: 'firing' }) },
    { label: 'Guards · passed', note: 'The run passed: gold lamps, still', rung: 'accomplished', make: station(f, 'idle', { i: 0.5, pd: 'passed' }) },
    { label: 'Tender docks', note: 'A merged PR’s tender docks; its bay glows gold briefly', rung: 'accomplished', make: station(f, 'dock', { i: 0.5, pr: 3 }) },
    { label: 'Charge', note: 'Before a beamed strike: the reactor gathers light (a Wars ring: power climbs it to the dorsal emitter, which holds lit)', make: station(f, 'charge', { i: 0.6, pr: 2 }) },
  ];
}

/** A captain ship beside a station, for scale (13 §4.5: a station dwarfs any captain). */
class ScaleView implements ArtView {
  readonly root = new Container();
  readonly layer = 'hardware' as const;
  private readonly station: DreadnoughtView;
  private readonly ship: ShipView;
  constructor(faction: Faction, shipSeed: number, dir = 1) {
    this.station = new DreadnoughtView({ faction, length: L, seed: SEED[faction], stage: stationStage(faction, 'idle', { i: 0.6, pr: 2 }) });
    this.station.face(dir);
    this.station.root.x = this.station.marks.x = -46 * dir;
    this.ship = new ShipView(shipSeed, 35); // 35 is the half-length: a ~70 px ship
    this.ship.face(dir);
    this.ship.root.position.set(178 * dir, 6);
    this.root.addChild(this.station.root, this.station.marks, this.ship.root);
  }
  setStage(): void {}
  tick(seconds: number): void {
    this.station.tick(seconds);
    this.ship.tick(seconds);
  }
  destroy(): void {
    this.station.destroy();
    this.ship.destroy();
  }
}

/**
 * A transforming station's two forms at the smallest and a usual on-chart size (a station's floor is `FLOOR_PX.facility` as a
 * half-length, about 115 px long, sizing.ts), colour then flat silhouette: each form must read at once.
 */
class FormSizes implements ArtView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'hardware' as const;
  private readonly views: DreadnoughtView[] = [];
  constructor(private readonly faction: Faction, flat: boolean) {
    const body = new Container();
    if (flat) {
      this.root.addChild(new Graphics().roundRect(-200, -88, 400, 176, 6).fill({ color: 0xe9e3cf }));
      body.tint = 0x0b1220;
      this.marks.visible = false;
    }
    this.root.addChild(body);
    for (const [form, len, x, y] of [['ship', 48, -150, -50], ['robot', 48, -90, -50], ['ship', 96, -110, 36], ['robot', 96, -10, 36], ['ship', 150, 110, -30], ['robot', 150, 150, 30]] as const) {
      const v = new DreadnoughtView({ faction: this.faction, length: len, seed: SEED[this.faction], guardCount: 0, stage: stationStage(this.faction, 'idle', { i: 0.6, pr: 0, form }) });
      for (const c of [v.root, v.marks]) c.position.set(x, y);
      body.addChild(v.root);
      this.marks.addChild(v.marks);
      this.views.push(v);
    }
  }
  setStage(): void {}
  tick(seconds: number): void {
    for (const v of this.views) v.tick(seconds);
  }
  destroy(): void {
    for (const v of this.views) v.destroy();
  }
}

const TRANSFORMING: Faction[] = ['trek', 'wars', 'mecha'];
/** The Wars docking's beats, as progress through its 4.4 s (warsStation.ts). */
const WARS_FRAMES: [number, string][] = [
  [0, 'Cruiser'], [0.05, 'Dorsal half drops out'], [0.14, 'Ventral half drops out'], [0.24, 'Holding astern'], [0.33, 'Gliding level'],
  [0.45, 'Clamping on'], [0.5, 'Latched: seams flare'], [0.62, 'Power round the ring'], [0.74, 'Power along the hull'], [0.86, 'Drives light'], [1, 'Docked'],
];
const FORMS: Record<string, { first: string; second: string; title: string; how: string; frames?: [number, string][] }> = {
  trek: { first: 'Spacedock', second: 'Station', title: 'Trek dreadnought', how: 'A bare spacedock; on the first merge the habitat ring, bridges, docking ring and pylons grow out of its core (trekStation.ts).' },
  wars: {
    first: 'Cruiser', second: 'Ringed cruiser', title: 'Wars dreadnought', frames: WARS_FRAMES,
    how: 'A rounded cruiser; on the first merge the two halves of a docking ring jump in from astern, glide level and clamp on round its after hull, the seams flare, and power runs round the ring, up and down its fins and along the hull until the drives light (warsStation.ts).',
  },
  mecha: { first: 'Ship', second: 'Robot', title: 'Mecha dreadnought', how: 'Ship, then the pieces slide and turn: booms to legs, carriers to arms, tower to head, drives to back-pack spires, the main cannon into the right fist. Tenders re-seat round the robot (mechaStation.ts).' },
};

/** A transforming faction's cells: the transformation looping, pinned frame by frame, and both forms at size. */
function transformCells(f: Faction): Item[] {
  const t = FORMS[f]!;
  const at = (form: Pose, i = 0.6, go = false) => stationStage(f, 'idle', { i, pr: 3, form, go });
  return [
    {
      id: `${f}-transform`, wide: true, title: `${t.title} · transformation (plays once, on the first merge)`, note: t.how, ado: REPO,
      stage: at('ship'), make: station(f, 'idle', { i: 0.6, pr: 3, form: 'ship' }),
      cycle: [
        { label: t.first, note: 'Before the first merge', stage: at('ship') },
        { label: 'First PR merges: it transforms', rung: 'accomplished', note: 'Plays once (a few seconds)', stage: at('robot', 0.6, true) },
        { label: t.second, note: 'At rest from then on', stage: at('robot', 0.61) },
        { label: 'Scrubbed back', note: 'Before the first merge again: a cut, not a replay', stage: at('ship') },
      ],
    },
    {
      id: `${f}-frames`, wide: true, title: `${t.title} · transformation, frame by frame`, note: 'Pinned progress (tf) for review: 0, then in steps to 1', ado: REPO,
      make: station(f, 'idle', { i: 0.6, pr: 3, tf: 0 }),
      cycle: (t.frames ?? [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1].map((tf): [number, string] => [tf, 'Transformation progress']))
        .map(([tf, note]): CycleStep => ({ label: `${Math.round(tf * 100)}%`, note, make: station(f, 'idle', { i: 0.6, pr: 3, tf }) })),
    },
    { id: `${f}-sizes`, wide: true, title: `${t.title} · both forms at 48, 96, 150 px`, note: `The station floor is about ${FLOOR_LEN} px long (2 × FLOOR_PX.facility ${(FLOOR_PX.facility ?? 0).toFixed(1)})`, ado: REPO, make: () => new FormSizes(f, false) },
    { id: `${f}-sizes-flat`, wide: true, title: `${t.title} · silhouettes`, note: 'Each form must read by shape alone', make: () => new FormSizes(f, true) },
    {
      id: `${f}-second-west`, wide: true, title: `${t.title} · ${t.second.toLowerCase()} form · west`, note: 'Its own lit render, not a mirror', ado: REPO, face: -1,
      make: station(f, 'idle', { i: 0.6, pr: 3, form: 'robot' }),
    },
    {
      id: `${f}-second`, wide: true, title: `${t.title} · ${t.second.toLowerCase()} form, every state`, note: 'The same acts and satellites, in the second form', ado: REPO,
      make: station(f, 'idle', { form: 'robot' }), cycle: states(f, 'robot'),
    },
  ];
}

const items: Item[] = [
  ...FACTIONS.map((f): Item => ({
    id: `${f}-states`, wide: true, title: `${FACTION_TITLE[f]} dreadnought · every state`, note: FACTION_NOD[f], ado: REPO,
    make: station(f, 'idle', f === 'trek' ? { form: 'robot' } : {}), cycle: states(f, f === 'trek' ? 'robot' : undefined),
  })),
  ...TRANSFORMING.flatMap((f) => transformCells(f)),
  ...FACTIONS.map((f): Item => ({
    id: `${f}-colourways`, wide: true, title: `${FACTION_TITLE[f]} · colourways`, note: 'Warm titanium with one restrained accent', ado: REPO,
    make: station(f, 'idle'),
    cycle: colourways(f).map((c, i) => ({ label: c.name, note: `Accent #${c.accent.toString(16).padStart(6, '0')}`, make: station(f, 'idle', { i: 0.6, pr: 2, colourway: i }) })),
  })),
  {
    id: 'tenders', wide: true, title: 'Tender shuttles · open PRs', note: `Fixed slots, up to ${SHUTTLE_CAP}, then +N`, ado: ['Pull Request · active', 'Pull Request · completed (merged)'],
    make: station('wars', 'idle'),
    cycle: [
      ...Array.from({ length: SHUTTLE_CAP + 1 }, (_, n): CycleStep => ({
        label: `${n} open`, rung: n ? 'underway' : undefined, note: n ? 'One tender per open PR, in progress blue' : 'No open PRs', make: station('wars', 'idle', { i: 0.5, pr: n }),
      })),
      { label: '8 open', rung: 'underway', note: `${SHUTTLE_CAP} tenders, then +2`, make: station('wars', 'idle', { i: 0.5, pr: 8 }) },
      // 23 C6: the slot mask. A PR in the middle closed; the others held their slots, and "+N" counts only those past the cap.
      { label: 'Slots 0, 2, 3 · gap at 1', rung: 'underway', note: 'pm=13: the middle PR closed; no tender shifted', make: station('wars', 'idle', { i: 0.5, pr: 3, pm: 0b1101 }) },
      { label: 'Slots 1, 4 · gaps kept', rung: 'underway', note: 'pm=18: gaps at the ends and between', make: station('wars', 'idle', { i: 0.5, pr: 2, pm: 0b10010 }) },
      { label: 'Merged · docks the last', rung: 'accomplished', note: 'No slot named: the last tender docks; its bay glows gold briefly', make: station('wars', 'dock', { i: 0.5, pr: 4 }) },
      { label: 'Merged · slot 2 docks', rung: 'accomplished', note: 'ds=2: the tender in slot 2 goes home; slots 0, 1 and 3 stay put', make: station('wars', 'dock', { i: 0.5, pr: 4, pm: 0b1111, ds: 2 }) },
      // 27 E6 (M-31): a volley's merges dock their tenders together.
      { label: 'Merged · two tenders dock', rung: 'accomplished', note: 'ds=1,3: a volley of two merges; the tenders in slots 1 and 3 go home together, 0 and 2 stay put', make: station('wars', 'dock', { i: 0.5, pr: 4, pm: 0b1111, ds: [1, 3] }) },
    ],
  },
  {
    id: 'scale', wide: true, title: 'Scale · a captain beside a station', note: 'At gallery size; on the chart a station’s hull is as long as a planet’s radius, and at the screen floors twice a ship', ado: REPO,
    make: () => new ScaleView('trek', seedFor(0, 2)),
    cycle: [1, -1].flatMap((dir) => FACTIONS.map((f, i): CycleStep => ({
      label: `${FACTION_TITLE[f]} · ${dir > 0 ? 'east' : 'west'}`, note: 'Each heading is its own lit render, not a mirror',
      make: () => new ScaleView(f, seedFor([0, 1, 7][i]!, [2, 5, 12][i]!), dir),
    }))),
  },
];

export const sections: Section[] = [
  { key: 'v1-stations', title: 'v1 · Facilities: faction dreadnoughts, tender shuttles (PRs), point defense (pipelines)', items },
];

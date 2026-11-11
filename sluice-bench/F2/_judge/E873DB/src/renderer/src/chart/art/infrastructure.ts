// 06 §7 stations, PR cargo vessels, and Task mission points: lit, three-dimensional mechanical art.
// Light comes from above (the parent is always on top, 06 §3); windows shimmer for a sense of life.
import { Container, Graphics } from 'pixi.js';
import { lighten, mix, topLit, WindowLights } from './lit';
import { motion } from './motion';
import { HullModel, renderHull, S, type HullRender, type Palette, type V3 } from './hull3d';
import { PROGRESS, PROGRESS_PERIOD, progressPulse, READY, RUNG_COLOR, signalOf, SUCCESS } from './progress';

const IVORY = 0xf4f0de;
const CYAN = 0x83dde2;
const INK = 0x081629;
// A mid-tone steel, so the key light and the cool shadow both have room to read (09 §7).
const STEEL = 0x7d899e;

/** Stations are warm titanium (clear of the Ready grey), each repository with its own accent. */
const TITANIUM = 0x8c8173;
const STATION_ACCENTS = [0xb5523b, 0x3b968e, 0x7d8a3c, 0xa8323a, 0x2f9478, 0xc4763f];
/** A navigation-green beacon: not a ladder color, and clear of the people amber. */
const NAV_GREEN = 0x7fe0a0;

export const STATION_KINDS = ['Ring station', 'Twin-wheel station', 'Platform station'];

/** Station hulls (06 §7), modelled in 3D like the captain ships and seen at the same angle. */
const STATION_BUILDS: ((m: HullModel) => void)[] = [
  // Ring station: a domed core, a habitat ring on spokes, an outer docking ring, and docking pylons
  // sweeping up and down from it.
  (m) => {
    m.lathe([[0, 15], [3, 14.4], [5, 12], [9, 9.5], [10, 6.5], [14, 4.5], [16, 1.2], [16, -1.2], [12, -3.4], [8, -6], [6, -12], [4, -20], [2, -24], [0, -25]],
      ['steel', 'accent', 'hull', 'hull', 'hull', 'accent', 'accent', 'hull', 'hull', 'dark', 'hull', 'dark', 'steel'], { sides: 20 });
    m.torus([0, 0, 0], 27, 3.6, 'xz', 'hull', { segments: 20 });
    m.torus([0, 0, 0], 45, 2.8, 'xz', 'accent', { segments: 24 });
    for (let i = 0; i < 6; i++) {
      const t = (i * Math.PI) / 3 + Math.PI / 6;
      m.tube([[Math.cos(t) * 15, 0, Math.sin(t) * 15], [Math.cos(t) * 25, 0, Math.sin(t) * 25]], 1.1, 'steel', { sides: 4 });
    }
    for (const deg of [90, 210, 330]) {
      const t = (deg * Math.PI) / 180;
      m.tube([[Math.cos(t) * 29, 0, Math.sin(t) * 29], [Math.cos(t) * 43, 0, Math.sin(t) * 43]], 1.3, 'steel', { sides: 4 });
      for (const up of [1, -1]) {
        const path = Array.from({ length: 11 }, (_, j): V3 => {
          const s = j / 10;
          const rho = 45 + 9 * Math.sin(Math.PI * s * 0.9) - 14 * s * s;
          return [Math.cos(t) * rho, up * 38 * s, Math.sin(t) * rho];
        });
        m.tube(path, (s) => 2.6 - 1.6 * s, up > 0 ? 'hull' : 'steel', { sides: 6 });
        m.beacon(path[10]!);
      }
    }
    for (let i = 0; i < 24; i++) {
      const t = (2 * Math.PI * i) / 24;
      m.win([Math.cos(t) * 29.6, 0.6, Math.sin(t) * 29.6], [Math.cos(t), 0.3, Math.sin(t)]);
      m.win([Math.cos(t + 0.13) * 16.2, 0, Math.sin(t + 0.13) * 16.2], [Math.cos(t), 0, Math.sin(t)]);
    }
    m.beacon([0, 15.5, 0]);
  },
  // Twin-wheel station: two wheels on a long axle, with a hub of modules and tanks at one end.
  (m) => {
    m.loft([S(32, 3.4), S(-30, 3.4)], 'steel', { sides: 10 });
    for (const x of [14, -6]) {
      m.torus([x, 0, 0], 34, 4.4, 'yz', 'hull', { sides: 4, segments: 20 });
      m.loft([S(x + 3, 7), S(x - 3, 7)], 'accent', { sides: 12 });
      for (let i = 0; i < 4; i++) {
        const t = (i * Math.PI) / 2 + Math.PI / 4;
        m.tube([[x, Math.cos(t) * 7, Math.sin(t) * 7], [x, Math.cos(t) * 31, Math.sin(t) * 31]], 1, 'steel', { sides: 4 });
      }
      // Rows of habitat windows around both faces of the wheel and its rim, and portholes on the hub.
      for (let i = 0; i < 30; i++) {
        const t = (2 * Math.PI * (i + 0.5)) / 30;
        const [c, n] = [Math.cos(t), Math.sin(t)];
        m.win([x, c * 38.6, n * 38.6], [0, c, n]);
        for (const side of [1, -1]) {
          m.win([x + side * 4.6, c * 35.6, n * 35.6], [side, 0, 0]);
          if (i % 2) m.win([x + side * 4.6, c * 32.4, n * 32.4], [side, 0, 0]);
        }
      }
      for (let i = 0; i < 8; i++) {
        const t = (2 * Math.PI * i) / 8;
        for (const side of [1, -1]) m.win([x + side * 3.2, Math.cos(t) * 5, Math.sin(t) * 5], [side, 0, 0]);
      }
    }
    m.box(-48, -30, -7, 7, -7, 7, 'hull');
    for (const [y, z] of [[9.5, -4], [9.5, 4], [-4, 9.5], [4, 9.5], [-4, -9.5], [4, -9.5]] as const) {
      m.loft([S(-32, 0, 0, y, z), S(-33.5, 2.6, 2.6, y, z), S(-46.5, 2.6, 2.6, y, z), S(-48, 0, 0, y, z)], 'accent', { sides: 10 });
    }
    m.lathe([[0, 0], [7, -1.6], [8, -2.4]], 'steel', { cx: -50, sides: 16 }).loft([S(-48, 1.4), S(-52, 1.4)], 'dark', { sides: 6 });
    m.sym(() => m.winRow(-46, -32, 3.5, 3, 7.1));
    m.beacon([33, 0, 0]);
    m.beacon([-50, 0.5, 0]);
  },
  // Platform station: a thick deck with tall corner pylons and antennas, and a spire hanging below.
  (m) => {
    m.lathe([[0, 9], [5, 8.6], [9, 6.4], [14, 5.6], [21, 5], [23, 4.8], [33, 3.6], [40, 2], [42, 0], [40, -2], [30, -3.5], [16, -4], [0, -4.2]],
      ['dark', 'accent', 'hull', 'hull', 'dark', 'hull', 'steel', 'accent', 'accent', 'hull', 'hull', 'hull'], { sides: 28 });
    for (let i = 0; i < 12; i++) {
      const t = (2 * Math.PI * (i + 0.5)) / 12;
      const [x, z] = [Math.cos(t) * 28, Math.sin(t) * 28];
      m.box(x - 1.6, x + 1.6, 4, 5.6, z - 1.6, z + 1.6, i % 3 ? 'steel' : 'dark');
    }
    m.lathe([[6, -4], [6, -14], [4.5, -16], [4.5, -26], [3, -28], [3, -36], [1.2, -38], [0, -46]],
      ['hull', 'dark', 'hull', 'dark', 'steel', 'dark', 'steel'], { sides: 12 });
    for (const [x, z] of [[24, 24], [-24, 24], [-24, -24], [24, -24]] as const) {
      m.box(x - 3.5, x + 3.5, -16, 22, z - 3.5, z + 3.5, 'hull');
      m.box(x - 3.9, x + 3.9, 12, 16, z - 3.9, z + 3.9, 'accent');
      m.box(x - 3.9, x + 3.9, -12, -9, z - 3.9, z + 3.9, 'accent');
      m.tube([[x, 22, z], [x, 34, z]], 0.5, 'steel', { sides: 4 });
      m.beacon([x, 34.5, z]);
      for (const y of [18, 6, -4]) m.win([x + 3.6 * Math.sign(x), y, z], [Math.sign(x), 0, 0]).win([x, y, z + 3.6 * Math.sign(z)], [0, 0, Math.sign(z)]);
    }
    m.tube([[0, 9, 0], [0, 24, 0]], 0.6, 'steel', { sides: 4 });
    m.beacon([0, 24.5, 0]);
    for (let i = 0; i < 28; i++) {
      const t = (2 * Math.PI * i) / 28;
      m.win([Math.cos(t) * 41.2, 0.8, Math.sin(t) * 41.2], [Math.cos(t), 0.3, Math.sin(t)]);
    }
  },
];

const stationRenders = new Map<string, HullRender>();

function stationRender(kind: number, accent: number): HullRender {
  const key = `${kind}:${accent}`;
  let r = stationRenders.get(key);
  if (!r) {
    const m = new HullModel();
    STATION_BUILDS[kind]!(m);
    const palette: Palette = { hull: TITANIUM, accent, cargo: accent, steel: 0x6a6d74, dark: 0x2c2f37, glass: 0x2a4256, glow: 0xa8f0ea, ember: 0xff9a5a };
    r = renderHull(m, palette, 1, { width: 44, height: 40 });
    stationRenders.set(key, r);
  }
  return r;
}

/** One of three stations (by seed), a 3D hull fitted to about 2r wide, with blinking beacons. */
export class StationView {
  readonly root = new Container();
  private readonly beacon = new Graphics();
  private readonly lights: WindowLights;

  constructor(r: number, seed: number) {
    const s = seed >>> 0;
    const render = stationRender(s % STATION_BUILDS.length, STATION_ACCENTS[Math.floor(s / STATION_BUILDS.length) % STATION_ACCENTS.length]!);
    const body = new Container();
    body.scale.set(r / 22);
    const hull = new Graphics(render.context);
    this.lights = new WindowLights(render.windows, 0.7, seed);
    for (const [x, y] of render.beacons) {
      this.beacon.circle(x, y, 1.6).fill({ color: NAV_GREEN, alpha: 0.25 }).circle(x, y, 0.6).fill({ color: lighten(NAV_GREEN, 0.5) });
    }
    this.beacon.blendMode = 'add';
    body.addChild(hull, ...this.lights.groups, this.beacon);
    this.root.addChild(body);
  }

  setStage(): void {}
  tick(seconds: number): void {
    this.beacon.alpha = motion.reduced ? 0.8 : 0.4 + 0.6 * Math.max(0, Math.sin(motion.pulseTime * 2.5));
    this.lights.tick(seconds);
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** Cargo vessel paint: a hull tone and cargo colors, all clear of the ladder hues (09 §1). */
const VESSEL_HULLS = [0xb9b2a3, 0x8c8173, 0x7b8a77];
const CARGO = [0xb5523b, 0x3b968e, 0x7d8a3c, 0xd9c9a3, 0xa8323a, 0x2f9478, 0xc4763f];

export const VESSEL_KINDS = ['Container freighter', 'Tanker', 'Shuttle train', 'Pod courier', 'Tug and barge'];

/**
 * PR vessel hulls: trains in space (a 1970s retrofuturist's freight), each a chain of separate cars
 * with open gaps on a spine or couplers, and never wings or nacelles (those mark captains). Each
 * carries `trim` (the rung-colored stripe) and beacons where its running lights and strobes sit.
 */
const VESSEL_BUILDS: ((m: HullModel) => void)[] = [
  (m) => {
    m.box(-40, 24, -1.4, 1.4, -1.8, 1.8, 'steel');
    for (let i = 0; i < 4; i++) {
      const x = -32 + i * 13.5;
      m.box(x, x + 8.5, -5, 5.5, -5.5, 5.5, i % 2 ? 'cargo' : 'accent');
      m.sym(() => m.box(x, x + 8.5, -5.8, -4.6, 5.4, 6, 'trim'));
    }
    m.loft([S(46, 0, 0, 1), S(42, 4, 4, 1), S(30, 5.5, 5.5, 1.5), S(26, 5.5, 5.5, 1.5)], ['glass', 'hull', 'hull'], { sides: 10 });
    m.box(28, 36, 6, 9, -3, 3, 'hull');
    m.loft([S(-36, 5), S(-44, 5.6)], 'dark', { sides: 10 });
    m.sym(() => m.winRow(29, 39, 5, 3, 5.6));
    m.engine([-45, 0, 0], 3.6);
    m.beacon([47, 1, 0]).beacon([-44, 6, 0]);
  },
  (m) => {
    m.loft([S(30, 2.5), S(-34, 2.5)], 'steel', { sides: 8 });
    const tank: [number, number][] = [[0, 8], [4, 6.9], [6.9, 4], [8, 0.8], [8, -0.8], [6.9, -4], [4, -6.9], [0, -8]];
    for (const cx of [17, 0, -17]) m.lathe(tank, ['cargo', 'cargo', 'accent', 'trim', 'accent', 'cargo', 'cargo'], { cx, sides: 16 });
    m.loft([S(42, 0, 0, 1), S(38, 4.5, 4.5, 1), S(27, 5, 5, 1)], ['glass', 'hull'], { sides: 10 });
    m.loft([S(-26, 4), S(-32, 4), S(-40, 5.4)], ['dark', 'steel'], { sides: 10, caps: [undefined, 'dark'] });
    m.sym(() => m.winRow(30, 36, 3, 2.5, 5.1));
    m.engine([-41, 0, 0], 3.6);
    m.beacon([43, 1, 0]).beacon([-36, 6, 0]);
  },
  (m) => {
    // Cab, coupler, two boxy cars, coupler, drive car.
    m.loft([S(44, 4, 3, 0), S(40, 7, 6), S(26, 7.5, 6.5), S(24, 7, 6)], ['glass', 'hull', 'hull'], { sides: 12, sq: 6 });
    m.loft([S(24, 2), S(-36, 2)], 'steel', { sides: 8 });
    for (const [x0, x1] of [[6, 19], [-13, 0]] as const) {
      m.loft([S(x1, 7, 6), S(x0, 7, 6)], 'cargo', { sides: 12, sq: 6 });
      m.sym(() => m.box(x0, x1, -1, 0.4, 6.8, 7.3, 'trim'));
    }
    m.loft([S(-19, 6, 5.5), S(-34, 6, 5.5), S(-38, 5, 4.6)], ['accent', 'dark'], { sides: 12, sq: 6 });
    m.sym(() => {
      m.winRow(29, 37, 4, 2.5, 7.4);
      m.engine([-39, 0, 3], 2.4);
    });
    m.beacon([45, 0, 0]).beacon([-36, 6, 0]);
  },
  (m) => {
    // A sleek cab drawing three round pods on a spine.
    m.loft([S(48, 0, 0), S(42, 3.5, 3), S(32, 6, 5), S(26, 5, 4.6)], ['hull', 'hull', 'accent'], { sides: 12 });
    m.loft([S(36, 0, 0, 3.6), S(33, 2.6, 1.6, 4.4), S(28, 2.6, 1.6, 4.2), S(26, 0, 0, 3.8)], 'glass', { sides: 8 });
    m.loft([S(26, 1.6), S(-40, 1.6)], 'steel', { sides: 8 });
    for (const x of [15, -1, -17]) {
      m.loft([S(x + 6, 0, 0), S(x + 5, 3.4), S(x + 3.6, 5), S(x + 0.8, 5), S(x - 0.8, 5), S(x - 3.6, 5), S(x - 5, 3.4), S(x - 6, 0, 0)],
        ['cargo', 'cargo', 'cargo', 'trim', 'cargo', 'cargo', 'cargo'], { sides: 14 });
    }
    m.loft([S(-28, 3.6), S(-36, 4.4), S(-40, 4)], ['steel', 'dark'], { sides: 12 });
    m.engine([-41, 0, 0], 3.2);
    m.beacon([49, 0, 0]).beacon([-36, 5, 0]);
  },
  (m) => {
    m.loft([S(40, 0, 0, 1), S(36, 4, 4, 1), S(26, 6, 6.5), S(18, 6, 6.5)], ['glass', 'hull', 'hull'], { sides: 12 });
    m.box(20, 30, 6, 10, -3, 3, 'accent');
    m.box(-44, 18, -1.6, 1.6, -2, 2, 'steel');
    for (const x of [6, -12, -30]) {
      m.box(x, x + 10, -5.5, 5.5, -5.5, 5.5, 'cargo');
      m.sym(() => m.box(x, x + 10, -2, -0.6, 5.4, 5.9, 'trim'));
    }
    m.sym(() => {
      m.winRow(21, 29, 4, 8, 3.1);
      m.engine([-45, 0, 3], 2.6);
    });
    m.beacon([41, 1, 0]).beacon([-30, 7, 0]);
  },
];

const vesselRenders = new Map<string, [HullRender, HullRender]>();

function vesselRenders_(seed: number): [HullRender, HullRender] {
  const s = seed >>> 0;
  const kind = s % VESSEL_BUILDS.length;
  const cargo = Math.floor(s / VESSEL_BUILDS.length) % CARGO.length;
  const hull = Math.floor(s / (VESSEL_BUILDS.length * CARGO.length)) % VESSEL_HULLS.length;
  const key = `${kind}:${cargo}:${hull}`;
  let r = vesselRenders.get(key);
  if (!r) {
    const m = new HullModel();
    VESSEL_BUILDS[kind]!(m);
    const palette: Palette = {
      hull: VESSEL_HULLS[hull]!, accent: CARGO[(cargo + 3) % CARGO.length]!, cargo: CARGO[cargo]!,
      steel: 0x6a6d74, dark: 0x2c2f37, glass: 0x2a4256, glow: 0xa8f0ea, ember: 0xff9a5a,
    };
    const fit = { width: 48, height: 22 };
    const east = renderHull(m, palette, 1, fit);
    r = [east, renderHull(m, palette, -1, { ...fit, k: east.k })];
    vesselRenders.set(key, r);
  }
  return r;
}

/** One double flash of the strobes, in seconds: unhurried, a safety light rather than an alarm. */
const STROBE_PERIOD = 3.2;

/**
 * A PR cargo vessel: one of five crewed hulls (by seed), modelled in 3D and seen at the captain
 * ships' angle, with an east and a west render so it points at its station. On the signal ladder
 * (09 §4) its trim stripe and running lights take the rung's color: active PRs run blue, with chevrons
 * flowing forward and white strobes double-flashing; completed PRs wear gold and go still (strobes
 * off, docked), with a gold check;
 * abandoned PRs are greyed out. Fitted to about 48 units long at r = 24.
 */
export class FlightView {
  readonly root = new Container();
  private readonly body = new Container();
  private readonly headings: { root: Container; trim: Graphics; running: Graphics; strobe: Graphics; engines: Graphics; lights: WindowLights; beacons: [number, number][] }[];
  private readonly strobePhase: number;
  private heading = 0;
  private readonly badge = new Graphics();
  /** In-flight chevrons, rear first, lit in turn by the shared progress pulse so they flow forward. */
  private readonly chevrons = [new Graphics(), new Graphics()];
  private stage = '';

  constructor(private readonly r: number, seed = 0) {
    this.headings = vesselRenders_(seed).map((render) => {
      const root = new Container();
      const engines = new Graphics();
      for (const e of render.engines) {
        engines.circle(e.x, e.y, e.r * 1.4).fill({ color: CYAN, alpha: 0.25 }).circle(e.x, e.y, e.r * 0.6).fill({ color: lighten(CYAN, 0.6) });
      }
      engines.blendMode = 'add';
      const trim = new Graphics(render.trim);
      const running = new Graphics();
      // White anti-collision strobes at bow and stern, like a light aircraft's.
      const strobe = new Graphics();
      for (const [x, y] of render.beacons) strobe.circle(x, y, 2.4).fill({ color: IVORY, alpha: 0.16 }).circle(x, y, 1).fill({ color: IVORY });
      strobe.blendMode = 'add';
      strobe.alpha = 0;
      // Steady windows: a cargo vessel's life is its strobes, not a captain's breath.
      const lights = new WindowLights(render.windows, 0.9, seed, undefined, 'steady');
      root.addChild(engines, new Graphics(render.context), trim, ...lights.groups, running, strobe);
      this.body.addChild(root);
      return { root, trim, running, strobe, engines, lights, beacons: render.beacons };
    });
    this.body.scale.set(r / 24);
    this.strobePhase = ((seed >>> 0) % 997) / 997;
    this.root.addChild(this.body, this.badge, ...this.chevrons);
    this.face(1);
  }

  /** Face toward the station: dx > 0 → nose to +x. Each heading is its own lit render. */
  face(dx: number): void {
    const h = dx < 0 ? 1 : 0;
    const changed = h !== this.heading;
    this.heading = h;
    this.headings.forEach((x, i) => (x.root.visible = i === h));
    if (changed && this.stage) {
      const stage = this.stage;
      this.stage = '';
      this.setStage(stage); // chevrons trail behind the new heading
    }
  }

  setStage(stage: string): void {
    if (stage === this.stage) return;
    this.stage = stage;
    const b = this.badge;
    const s = this.r / 24;
    const dir = this.heading ? -1 : 1;
    b.clear();
    for (const c of this.chevrons) c.clear();
    this.root.alpha = 1;
    // The rung's color on the trim stripe and the running lights.
    const rung = signalOf(stage).rung;
    const color = RUNG_COLOR[rung];
    for (const h of this.headings) {
      h.trim.tint = color;
      h.trim.alpha = rung === 'off' ? 0.5 : 1;
      h.running.clear();
      for (const [x, y] of h.beacons) h.running.circle(x, y, 1.1).fill({ color });
      h.running.alpha = 1;
      h.strobe.alpha = 0;
    }
    if (stage === 'flight.active') {
      // Trailing chevrons in progress blue: in flight.
      this.chevrons.forEach((c, i) => {
        const x = -dir * (32 + (1 - i) * 6) * s; // index 0 is the rear chevron
        c.moveTo(x - dir * 3 * s, -4 * s).lineTo(x, 0).lineTo(x - dir * 3 * s, 4 * s);
        c.stroke({ width: Math.max(1.6, 1.4 * s), color: PROGRESS, alpha: 1 });
      });
    } else if (stage === 'flight.completed') {
      b.circle(0, -15 * s, 5.5 * s).fill({ color: INK, alpha: 0.85 }).stroke({ width: Math.max(1.2, s), color: SUCCESS });
      b.moveTo(-2.4 * s, -15 * s).lineTo(-0.6 * s, -13.2 * s).lineTo(2.6 * s, -16.8 * s).stroke({ width: Math.max(1.3, s), color: SUCCESS });
    } else if (stage === 'flight.abandoned') {
      this.root.alpha = 0.5;
      b.moveTo(-5 * s, -19 * s).lineTo(5 * s, -9 * s).moveTo(5 * s, -19 * s).lineTo(-5 * s, -9 * s).stroke({ width: Math.max(1.4, s), color: IVORY, alpha: 0.7 });
    }
  }

  tick(seconds: number): void {
    const h = this.headings[this.heading]!;
    h.engines.alpha = 0.7 + 0.3 * Math.sin(seconds * 6 + this.r);
    if (this.stage === 'flight.active') {
      // State motion only while underway: chevrons flow forward, and the strobes double-flash like a
      // light aircraft's anti-collision lights. Docked (completed) vessels park with strobes off.
      const p = motion.pulseTime; // blinks speed up at most 2× in fast playback (05 §5)
      this.chevrons.forEach((c, i) => (c.alpha = motion.reduced ? 0.8 : 0.3 + 0.7 * progressPulse(p, i * 0.18)));
      const t = (p / STROBE_PERIOD + this.strobePhase) % 1 * STROBE_PERIOD;
      h.strobe.alpha = !motion.reduced && (t < 0.12 || (t > 0.34 && t < 0.46)) ? 0.55 : 0; // soft: never brighter than the trim
    }
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/**
 * A Task mission point: a map-style drop pin (a round head tapering to a point, with a hole), simple
 * enough never to compete with a planet's silhouette. On the signal ladder (09 §4): a new pin is a
 * grey outline sketch, barely breathing; an active pin is lit in progress blue, its pedestal radiating
 * ripples on the shared progress beat (the strongest motion); a closed pin has faded away, leaving a
 * still gold checkmark. Drawn in units of r; the point is at the bottom.
 */
export class TaskDotView {
  readonly root = new Container();
  private readonly glow = new Graphics();
  /** The pedestal under the point, and the active pin's ripples (drawn each tick, under the pin). */
  private readonly base = new Graphics();
  private readonly g = new Graphics();
  private readonly fx = new Graphics();
  /** The closed pin's checkmark and its soft glow: kept brighter than the faded body. */
  private readonly mark = new Graphics();
  private stage = '';
  private readonly seed: number;
  // Pin geometry, in r units.
  private readonly cy: number;
  private readonly R: number;
  private readonly tip: number;
  private readonly alpha: number; // half-angle at the head where the sides leave it

  constructor(private readonly r: number) {
    this.cy = -0.38 * r;
    this.R = 0.6 * r;
    this.tip = 1.0 * r;
    this.alpha = Math.acos(this.R / (this.tip - this.cy));
    this.seed = Math.round(r * 97) % 13;
    this.root.addChild(this.glow, this.base, this.g, this.fx, this.mark);
  }

  /** Teardrop outline: down the left side to the tip, up the right, around the top of the head. */
  private pin(g: Graphics, grow = 0): Graphics {
    const R = this.R + grow;
    const a = this.alpha;
    g.moveTo(0, this.tip + grow);
    g.lineTo(-R * Math.sin(a), this.cy + R * Math.cos(a));
    g.arc(0, this.cy, R, Math.PI / 2 + a, Math.PI * 2.5 - a);
    return g.closePath();
  }

  setStage(stage: string): void {
    if (stage === this.stage) return;
    this.stage = stage;
    const { g, glow, r } = this;
    g.clear();
    glow.clear();
    this.fx.clear();
    this.mark.clear();
    this.base.clear();
    this.root.alpha = 1;
    this.g.alpha = 1;
    const hole = this.R * 0.42;
    switch (stage) {
      case 'task.lit':
        glow.circle(0, this.cy, r * 1.05).fill({ color: PROGRESS, alpha: 0.14 });
        this.pin(g).fill(topLit(PROGRESS));
        g.circle(0, this.cy, hole).fill({ color: lighten(PROGRESS, 0.75) });
        break;
      case 'task.settled': {
        // Accomplished: the pin has faded away, and a gold check says done without needing motion.
        this.pin(g).fill(topLit(mix(STEEL, IVORY, 0.4)));
        g.alpha = 0.3;
        const k = this.R * 0.62;
        const m = this.mark;
        m.circle(0, this.cy, this.R * 0.95).fill({ color: SUCCESS, alpha: 0.12 });
        m.moveTo(-k * 0.62, this.cy + k * 0.02).lineTo(-k * 0.12, this.cy + k * 0.5).lineTo(k * 0.7, this.cy - k * 0.48);
        m.stroke({ width: Math.max(1.6, this.R * 0.24), color: SUCCESS, alpha: 1, cap: 'round', join: 'round' });
        break;
      }
      case 'task.faint':
        this.pin(g).stroke({ width: r * 0.05, color: IVORY, alpha: 0.6 });
        this.root.alpha = 0.18;
        break;
      default: // task.unstarted, unknown: a grey outline sketch of a pin
        this.pin(g).fill({ color: INK, alpha: 0.55 }).stroke({ width: Math.max(1, r * 0.06), color: READY, alpha: 0.85 });
        g.circle(0, this.cy, hole).stroke({ width: Math.max(1, r * 0.05), color: READY, alpha: 0.7 });
        break;
    }
  }

  tick(_ambient: number): void {
    this.fx.clear();
    const seconds = motion.reduced ? 0 : motion.pulseTime; // blinks: at most 2× in fast playback (05 §5)
    if (this.stage === 'task.lit') {
      // The spot being visited radiates: ripples swell out of the pedestal on the shared progress beat,
      // two per beat, half a beat apart, fading as they spread. The pedestal brightens with the pulse.
      const b = this.base;
      b.clear();
      const rx = this.r * 0.5;
      const ry = this.r * 0.14;
      for (const lag of [0, 0.5]) {
        const u = seconds / PROGRESS_PERIOD - lag;
        const f = u - Math.floor(u);
        const grow = 1 + 1.6 * f;
        const fade = Math.pow(1 - f, 1.6);
        b.ellipse(0, this.tip, rx * grow, ry * grow).fill({ color: PROGRESS, alpha: 0.16 * fade });
        b.ellipse(0, this.tip, rx * grow, ry * grow).stroke({ width: Math.max(1, this.r * 0.035), color: lighten(PROGRESS, 0.4), alpha: 0.5 * fade });
      }
      const beat = progressPulse(seconds);
      b.ellipse(0, this.tip, rx, ry).fill({ color: lighten(PROGRESS, 0.3 * beat), alpha: 0.4 + 0.35 * beat });
      this.glow.alpha = 0.75 + 0.25 * beat;
    } else if (this.stage === 'task.unstarted' || !this.stage.startsWith('task.')) {
      // Ready: barely breathing (about 12 s), so it reads as waiting, not working.
      this.g.alpha = 0.8 + 0.2 * Math.sin((seconds / 12 + this.seed * 0.07) * Math.PI * 2);
    }
    // Accomplished pins are still (09 §5).
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

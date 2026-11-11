// A station on standby (19 M1, 23 C4): its view eases into the projection's `standby` and out of it on
// wall time, quicker out than in; a first stage, `settle` (a seek, scene entry) and reduced motion land it
// at once (INV-15); and it passes only the level to the art's `setPower(1 - level)`, which does the
// dimming and stills the drift. The art needs a DOM (Pixi gradients), so it is a stand-in here that
// applies `setPower` as the real one does (the same formulas; `DreadnoughtView.setPower` itself is
// checked in the app by the drive's tint read, 23 C4's note). Renderer modules load by path, as
// commands.test.ts does.
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { encodePiece } from '@shared/engine/stageCode';
import type { PieceState } from '@shared/contracts/view';

const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
interface View { setStage(s: string): void; tick(s: number): void; settle(): void; readonly standby: number }
const sb = await load<{
  StationView: new (art: unknown, look: (s: string) => string | null, acts: Record<string, unknown>) => View;
  STANDBY_FADE_MS: number; STANDBY_WAKE_MS: number; STANDBY_HULL: number; STANDBY_LIGHTS: number;
}>('theme/starChart/assets/standby.ts');
const dn = await load<{
  powerTints(p: number): { hull: number; light: number }; powerLag(lag: number, prev: number | null, scene: number, power: number): number;
  POWER_DIM_HULL: number; POWER_DIM_LIGHTS: number;
}>('chart/art/dreadnoughts.ts');
const { motion } = await load<{ motion: { reduced: boolean } }>('chart/art/motion.ts');

const stage = (standby: boolean) => {
  const p: PieceState = { role: 'facility', signal: { rung: 'underway' }, category: 'InProgress', intensity: 0.5, open: 0, ...(standby ? { standby } : {}) };
  return encodePiece(p);
};

/**
 * The dreadnought's shape: a hull with an additive light under it, satellites, and `setPower`/`tick` built
 * from the art's own pure helpers (`powerTints`, `powerLag`), which are tested directly below.
 */
function stand() {
  const root = new Container();
  const hull = new Graphics();
  const light = new Graphics();
  light.blendMode = 'add';
  const body = new Container();
  body.addChild(hull, light);
  root.addChild(body);
  const art = {
    root, marks: new Container(), seconds: [] as number[], powers: [] as number[], power: 1, sceneAt: null as number | null, lag: 0,
    setPower(p: number) {
      this.power = p; this.powers.push(p);
      const t = dn.powerTints(p);
      this.root.tint = this.marks.tint = t.hull;
      light.tint = t.light;
    },
    setStage: () => undefined,
    tick(s: number) { this.lag = dn.powerLag(this.lag, this.sceneAt, s, this.power); this.sceneAt = s; this.seconds.push(s - this.lag); },
    destroy: () => undefined,
  };
  return { art, hull, light, view: new sb.StationView(art, (s) => s, {}) };
}
const grey = (tint: number) => ((tint >> 8) & 0xff) / 255;

let now = 0;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  motion.reduced = false;
});
afterEach(() => {
  vi.restoreAllMocks();
  motion.reduced = false;
});

/** Ticks every 50 ms of wall and scene time for `ms`, from scene second `from`. */
function run(v: View, ms: number, from = 0): number {
  let s = from;
  for (let t = 0; t < ms; t += 50) {
    now += 50;
    s += 0.05;
    v.tick(s);
  }
  return s;
}

describe('a station on standby (19 M1)', () => {
  it('passes only the level: power is 1 - level', () => {
    const { view, art } = stand();
    view.setStage(stage(false));
    view.tick(0);
    expect(art.powers.at(-1)).toBe(1);
    view.setStage(stage(true));
    view.settle();
    expect(art.powers.at(-1)).toBe(0);
  });

  it('starts as its first stage says, with no easing', () => {
    const { view, art, light } = stand();
    view.setStage(stage(true));
    view.tick(0);
    expect(view.standby).toBe(1);
    expect(grey(art.root.tint)).toBeCloseTo(sb.STANDBY_HULL, 2);
    expect(grey(art.marks.tint)).toBeCloseTo(sb.STANDBY_HULL, 2);
    expect(grey(light.tint)).toBeCloseTo(sb.STANDBY_LIGHTS, 2);
  });

  it('powers down over STANDBY_FADE_MS and wakes over STANDBY_WAKE_MS, on wall time', () => {
    const { view, art, hull, light } = stand();
    view.setStage(stage(false));
    view.tick(0);
    expect(art.root.tint).toBe(0xffffff);
    view.setStage(stage(true));
    let s = run(view, sb.STANDBY_FADE_MS / 2);
    expect(view.standby).toBeGreaterThan(0.4);
    expect(view.standby).toBeLessThan(0.6);
    s = run(view, sb.STANDBY_FADE_MS / 2 + 100, s);
    expect(view.standby).toBe(1);
    expect(grey(light.tint)).toBeCloseTo(sb.STANDBY_LIGHTS, 2);
    expect(hull.tint).toBe(0xffffff); // only the light layers take the deeper grey; the hull's comes from the root
    view.setStage(stage(false));
    run(view, sb.STANDBY_WAKE_MS + 100, s);
    expect(view.standby).toBe(0);
    expect(art.root.tint).toBe(0xffffff);
    expect(light.tint).toBe(0xffffff);
    expect(sb.STANDBY_WAKE_MS).toBeLessThan(sb.STANDBY_FADE_MS);
  });

  it('lands at once on settle (a seek) and under reduced motion (INV-15)', () => {
    const { view } = stand();
    view.setStage(stage(false));
    view.tick(0);
    view.setStage(stage(true));
    view.settle();
    expect(view.standby).toBe(1);
    view.setStage(stage(false));
    motion.reduced = true;
    view.tick(0.05);
    expect(view.standby).toBe(0);
  });

  it('slows the art’s clock to a stop on standby, and picks it up where it stopped', () => {
    const { view, art } = stand();
    view.setStage(stage(false));
    let s = run(view, 1000);
    const awake = art.seconds.at(-1)!;
    expect(awake).toBeCloseTo(s, 5); // awake, the art runs on the scene's clock
    view.setStage(stage(true));
    s = run(view, sb.STANDBY_FADE_MS + 100, s);
    const still = art.seconds.at(-1)!;
    s = run(view, 2000, s);
    expect(art.seconds.at(-1)).toBe(still); // on standby, it holds
    view.setStage(stage(false));
    run(view, 3000, s);
    const after = art.seconds;
    for (let i = 1; i < after.length; i++) expect(after[i]! - after[i - 1]!).toBeGreaterThanOrEqual(0); // never jumps back
    expect(after.at(-1)! - still).toBeGreaterThan(2); // and runs again
  });
});

describe('the art’s power helpers (23 C4)', () => {
  it('tint nothing at power 1 and the two shares at power 0, hull above lights, easing between', () => {
    expect(dn.powerTints(1)).toEqual({ hull: 0xffffff, light: 0xffffff });
    const off = dn.powerTints(0);
    expect(grey(off.hull)).toBeCloseTo(dn.POWER_DIM_HULL, 2);
    expect(grey(off.light)).toBeCloseTo(dn.POWER_DIM_LIGHTS, 2);
    expect(dn.POWER_DIM_HULL).toBe(0.7);
    expect(dn.POWER_DIM_LIGHTS).toBe(0.3);
    const mid = dn.powerTints(0.5);
    expect(grey(mid.hull)).toBeGreaterThan(grey(off.hull));
    expect(grey(mid.light)).toBeGreaterThan(grey(off.light));
    expect(grey(mid.hull)).toBeGreaterThan(grey(mid.light));
    expect(dn.powerTints(2)).toEqual(dn.powerTints(1)); // clamped
    expect(dn.powerTints(-1)).toEqual(off);
  });

  it('keep the art on the scene clock at power 1, a step back included, and still it at power 0', () => {
    const run = (power: number, scenes: number[]) => {
      let lag = 0;
      let prev: number | null = null;
      return scenes.map((s) => { lag = dn.powerLag(lag, prev, s, power); prev = s; return s - lag; });
    };
    const path = [0, 1, 2, 3, 1, 0.5, 4]; // the gallery's freeze steps time back
    expect(run(1, path)).toEqual(path);
    expect(run(0, [0, 1, 2, 3])).toEqual([0, 0, 0, 0]); // going forward, a stilled clock holds
    const half = run(0.5, [0, 2, 4]);
    expect(half).toEqual([0, 1, 2]);
  });
});

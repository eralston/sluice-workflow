// Where a ship parks to work something (22 A10, `chart/fx/approach.ts`): on the work's side of its
// planet, outside the planet's face, whichever way the ship comes from; without a planet, on the side
// it comes from; a fan turns ships apart. Renderer code, loaded by a runtime path (as labelTiers.test.ts).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Pt = readonly [number, number];
const FX = resolve(__dirname, '../../src/renderer/src/chart/fx');
const { approachOf, besideOf } = (await import(/* @vite-ignore */ `${FX}/approach.ts`)) as {
  approachOf(target: Pt, around: Pt | null, from: Pt, gap: () => number, fan?: number, clear?: () => number): () => [number, number] | null;
  besideOf(target: Pt, from: Pt, gap: () => number): () => [number, number] | null;
};

const PLANET: Pt = [0, 0];
const R = 100; // the planet's radius
const gap = () => 40;

describe('a ship comes in on its work’s side of the planet (22 A10)', () => {
  it('parks outside the planet, on the line from its centre through the work, from any side', () => {
    const hive: Pt = [48, -36]; // on the planet's upper right, well inside its disc
    for (const from of [[-500, 0], [0, 500], [500, -500]] as Pt[]) {
      const p = approachOf(hive, PLANET, from, gap, 0, () => R + 30)()!;
      expect(Math.hypot(p[0], p[1])).toBeGreaterThan(R); // off the planet's face
      expect(Math.atan2(p[1], p[0])).toBeCloseTo(Math.atan2(hive[1], hive[0]), 6); // on the hive's side
    }
  });

  it('stays off the planet’s face however deep the work sits on it (review: a gap from the work alone landed inside)', () => {
    const clear = () => R + 30; // the planet's radius and the ship's
    for (const depth of [0.05, 0.2, 0.5, 0.9]) {
      const rock: Pt = [R * depth * 0.6, R * depth * 0.8];
      const p = approachOf(rock, PLANET, [-500, 0], gap, 0, clear)()!;
      expect(Math.hypot(p[0], p[1])).toBeGreaterThanOrEqual(R + 30 - 1e-9);
      expect(Math.atan2(p[1], p[0])).toBeCloseTo(Math.atan2(rock[1], rock[0]), 6);
    }
  });

  it('without a planet, comes in from the side it comes from', () => {
    const rock: Pt = [300, 0];
    expect(approachOf(rock, null, [0, 0], gap)()).toEqual(besideOf(rock, [0, 0], gap)());
    expect(approachOf(rock, null, [0, 0], gap)()).toEqual([260, 0]);
  });

  it('a fan turns several ships apart round the same side', () => {
    const rock: Pt = [100, 0];
    const a = approachOf(rock, PLANET, [0, 0], gap, -0.6)()!;
    const b = approachOf(rock, PLANET, [0, 0], gap, 0.6)()!;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(40);
    expect(a[1]).toBeCloseTo(-b[1], 6);
  });
});

describe('a sortie parks clear of its work’s plate (22 B9)', async () => {
  const { clearOfPlate } = (await import(/* @vite-ignore */ `${FX}/commands.ts`)) as {
    clearOfPlate(host: unknown, choices: Pt[], pk: string, clearPx: number, shipR: () => number): () => [number, number] | null;
  };
  const host = (rect: { x0: number; y0: number; x1: number; y1: number } | null) => ({ plateWorld: () => rect, px: () => 1 });
  it('takes the first place whose ship misses the plate, and keeps it', () => {
    const plate = { x0: 90, y0: -20, x1: 220, y1: 20 }; // the work's plate, to the right of it
    let rect: typeof plate | null = plate;
    const pick = clearOfPlate({ plateWorld: () => rect, px: () => 1 }, [[100, 0], [0, 100], [0, -100]], 'w', 20, () => 10);
    expect(pick()).toEqual([0, 100]);
    rect = { x0: -50, y0: 80, x1: 50, y1: 120 }; // the plate moves: the ship doesn't change its mind
    expect(pick()).toEqual([0, 100]);
  });
  it('with no plate shown, the first; with none clear, the furthest', () => {
    expect(clearOfPlate(host(null), [[1, 2], [3, 4]], 'w', 0, () => 0)()).toEqual([1, 2]);
    expect(clearOfPlate(host({ x0: -500, y0: -500, x1: 500, y1: 500 }), [[0, 0], [400, 0]], 'w', 200, () => 0)()).toEqual([400, 0]);
  });
});

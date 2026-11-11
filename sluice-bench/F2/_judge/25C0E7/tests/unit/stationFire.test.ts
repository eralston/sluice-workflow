// 23 C5: a beamed close leaves the station's emitter (the art's `anchor('emitter')`, in world units), and
// only a view with no anchor falls back to the rim on the side facing the target. Renderer modules load
// by path, as commands.test.ts does.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
interface View { key: string; node: { world: { r: number }; seed: number }; at: readonly [number, number]; drawnR?: () => number; anchor?: (n: string) => readonly [number, number] | null }
type Call = { cmd?: string; args?: { from: () => readonly [number, number] | null } };
const { stationFire } = await load<{ stationFire: (c: unknown, target: View, actMs: number, style: 'phaser' | 'mine') => Call[] }>('theme/starChart/maneuvers/stationFire.ts');

const target: View = { key: 't', node: { world: { r: 10 }, seed: 1 }, at: [100, 0], drawnR: () => 10 };
const station = (anchor?: View['anchor']): View => ({ key: 's', node: { world: { r: 40 }, seed: 3 }, at: [0, 0], drawnR: () => 40, ...(anchor ? { anchor } : {}) });
const beam = (calls: Call[]) => calls.find((c) => c.cmd === 'phaser' || c.cmd === 'mine')!;

describe('a station’s beam (23 C5)', () => {
  it('leaves the emitter when the art has one, asked for by name', () => {
    const asked: string[] = [];
    const s = station((n) => { asked.push(n); return [-12, 7]; });
    for (const style of ['phaser', 'mine'] as const) expect(beam(stationFire({ facility: [s] }, target, 3000, style)).args!.from()).toEqual([-12, 7]);
    expect(new Set(asked)).toEqual(new Set(['emitter']));
  });

  it('follows the emitter as it moves (a live read, not a snapshot)', () => {
    let x = 1;
    const s = station(() => [x, 0]);
    const from = beam(stationFire({ facility: [s] }, target, 3000, 'phaser')).args!.from;
    x = 9;
    expect(from()).toEqual([9, 0]);
  });

  it('falls back to the rim facing the target when the view has no anchor, or none by that name', () => {
    for (const s of [station(), station(() => null)]) {
      const [x, y] = beam(stationFire({ facility: [s] }, target, 3000, 'phaser')).args!.from()!;
      expect(x).toBeCloseTo(40 * 0.45, 6);
      expect(y).toBeCloseTo(0, 6);
    }
  });
});

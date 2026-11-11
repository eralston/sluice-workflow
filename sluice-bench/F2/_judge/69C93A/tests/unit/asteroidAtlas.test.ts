import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Renderer code sits outside this project's tsconfig; load it by path and type it by hand.
const keys = (await import(/* @vite-ignore */ resolve(__dirname, '../../src/renderer/src/chart/art/asteroidAtlasKeys'))) as {
  allAtlasKeys(): string[];
  atlasKey(m: string, s: string, v: number, p: string): string;
  atlasStateOf(stage: string, steps: readonly unknown[] | undefined): string | null;
  ATLAS_STATES: readonly string[];
  variantOf(seed: number): number;
};
const { allAtlasKeys, atlasKey, atlasStateOf, ATLAS_STATES, variantOf } = keys;

// 23 C7: the atlas's key mapping, its fallback rules, and the committed sheet matching the key set.
describe('asteroid atlas keys', () => {
  it('names a covered state with no steps', () => {
    expect(atlasStateOf('asteroid.metal.underway', undefined)).toBe('underway');
    expect(atlasStateOf('asteroid.ready', [])).toBe('ready');
    expect(atlasStateOf('asteroid.new', undefined)).toBe('sketch'); // an alias of the ladder
    expect(atlasStateOf('asteroid.crystal.closed:', undefined)).toBe('accomplished');
  });
  it('falls back (null) for steps, deferred and unknown states', () => {
    expect(atlasStateOf('asteroid.metal.underway:can', undefined)).toBeNull();
    expect(atlasStateOf('asteroid.metal.ready', ['new'])).toBeNull();
    expect(atlasStateOf('asteroid.deferred', undefined)).toBeNull();
    expect(atlasStateOf('asteroid.bogus', undefined)).toBeNull();
    expect(atlasStateOf('ship.x', undefined)).toBeNull();
  });
  it('maps a seed to a variant in range and builds stable keys', () => {
    expect(variantOf(12345)).toBeGreaterThanOrEqual(0);
    expect(atlasKey('metal', 'ready', 0, 'rock')).toBe('asteroid.metal.ready.v0.rock');
    expect(allAtlasKeys()).toHaveLength(3 * ATLAS_STATES.length * 2);
  });
  it('the PNG header matches the JSON meta.size', () => {
    const png = readFileSync('assets/atlas/asteroids.png');
    const sheet = JSON.parse(readFileSync('assets/atlas/asteroids.json', 'utf8')) as { meta: { size: { w: number; h: number } } };
    expect({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) }).toEqual(sheet.meta.size);
  });
  it('the committed sheet holds every key, each with its outline shape', () => {
    const sheet = JSON.parse(readFileSync('assets/atlas/asteroids.json', 'utf8')) as { frames: Record<string, unknown>; meta: { aura: Record<string, unknown> } };
    for (const k of allAtlasKeys()) expect(sheet.frames, k).toHaveProperty([k]);
    for (const k of allAtlasKeys().filter((x) => x.endsWith('.rock'))) expect(sheet.meta.aura, k).toHaveProperty([k]);
  });
});

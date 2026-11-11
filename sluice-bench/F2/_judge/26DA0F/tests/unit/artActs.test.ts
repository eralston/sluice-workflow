// The art acts (22 C3, 05 §8 M-25; G-1): every act a Star Chart maneuver issues is one its asset
// plays, so none does nothing. The maneuvers' sources are read for their `cmd.act(…, 'name')` calls,
// and each name must be listed by the asset of the part it's issued on.
// Renderer code sits outside this project's tsconfig, so it is loaded by a runtime path (as in
// registries.test.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../src/renderer/src');
const { assets } = (await import(/* @vite-ignore */ resolve(SRC, 'theme/starChart/assets/index.ts'))) as { assets: { id: string; acts?: readonly string[] }[] };
const { victory } = (await import(/* @vite-ignore */ resolve(SRC, 'theme/starChart/assets/acts.ts'))) as { victory: (art: { setAuraFlare(s: number): void }) => (((g: unknown, u: number) => void) & { durS?: number; end?: () => void }) | null };
const { AURA_FLARE_MS, flareShare } = (await import(/* @vite-ignore */ resolve(SRC, 'chart/art/aura.ts'))) as { AURA_FLARE_MS: number; flareShare: (u: number) => number };
const { motion } = (await import(/* @vite-ignore */ resolve(SRC, 'chart/art/motion.ts'))) as { motion: { reduced: boolean } };
const actsOf = (id: string) => new Set(assets.find((a) => a.id === id)?.acts ?? []);

/** Which asset each maneuver's act calls go to: the subject (a piece) or the station (`f`). */
const PIECE = new Set([...actsOf('asteroid'), ...actsOf('hive')]);
const STATION = actsOf('dreadnought');

describe('art acts (22 C3, M-25)', () => {
  it('the six that did nothing now play: carve, rig, ghost on asteroids; engage on enemy ships; launch, operate on stations', () => {
    for (const a of ['carve', 'rig', 'ghost']) expect(actsOf('asteroid').has(a), a).toBe(true);
    expect(actsOf('hive').has('engage')).toBe(true);
    for (const a of ['launch', 'operate']) expect(STATION.has(a), a).toBe(true);
  });

  it('every act a maneuver issues is one an asset plays', () => {
    const dir = resolve(SRC, 'theme/starChart/maneuvers');
    const issued: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      for (const m of readFileSync(resolve(dir, f), 'utf8').matchAll(/cmd\.act\(\s*([a-zA-Z.!]+)\s*,\s*'([a-z]+)'/g)) issued.push(`${f}:${m[1]}:${m[2]}`);
    }
    expect(issued.length).toBeGreaterThan(8);
    const known = new Set([...PIECE, ...STATION, ...actsOf('captain'), ...actsOf('world')]);
    const missing = issued.filter((x) => !known.has(x.split(':')[2]!));
    expect(missing).toEqual([]);
  });

  it('victory is played by asteroids and hive ships, and issued at the land of the three victories (27 B3)', () => {
    expect(actsOf('asteroid').has('victory')).toBe(true);
    expect(actsOf('hive').has('victory')).toBe(true);
    const dir = resolve(SRC, 'theme/starChart/maneuvers');
    const files = readdirSync(dir).filter((f) => readFileSync(resolve(dir, f), 'utf8').match(/cmd\.act\(\s*[a-zA-Z.!]+\s*,\s*'victory'/));
    expect(files.sort()).toEqual(['landing.ts', 'seatComplete.ts', 'strikeRun.ts']);
  });
});

describe('the victory act (27 B3)', () => {
  const was = motion.reduced;
  afterEach(() => { motion.reduced = was; });
  const fake = () => { const f = { share: -1, setAuraFlare(s: number) { f.share = s; } }; return f; };

  it('in full motion it drives the flare across AURA_FLARE_MS and puts the resting weight back at its end', () => {
    motion.reduced = false;
    const art = fake();
    const o = victory(art)!;
    expect(o).not.toBeNull();
    expect(o.durS).toBe(AURA_FLARE_MS / 1000);
    o(null, 0);
    expect(art.share).toBe(1);
    o(null, 0.5);
    expect(art.share).toBeGreaterThan(0);
    expect(art.share).toBeLessThan(1);
    o.end!();
    expect(art.share).toBe(0);
  });

  it('under reduced motion it plays nothing', () => {
    motion.reduced = true;
    expect(victory(fake())).toBeNull();
  });

  it('flareShare starts at 1, ends at 0 and never rises', () => {
    expect(flareShare(0)).toBe(1);
    expect(flareShare(1)).toBe(0);
    let prev = 1;
    for (let i = 1; i <= 100; i++) { const v = flareShare(i / 100); expect(v).toBeLessThanOrEqual(prev); prev = v; }
  });
});

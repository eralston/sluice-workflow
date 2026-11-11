// 23 E6: the theme owns the reading copy. The Star Chart theme says exactly what Read.tsx used to say
// (frozen below, for SDLC), every `+N more` site reads the active theme's string, and a theme with other
// words rewrites both without the settings tab or the lists changing. Also 23 E7: its tour copy is complete.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { terminology } from '@shared/engine/terminology';
import { packById } from '@shared/packs/registry';
import '@shared/packs/all';

const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
type Copy = { paragraph(c: unknown, s: unknown): string[]; tour(c: unknown, s: unknown): { target: string; title: string; body: string }[]; more(n: number): string; fewer(): string };

const SDLC_PARAGRAPH = 'Each solar system is one team’s Sprint, played back as an episode. Everyone with work in the Sprint has a big homeworld ringed round the star, lit only on the side that faces it, and their captain flies to wherever they’re working. User Stories are asteroids, Bugs are enemy ships: both start in the shadow on the homeworld’s dark side, asteroids to the left and enemy ships to the right. The captains carve the asteroids and rig them for harvest, and the fleet engages the enemy ships until a strike run breaks them apart. Finished work moves to the lit edge as a small, gently lit platform in orbit, for good. Repositories are stations, and the Pull Requests and Pipeline runs around them are tender shuttles and point defenses. New work first appears as a wireframe sensor contact; after that, colour shows how far along anything is: grey ready, blue underway, violet nearing, gold accomplished. A homeworld blooms as its own person’s work is finished, and is never compared with anyone else’s. Press Space to play, drag the ruler to move through time, and hover anything to see what it is.';

describe('ThemePack.readCopy (23 E6)', () => {
  it('the Star Chart theme reads exactly as the settings tab always did', async () => {
    const { readCopy } = await load<{ readCopy: Copy }>('theme/starChart/readCopy');
    const { words } = await load<{ words: object }>('theme/starChart/words');
    const pack = packById('sdlc')!;
    const c = terminology(pack, 'chart', { chart: words });
    const s = terminology(pack, 'source', {});
    expect(readCopy.paragraph(c, s).join(' ')).toBe(SDLC_PARAGRAPH);
    expect(readCopy.more(3)).toBe('+3 more');
    expect(readCopy.fewer()).toBe('show fewer');
  });

  it('every `+N more` site goes through the active theme (moreText)', async () => {
    const { registerTheme, useTheme, moreText, fewerText } = await load<{
      registerTheme(t: unknown): void; useTheme(id: string): unknown; moreText(n: number): string; fewerText(): string;
    }>('theme/registry');
    expect(moreText(2)).toBe('+2 more'); // no theme active: the English default
    registerTheme({ id: 'fr', title: 'FR', roleAsset: {}, assets: [], commands: [], maneuvers: [], guides: [], words: {}, readCopy: { paragraph: () => [], tour: () => [], more: (n: number) => `${n} de plus`, fewer: () => 'moins' } });
    useTheme('fr');
    expect(moreText(2)).toBe('2 de plus');
    expect(fewerText()).toBe('moins');
  });

  it('the tour has 6 to 8 steps, one per kind of object, the player last', async () => {
    const { readCopy } = await load<{ readCopy: Copy }>('theme/starChart/readCopy');
    const pack = packById('sdlc')!;
    const steps = readCopy.tour(terminology(pack, 'chart', {}), terminology(pack, 'source', {}));
    expect(steps.length).toBeGreaterThanOrEqual(6);
    expect(steps.length).toBeLessThanOrEqual(8);
    expect(steps.map((x) => x.target)).toEqual(['star', 'seat', 'objective', 'threat', 'facility', 'agent', 'player']);
    for (const x of steps) { expect(x.title.length).toBeGreaterThan(0); expect(x.body.length).toBeGreaterThan(20); }
  });
});

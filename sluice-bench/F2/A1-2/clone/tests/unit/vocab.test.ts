// One vocabulary, two layers (22 B1–B2, R12): the renderer's kind map names Solar's objects with the
// theme's own words (one source of truth: they disagreed before, Dreadnought against station), the
// user's normalized names hold, and no retired name survives. Renderer code, loaded by a runtime path.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../src/renderer/src');
type Names = { glyph: string; chart: string; ado: string; adoPlural: string };
const vocab = (await import(/* @vite-ignore */ resolve(SRC, 'vocab.ts'))) as {
  kindNames(kind: string, paradigm: string): Names | undefined;
  kindLine(forms: { kind: string; typeName?: string }[], paradigm: string): { ado: string; metaphor: string };
  KINDS: Record<string, Names>;
  SOLAR_NAMES: Record<string, Names>;
};
const { words } = (await import(/* @vite-ignore */ resolve(SRC, 'theme/starChart/words.ts'))) as {
  words: { role: Record<string, { one: string }>; agent: { one: string }; level: Record<string, { one: string }> };
};

describe('the kind map and the theme agree (22 B2)', () => {
  it('names Solar’s objects with the theme’s words', () => {
    const solar = (k: string) => vocab.kindNames(k, 'solar')!.chart.toLowerCase();
    expect(solar('objective')).toBe(words.role.objective!.one);
    expect(solar('threat')).toBe(words.role.threat!.one);
    expect(solar('facility')).toBe(words.role.facility!.one);
    expect(solar('captain')).toBe(words.agent.one);
    expect(solar('seat')).toBe(words.level.seat!.one); // History's chart line says homeworld too (review)
  });

  it('holds the normalized names: ADO first, the chart second', () => {
    const pair = (k: string) => { const n = vocab.kindNames(k, 'solar')!; return [n.ado, n.chart]; };
    expect(pair('star')).toEqual(['Area Path', 'Star']);
    expect(pair('captain')).toEqual(['Assigned person', 'Captain']);
    expect(pair('objective')).toEqual(['User Story', 'Asteroid']);
    expect(pair('threat')).toEqual(['Bug', 'Enemy ship']);
    expect(pair('facility')).toEqual(['Repository', 'Station']);
  });

  it('retires Pod star, Hive ship and Dreadnought everywhere', () => {
    const all = JSON.stringify([vocab.KINDS, vocab.SOLAR_NAMES, words]).toLowerCase();
    for (const w of ['pod star', 'hive ship', 'dreadnought']) expect(all).not.toContain(w);
  });

  it('names a person by both forms, the captain first, whichever was pressed', () => {
    const seat = { kind: 'seat' }, captain = { kind: 'captain' };
    expect(vocab.kindLine([seat, captain], 'solar')).toEqual({ ado: 'Assigned person', metaphor: 'Captain and homeworld' });
    expect(vocab.kindLine([captain, seat], 'solar')).toEqual({ ado: 'Assigned person', metaphor: 'Captain and homeworld' });
    expect(vocab.kindLine([{ kind: 'objective', typeName: 'Requirement' }], 'solar')).toEqual({ ado: 'Requirement', metaphor: 'Asteroid' });
  });
});

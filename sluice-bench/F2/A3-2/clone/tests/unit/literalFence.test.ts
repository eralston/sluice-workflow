// The literal fence (14, intro): engine code speaks engine terms only. It never names an SDLC type
// or state ('User Story', 'Closed'), which only a domain pack knows, and never a theme's words
// (asteroid, dreadnought), which only a theme pack knows. The import fence in eslint.config.mjs
// keeps the engine from importing packs and v0 layouts; this test catches the words themselves.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

/** Every engine file: src/shared/engine/**, and the solar projection and its lists. */
function engineFiles(): string[] {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []);
  const engine = join(ROOT, 'src/shared/engine');
  const extra = ['src/shared/scene/project/solar.ts', 'src/shared/scene/project/lists.ts'].map((p) => join(ROOT, p));
  return [...(existsSync(engine) ? walk(engine) : []), ...extra.filter(existsSync)].sort();
}

/** SDLC names, as string literals: a pack's lookup keys. */
const SDLC_NAMES = ['User Story', 'Bug', 'Task', 'Feature', 'Closed', 'Active', 'Resolved', 'Pull Request'];
/**
 * Theme words, as whole words in any case (identifiers like `stations: StationSlot[]`, 14 §2.3, are
 * engine names for a facility's slots and don't match).
 */
const THEME_WORDS = ['asteroid', 'hive', 'enemy', 'dreadnought', 'station', 'shuttle'];

const sdlcRe = new RegExp(`(['"\`])(${SDLC_NAMES.join('|')})\\1`, 'g');
const themeRe = new RegExp(`\\b(${THEME_WORDS.join('|')})\\b`, 'gi');

/** Every fence break in a source text, as `line: match`. */
function fenceBreaks(text: string): string[] {
  return text.split('\n').flatMap((line, i) => [
    ...[...line.matchAll(sdlcRe)].map((m) => `${i + 1}: ${m[0]}`),
    ...[...line.matchAll(themeRe)].map((m) => `${i + 1}: ${m[0]}`),
  ]);
}

describe('the literal fence (14, intro)', () => {
  it('catches what it should, and lets engine names through', () => {
    expect(fenceBreaks(`if (type === 'User Story') return;\nconst s = "Closed";\nconst t = \`Task\`;`)).toEqual(["1: 'User Story'", '2: "Closed"', '3: `Task`']);
    expect(fenceBreaks('// the asteroid lands\n// a Hive ship\nconst dreadnought = 1; // shuttle')).toEqual(['1: asteroid', '2: Hive', '3: dreadnought', '3: shuttle']);
    expect(fenceBreaks('stations: StationSlot[]; // a facility; Tasks; a Bugfix; taskKeys')).toEqual([]);
  });

  it('holds in every engine file', () => {
    const files = engineFiles();
    expect(files.length).toBeGreaterThan(0);
    // The glob reaches every engine file, the readers of moves, facts and words among them (17 W1-T1).
    const covered = files.map((f) => relative(ROOT, f));
    for (const f of ['moves', 'facts', 'terminology', 'signal', 'stageCode', 'types']) expect(covered).toContain(`src/shared/engine/${f}.ts`);
    const breaks = files.flatMap((f) => fenceBreaks(readFileSync(f, 'utf8')).map((b) => `${relative(ROOT, f)}:${b}`));
    expect(breaks).toEqual([]);
  });
});

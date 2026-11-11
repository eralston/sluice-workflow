// The rulebook of Solar playback (05 §8, 22 C1) stays true to the code and to itself: every pace rule
// is in its "what plays" tables, every Activity level is named, every rule, conflict, gap and idea id is
// defined once, and every id it cites is one it defines.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACE_RULES } from '@shared/engine/pace';
import { ENGAGEMENT } from '@shared/playback/engagement';

const doc = readFileSync(resolve(__dirname, '../../docs/05-playback.md'), 'utf8');
const s8 = doc.slice(doc.indexOf('## 8. The rules of Solar playback'));
const section = (from: string, to: string) => s8.slice(s8.indexOf(from), s8.indexOf(to));
/** An id as a table row's or a bullet's own (`| **K-3** …`, `| G-2 |`, `- **R-1 …`): where it's defined. */
const defined = [...s8.matchAll(/^(?:\| (?:\*\*)?|- \*\*)([SBMPKTLAR XGI]-\d+)\b/gm)].map((m) => m[1]!.replace(' ', ''));

describe('the rulebook (05 §8)', () => {
  it('exists, with its sections', () => {
    expect(s8.length).toBeGreaterThan(1000);
    for (const h of ['### 8.2', '### 8.3', '### 8.4', '### 8.5', '### 8.6', '### 8.7', '### 8.8', '### 8.9', '### 8.11', '### 8.12', '### 8.13']) expect(s8).toContain(h);
  });

  it('names every pace rule in its "what plays" tables', () => {
    const plays = section('### 8.4', '### 8.5');
    for (const r of PACE_RULES) expect(plays, r.id).toContain(`\`${r.id}\``);
  });

  it('names every Activity level', () => {
    for (const level of Object.keys(ENGAGEMENT)) expect(s8.toLowerCase()).toContain(level);
  });

  it('defines each id once, and cites only ids it defines', () => {
    const seen = new Set<string>();
    const twice = defined.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(twice).toEqual([]);
    for (const p of ['S', 'B', 'M', 'P', 'K', 'T', 'L', 'A', 'R', 'X', 'G', 'I']) expect([...seen].some((id) => id.startsWith(`${p}-`)), p).toBe(true);
    const cited = new Set([...s8.matchAll(/\b([SBMPKTLARXGI]-\d+)\b/g)].map((m) => m[1]!));
    expect([...cited].filter((id) => !seen.has(id)).sort()).toEqual([]);
  });
});

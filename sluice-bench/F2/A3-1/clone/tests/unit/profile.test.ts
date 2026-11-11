// C4a: the device profiles (15 §11): every bundled file parses, desktop is today's numbers, and the
// resolver falls back to the bundle with a notice and a reason code (never a value).
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deviceProfileSchema, PROFILE_IDS } from '@shared/contracts/profile';
import { BUNDLED, DESKTOP } from '@shared/profile/bundled';
import { resolveProfile } from '@shared/profile/resolve';

const DIR = resolve(__dirname, '../../config/profiles');
const o = (v: unknown) => JSON.stringify(v);

describe('bundled profiles', () => {
  it('every file parses and its id matches its filename; every id has a file', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
    expect(files).toEqual([...PROFILE_IDS].map((i) => `${i}.json`).sort());
    for (const f of files) {
      const parsed = deviceProfileSchema.parse(JSON.parse(readFileSync(resolve(DIR, f), 'utf8')));
      expect(`${parsed.id}.json`).toBe(f);
      expect(BUNDLED[parsed.id]).toEqual(parsed);
    }
  }, 20000);

  it('desktop is today exactly', () => {
    expect(DESKTOP.pacing).toEqual({ budgetMs: 45000, highlightBudgetMs: 30000 });
    expect(DESKTOP.render.budget).toEqual({ frameVsyncs: 2, toleranceMs: 2 });
    expect(DESKTOP.render.limits).toEqual({ maxActiveFx: 24 });
    expect(DESKTOP.render.switches).toEqual({ paint: true, twinkle: true, ornament: true, auraBake: false });
  });

  it('the schema is strict at every level', () => {
    expect(deviceProfileSchema.safeParse({ ...DESKTOP, extra: 1 }).success).toBe(false);
    expect(deviceProfileSchema.safeParse({ ...DESKTOP, pacing: { ...DESKTOP.pacing, x: 1 } }).success).toBe(false);
    expect(deviceProfileSchema.safeParse({ ...DESKTOP, pacing: { ...DESKTOP.pacing, budgetMs: 10 } }).success).toBe(false);
  });
});

describe('resolveProfile', () => {
  it('no file: desktop, no notice', () => {
    expect(resolveProfile({ overrideText: null })).toEqual({ profile: DESKTOP, source: 'bundled', overridden: false, notice: null, reason: null });
  });

  it('a valid partial override merges over the base', () => {
    const r = resolveProfile({ overrideText: o({ pacing: { budgetMs: 20000 }, render: { switches: { paint: false } } }) });
    expect(r.profile.pacing).toEqual({ budgetMs: 20000, highlightBudgetMs: 30000 });
    expect(r.profile.render.switches).toEqual({ paint: false, twinkle: true, ornament: true, auraBake: false });
    expect(r).toMatchObject({ source: 'bundled', overridden: true, notice: null, reason: null });
  });

  it('the profile key switches the base', () => {
    const r = resolveProfile({ overrideText: o({ profile: 'phone' }) });
    expect(r.profile).toEqual(BUNDLED.phone);
    expect(r).toMatchObject({ source: 'override', overridden: false, reason: null });
  });

  it('pinned wins over the override profile key, and the override still merges', () => {
    const r = resolveProfile({ overrideText: o({ profile: 'tablet', pacing: { budgetMs: 12000 } }), pinned: 'phone' });
    expect(r.profile.id).toBe('phone');
    expect(r.profile.pacing.budgetMs).toBe(12000);
    expect(r).toMatchObject({ source: 'pinned', overridden: true });
  });

  it('a pinned id alone', () => {
    expect(resolveProfile({ overrideText: null, pinned: 'tablet' })).toMatchObject({ profile: BUNDLED.tablet, source: 'pinned', reason: null });
  });

  const faults: [string, Parameters<typeof resolveProfile>[0], string][] = [
    ['invalid JSON', { overrideText: '{ nope' }, 'parse'],
    ['an unknown key', { overrideText: o({ pacing: { budgetMS: 20000 } }) }, 'schema'],
    ['an out-of-range value', { overrideText: o({ pacing: { budgetMs: 5 } }) }, 'schema'],
    ['an unknown profile id in the file', { overrideText: o({ profile: 'watch' }) }, 'schema'],
    ['an unknown pinned id', { overrideText: null, pinned: 'watch' }, 'unknown-id'],
  ];
  for (const [name, input, reason] of faults) {
    it(`${name}: the bundle, a notice, reason ${reason}`, () => {
      const r = resolveProfile(input);
      expect(r.profile).toEqual(DESKTOP);
      expect(r).toMatchObject({ source: 'bundled', overridden: false, reason });
      expect(r.notice).toMatch(/using the bundled profile/);
    });
  }

  it('a fault keeps a valid pin and drops the override', () => {
    const r = resolveProfile({ overrideText: '[', pinned: 'phone' });
    expect(r.profile).toEqual(BUNDLED.phone);
    expect(r).toMatchObject({ source: 'pinned', overridden: false, reason: 'parse' });
  });

  it('notices and reasons carry no values from the file', () => {
    const r = resolveProfile({ overrideText: o({ pacing: { budgetMs: 123456789, bogus: 'secret-text' } }) });
    expect(JSON.stringify([r.notice, r.reason])).not.toMatch(/123456789|secret-text/);
  });
});

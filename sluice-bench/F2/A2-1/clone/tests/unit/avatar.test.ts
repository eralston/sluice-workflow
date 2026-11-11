import { describe, expect, it } from 'vitest';
import { AVATAR_COLORS, AVATAR_TEXT, avatarColor, initialsOf, isAvatarImage } from '@shared/scene/avatar';
import { scopeHistorySchema } from '@shared/contracts/ipc';
import history from '../../fixtures/generated/orbit-week.history.json';

// The signal ladder (09 §1): avatar colors must stay clear of these.
const LADDER = { ready: 0x8a93a6, underway: 0x5aa9ff, nearing: 0xa487ff, accomplished: 0xffc76b };

const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => v / 255);
function luminance(c: number): number {
  const [r, g, b] = channels(c).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: number, b: number) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
function hsl(c: number): { h: number; s: number } {
  const [r, g, b] = channels(c) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s };
}
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('label avatars (06 §4)', () => {
  it('takes the first letters of the first and last names', () => {
    expect(initialsOf('Dave Mauldin')).toBe('DM');
    expect(initialsOf('Ava Maria Lindqvist')).toBe('AL');
    expect(initialsOf('  mina   sato ')).toBe('MS');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf('Émile Ångström')).toBe('ÉÅ');
    expect(initialsOf('')).toBe('?');
  });

  it('colors by initials alone: the same initials always match, and different ones vary', () => {
    expect(avatarColor('DM')).toBe(avatarColor(initialsOf('Dana Moreau')));
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const used = new Set([...letters].flatMap((a) => [...letters].map((b) => avatarColor(a + b))));
    expect(used.size).toBe(AVATAR_COLORS.length);
  });

  it('keeps ivory initials at WCAG AA on every color', () => {
    for (const c of AVATAR_COLORS) expect(contrast(c, AVATAR_TEXT), c.toString(16)).toBeGreaterThanOrEqual(4.5);
  });

  it('stays clear of the ladder hues: a different hue, or plainly a different value', () => {
    for (const c of AVATAR_COLORS) {
      const { h, s } = hsl(c);
      expect(s, `${c.toString(16)} is too grey`).toBeGreaterThan(0.35);
      for (const l of [LADDER.underway, LADDER.nearing, LADDER.accomplished]) {
        if (hueGap(h, hsl(l).h) < 20) expect(contrast(c, l), `${c.toString(16)} vs ${l.toString(16)}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('accepts only inline images, and the fixture carries one through validation', () => {
    expect(isAvatarImage('https://dev.azure.com/org/_apis/GraphProfile/MemberAvatars/x')).toBe(false);
    expect(isAvatarImage('data:text/html;base64,PGI+')).toBe(false);
    expect(isAvatarImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    const parsed = scopeHistorySchema.parse(history);
    expect(parsed.entities.captains.filter((c) => c.avatar).map((c) => c.displayName)).toEqual(['Mina Sato']);
    expect(() => scopeHistorySchema.parse({
      ...history,
      entities: { ...history.entities, captains: [{ ...history.entities.captains[0]!, avatar: 'https://example.invalid/a.png' }] },
    })).toThrow();
  });
});

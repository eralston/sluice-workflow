// The captain file (23 E2): `{ v: 1, faction, hull, colourway }`, nothing else. A round trip, every way
// a file can be wrong (unknown values, extra fields, other versions, not JSON, too big), and the check
// against the real fleet (a hull of another faction, a colourway that does not exist).
import { describe, expect, it } from 'vitest';
import { CAPTAIN_FILE_MAX_BYTES, captainFileOf, checkAgainstFleet, parseCaptainFile, serializeCaptainFile } from '../../src/shared/captainFile';
import type { CaptainStyle } from '../../src/shared/contracts/settings';

// Literal limits (the renderer's fleet is not importable here); the e2e round trip uses the real fleet.
const fleet = { hullFactions: ['trek', 'trek', 'wars', 'wars', 'mecha', 'mecha'], colourways: 12 };
const mecha = 4;
const style: CaptainStyle = { faction: 'mecha', hull: mecha, colourway: 2 };

describe('captain file', () => {
  it('writes exactly the four fields, versioned, and reads them back', () => {
    const text = serializeCaptainFile(style);
    expect(Object.keys(JSON.parse(text))).toEqual(['v', 'faction', 'hull', 'colourway']);
    expect(JSON.parse(text).v).toBe(1);
    expect(parseCaptainFile(text)).toEqual({ ok: true, style });
    // Extra fields on a style never reach the file.
    expect(captainFileOf({ ...style, name: 'Wren', emblem: 'x' } as CaptainStyle)).toEqual({ v: 1, ...style });
  });

  it('refuses what it does not know, with a message', () => {
    const bad = (o: unknown) => parseCaptainFile(typeof o === 'string' ? o : JSON.stringify(o));
    for (const o of [
      'not json', '[]', 'null', {},
      { v: 1, faction: 'klingon', hull: 1, colourway: 1 },
      { v: 1, faction: 'trek', hull: -1, colourway: 1 },
      { v: 1, faction: 'trek', hull: 1.5, colourway: 1 },
      { v: 1, faction: 'trek', hull: 1 },
      { v: 1, faction: 'trek', hull: 1, colourway: 1, emblem: 'star' },
    ]) {
      const r = bad(o);
      expect(r.ok, JSON.stringify(o)).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(10);
    }
    expect(bad({ v: 2, faction: 'trek', hull: 1, colourway: 1 })).toMatchObject({ ok: false, message: expect.stringContaining('version') });
    expect(bad(' '.repeat(CAPTAIN_FILE_MAX_BYTES + 1))).toMatchObject({ ok: false });
  });

  it('checks the hull and colourway against the fleet', () => {
    expect(checkAgainstFleet(style, fleet).ok).toBe(true);
    expect(checkAgainstFleet({ ...style, faction: 'trek' }, fleet).ok).toBe(false); // that hull is another faction's
    expect(checkAgainstFleet({ ...style, hull: 63 }, fleet).ok).toBe(false);
    expect(checkAgainstFleet({ ...style, colourway: fleet.colourways }, fleet).ok).toBe(false);
  });
});

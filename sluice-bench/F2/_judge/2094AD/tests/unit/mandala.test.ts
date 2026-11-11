// 22 Block D — the mandala (`engine/solar/mandala.ts`, `scene/project/loiter.ts`): a ring's fill order,
// the half-disc's equal-area, mirrored slots, the trophy shells, and loiter slots by arrival (the first
// on the far side, each kept while its ship stays), the same at a seek as in play. Hand-built facts.
import { describe, expect, it } from 'vitest';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { CanonicalKey } from '@shared/contracts/keys';
import { halfDiscSlots, loiterOffset, slotOrder, trophyOffset, trophyShells } from '@shared/engine/solar/mandala';
import type { PieceFacts, RoundFacts } from '@shared/engine/types';
import { loiterSlots } from '@shared/scene/project/loiter';

const R = 520;

describe('the mandala’s slots (22 D1–D3)', () => {
  it('fills a ring from its axis, then either side in turn', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(slotOrder)).toEqual([0, 1, -1, 2, -2, 3, -3]);
  });

  it('splits a half-disc into equal areas, mirrored across the equator, nearest the centre first', () => {
    for (let n = 1; n <= 16; n++) {
      const { offsets, room } = halfDiscSlots(n, R, -1);
      expect(offsets).toHaveLength(n);
      for (const o of offsets) expect(o.x).toBeLessThan(0);
      for (const o of offsets) expect(offsets.some((q) => Math.abs(q.x - o.x) < 1e-9 && Math.abs(q.y + o.y) < 1e-9)).toBe(true);
      const d = offsets.map((o) => Math.hypot(o.x, o.y));
      expect(d).toEqual([...d].sort((a, b) => a - b));
      expect(room).toBeGreaterThan(0);
      // The bugs' side is the stories' mirrored across the meridian.
      expect(halfDiscSlots(n, R, 1).offsets).toEqual(offsets.map((o) => ({ x: -o.x, y: o.y })));
    }
    // One slot alone sits at the half-disc's centroid, on the equator.
    const [one] = halfDiscSlots(1, R, -1).offsets;
    expect(one!.y).toBe(0);
    expect(one!.x).toBeCloseTo((-4 * R) / (3 * Math.PI), 0);
    // More slots, less room each: never more for more.
    const rooms = [1, 2, 4, 8, 16].map((n) => halfDiscSlots(n, R, -1).room);
    rooms.slice(1).forEach((r, i) => expect(r).toBeLessThanOrEqual(rooms[i]! + 0.1));
  });

  it('turns odd shells half a slot, and pairs their first two either side of the star line', () => {
    const shells = trophyShells(R, 166.4, 40);
    expect(shells.length).toBeGreaterThan(1);
    expect(shells[0]!.turn).toBe(0);
    const toStar = { x: -1, y: 0 };
    const first = trophyOffset(shells, 0, toStar);
    expect(first.y).toBeCloseTo(0, 9);
    expect(first.x).toBeLessThan(0);
    const a = trophyOffset(shells, shells[0]!.n, toStar);
    const b = trophyOffset(shells, shells[0]!.n + 1, toStar);
    expect(a.y).toBeCloseTo(-b.y, 6);
    expect(a.x).toBeCloseTo(b.x, 6);
  });

  it('starts the loiter ring on the far side from the star', () => {
    const o = loiterOffset(900, 224, 0, { x: 1, y: 0 });
    expect(o.x).toBeCloseTo(900, 9);
    expect(o.y).toBeCloseTo(0, 9);
    expect(loiterOffset(900, 224, 1, { x: 1, y: 0 }).y).toBeCloseTo(-loiterOffset(900, 224, 2, { x: 1, y: 0 }).y, 9);
  });
});

describe('loiter slots by arrival (22 D3)', () => {
  const T0 = Date.UTC(2026, 8, 14);
  const H = 3_600_000;
  const ann = 'id:o:ann' as CanonicalKey;
  const ben = 'id:o:ben' as CanonicalKey;
  const cy = 'id:o:cy' as CanonicalKey;
  const wi = (n: number) => `wi:o:${n}` as CanonicalKey;
  const piece = (n: number, seat: CanonicalKey): PieceFacts => ({ key: wi(n), role: 'objective', member: [{ from: T0, to: null }], seatAt: [{ from: T0, seat }], signalAt: [], steps: [], parent: null });
  const f: RoundFacts = { round: { startUtc: T0, endUtc: T0 + 14 * 24 * H }, region: 'area:o:p', pieces: new Map([[wi(1), piece(1, ann)], [wi(2), piece(2, ben)], [wi(3), piece(3, cy)]]), seats: [ann, ben, cy], attachments: new Map(), moves: new Map() };
  const ev = (key: string, h: number, who: CanonicalKey, item: number) => ({ eventKey: key, kind: 'wi_title_changed', occurredAt: T0 + h * H, observedAt: T0 + h * H, entityKey: wi(item), projectKey: 'proj:o:p', priority: 'high', payload: {}, evidence: [], changedBy: who }) as unknown as AnyTimelineEvent;
  // Ben visits Ann's piece (hour 1), then Cy does (hour 2); Ben goes home (hour 3); Cy's slot holds.
  const events = [ev('e1', 1, ben, 1), ev('e2', 2, cy, 1), ev('e3', 3, ben, 2)];
  const at = (h: number) => loiterSlots(events, f, [ann, ben, cy], T0 + h * H);

  it('gives the first to arrive the far side, the next either side, and each keeps its slot while it stays', () => {
    expect(at(0).get(ann)).toEqual({ seat: ann, index: 0 }); // each by their own planet to start
    expect(at(1).get(ben)).toEqual({ seat: ann, index: 1 }); // Ann was there first
    expect(at(2).get(cy)).toEqual({ seat: ann, index: 2 });
    expect(at(3).get(ben)).toEqual({ seat: ben, index: 0 }); // home again
    expect(at(3).get(cy)).toEqual({ seat: ann, index: 2 }); // kept, though slot 1 freed up
  });

  it('is the same at a seek as in play: a pure function of the history up to the playhead', () => {
    expect([...at(2.5)]).toEqual([...at(2.5)]);
    expect(at(2.5)).toEqual(loiterSlots(events.slice(0, 2), f, [ann, ben, cy], T0 + 2.5 * H));
  });
});

// 22 C8, 05 §8.6a K-13, K-14 — guests come and go (`engine/guests.ts`): a guest is in the region from the
// beat they help in until the beat after their part, joined across help within `GUEST_STAY_MS` of
// playback at 1×; seated people are never guests; a silent beat summons no one; a PR's help waits by
// the work it serves, never its station while there's work to wait by.
import { describe, expect, it } from 'vitest';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Beat } from '@shared/contracts/playback';
import { GUEST_STAY_MS, guestPresence, helpOf, presentAt } from '@shared/engine/guests';
import type { AttachmentFacts, Move, PieceFacts, RoundFacts, Signal } from '@shared/engine/types';

const wi = (n: number) => `wi:o:${n}` as CanonicalKey;
const pr = (n: number) => `pr:o:r1:${n}` as CanonicalKey;
const repo = 'repo:o:r1' as CanonicalKey;
const ann = 'id:o:ann' as CanonicalKey; // seated
const gus = 'id:o:gus' as CanonicalKey; // a guest
const T0 = Date.UTC(2026, 8, 14);
const H = 3_600_000;
const READY: Signal = { rung: 'ready' };

const piece = (key: CanonicalKey, role: PieceFacts['role'], parent: CanonicalKey | null = null): PieceFacts => ({
  key, role, member: [{ from: T0, to: null }], seatAt: [{ from: T0, seat: role === 'step' ? null : ann }], signalAt: [{ from: T0, signal: READY }], steps: [], parent,
  ...(parent ? { parentAt: [{ from: T0, parent }] } : {}),
} as PieceFacts);
const att = (key: CanonicalKey, links: CanonicalKey[]): AttachmentFacts => ({ key, facility: repo, author: gus, open: { from: T0, to: null }, links, approvers: [], signalAt: [] });

const ev = (key: string, at: number): AnyTimelineEvent =>
  ({ eventKey: key, kind: 'wi_state_changed', occurredAt: T0 + at, observedAt: T0 + at, entityKey: wi(0), projectKey: 'proj:o:p', priority: 'high', payload: { from: '', to: '' }, evidence: [], changedBy: gus }) as unknown as AnyTimelineEvent;

function facts(moves: [string, Move[]][]): RoundFacts {
  return {
    round: { startUtc: T0, endUtc: T0 + 14 * 24 * H }, region: 'area:o:p:2',
    pieces: new Map([[wi(1), piece(wi(1), 'objective')], [wi(2), piece(wi(2), 'step', wi(1))], [wi(3), piece(wi(3), 'threat')]]),
    seats: [ann], attachments: new Map([[pr(7), att(pr(7), [wi(2)])]]), moves: new Map(moves),
  };
}
const climb = (key: CanonicalKey, actor: CanonicalKey): Move => ({ m: 'climb', key, role: 'objective', from: READY, to: { rung: 'underway' }, actor });
/** A beat at `startMs` of playback, `durMs` long, for one event at hour `h`. */
const beat = (index: number, key: string, h: number, startMs: number, durMs = 3000, accented = true): Beat =>
  ({ index, sourceUtc: T0 + h * H, firstUtc: T0 + h * H, eventKeys: [key], priority: 'high', presentationStartMs: startMs, durationMs: accented ? durMs : 0, accented });

describe('guest presence (22 C8, K-13, K-14)', () => {
  const events = ['a', 'b', 'c', 'd', 'e'].map((k, i) => ev(k, i * H));
  const h = { events } as unknown as ScopeHistory;

  it('help within the stay joins one visit; after a longer wait they leave with the next beat and come back later', () => {
    const f = facts([['a', [climb(wi(1), gus)]], ['c', [climb(wi(3), gus)]], ['e', [climb(wi(1), gus)]]]);
    const beats = [
      beat(0, 'a', 0, 0), beat(1, 'b', 1, 4000), beat(2, 'c', 2, 8000), // c starts 5 s after a ends: joined
      beat(3, 'd', 3, 12_000), beat(4, 'e', 4, 11_000 + GUEST_STAY_MS + 4001), // e starts past the stay after c ends
    ];
    const w = guestPresence(h, beats, f, new Set([ann])).get(gus)!;
    expect(w).toEqual([{ fromUtc: T0, untilUtc: T0 + 3 * H }, { fromUtc: T0 + 4 * H, untilUtc: null }]);
    expect(presentAt(w, T0 + 2 * H)).toBe(true); // waiting nearby between a and c
    expect(presentAt(w, T0 + 3 * H)).toBe(false); // gone as d plays
    expect(presentAt(w, T0 + 4 * H)).toBe(true); // back for e, and stays to the end
    expect(presentAt(w, T0 - 1)).toBe(false); // not before their first help
  });

  it('a seated person is never a guest, and a silent beat summons no one', () => {
    const f = facts([['a', [climb(wi(1), ann)]], ['b', [climb(wi(1), gus)]]]);
    const p = guestPresence(h, [beat(0, 'a', 0, 0), beat(1, 'b', 1, 4000, 3000, false)], f, new Set([ann]));
    expect(p.size).toBe(0);
  });

  it('a PR’s help is on the work it serves (a step standing for its parent), its facility last', () => {
    const f = facts([['a', [{ m: 'attach', key: pr(7), facility: repo, author: gus }]]]);
    expect(helpOf(f, events[0]!)).toEqual([{ who: gus, at: [wi(1), repo] }]);
  });

  it('is deterministic', () => {
    const f = facts([['a', [climb(wi(1), gus)]], ['c', [climb(wi(3), gus)]]]);
    const beats = [beat(0, 'a', 0, 0), beat(1, 'b', 1, 4000), beat(2, 'c', 2, 30_000), beat(3, 'd', 3, 34_000)];
    expect(guestPresence(h, beats, f, new Set([ann]))).toEqual(guestPresence(h, beats, f, new Set([ann])));
  });
});

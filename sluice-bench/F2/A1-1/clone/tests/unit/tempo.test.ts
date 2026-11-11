// Adaptive speed (27 E5b, 05 §8.5c P-25): the clock moves x faster between climaxes; x, the ruler and every seek are unchanged.
import { describe, expect, it } from 'vitest';
import stateMappingJson from '@config/state-mapping.json';
import type { StateMapping } from '@shared/contracts/history';
import { PlaybackClock } from '@shared/playback/clock';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { toHistory } from '@fixtures/dsl';
import orbitWeek from '@fixtures/scenarios/orbit-week';

const h = toHistory(orbitWeek, stateMappingJson as StateMapping);
const plain = buildBeatSchedule(h, h.range, orbitWeek.tz);
const played = plain.beats.filter((b) => b.durationMs > 0);
const climax = played[2]!; // a climax beat: it plays at 1x
/** The same schedule with every played beat but one sped by `k`. */
const sped = (k: number) => buildBeatSchedule(h, h.range, orbitWeek.tz, {
  limelight: () => ({
    named: new Set(), spotlights: new Map(),
    direction: { forms: new Map(), climaxes: new Set(), levers: ['speed'], estimateMs: 0, tempo: new Map(played.filter((b) => b !== climax).map((b) => [b.index, k] as const)) },
  }),
});

describe('adaptive speed', () => {
  it('a schedule with no tempo is as long in wall time as in x', () => {
    expect(plain.wallMs).toBe(plain.totalMs);
    expect(plain.tempoAt(plain.totalMs / 2)).toBe(1);
    expect(plain.wallAt(1234)).toBe(1234);
  });

  it('wallMs is the sum of each stretch\'s length over its tempo, and the orientation plays at 1x', () => {
    const s = sped(2);
    const first = played[0]!.presentationStartMs;
    let want = first;
    played.forEach((b, i) => {
      const end = played[i + 1]?.presentationStartMs ?? s.totalMs;
      want += (end - b.presentationStartMs) / (b === climax ? 1 : 2);
    });
    expect(s.wallMs).toBeCloseTo(want, 6);
    expect(s.wallMs).toBeLessThan(s.totalMs);
    expect(s.wallAt(first)).toBe(first);
    expect(s.wallAt(s.totalMs)).toBeCloseTo(s.wallMs, 6);
    expect(s.tempoAt(0)).toBe(1);
  });

  it('tempoAt is 1 on a climax beat and k elsewhere, changing only at beat starts', () => {
    const s = sped(2);
    const at = (b: (typeof played)[number]) => s.tempoAt(b.presentationStartMs);
    expect(at(climax)).toBe(1);
    expect(s.tempoAt(climax.presentationStartMs + climax.durationMs / 2)).toBe(1);
    expect(at(played[1]!)).toBe(2);
    expect(s.tempoAt(climax.presentationStartMs - 1)).toBe(2);
    expect(at(played[3]!)).toBe(2);
  });

  it('at tempo 2 advance moves x twice as far, and at 1x on the climax', () => {
    const s = sped(2);
    const c = new PlaybackClock(s);
    c.seek(played[1]!.presentationStartMs + 1);
    c.play();
    const x0 = c.x;
    c.advance(50);
    expect(c.x - x0).toBeCloseTo(100, 6);
    c.seek(climax.presentationStartMs + 1);
    c.play();
    const x1 = c.x;
    c.advance(50);
    expect(c.x - x1).toBeCloseTo(50, 6);
    expect(c.pace()).toBe(1);
  });

  it('a seek lands on its x whatever the tempo, and the ruler and state follow x alone', () => {
    const s = sped(2);
    const base = new PlaybackClock(plain);
    const fast = new PlaybackClock(s);
    for (const x of [0, played[1]!.presentationStartMs + 7, climax.presentationStartMs, plain.totalMs / 2, plain.totalMs]) {
      base.seek(x);
      fast.seek(x);
      expect(fast.x).toBe(base.x);
      expect(fast.stateUtc()).toBe(base.stateUtc());
      expect(fast.rulerUtc()).toBe(base.rulerUtc());
    }
  });

  it('plays the same beats in the same order as the plain schedule, in less wall time', () => {
    const order = (sch: typeof plain) => {
      const k = new PlaybackClock(sch);
      k.play();
      const seen: number[] = [];
      let wall = 0;
      while (k.status === 'playing') { for (const b of k.advance(16).crossed) seen.push(b.index); wall += 16; }
      return { seen, wall };
    };
    const a = order(plain), b = order(sped(2));
    expect(b.seen).toEqual(a.seen);
    expect(b.wall).toBeLessThan(a.wall);
  });

  it('remainingMs counts the tempo', () => {
    const s = sped(2);
    const c = new PlaybackClock(s);
    expect(c.remainingMs()).toBeCloseTo(s.wallMs, 6);
    c.setRate(2);
    expect(c.remainingMs()).toBeCloseTo(s.wallMs / 2, 6);
  });
});

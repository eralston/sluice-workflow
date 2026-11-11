// Rising tempo (27 E8, 05 §8.3b B-23): a solar episode's gaps and day turns tighten from its first day to its
// last, never below a floor; over the director's target every day turn is the floor (P10). On the six ledger
// pods (fixture data only) and a v0 scenario.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import type { BeatSchedule } from '@shared/contracts/playback';
import { OPENING_ORIENT_MS } from '@shared/engine/maneuvers';
import {
  DAY_TURN_MS, FINAL_HOLD_MS, GAP_MIN_MS, PULSE_GAP_MAX_MS, RISING_FIRST_DAY, RISING_FLOOR_MS, RISING_LAST_DAY,
} from '@shared/playback/constants';
import { buildBeatSchedule, risingMs, risingShare } from '@shared/playback/schedule';
import { resolvePods, scheduleOf, type ResolvedPod } from '../../scripts/pacing-ledger';
import { historyOf } from '../golden/helpers';

const pods = resolvePods();
const pod = (name: string): ResolvedPod => pods.find((p) => p.label.includes(name))!;

interface Spacing { gaps: { ms: number; p: number }[]; turns: number[]; tailMs: number; T: number }

/** A schedule's dead air in x: each played beat's gap or day turn (with its p), and the tail gap. */
function spacingOf(sch: BeatSchedule): Spacing {
  const played = sch.beats.filter((b) => b.durationMs > 0);
  const T = played.filter((b) => b.opensDay).length;
  const out: Spacing = { gaps: [], turns: [], tailMs: 0, T };
  let end = OPENING_ORIENT_MS;
  let seen = 0;
  for (const b of played) {
    const ms = b.presentationStartMs - end;
    if (b.opensDay) {
      seen++;
      out.turns.push(ms);
    } else out.gaps.push({ ms, p: T ? seen / T : 0 });
    end = b.presentationStartMs + b.durationMs;
  }
  out.tailMs = sch.totalMs - FINAL_HOLD_MS - end;
  return out;
}

const rising = pods.map((rp) => ({ rp, sch: scheduleOf(rp.h, rp.scene, rp.tz, {}) }));
const flat = pods.map((rp) => ({ rp, sch: scheduleOf(rp.h, rp.scene, rp.tz, { risingTempo: false }) }));

describe('rising tempo: the curve (B-23)', () => {
  it('runs from a little wider on the first day to half on the last, never rising', () => {
    expect(risingShare(0)).toBe(RISING_FIRST_DAY);
    expect(risingShare(1)).toBe(RISING_LAST_DAY);
    let prev = Infinity;
    for (let i = 0; i <= 100; i++) {
      const s = risingShare(i / 100);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });

  it('is clamped between the floor and the cap', () => {
    for (const cap of [PULSE_GAP_MAX_MS, DAY_TURN_MS]) {
      for (let ms = 0; ms <= 2000; ms += 50) {
        for (let i = 0; i <= 20; i++) {
          const v = risingMs(ms, i / 20, cap);
          expect(v).toBeGreaterThanOrEqual(RISING_FLOOR_MS);
          expect(v).toBeLessThanOrEqual(cap);
        }
      }
      expect(risingMs(GAP_MIN_MS, 1, cap)).toBe(RISING_FLOOR_MS);
    }
  });
});

describe('rising tempo on the six pods (B-23)', () => {
  it('the premise: without it, every gap and day turn on all six pods is GAP_MIN_MS (squeezed)', () => {
    for (const { rp, sch } of flat) {
      const s = spacingOf(sch);
      expect(s.T, rp.label).toBeGreaterThan(0);
      for (const g of s.gaps) expect(g.ms, rp.label).toBeCloseTo(GAP_MIN_MS, 6);
      for (const t of s.turns) expect(t, rp.label).toBeCloseTo(GAP_MIN_MS, 6);
    }
  });

  it('follows the curve on Convoy Planning (no lever pulled): turns fall day by day, and every gap is its p\'s share', () => {
    const { sch } = rising.find((x) => x.rp === pod('Convoy Planning'))!;
    expect(sch.limelight?.direction?.levers ?? []).toEqual([]);
    const s = spacingOf(sch);
    expect(s.T).toBeGreaterThan(3);
    s.turns.forEach((t, i) => expect(Math.abs(t - risingMs(GAP_MIN_MS, (i + 1) / s.T, DAY_TURN_MS)), `turn ${i + 1}`).toBeLessThan(1e-6));
    for (let i = 1; i < s.turns.length; i++) expect(s.turns[i]!).toBeLessThanOrEqual(s.turns[i - 1]! + 1e-6);
    for (const g of s.gaps) expect(Math.abs(g.ms - risingMs(GAP_MIN_MS, g.p, PULSE_GAP_MAX_MS))).toBeLessThan(1e-6);
    expect(Math.abs(s.tailMs - risingMs(GAP_MIN_MS, 1, PULSE_GAP_MAX_MS))).toBeLessThan(1e-6);
    // The first day plays a little wider than today's squeezed gap.
    expect(s.gaps[0]!.ms).toBeGreaterThan(GAP_MIN_MS);
  });

  it('P10: on Pulsar (over its target, levers pulled) every day turn is the floor', () => {
    const { sch } = rising.find((x) => x.rp === pod('Pulsar'))!;
    expect(sch.limelight?.direction?.levers.length).toBeGreaterThan(0);
    const s = spacingOf(sch);
    expect(s.turns.length).toBeGreaterThan(0);
    for (const t of s.turns) expect(Math.abs(t - RISING_FLOOR_MS)).toBeLessThan(1e-6);
  });

  it('never goes below the floor: every gap, day turn and tail gap on all six pods', () => {
    for (const { rp, sch } of rising) {
      const s = spacingOf(sch);
      for (const g of s.gaps) expect(g.ms, rp.label).toBeGreaterThanOrEqual(RISING_FLOOR_MS - 1e-6);
      for (const t of s.turns) expect(t, rp.label).toBeGreaterThanOrEqual(RISING_FLOOR_MS - 1e-6);
      expect(s.tailMs, rp.label).toBeGreaterThanOrEqual(RISING_FLOOR_MS - 1e-6);
    }
  });

  it('is deterministic: two builds of one pod are the same', () => {
    const rp = pod('Comet');
    const a = scheduleOf(rp.h, rp.scene, rp.tz, {});
    const b = scheduleOf(rp.h, rp.scene, rp.tz, {});
    expect(b.totalMs).toBe(a.totalMs);
    expect(b.wallMs).toBe(a.wallMs);
    expect(b.beats.map((x) => x.presentationStartMs)).toEqual(a.beats.map((x) => x.presentationStartMs));
  });
}, 300_000);

describe('rising tempo leaves v0 alone', () => {
  it('a v0 schedule equals one built with risingTempo: false, and one with it but no day turns', () => {
    const s = scenarios.find((x) => x.name === 'orbit-week')!;
    const h = historyOf(s);
    const shape = (sch: BeatSchedule) => ({ totalMs: sch.totalMs, wallMs: sch.wallMs, beats: sch.beats });
    const v0 = shape(buildBeatSchedule(h, h.range, s.tz));
    expect(shape(buildBeatSchedule(h, h.range, s.tz, { risingTempo: false }))).toEqual(v0);
    expect(shape(buildBeatSchedule(h, h.range, s.tz, { risingTempo: true }))).toEqual(v0);
  });
});

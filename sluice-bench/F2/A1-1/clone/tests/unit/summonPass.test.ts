// 27 F2 — Summon on the fly. The summoner's path passes through the spot without stopping: one call blip as it
// passes, the station's jump-in at that instant, the plate riding with the ship for NOTE_MIN_MS, and no hold.
// The renderer modules sit outside this project's tsconfig, so they're loaded by a runtime path (as commands.test.ts does).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Beat } from '@shared/contracts/playback';
import { NOTE_MIN_MS, CREW_FOLD_MS, crewTimes, passesPlay, planManeuvers, releaseOfPlay } from '@shared/engine/maneuvers';
import { PACE_RULES, RULE, spanMs, type PaceRule } from '@shared/engine/pace';
import type { AttachmentFacts, PieceFacts, RoundFacts } from '@shared/engine/types';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { PHASES, type PlannedManeuver } from '@shared/contracts/maneuver';

interface Call { cmd?: string; act?: { key: string; act: string }; args?: Record<string, unknown>; delayMs?: number }
interface Maneuver { id: string; title: string; phase: Record<string, (c: unknown, m: unknown) => Call[]> }
interface SortieLike { update(dt: number): boolean; crewOpen(foldS: number): number }
type SortieCtor = new (scene: unknown, pk: string, start: [number, number], to: () => [number, number] | null, look: () => [number, number] | null, outS: number, holdS: number, backS: number, wake?: number, jump?: boolean, waitS?: number, pass?: { plateS: number } | null) => SortieLike;

const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
const { maneuvers } = await load<{ maneuvers: Maneuver[] }>('theme/starChart/maneuvers/index.ts');
const { Sortie } = await load<{ Sortie: SortieCtor }>('chart/fx/movers.ts');
const { HERO_GLOW } = await load<{ HERO_GLOW: number }>('chart/art/energy.ts');

const enter = PACE_RULES.find((r) => r.id === RULE.facilityEnter) as PaceRule;
const WI1 = 'wi:o:1' as CanonicalKey;
const A = 'id:o:ann' as CanonicalKey;
const planned = (afterMs = 0): PlannedManeuver => ({
  id: RULE.facilityEnter, eventKey: 'e1', seed: 7, cast: { facility: [WI1], agent: [A] }, phases: enter.phases, afterMs, durationMs: spanMs(enter.phases),
  keys: [A, WI1].sort(), to: { rung: 'accomplished' },
});

describe('the summon passes through (27 F2)', () => {
  it('(a) facility.enter is gather 715 and act 1200, and passes', () => {
    expect(enter.phases).toEqual([{ phase: 'gather', atMs: 0, durMs: 715 }, { phase: 'act', atMs: 715, durMs: 1200 }]);
    expect(enter.passes).toBe(true);
    expect(passesPlay({ id: RULE.facilityEnter })).toBe(true);
    expect(passesPlay({ id: RULE.attachmentOpen })).toBe(false);
    expect(PACE_RULES.filter((r) => (r as PaceRule).passes).map((r) => r.id)).toEqual([RULE.facilityEnter]);
  });

  const view = (key: string, x: number) => ({ key, node: { world: { x, y: 0, r: 20 }, projectionKey: key, kind: 'x' }, at: [x, 0] });
  const cast = { facility: [view('fac', 100)], agent: [view('ag', 0)] };
  const jump = maneuvers.find((m) => m.title === 'Station jump-in')!;

  it('(b) the gather issues one pursue through the spot: no hold, no wait, no ring', () => {
    const gather = jump.phase.gather!(cast, planned());
    expect(gather).toHaveLength(1);
    const p = gather[0]!;
    expect(p.cmd).toBe('pursue');
    expect(p.args).toMatchObject({ pk: 'ag', through: true, durS: 0.715, backS: 1.2 });
    expect(p.args).not.toHaveProperty('holdS');
    expect(p.args).not.toHaveProperty('waitS');
    expect(gather.filter((c) => c.cmd === 'ring')).toEqual([]);
    expect(jump.phase.tell).toBeUndefined();
    expect(jump.phase.land).toBeUndefined();
    // Its plate rides with the ship from the act's start: crewHoldMs, 2320 ms.
    expect(p.args!.plateS).toBeCloseTo((NOTE_MIN_MS + CREW_FOLD_MS) / 1000, 6);
  });

  it('(c) the act gives the call blip first, in the station ring’s hue and shape, at the agent’s point, at the station’s instant', () => {
    const act = jump.phase.act!(cast, planned());
    const blip = act[0]!;
    expect(blip.cmd).toBe('ring');
    expect(blip.args).toMatchObject({ color: HERO_GLOW, at: [0, 0] });
    const a = blip.args as { r: number; r1: number };
    expect(a.r1 / a.r).toBeCloseTo(1.6 / 0.7, 9);
    const station = act.find((c) => c.act?.act === 'jump')!;
    const actAt = 715;
    expect(Math.abs(actAt + (blip.delayMs ?? 0) - (actAt + (station.delayMs ?? 0)))).toBeLessThanOrEqual(50);
    expect(station.delayMs ?? 0).toBe(0);
    // No summoner (reduced motion and away guest): the blip falls to the guest's spot, never missing.
    const guestless = jump.phase.act!({ facility: [view('fac', 100)] }, planned());
    expect(guestless[0]!.cmd).toBe('ring');
  });

  /** A scene stub for a pass Sortie: no wake, no jump. */
  function rig(goal: [number, number] | (() => [number, number])) {
    const placed: [number, number][] = [];
    const scene = {
      own: () => {}, placeAt: (_pk: string, x: number, y: number) => placed.push([x, y]), faceView: () => {}, facingOf: () => 1, currentScale: () => 1,
      goalOf: () => (typeof goal === 'function' ? goal() : goal), release: () => {}, restoreFacing: () => {}, fadeView: () => {},
    };
    return { scene, placed };
  }
  const DT = 1 / 120;

  it('(d) a pass Sortie reaches the spot at outS, never stops, ends at its goal, ignores waitS, and opens its plate from the spot', () => {
    const start: [number, number] = [0, 0], spot: [number, number] = [100, 0], goal: [number, number] = [5, 3];
    const outS = 0.7, backS = 1.2, plateS = 2.32; // a whole number of 1/120 s steps, so a step lands on outS
    const { scene, placed } = rig(goal);
    const s = new Sortie(scene, 'ag', start, () => spot, () => [120, 0], outS, 9, backS, 0, false, 7, { plateS });
    const steps = Math.round((outS + plateS) / DT);
    let alive = true, i = 0;
    const at: [number, number][] = [[0, 0]];
    while (alive && i < steps + 100) { alive = s.update(DT); i++; at.push(placed[placed.length - 1]!); }
    // At outS the ship is at the spot.
    const k = Math.round(outS / DT);
    expect(Math.hypot(at[k]![0] - spot[0], at[k]![1] - spot[1])).toBeLessThan(1e-6);
    // Speed above zero at every step in [0.02, outS + backS - 0.02].
    for (let j = 1; j < at.length; j++) {
      const t = j * DT;
      if (t < 0.02 || t > outS + backS - 0.02) continue;
      expect(Math.hypot(at[j]![0] - at[j - 1]![0], at[j]![1] - at[j - 1]![1]), `step ${j}`).toBeGreaterThan(0);
    }
    // It ends at its goal, and its life is outS + max(backS, plateS), whatever waitS says.
    expect(at[at.length - 1]).toEqual(goal);
    expect(Math.abs(i * DT - (outS + Math.max(backS, plateS)))).toBeLessThan(2 * DT);
    const again = rig(goal);
    const s2 = new Sortie(again.scene, 'ag', start, () => spot, () => [120, 0], outS, 9, backS, 0, false, 0, { plateS });
    let n = 0;
    while (s2.update(DT) && n < 10_000) n++;
    expect(n + 1).toBe(i);
    // The plate: shut before the spot, open after it, shut again once plateS has gone.
    const p = rig(goal);
    const s3 = new Sortie(p.scene, 'ag', start, () => spot, () => [120, 0], outS, 0, backS, 0, false, 0, { plateS });
    for (let j = 0; j < Math.round((outS + 1) / DT); j++) s3.update(DT);
    expect(s3.crewOpen(0.52)).toBeGreaterThan(0);
    for (let j = 0; j < Math.round((plateS - 1 + 0.05) / DT); j++) s3.update(DT);
    expect(s3.crewOpen(0.52)).toBe(0);
  });

  it('(d) out and back (goal beside the start) still never stops at the spot', () => {
    const { scene, placed } = rig([1, 0]);
    const s = new Sortie(scene, 'ag', [0, 0], () => [100, 40], () => [120, 40], 0.715, 0, 1.2, 0, false, 0, { plateS: 2.32 });
    for (let j = 0; j < Math.round(1.9 / DT); j++) s.update(DT);
    for (let j = 1; j < placed.length; j++) {
      const t = j * DT;
      if (t < 0.02 || t > 1.9 - 0.02) continue;
      expect(Math.hypot(placed[j]![0] - placed[j - 1]![0], placed[j]![1] - placed[j - 1]![1])).toBeGreaterThan(0);
    }
  });

  it('(e) the plan: enter lasts 1915 ms, the tender opens at 1915, and the ship is released at 3035', () => {
    const T0 = Date.UTC(2026, 8, 14);
    const e = { eventKey: 'e001', kind: 'wi_state_changed', occurredAt: T0 + 3_600_000, observedAt: T0 + 3_600_000, entityKey: 'wi:o:0', projectKey: 'proj:o:p', priority: 'high', payload: { from: '', to: '' }, evidence: [], changedBy: A } as unknown as AnyTimelineEvent;
    const round = { startUtc: T0, endUtc: T0 + 14 * 86_400_000 };
    const att: AttachmentFacts = { key: 'pr:o:r1:1' as CanonicalKey, facility: 'repo:o:r1' as CanonicalKey, author: A, open: { from: T0 + 3_600_000, to: null }, links: [], approvers: [], signalAt: [] };
    const f: RoundFacts = { round, region: 'area:o:p:2', pieces: new Map<CanonicalKey, PieceFacts>(), seats: [A], attachments: new Map([[att.key, att]]), moves: new Map([[e.eventKey, [{ m: 'attach', key: att.key, facility: att.facility, author: A }]]]) };
    const h = { events: [e], range: round } as unknown as ScopeHistory;
    const beat: Beat = { index: 0, sourceUtc: T0, firstUtc: T0, eventKeys: [e.eventKey], priority: 'high', presentationStartMs: 0, durationMs: 1, accented: true };
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const enterP = plan.find((m) => m.id === RULE.facilityEnter)!;
    const open = plan.find((m) => m.id === RULE.attachmentOpen)!;
    expect(enterP.durationMs).toBe(1915);
    expect(open.afterMs).toBe(1915);
    expect(releaseOfPlay(enterP)).toBe(3035);
    expect(crewTimes(enterP.phases, true)).toEqual({ openMs: 715, closeMs: 715 + NOTE_MIN_MS, leaveMs: 3035 });
    expect(PHASES).toContain('gather');
  });
});

// 27 F2, review 1 (M1 to M3): the summoner's fly-by carries on to a waiting next sortie (P4), a captain new to the
// scene still jumps in, and the riding plate lasts exactly as long as the planner holds its attention place (R14).
// Fixture data only (Meteor Pod, 27 F1). The renderer modules load by a runtime path, as summonOnTheFly.test.ts does.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import { CREW_FOLD_MS, NOTE_MIN_MS, VOLLEY_TURN_MS, claimMs, flyCrewTimes, shapeOf, planManeuvers } from '@shared/engine/maneuvers';
import { sceneFacts } from '@shared/engine/facts';
import { PACE_RULES, RULE } from '@shared/engine/pace';
import { SOLAR } from '@shared/hierarchy/solar';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { buildScene } from '@shared/playback/highlights';
import { resolvePods } from '../../scripts/pacing-ledger';

interface Fx { update(dt: number): boolean; destroy(): void }
interface Def { moves?: boolean; make(host: unknown, args: unknown): Fx }
const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
const commands = await load<{ commandByName(name: string): Def | undefined }>('chart/fx/commands.ts');

const lenient = <T extends object>(base: T): T => new Proxy(base, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined) });
const SHIP = 'ship|x';
const SPOT: [number, number] = [100, 0];
const HOME: [number, number] = [-10, 70];
const START: [number, number] = [0, 0];
const OUT = 0.715;
const ON = 0.8;
const DT = 1 / 60;

/** Flies a `pursue` with `pass` frame by frame; `jumper`: the scene hands the captain's pending jump to it. */
function fly(extra: Record<string, unknown>, jumper = false, seconds = 6) {
  let pos: [number, number] = [...START];
  let fade = 1;
  let took = 0;
  const layer = lenient({ addChild: () => {}, removeChild: () => {} });
  const scene = lenient({
    liveOf: () => pos, goalOf: () => HOME, placeAt: (_: string, x: number, y: number) => { pos = [x, y]; },
    fxLayer: () => layer, currentScale: () => 1, facingOf: () => 1,
    fadeView: (_: string, a: number) => { fade = a; },
    takeJump: () => { took++; const had = jumper && took === 1; return had; },
  });
  const host = lenient({ stage: () => scene, layer: () => layer, px: () => 1, scene: () => scene });
  const fx = commands.commandByName('pursue')!.make(host, { pk: SHIP, durS: OUT, backS: ON, to: SPOT, look: SPOT, wake: 4, pass: true, start: [...START], ...extra });
  const track: { t: number; at: [number, number]; fade: number }[] = [];
  let live = true;
  for (let t = 0; t <= seconds; t += DT) {
    if (live && !fx.update(DT)) { fx.destroy(); live = false; }
    track.push({ t, at: [...pos], fade });
  }
  return { track, took, ended: !live };
}
const d = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
const at = (tr: ReturnType<typeof fly>['track'], s: number) => tr.find((x) => x.t >= s - 1e-9)!;

describe('27 F2 fix M1: a fly-by with a P4 wait carries on to the next sortie', () => {
  it('without a wait it flies on home and is done after the two legs', () => {
    const r = fly({});
    expect(d(at(r.track, OUT + ON + 0.1).at, HOME)).toBeLessThan(1e-6);
    expect(r.ended).toBe(true);
  });
  it('with a wait it passes the spot, stops on its way, and stays out of its rest through the wait', () => {
    const wait = 2;
    const r = fly({ waitS: wait });
    const stopped = at(r.track, OUT + ON + 0.3).at;
    expect(d(stopped, HOME)).toBeGreaterThan(10); // not gone home
    expect(d(stopped, SPOT)).toBeGreaterThan(1); // but on from the spot: not stopped at it
    for (const x of r.track.filter((x) => x.t > OUT + ON && x.t < OUT + ON + wait - 0.05)) expect(d(x.at, stopped)).toBeLessThan(1e-6); // parked
    expect(d(at(r.track, OUT + ON + wait + ON + 0.1).at, HOME)).toBeLessThan(1e-6); // and home after, should no sortie take over
  });
  it('never jumps: every frame moves the ship a small step', () => {
    const r = fly({ waitS: 1 });
    for (let i = 1; i < r.track.length; i++) expect(d(r.track[i]!.at, r.track[i - 1]!.at)).toBeLessThan(12);
  });
});

describe('27 F2 fix M2: a captain new to the scene jumps in at the spot, then carries on', () => {
  it('takes the pending jump; hidden until the call, fully in by it, no flight out', () => {
    const r = fly({}, true);
    expect(r.took).toBe(1);
    expect(at(r.track, 0.1).fade).toBe(0);
    for (const x of r.track.filter((x) => x.t > 0 && x.t < OUT - 0.05)) expect(d(x.at, SPOT)).toBeLessThan(1e-6); // dropped out at the spot, never flew out
    expect(at(r.track, OUT).fade).toBeGreaterThanOrEqual(0.99);
    expect(at(r.track, OUT + 0.3).fade).toBe(1);
    expect(d(at(r.track, OUT + ON + 0.1).at, HOME)).toBeLessThan(1e-6);
  });
  it('a captain already here does not take a jump it never had', () => {
    const r = fly({}, false);
    expect(r.took).toBe(1); // asked once (a pending jump is its to take)
    expect(at(r.track, 0.1).fade).toBe(1);
    expect(d(at(r.track, 0.1).at, START)).toBeGreaterThan(0.1);
  });
});

describe('27 F2 fix M3: the riding plate lasts as long as the attention hold (R14)', () => {
  const meteor = resolvePods({ all: true }).find((p) => p.label === 'Meteor Pod')!;
  const pace = sceneFacts(paceFacts(meteor.h), meteor.areaKey);
  const beats = buildScene(meteor.h, meteor.h.range, meteor.tz, meteor.scene as never, SOLAR).beats;
  const lone = beats.find((b) => b.sourceUtc === Date.parse('2026-09-24T19:00:00.000Z'))!;
  const jump = planManeuvers(meteor.h, lone, pace, PACE_RULES, ENGAGEMENT.calm).find((m) => m.id === RULE.facilityEnter)!;

  it('the plate is one naming turn from the act: whole as long as any named turn, gone as it ends', () => {
    const w = flyCrewTimes(jump.phases);
    expect(w.openMs).toBe(claimMs(jump.phases));
    expect(w.goneMs - w.openMs).toBe(VOLLEY_TURN_MS);
    expect(w.goneMs - w.closeMs).toBe(CREW_FOLD_MS);
    expect(VOLLEY_TURN_MS).toBeGreaterThan(NOTE_MIN_MS);
  });
  it('the planner holds the attention place until the plate is gone: the beat stays open that long', () => {
    const events = lone.eventKeys.map((k) => meteor.h.events.find((e) => e.eventKey === k)! as AnyTimelineEvent);
    const w = flyCrewTimes(jump.phases);
    expect(shapeOf(meteor.h, events, pace).durationMs).toBeGreaterThanOrEqual(jump.afterMs + w.goneMs);
  });
});

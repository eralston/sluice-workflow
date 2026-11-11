// 27 F2, Summon on the fly: the summoner's path passes through the spot beside the station without
// stopping; as it passes it gives one call blip, and the station jumps in at that instant, in the same
// hue and ring shape (R8, R10). The hold and the fly-back go; the ship carries on to its next place.
// Under reduced motion the ship doesn't fly: the blip and the arrival play at its place. The rule's
// phases shrink to the flight plus the arrival, and the pacing ledger shows the saving per pod.
//
// The choreography is played here on a small simulated scene: its phases are called at their times
// with live cast views, its calls issued at their delays, and the summoner's moves run through the
// real `pursue` (or `hold`) command, frame by frame, so what is judged is where the ship is drawn, not
// the arguments' names. The jump-in planned is the real one, Meteor Pod's lone summon (27 F1: PR 21045
// into the 37th station, Thu 24 Sep 19:00Z). The renderer modules sit outside this project's tsconfig,
// so they are loaded by a runtime path (as commands.test.ts does) and typed by the slice read here.
// Fixture data only (INV-18).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Phase, PlannedManeuver } from '@shared/contracts/maneuver';
import { sceneFacts } from '@shared/engine/facts';
import { planManeuvers } from '@shared/engine/maneuvers';
import { PACE_RULES, RULE, spanMs } from '@shared/engine/pace';
import { SOLAR } from '@shared/hierarchy/solar';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { buildScene } from '@shared/playback/highlights';
import { buildLedger, resolvePods } from '../../scripts/pacing-ledger';
import { buildBuilt } from '../../scripts/pacing-built';

// ---- The renderer modules, by a runtime path ----

type Anchor = readonly [number, number] | (() => readonly [number, number] | null);
interface Call { cmd: string; args: Record<string, unknown>; delayMs?: number; value?: number }
interface ActCall { act: { key: string; act: string }; delayMs?: number }
type AnyCall = Call | ActCall;
interface Fx { update(dt: number): boolean; destroy(): void }
interface Def { name: string; moves?: boolean; reduced: unknown; make(host: unknown, args: unknown): Fx }
interface Maneuver { id: string; title: string; phase: Partial<Record<Phase, (c: unknown, m: PlannedManeuver) => AnyCall[]>> }

const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
const commands = await load<{
  commandByName(name: string): Def | undefined;
  reducedCall(def: Def, c: Call, host: unknown): Call | null;
}>('chart/fx/commands.ts');
const registry = await load<{ installTheme(t: { maneuvers: Maneuver[]; commands: Def[] }): void }>('chart/fx/v1/registry.ts');
const { starChart } = await load<{ starChart: { maneuvers: Maneuver[]; commands: Def[] } }>('theme/starChart/index.ts');
const { motion } = await load<{ motion: { reduced: boolean } }>('chart/art/motion.ts');
registry.installTheme(starChart); // the theme's own commands too, so a themed blip resolves

const jumpIn = starChart.maneuvers.find((m) => m.id === RULE.facilityEnter)!;

// ---- The real jump-in: Meteor Pod's lone summon (27 F1) ----

const LONE_SUMMON_UTC = Date.parse('2026-09-24T19:00:00.000Z');
const meteor = resolvePods({ all: true }).find((p) => p.label === 'Meteor Pod')!;
const meteorPace = sceneFacts(paceFacts(meteor.h), meteor.areaKey);
const meteorBeats = buildScene(meteor.h, meteor.h.range, meteor.tz, meteor.scene as never, SOLAR).beats;
const plannedIn = (beat: (typeof meteorBeats)[number]) => planManeuvers(meteor.h, beat, meteorPace, PACE_RULES, ENGAGEMENT.calm);
const loneBeat = meteorBeats.find((b) => b.sourceUtc === LONE_SUMMON_UTC)!;
const LONE: PlannedManeuver = plannedIn(loneBeat).find((m) => m.id === RULE.facilityEnter)!;

// ---- A simulated scene: the station, the summoner's ship, its next place ----

const R = 20; // the station's drawn radius, world units
const STATION: [number, number] = [100, 0];
const START: [number, number] = [0, 0]; // where the summoner's ship is when the jump-in starts
const NEXT: [number, number] = [-10, 70]; // its next place (its layout target): away from the station, so its nearest pass is the spot
const SHIP = 'ship|summoner';
const FRAME_MS = 1000 / 60;

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
const pointOf = (a: unknown): [number, number] | null => {
  const p = typeof a === 'function' ? (a as () => readonly [number, number] | null)() : (a as readonly [number, number] | undefined);
  return p ? [p[0], p[1]] : null;
};
/** A stub that answers every other call harmlessly (the movers and effects touch more than is judged here). */
const lenient = <T extends object>(base: T): T => new Proxy(base, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined) });

interface Issued { atMs: number; phase: Phase; call: AnyCall; where: [number, number] | null; ship: [number, number] }
interface Played { issued: Issued[]; track: { t: number; at: [number, number] }[]; movers: number }

/** Plays the jump-in from its start: each phase at its time with live views, each call at its delay, the ship's moves for real. */
function play(m: PlannedManeuver, opts: { reduced?: boolean } = {}): Played {
  const reduced = !!opts.reduced;
  let pos: [number, number] = [...START];
  const layer = lenient({ addChild: () => {}, removeChild: () => {} });
  const scene = lenient({
    liveOf: (pk: string) => (pk === SHIP ? pos : null),
    goalOf: (pk: string) => (pk === SHIP ? NEXT : null),
    placeAt: (pk: string, x: number, y: number) => { if (pk === SHIP) pos = [x, y]; },
    fxLayer: () => layer,
    currentScale: () => 1,
    takeJump: () => false,
    hasView: () => true,
    drawnR: () => 4,
    facingOf: () => 1,
    releaseEdge: () => {},
  });
  const host = lenient({ stage: () => scene, layer: () => layer, px: () => 1, calm: () => true, bursting: () => false, grandSlot: () => 0, plateWorld: () => null, scene: () => scene });
  const view = (key: CanonicalKey, pk: string, kind: string, at: Anchor, r: number) => ({ key, at, node: { projectionKey: pk, canonicalKey: key, kind, world: { x: pointOf(at)![0], y: pointOf(at)![1], r }, selectable: true, stage: 's' }, drawnR: () => r });
  const facility = m.cast.facility?.[0] ?? m.cast.subject![0]!;
  const agent = m.cast.agent![0]!;
  const fView = view(facility, 'fac|new', 'facility', STATION, R);
  const aView = view(agent, SHIP, 'captain', () => pos, 4);
  const seats = (m.cast.seat ?? []).map((k, i) => view(k, `seat|${i}`, 'seat', [140 + 30 * i, 60], 30));
  const cast = { subject: [fView], facility: [fView], agent: [aView], seat: seats };

  const pending: { atMs: number; phase: Phase; call: AnyCall }[] = [];
  const issued: Issued[] = [];
  const track: Played['track'] = [];
  const phasesLeft = [...m.phases];
  let mover: Fx | null = null;
  let movers = 0;
  const endMs = Math.max(m.durationMs, spanMs(m.phases)) + 4000;
  const was = motion.reduced;
  motion.reduced = reduced;
  try {
    for (let t = 0; t <= endMs; t += FRAME_MS) {
      // Phases whose time has come: the choreography sees the cast as it is now.
      while (phasesLeft.length && phasesLeft[0]!.atMs <= t + 1e-6) {
        const span = phasesLeft.shift()!;
        const fn = jumpIn.phase[span.phase];
        if (!fn) continue;
        for (const call of fn(cast, m)) pending.push({ atMs: span.atMs + (call.delayMs ?? 0), phase: span.phase, call });
      }
      // Calls whose delay has run: acts and effects are logged with where they are; moves take the ship over.
      for (const p of pending.filter((x) => x.atMs <= t + 1e-6)) {
        pending.splice(pending.indexOf(p), 1);
        let c = p.call;
        if (!('act' in c)) {
          const def = commands.commandByName(c.cmd);
          if (def && reduced) {
            const sub = commands.reducedCall(def, c, host);
            if (!sub) continue;
            c = sub;
          }
          const d = commands.commandByName((c as Call).cmd);
          if (d?.moves) {
            const args = (c as Call).args;
            if (args.pk !== SHIP) continue;
            mover?.destroy();
            mover = d.make(host, { ...args, start: [...pos] });
            movers++;
            continue;
          }
        }
        const a = 'act' in c ? null : (c.args.at ?? c.args.to ?? (c.args.pk === SHIP ? () => pos : undefined));
        issued.push({ atMs: p.atMs, phase: p.phase, call: c, where: a === null || a === undefined ? null : pointOf(a), ship: [...pos] });
      }
      if (mover && !mover.update(FRAME_MS / 1000)) { mover.destroy(); mover = null; }
      track.push({ t, at: [...pos] });
    }
  } finally {
    motion.reduced = was;
  }
  return { issued, track, movers };
}

const MOVERS = new Set(['pursue', 'hold', 'guest']);
/** The station's own arrival: the act phase's effects drawn on the station. */
const arrivalOf = (p: Played) => p.issued.filter((x) => x.phase === 'act' && !('act' in x.call) && x.where && dist(x.where, STATION) < 1e-6).map((x) => x.call as Call);
/** The station's jump: its art act. */
const jumpOf = (p: Played, m: PlannedManeuver) => p.issued.find((x) => 'act' in x.call && x.call.act.act === 'jump' && x.call.act.key === (m.cast.facility?.[0] ?? m.cast.subject![0]));
/** The call blip: an effect that is not a move and not drawn on the station (today every jump-in effect is the station's). */
const blipsOf = (p: Played) => p.issued.filter((x) => !('act' in x.call) && !MOVERS.has(x.call.cmd) && x.where !== null && dist(x.where, STATION) > 1e-6);

describe('27 F2: Summon on the fly (the unit test)', () => {
  it('the real lone summon plans a jump-in with its summoner (fixture check)', () => {
    expect(loneBeat, 'Meteor Pod has a beat at Thu 24 Sep 19:00Z').toBeDefined();
    expect(LONE, 'that beat plans a facility.enter').toBeDefined();
    expect(LONE.cast.agent?.length).toBe(1);
  });

  it('the summoner\'s pursue has no hold between its flight and its next place: no hold, no wait, no hold command', () => {
    const p = play(LONE);
    expect(p.movers, 'the summoner flies').toBeGreaterThan(0);
    // Every move the jump-in gives its summoner, as called.
    const moves: Call[] = [];
    for (const span of LONE.phases) {
      const fn = jumpIn.phase[span.phase];
      if (!fn) continue;
      // The cast as `play` builds it is enough for the call's arguments.
      const facility = LONE.cast.facility?.[0] ?? LONE.cast.subject![0]!;
      const f = { key: facility, at: STATION, node: { projectionKey: 'fac|new', canonicalKey: facility, kind: 'facility', world: { x: STATION[0], y: STATION[1], r: R } }, drawnR: () => R };
      const a = { key: LONE.cast.agent![0]!, at: START, node: { projectionKey: SHIP, canonicalKey: LONE.cast.agent![0]!, kind: 'captain', world: { x: 0, y: 0, r: 4 } }, drawnR: () => 4 };
      for (const c of fn({ subject: [f], facility: [f], agent: [a], seat: [] }, LONE)) if (!('act' in c) && MOVERS.has(c.cmd) && c.args.pk === SHIP) moves.push(c);
    }
    expect(moves.length).toBeGreaterThan(0);
    for (const c of moves) {
      expect(c.cmd, 'a move, not a hold').not.toBe('hold');
      expect(Number(c.args.holdS ?? 0), 'no hold at the spot').toBe(0);
      expect(Number(c.args.waitS ?? 0), 'no wait at the spot').toBe(0);
    }
  });

  it('the summoner\'s pursue has no hold between its flight and its next place: flown, its ship never stops until it is there', () => {
    const { track } = play(LONE);
    const moved = track.findIndex((x) => dist(x.at, START) > 1e-6);
    expect(moved, 'the ship sets off').toBeGreaterThanOrEqual(0);
    const there = track.findIndex((x, i) => i > moved && dist(x.at, NEXT) < 0.5);
    expect(there, 'the ship reaches its next place (its layout target), not back where it started').toBeGreaterThan(moved);
    // Speed never drops to zero between leaving and arriving: no run of still frames longer than two (33 ms).
    let run = 0, longest = 0, longestAt = 0;
    for (let i = moved + 1; i <= there; i++) {
      if (dist(track[i]!.at, track[i - 1]!.at) < 1e-6) { run++; if (run > longest) { longest = run; longestAt = track[i]!.t; } } else run = 0;
    }
    expect(longest, `the ship stood still for ${Math.round(longest * FRAME_MS)} ms (to ${Math.round(longestAt)} ms into the jump-in)`).toBeLessThanOrEqual(2);
    // It passes by the station on the way: its nearest pass is beside it (the spot).
    const nearest = Math.min(...track.map((x) => dist(x.at, STATION)));
    expect(nearest).toBeLessThanOrEqual(2.5 * R);
  });

  it('one call blip, in the arrival\'s hue and ring shape, given where the ship is', () => {
    const p = play(LONE);
    const blips = blipsOf(p);
    expect(blips.map((b) => (b.call as Call).cmd), 'exactly one call blip off the station').toHaveLength(1);
    const blip = blips[0]!;
    const arrival = arrivalOf(p);
    expect(arrival.length, 'the station still has its arrival').toBeGreaterThan(0);
    // R8, R10: the same hue and the same ring shape as the station's arrival, so the two read as cause and effect.
    const c = blip.call as Call;
    expect(arrival.some((x) => x.cmd === c.cmd && x.args.color === c.args.color), `${c.cmd} ${String(c.args.color)} against the arrival's ${arrival.map((x) => `${x.cmd} ${String(x.args.color)}`).join(', ')}`).toBe(true);
    // Given by the ship as it passes: drawn where the ship is when it is issued.
    expect(dist(blip.where!, blip.ship)).toBeLessThanOrEqual(R);
  });

  it('the station\'s act starts within 50 ms of the blip, as the ship passes the spot', () => {
    const p = play(LONE);
    const jump = jumpOf(p, LONE);
    expect(jump, 'the station jumps in').toBeDefined();
    const blips = blipsOf(p);
    expect(blips, 'a call blip').toHaveLength(1);
    expect(Math.abs(jump!.atMs - blips[0]!.atMs), `jump at ${jump!.atMs} ms, blip at ${blips[0]!.atMs} ms`).toBeLessThanOrEqual(50);
    // The instant the ship passes beside the station.
    const at = p.track.reduce((best, x) => (Math.abs(x.t - jump!.atMs) < Math.abs(best.t - jump!.atMs) ? x : best));
    expect(dist(at.at, STATION)).toBeLessThanOrEqual(2.5 * R);
  });

  it('under reduced motion the ship doesn\'t fly: the blip and the arrival play at its place', () => {
    const p = play(LONE, { reduced: true });
    expect(p.track.every((x) => dist(x.at, START) < 1e-6), 'the ship never leaves its place').toBe(true);
    const jump = jumpOf(p, LONE);
    expect(jump, 'the station still jumps in').toBeDefined();
    const blips = blipsOf(p);
    expect(blips, 'the blip still plays').toHaveLength(1);
    expect(dist(blips[0]!.where!, START), 'at the ship\'s place').toBeLessThanOrEqual(R);
    expect(Math.abs(jump!.atMs - blips[0]!.atMs)).toBeLessThanOrEqual(50);
  });
});

describe('27 F2: the rule\'s phases shrink to the flight plus the arrival', () => {
  const pods = resolvePods({ all: true });
  it.each(['Meteor Pod', 'Harbor Pod', 'Nova Pod'])('%s: every planned jump-in lasts its phases, no crew hold or fly-back past the arrival', (label) => {
    const p = pods.find((x) => x.label === label)!;
    const pace = sceneFacts(paceFacts(p.h), p.areaKey);
    const beats = buildScene(p.h, p.h.range, p.tz, p.scene as never, SOLAR).beats;
    const enters = beats.flatMap((b) => planManeuvers(p.h, b, pace, PACE_RULES, ENGAGEMENT.calm)).filter((m) => m.id === RULE.facilityEnter);
    expect(enters.length, `${label} has summons`).toBeGreaterThan(0);
    for (const m of enters) {
      expect(m.durationMs, `${m.eventKey}: its length is its phases' (${spanMs(m.phases)} ms)`).toBe(spanMs(m.phases));
      expect(m.durationMs, `${m.eventKey}: no longer than the 2.8 s jump-in`).toBeLessThanOrEqual(2815);
    }
  }, 60_000);
});

describe('27 F2: the ledger shows the saving per pod', () => {
  it('no pod\'s facility.enter is charged a crew hold any more', () => {
    for (const p of buildLedger().pods) {
      for (const r of p.playing.byRule.filter((x) => x.key === RULE.facilityEnter || x.key.startsWith(`${RULE.facilityEnter}/`))) {
        expect(r.phases.hold ?? 0, `${p.label} ${r.key}`).toBe(0);
      }
    }
  }, 120_000);

  it('the Built section has an F2 row on all seven pods, Meteor included; it never costs time, and the pods whose summons held save', () => {
    const rows = buildBuilt().filter((r) => r.id === 'F2');
    expect(rows.map((r) => r.pod).sort()).toEqual(['Comet Pod', 'Convoy Planning Pod', 'Harbor Pod', 'Meteor Pod', 'Nova Pod', 'Pulsar Pod', 'Quasar Pod']);
    for (const r of rows) expect(r.savedMs, r.pod).toBeGreaterThanOrEqual(0);
    // Their jump-ins were charged a hold before F2 (pacing-ledger.json at 61e4958), and the director doesn't speed them (Total = Schedule), or Meteor's 37.
    for (const n of ['Nova Pod', 'Convoy Planning Pod', 'Harbor Pod', 'Meteor Pod']) expect(rows.find((r) => r.pod === n)!.savedMs, n).toBeGreaterThan(0);
  }, 240_000);
});

// 27 F2, summon on the fly: the summoner's path passes through its spot beside the station without stopping.
// As it passes it gives one call blip, and the station jumps in at that instant, in the same hue and ring shape
// (R8, R10). The hold and the fly-back go: the ship carries on to its next place (its next sortie if one is
// waiting, E4's P4, else its rest). Its plate rides with the ship for NOTE_MIN_MS (E2). Under reduced motion the
// ship doesn't fly: the blip and the arrival play at its place. The rule's phases shrink to the flight plus the
// arrival (a 15 §7 row). Fixture data only (INV-18): pod-sprint's first summon, on a stub scene.
//
// The renderer modules sit outside this project's tsconfig, so they load by a runtime path (as commands.test.ts
// does) and are typed by the slice of their shapes these checks read. The real `pursue` (a Sortie) flies the
// ship on the stub scene, so its drawn path is what's judged; every other command is recorded.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import { sceneFacts } from '@shared/engine/facts';
import { claimMs, gatherAtOf, nearStartMs, NOTE_MIN_MS, planManeuvers, releaseOfPlay, workEndOf } from '@shared/engine/maneuvers';
import { PACE_RULES, RULE, spanMs } from '@shared/engine/pace';
import { SOLAR } from '@shared/hierarchy/solar';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { buildScene } from '@shared/playback/highlights';
import { mapping } from '../golden/helpers';

// ---- The fixture's first summon (pod-sprint, Sprint 13) ----

const TZ = 'America/Los_Angeles';
const H = toHistory(podSprint, mapping, sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!);
const PODS = (H.scope.sector as unknown as { pods: { areaKey: CanonicalKey; path: string }[] }).pods;

/** The first planned jump-in with a summoner, over the pods' own schedules, and the beat's whole plan. */
function firstSummon(): { m: PlannedManeuver; plan: PlannedManeuver[] } {
  for (const p of PODS) {
    const sched = buildScene(H, H.range, TZ, `pod:${p.areaKey}` as never, SOLAR);
    const pace = sceneFacts(paceFacts(H), p.areaKey);
    for (const b of sched.beats) {
      const plan = planManeuvers(H, b, pace, PACE_RULES, ENGAGEMENT.calm);
      const m = plan.find((x) => x.id === RULE.facilityEnter && (x.cast.agent?.length ?? 0) > 0 && !x.quiet && !x.plate);
      if (m) return { m, plan };
    }
  }
  throw new Error('pod-sprint has no summoned jump-in');
}
const SUMMON = firstSummon();
const ENTER = SUMMON.m;
const AGENT = ENTER.cast.agent![0]!;
const FACILITY = ENTER.cast.facility![0]!;

// ---- The engine: the rule's phases and the planned turn ----

const rule = PACE_RULES.find((r) => r.id === RULE.facilityEnter)!;
/** E1's jump-in: tell 300, gather 715, act 1200, land 600. */
const E1_SPAN_MS = 2815;

describe('27 F2: facility.enter shrinks to the flight plus the arrival', () => {
  it('its phases are the flight (gather, from 0) and the arrival (act, and at most its land): no tell, no echo or disperse', () => {
    const names = rule.phases.map((p) => p.phase);
    expect(names[0], 'the flight comes first: nothing holds the eye before the summoner sets off').toBe('gather');
    expect(rule.phases[0]!.atMs).toBe(0);
    expect(names).toContain('act');
    expect(names.filter((p) => !['gather', 'act', 'land'].includes(p)), 'only the flight and the arrival').toEqual([]);
    expect(spanMs(rule.phases)).toBeLessThan(E1_SPAN_MS);
  });

  it('the planned jump-in holds no turn after its work: its length is its phases, and its ship is let go as it passes (the blip)', () => {
    expect(ENTER.durationMs, 'no crew hold stretches it (22 B9 `crewTimes` no longer applies to a summon)').toBe(spanMs(ENTER.phases));
    expect(releaseOfPlay(ENTER), 'the ship is free at the act\'s start, as it passes its spot').toBe(claimMs(ENTER.phases));
  });

  it('15 §7\'s facility.enter row gives the new length', () => {
    const doc = readFileSync(resolve(__dirname, '../../docs/15-reference.md'), 'utf8');
    const row = doc.split('\n').find((l) => l.startsWith('| `facility.enter` |'));
    expect(row, '15 §7 has the row').toBeDefined();
    const length = Number(row!.split('|')[4]!.trim());
    expect(length).toBe(spanMs(rule.phases));
    expect(length).toBeLessThan(E1_SPAN_MS);
  });
});

// ---- The renderer, on a stub scene: the ship's drawn path, the rings, the acts and the plates ----

interface Fx { kind: 'travel' | 'accent'; update(dt: number): boolean; destroy(): void }
interface Def { name: string; make: (host: unknown, a: unknown) => Fx; [k: string]: unknown }
interface Interpreter {
  queue(ctx: unknown): void; update(dtMs: number, s: number, frozen: boolean): void; clear(): void;
  crew(): ReadonlyMap<string, { u: number; text: string; eventKey: string }>;
}
const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
const commands = await load<{ SEED_COMMANDS: readonly Def[]; registerCommand(d: Def): void; resetCommands(): void; pointOf(a: unknown): [number, number] | null }>('chart/fx/commands.ts');
const registry = await load<{ installTheme(t: { maneuvers: unknown[]; commands: unknown[] }): void }>('chart/fx/v1/registry.ts');
const { maneuvers } = await load<{ maneuvers: unknown[] }>('theme/starChart/maneuvers/index.ts');
const { ManeuverInterpreter } = await load<{ ManeuverInterpreter: new (host: unknown) => Interpreter }>('chart/fx/v1/interpreter.ts');
const { motion } = await load<{ motion: { reduced: boolean } }>('chart/art/motion.ts');

type N = { projectionKey: string; canonicalKey: string; kind: string; world: { x: number; y: number; r: number }; selectable: boolean; stage: string; label?: string };
const node = (pk: string, key: string, kind: string, x: number, y: number, r: number): N => ({ projectionKey: pk, canonicalKey: key, kind, world: { x, y, r }, selectable: true, stage: 's', label: pk });

/** The ring a command drew: when, where (its centre then), its sizes and colour. */
interface RingRec { t: number; at: [number, number]; r: number; r1: number; color: number | undefined }

const STATION_R = 20;
const SHIP = `ship|${AGENT}`;
const FAC = `fac|${FACILITY}`;
const NEXT_WORK = 'wi:o:f2-next' as CanonicalKey; // an invented piece for the captain's next sortie
/** The board after the beat: the summoner's seat and ship to the left, the new station well to the right. */
const BOARD: N[] = [
  node(`seat|${AGENT}`, AGENT, 'seat', -40, 0, 30),
  node(SHIP, AGENT, 'captain', 0, 0, 6),
  node(FAC, FACILITY, 'facility', 300, 0, STATION_R),
  node('obj|next', NEXT_WORK, 'objective', 120, 160, 10),
];
/** Before the beat the station isn't drawn (it never jumps in again if it was, 22 C11). */
const WAS = BOARD.filter((n) => n.projectionKey !== FAC);
const REST: [number, number] = [0, 0];
const STATION: [number, number] = [300, 0];

/** A stub GraphScene that keeps where each node is drawn, so a real Sortie can fly the ship over it. */
function stubScene(clock: { ms: number }) {
  const log: string[] = [];
  const at = (s: string) => log.push(`${Math.round(clock.ms)} ${s}`);
  const pos = new Map<string, [number, number]>();
  const nodes = BOARD;
  const world = (pk: string) => { const n = nodes.find((x) => x.projectionKey === pk); return n ? [n.world.x, n.world.y] as [number, number] : null; };
  const scene = {
    log, pos,
    targetNodes: () => nodes, effectiveNodes: () => nodes, solarBoard: () => null,
    hasView: (pk: string) => nodes.some((n) => n.projectionKey === pk),
    liveOf: (pk: string) => pos.get(pk) ?? world(pk),
    goalOf: (pk: string) => world(pk),
    drawnR: (pk: string) => nodes.find((n) => n.projectionKey === pk)?.world.r ?? 0,
    placeAt: (pk: string, x: number, y: number) => { pos.set(pk, [x, y]); },
    actView: (pk: string, act: string) => { at(`act ${pk} ${act}`); return true; },
    claimStage: () => true, landStage: (pk: string) => at(`land ${pk}`),
    freeze: () => {}, thaw: () => {}, own: () => {}, release: () => {}, faceView: () => {}, restoreFacing: () => {}, fadeView: () => {}, facingOf: () => 1,
    holdEdge: () => {}, releaseEdge: () => {}, freezeGuide: () => {}, thawGuide: () => {},
    releaseAllEdges: () => {}, thawAll: () => {}, landAllStages: () => {}, endJumps: () => {}, markJump: () => {}, takeJump: () => false,
    fxLayer: () => ({ addChild: () => {} }), currentScale: () => 1, glidingCount: () => 0,
    currentGraph: () => ({ sceneKey: 'pod:x' }),
  };
  return scene;
}

/** Every seed command but the movers is recorded (rings with their shape); `pursue` and `hold` are the real ones. */
function recordCommands(rings: RingRec[], clock: { ms: number }) {
  commands.resetCommands();
  for (const d of commands.SEED_COMMANDS) {
    if (d.name === 'pursue' || d.name === 'hold') continue;
    commands.registerCommand({
      ...d,
      make: (_h: unknown, a: unknown) => {
        const args = a as { at?: unknown; r?: number; r1?: number; color?: number; durS?: number };
        if (d.name === 'ring') {
          const p = commands.pointOf(args.at) ?? [NaN, NaN];
          rings.push({ t: Math.round(clock.ms), at: p, r: args.r ?? 0, r1: args.r1 ?? (args.r ?? 0) * 1.4, color: args.color });
        }
        let t = 0;
        return { kind: 'accent', update: (dt: number) => (t += dt) < (args?.durS ?? 0.5), destroy: () => {} } as Fx;
      },
    });
  }
}

interface Run { trace: { t: number; p: [number, number] }[]; rings: RingRec[]; jumpAt: number; crew: { t: number; u: number }[] }

/** Plays `plays` on the stub scene for `ms`, sampling the summoner's ship and its plate every 20 ms frame. */
function play(plays: PlannedManeuver[], ms: number, reduced = false): Run {
  registry.installTheme({ maneuvers, commands: [] });
  const clock = { ms: 0 };
  const rings: RingRec[] = [];
  recordCommands(rings, clock);
  const scene = stubScene(clock);
  const host = { scene: () => scene, hierarchy: () => SOLAR, worldToScreen: (x: number, y: number) => ({ x, y }), labelHost: null, onGo: () => {}, flashLabel: () => {} };
  motion.reduced = reduced;
  try {
    const fx = new ManeuverInterpreter(host);
    fx.queue({ plan: [], history: H, snapshot: {}, before: { graph: { nodes: WAS }, nodes: WAS }, after: { sceneKey: 'pod:x', nodes: BOARD }, maneuvers: plays });
    const trace: Run['trace'] = [];
    const crew: Run['crew'] = [];
    for (let t = 0; t < ms; t += 20) {
      clock.ms += 20;
      fx.update(20, 20, false);
      const p = scene.liveOf(SHIP)!;
      trace.push({ t: clock.ms, p: [p[0], p[1]] });
      crew.push({ t: clock.ms, u: fx.crew().get(SHIP)?.u ?? 0 });
    }
    fx.clear();
    const jump = scene.log.find((l) => l.endsWith(`act ${FAC} jump`));
    return { trace, rings, jumpAt: jump ? Number(jump.split(' ')[0]) : NaN, crew };
  } finally {
    motion.reduced = false;
    commands.resetCommands();
  }
}

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
/** The rings away from the station: the summoner's call (the station's own rings sit on it). */
const blips = (r: Run, beforeMs = Infinity) => r.rings.filter((x) => x.t < beforeMs && dist(x.at, STATION) > STATION_R);
/** The station's arrival ring: on the station, made as it jumps in. */
const arrivals = (r: Run) => r.rings.filter((x) => dist(x.at, STATION) <= STATION_R && Math.abs(x.t - r.jumpAt) <= 50);
/** The longest stretch (ms) the ship sat still between its first move and the first time it is within 0.5 of `goal` after `afterMs`. */
function longestStill(r: Run, goal: readonly number[], afterMs: number): { stillMs: number; arrivedAt: number } {
  const moved = r.trace.findIndex((s, i) => i > 0 && dist(s.p, r.trace[i - 1]!.p) > 1e-4);
  const arrived = r.trace.findIndex((s) => s.t > afterMs && dist(s.p, goal) < 0.5);
  let run = 0;
  let worst = 0;
  for (let i = Math.max(1, moved); i >= 1 && i <= arrived; i++) {
    run = dist(r.trace[i]!.p, r.trace[i - 1]!.p) <= 1e-4 ? run + 20 : 0;
    worst = Math.max(worst, run);
  }
  return { stillMs: moved < 0 || arrived < 0 ? Infinity : worst, arrivedAt: arrived < 0 ? NaN : r.trace[arrived]!.t };
}

/** The jump-in alone, from 0 (its next place is its rest). */
const LONE: PlannedManeuver = { ...ENTER, afterMs: 0 };

/** The captain's next sortie, waiting (P4): an Underway on an invented piece, set off as the planner sets it off. */
const underway = PACE_RULES.find((r) => r.id === RULE.objectiveUnderway)!;
const NEXT: PlannedManeuver = {
  id: underway.id, eventKey: 'f2-next', seed: 11, cast: { subject: [NEXT_WORK], agent: [AGENT] }, phases: underway.phases,
  afterMs: nearStartMs(0, workEndOf(LONE.phases), releaseOfPlay(LONE), gatherAtOf(underway.phases)),
  durationMs: spanMs(underway.phases), keys: [AGENT, NEXT_WORK].sort(), to: { rung: 'underway' },
};

describe('27 F2: the summoner passes through its spot without stopping', () => {
  it('with nothing waiting, it flies out, passes the station, and carries on to its rest with no hold on the way', () => {
    const r = play([LONE], 9000);
    // It goes to the station's side: its nearest pass comes within a few station radii.
    const nearest = Math.min(...r.trace.map((s) => dist(s.p, STATION)));
    expect(nearest, 'it passes beside the station').toBeLessThan(STATION_R * 3);
    const passAt = r.trace.find((s) => dist(s.p, STATION) === nearest)!.t;
    const { stillMs, arrivedAt } = longestStill(r, REST, passAt);
    expect(arrivedAt, 'it comes back to its rest beside its work').toBeGreaterThan(passAt);
    expect(stillMs, 'no hold between the flight and its rest').toBeLessThanOrEqual(60);
  });

  it('with its next sortie waiting (P4), it carries on from the spot to that sortie\'s place with no hold', () => {
    const r = play([LONE, NEXT], 12000);
    const claim = NEXT.afterMs + claimMs(NEXT.phases);
    const place = r.trace.find((s) => s.t >= claim)!.p; // where it works its next piece
    expect(dist(place, REST), 'its next place is its next sortie\'s, not its rest').toBeGreaterThan(1);
    const passAt = r.trace.reduce((best, s) => (dist(s.p, STATION) < dist(best.p, STATION) ? s : best)).t;
    const { stillMs } = longestStill(r, place, passAt);
    expect(stillMs, 'no hold between the flight and its next sortie').toBeLessThanOrEqual(60);
  });

  it('gives one call blip as it passes, at the ship, and the station\'s act starts within 50 ms of it', () => {
    const r = play([LONE], 9000);
    const b = blips(r);
    expect(b, 'one call blip, away from the station').toHaveLength(1);
    const ship = r.trace.find((s) => s.t >= b[0]!.t)!.p;
    expect(dist(b[0]!.at, ship), 'the blip is on the passing ship').toBeLessThanOrEqual(STATION_R * 0.5);
    expect(Number.isFinite(r.jumpAt), 'the station jumps in').toBe(true);
    expect(Math.abs(r.jumpAt - b[0]!.t), 'the act starts within 50 ms of the blip').toBeLessThanOrEqual(50);
  });

  it('the blip matches the arrival: the same hue and the same ring shape (R8, R10)', () => {
    const r = play([LONE], 9000);
    const [b] = blips(r);
    expect(b, 'a call blip').toBeDefined();
    const match = arrivals(r).filter((a) => a.color === b!.color && Math.abs(a.r1 / a.r - b!.r1 / b!.r) < 1e-6);
    expect(match.length, 'an arrival ring on the station in the blip\'s hue and shape').toBeGreaterThan(0);
  });

  it('the summoner is named from the blip, and its plate rides with the moving ship for NOTE_MIN_MS', () => {
    const r = play([LONE], 9000);
    expect(Number.isFinite(r.jumpAt)).toBe(true);
    const from = r.crew.findIndex((c) => c.u > 0);
    expect(from, 'the summoner is named').toBeGreaterThanOrEqual(0);
    expect(Math.abs(r.crew[from]!.t - r.jumpAt), 'named from the blip (the act\'s start, E2)').toBeLessThanOrEqual(60);
    let to = from;
    while (to + 1 < r.crew.length && r.crew[to + 1]!.u > 0) to++;
    expect(r.crew[to]!.t - r.crew[from]!.t, 'its plate shows at least NOTE_MIN_MS').toBeGreaterThanOrEqual(NOTE_MIN_MS - 40);
    // It rides with the ship: the ship is moving through the first NOTE_MIN_MS of it, never parked for it.
    const open = r.trace.filter((s) => s.t >= r.crew[from]!.t && s.t <= r.crew[from]!.t + NOTE_MIN_MS);
    let still = 0;
    let worst = 0;
    for (let i = 1; i < open.length; i++) { still = dist(open[i]!.p, open[i - 1]!.p) <= 1e-4 ? still + 20 : 0; worst = Math.max(worst, still); }
    const travelled = open.slice(1).reduce((n, s, i) => n + dist(s.p, open[i]!.p), 0);
    expect(travelled, 'the plate rides a moving ship').toBeGreaterThan(STATION_R);
    expect(worst, 'the ship never parks while its plate shows').toBeLessThanOrEqual(60);
  });

  it('under reduced motion the ship doesn\'t fly: the blip and the arrival play at its place', () => {
    const r = play([LONE], 9000, true);
    expect(Math.max(...r.trace.map((s) => dist(s.p, REST))), 'the ship stays at its rest').toBeLessThan(1e-6);
    const b = blips(r);
    expect(b, 'one call blip').toHaveLength(1);
    expect(dist(b[0]!.at, REST), 'at the ship\'s place').toBeLessThanOrEqual(1);
    expect(Math.abs(r.jumpAt - b[0]!.t), 'the station jumps in with it').toBeLessThanOrEqual(50);
    expect(arrivals(r).some((a) => a.color === b[0]!.color && Math.abs(a.r1 / a.r - b[0]!.r1 / b[0]!.r) < 1e-6), 'the arrival matches the blip').toBe(true);
  });
});

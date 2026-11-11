// The sector sweep (27 E7a, 05 §8.4a M-32, P-12): a beat with CROWD_MIN or more creations plays them as one
// sweep from the star that reveals each in turn, with one note. Read on the busy fixtures it's for (Harbor and
// Convoy Planning: Halcyon has no creation burst), through the ledger's own schedule and plan helpers. Last, the
// round's first creation beats fusing into one sweep (27 E7b, B-22): no fixture opens so, so hand-built beats and a mini sprint.
import { describe, expect, it, vi } from 'vitest';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import type { Beat } from '@shared/contracts/playback';
import type { ViewGraph } from '@shared/contracts/view';
import { CROWD_MIN, openingSweep, planManeuvers, priorityFor } from '@shared/engine/maneuvers';
import { sceneFacts } from '@shared/engine/facts';
import { PACE_RULES, RULE, SWEEP_ENTER_MS, SWEEP_SPREAD_MAX_MS, SWEEP_STEP_MS, sweepPhases } from '@shared/engine/pace';
import type { Move, PieceFacts, RoundFacts, Signal } from '@shared/engine/types';
import { SOLAR } from '@shared/hierarchy/solar';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { sweepNote } from '@shared/packs/events';
import { packFor } from '@shared/packs/registry';
import { buildScene, sceneEvents } from '@shared/playback/highlights';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { scenario, scenarioKeys, sprintScopes, toHistory } from '@fixtures/dsl';
import { mapping } from '../golden/helpers';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { LAYOUT_VERSION } from '@shared/limits';
import { resolve } from 'node:path';
import { beforeF2, planOf, resolvePods, scheduleOf } from '../../scripts/pacing-ledger';

// The renderer's pure order, loaded by path as the other renderer tests do (it isn't in the node project).
interface SweepOrderModule {
  sweepOrder<T extends { pk: string; at: readonly [number, number] }>(subjects: readonly T[], board: { minX: number; minY: number; maxX: number; maxY: number }): { item: T; d: number }[];
}
const { sweepOrder } = (await import(/* @vite-ignore */ resolve(__dirname, '../../src/renderer/src/theme/starChart/maneuvers/sweepOrder.ts'))) as SweepOrderModule;

vi.setConfig({ testTimeout: 180_000 });

const NO_SWEEP = PACE_RULES.filter((r) => r.id !== RULE.regionSweep);
const ARRIVING = new Set<string>([RULE.pieceAppear, RULE.threatEmerge]);
const pods = resolvePods();
const pod = (tail: string) => pods.find((p) => p.label === tail)!;
const BUSY = [pod('Harbor Pod'), pod('Convoy Planning Pod')];
const HALCYON = ['Comet Pod', 'Nova Pod', 'Quasar Pod', 'Pulsar Pod'].map(pod);
type Pod = (typeof pods)[number];

/** A beat's creations, as the planner drafts them without the sweep: each arrival whose move is an `appear`. */
function creationsOf(rp: Pod, b: Beat, limelight: Parameters<typeof planOf>[3]): { key: CanonicalKey; event: string }[] {
  const f = sceneFacts(paceFacts(rp.h), rp.areaKey);
  return planOf(rp.h, rp.areaKey, b, limelight, { rules: NO_SWEEP }).filter((m) => ARRIVING.has(m.id)).flatMap((m) => {
    const key = m.cast.subject?.[0];
    const appears = (f.moves.get(m.eventKey) ?? []).some((mv) => mv.m === 'appear' && mv.key === key);
    return key && appears ? [{ key, event: m.eventKey }] : [];
  });
}

/** Every played beat with its plan, and the sweep beats among them. */
function sweepsOf(rp: Pod) {
  const sch = scheduleOf(rp.h, rp.scene, rp.tz, {});
  const played = sch.beats.filter((b) => b.durationMs > 0);
  const plans = played.map((b) => ({ b, plan: planOf(rp.h, rp.areaKey, b, sch.limelight, {}), made: creationsOf(rp, b, sch.limelight) }));
  return { sch, plans, sweeps: plans.filter((x) => x.made.length >= CROWD_MIN) };
}

const graphAt = (bundle: ScopeHistory, scene: string, t: number): ViewGraph =>
  projectScene(bundle, snapshotAt(bundle, t, 'knownThen'), scene as never, LAYOUT_VERSION, SOLAR);

describe('the sector sweep: the threshold and its rule', () => {
  it('the rule\'s nominal length uses CROWD_MIN (pace.ts writes the literal 4)', () => {
    const rule = PACE_RULES.find((r) => r.id === RULE.regionSweep)!;
    expect(CROWD_MIN).toBe(4);
    expect(rule.phases).toEqual(sweepPhases(CROWD_MIN));
    expect(rule.tier).toBe('narrative');
    expect(PACE_RULES.at(-1)!.id).toBe(RULE.regionSweep);
  });

  it('sweepPhases: tell 300, act min(2000, n x 110) + 1000, echo 400', () => {
    const act = (n: number) => sweepPhases(n).find((p) => p.phase === 'act')!.durMs;
    expect(act(4)).toBe(4 * SWEEP_STEP_MS + SWEEP_ENTER_MS);
    expect(act(40)).toBe(SWEEP_SPREAD_MAX_MS + SWEEP_ENTER_MS);
    expect(sweepPhases(4).map((p) => [p.phase, p.durMs])).toEqual([['tell', 300], ['act', 1440], ['echo', 400]]);
  });
});

for (const rp of BUSY) {
  describe(`the sector sweep on ${rp.label}`, () => {
    const { sch, sweeps } = sweepsOf(rp);

    it('plays exactly one sweep per beat of 4+ creations, revealing exactly those (Check 1)', () => {
      expect(sweeps.length).toBeGreaterThan(0);
      for (const { b, plan, made } of sweeps) {
        const sw = plan.filter((m) => m.id === RULE.regionSweep);
        expect(sw, `beat ${b.index}`).toHaveLength(1);
        const m = sw[0]!;
        expect([...m.cast.subject!].sort()).toEqual(made.map((x) => x.key).sort());
        expect(m.sweep!.members).toEqual([...new Set(made.map((x) => x.event))]);
        expect(m.sweep!.counts.objective + m.sweep!.counts.threat).toBe(made.length);
        expect(m.phases).toEqual(sweepPhases(made.length));
        expect(m.afterMs).toBe(0);
        const swept = new Set(m.cast.subject);
        expect(plan.filter((x) => ARRIVING.has(x.id) && swept.has(x.cast.subject?.[0] as CanonicalKey))).toEqual([]);
      }
    });

    it('is shorter with the sweep than without it (Check 3)', () => {
      expect(sch.wallMs ?? 0).toBeGreaterThan(0);
      const without = scheduleOf(rp.h, rp.scene, rp.tz, { rules: NO_SWEEP });
      const total = (s: typeof sch) => s.wallMs ?? s.totalMs;
      expect(total(sch)).toBeLessThan(total(without));
    });

    it('a seek lands on the same board, every swept piece there through the beat and none before (Check 4)', () => {
      const fresh = structuredClone(rp.h);
      for (const { b, plan } of sweeps) {
        const keys = plan.find((m) => m.id === RULE.regionSweep)!.cast.subject!;
        const want = graphAt(rp.h, rp.scene, b.sourceUtc);
        const has = (g: ViewGraph) => keys.map((k) => g.nodes.some((n) => n.canonicalKey === k));
        // The board at the beat's end, whichever way it is reached: what the sweep has revealed by then.
        const there = has(want);
        for (const x of [b.presentationStartMs, b.presentationStartMs + b.durationMs - 1]) {
          const g = graphAt(fresh, rp.scene, sch.stateUtc(x));
          expect(g).toEqual(want);
          expect(has(g)).toEqual(there);
        }
        expect(has(graphAt(fresh, rp.scene, sch.stateUtc(b.presentationStartMs - 1))).some(Boolean)).toBe(false);
        // Every swept piece is on the board, except one the pace facts count in the region from its creation while
        // the board (knownThen) has it elsewhere until it moves in: pod-sprint's 20141, created in another pod. It
        // is there by the round's end, and the star's note counts only what is revealed (the interpreter).
        const missing = keys.filter((_, i) => !there[i]);
        expect(missing.filter((k) => !k.endsWith(':20141')), missing.join()).toEqual([]);
        expect(missing.length, missing.join()).toBeLessThanOrEqual(rp.label === 'Harbor Pod' ? 1 : 0);
        const end = graphAt(fresh, rp.scene, rp.h.range.endUtc - 1);
        for (const k of missing) expect(end.nodes.some((n) => n.canonicalKey === k), k).toBe(true);
      }
    });

    it('plans alike over two builds; with limelight the sweep is not quiet and flies no crew (Check 5)', () => {
      const again = sweepsOf(rp);
      const strip = (ps: { plan: PlannedManeuver[] }[]) => JSON.stringify(ps.map((x) => x.plan));
      expect(strip(again.plans)).toBe(strip(sweepsOf(rp).plans));
      expect(sch.limelight).toBeTruthy();
      for (const { plan } of sweeps) {
        const m = plan.find((x) => x.id === RULE.regionSweep)!;
        expect(m.quiet ?? false).toBe(false);
        expect(m.cast.agent ?? []).toEqual([]);
        expect(m.cast.support ?? []).toEqual([]);
      }
    });

    it('the note names the count and the sprint (Check 7)', () => {
      for (const { plan } of sweeps) {
        const m = plan.find((x) => x.id === RULE.regionSweep)!;
        const note = sweepNote(rp.h, m.sweep!.counts);
        expect(note).toContain(rp.sprint);
        expect(note).toMatch(/created in /);
        // R9: the count is the number revealed.
        const nums = (note.match(/\d+/g) ?? []).map(Number).filter((x) => !rp.sprint.includes(String(x)));
        expect(nums.reduce((a, x) => a + x, 0)).toBe(m.cast.subject!.length);
      }
    });
  });
}

describe('the sector sweep leaves Halcyon alone (no creation burst) (Check 2)', () => {
  it('Comet\'s one creation still plays piece.appear; every Halcyon pod plays the same length with and without the rule', () => {
    const comet = pod('Comet Pod');
    const sch = scheduleOf(comet.h, comet.scene, comet.tz, {});
    const ids = sch.beats.filter((b) => b.durationMs > 0).flatMap((b) => planOf(comet.h, comet.areaKey, b, sch.limelight, {}).map((m) => m.id));
    expect(ids).toContain(RULE.pieceAppear);
    expect(ids).not.toContain(RULE.regionSweep);
    // Comet's length as E7 measured it, before rising tempo (27 E8) tightened its gaps and summons went on the fly (27 F2).
    const flat = scheduleOf(comet.h, comet.scene, comet.tz, { risingTempo: false, rules: beforeF2(PACE_RULES) });
    expect(flat.wallMs ?? flat.totalMs).toBe(61_845);
    for (const rp of HALCYON) {
      const a = scheduleOf(rp.h, rp.scene, rp.tz, {});
      const b = scheduleOf(rp.h, rp.scene, rp.tz, { rules: NO_SWEEP });
      expect(a.wallMs ?? a.totalMs, rp.label).toBe(b.wallMs ?? b.totalMs);
    }
  });
});

// ---- A hand-built board (as maneuvers.test.ts builds one) ----

const wi = (n: number) => `wi:o:${n}` as CanonicalKey;
const ann = 'id:o:ann' as CanonicalKey;
const READY: Signal = { rung: 'ready' };
const T0 = Date.UTC(2026, 8, 14);
const ROUND = { startUtc: T0, endUtc: T0 + 14 * 86_400_000 };
let seq = 0;
function ev(at: number, by: CanonicalKey | null = null): AnyTimelineEvent {
  return { eventKey: `s${String(++seq).padStart(3, '0')}`, kind: 'wi_state_changed', occurredAt: T0 + at, observedAt: T0 + at, entityKey: wi(0), projectKey: 'proj:o:p', priority: 'high', payload: { from: '', to: '' }, evidence: [], changedBy: by } as AnyTimelineEvent;
}
const piece = (key: CanonicalKey): PieceFacts => ({ key, role: 'objective', member: [{ from: T0, to: null }], seatAt: [{ from: T0, seat: ann }], signalAt: [{ from: T0, signal: READY }], steps: [], parent: null });
function board(events: [AnyTimelineEvent, Move[]][], pieces: PieceFacts[]) {
  const h = { events: events.map(([e]) => e), range: ROUND } as unknown as ScopeHistory;
  const f: RoundFacts = { round: ROUND, region: 'area:o:p:2', pieces: new Map(pieces.map((p) => [p.key, p])), seats: [ann], attachments: new Map(), moves: new Map(events.map(([e, mv]) => [e.eventKey, mv])) };
  const beat: Beat = { index: 0, sourceUtc: T0, firstUtc: T0, eventKeys: events.map(([e]) => e.eventKey), priority: 'high', presentationStartMs: 0, durationMs: 1, accented: true };
  return { h, f, beat };
}

describe('the sector sweep in the sequencer (Check 6)', () => {
  it('a same-beat underway on a swept piece waits for the sweep to end', () => {
    const made = [1, 2, 3, 4].map((i) => [ev(0), [{ m: 'appear', key: wi(i), role: 'objective', to: READY, seat: ann }]] as [AnyTimelineEvent, Move[]]);
    const under: [AnyTimelineEvent, Move[]] = [ev(1000, ann), [{ m: 'climb', key: wi(2), role: 'objective', from: READY, to: { rung: 'underway' }, actor: ann }]];
    const { h, f, beat } = board([...made, under], [1, 2, 3, 4].map((i) => piece(wi(i))));
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const sw = plan.find((m) => m.id === RULE.regionSweep)!;
    const up = plan.find((m) => m.id === RULE.objectiveUnderway)!;
    expect(sw.afterMs).toBe(0);
    expect(sw.cast.subject).toHaveLength(4);
    expect(up.afterMs).toBeGreaterThanOrEqual(sw.durationMs);
    // Seats aren't swept: a draft casting only the seat isn't held back by the hold-back rule.
    expect(plan.filter((m) => ARRIVING.has(m.id))).toEqual([]);
  });

  it('three creations stay three Sensor contacts', () => {
    const made = [1, 2, 3].map((i) => [ev(0), [{ m: 'appear', key: wi(10 + i), role: 'objective', to: READY, seat: ann }]] as [AnyTimelineEvent, Move[]]);
    const { h, f, beat } = board(made, [1, 2, 3].map((i) => piece(wi(10 + i))));
    expect(planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm).map((m) => m.id)).toEqual([RULE.pieceAppear, RULE.pieceAppear, RULE.pieceAppear]);
  });
});

describe('sweepOrder and sweepNote (Check 7)', () => {
  it('orders by normalized elliptical distance from the board centre, then by pk', () => {
    const b = { minX: -200, maxX: 200, minY: -100, maxY: 100 };
    const out = sweepOrder([
      { pk: 'd', at: [150, 0] as const }, { pk: 'b', at: [0, 50] as const }, { pk: 'a', at: [100, 0] as const }, { pk: 'c', at: [10, 0] as const },
    ], b);
    // (0, 50) and (100, 0) are both 0.5 out on the ellipse: pk breaks the tie.
    expect(out.map((x) => x.item.pk)).toEqual(['c', 'a', 'b', 'd']);
    expect(out[1]!.d).toBeCloseTo(0.5);
    expect(out[3]!.d).toBeCloseTo(0.75);
  });

  it('the note counts what it reveals and names the sprint leaf', () => {
    const rp = pod('Harbor Pod');
    const note = sweepNote(rp.h, { objective: 5, threat: 2 });
    expect(note).toContain('Sprint 13');
    expect(note).toMatch(/\b5\b/);
    expect(note).toMatch(/\b2\b/);
    expect(note).toMatch(/created in Sprint 13$/);
  });
});

// ---- The round's first beats (27 E7b, 05 §8 B-22) ----

const H1 = 3_600_000;
const appearOf = (k: CanonicalKey): Move => ({ m: 'appear', key: k, role: 'objective', to: READY, seat: ann } as Move);
/** Raw beats from creation counts and moves, at the given hours of T0's day (UTC): each beat's events at one time. */
function rawBeats(spec: { at: number; moves: Move[][] }[]) {
  const all: [AnyTimelineEvent, Move[]][] = [];
  const beats: AnyTimelineEvent[][] = spec.map(({ at, moves }) => moves.map((mv) => {
    const e = ev(at * H1);
    all.push([e, mv]);
    return e;
  }));
  const keys = [...new Set(all.flatMap(([, mv]) => mv.flatMap((m) => ('key' in m ? [m.key] : []))))];
  const { h, f } = board(all, keys.map((k) => piece(k)));
  return { h, f, beats };
}
let made = 100;
const creations = (n: number) => Array.from({ length: n }, () => [appearOf(wi(++made))]);
const open = (spec: { at: number; moves: Move[][] }[], rules = PACE_RULES, tz = 'UTC') => {
  const { h, f, beats } = rawBeats(spec);
  return openingSweep(h, beats, f, rules, (_h, e) => e.priority, tz);
};

describe('the opening sweep: the round\'s first creation beats fuse (Check 8)', () => {
  it('three consecutive creation beats on one day fuse to [0, 2]', () => {
    expect(open([{ at: 9, moves: creations(2) }, { at: 10, moves: creations(1) }, { at: 11, moves: creations(1) }])).toEqual([0, 2]);
  });

  it('starts at the first beat that drafts anything', () => {
    expect(open([{ at: 8, moves: [[]] }, { at: 9, moves: creations(2) }, { at: 10, moves: creations(2) }])).toEqual([1, 2]);
  });

  it('a reseat beat cuts the run', () => {
    const reseat = (): Move[][] => [[{ m: 'reseat', key: wi(1), role: 'objective', from: ann, to: null, actor: ann } as Move]];
    expect(open([{ at: 9, moves: creations(2) }, { at: 10, moves: creations(2) }, { at: 11, moves: reseat() }, { at: 12, moves: creations(1) }])).toEqual([0, 1]);
    expect(open([{ at: 9, moves: creations(2) }, { at: 10, moves: reseat() }, { at: 11, moves: creations(2) }])).toBeNull();
    // A reseat first: the opening isn't a creation run at all.
    expect(open([{ at: 9, moves: reseat() }, { at: 10, moves: creations(4) }])).toBeNull();
  });

  it('a day turn cuts the run', () => {
    expect(open([{ at: 21, moves: creations(2) }, { at: 22, moves: creations(2) }, { at: 25, moves: creations(2) }])).toEqual([0, 1]);
    expect(open([{ at: 22, moves: creations(2) }, { at: 25, moves: creations(2) }])).toBeNull();
    // Read in the episode's zone: 11:00 and 13:00 UTC are a day apart in Auckland (UTC+12 in September).
    expect(open([{ at: 11, moves: creations(2) }, { at: 13, moves: creations(2) }], PACE_RULES, 'Pacific/Auckland')).toBeNull();
  });

  it('fewer than CROWD_MIN creations, one beat alone, or no sweep rule: null', () => {
    expect(open([{ at: 9, moves: creations(1) }, { at: 10, moves: creations(1) }, { at: 11, moves: creations(1) }])).toBeNull();
    expect(open([{ at: 9, moves: creations(5) }, { at: 12, moves: [[{ m: 'reseat', key: wi(1), role: 'objective', from: ann, to: null, actor: ann } as Move]] }])).toBeNull();
    expect(open([{ at: 9, moves: creations(2) }, { at: 10, moves: creations(2) }], NO_SWEEP)).toBeNull();
  });

  it('a beat that already sweeps counts its members', () => {
    expect(open([{ at: 9, moves: creations(4) }, { at: 10, moves: creations(1) }])).toEqual([0, 1]);
  });
});

/** A scene's schedule as `buildScene` builds it, with the raw beats its limelight hook was given. */
function withRaw(h: ScopeHistory, scene: string, tz: string) {
  const ref = SOLAR.resolve(scene as never)!.ref;
  const p = SOLAR.pacing!(h, ref);
  let raw: AnyTimelineEvent[][] = [];
  const sch = buildBeatSchedule(h, h.range, tz, { ...p, limelight: (hh, beats, z) => { raw = beats.map((b) => [...b]); return p.limelight!(hh, beats, z); }, include: sceneEvents(h, scene as never, SOLAR), hier: SOLAR });
  const facts = (x: ScopeHistory) => sceneFacts(paceFacts(x), ref.key as CanonicalKey);
  const prio = priorityFor(packFor(h), facts) ?? ((_h: ScopeHistory, e: AnyTimelineEvent) => e.priority);
  return { sch, raw, f: facts(h), prio };
}

describe('the opening sweep on the fixtures (Check 8)', () => {
  it('no fixture pod opens with a run of creation beats: openingSweep is null on all six', () => {
    expect(pods).toHaveLength(6);
    for (const rp of pods) {
      const { sch, raw, f, prio } = withRaw(rp.h, rp.scene, rp.tz);
      expect(raw.length, rp.label).toBeGreaterThan(0);
      expect(openingSweep(rp.h, raw, f, PACE_RULES, prio, rp.tz), rp.label).toBeNull();
      // The same schedule the app builds.
      expect(sch.totalMs, rp.label).toBe(scheduleOf(rp.h, rp.scene, rp.tz, {}).totalMs);
    }
  });
});

describe('the opening sweep on a mini sprint (Check 8)', () => {
  // One pod's one-week sprint (solarSeek's mini pattern). Invented names only (INV-18).
  const POD = 'Brinewick\\Heron Pod';
  const SPRINT = 'Brinewick\\Sprint 3';
  const IN = { area: POD, iteration: SPRINT };
  const s = scenario('sweep-opening', { project: 'Brinewick', tz: 'UTC', range: ['2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z'] })
    .area('Brinewick', 24000).area(POD, 24001, { favorite: true, defaultScope: true }).area('Brinewick\\Tern Pod', 24002)
    .iteration(SPRINT, 24100, '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z')
    .person('oriel', 'Oriel Fane').person('bram', 'Bram Tolley').person('suki', 'Suki Marsh')
    // The round opens with five creations over three hours of one morning, two at a time at most: no beat alone sweeps.
    .at('2026-11-02T09:00:00Z').story(24301, 'Tide gauges', { ...IN, assignee: 'oriel' }).story(24302, 'Buoy lamps', { ...IN, assignee: 'oriel' })
    .at('2026-11-02T10:00:00Z').story(24303, 'Pier ropes', { ...IN, assignee: 'bram' })
    .at('2026-11-02T11:00:00Z').bug(24304, 'Lamp flicker', { ...IN, assignee: 'suki' }).story(24305, 'Net floats', { ...IN, assignee: 'suki' })
    // Then other work, the next day.
    .at('2026-11-03T09:00:00Z').state(24301, 'Active')
    .build();
  const scope = sprintScopes(s).find((x) => x.sprint === SPRINT)!;
  const h = toHistory(s, mapping, scope);
  const pod = (h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : []).find((p) => p.path === POD)!;
  const scene = SOLAR.format({ level: 'pod', key: pod.areaKey } as const);
  const k = scenarioKeys(s);
  const keys = [24301, 24302, 24303, 24304, 24305].map((n) => k.wi(n));
  const { sch, raw, f, prio } = withRaw(h, scene, 'UTC');

  it('fuses the three opening beats into one, which plays one sweep of all five', () => {
    const op = openingSweep(h, raw, f, PACE_RULES, prio, 'UTC');
    expect(op).not.toBeNull();
    const [lo, hi] = op!;
    expect(hi - lo).toBeGreaterThanOrEqual(2);
    expect(raw.slice(lo, hi + 1).flat().length).toBeGreaterThanOrEqual(5);
    expect(sch.limelight?.direction?.fuse).toEqual([op]);
    // The app's own schedule fuses alike.
    expect(buildScene(h, h.range, 'UTC', scene as never, SOLAR).beats.map((b) => b.eventKeys)).toEqual(sch.beats.map((b) => b.eventKeys));
    const played = sch.beats.filter((b) => b.durationMs > 0);
    const plans = played.map((b) => planOf(h, pod.areaKey, b, sch.limelight, {}));
    const sweeps = plans.flat().filter((m) => m.id === RULE.regionSweep);
    expect(sweeps).toHaveLength(1);
    const sw = sweeps[0]!;
    expect([...sw.cast.subject!].sort()).toEqual([...keys].sort());
    expect(sw.sweep!.counts).toEqual({ objective: 4, threat: 1 });
    expect(sw.phases).toEqual(sweepPhases(5));
    expect(plans.flat().filter((m) => ARRIVING.has(m.id))).toEqual([]);
    expect(plans[0]!.some((m) => m.id === RULE.regionSweep)).toBe(true);
    // Without the rule, the beats stay apart and each creation plays its own arrival.
    const without = scheduleOf(h, scene, 'UTC', { rules: NO_SWEEP });
    expect(without.beats.length).toBeGreaterThan(sch.beats.length);
    expect(without.limelight?.direction?.fuse ?? []).toEqual([]);
  });

  it('a seek lands on the fused beat\'s board, with every swept piece there through the beat and none before (as Check 4)', () => {
    const fresh = structuredClone(h);
    const b = sch.beats.find((x) => x.durationMs > 0 && planOf(h, pod.areaKey, x, sch.limelight, {}).some((m) => m.id === RULE.regionSweep))!;
    const want = graphAt(h, scene, b.sourceUtc);
    const has = (g: ViewGraph) => keys.map((key) => g.nodes.some((n) => n.canonicalKey === key));
    expect(has(want).every(Boolean)).toBe(true);
    for (const x of [b.presentationStartMs, b.presentationStartMs + b.durationMs - 1]) {
      const g = graphAt(fresh, scene, sch.stateUtc(x));
      expect(g).toEqual(want);
      expect(has(g).every(Boolean)).toBe(true);
    }
    expect(has(graphAt(fresh, scene, sch.stateUtc(b.presentationStartMs - 1))).some(Boolean)).toBe(false);
  });
});

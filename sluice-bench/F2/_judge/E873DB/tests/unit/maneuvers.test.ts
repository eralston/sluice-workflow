// 14 §2.6–2.7 — maneuver rules (engine/pace.ts) and the planner (engine/maneuvers.ts): which move
// starts which rule, the cast, determinism, protected moments inside their beat, and beats that fit
// the budget. Hand-built moves and facts for the rules; for whole schedules, every v0 scenario read
// through a small test adapter (the real SDLC adapter is W1-T1's).
import { describe, expect, it, vi } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import type { AnyTimelineEvent, Priority } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Beat } from '@shared/contracts/playback';
import { PHASES, type PlannedManeuver } from '@shared/contracts/maneuver';
import { attachmentSignal, resolveRole, resolveSignal } from '@shared/engine/signal';
import { firstMerges, roundFacts } from '@shared/engine/facts';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { packFor } from '@shared/packs/registry';
import { ALL_CLEAR, CLOSE_SLIDE_MS, HOMEWORLD, LANDING, LANDING_BEAMED, LINK, STRIKE, STRIKE_BEAMED, mergedBacking, PACE_RULES, regionClearedBy, RULE, seatCompletedBy, SHORT_PACE, shortForm, shortOf, spanMs, type PaceRule } from '@shared/engine/pace';
import { directorOf } from '@shared/engine/director';
import { ARC_IMPACT_MS, ATTENTION_MAX, CREW_FOLD_MS, CREW_HOLD_MS, CREW_OPEN_MIN_MS, CROWD_MIN, claimMs, crewTimes, momentsOf, nearWaits, NOTE_MIN_MS, pacing, planManeuvers, releaseOfPlay, scheduleFacts, seamStartMs, shapeOf, STAY_NEAR_MS, turnKey, turnsOf, workEndOf } from '@shared/engine/maneuvers';
import type { AttachmentFacts, DomainPack, EventAdapter, Move, PieceFacts, RoundFacts, Signal } from '@shared/engine/types';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { DESKTOP } from '@shared/profile/bundled';
import halcyon from '@fixtures/scenarios/sprint-pods';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import { SOLAR } from '@shared/hierarchy/solar';
import { buildScene } from '@shared/playback/highlights';
import { storyTime } from '@shared/playback/storyTime';
import { mapping } from '../golden/helpers';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { fnv1a32 } from '@shared/hash';
import { historyOf } from '../golden/helpers';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

// ---- Hand-built pieces ----

const wi = (n: number) => `wi:o:${n}` as CanonicalKey;
const who = (n: string) => `id:o:${n}` as CanonicalKey;
const pr = (n: number) => `pr:o:r1:${n}` as CanonicalKey;
const repo = (n: string) => `repo:o:${n}` as CanonicalKey;
const [ann, ben, cy, dee] = [who('ann'), who('ben'), who('cy'), who('dee')];

const sig = (rung: Signal['rung'], more: Partial<Signal> = {}): Signal => ({ rung, ...more });
const READY = sig('ready');
const SKETCH = sig('ready', { sketch: true });
const T0 = Date.UTC(2026, 8, 14);
const ROUND = { startUtc: T0, endUtc: T0 + 14 * 86_400_000 };

let seq = 0;
/** A bare event: the planner reads its key, time, priority and actor; moves come from the facts. */
function ev(at: number, opts: { priority?: Priority; by?: CanonicalKey | null; key?: string } = {}): AnyTimelineEvent {
  const eventKey = opts.key ?? `e${String(++seq).padStart(3, '0')}`;
  return { eventKey, kind: 'wi_state_changed', occurredAt: T0 + at, observedAt: T0 + at, entityKey: wi(0), projectKey: 'proj:o:p', priority: opts.priority ?? 'high', payload: { from: '', to: '' }, evidence: [], changedBy: opts.by ?? null } as AnyTimelineEvent;
}

function pieceFacts(key: CanonicalKey, role: PieceFacts['role'], seat: CanonicalKey | null): PieceFacts {
  return { key, role, member: [{ from: T0, to: null }], seatAt: [{ from: T0, seat }], signalAt: [{ from: T0, signal: READY }], steps: [], parent: null };
}
function attFacts(key: CanonicalKey, facility: CanonicalKey, at: number, author: CanonicalKey | null, links: CanonicalKey[], approvers: CanonicalKey[] = []): AttachmentFacts {
  return { key, facility, author, open: { from: T0 + at, to: null }, links, approvers, signalAt: [] };
}

interface Board { events: [AnyTimelineEvent, Move[]][]; pieces?: PieceFacts[]; attachments?: AttachmentFacts[] }
function board(b: Board): { h: ScopeHistory; f: RoundFacts; beat: Beat } {
  const h = { events: b.events.map(([e]) => e), range: ROUND } as unknown as ScopeHistory;
  const f: RoundFacts = {
    round: ROUND, region: 'area:o:p:2',
    pieces: new Map((b.pieces ?? []).map((p) => [p.key, p])), seats: [ann, ben, cy],
    attachments: new Map((b.attachments ?? []).map((a) => [a.key, a])),
    moves: new Map(b.events.map(([e, mv]) => [e.eventKey, mv])),
  };
  const beat: Beat = { index: 0, sourceUtc: T0, firstUtc: T0, eventKeys: b.events.map(([e]) => e.eventKey), priority: 'high', presentationStartMs: 0, durationMs: 1, accented: true };
  return { h, f, beat };
}

const EMPTY = board({ events: [] }).f;
/** The rules a move starts, an event at T0 standing in for when it happened (milestones read it). */
const matched = (mv: Move, f: RoundFacts = EMPTY) => PACE_RULES.filter((r) => !r.light && r.match(mv, f) && (!r.when || r.when(mv, ev(0), f))).map((r) => r.id);

describe('the pace rules (engine/pace.ts)', () => {
  it('lists the thirteen rules of 17 W1-T4, once each, with phases in order', () => {
    expect(PACE_RULES.map((r) => r.id).sort()).toEqual(Object.values(RULE).sort());
    for (const r of PACE_RULES) {
      expect(r.phases.length).toBeGreaterThan(0);
      const order = r.phases.map((p) => PHASES.indexOf(p.phase));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(r.phases.every((p) => p.atMs >= 0 && p.durMs > 0)).toBe(true);
    }
  });

  it('protects the two successes, the merge and the two milestones; a dropped attachment only settles', () => {
    const prot = PACE_RULES.filter((r) => r.protect).map((r) => r.id).sort();
    expect(prot).toEqual([RULE.objectiveAccomplish, RULE.threatAccomplish, RULE.attachmentMerge, RULE.seatComplete, RULE.regionClear].sort());
    const landed: Move = { m: 'settle', key: pr(1), facility: repo('r1'), to: sig('accomplished'), approvers: [], actor: ann };
    const dropped: Move = { ...landed, to: sig('off', { ghost: true }) };
    expect(matched(landed)).toEqual([RULE.attachmentMerge]);
    expect(matched(dropped)).toEqual([RULE.attachmentSettle]);
  });

  it.each<[string, Move, string[]]>([
    ['a new objective (sketch)', { m: 'appear', key: wi(1), role: 'objective', to: SKETCH, seat: ann }, [RULE.pieceAppear]],
    ['a new threat, as a sketch', { m: 'appear', key: wi(1), role: 'threat', to: SKETCH, seat: ann }, [RULE.pieceAppear]],
    ['a new threat, already solid', { m: 'appear', key: wi(1), role: 'threat', to: READY, seat: null }, [RULE.threatEmerge]],
    ['a threat’s sketch firming up', { m: 'climb', key: wi(1), role: 'threat', from: SKETCH, to: READY, actor: ann }, [RULE.threatEmerge]],
    ['an objective underway', { m: 'climb', key: wi(1), role: 'objective', from: READY, to: sig('underway'), actor: ann }, [RULE.objectiveUnderway]],
    ['an objective nearing', { m: 'climb', key: wi(1), role: 'objective', from: sig('underway'), to: sig('nearing', { step: 0.3 }), actor: ann }, [RULE.objectiveNearing]],
    ['an objective accomplished', { m: 'climb', key: wi(1), role: 'objective', from: sig('nearing'), to: sig('accomplished'), actor: ann }, [RULE.objectiveAccomplish]],
    ['a step within a rung', { m: 'climb', key: wi(1), role: 'objective', from: sig('nearing', { step: 0.3 }), to: sig('nearing', { step: 0.65 }), actor: ann }, []],
    ['a threat engaged', { m: 'climb', key: wi(1), role: 'threat', from: READY, to: sig('underway'), actor: ann }, [RULE.threatEngage]],
    ['a threat nearing', { m: 'climb', key: wi(1), role: 'threat', from: sig('underway'), to: sig('nearing'), actor: ann }, [RULE.threatEngage]],
    ['a threat defeated', { m: 'climb', key: wi(1), role: 'threat', from: sig('nearing'), to: sig('accomplished'), actor: ann }, [RULE.threatAccomplish]],
    ['an objective dropped', { m: 'climb', key: wi(1), role: 'objective', from: READY, to: sig('off', { ghost: true }), actor: ann }, [RULE.pieceOff]],
    ['a threat set aside', { m: 'climb', key: wi(1), role: 'threat', from: READY, to: sig('off', { deferred: true }), actor: ann }, [RULE.pieceOff]],
    ['a step’s climb (drawn inside its parent)', { m: 'climb', key: wi(1), role: 'step', from: READY, to: sig('accomplished'), actor: ann }, []],
    ['a reseat', { m: 'reseat', key: wi(1), role: 'objective', from: ann, to: ben, actor: cy }, [RULE.pieceReseat]],
    ['a reseat to the frontier', { m: 'reseat', key: wi(1), role: 'threat', from: ann, to: null, actor: cy }, [RULE.pieceReseat]],
    ['a reseat to the same seat', { m: 'reseat', key: wi(1), role: 'objective', from: ann, to: ann, actor: cy }, []],
    ['a container’s climb', { m: 'climb', key: wi(1), role: 'container', from: READY, to: sig('accomplished'), actor: ann }, []],
    ['a merge', { m: 'settle', key: pr(1), facility: repo('r1'), to: sig('accomplished'), approvers: [ben], actor: ann }, [RULE.attachmentMerge]],
    ['an abandoned attachment', { m: 'settle', key: pr(1), facility: repo('r1'), to: sig('off', { ghost: true }), approvers: [], actor: ann }, [RULE.attachmentSettle]],
    ['a retitle', { m: 'retitle', key: wi(1) }, []],
    ['a bind', { m: 'bind', child: wi(2), parent: wi(1), rel: 'step' }, []],
    ['entering the round', { m: 'enter', key: wi(1), role: 'objective' }, []],
  ])('%s', (_name, mv, ids) => {
    expect(matched(mv)).toEqual(ids);
  });

  it('a facility enters with its first attachment in the round only; every attachment opens', () => {
    const f = board({
      events: [],
      attachments: [attFacts(pr(1), repo('r1'), -86_400_000, ann, []), attFacts(pr(2), repo('r1'), 3_600_000, ann, []), attFacts(pr(3), repo('r1'), 7_200_000, ben, []), attFacts(pr(4), repo('r2'), 3_600_000, cy, [])],
    }).f;
    const attach = (key: CanonicalKey, facility: CanonicalKey): Move => ({ m: 'attach', key, facility, author: ann });
    expect(matched(attach(pr(1), repo('r1')), f)).toEqual([RULE.attachmentOpen]); // opened before the round
    expect(matched(attach(pr(2), repo('r1')), f)).toEqual([RULE.facilityEnter, RULE.attachmentOpen]);
    expect(matched(attach(pr(3), repo('r1')), f)).toEqual([RULE.attachmentOpen]);
    expect(matched(attach(pr(4), repo('r2')), f)).toEqual([RULE.facilityEnter, RULE.attachmentOpen]);
  });

  it('every rule fits comfortably inside a beat and the budget', () => {
    // The merge is the one long moment (decided 2026-10-12): about 7 s, and 10 s on a facility's first.
    for (const r of PACE_RULES) expect(spanMs(r.phases), r.id).toBeLessThanOrEqual(r.id === RULE.attachmentMerge ? 7500 : 5000);
    // One of every rule, end to end, about the episode's budget (gaps compress first): the closes' slide (22 C3) took it just past 45 s.
    // The sector sweep (27 E7) is left out: it plays only in place of CROWD_MIN or more arrivals, and costs less than they would.
    expect(PACE_RULES.filter((r) => r.id !== RULE.regionSweep).reduce((s, r) => s + spanMs(r.phases), 0)).toBeLessThan(DESKTOP.pacing.budgetMs * 1.05);
    const sweep = PACE_RULES.find((r) => r.id === RULE.regionSweep)!;
    expect(spanMs(sweep.phases)).toBeLessThan(CROWD_MIN * spanMs(PACE_RULES.find((r) => r.id === RULE.pieceAppear)!.phases));
  });
});

describe('milestones: a seat completes, a region clears (2026-10-13)', () => {
  const H = 3_600_000;
  /** A piece of `role` at `seat`, Ready from T0 and Accomplished from `closeAt` (h after T0) when given. */
  const piece = (n: number, role: 'objective' | 'threat', seat: CanonicalKey | null, closeAt?: number, rung: Signal['rung'] = 'accomplished'): PieceFacts => ({
    ...pieceFacts(wi(n), role, seat),
    signalAt: [{ from: T0, signal: READY }, ...(closeAt !== undefined ? [{ from: T0 + closeAt * H, signal: sig(rung) }] : [])],
  });
  const close = (n: number, role: 'objective' | 'threat'): Move => ({ m: 'climb', key: wi(n), role, from: sig('nearing'), to: sig('accomplished'), actor: ann });
  /** Facts with each close dated, as the round's own are. */
  const dated = (pieces: PieceFacts[], closes: [AnyTimelineEvent, Move[]][]): RoundFacts => ({
    ...board({ events: closes, pieces }).f, at: new Map(closes.map(([e]) => [e.eventKey, e.occurredAt])),
  });

  it('a seat completes on the close of its last open piece only, and an Off piece never holds it back', () => {
    const e1 = ev(1 * H, { key: 'm1' });
    const e2 = ev(2 * H, { key: 'm2' });
    const pieces = [piece(1, 'objective', ann, 1), piece(2, 'threat', ann, 2), piece(3, 'objective', ann, 0, 'off'), piece(4, 'objective', ben)];
    const f = dated(pieces, [[e1, [close(1, 'objective')]], [e2, [close(2, 'threat')]]]);
    expect(seatCompletedBy(close(1, 'objective'), e1, f)).toBeNull(); // the threat is still open
    expect(seatCompletedBy(close(2, 'threat'), e2, f)).toBe(ann); // Ben's open piece is his own
  });

  it('closes at one instant make one milestone, on the last event by key', () => {
    const a = ev(1 * H, { key: 'm1' });
    const b = ev(1 * H, { key: 'm2' });
    const f = dated([piece(1, 'objective', ann, 1), piece(2, 'objective', ann, 1)], [[a, [close(1, 'objective')]], [b, [close(2, 'objective')]]]);
    expect(seatCompletedBy(close(1, 'objective'), a, f)).toBeNull();
    expect(seatCompletedBy(close(2, 'objective'), b, f)).toBe(ann);
  });

  it('a region clears on its last open threat, read in the region the threat is in', () => {
    const e1 = ev(1 * H, { key: 'm1' });
    const e2 = ev(2 * H, { key: 'm2' });
    const here = dated([piece(1, 'threat', ann, 1), piece(2, 'threat', ben, 2), piece(3, 'objective', cy)], [[e1, [close(1, 'threat')]], [e2, [close(2, 'threat')]]]);
    expect(regionClearedBy(close(1, 'threat'), e1, here)).toBeNull();
    expect(regionClearedBy(close(2, 'threat'), e2, here)).toBe(here); // an open objective doesn't hold it
    expect(regionClearedBy(close(1, 'objective'), e1, here)).toBeNull(); // only a threat's close
    // A whole round's facts read each region's own: a threat open elsewhere doesn't hold this one back.
    const elsewhere = dated([piece(9, 'threat', cy)], []);
    const round: RoundFacts = { ...here, regions: new Map([['area:o:a' as CanonicalKey, here], ['area:o:b' as CanonicalKey, elsewhere]]) };
    expect(regionClearedBy(close(2, 'threat'), e2, round)).toBe(here);
    expect(regionClearedBy(close(5, 'threat'), e2, round)).toBeNull(); // in no region
  });

  it('each plays after the close that made it, protected, and the beat is essential', () => {
    const e = ev(1 * H, { key: 'm1', by: ann });
    const { h, beat } = board({ events: [[e, [close(1, 'threat')]]], pieces: [piece(1, 'threat', ann, 1)] });
    const f = dated([piece(1, 'threat', ann, 1)], [[e, [close(1, 'threat')]]]);
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(plan.map((m) => m.id)).toEqual([RULE.threatAccomplish, RULE.seatComplete, RULE.regionClear]);
    const [strike, seat, clear] = plan;
    expect(seat!.afterMs).toBe(strike!.durationMs);
    expect(clear!.afterMs).toBe(seat!.afterMs + seat!.durationMs);
    expect(seat!.cast).toEqual({ agent: [ann], seat: [ann], subject: [wi(1)] });
    expect(plan.every((m) => !!m.protect)).toBe(true);
    expect(shapeOf(h, [e], f).essential).toBe(true);
  });
});

describe('the merge and the beamed close (2026-10-12)', () => {
  const settle = (key: CanonicalKey, approvers: CanonicalKey[], by: CanonicalKey = ann): Move => ({ m: 'settle', key, facility: repo('r1'), to: sig('accomplished'), approvers, actor: by });
  // A story (wi 1) whose Task (wi 2) the PR links: the usual shape, the PR never links the story itself.
  const story = pieceFacts(wi(1), 'objective', ann);
  const task = { ...pieceFacts(wi(2), 'step', null), parent: wi(1) };
  const merged = (a: AttachmentFacts, at: number) => ({ ...a, signalAt: [{ from: T0 + at, signal: sig('accomplished') }] });

  it('a merge is cast with its author, approvers, facility, and the work it served (a Task stands in for its parent)', () => {
    const e = ev(3_600_000, { by: ben });
    const { h, f, beat } = board({
      events: [[e, [settle(pr(1), [ben, cy], ben)]]],
      pieces: [story, task],
      attachments: [attFacts(pr(1), repo('r1'), 0, ann, [wi(2)], [ben, cy])],
    });
    const [m] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(m).toMatchObject({ id: RULE.attachmentMerge, cast: { subject: [pr(1)], attachment: [pr(1)], facility: [repo('r1')], agent: [ann], support: [ben, cy], target: [wi(1)] } });
    expect(m!.protect?.keys).toContain(wi(1)); // the target is held: its own close waits for the merge
    expect(m!.variant).toBeUndefined();
  });

  it('a facility’s first merge in the round is the long variant; a later one is not', () => {
    const [e1, e2] = [ev(3_600_000, { by: ann }), ev(7_200_000, { by: ann })];
    const { h, f, beat } = board({
      events: [[e1, [settle(pr(1), [])]], [e2, [settle(pr(2), [])]]],
      attachments: [attFacts(pr(1), repo('r1'), 0, ann, []), attFacts(pr(2), repo('r1'), 0, ann, [])],
    });
    const facts = { ...f, firstMerge: firstMerges(h.events, (k) => f.moves.get(k)) };
    expect(facts.firstMerge.get(repo('r1'))).toBe(pr(1));
    const plan = planManeuvers(h, beat, facts, PACE_RULES, ENGAGEMENT.calm).filter((m) => m.id === RULE.attachmentMerge);
    expect(plan.map((m) => m.variant)).toEqual(['first', undefined]);
    // E4a: the transformation runs from the gather; the station fires (the charge after the land) as the longest one (4.4 s) ends.
    const first = plan[0]!.phases;
    const LINK_CHARGE_MS = 700; // fx/timing.ts: the station's charge after the land
    const at = (n: string) => first.find((p) => p.phase === n)!.durMs;
    expect(at('gather') + at('act') + at('land') + LINK_CHARGE_MS).toBeGreaterThanOrEqual(4400);
    expect(plan[0]!.durationMs).toBeLessThan(11100);
    expect(plan[0]!.durationMs).toBe(7900);
    expect(plan[1]!.afterMs).toBeGreaterThanOrEqual(plan[0]!.durationMs); // the same author: one after the other
  });

  it('a merge and the close of the work it served are one moment: the close lands at the beam’s impact (22 C4, M-23)', () => {
    const [closeE, mergeE] = [ev(3_600_000, { by: ann }), ev(3_600_000, { by: ann })];
    const close: Move = { m: 'climb', key: wi(1), role: 'objective', from: sig('nearing'), to: sig('accomplished'), actor: ann };
    const { h, f, beat } = board({
      events: [[closeE, [close]], [mergeE, [settle(pr(1), [ben])]]],
      pieces: [story, task],
      attachments: [merged(attFacts(pr(1), repo('r1'), 0, ann, [wi(2)], [ben]), 3_600_000)],
    });
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const m = plan.find((x) => x.id === RULE.attachmentMerge)!;
    const c = plan.find((x) => x.id === RULE.objectiveAccomplish)!;
    expect(m.afterMs).toBe(0); // the merge leads, whichever the pack wrote first
    const echo = m.phases.find((p) => p.phase === 'echo')!.atMs;
    expect(c.afterMs).toBe(m.afterMs + echo + ARC_IMPACT_MS); // inside it, at the impact
    expect(c.variant).toBe('arc');
    expect(c.phases.map((p) => p.phase)).toEqual(['land', 'echo', 'disperse']); // the turn, the glide, the blossom
    expect(c.cast.agent).toBeUndefined(); // no sortie of its own: the holder (Ann, the author) is in the formation
    expect(c.arc?.merge).toBe(mergeE.eventKey);
    expect(m.arc).toBeUndefined();
  });

  it('the holder of work closing in an arc flies into the merge’s formation, if not already in it (22 C4)', () => {
    const [mergeE, closeE] = [ev(3_600_000, { by: ann }), ev(3_600_000, { by: cy })];
    const close: Move = { m: 'climb', key: wi(1), role: 'objective', from: sig('nearing'), to: sig('accomplished'), actor: cy };
    const { h, f, beat } = board({
      events: [[mergeE, [settle(pr(1), [ben])]], [closeE, [close]]],
      pieces: [story, task],
      attachments: [merged(attFacts(pr(1), repo('r1'), 0, ann, [wi(2)], [ben]), 3_600_000)],
    });
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const m = plan.find((x) => x.id === RULE.attachmentMerge)!;
    expect(m.cast.support).toContain(cy);
    expect(m.arc?.holders).toEqual([cy]);
    expect(plan.find((x) => x.id === RULE.objectiveAccomplish)!.cast.agent).toBeUndefined();
  });

  it('a first merge has its facility to itself: a close it beams waits, though no one is in both (2026-10-13)', () => {
    // Someone else closes other work in the same beat, beamed by the same facility through a merge
    // from before the round: the close would land the facility's new form before the first merge's
    // transformation arms (a cut), so it waits for the merge.
    const [mergeE, closeE] = [ev(3_600_000, { by: ann }), ev(3_600_000, { by: cy })];
    const close: Move = { m: 'climb', key: wi(3), role: 'objective', from: sig('nearing'), to: sig('accomplished'), actor: cy };
    const make = (first: boolean) => {
      const b = board({
        events: [[mergeE, [settle(pr(1), [])]], [closeE, [close]]],
        pieces: [story, task, pieceFacts(wi(3), 'objective', cy)],
        attachments: [merged(attFacts(pr(1), repo('r1'), 0, ann, [wi(2)]), 3_600_000), merged(attFacts(pr(9), repo('r1'), -86_400_000, cy, [wi(3)]), -3_600_000)],
      });
      const f = first ? { ...b.f, firstMerge: new Map([[repo('r1'), pr(1)]]) } : b.f;
      const plan = planManeuvers(b.h, b.beat, f, PACE_RULES, ENGAGEMENT.calm);
      return { m: plan.find((x) => x.id === RULE.attachmentMerge)!, c: plan.find((x) => x.id === RULE.objectiveAccomplish)! };
    };
    const first = make(true);
    expect(first.m).toMatchObject({ variant: 'first', holds: [repo('r1')] });
    expect(first.c).toMatchObject({ variant: 'beamed', cast: { facility: [repo('r1')] } });
    // P3 (27 E4): they share no actor, so the close's tell and gather play in the merge's echo and disperse,
    // and its act starts when the merge ends.
    const tail = first.m.phases.filter((p) => p.phase === 'echo' || p.phase === 'disperse').reduce((n, p) => n + p.durMs, 0);
    expect(first.c.afterMs).toBe(first.m.durationMs - Math.min(tail, claimMs(first.c.phases)));
    expect(first.c.afterMs).toBe(seamStartMs(first.m.durationMs, tail, claimMs(first.c.phases)));
    expect(first.c.afterMs).toBeLessThan(first.m.durationMs);
    expect(first.c.afterMs + claimMs(first.c.phases)).toBeGreaterThanOrEqual(first.m.durationMs);
    // With the seams undone it starts when the merge ends.
    const flat = (() => {
      const b = board({
        events: [[mergeE, [settle(pr(1), [])]], [closeE, [close]]],
        pieces: [story, task, pieceFacts(wi(3), 'objective', cy)],
        attachments: [merged(attFacts(pr(1), repo('r1'), 0, ann, [wi(2)]), 3_600_000), merged(attFacts(pr(9), repo('r1'), -86_400_000, cy, [wi(3)]), -3_600_000)],
      });
      const plan = planManeuvers(b.h, b.beat, { ...b.f, firstMerge: new Map([[repo('r1'), pr(1)]]) }, PACE_RULES, ENGAGEMENT.calm, { sequence: { seams: false, near: true } });
      return { m: plan.find((x) => x.id === RULE.attachmentMerge)!, c: plan.find((x) => x.id === RULE.objectiveAccomplish)! };
    })();
    expect(flat.c.afterMs).toBe(flat.m.durationMs);
    // A later merge doesn't transform anything, so the close needn't wait for it.
    const later = make(false);
    expect(later.m.variant).toBeUndefined();
    expect(later.m.holds).toBeUndefined();
    expect(later.c.afterMs).toBe(0);
  });

  it('an attachment opened and merged in one beat: the facility jumps in, the tender launches, then the merge (2026-10-13)', () => {
    // It had played the merge first, at a facility that hadn't arrived: the jump-in, after it, showed
    // the facility already in its second form.
    const [openE, mergeE] = [ev(3_600_000, { by: ann }), ev(3_700_000, { by: ann })];
    const b = board({
      events: [[openE, [{ m: 'attach', key: pr(1), facility: repo('r1'), author: ann }]], [mergeE, [settle(pr(1), [])]]],
      pieces: [story, task],
      attachments: [merged(attFacts(pr(1), repo('r1'), 3_600_000, ann, [wi(2)]), 3_700_000)],
    });
    const f = { ...b.f, firstMerge: new Map([[repo('r1'), pr(1)]]) };
    const plan = planManeuvers(b.h, b.beat, f, PACE_RULES, ENGAGEMENT.calm);
    const [enter, open, merge] = [RULE.facilityEnter, RULE.attachmentOpen, RULE.attachmentMerge].map((id) => plan.find((m) => m.id === id)!) as [PlannedManeuver, PlannedManeuver, PlannedManeuver];
    expect(enter.afterMs).toBe(0);
    expect(open.afterMs).toBe(enter.durationMs);
    expect(merge).toMatchObject({ variant: 'first', afterMs: open.afterMs + open.durationMs });
  });

  it('a summon is a pass (27 F2): it holds no turn, and the same captain\'s next turn starts when its arrival ends', () => {
    const [openE, mergeE] = [ev(3_600_000, { by: ann }), ev(3_700_000, { by: ann })];
    const b = board({
      events: [[openE, [{ m: 'attach', key: pr(1), facility: repo('r1'), author: ann }]], [mergeE, [settle(pr(1), [])]]],
      pieces: [story, task],
      attachments: [merged(attFacts(pr(1), repo('r1'), 3_600_000, ann, [wi(2)]), 3_700_000)],
    });
    const plan = planManeuvers(b.h, b.beat, { ...b.f, firstMerge: new Map([[repo('r1'), pr(1)]]) }, PACE_RULES, ENGAGEMENT.calm);
    const [enter, open] = [RULE.facilityEnter, RULE.attachmentOpen].map((id) => plan.find((m) => m.id === id)!) as [PlannedManeuver, PlannedManeuver];
    expect(enter.phases.map((p) => [p.phase, p.durMs])).toEqual([['gather', 715], ['act', 1200]]);
    expect(enter.durationMs).toBe(1915);
    expect(open.afterMs).toBe(enter.durationMs);
    expect(open.afterMs).toBeGreaterThanOrEqual(enter.afterMs + 1915);
    // The ship is released as it passes, at the blip; the plate unfurls there, stays whole for the note, then folds.
    expect(crewTimes(enter.phases, true)).toEqual({ openMs: 715, closeMs: 715 + CREW_FOLD_MS + NOTE_MIN_MS, leaveMs: 715 });
    expect(releaseOfPlay(enter)).toBe(715);
    // The same phases as a parked turn would hold the ship through the hold and the fold.
    expect(crewTimes(enter.phases).leaveMs).toBeGreaterThan(crewTimes(enter.phases, true).leaveMs);
  });

  it('a facility’s first merge is its first in the round: one before the round transforms nothing now (2026-10-13)', () => {
    const [before, during, later] = [ev(-86_400_000), ev(3_600_000), ev(7_200_000)];
    const moves = new Map([[before.eventKey, [settle(pr(1), [])]], [during.eventKey, [settle(pr(2), [])]], [later.eventKey, [settle(pr(3), [])]]]);
    const events = [before, during, later];
    expect(firstMerges(events, (k) => moves.get(k)).get(repo('r1'))).toBe(pr(1)); // the whole history
    expect(firstMerges(events, (k) => moves.get(k), ROUND).get(repo('r1'))).toBe(pr(2));
    expect(firstMerges([before], (k) => moves.get(k), ROUND).has(repo('r1'))).toBe(false);
  });

  it('a close its merged work went to is beamed by those facilities; one with no merge is not', () => {
    const e = ev(3_600_000, { by: ann });
    const close: Move = { m: 'climb', key: wi(1), role: 'objective', from: sig('nearing'), to: sig('accomplished'), actor: ann };
    const withMerge = board({ events: [[e, [close]]], pieces: [story, task], attachments: [merged(attFacts(pr(1), repo('r1'), 0, ann, [wi(2)]), 1000)] });
    const [m] = planManeuvers(withMerge.h, withMerge.beat, withMerge.f, PACE_RULES, ENGAGEMENT.calm);
    expect(m).toMatchObject({ id: RULE.objectiveAccomplish, variant: 'beamed', cast: { facility: [repo('r1')] } });
    expect(mergedBacking(withMerge.f, wi(1), T0 + 3_600_000).facilities).toEqual([repo('r1')]);
    // Open but not merged by then: no beam.
    const open = board({ events: [[e, [close]]], pieces: [story, task], attachments: [attFacts(pr(1), repo('r1'), 0, ann, [wi(2)])] });
    const [n] = planManeuvers(open.h, open.beat, open.f, PACE_RULES, ENGAGEMENT.calm);
    expect(n!.variant).toBeUndefined();
    expect(n!.cast.facility).toBeUndefined();
    expect(m!.durationMs).toBeGreaterThan(n!.durationMs);
  });
});

describe('planManeuvers', () => {
  it('casts a defeat with the fix’s reviewers and facility, seeds it from the event, and protects its actors', () => {
    const e = ev(3_600_000, { by: ann });
    const { h, f, beat } = board({
      events: [[e, [{ m: 'climb', key: wi(5), role: 'threat', from: sig('nearing'), to: sig('accomplished'), actor: ann }]]],
      pieces: [pieceFacts(wi(5), 'threat', ann)],
      attachments: [attFacts(pr(1), repo('r1'), 0, ann, [wi(5)], [ann, ben, cy])],
    });
    const [m, ...rest] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(rest).toEqual([]);
    expect(m).toMatchObject({
      id: RULE.threatAccomplish, eventKey: e.eventKey, seed: fnv1a32(e.eventKey), afterMs: 0,
      cast: { subject: [wi(5)], agent: [ann], support: [ben, cy], seat: [ann], facility: [repo('r1')] },
      from: sig('nearing'), to: sig('accomplished'),
    });
    // As long as its phases, or the crew's turn when longer (22 B9: open a second after the work, folded, then away).
    const phs = PACE_RULES.find((r) => r.id === RULE.threatAccomplish)!.phases;
    expect(m!.durationMs).toBe(Math.max(spanMs(phs), crewTimes(phs).leaveMs));
    expect(m!.protect).toEqual({ keys: [ann, ben, cy, wi(5)].sort(), windowMs: m!.durationMs });
    expect(m!.keys).toEqual([ann, ben, cy, repo('r1'), wi(5)].sort());
  });

  it('a move of a protected moment’s cast waits for it; unrelated work plays alongside', () => {
    const land = ev(0, { by: ann });
    const reseat = ev(0, { by: cy });
    const other = ev(0, { by: dee });
    const { h, f, beat } = board({
      events: [
        [land, [{ m: 'climb', key: wi(1), role: 'objective', from: sig('nearing'), to: sig('accomplished'), actor: ann }]],
        [reseat, [{ m: 'reseat', key: wi(1), role: 'objective', from: ann, to: ben, actor: cy }]],
        [other, [{ m: 'climb', key: wi(2), role: 'objective', from: READY, to: sig('underway'), actor: dee }]],
      ],
      pieces: [pieceFacts(wi(1), 'objective', ann), pieceFacts(wi(2), 'objective', dee)],
    });
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const [l, r, o] = plan;
    expect(plan.map((m) => m.id)).toEqual([RULE.objectiveAccomplish, RULE.pieceReseat, RULE.objectiveUnderway]);
    expect(r!.afterMs).toBe(l!.durationMs);
    expect(r!.cast.frontier).toBeUndefined();
    expect(o!.afterMs).toBe(0);
    expect(shapeOf(h, beat.eventKeys.map((k) => h.events.find((e) => e.eventKey === k)! as AnyTimelineEvent), f)).toEqual({
      afterMs: new Map([[reseat.eventKey, l!.durationMs]]), durationMs: l!.durationMs + r!.durationMs, essential: true,
    });
  });

  it('a reassign is a hand-off: the new holder meets the piece, and whoever made the change stays free (22 C7, M-24)', () => {
    const give = ev(0, { by: cy });
    const own = ev(0, { by: cy });
    const { h, f, beat } = board({
      events: [
        [give, [{ m: 'reseat', key: wi(1), role: 'objective', from: ann, to: ben, actor: cy }]],
        [own, [{ m: 'climb', key: wi(3), role: 'objective', from: READY, to: sig('underway'), actor: cy }]],
      ],
      pieces: [pieceFacts(wi(1), 'objective', ann), pieceFacts(wi(3), 'objective', cy)],
    });
    const [handOff, work] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(handOff!.cast.agent).toEqual([ben]);
    expect(handOff!.cast.toSeat).toEqual([ben]);
    expect(work!.afterMs).toBe(0); // Cy's own work isn't held back by the change Cy made
    // Unassigned: no one takes it, so no ship.
    const drop = ev(0, { by: cy });
    const b = board({ events: [[drop, [{ m: 'reseat', key: wi(2), role: 'threat', from: ann, to: null, actor: cy }]]], pieces: [pieceFacts(wi(2), 'threat', ann)] });
    expect(planManeuvers(b.h, b.beat, b.f, PACE_RULES, ENGAGEMENT.calm)[0]!.cast.agent).toBeUndefined();
  });

  it('an abandoned attachment holds no turn: its author’s next work plays alongside (22 C7, P-16)', () => {
    expect((PACE_RULES.find((r) => r.id === RULE.attachmentSettle) as PaceRule).turn).toBe(false);
    const gone = ev(0, { by: ann });
    const next = ev(0, { by: ann });
    const { h, f, beat } = board({
      events: [
        [gone, [{ m: 'settle', key: pr(1), facility: repo('r1'), to: sig('off', { ghost: true }), approvers: [], actor: ann }]],
        [next, [{ m: 'climb', key: wi(1), role: 'objective', from: READY, to: sig('underway'), actor: ann }]],
      ],
      pieces: [pieceFacts(wi(1), 'objective', ann)],
      attachments: [attFacts(pr(1), repo('r1'), -3_600_000, ann, [wi(1)])],
    });
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(plan.map((m) => m.id)).toEqual([RULE.attachmentSettle, RULE.objectiveUnderway]);
    expect(plan[1]!.afterMs).toBe(0);
  });

  it('one captain does one thing at a time: their maneuvers in a beat play one after another, others alongside (22 A11)', () => {
    const a = ev(0, { by: cy });
    const b = ev(0, { by: cy });
    const c = ev(0, { by: dee });
    const { h, f, beat } = board({
      events: [
        [a, [{ m: 'climb', key: wi(1), role: 'objective', from: READY, to: sig('underway'), actor: cy }]],
        [b, [{ m: 'climb', key: wi(2), role: 'objective', from: READY, to: sig('underway'), actor: cy }]],
        [c, [{ m: 'climb', key: wi(3), role: 'objective', from: READY, to: sig('underway'), actor: dee }]],
      ],
      pieces: [pieceFacts(wi(1), 'objective', cy), pieceFacts(wi(2), 'objective', cy), pieceFacts(wi(3), 'objective', dee)],
    });
    const [first, second, theirs] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    // P4 (27 E4): the second sets off as the first's ship leaves, so its tell plays in the first's fold.
    const gatherAt = (m: PlannedManeuver) => m.phases.find((p) => p.phase === 'gather')!.atMs;
    expect([first!.afterMs, second!.afterMs, theirs!.afterMs]).toEqual([0, crewTimes(first!.phases).leaveMs - gatherAt(second!), 0]);
    expect(second!.afterMs + gatherAt(second!)).toBe(first!.durationMs);
    // The beat is as long as Cy's two, the second starting as the first's ship leaves.
    const events = beat.eventKeys.map((k) => h.events.find((e) => e.eventKey === k)! as AnyTimelineEvent);
    expect(shapeOf(h, events, f).durationMs).toBe(second!.afterMs + second!.durationMs);
    // With the stay-near overlap undone it is the old one-after-another.
    const [f1, f2] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm, { sequence: { seams: true, near: false } });
    expect(f2!.afterMs).toBe(f1!.durationMs);
    expect(shapeOf(h, events, f, PACE_RULES, undefined, undefined, { seams: true, near: false }).durationMs).toBe(f1!.durationMs + f2!.durationMs);
  });

  it('attention is budgeted: at most four labels at once, pieces and named captains, the rest when room frees (22 B7, C10)', () => {
    expect(ATTENTION_MAX).toBe(4);
    const people = [ann, ben, cy, dee];
    const events = people.map((p) => ev(0, { by: p }));
    const { h, f, beat } = board({
      events: events.map((e, i) => [e, [{ m: 'climb', key: wi(i + 1), role: 'objective', from: READY, to: sig('underway'), actor: people[i]! }]] as [AnyTimelineEvent, Move[]]),
      pieces: people.map((p, i) => pieceFacts(wi(i + 1), 'objective', p)),
    });
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const held = (m: PlannedManeuver) => Math.max(m.durationMs, NOTE_MIN_MS);
    // Each lights its piece and, when its captain flies to it, names them too.
    const labels = (m: PlannedManeuver) => Math.min(ATTENTION_MAX, 1 + (m.phases.some((p) => p.phase === 'gather') ? (m.cast.agent?.length ?? 0) + (m.cast.support?.length ?? 0) : 0));
    expect(plan.map(labels)).toEqual([2, 2, 2, 2]); // a sortie names its captain: two interactions fill the budget
    // A wait sets off early (27 E2): it travels while the places are taken and claims them at its act.
    expect(plan.map((m) => m.afterMs)).toEqual([0, 0, held(plan[0]!) - claimMs(plan[2]!.phases), held(plan[1]!) - claimMs(plan[3]!.phases)]);
    // Never more than four labels at any instant (a maneuver's places are its claim window), and the beat is as long as the queue.
    const win = (m: PlannedManeuver) => [m.afterMs + claimMs(m.phases), m.afterMs + held(m)] as const;
    for (const m of plan) expect(plan.filter((o) => win(o)[0] <= win(m)[0] && win(m)[0] < win(o)[1]).reduce((n, o) => n + labels(o), 0)).toBeLessThanOrEqual(ATTENTION_MAX);
    expect(shapeOf(h, events, f).durationMs).toBe(Math.max(...plan.map((m) => m.afterMs + m.durationMs)));
  });

  it('a merge serving two pieces lights both plates: it takes both places, and other work waits (review)', () => {
    const merge = ev(0, { by: ann });
    const other = ev(0, { by: dee });
    const { h, f, beat } = board({
      events: [
        [merge, [{ m: 'settle', key: pr(1), facility: repo('r1'), to: sig('accomplished'), approvers: [], actor: ann }]],
        [other, [{ m: 'climb', key: wi(3), role: 'objective', from: READY, to: sig('underway'), actor: dee }]],
      ],
      pieces: [pieceFacts(wi(1), 'objective', ann), pieceFacts(wi(2), 'threat', ann), pieceFacts(wi(3), 'objective', dee)],
      attachments: [attFacts(pr(1), repo('r1'), -1, ann, [wi(1), wi(2)])],
    });
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const m = plan.find((x) => x.id === RULE.attachmentMerge)!;
    const o = plan.find((x) => x.id === RULE.objectiveUnderway)!;
    expect(m.cast.target).toEqual([wi(1), wi(2)]);
    expect(o.afterMs).toBe(Math.max(m.durationMs, NOTE_MIN_MS) - claimMs(o.phases)); // it sets off to arrive as the places free (27 E2)
  });

  it('a beat holds its last note long enough to read (22 B7)', () => {
    const e = ev(0, { by: null });
    const { h, f } = board({
      events: [[e, [{ m: 'appear', key: wi(1), role: 'objective', to: READY, seat: null }]]],
      pieces: [pieceFacts(wi(1), 'objective', null)],
    });
    expect(shapeOf(h, [e], f).durationMs).toBeGreaterThanOrEqual(NOTE_MIN_MS);
  });

  it('the budget keeps one captain’s queue in order: a person’s second waits for their first, wherever a place frees (22 A11, B7)', () => {
    const people = [ann, ben, cy];
    const events = [ev(0, { by: ann }), ev(0, { by: ben }), ev(0, { by: cy }), ev(0, { by: ann })];
    const { h, f, beat } = board({
      events: events.map((e, i) => [e, [{ m: 'climb', key: wi(i + 1), role: 'objective', from: READY, to: sig('underway'), actor: [...people, ann][i]! }]] as [AnyTimelineEvent, Move[]]),
      pieces: events.map((_, i) => pieceFacts(wi(i + 1), 'objective', [...people, ann][i]!)),
    });
    const [a1, b1, c1, a2] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const held = (m: PlannedManeuver) => Math.max(m.durationMs, NOTE_MIN_MS);
    expect(a2!.afterMs + a2!.phases.find((p) => p.phase === 'gather')!.atMs).toBeGreaterThanOrEqual(a1!.afterMs + crewTimes(a1!.phases).leaveMs); // Ann's second sets off after her first's ship has left (P4)
    const all = [a1!, b1!, c1!, a2!];
    const win = (m: PlannedManeuver) => [m.afterMs + claimMs(m.phases), m.afterMs + held(m)] as const;
    for (const m of all) expect(all.filter((o) => win(o)[0] <= win(m)[0] && win(m)[0] < win(o)[1]).length).toBeLessThanOrEqual(2);
  });

  it('labels on arrival, travel is free: a maneuver whose labels do not fit starts its gather on time and claims its slots at its act (27 E2)', () => {
    const people = [ann, ben, cy, dee];
    const events = people.map((p) => ev(0, { by: p }));
    const { h, f, beat } = board({
      events: events.map((e, i) => [e, [{ m: 'climb', key: wi(i + 1), role: 'objective', from: READY, to: sig('underway'), actor: people[i]! }]] as [AnyTimelineEvent, Move[]]),
      pieces: people.map((p, i) => pieceFacts(wi(i + 1), 'objective', p)),
    });
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    const held = (m: PlannedManeuver) => Math.max(m.durationMs, NOTE_MIN_MS);
    const win = (m: PlannedManeuver) => [m.afterMs + claimMs(m.phases), m.afterMs + held(m)] as const;
    const labels = (m: PlannedManeuver) => Math.min(ATTENTION_MAX, 1 + (m.cast.agent?.length ?? 0) + (m.cast.support?.length ?? 0));
    // (a) the first two fill the four places and start at once.
    expect([plan[0]!.afterMs, plan[1]!.afterMs]).toEqual([0, 0]);
    // (b) the third sets off while all four are taken; its act begins as they free.
    expect(plan[2]!.afterMs).toBe(held(plan[0]!) - claimMs(plan[2]!.phases));
    expect(plan[2]!.afterMs).toBeGreaterThan(0);
    expect(plan[2]!.afterMs).toBeLessThan(held(plan[0]!));
    // (c) it claims its places exactly when the first frees.
    expect(win(plan[2]!)[0]).toBe(held(plan[0]!));
    // (d) never more than four labels at once.
    for (const m of plan) expect(plan.filter((o) => win(o)[0] <= win(m)[0] && win(m)[0] < win(o)[1]).reduce((n, o) => n + labels(o), 0)).toBeLessThanOrEqual(ATTENTION_MAX);
    // claimMs is the act's start, or 0 with no act.
    expect(claimMs(plan[2]!.phases)).toBe(plan[2]!.phases.find((p) => p.phase === 'act')!.atMs);
    expect(claimMs([])).toBe(0);
  });

  it('a crowd of arrivals asks for no attention: it comes in quietly, together (22 B7)', () => {
    const events = Array.from({ length: CROWD_MIN }, () => ev(0, { by: null }));
    const { h, f, beat } = board({
      events: events.map((e, i) => [e, [{ m: 'appear', key: wi(i + 1), role: 'objective', to: READY, seat: null }]] as [AnyTimelineEvent, Move[]]),
      pieces: events.map((_, i) => pieceFacts(wi(i + 1), 'objective', null)),
    });
    // With the sector sweep (27 E7, M-32; this test moved with E7a): the crowd plays as one sweep at 0.
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(plan.map((m) => m.id)).toEqual([RULE.regionSweep]);
    expect(plan[0]!.afterMs).toBe(0);
    expect(plan[0]!.sweep!.members).toEqual(events.map((e) => e.eventKey));
    // Without it (the ledger's "before"), the crowd still comes in quietly, together.
    const crowd = planManeuvers(h, beat, f, PACE_RULES.filter((r) => r.id !== RULE.regionSweep), ENGAGEMENT.calm);
    expect(crowd.length).toBe(CROWD_MIN);
    expect(new Set(crowd.map((m) => m.afterMs))).toEqual(new Set([0]));
  });

  it('two protected moments that share an actor play one after the other', () => {
    const a = ev(0, { by: ann });
    const b = ev(0, { by: ann });
    const { h, f, beat } = board({
      events: [
        [a, [{ m: 'climb', key: wi(1), role: 'objective', from: sig('nearing'), to: sig('accomplished'), actor: ann }]],
        [b, [{ m: 'climb', key: wi(2), role: 'threat', from: sig('nearing'), to: sig('accomplished'), actor: ann }]],
      ],
    });
    const [x, y] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(y!.afterMs).toBe(x!.durationMs);
  });

  it('an attachment opens once its facility has entered', () => {
    const e = ev(3_600_000, { by: ann });
    const { h, f, beat } = board({
      events: [[e, [{ m: 'attach', key: pr(2), facility: repo('r1'), author: ann }]]],
      attachments: [attFacts(pr(2), repo('r1'), 3_600_000, ann, [wi(1)])],
      pieces: [pieceFacts(wi(1), 'objective', ann)],
    });
    const [enter, open] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(enter).toMatchObject({ id: RULE.facilityEnter, afterMs: 0, cast: { subject: [repo('r1')], facility: [repo('r1')], agent: [ann], seat: [ann] } });
    expect(open).toMatchObject({ id: RULE.attachmentOpen, afterMs: enter!.durationMs, cast: { subject: [pr(2)], attachment: [pr(2)] } });
  });

  it('a landed settle is protected for its author and approvers; a dropped one is not', () => {
    const e1 = ev(0, { by: ann });
    const e2 = ev(0, { by: cy });
    const { h, f, beat } = board({
      events: [
        [e1, [{ m: 'settle', key: pr(1), facility: repo('r1'), to: sig('accomplished'), approvers: [ben], actor: ann }]],
        [e2, [{ m: 'settle', key: pr(2), facility: repo('r1'), to: sig('off', { ghost: true }), approvers: [], actor: cy }]],
      ],
      attachments: [attFacts(pr(1), repo('r1'), -1, ann, []), attFacts(pr(2), repo('r1'), -1, cy, [])],
    });
    const [landed, dropped] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(landed!.protect?.keys).toEqual([ann, ben, pr(1)].sort());
    expect(dropped!.protect).toBeUndefined();
    expect(dropped!.afterMs).toBe(0); // it shares no actor with the merge
  });

  it('is deterministic: the same plan twice, and whatever order the facts were built in', () => {
    const events: [AnyTimelineEvent, Move[]][] = [
      [ev(0, { by: ann }), [{ m: 'attach', key: pr(7), facility: repo('r2'), author: ann }]],
      [ev(0, { by: ben }), [{ m: 'climb', key: wi(3), role: 'threat', from: sig('nearing'), to: sig('accomplished'), actor: ben }]],
      [ev(0, { by: cy }), [{ m: 'reseat', key: wi(3), role: 'threat', from: ben, to: null, actor: cy }]],
    ];
    const pieces = [pieceFacts(wi(3), 'threat', ben), pieceFacts(wi(4), 'objective', ann)];
    const attachments = [attFacts(pr(7), repo('r2'), 0, ann, [wi(3), wi(4)], [cy, ann]), attFacts(pr(8), repo('r2'), 0, ben, [wi(3)], [ann])];
    const one = board({ events, pieces, attachments });
    const two = board({ events, pieces: [...pieces].reverse(), attachments: [...attachments].reverse() });
    const a = planManeuvers(one.h, one.beat, one.f, PACE_RULES, ENGAGEMENT.maximum);
    expect(planManeuvers(one.h, one.beat, one.f, PACE_RULES, ENGAGEMENT.maximum)).toEqual(a);
    expect(planManeuvers(two.h, two.beat, two.f, PACE_RULES, ENGAGEMENT.maximum)).toEqual(a);
    expect(a.find((m) => m.id === RULE.pieceReseat)!.cast.frontier).toEqual([wi(3)]);
    // pr(7) and pr(8) open at the same instant: the lower key brings the facility in.
    expect(a.find((m) => m.id === RULE.facilityEnter)?.eventKey).toBe(events[0]![0].eventKey);
  });

  it('light maneuvers: none when calm; capped and staggered when lively; only where nothing else plays', () => {
    const climbs: [AnyTimelineEvent, Move[]][] = [1, 2, 3, 4, 5].map((n) => [ev(0, { by: ann, priority: 'mediumGroup' }), [{ m: 'climb', key: wi(n), role: 'step', from: READY, to: sig('accomplished'), actor: ann }]]);
    const low: [AnyTimelineEvent, Move[]] = [ev(0, { by: ann, priority: 'low' }), [{ m: 'retitle', key: wi(1) }]];
    const pieces = [1, 2, 3, 4, 5].map((n) => pieceFacts(wi(n), 'step', ben));
    const { h, f, beat } = board({ events: [low, ...climbs], pieces });
    const quiet = { ...beat, accented: false, durationMs: 0 };
    expect(planManeuvers(h, quiet, f, PACE_RULES, ENGAGEMENT.calm)).toEqual([]);
    const lively = planManeuvers(h, quiet, f, PACE_RULES, ENGAGEMENT.lively);
    expect(lively.map((m) => m.id)).toEqual([RULE.agentLight, RULE.agentLight, RULE.agentLight]);
    expect(lively.map((m) => m.afterMs)).toEqual([0, 300, 600]);
    expect(lively[0]!.cast).toEqual({ subject: [wi(1)], agent: [ann], support: [ben], seat: [ben] }); // the step's seat holder is the other hand; its planet, for the approach (22 A10)
    expect(lively.every((m) => !m.protect)).toBe(true);
    expect(planManeuvers(h, quiet, f, PACE_RULES, ENGAGEMENT.maximum)).toHaveLength(5);
    // An accented beat: the landing plays; the steps beside it get light maneuvers, but only for someone
    // the landing doesn't already fly (22 A11): Dee's do, Ann's (she lands it) don't.
    const land: [AnyTimelineEvent, Move[]] = [ev(0, { by: ann }), [{ m: 'climb', key: wi(9), role: 'objective', from: sig('nearing'), to: sig('accomplished'), actor: ann }]];
    const hers: [AnyTimelineEvent, Move[]][] = [6, 7].map((n) => [ev(0, { by: dee, priority: 'mediumGroup' }), [{ m: 'climb', key: wi(n), role: 'step', from: READY, to: sig('accomplished'), actor: dee }]]);
    const mixed = board({ events: [land, ...climbs.slice(0, 2), ...hers], pieces: [...pieces, ...[6, 7].map((n) => pieceFacts(wi(n), 'step', cy))] });
    const plan = planManeuvers(mixed.h, mixed.beat, mixed.f, PACE_RULES, ENGAGEMENT.lively);
    expect(plan.map((m) => m.id)).toEqual([RULE.objectiveAccomplish, RULE.agentLight, RULE.agentLight]);
    expect(plan.slice(1).map((m) => m.cast.agent)).toEqual([[dee], [dee]]);
    expect(planManeuvers(mixed.h, mixed.beat, mixed.f, PACE_RULES, ENGAGEMENT.calm).map((m) => m.id)).toEqual([RULE.objectiveAccomplish]);
    // And light work never sizes a beat.
    expect(shapeOf(mixed.h, mixed.h.events as AnyTimelineEvent[], mixed.f).durationMs).toBe(plan[0]!.durationMs);
  });

  it('with no light rule in the table, unaccented beats play nothing', () => {
    const e = ev(0, { by: ann });
    const { h, f, beat } = board({ events: [[e, [{ m: 'climb', key: wi(1), role: 'step', from: READY, to: sig('underway'), actor: ann }]]] });
    const noLight = PACE_RULES.filter((r: PaceRule) => !r.light);
    expect(planManeuvers(h, { ...beat, accented: false }, f, noLight, ENGAGEMENT.maximum)).toEqual([]);
  });
});

// ---- Whole schedules, through a test adapter over the v0 scenarios ----

/** Just enough of an SDLC reading to drive the planner: the real adapter is W1-T1's. */
const testAdapter: EventAdapter = {
  id: 'test',
  moves(h, e) {
    const m = h.stateMapping;
    const typeOf = (key: CanonicalKey) => h.entities.workItems.find((w) => w.key === key)?.type ?? '';
    const roleOf = (key: CanonicalKey) => resolveRole(m, typeOf(key)) ?? 'objective';
    switch (e.kind) {
      case 'wi_created': return [{ m: 'appear', key: e.entityKey, role: resolveRole(m, e.payload.type) ?? 'objective', to: resolveSignal(m, e.payload.type, e.payload.state), seat: e.payload.assigneeKey }];
      case 'wi_state_changed': {
        const t = typeOf(e.entityKey);
        return [{ m: 'climb', key: e.entityKey, role: roleOf(e.entityKey), from: resolveSignal(m, t, e.payload.from), to: resolveSignal(m, t, e.payload.to), actor: e.changedBy ?? null }];
      }
      case 'wi_assignee_changed': return [{ m: 'reseat', key: e.entityKey, role: roleOf(e.entityKey), from: e.payload.from, to: e.payload.to, actor: e.changedBy ?? null }];
      case 'wi_title_changed': return [{ m: 'retitle', key: e.entityKey }];
      case 'link_parent_added': return [{ m: 'bind', child: e.payload.childKey, parent: e.payload.parentKey, rel: roleOf(e.payload.childKey) === 'step' ? 'step' : 'container' }];
      case 'link_pr_added': return [{ m: 'bind', child: e.payload.prKey, parent: e.payload.itemKey, rel: 'attachment' }];
      case 'pr_opened': return [{ m: 'attach', key: e.entityKey, facility: e.payload.repoKey, author: e.payload.authorKey }];
      case 'pr_completed': return [{ m: 'settle', key: e.entityKey, facility: e.payload.repoKey, to: attachmentSignal(m, 'completed'), approvers: e.payload.approvedBy ?? [], actor: e.changedBy ?? null }];
      case 'pr_abandoned': return [{ m: 'settle', key: e.entityKey, facility: e.payload.repoKey, to: attachmentSignal(m, 'abandoned'), approvers: [], actor: e.changedBy ?? null }];
      default: return [];
    }
  },
  describe: () => ({}) as never,
};
const testPack = { id: 'test', title: 'Test', words: {} as never, adapter: testAdapter, thresholds: { swiftDays: 3, wipK: 2, dayHours: 12 } } satisfies DomainPack;

describe('paced schedules (every v0 scenario, through a test adapter)', () => {
  it.each(scenarios.map((s) => s.name))('%s: beats fit their maneuvers and the budget, protects stay inside, and plans repeat', (name) => {
    const s = scenarios.find((x) => x.name === name)!;
    const h = historyOf(s);
    const f = scheduleFacts(h, testPack);
    const sch = buildBeatSchedule(h, h.range, s.tz, pacing(testPack));
    // The renderer plans each beat with the schedule's limelight (22 C6), as the beat was shaped.
    const ll = sch.limelight ? { limelight: sch.limelight } : {};
    // As v0's busy-week: High beats are never cut. Merges are protected and long (decided 2026-10-12),
    // so an episode with many runs past the budget by about their length.
    const planned = sch.beats.flatMap((b) => planManeuvers(h, b, f, PACE_RULES, ENGAGEMENT.maximum, ll));
    const mergeMs = planned.filter((m) => m.id === RULE.attachmentMerge).reduce((t, m) => t + m.durationMs, 0);
    // The beats the budget can't cut (High, or holding a protected moment) are longer by their flying
    // crews' turns (22 B9: open a second after the work, folded, then away).
    const holdMs = sch.beats.filter((b) => b.priority === 'high' || planManeuvers(h, b, f, PACE_RULES, ENGAGEMENT.maximum, ll).some((m) => m.protect))
      .flatMap((b) => planManeuvers(h, b, f, PACE_RULES, ENGAGEMENT.maximum, ll)).filter((m) => m.id !== RULE.attachmentMerge && m.id !== RULE.agentLight)
      .reduce((t, m) => t + m.durationMs - spanMs(m.phases), 0);
    expect(sch.totalMs).toBeLessThanOrEqual(DESKTOP.pacing.budgetMs * 1.1 + mergeMs + holdMs);
    let protects = 0;
    for (const b of sch.beats) {
      expect(b.durationMs).toBeLessThanOrEqual(DESKTOP.pacing.budgetMs);
      const plan = planManeuvers(h, b, f, PACE_RULES, ENGAGEMENT.maximum, ll);
      expect(planManeuvers(h, b, f, PACE_RULES, ENGAGEMENT.maximum, ll)).toEqual(plan);
      for (const m of plan) {
        if (m.id === RULE.agentLight) continue;
        expect(b.accented).toBe(true);
        expect(m.afterMs + m.durationMs).toBeLessThanOrEqual(b.durationMs);
        if (m.protect) {
          protects++;
          expect(m.afterMs + m.protect.windowMs).toBeLessThanOrEqual(b.durationMs);
        }
      }
      if (b.accented) expect(plan.some((m) => m.id !== RULE.agentLight)).toBe(true);
    }
    if (name === 'orbit-week' || name === 'busy-week') expect(protects).toBeGreaterThan(0);
  });

  it('the pack’s own priority, when its adapter has one, drives the schedule', () => {
    const s = scenarios[0]!;
    const h = historyOf(s);
    const hush = { ...testPack, id: 'hush', adapter: { ...testAdapter, priority: () => 'low' as const } } satisfies DomainPack;
    const sch = buildBeatSchedule(h, h.range, s.tz, pacing(hush));
    expect(sch.beats.every((b) => !b.accented)).toBe(true);
    const loud = buildBeatSchedule(h, h.range, s.tz, pacing(testPack));
    expect(loud.beats.some((b) => b.accented)).toBe(true);
  });

  it('the schedule facts fold attachments, links and approvers from the moves, once per bundle', () => {
    const s = scenarios[0]!;
    const h = historyOf(s);
    const f = scheduleFacts(h, testPack);
    expect(scheduleFacts(h, testPack)).toBe(f);
    expect(f.moves.size).toBeGreaterThan(0); // board moves only, as roundFacts (23 D3)
    const merged = [...f.attachments.values()].filter((a) => a.open.to !== null && a.approvers.length);
    expect(merged.length).toBeGreaterThan(0);
    expect([...f.attachments.values()].some((a) => a.links.length > 0)).toBe(true);
    for (const a of f.attachments.values()) expect(a.links).toEqual([...a.links].sort());
  });
});

describe('one facts view (23 D3)', () => {
  it.each(scenarios.map((s) => s.name))('%s: the schedule reads the same fold roundFacts builds, never a coarser copy', (name) => {
    const h = historyOf(scenarios.find((x) => x.name === name)!);
    const pack = packFor(h);
    const sector = h.scope.sector;
    const whole = roundFacts(h, { level: 'sector', key: sector.kind === 'sprint' ? sector.iterationKey : ('' as CanonicalKey) }, pack);
    const sf = scheduleFacts(h, pack);
    expect(sf).toBe(whole); // one object: nothing to drift
    // Pacing's facts are that object's board, plus each pod's own for a round.
    const pf = paceFacts(h);
    for (const [k, p] of sf.pieces) if (pf.pieces.has(k)) expect(pf.pieces.get(k)!.role).toBe(p.role);
    expect([...pf.moves.keys()].every((k) => sf.moves.has(k))).toBe(true);
    expect([...pf.attachments.keys()].every((k) => sf.attachments.has(k))).toBe(true);
  });
});

describe('All events (23 D1)', () => {
  it('no cap: every beat the budget cut is accented again, at the same beat for the playhead’s source time', () => {
    for (const s of scenarios) {
      const h = historyOf(s);
      const base = buildBeatSchedule(h, h.range, s.tz, pacing(testPack));
      const all = buildBeatSchedule(h, h.range, s.tz, { ...pacing(testPack), budgetMs: Infinity });
      expect(all.beats.length).toBe(base.beats.length);
      for (const b of base.beats) if (b.accented) expect(all.beats[b.index]!.accented).toBe(true);
      // Silent only by rule: Low, or nothing to play (a zero-length shape), never for length.
      expect(all.beats.filter((b) => !b.accented).every((b) => b.priority === 'low' || b.durationMs === 0)).toBe(true);
      const mid = base.beats[Math.floor(base.beats.length / 2)]?.sourceUtc;
      if (mid !== undefined) {
        const at = (sc: typeof base) => sc.beats.findIndex((b) => b.sourceUtc >= mid);
        expect(at(all)).toBe(at(base));
      }
    }
  });

  it('on the Halcyon scenes (a busy round and its pods) it accents more beats than the default, never fewer', () => {
    const tz = 'America/Los_Angeles';
    let more = 0;
    for (const scope of sprintScopes(halcyon as never)) {
      const h = storyTime(toHistory(halcyon as never, mapping, scope), tz).history;
      const sc = h.scope.sector as { iterationKey: CanonicalKey; pods: { areaKey: CanonicalKey }[] };
      const scenes = [SOLAR.format({ level: 'sprint', key: sc.iterationKey }), ...sc.pods.map((p) => SOLAR.format({ level: 'pod', key: p.areaKey }))];
      for (const scene of scenes) {
        const base = buildScene(h, h.range, tz, scene as never, SOLAR);
        const all = buildScene(h, h.range, tz, scene as never, SOLAR, undefined, Infinity);
        const n = (x: typeof base) => x.beats.filter((b) => b.accented).length;
        expect(all.beats.map((b) => b.index)).toEqual(base.beats.map((b) => b.index));
        expect(n(all)).toBeGreaterThanOrEqual(n(base));
        for (const b of base.beats) if (b.accented) expect(all.beats[b.index]!.accented).toBe(true);
        // What stays silent is silent by rule (Low, or no maneuver rule plays), not by the budget.
        expect(all.beats.filter((b) => !b.accented).every((b) => b.priority === 'low' || b.durationMs === 0)).toBe(true);
        if (n(all) > n(base)) more++;
      }
    }
    expect(more).toBeGreaterThan(0);
  });
});

describe('a flying crew’s turn (22 B9)', () => {
  const ph = (...ps: [string, number][]) => { let at = 0; return ps.map(([phase, durMs]) => { const p = { phase, atMs: at, durMs }; at += durMs; return p; }) as PlannedManeuver['phases']; };
  it('opens as the ships arrive, stays whole past the work, folds, then leaves; the animations count toward no minimum', () => {
    const carve = ph(['tell', 300], ['gather', 500], ['act', 1200], ['echo', 400]);
    expect(crewTimes(carve)).toEqual({ openMs: 800, closeMs: 2000 + CREW_HOLD_MS, leaveMs: 2000 + CREW_HOLD_MS + CREW_FOLD_MS });
    // Whole (unfurled, not yet folding) at least CREW_OPEN_MIN_MS, however short the work.
    const quick = ph(['tell', 300], ['gather', 400], ['act', 200], ['echo', 100]);
    const q = crewTimes(quick);
    expect(q.closeMs - (q.openMs + CREW_FOLD_MS)).toBe(CREW_OPEN_MIN_MS);
    expect(q.closeMs - 900).toBeGreaterThanOrEqual(CREW_HOLD_MS); // and whole past the work's end
    // A long payoff before the disperse keeps them named through it.
    const merge = ph(['tell', 300], ['gather', 900], ['act', 1600], ['land', 500], ['echo', 3000], ['disperse', 900]);
    expect(crewTimes(merge).closeMs).toBe(6300 - CREW_FOLD_MS);
    expect(crewTimes(merge).leaveMs).toBe(6300);
  });

  it('holds the maneuver open until they leave, so their next work waits for it', () => {
    const a = ev(0, { by: cy });
    const b = ev(0, { by: cy });
    const { h, f, beat } = board({
      events: [
        [a, [{ m: 'climb', key: wi(1), role: 'objective', from: READY, to: sig('underway'), actor: cy }]],
        [b, [{ m: 'climb', key: wi(2), role: 'objective', from: READY, to: sig('underway'), actor: cy }]],
      ],
      pieces: [pieceFacts(wi(1), 'objective', cy), pieceFacts(wi(2), 'objective', cy)],
    });
    const [first, second] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm);
    expect(first!.durationMs).toBe(crewTimes(first!.phases).leaveMs);
    expect(first!.durationMs).toBeGreaterThan(spanMs(first!.phases));
    // P4 (27 E4): their next work sets off as the ships leave, its tell playing in the fold.
    const gatherAt = second!.phases.find((p) => p.phase === 'gather')!.atMs;
    expect(second!.afterMs).toBe(crewTimes(first!.phases).leaveMs - gatherAt);
    // Undone, it waits for the whole maneuver.
    const [f1, f2] = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm, { sequence: { seams: true, near: false } });
    expect(f2!.afterMs).toBe(f1!.durationMs);
  });
});

describe('a captain waits near the work when their next turn is close (27 E4, P4)', () => {
  const ph = (...ps: [string, number][]) => { let at = 0; return ps.map(([phase, durMs]) => { const p = { phase, atMs: at, durMs }; at += durMs; return p; }) as PlannedManeuver['phases']; };
  const under = RULE.objectiveUnderway;
  const play = (over: Partial<PlannedManeuver> & { afterMs: number }, crew: CanonicalKey[] = [cy]): PlannedManeuver => ({
    id: under, eventKey: `e${over.afterMs}`, seed: 1, cast: { agent: crew, subject: [wi(1)] }, phases: ph(['tell', 300], ['gather', 500], ['act', 1200], ['echo', 400]),
    durationMs: 4000, keys: [], ...over,
  }) as PlannedManeuver;
  const release = crewTimes(play({ afterMs: 0 }).phases).leaveMs;
  it('gives the wait from the release to the next gather, within STAY_NEAR_MS', () => {
    expect(STAY_NEAR_MS).toBe(3000);
    const gather = 300;
    const a = play({ afterMs: 0 });
    const b = play({ afterMs: release + 1000 - gather, eventKey: 'eb' });
    const w = nearWaits([a, b]);
    expect(w.get(a)).toEqual(new Map([[cy, 1000]]));
    expect(w.has(b)).toBe(false);
    // Zero wait (P4's own start) still counts; the planned start is what `startOf` can replace.
    expect(nearWaits([a, b], (m) => (m === b ? release - gather : m.afterMs)).get(a)).toEqual(new Map([[cy, 0]]));
  });
  it('gives none beyond the window, for another captain, a light maneuver or a turnless rule', () => {
    const a = play({ afterMs: 0 });
    const far = play({ afterMs: release + STAY_NEAR_MS + 1000 - 300, eventKey: 'ef' });
    expect(nearWaits([a, far]).size).toBe(0);
    const other = play({ afterMs: release - 300, eventKey: 'eo' }, [dee]);
    expect(nearWaits([a, other]).size).toBe(0);
    const light = play({ afterMs: release - 300, eventKey: 'el', id: PACE_RULES.find((r) => r.light)!.id });
    expect(nearWaits([a, light]).size).toBe(0);
    const turnless = PACE_RULES.find((r) => r.turn === false && r.tier !== 'ornament');
    if (turnless) expect(nearWaits([a, play({ afterMs: release - 300, eventKey: 'et', id: turnless.id })]).size).toBe(0);
    // A turn that begins before this one's claim is not its "next".
    expect(nearWaits([a, play({ afterMs: 0, eventKey: 'e0' })]).size).toBe(0);
  });
  it('a quiet turn releases as its work ends', () => {
    const a = play({ afterMs: 0, quiet: true });
    const work = 300 + 500 + 1200;
    const b = play({ afterMs: work + 500 - 300, eventKey: 'eb' });
    expect(nearWaits([a, b]).get(a)).toEqual(new Map([[cy, 500]]));
  });
});

describe('overlaps keep acts in order and give no actor two at once (27 E4)', () => {
  it('holds across every played beat of every pod', async () => {
    const { resolvePods, scheduleOf, planOf } = await import('../../scripts/pacing-ledger');
    const { ACTING_ROLES } = await import('@shared/engine/maneuvers');
    const rules = PACE_RULES as readonly PaceRule[];
    const ruleOf = (m: PlannedManeuver) => rules.find((r) => r.id === m.id)!;
    const crewOf = (m: PlannedManeuver) => [...(m.cast.agent ?? []), ...(m.cast.support ?? [])] as string[];
    const actingOf = (m: PlannedManeuver) => ACTING_ROLES.flatMap((r) => m.cast[r] ?? []) as string[];
    const meets = (a: string[], b: string[]) => a.some((x) => b.includes(x));
    // The work window: from the act (else the land) to the work's end.
    const work = (m: PlannedManeuver): [number, number] => {
      const act = m.phases.find((p) => p.phase === 'act'), land = m.phases.find((p) => p.phase === 'land');
      const first = act ?? land;
      const endP = land ?? act;
      return first && endP ? [m.afterMs + first.atMs, m.afterMs + endP.atMs + endP.durMs] : [m.afterMs, m.afterMs];
    };
    let pairs = 0;
    for (const rp of resolvePods()) {
      const sched = scheduleOf(rp.h, rp.scene, rp.tz, {});
      for (const beat of sched.beats) {
        if (!(beat.durationMs > 0)) continue;
        const plan = planOf(rp.h, rp.areaKey, beat, sched.limelight, {}).filter((m) => !ruleOf(m)?.light);
        for (const p of plan) for (const d of plan) {
          if (p === d || !(p.afterMs < d.afterMs)) continue;
          const crewShared = meets(crewOf(p), crewOf(d)) && ruleOf(p).turn !== false && ruleOf(d).turn !== false;
          const dependent = crewShared
            || ((p.protect || d.protect) && meets(actingOf(p), actingOf(d)))
            || meets(p.holds ?? [], d.keys) || meets(d.holds ?? [], p.keys);
          if (!dependent) continue;
          pairs++;
          expect(work(p)[1], `${rp.label} ${p.id} then ${d.id}`).toBeLessThanOrEqual(work(d)[0]);
        }
      }
    }
    expect(pairs).toBeGreaterThan(0);
  }, 120_000);
});

describe('the progress beam (27 E3)', () => {
  const rule = PACE_RULES.find((r) => r.id === RULE.agentProgress)!;
  const story = pieceFacts(wi(1), 'objective', ann);
  const task = { ...pieceFacts(wi(2), 'step', null), parent: wi(1) };

  it('is a narrative rule no move triggers, 1.2 to 1.6 s: a gather, an act and an echo', () => {
    expect(rule.tier).toBe('narrative');
    expect(rule.protect).toBeFalsy();
    expect(spanMs(rule.phases)).toBeGreaterThanOrEqual(1200);
    expect(spanMs(rule.phases)).toBeLessThanOrEqual(1600);
    expect(rule.phases.map((p) => p.phase)).toEqual(['gather', 'act', 'echo']);
    const merge: Move = { m: 'settle', key: pr(1), facility: repo('r1'), to: sig('accomplished'), approvers: [ben], actor: ann };
    const climb: Move = { m: 'climb', key: wi(2), role: 'step', from: READY, to: sig('accomplished'), actor: ann };
    expect(rule.match(merge, EMPTY)).toBe(false);
    expect(rule.match(climb, EMPTY)).toBe(false);
  });

  it('on a merge: the author, the work, and no support', () => {
    const e = ev(3_600_000, { by: ben });
    const mv: Move = { m: 'settle', key: pr(1), facility: repo('r1'), to: sig('accomplished'), approvers: [ben, cy], actor: ben };
    const { f } = board({ events: [[e, [mv]]], pieces: [story, task], attachments: [attFacts(pr(1), repo('r1'), 0, ann, [wi(2)], [ben, cy])] });
    expect(rule.cast(mv, e, f)).toEqual({ subject: [pr(1)], attachment: [pr(1)], facility: [repo('r1')], agent: [ann], target: [wi(1)] });
  });

  it('on a step’s climb: the step’s parent is the target', () => {
    const e = ev(3_600_000, { by: ann });
    const mv: Move = { m: 'climb', key: wi(2), role: 'step', from: READY, to: sig('underway'), actor: ann };
    const { f } = board({ events: [[e, [mv]]], pieces: [story, task] });
    const cast = rule.cast(mv, e, f);
    expect(cast.subject).toEqual([wi(2)]);
    expect(cast.agent).toEqual([ann]);
    expect(cast.target).toEqual([wi(1)]);
  });
});

describe('short forms (27 E4d, P7)', () => {
  const rule = (id: string) => PACE_RULES.find((r) => r.id === id) as PaceRule;
  const lens: [string, string | undefined, number][] = [
    [RULE.objectiveAccomplish, undefined, 2520], [RULE.objectiveAccomplish, 'beamed', 3600],
    [RULE.threatAccomplish, undefined, 3000], [RULE.threatAccomplish, 'beamed', 3840],
    [RULE.attachmentMerge, undefined, 4320], [RULE.seatComplete, undefined, 2400], [RULE.regionClear, undefined, 1770],
  ];

  it('each short form keeps its form\u2019s phase order and has the length 15 \u00a77 gives', () => {
    for (const [id, v, len] of lens) {
      const sf = shortForm(rule(id), v)!;
      expect(sf.name, id).toBe(v ? `${v}-short` : 'short');
      expect(spanMs(sf.phases), `${id} ${v}`).toBe(len);
      const order = sf.phases.map((p) => p.phase);
      expect(order, id).toEqual(PHASES.filter((p) => order.includes(p)));
      sf.phases.forEach((p, i) => expect(p.atMs).toBe(i ? sf.phases[i - 1]!.atMs + sf.phases[i - 1]!.durMs : 0));
    }
  });

  it('a close keeps its glide whole; the other phases are SHORT_PACE of the form', () => {
    for (const id of [RULE.objectiveAccomplish, RULE.threatAccomplish]) {
      const sf = shortForm(rule(id))!;
      expect(sf.phases.find((p) => p.phase === 'land')!.durMs).toBe(CLOSE_SLIDE_MS);
      for (const p of sf.phases) if (p.phase !== 'land') expect(p.durMs).toBe(Math.round(rule(id).phases.find((q) => q.phase === p.phase)!.durMs * SHORT_PACE));
    }
    expect(shortOf(rule(RULE.regionClear).phases).map((p) => p.durMs)).toEqual([210, 960, 600]);
  });

  it('every short form is shortOf its source form, for all five rules and both beamed variants (E5a)', () => {
    const src: [string, string | undefined, typeof LANDING, readonly string[]][] = [
      [RULE.objectiveAccomplish, undefined, LANDING, ['land']], [RULE.objectiveAccomplish, 'beamed', LANDING_BEAMED, ['land']],
      [RULE.threatAccomplish, undefined, STRIKE, ['land']], [RULE.threatAccomplish, 'beamed', STRIKE_BEAMED, ['land']],
      [RULE.attachmentMerge, undefined, LINK, []], [RULE.seatComplete, undefined, HOMEWORLD, []], [RULE.regionClear, undefined, ALL_CLEAR, []],
    ];
    for (const [id, v, from, keep] of src) expect(shortForm(rule(id), v)!.phases, `${id} ${v}`).toEqual(shortOf(from, keep as never));
  });

  it('a first merge has no short form, and a rule without one gives null', () => {
    expect(shortForm(rule(RULE.attachmentMerge), 'first')).toBeNull();
    expect(shortForm(rule(RULE.pieceAppear))).toBeNull();
  });
});

describe('the montage form (27 E5b, 05 §8.5c P-24)', () => {
  const merge = ev(0, { by: ann });
  const mergeMove: Move = { m: 'settle', key: pr(1), facility: repo('r1'), to: sig('accomplished'), approvers: [ben], actor: ann };
  const key = turnKey(merge.eventKey, RULE.attachmentMerge);
  const withForm = (form: 'full' | 'short' | 'montage' | 'light', served = true) => {
    const { h, f, beat } = board({
      events: [[merge, [mergeMove]]],
      pieces: served ? [pieceFacts(wi(1), 'objective', ann)] : [],
      attachments: [attFacts(pr(1), repo('r1'), -1, ann, served ? [wi(1)] : [], [ben])],
    });
    const direction = { forms: new Map([[key, form]]), climaxes: new Set<string>(), levers: [], estimateMs: 0 };
    const limelight = { named: new Set<string>(), spotlights: new Map(), direction };
    const plan = planManeuvers(h, beat, f, PACE_RULES, ENGAGEMENT.calm, { limelight });
    return { plan: plan.find((m) => m.id === RULE.attachmentMerge)!, all: plan, h, f, turns: turnsOf(h, [merge], f, PACE_RULES, undefined, undefined, direction).turns };
  };

  it('plays the short form, protected, lighting one plate with no held turn', () => {
    const short = withForm('short').plan;
    const m = withForm('montage').plan;
    expect(m.phases).toEqual(shortForm(PACE_RULES.find((r) => r.id === RULE.attachmentMerge) as PaceRule)!.phases);
    expect(m.variant).toBe('short');
    expect(m.plate).toBe(wi(1));
    expect(m.montage).toBe(true);
    expect(m.protect).toBeDefined();
    expect(m.quiet).toBeUndefined();
    expect(m.durationMs).toBe(spanMs(m.phases)); // no held turn: a short form's crew would hold until its ships leave
    expect(short.durationMs).toBeGreaterThanOrEqual(m.durationMs);
    expect(short.plate).toBeUndefined();
    expect(releaseOfPlay(m)).toBe(workEndOf(m.phases)); // the ships leave as the work ends
    expect(releaseOfPlay(short)).toBeGreaterThanOrEqual(releaseOfPlay(m));
  });

  it('names no one in limelight, though it is always named in History', () => {
    expect(withForm('montage').turns.map((t) => t.people)).toEqual([[]]);
    expect(withForm('short').turns.map((t) => t.people)).toEqual([[ann, ben]]);
  });

  it('a light form drops the draft, so the schedule keeps no turn for it (E5c)', () => {
    const l = withForm('light');
    expect(l.all.find((m) => m.id === RULE.attachmentMerge)).toBeUndefined();
    expect(l.turns).toEqual([]);
  });

  it('a montage with no piece to light plays as its short form', () => {
    const m = withForm('montage', false).plan;
    expect(m.plate).toBeUndefined();
    expect(m.variant).toBe('short');
  });
});

describe('light work and hero shots, on synthetic boards (27 E5c, 05 §8.5c P-26, P-27)', () => {
  const settle = (key: CanonicalKey, approvers: CanonicalKey[], by: CanonicalKey): Move => ({ m: 'settle', key, facility: repo('r1'), to: sig('accomplished'), approvers, actor: by });
  const story = pieceFacts(wi(1), 'objective', ann);
  const task = { ...pieceFacts(wi(2), 'step', null), parent: wi(1) };

  it('an opening is placed ahead only when its merge plays in the same beat', () => {
    const [openE, mergeE] = [ev(3_600_000, { by: ann }), ev(3_700_000, { by: ann })];
    const attach: Move = { m: 'attach', key: pr(1), facility: repo('r1'), author: ann };
    const withMerge = board({ events: [[openE, [attach]], [mergeE, [settle(pr(1), [], ann)]]], pieces: [story, task], attachments: [{ ...attFacts(pr(1), repo('r1'), 3_600_000, ann, [wi(2)]), signalAt: [{ from: T0 + 3_700_000, signal: sig('accomplished') }] }] });
    const opens = (b: ReturnType<typeof board>, events: AnyTimelineEvent[]) => momentsOf(b.h, events, b.f).filter((m) => m.rule === RULE.attachmentOpen);
    expect(opens(withMerge, [openE, mergeE]).map((m) => m.ahead)).toEqual([true]);
    const alone = board({ events: [[openE, [attach]]], pieces: [story, task], attachments: [attFacts(pr(1), repo('r1'), 3_600_000, ann, [wi(2)])] });
    expect(opens(alone, [openE]).map((m) => m.ahead)).toEqual([false]);
  });

  it('fewer-heroes sends a hero shot back to a progress beam, and is listed only when it did', () => {
    // Two merges in one day, neither closing its work; ben's has the approvers (so it is the day's climax), ann's is her hero shot.
    const [a, b] = [ev(3_600_000, { by: ann }), ev(3_700_000, { by: ben })];
    const bd = board({
      events: [[a, [settle(pr(1), [], ann)]], [b, [settle(pr(2), [cy, ann], ben)]]],
      pieces: [story, task],
      attachments: [
        { ...attFacts(pr(1), repo('r1'), 3_000_000, ann, [], []), signalAt: [{ from: T0 + 3_600_000, signal: sig('accomplished') }] },
        { ...attFacts(pr(2), repo('r1'), 3_000_000, ben, [], [cy, ann]), signalAt: [{ from: T0 + 3_700_000, signal: sig('accomplished') }] },
      ],
    });
    const run = (levers: string[]) => directorOf(bd.h, [[a], [b]], bd.f, PACE_RULES, (_h, e) => e.priority, 'UTC', undefined, 1, levers);
    const heroKey = turnKey(a.eventKey, RULE.attachmentMerge);
    const without = run([]);
    expect(without.forms.get(heroKey)).toBeUndefined(); // full: her hero shot
    const fewer = run(['fewer-heroes']);
    expect(fewer.forms.get(heroKey)).toBe('progress');
    expect(fewer.levers).toEqual(['fewer-heroes']);
    // Nothing to send back (the hero shot is the day's climax): the lever is not listed.
    const solo = directorOf(bd.h, [[a]], bd.f, PACE_RULES, (_h, e) => e.priority, 'UTC', undefined, 1, ['fewer-heroes']);
    expect(solo.levers).toEqual([]);
  });
});

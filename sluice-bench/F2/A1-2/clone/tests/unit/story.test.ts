// Slice 3a — story grammar in shared code: changedBy (the cause → effect beam's source), the
// highlights schedule, and the clock's step to a chosen beat.
import { describe, expect, it } from 'vitest';
import orbitWeek from '@fixtures/scenarios/orbit-week';
import busyWeek from '@fixtures/scenarios/busy-week';
import { scenarioKeys } from '@fixtures/dsl';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { buildHighlights, buildScene, sceneEntityKeys, touches } from '@shared/playback/highlights';
import { BACKLOG } from '@shared/hierarchy/backlog';
import { PlaybackClock, accentBeat } from '@shared/playback/clock';
import { planAccents } from '@shared/playback/plan';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { DESKTOP } from '@shared/profile/bundled';
import type { SceneKey } from '@shared/contracts/view';
import { projectScene } from '@shared/scene/projectScene';
import { BOARD } from '@shared/scene/board';
import { LAYOUT_VERSION } from '@shared/limits';
import { historyOf } from '../golden/helpers';

const comet = historyOf(orbitWeek);
const k = scenarioKeys(orbitWeek);

describe('changedBy (03 §3)', () => {
  it('defaults to the assignee, and an explicit actor overrides it', () => {
    const resolved = comet.events.find((e) => e.kind === 'wi_state_changed' && e.entityKey === k.wi(201) && e.payload.to === 'Resolved')!;
    expect(resolved.changedBy).toBe(k.person('rafe')); // a lead resolves Ava's Story
    expect(snapshotAt(comet, resolved.occurredAt, 'knownThen').workItems.get(k.wi(201))!.assigneeKey).toBe(k.person('ava'));
    const active = comet.events.find((e) => e.kind === 'wi_state_changed' && e.entityKey === k.wi(401) && e.payload.to === 'Active')!;
    expect(active.changedBy).toBe(k.person('rafe')); // assigned to Rafe, so his by default
    const opened = comet.events.find((e) => e.kind === 'pr_opened' && e.entityKey === k.pr(9003))!;
    expect(opened.changedBy).toBe(k.person('mina'));
  });

  it("the beam's source is the actor, never the assignee", () => {
    const sch = buildBeatSchedule(comet, comet.range, orbitWeek.tz);
    const t = Date.parse('2026-09-17T20:30:00Z');
    const beat = sch.beats.find((b) => b.sourceUtc === t)!;
    const plan = planAccents(comet, beat, snapshotAt(comet, beat.firstUtc - 1, 'knownThen'), snapshotAt(comet, beat.sourceUtc, 'knownThen'));
    const shift = plan.find((p) => p.name === 'stageShift.story' && p.entityKey === k.wi(201))!;
    expect(shift.actorKey).toBe(k.person('rafe'));
  });
});

describe('ships rest where their captain last worked (02 INV-07, 03 §5)', () => {
  const ship = (t: number, scene: SceneKey, who: string) =>
    projectScene(comet, snapshotAt(comet, t, 'knownThen'), scene, LAYOUT_VERSION).nodes.find((n) => n.kind === 'captain' && n.canonicalKey === k.person(who));
  const f101 = `feature:${k.wi(101)}` as SceneKey;

  it("after Rafe resolves Ava's Story 201, his ship goes over to it, stays a while, then drifts home (the board, 2026-10-09)", () => {
    const t = Date.parse('2026-09-17T20:30:00Z');
    expect(ship(t - 1, f101, 'rafe')?.attach?.to ?? '').not.toContain(k.wi(201));
    expect(ship(t, f101, 'rafe')?.attach?.to).toContain(k.wi(201)); // 201 is in Ava's lane: he goes over to it
    expect(ship(t + 3_600_000, f101, 'rafe')?.attach?.to).toContain(k.wi(201)); // no commute back while it's recent
    // Some hours on, he is back on his own track: in the gap above his lane, attached to nothing.
    const later = ship(t + (BOARD.awayHours + 1) * 3_600_000, f101, 'rafe')!;
    expect(later.attach).toBeUndefined();
    const g = projectScene(comet, snapshotAt(comet, t + (BOARD.awayHours + 1) * 3_600_000, 'knownThen'), f101, LAYOUT_VERSION);
    const lane = g.board!.heads.findIndex((x) => x.people.includes(k.person('rafe')));
    const track = g.board!.rings.find((r) => r.lane === lane)!.track;
    expect(Math.hypot(later.world.x / track.rx, later.world.y / track.ry)).toBeCloseTo(1, 2);
  });

  it("an author's ship rests at the PR they opened; the assignee's ship doesn't move (INV-08)", () => {
    const t = Date.parse('2026-09-15T19:00:00Z'); // Mina opens PR 9003, linked to Rafe's Bug 301
    expect(ship(t, f101, 'mina')?.attach?.to).toContain(k.pr(9003));
    expect(ship(t, f101, 'rafe')?.attach?.to).toBe(ship(t - 1, f101, 'rafe')?.attach?.to);
  });
});

describe('review formation data (03 §3, 06 §5)', () => {
  it("a merge carries its standing approvers into the plan; approving moves no ship's resting place", () => {
    const done = comet.events.find((e) => e.kind === 'pr_completed' && e.entityKey === k.pr(9001))!;
    expect(done.kind === 'pr_completed' && done.payload.approvedBy).toEqual([k.person('ava'), k.person('jo')].sort());
    expect(comet.entities.captains.some((c) => c.key === k.person('jo'))).toBe(true); // a guest has a ship design
    const sch = buildBeatSchedule(comet, comet.range, orbitWeek.tz);
    const beat = sch.beats.find((b) => b.eventKeys.includes(done.eventKey))!;
    const plan = planAccents(comet, beat, snapshotAt(comet, beat.firstUtc - 1, 'knownThen'), snapshotAt(comet, beat.sourceUtc, 'knownThen'));
    expect(plan.find((p) => p.name === 'dock' && p.entityKey === k.pr(9001))?.approvedBy).toHaveLength(2);
    // Approvals aren't activity (INV-07): Ava's resting place is the same just before and after the merge.
    const f101 = `feature:${k.wi(101)}` as SceneKey;
    const ship = (t: number) => projectScene(comet, snapshotAt(comet, t, 'knownThen'), f101, LAYOUT_VERSION).nodes.find((n) => n.kind === 'captain' && n.canonicalKey === k.person('ava'));
    expect(ship(done.occurredAt)?.attach?.to).toBe(ship(done.occurredAt - 1)?.attach?.to);
    expect(projectScene(comet, snapshotAt(comet, done.occurredAt, 'knownThen'), f101, LAYOUT_VERSION).nodes.some((n) => n.canonicalKey === k.person('jo'))).toBe(false); // guests aren't nodes
  });
});

describe('highlights (05 §3)', () => {
  it('a Feature scene holds only events touching it, within its budget, and the state stays the full snapshot', () => {
    const scene = `feature:${k.wi(101)}` as SceneKey;
    const keys = sceneEntityKeys(comet, scene)!;
    expect(keys.has(k.wi(401))).toBe(true); // a Task of a Story of 101
    expect(keys.has(k.pr(9001))).toBe(true); // a PR linked to it
    expect(keys.has(k.wi(221))).toBe(false); // Feature 104's Story
    const sch = buildHighlights(comet, comet.range, orbitWeek.tz, scene);
    const all = new Map(comet.events.map((e) => [e.eventKey, e]));
    for (const b of sch.beats) for (const ek of b.eventKeys) expect(touches(all.get(ek)!, keys)).toBe(true);
    // Within budget, unless only High beats are left: they're never cut (05 §3), and two protected
    // merges in one beat play one after the other (05 §5).
    expect(sch.totalMs <= DESKTOP.pacing.highlightBudgetMs || sch.beats.every((b) => b.priority === 'high' || !b.accented)).toBe(true);
    // The state at a highlight beat is the whole scope's state then: out-of-view events still apply.
    const last = sch.beats.at(-1)!;
    const elsewhere = comet.events.find((e) => !touches(e, keys) && e.occurredAt >= comet.range.startUtc && e.occurredAt <= last.sourceUtc);
    expect(elsewhere).toBeDefined();
    expect(sch.stateUtc(last.presentationStartMs)).toBeGreaterThanOrEqual(elsewhere!.occurredAt);
  });

  it('a sector plays its own work too (decided 2026-10-08): its stars and everything ever beneath them', () => {
    const scene = BACKLOG.format(BACKLOG.sceneForScope(comet.scope));
    const keys = sceneEntityKeys(comet, scene)!;
    expect(keys).not.toBeNull();
    for (const key of [k.wi(101), k.wi(401), k.pr(9001), k.wi(221)]) expect(keys.has(key)).toBe(true); // every Feature of the sector
    // Only the galaxy, which no level draws, has no filter.
    expect(sceneEntityKeys(comet, 'galaxy' as SceneKey)).toBeNull();
  });

  it('H is the big moments (decided 2026-10-08): the scene’s High beats only, inside the default schedule’s', () => {
    const scene = `feature:${k.wi(101)}` as SceneKey;
    const all = buildScene(comet, comet.range, orbitWeek.tz, scene);
    const big = buildHighlights(comet, comet.range, orbitWeek.tz, scene);
    expect(big.beats.every((b) => b.priority === 'high')).toBe(true);
    expect(big.beats.length).toBeLessThan(all.beats.length);
    const mine = new Set(all.beats.flatMap((b) => b.eventKeys));
    for (const b of big.beats) for (const ek of b.eventKeys) expect(mine.has(ek)).toBe(true);
  });
});

describe('clock: step to a chosen beat (Shift →)', () => {
  it('applies every beat on the way and plays only the target', () => {
    const h = historyOf(busyWeek);
    const clock = new PlaybackClock(buildBeatSchedule(h, h.range, busyWeek.tz));
    const target = clock.schedule.beats.filter((b) => b.priority === 'high' && b.accented)[3]!;
    const adv = clock.stepTo(target);
    expect(clock.x).toBe(target.presentationStartMs);
    expect(clock.status).toBe('paused');
    expect(adv.crossed.at(-1)).toBe(target);
    expect(accentBeat(adv)).toBe(target);
  });
});

// Slice 2 replay checks: AC-10 to AC-16, AC-18, AC-19, AC-21, AC-22.
import { describe, expect, it } from 'vitest';
import stateMappingJson from '@config/state-mapping.json';
import type { ScopeHistory, StateMapping } from '@shared/contracts/history';
import type { SceneKey } from '@shared/contracts/view';
import { LAYOUT_VERSION } from '@shared/limits';
import { accentBeat, PlaybackClock } from '@shared/playback/clock';
import { planAccents } from '@shared/playback/plan';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { CHECKPOINT_EVERY, snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { scenarioKeys, toHistory } from '@fixtures/dsl';
import { scenarios } from '@fixtures/scenarios';
import edgeHistory from '@fixtures/scenarios/edge-history';
import orbitWeek from '@fixtures/scenarios/orbit-week';
import { BACKLOG } from '@shared/hierarchy/backlog';

const mapping = stateMappingJson as StateMapping;
const T = (iso: string) => Date.parse(iso);

describe('AC-10: a PR completion never changes a Story or Bug stage (INV-06)', () => {
  it.each(scenarios.map((s) => [s.name, s] as const))('%s', (_n, s) => {
    const h = toHistory(s, mapping);
    for (const e of h.events.filter((x) => x.kind === 'pr_completed')) {
      const before = snapshotAt(h, e.occurredAt - 1, 'knownThen');
      const after = snapshotAt(h, e.occurredAt, 'knownThen');
      const others = h.events.filter((x) => x.occurredAt === e.occurredAt && x.kind === 'wi_state_changed');
      for (const [key, wi] of after.workItems) {
        if ((wi.kind === 'story' || wi.kind === 'bug') && !others.some((o) => o.entityKey === key)) {
          expect(wi.stage, key).toBe(before.workItems.get(key)?.stage);
        }
      }
    }
  });
});

describe('edge-history', () => {
  const h = toHistory(edgeHistory, mapping);
  const k = scenarioKeys(edgeHistory);
  const end = h.range.endUtc - 1;

  it('AC-11: an undated link is absent in knownThen, uncertain in currentObserved, and never scheduled', () => {
    for (const t of [h.range.startUtc, T('2026-09-17T00:00:00Z'), end]) {
      const known = snapshotAt(h, t, 'knownThen');
      expect(known.links.some((l) => l.fromKey === k.wi(815))).toBe(false);
      expect(known.workItems.get(k.wi(815))?.parentKey).toBeNull();
      const observed = snapshotAt(h, t, 'currentObserved');
      const link = observed.links.find((l) => l.kind === 'parent' && l.fromKey === k.wi(815));
      expect(link?.uncertain).toBe(true);
      expect(observed.workItems.get(k.wi(815))?.parentKey).toBe(k.wi(801));
    }
    const sch = buildBeatSchedule(h, h.range, edgeHistory.tz);
    expect(sch.beats.flatMap((b) => b.eventKeys).some((key) => key.includes(k.wi(815)))).toBe(false);
  });

  it('AC-11: a link added later is uncertain in currentObserved before its time, and certain after', () => {
    const before = snapshotAt(h, T('2026-09-17T00:00:00Z'), 'currentObserved');
    expect(before.links.find((l) => l.kind === 'pr' && l.fromKey === k.pr(9401))?.uncertain).toBe(true);
    const after = snapshotAt(h, T('2026-09-18T18:00:00Z'), 'currentObserved');
    expect(after.links.find((l) => l.kind === 'pr' && l.fromKey === k.pr(9401))?.uncertain).toBe(false);
  });

  it('AC-11: the retrospective lens draws undated and later links as uncertain edges', () => {
    const t = T('2026-09-17T00:00:00Z');
    const scene = projectScene(h, snapshotAt(h, t, 'currentObserved'), `feature:${k.wi(801)}`, LAYOUT_VERSION);
    const faq = scene.nodes.find((n) => n.canonicalKey === k.wi(815))!;
    expect(scene.edges.find((e) => e.kind === 'orbit' && e.to === faq.projectionKey)?.uncertain).toBe(true);
    const known = projectScene(h, snapshotAt(h, t, 'knownThen'), `feature:${k.wi(801)}`, LAYOUT_VERSION);
    expect(known.nodes.some((n) => n.canonicalKey === k.wi(815))).toBe(false);
    // Before the bug is Rejected (a Removed item leaves the scene, 02 INV-10).
    const photo = projectScene(h, snapshotAt(h, T('2026-09-17T12:00:00Z'), 'currentObserved'), `feature:${k.wi(802)}`, LAYOUT_VERSION);
    const vessel = photo.nodes.find((n) => n.canonicalKey === k.pr(9402))!;
    const bug = photo.nodes.find((n) => n.canonicalKey === k.wi(821))!;
    expect(photo.edges.find((e) => e.kind === 'route' && e.from === vessel.projectionKey && e.to === bug.projectionKey)?.uncertain).toBe(true);
  });

  it('an undated removal keeps the dated link in knownThen, marked uncertain, and drops it in currentObserved', () => {
    const known = snapshotAt(h, end, 'knownThen').links.find((l) => l.fromKey === k.wi(814));
    expect(known?.uncertain).toBe(true);
    expect(snapshotAt(h, end, 'currentObserved').links.some((l) => l.fromKey === k.wi(814))).toBe(false);
  });

  it('AC-12: a PR link added after the PR opened appears only from the link time', () => {
    const opened = T('2026-09-15T16:00:00Z');
    expect(snapshotAt(h, opened, 'knownThen').links.some((l) => l.fromKey === k.pr(9401))).toBe(false);
    expect(snapshotAt(h, T('2026-09-18T16:59:00Z'), 'knownThen').links.some((l) => l.fromKey === k.pr(9401))).toBe(false);
    expect(snapshotAt(h, T('2026-09-18T17:00:00Z'), 'knownThen').links.some((l) => l.fromKey === k.pr(9401))).toBe(true);
    // The launch at opening has no route to the Story: its beat holds only the PR, focused on the PR.
    const sch = buildBeatSchedule(h, h.range, edgeHistory.tz);
    const launch = sch.beats.find((b) => b.eventKeys.some((e) => e.startsWith('pr_opened') && e.includes(k.pr(9401))))!;
    expect(launch.eventKeys).toHaveLength(1);
    const plan = planAccents(h, launch, snapshotAt(h, launch.firstUtc - 1, 'knownThen'), snapshotAt(h, launch.sourceUtc, 'knownThen'));
    expect(plan.some((p) => p.name === 'routeInk')).toBe(false);
  });

  it('AC-13: after a reparent, the child is under the old Feature before and the new one after', () => {
    const at = T('2026-09-15T17:00:00Z');
    const inScene = (t: number, f: number) =>
      projectScene(h, snapshotAt(h, t, 'knownThen'), `feature:${k.wi(f)}`, LAYOUT_VERSION).nodes.some((n) => n.canonicalKey === k.wi(811));
    expect(inScene(at - 1, 801)).toBe(true);
    expect(inScene(at - 1, 802)).toBe(false);
    expect(inScene(at, 801)).toBe(false);
    expect(inScene(at, 802)).toBe(true);
  });

  it('AC-14: a reopen sets reopened, and the earlier Closed event stays in history', () => {
    expect(snapshotAt(h, T('2026-09-16T17:59:00Z'), 'knownThen').workItems.get(k.wi(812))?.reopened).toBe(false);
    expect(snapshotAt(h, T('2026-09-16T18:00:00Z'), 'knownThen').workItems.get(k.wi(812))?.reopened).toBe(true);
    expect(h.events.some((e) => e.kind === 'wi_state_changed' && e.entityKey === k.wi(812) && e.payload.to === 'Closed')).toBe(true);
  });

  it('AC-15: an unknown state gets stage unknown and keeps its raw name, in the snapshot and the scene', () => {
    const t = T('2026-09-17T17:00:00Z');
    const wi = snapshotAt(h, t, 'knownThen').workItems.get(k.wi(813))!;
    expect([wi.stage, wi.rawState, wi.category]).toEqual(['unknown', 'Blocked', 'Unknown']);
    const node = projectScene(h, snapshotAt(h, t, 'knownThen'), `feature:${k.wi(802)}`, LAYOUT_VERSION).nodes.find((n) => n.canonicalKey === k.wi(813))!;
    expect(node.stage).toBe('unknown');
    expect(node.meta).toContain('Blocked');
  });

  it('AC-16: an area change moves the Feature between sectors at exactly its source time', () => {
    const at = T('2026-09-16T17:00:00Z');
    const kelp = toHistory(edgeHistory, mapping, { project: 'Driftwood', area: 'Driftwood\\Kelp Team' });
    const reef = toHistory(edgeHistory, mapping, { project: 'Driftwood', area: 'Driftwood\\Reef Team' });
    const has = (hh: ScopeHistory, t: number) => {
      const sector = hh.scope.sector;
      const scene: SceneKey = BACKLOG.format(BACKLOG.sceneForScope({ sector }));
      return projectScene(hh, snapshotAt(hh, t, 'knownThen'), scene, LAYOUT_VERSION).nodes.some((n) => n.canonicalKey === k.wi(803) && n.kind === 'star');
    };
    expect([has(kelp, at - 1), has(kelp, at)]).toEqual([true, false]);
    expect([has(reef, at - 1), has(reef, at)]).toEqual([false, true]);
  });
});

describe('snapshot checkpoints', () => {
  it('gives the same snapshot through checkpoints as a straight fold', () => {
    // A long synthetic history: repeat orbit-week's events with shifted keys and times.
    const base = toHistory(orbitWeek, mapping);
    const reps = Math.ceil((CHECKPOINT_EVERY * 2.5) / base.events.length);
    const events = Array.from({ length: reps }, () => base.events).flat();
    const long: ScopeHistory = { ...base, events };
    const short: ScopeHistory = { ...base, events: [...events] }; // a different object: a separate cache
    const t = base.events[Math.floor(base.events.length / 2)]!.occurredAt;
    snapshotAt(long, base.range.endUtc, 'knownThen'); // builds the checkpoints
    expect([...snapshotAt(long, t, 'knownThen').workItems.values()]).toEqual([...snapshotAt(short, t, 'knownThen').workItems.values()]);
  });
});

describe('playback clock', () => {
  const h = toHistory(orbitWeek, mapping);
  const sch = buildBeatSchedule(h, h.range, orbitWeek.tz);

  it('AC-18: changing the rate mid-beat leaves source time, scene, and event order unchanged', () => {
    const c = new PlaybackClock(sch);
    const beat = sch.beats[3]!;
    c.seek(beat.presentationStartMs + beat.durationMs / 2);
    const before = { state: c.stateUtc(), ruler: c.rulerUtc(), x: c.x };
    c.setRate(4);
    expect({ state: c.stateUtc(), ruler: c.rulerUtc(), x: c.x }).toEqual(before);
    c.setRate(0.25);
    expect({ state: c.stateUtc(), ruler: c.rulerUtc(), x: c.x }).toEqual(before);
    // Order is unchanged: playing to the end at any rate crosses the same beats in the same order.
    const order = (rate: 1 | 4 | 0.25) => {
      const k = new PlaybackClock(sch);
      k.setRate(rate);
      k.play();
      const seen: number[] = [];
      while (k.status === 'playing') for (const b of k.advance(16).crossed) seen.push(b.index);
      return seen;
    };
    expect(order(4)).toEqual(order(1));
    expect(order(0.25)).toEqual(order(1));
  });

  it('AC-19: seeking produces no accents, and of several beats crossed in one frame only the latest accented plays', () => {
    const c = new PlaybackClock(sch);
    const seek = c.seek(sch.beats[5]!.presentationStartMs + 1);
    expect(accentBeat(seek)).toBeNull();
    // busy-week's silent beats cluster, so a long 4× frame crosses several at once.
    const busy = toHistory(scenarios.find((x) => x.name === 'busy-week')!, mapping);
    const k = new PlaybackClock(buildBeatSchedule(busy, busy.range, orbitWeek.tz));
    k.setRate(4);
    k.play();
    k.seek(0);
    let multi: ReturnType<PlaybackClock['advance']> | null = null;
    while (k.status === 'playing' && !multi) {
      const a = k.advance(100); // a long frame at 4×: 400 ms of schedule
      if (a.crossed.length > 1 && a.crossed.some((b) => b.accented)) multi = a;
    }
    expect(multi).not.toBeNull();
    const latest = [...multi!.crossed].reverse().find((b) => b.accented)!;
    expect(accentBeat(multi!)).toBe(latest);
  });

  it('step plays the next beat once and pauses', () => {
    const c = new PlaybackClock(sch);
    const a = c.step();
    expect(a.crossed.map((b) => b.index)).toEqual([0]);
    expect(c.status).toBe('paused');
    expect(c.stateUtc()).toBe(sch.beats[0]!.sourceUtc);
  });
});

describe('captains', () => {
  const h = toHistory(orbitWeek, mapping);
  const k = scenarioKeys(orbitWeek);
  const shipAt = (t: number, scene: SceneKey, who: string) =>
    projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION).nodes.find((n) => n.kind === 'captain' && n.canonicalKey === k.person(who));

  it('AC-21: a concurrent assignment shows the captain at both, with no relocation', () => {
    const second = T('2026-09-14T22:00:00Z'); // ava takes 211 while still on 201
    for (const scene of [`feature:${k.wi(101)}`, `body:${k.wi(201)}`] as SceneKey[]) {
      const before = shipAt(second - 1, scene, 'ava');
      const after = shipAt(second, scene, 'ava');
      expect(after?.attach?.to).toBe(before?.attach?.to);
      expect(after?.world).toEqual(before?.world);
    }
    expect(shipAt(second - 1, `feature:${k.wi(102)}`, 'ava')).toBeUndefined();
    // In 102 she takes 211, in her own lane: her ship sits on her track above it (the board, 2026-10-09).
    const g102 = projectScene(h, snapshotAt(h, second, 'knownThen'), `feature:${k.wi(102)}` as SceneKey, LAYOUT_VERSION);
    const s102 = g102.nodes.find((n) => n.kind === 'captain' && n.canonicalKey === k.person('ava'))!;
    const p211 = g102.nodes.find((n) => n.canonicalKey === k.wi(211) && n.selectable)!;
    expect(s102.attach).toBeUndefined();
    expect(s102.world.y).toBeLessThan(p211.world.y); // above its lane
    const lane = g102.board!.heads.findIndex((x) => x.people.includes(k.person('ava')));
    const track = g102.board!.rings.find((r) => r.lane === lane)!.track;
    expect(s102.world.x).toBeCloseTo(Math.max(-track.span, Math.min(track.span, p211.world.x)), 3);
  });

  it('AC-22: pr_opened with an author produces an author beam and never moves the assignee\'s ship', () => {
    const sch = buildBeatSchedule(h, h.range, orbitWeek.tz);
    const beat = sch.beats.find((b) => b.eventKeys.some((e) => e.startsWith('pr_opened') && e.includes(k.pr(9003))))!;
    const plan = planAccents(h, beat, snapshotAt(h, beat.firstUtc - 1, 'knownThen'), snapshotAt(h, beat.sourceUtc, 'knownThen'));
    expect(plan.find((p) => p.name === 'authorBeam')?.authorKey).toBe(k.person('mina'));
    expect(plan.some((p) => p.name === 'captainJump')).toBe(false);
    for (const scene of [`feature:${k.wi(101)}`, `body:${k.wi(301)}`] as SceneKey[]) {
      expect(shipAt(beat.sourceUtc, scene, 'rafe')?.world).toEqual(shipAt(beat.firstUtc - 1, scene, 'rafe')?.world);
    }
  });
});

// Story time (05 §8.3a, 22 C2): an arc pulls a close (and its steps that day) to just after the last
// same-day merge that served it; a story's other work that day gathers at its culmination; creations,
// links, moves and PR events never move; nothing crosses a day; a piece's order holds; the schedule
// groups an arc into its merge's beat; a seek draws what playing draws; v0 bundles are untouched.
import { describe, expect, it } from 'vitest';
import meridian from '@fixtures/scenarios/v1/meridian-sprint';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { scenario, scenarioKeys, sprintScopes, toHistory } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import { typeIndex } from '@shared/engine/moves';
import { resolveSignal } from '@shared/engine/signal';
import { SOLAR } from '@shared/hierarchy/solar';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { ARC_WORK_HOURS } from '@shared/playback/constants';
import { realTimeOf, storyFocus, storyTime } from '@shared/playback/storyTime';
import { workingHours } from '@shared/playback/workHours';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { mapping } from '../golden/helpers';

const TZ = 'America/Los_Angeles';
const day = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const bundles: [string, ScopeHistory][] = [
  ['meridian', toHistory(meridian, mapping, sprintScopes(meridian).find((x) => x.sprint.endsWith('Sprint 7'))!)],
  ['pod-sprint', toHistory(podSprint, mapping, sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!)],
];

describe.each(bundles)('story time: %s', (_name, h) => {
  const st = storyTime(h, TZ);
  const real = new Map((h.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));
  const told = new Map((st.history.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));

  it('moves only work events, across a day only into an arc, never later, and keeps the same events', () => {
    expect(told.size).toBe(real.size);
    for (const [key, e] of told) {
      const r = real.get(key)!;
      if (e.occurredAt === r.occurredAt) continue;
      expect(['wi_state_changed', 'wi_assignee_changed', 'wi_title_changed']).toContain(e.kind);
      expect(realTimeOf(st.history, key)).toBe(r.occurredAt);
      if (day(e.occurredAt) === day(r.occurredAt)) continue;
      // Another day: only back, onto an arc's merge, at most ARC_WORK_HOURS working hours before.
      const f = st.focus.get(key);
      expect(f?.startsWith('arc:')).toBe(true);
      expect(e.occurredAt).toBeLessThan(r.occurredAt);
      expect(workingHours(e.occurredAt, r.occurredAt, TZ)).toBeLessThanOrEqual(ARC_WORK_HOURS + 0.01);
    }
  });

  it('keeps each item’s own events in order', () => {
    const seq = (events: AnyTimelineEvent[]) => {
      const by = new Map<string, string[]>();
      for (const e of events) by.set(e.entityKey, [...(by.get(e.entityKey) ?? []), e.eventKey]);
      return by;
    };
    expect(seq(st.history.events as AnyTimelineEvent[])).toEqual(seq(h.events as AnyTimelineEvent[]));
  });

  it('pulls a close to just after its merge (within 24 working hours), into one beat with it', () => {
    const types = typeIndex(h);
    const arcs = [...st.focus].filter(([, f]) => f.startsWith('arc:'));
    expect(arcs.length).toBeGreaterThan(0); // the fixtures have arcs
    const sched = buildBeatSchedule(st.history, h.range, TZ, { hier: SOLAR, ...SOLAR.pacing!(st.history) });
    const beatOf = new Map(sched.beats.flatMap((b) => b.eventKeys.map((k) => [k, b.index])));
    for (const [key, f] of arcs) {
      const merge = [...told.values()].find((e) => e.kind === 'pr_completed' && `arc:${e.entityKey}` === f)!;
      expect(beatOf.get(key)).toBe(beatOf.get(merge.eventKey));
      const e = told.get(key)!;
      // A close at or after the merge (the arc's) plays just after it; an earlier one that day stays ahead of it.
      if (e.kind === 'wi_state_changed' && real.get(key)!.occurredAt >= merge.occurredAt && resolveSignal(h.stateMapping, types.get(e.entityKey) ?? '', e.payload.to).rung === 'accomplished') {
        expect(e.occurredAt).toBeGreaterThan(merge.occurredAt);
        expect(e.occurredAt - merge.occurredAt).toBeLessThan(1000);
      }
    }
  });

  it('ends the day where the record does, but for work an arc pulled back from a later day', () => {
    const days = [...new Set((h.events as AnyTimelineEvent[]).filter((e) => e.occurredAt >= h.range.startUtc).map((e) => day(e.occurredAt)))];
    // The items an arc pulled across a day: from the merge's day until the close's, they show ahead of the record.
    const early = new Map<string, [string, string]>(); // item → [the day it was pulled to, the day it came from]
    for (const [key, e] of told) {
      const r = real.get(key)!;
      if (day(e.occurredAt) !== day(r.occurredAt)) {
        const [lo, hi] = early.get(e.entityKey) ?? [day(e.occurredAt), day(r.occurredAt)];
        early.set(e.entityKey, [lo < day(e.occurredAt) ? lo : day(e.occurredAt), hi > day(r.occurredAt) ? hi : day(r.occurredAt)]);
      }
    }
    const ahead = (k: string, d: string) => { const x = early.get(k); return !!x && d >= x[0] && d < x[1]; };
    for (const d of days) {
      const lastOfDay = Math.max(...[...h.events, ...st.history.events].filter((e) => day(e.occurredAt) === d).map((e) => e.occurredAt));
      const at = lastOfDay + 1;
      const a = snapshotAt(h, at, 'knownThen');
      const b = snapshotAt(st.history, at, 'knownThen');
      const rows = (x: typeof a) => [...x.workItems].filter(([k]) => !ahead(k, d)).map(([k, w]) => [k, w.rawState, w.assigneeKey]);
      expect(rows(b)).toEqual(rows(a));
    }
  });

  it('reaches across a night: some arc in the fixtures pulls a close back from a later day', () => {
    // Not every bundle has one; across both, at least one does (the case real runs showed: merge, a break, close).
    const across = [...told].filter(([key, e]) => day(e.occurredAt) !== day(real.get(key)!.occurredAt));
    expect(across.every(([key]) => st.focus.get(key)?.startsWith('arc:'))).toBe(true);
  });

  it('is pure and memoised; a raw bundle has no story focus', () => {
    expect(storyTime(h, TZ)).toBe(st);
    expect(storyFocus(h) === undefined || st.history === h).toBe(true);
    expect(storyFocus(st.history)).toBe(st.focus);
  });
});

describe('working hours (05 §3, B-12)', () => {
  // 2026-10-02 is a Friday in Los Angeles; 07:00–19:00 on weekdays count.
  const at = (iso: string) => Date.parse(iso);
  it('counts weekdays 07:00–19:00 only: a night and a weekend are free', () => {
    expect(workingHours(at('2026-10-02T09:00:00-07:00'), at('2026-10-02T17:00:00-07:00'), TZ)).toBe(8);
    expect(workingHours(at('2026-10-02T18:00:00-07:00'), at('2026-10-05T08:00:00-07:00'), TZ)).toBe(2); // Fri 18:00 → Mon 08:00
    expect(workingHours(at('2026-10-05T09:00:00-07:00'), at('2026-10-07T09:00:00-07:00'), TZ)).toBe(24); // Mon 09:00 → Wed 09:00: the reach
  });
  it('is ARC_WORK_HOURS from a Friday afternoon merge to the next Tuesday afternoon', () => {
    expect(workingHours(at('2026-10-02T15:00:00-07:00'), at('2026-10-06T15:00:00-07:00'), TZ)).toBe(ARC_WORK_HOURS);
  });
});

describe('story time never moves work across what places it (22 C9 review)', () => {
  const POD = 'Brinewick\\Heron Pod';
  const SPRINT = 'Brinewick\\Sprint 3';
  const IN = { area: POD, iteration: SPRINT };
  // A PR serving Story 24201 merges on Tuesday at 10:00; work on the other pieces comes after it.
  const s = scenario('story-time-barriers', { project: 'Brinewick', tz: 'UTC', range: ['2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z'] })
    .area('Brinewick', 24000).area(POD, 24001, { favorite: true, defaultScope: true })
    .iteration(SPRINT, 24100, '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z')
    .repo('brine-api').person('oriel', 'Oriel Fane')
    .at('2026-11-02T09:00:00Z').story(24201, 'Tide gauges', { ...IN, assignee: 'oriel' }).story(24203, 'Buoy map', { area: POD, assignee: 'oriel' })
    .pr(24301, { repo: 'brine-api', author: 'oriel', title: 'Gauges', links: [24201] })
    .at('2026-11-03T10:00:00Z').completePr(24301)
    // A hotfix Bug made after the merge, linked to it, then closed.
    .at('2026-11-03T14:00:00Z').bug(24202, 'Gauge drift', { ...IN, assignee: 'oriel' }).linkPr(24301, 24202)
    .at('2026-11-03T15:00:00Z').state(24202, 'Active')
    .at('2026-11-03T16:00:00Z').state(24202, 'Closed')
    // A Story planned into the sprint after the merge, linked, then closed.
    .at('2026-11-03T14:30:00Z').moveIteration(24203, SPRINT).linkPr(24301, 24203)
    .at('2026-11-03T16:30:00Z').state(24203, 'Active').state(24203, 'Closed')
    // The arc itself still forms: the story already linked closes after the merge.
    .at('2026-11-03T17:00:00Z').state(24201, 'Active').state(24201, 'Closed')
    .build();
  const hh = toHistory(s, mapping, sprintScopes(s).find((x) => x.sprint === SPRINT)!);
  const k = scenarioKeys(s);
  const st = storyTime(hh, 'UTC');

  it('a close never lands before its piece is created, planned in, or linked: no arc then', () => {
    const end = snapshotAt(st.history, hh.range.endUtc - 1, 'knownThen');
    expect(end.workItems.get(k.wi(24202))?.rawState).toBe('Closed');
    expect(end.workItems.get(k.wi(24203))?.rawState).toBe('Closed');
    const arcOf = (id: number) => (st.history.events as AnyTimelineEvent[]).filter((e) => e.entityKey === k.wi(id)).map((e) => st.focus.get(e.eventKey)).filter(Boolean);
    expect(arcOf(24202)).toEqual([]);
    expect(arcOf(24203)).toEqual([]);
    expect(arcOf(24201).length).toBeGreaterThan(0); // the control: its arc forms
    // Each piece's work stays after what placed it.
    for (const id of [24202, 24203]) {
      const own = (st.history.events as AnyTimelineEvent[]).filter((e) => e.entityKey === k.wi(id) || (e.kind === 'link_pr_added' && e.payload.itemKey === k.wi(id)));
      const placedAt = Math.max(...own.filter((e) => e.kind !== 'wi_state_changed').map((e) => e.occurredAt));
      for (const e of own.filter((x) => x.kind === 'wi_state_changed')) expect(e.occurredAt).toBeGreaterThan(placedAt);
    }
  });
});

// AC-49 (U): protected moments (05 §5). A merge, or a Feature, Story, or Bug closing, protects its
// cast; accents in the same beat that would move the cast start after it, and the beat holds both.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { scenario, scenarioKeys, toHistory } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { protectBeat, protectedMoment } from '@shared/playback/protect';
import { mapping } from '../golden/helpers';

const orbit = scenarios[0]!;
const k = scenarioKeys(orbit);
const comet = toHistory(orbit, mapping);
const ember = toHistory(orbit, mapping, { project: 'Nimbus Deck', area: 'Nimbus Deck\\Ember Desk' });
const find = (h: ScopeHistory, kind: string, key: string, to?: string) =>
  (h.events as AnyTimelineEvent[]).find((e) => e.kind === kind && e.entityKey === key && (!to || (e.kind === 'wi_state_changed' && e.payload.to === to)))!;

describe('protectedMoment', () => {
  it('a merge with approvers protects the lane, the author, and the approvers for the whole formation', () => {
    const m = protectedMoment(comet, find(comet, 'pr_completed', k.pr(9001)))!;
    expect(m.windowMs).toBe(5100);
    expect(m.lane).toBe(true);
    expect([...m.people].sort()).toEqual([k.person('ava'), k.person('jo'), k.person('rafe')].sort());
  });

  it('a merge alone protects the lane and its author', () => {
    const m = protectedMoment(ember, find(ember, 'pr_completed', k.pr(9401)))!;
    expect(m.windowMs).toBe(2200);
    expect([...m.people]).toEqual([k.person('tove')]);
  });

  it('closings are protected; a Feature closing protects its whole system; resolving is not a closing', () => {
    const feature = protectedMoment(ember, find(ember, 'wi_state_changed', k.wi(131), 'Closed'))!;
    expect(feature.whole).toBe(true);
    const story = protectedMoment(ember, find(ember, 'wi_state_changed', k.wi(271), 'Closed'))!;
    expect(story.whole).toBe(false);
    expect([...story.entities]).toEqual([k.wi(271)]);
    expect(protectedMoment(ember, find(ember, 'wi_state_changed', k.wi(271), 'Resolved'))).toBeNull();
    expect(protectedMoment(ember, find(ember, 'wi_state_changed', k.wi(491), 'Closed'))).toBeNull(); // Tasks aren't
  });
});

describe('protectBeat', () => {
  it("orbit-week's two merges in one beat (they share Rafe) run one after the other", () => {
    const sch = buildBeatSchedule(comet, comet.range, orbit.tz);
    const beat = sch.beats.find((b) => b.eventKeys.includes(find(comet, 'pr_completed', k.pr(9003)).eventKey))!;
    const events = (comet.events as AnyTimelineEvent[]).filter((e) => beat.eventKeys.includes(e.eventKey));
    const { afterMs, durationMs } = protectBeat(comet, events);
    expect(durationMs).toBe(10_200);
    expect(beat.durationMs).toBe(10_200);
    expect([...afterMs.values()]).toEqual([5100]);
  });

  it('a launch in the merge beat waits for the formation; an unrelated stage change plays alongside', () => {
    const s = scenario('protect-same-beat', { project: 'P', tz: 'UTC', range: ['2026-09-14T00:00:00Z', '2026-09-21T00:00:00Z'] })
      .area('P', 1).area('P\\Team', 2, { favorite: true, defaultScope: true }).repo('r')
      .person('a', 'Ann Author').person('b', 'Ben Reviewer').person('c', 'Cy Elsewhere')
      .at('2026-09-01T00:00:00Z').feature(1, 'F', { area: 'P\\Team', state: 'Active' })
      .story(2, 'S', { parent: 1, state: 'Active', assignee: 'a' })
      .story(3, 'T', { parent: 1, state: 'New', assignee: 'c' })
      .at('2026-09-15T10:00:00Z').pr(10, { repo: 'r', author: 'a', title: 'one', links: [2] })
      .at('2026-09-16T10:00:00Z').completePr(10, { approvedBy: ['b'] }).pr(11, { repo: 'r', author: 'c', title: 'two', links: [3] }).state(3, 'Active')
      .build();
    const h = toHistory(s, mapping);
    const sk = scenarioKeys(s);
    const at = Date.parse('2026-09-16T10:00:00Z');
    const events = (h.events as AnyTimelineEvent[]).filter((e) => e.occurredAt === at);
    const { afterMs, durationMs } = protectBeat(h, events);
    const opened = events.find((e) => e.kind === 'pr_opened' && e.entityKey === sk.pr(11))!;
    const star = events.find((e) => e.kind === 'wi_state_changed' && e.entityKey === sk.wi(3))!;
    expect(afterMs.get(opened.eventKey)).toBe(5100); // it would re-spread the lane
    // Cy's own Story change would fly Cy's ship, but Cy isn't in the cast: it plays alongside.
    expect(afterMs.has(star.eventKey)).toBe(false);
    expect(durationMs).toBe(5100 + 2600);
  });
});

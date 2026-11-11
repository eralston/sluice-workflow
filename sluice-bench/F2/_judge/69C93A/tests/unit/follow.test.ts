// AC-23 (U): following a captain (05 §6): their anchors, and where the camera goes for each.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { scenarioKeys, toHistory } from '@fixtures/dsl';
import { followAnchors, latestAnchor } from '@shared/playback/follow';
import { mapping } from '../golden/helpers';

const s = scenarios[0]!;
const k = scenarioKeys(s);
const h = toHistory(s, mapping);

describe('followAnchors', () => {
  const ava = followAnchors(h, k.person('ava'));

  it('are assignments to the captain and PRs they open, in time order', () => {
    expect(ava.map((a) => a.kind)).toEqual(['assignment', 'assignment', 'pr', 'assignment', 'assignment']);
    expect([...ava].sort((a, b) => a.atUtc - b.atUtc)).toEqual(ava);
  });

  it('a PR goes to its first linked Story; an assignment to its Story', () => {
    const pr = ava.find((a) => a.kind === 'pr')!;
    expect(pr.body).toBe(k.wi(201));
    expect(pr.text).toContain('PR 9002 opened');
    expect(ava[1]!.body).toBe(k.wi(211));
  });

  it("an item in no scene (an uncharted Task) is outside this view: the camera stays", () => {
    const out = ava.find((a) => a.text.includes('Task #408'))!;
    expect(out.outside).toBe(true);
    expect(out.body).toBeNull();
  });

  it('an unlinked PR stays put, and is not outside', () => {
    const unlinked = followAnchors(h, k.person('rafe')).find((a) => a.text.includes('PR 9004'))!;
    expect(unlinked.body).toBeNull();
    expect(unlinked.outside).toBe(false);
  });

  it('latestAnchor picks the last at or before a time', () => {
    expect(latestAnchor(ava, ava[2]!.atUtc)).toBe(ava[2]);
    expect(latestAnchor(ava, ava[2]!.atUtc - 1)).toBe(ava[1]);
    expect(latestAnchor(ava, 0)).toBeUndefined();
  });
});

import { buildBeatSchedule } from '@shared/playback/schedule';
import { storyAnchors, storyOf } from '@shared/playback/follow';
import type { AnyTimelineEvent } from '@shared/contracts/events';

describe("a captain's story (decided 2026-10-04)", () => {
  const events = h.events as AnyTimelineEvent[];
  const inAva = storyOf(h, k.person('ava'));
  const find = (pred: (e: AnyTimelineEvent) => boolean) => events.find(pred)!;

  it('holds what they did, and what happened to their work', () => {
    expect(inAva(find((e) => e.kind === 'pr_opened' && e.entityKey === k.pr(9002)))).toBe(true); // her PR
    expect(inAva(find((e) => e.kind === 'pr_completed' && e.entityKey === k.pr(9001)))).toBe(true); // she approved it
    // Rafe resolving her Story 201: someone else's change to her work.
    expect(inAva(find((e) => e.kind === 'wi_state_changed' && e.entityKey === k.wi(201) && e.payload.to === 'Resolved'))).toBe(true);
  });

  it('leaves out other people\'s unrelated work', () => {
    expect(inAva(find((e) => e.kind === 'pr_opened' && e.entityKey === k.pr(9003)))).toBe(false); // Mina's PR
    expect(inAva(find((e) => e.kind === 'pr_opened' && e.entityKey === k.pr(9005)))).toBe(false); // Mina's KPI wiring
  });

  it('as a schedule, its gaps compress: shorter than the whole week, with only her beats', () => {
    const full = buildBeatSchedule(h, h.range, s.tz);
    const story = buildBeatSchedule(h, h.range, s.tz, { include: inAva });
    expect(story.beats.length).toBeLessThan(full.beats.length);
    expect(story.totalMs).toBeLessThan(full.totalMs);
    for (const b of story.beats) for (const key of b.eventKeys) expect(inAva(events.find((e) => e.eventKey === key)!)).toBe(true);
  });

  it('each story anchor names its Feature system (the stage); her uncharted Task is outside', () => {
    const anchors = storyAnchors(h, k.person('ava'));
    expect(anchors.find((a) => a.text.includes('PR 9002'))!.stage).toBe(k.wi(101));
    const out = anchors.find((a) => a.text.includes('Task #408'))!;
    expect(out.outside).toBe(true);
    expect(out.stage).toBeNull();
  });
});

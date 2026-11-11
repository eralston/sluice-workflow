// 14 §2.6 — the schedule hooks. With all three unset, or set to the v0 defaults, every v0 scenario's
// schedule is deep-equal to today's (the goldens in tests/golden/schedule.test.ts hold it to the
// byte). A chain's `pacing` is spread into the scene and highlight schedules, under their own filter.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { scenarioKeys, sprintScopes, toHistory } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { BeatSchedule } from '@shared/contracts/playback';
import type { SceneKey } from '@shared/contracts/view';
import { BACKLOG } from '@shared/hierarchy/backlog';
import { SPRINTS } from '@shared/hierarchy/sprints';
import type { Hierarchy } from '@shared/hierarchy/types';
import { buildHighlights, buildScene } from '@shared/playback/highlights';
import { buildBeatSchedule, focusOf, prLinkTimesOf, v0BeatShape, type ScheduleOptions } from '@shared/playback/schedule';
import { historyOf, mapping } from '../golden/helpers';

/** A schedule as plain data: its beats, its length, and its three maps sampled every 250 ms. */
function plain(sch: BeatSchedule, h: ScopeHistory) {
  const xs: number[] = [];
  for (let x = 0; x <= sch.totalMs; x += 250) xs.push(x);
  const ts = h.events.map((e) => e.occurredAt);
  return {
    totalMs: sch.totalMs, beats: sch.beats,
    toSource: xs.map((x) => sch.toSource(x)), stateUtc: xs.map((x) => sch.stateUtc(x)),
    toPresentation: ts.map((t) => sch.toPresentation(t)),
  };
}

/** The v0 behaviour, written as hooks. */
function v0Hooks(h: ScopeHistory, hier: Hierarchy = BACKLOG): Partial<ScheduleOptions> {
  const links = prLinkTimesOf(h, h.range.endUtc);
  return {
    priorityOf: (_h, e) => e.priority,
    focusOf: (hh, e, s) => focusOf(hh, e, s, links, hier),
    beatShape: v0BeatShape,
  };
}

describe('schedule hooks (14 §2.6)', () => {
  it.each(scenarios.map((s) => s.name))('%s: hooks unset, or set to the v0 defaults, give a deep-equal schedule', (name) => {
    const s = scenarios.find((x) => x.name === name)!;
    const h = historyOf(s);
    const base = plain(buildBeatSchedule(h, h.range, s.tz), h);
    expect(plain(buildBeatSchedule(h, h.range, s.tz, { priorityOf: undefined, focusOf: undefined, beatShape: undefined }), h)).toEqual(base);
    expect(plain(buildBeatSchedule(h, h.range, s.tz, v0Hooks(h)), h)).toEqual(base);
    // And under the Sprints hierarchy, whose focus differs.
    const sp = plain(buildBeatSchedule(h, h.range, s.tz, { hier: SPRINTS }), h);
    expect(plain(buildBeatSchedule(h, h.range, s.tz, { hier: SPRINTS, ...v0Hooks(h, SPRINTS) }), h)).toEqual(sp);
  });

  const k = scenarioKeys(sprintMechanics);
  const S41 = toHistory(sprintMechanics, mapping, sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!);
  const pod = SPRINTS.format({ level: 'pod', key: k.area('Halcyon Reach\\Comet Pod') }) as SceneKey;

  it('a chain with no pacing, or an empty one, plays the same scene and highlights', () => {
    const empty: Hierarchy = { ...SPRINTS, pacing: () => ({}) };
    expect(plain(buildScene(S41, S41.range, sprintMechanics.tz, pod, empty), S41)).toEqual(plain(buildScene(S41, S41.range, sprintMechanics.tz, pod, SPRINTS), S41));
    expect(plain(buildHighlights(S41, S41.range, sprintMechanics.tz, pod, empty), S41)).toEqual(plain(buildHighlights(S41, S41.range, sprintMechanics.tz, pod, SPRINTS), S41));
  });

  it('each hook is used when set', () => {
    const s = scenarios[0]!;
    const h = historyOf(s);
    const base = buildBeatSchedule(h, h.range, s.tz);
    // Priority: all Low means nothing is accented.
    const quiet = buildBeatSchedule(h, h.range, s.tz, { priorityOf: () => 'low' });
    expect(quiet.beats.every((b) => !b.accented && b.priority === 'low')).toBe(true);
    // Focus: one shared focus groups everything inside the window into fewer beats.
    const one = buildBeatSchedule(h, h.range, s.tz, { focusOf: () => k.wi(1) });
    expect(one.beats.length).toBeLessThan(base.beats.length);
    // Shape: every accented beat takes the hook's length.
    const flat = buildBeatSchedule(h, h.range, s.tz, { beatShape: () => ({ afterMs: new Map(), durationMs: 700 }) });
    expect(flat.beats.filter((b) => b.accented).length).toBeGreaterThan(0);
    expect(flat.beats.every((b) => b.durationMs === (b.accented ? 700 : 0))).toBe(true);
  });

  it('a chain’s pacing reaches the scene and highlight schedules, under their own filter', () => {
    let calls = 0;
    const beatShape = (_h: ScopeHistory, events: AnyTimelineEvent[]) => { calls += events.length; return { afterMs: new Map<string, number>(), durationMs: 900 }; };
    const shaped: Hierarchy = { ...SPRINTS, pacing: () => ({ beatShape }) };
    // The same hook, plus an include that the scene's own filter overrides, and a budget that only the
    // highlights' own overrides (a chain may set its episode's budget).
    const greedy: Hierarchy = { ...SPRINTS, pacing: () => ({ beatShape, include: () => true }) };
    const tight: Hierarchy = { ...SPRINTS, pacing: () => ({ beatShape, budgetMs: 1 }) };
    const sch = buildScene(S41, S41.range, sprintMechanics.tz, pod, shaped);
    expect(calls).toBeGreaterThan(0);
    expect(sch.beats.map((b) => b.eventKeys)).toEqual(buildScene(S41, S41.range, sprintMechanics.tz, pod, SPRINTS).beats.map((b) => b.eventKeys));
    expect(sch.beats.some((b) => b.accented)).toBe(true);
    expect(sch.beats.filter((b) => b.accented).every((b) => b.durationMs === 900)).toBe(true);
    expect(plain(buildScene(S41, S41.range, sprintMechanics.tz, pod, greedy), S41)).toEqual(plain(sch, S41));
    const hl = buildHighlights(S41, S41.range, sprintMechanics.tz, pod, shaped);
    expect(hl.beats.map((b) => b.eventKeys)).toEqual(buildHighlights(S41, S41.range, sprintMechanics.tz, pod, SPRINTS).beats.map((b) => b.eventKeys));
    expect(plain(buildHighlights(S41, S41.range, sprintMechanics.tz, pod, greedy), S41)).toEqual(plain(hl, S41));
    expect(plain(buildHighlights(S41, S41.range, sprintMechanics.tz, pod, tight), S41)).toEqual(plain(hl, S41));
    const cut = buildScene(S41, S41.range, sprintMechanics.tz, pod, tight);
    expect(cut.beats.filter((b) => b.accented).length).toBeLessThan(sch.beats.filter((b) => b.accented).length);
  });

  it('over budget, a beat that plays an essential moment is never cut, as a High one isn’t (2026-10-13)', () => {
    const essential = (_h: ScopeHistory, _e: AnyTimelineEvent[]) => ({ afterMs: new Map<string, number>(), durationMs: 900, essential: true });
    const kept: Hierarchy = { ...SPRINTS, pacing: () => ({ beatShape: essential, budgetMs: 1 }) };
    const all = buildScene(S41, S41.range, sprintMechanics.tz, pod, { ...SPRINTS, pacing: () => ({ beatShape: essential }) });
    const sch = buildScene(S41, S41.range, sprintMechanics.tz, pod, kept);
    expect(sch.beats.filter((b) => b.priority !== 'high').length).toBeGreaterThan(0);
    expect(sch.beats.map((b) => b.accented)).toEqual(all.beats.map((b) => b.accented));
  });
});

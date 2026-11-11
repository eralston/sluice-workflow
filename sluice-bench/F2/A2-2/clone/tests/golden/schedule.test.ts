// AC-17 (G): beat schedule totals, plus the full schedule of each scenario as a golden file.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { buildHighlights, sceneEntityKeys, touches } from '@shared/playback/highlights';
import { DESKTOP } from '@shared/profile/bundled';
import type { SceneKey } from '@shared/contracts/view';
import { toHistory } from '@fixtures/dsl';
import { historyOf, mapping } from './helpers';

const byName = Object.fromEntries(scenarios.map((s) => [s.name, s]));
const scheduleOf = (name: string) => {
  const s = byName[name]!;
  const h = historyOf(s);
  return { h, sch: buildBeatSchedule(h, h.range, s.tz) };
};

describe('beat schedule (05 §3)', () => {
  it.each(scenarios.map((s) => s.name))('%s matches its golden schedule', async (name) => {
    const { sch } = scheduleOf(name);
    const golden = {
      totalMs: Math.round(sch.totalMs),
      beats: sch.beats.map((b) => ({ ...b, presentationStartMs: Math.round(b.presentationStartMs), sourceUtc: new Date(b.sourceUtc).toISOString(), firstUtc: new Date(b.firstUtc).toISOString() })),
    };
    await expect(JSON.stringify(golden, null, 2) + '\n').toMatchFileSnapshot(`./__golden__/${name}.schedule.json`);
  });

  it.each(scenarios.map((s) => s.name))('%s: the highlights of its busiest Feature match their golden schedule (05 §3)', async (name) => {
    const s = byName[name]!;
    const h = historyOf(s);
    // The Feature whose scene the most in-range events touch.
    const inRange = h.events.filter((e) => e.occurredAt >= h.range.startUtc);
    const features = h.entities.workItems.filter((w) => w.type === 'Feature').map((w) => `feature:${w.key}` as SceneKey);
    const count = (scene: SceneKey) => inRange.filter((e) => touches(e, sceneEntityKeys(h, scene))).length;
    if (!features.length) return; // a pod that plans by sprint has no Features of its own (sprint-pods)
    const scene = features.sort((a, b) => count(b) - count(a) || (a < b ? -1 : 1))[0]!;
    const sch = buildHighlights(h, h.range, s.tz, scene);
    const highOnly = sch.beats.every((b) => b.priority === 'high' || !b.accented);
    expect(sch.totalMs <= DESKTOP.pacing.highlightBudgetMs || highOnly).toBe(true); // High beats are never cut
    const golden = {
      scene, totalMs: Math.round(sch.totalMs),
      beats: sch.beats.map((b) => ({ index: b.index, sourceUtc: new Date(b.sourceUtc).toISOString(), priority: b.priority, accented: b.accented, presentationStartMs: Math.round(b.presentationStartMs), events: b.eventKeys.length })),
    };
    await expect(JSON.stringify(golden, null, 2) + '\n').toMatchFileSnapshot(`./__golden__/${name}.highlights.json`);
  });

  it('AC-17: orbit-week takes 35–45 s at 1× (tightened from 60 s, 2026-10-09), and ×2 / ×4 at ½× / ¼×', () => {
    const { sch } = scheduleOf('orbit-week');
    expect(sch.totalMs).toBeGreaterThanOrEqual(35_000);
    expect(sch.totalMs).toBeLessThanOrEqual(DESKTOP.pacing.budgetMs);
    expect(sch.beats.filter((b) => b.priority === 'high').every((b) => b.accented)).toBe(true); // Medium accents may go; High never
    // Rates only rescale wall time: the schedule itself is in 1× ms.
    expect(sch.totalMs / 0.5).toBeCloseTo(sch.totalMs * 2, 6);
    expect(sch.totalMs / 0.25).toBeCloseTo(sch.totalMs * 4, 6);
  });

  it('AC-17: quiet-week takes under 30 s', () => {
    expect(scheduleOf('quiet-week').sch.totalMs).toBeLessThan(30_000);
  });

  it('AC-17: the busy Lantern Squad week (Story 251: 21 Tasks, 5 PRs, 3 people) runs about 45 s', () => {
    const s = byName['orbit-week']!;
    const h = toHistory(s, mapping, { project: 'Nimbus Deck', area: 'Nimbus Deck\\Lantern Squad' });
    const sch = buildBeatSchedule(h, h.range, s.tz);
    expect(sch.totalMs).toBeGreaterThanOrEqual(40_000);
    expect(sch.totalMs).toBeLessThanOrEqual(DESKTOP.pacing.budgetMs);
  });

  it('AC-17: busy-week fits in about 45 s with some accents dropped (High beats alone set a floor a little above it), every event still applied, and no High beat cut', () => {
    const { h, sch } = scheduleOf('busy-week');
    expect(sch.totalMs).toBeLessThanOrEqual(DESKTOP.pacing.budgetMs * 1.1);
    const scheduled = sch.beats.flatMap((b) => b.eventKeys);
    const inRange = h.events.filter((e) => e.occurredAt >= h.range.startUtc && e.occurredAt < h.range.endUtc).map((e) => e.eventKey);
    expect(scheduled).toEqual(inRange);
    expect(sch.beats.some((b) => !b.accented && b.priority !== 'low')).toBe(true);
    expect(sch.beats.filter((b) => b.priority === 'high').every((b) => b.accented)).toBe(true);
  });

  it('busy-week would run far past the budget with every accent (the budget is exercised)', () => {
    const { sch } = scheduleOf('busy-week');
    const cut = sch.beats.filter((b) => !b.accented && b.priority !== 'low').length;
    expect(cut).toBeGreaterThan(5);
  });

  it.each(scenarios.map((s) => s.name))('%s: toSource is monotonic, and state only changes at beats', (name) => {
    const { h, sch } = scheduleOf(name);
    let prev = -Infinity;
    for (let x = 0; x <= sch.totalMs; x += 25) {
      const t = sch.toSource(x);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(sch.stateUtc(0)).toBe(h.range.startUtc - 1);
    for (const b of sch.beats) {
      expect(sch.stateUtc(b.presentationStartMs)).toBeGreaterThanOrEqual(b.sourceUtc);
      expect(sch.toPresentation(b.firstUtc)).toBeLessThanOrEqual(b.presentationStartMs + 1e-6);
    }
  });
});

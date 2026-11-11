// The pacing ledger (v1.4 C1): deterministic, and its sums match the schedule the app plays.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import meridian from '@fixtures/scenarios/v1/meridian-sprint';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import { SOLAR } from '@shared/hierarchy/solar';
import { buildScene, buildHighlights } from '@shared/playback/highlights';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { BUNDLED, DESKTOP } from '@shared/profile/bundled';
import { scenarios } from '@fixtures/scenarios';
import { mapping } from '../golden/helpers';
import { storyFocus } from '@shared/playback/storyTime';
import { COMET_STORY_YARDSTICK_MS, buildLedger, renderMarkdown, resolvePods } from '../../scripts/pacing-ledger';

const DIR = resolve(__dirname, '../../docs/progress/v1.4');
const a = buildLedger();

describe('the pacing ledger', () => {
  it('is deterministic: two builds give identical JSON and markdown', () => {
    const b = buildLedger();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(renderMarkdown(b)).toBe(renderMarkdown(a));
  }, 30_000); // a full build takes about 2 s alone, more on a loaded machine

  it('lists the seven pods, Meteor last', () => {
    expect(a.pods.map((p) => p.label)).toEqual(['Comet Pod', 'Nova Pod', 'Quasar Pod', 'Pulsar Pod', 'Convoy Planning Pod', 'Harbor Pod', 'Meteor Pod']);
    for (const p of a.pods) expect(p.uncappedMs).toBeGreaterThanOrEqual(p.totalMs);
  });

  it("each pod's total matches the schedule's length, and its parts sum", () => {
    const h = toHistory(meridian, mapping, sprintScopes(meridian).find((x) => x.sprint.endsWith('Sprint 7'))!);
    const pod = (h.scope.sector as unknown as { pods: { areaKey: CanonicalKey; path: string }[] }).pods.find((p) => p.path.endsWith('Convoy Planning Pod'))!;
    const sch = buildScene(h, h.range, meridian.tz, `pod:${pod.areaKey}` as never, SOLAR);
    const m = a.pods.find((p) => p.label === 'Convoy Planning Pod')!;
    expect(Math.abs(m.wallMs - sch.wallMs) / sch.wallMs).toBeLessThanOrEqual(0.01);
    expect(m.beats.played).toBe(sch.beats.filter((b) => b.durationMs > 0).length);
    for (const p of a.pods) {
      const f = p.frame;
      expect(f.orientMs + f.gapMs + f.dayTurnMs + f.tailGapMs + f.finalHoldMs + f.beatsMs).toBe(p.totalMs);
      expect(p.playing.playingMs + p.held.queueIdleMs + p.held.noteHoldMs).toBe(f.beatsMs);
      expect(p.waits.maneuvers).toBe(Object.values(p.waits.byCause).reduce((s, c) => s + c.count, 0));
    }
  }, 30_000);

  it('its App column is each pod in story time, as the app plays it (block E audit), and the busy pods are inside the target', () => {
    const story = resolvePods({ story: true, all: true });
    for (const p of a.pods) {
      const sp = story.find((x) => x.label === p.label)!;
      expect(storyFocus(sp.h), p.label).toBeDefined(); // a story-timed bundle, as `presented` gives the app
      const sch = buildScene(sp.h, sp.h.range, sp.tz, sp.scene as never, SOLAR);
      expect(p.story.wallMs, p.label).toBe(Math.round(sch.wallMs));
    }
    for (const n of ['Quasar Pod', 'Pulsar Pod']) expect(a.pods.find((p) => p.label === n)!.story.wallMs, n).toBeLessThanOrEqual(300_000);
    expect(renderMarkdown(a)).toContain(`Comet's yardstick in story time is ${(COMET_STORY_YARDSTICK_MS / 1000).toFixed(1)} s`);
  }, 60_000);

  it('has the committed ledger files, a table per pod', () => {
    const md = resolve(DIR, 'pacing-ledger.md'), js = resolve(DIR, 'pacing-ledger.json');
    expect(existsSync(md)).toBe(true);
    const text = readFileSync(md, 'utf8');
    const committed = JSON.parse(readFileSync(js, 'utf8')) as { pods: { label: string }[] };
    expect(committed.pods.map((p) => p.label)).toEqual(a.pods.map((p) => p.label));
    for (const p of committed.pods) {
      const i = text.indexOf(`## ${p.label} (`);
      expect(i, p.label).toBeGreaterThanOrEqual(0);
      const next = text.indexOf('\n## ', i + 1);
      expect(text.slice(i, next < 0 ? undefined : next)).toMatch(/^\|/m);
    }
  });
});

describe('pacing through the device profile (C4b)', () => {
  const pulsar = resolvePods().find((p) => p.label === 'Pulsar Pod')!;
  const { h } = pulsar, tz = pulsar.tz;
  const scene = pulsar.scene as never;

  it('buildBeatSchedule with no options equals one given the desktop budget', () => {
    const plain = buildBeatSchedule(h, h.range, tz);
    const given = buildBeatSchedule(h, h.range, tz, { budgetMs: DESKTOP.pacing.budgetMs });
    expect(JSON.stringify(given)).toBe(JSON.stringify(plain));
  }, 30_000);

  // Pulsar (the Solar hierarchy) is bound by its maneuver floor, not the budget: 45 s, 30 s and 5 s all
  // give 702 s. So the phone's effect is asserted where the budget bites, on orbit-week (Backlog).
  it("orbit-week's phone schedule is shorter than desktop's and keeps no more accents", () => {
    const s = scenarios.find((x) => x.name === 'orbit-week')!;
    const oh = toHistory(s, mapping);
    const run = (budgetMs: number) => buildBeatSchedule(oh, oh.range, s.tz, { budgetMs });
    const d = run(DESKTOP.pacing.budgetMs), ph = run(BUNDLED.phone.pacing.budgetMs);
    expect(ph.totalMs).toBeLessThan(d.totalMs);
    expect(ph.beats.filter((b) => b.accented).length).toBeLessThanOrEqual(d.beats.filter((b) => b.accented).length);
    expect(ph.beats.filter((b) => b.priority === 'high').every((b) => b.accented)).toBe(true); // High never cut
  }, 30_000);

  it("a scene's own call with no budget equals the desktop budget, and highlights take the profile's", () => {
    expect(JSON.stringify(buildScene(h, h.range, tz, scene, SOLAR))).toBe(JSON.stringify(buildScene(h, h.range, tz, scene, SOLAR, undefined, DESKTOP.pacing.budgetMs)));
    const hd = buildHighlights(h, h.range, tz, scene, SOLAR);
    const hp = buildHighlights(h, h.range, tz, scene, SOLAR, BUNDLED.phone.pacing.highlightBudgetMs);
    expect(hp.totalMs).toBeLessThanOrEqual(hd.totalMs);
  }, 30_000);

  it('the ledger takes the budget from a profile, and none leaves it unchanged', () => {
    const l = buildLedger({ profile: BUNDLED.phone });
    expect(l.pods.every((p) => p.budgetMs === BUNDLED.phone.pacing.budgetMs)).toBe(true);
    expect(JSON.stringify(buildLedger({ profile: DESKTOP }).pods.map((p) => p.totalMs))).toBe(JSON.stringify(a.pods.map((p) => p.totalMs)));
  }, 60_000);
});

// 27 E5c, R13 / 05 §8.5c: a montage moment names no crew, so its one plate is the only name it has. 27 E10 (P-24)
// folds more of them, so the guard covers every pod: each beat that plays a plate-lit montage (`MONTAGE_BEATS`,
// found with scripts/pacing-ledger's planOf in story time, as the app plays, and pinned to it by director.test.ts)
// is in the app's schedule and draws its note on screen. The list reads days in the scenario's zone and the app in
// the viewer's (`STORY_TZ`); they agree on America/Los_Angeles, where this runs. The
// plate finds a place even in a crowded corner (2026-09-14T22:17Z, PR #20313, was hidden for want of a clear
// one). One test per pod with beats, each in a fresh app. Fixture data only (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';
import { MONTAGE_BEATS } from './montageBeats';

type Reach = (page: Page) => Promise<void>;
const sceneIs = (page: Page, prefix: string) => page.waitForFunction((p) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(p), prefix, { timeout: 30_000 });

/** How to reach each pod: its env, then the clicks from the galaxy to the pod. */
const PODS: Record<string, { env: Record<string, string>; reach: Reach }> = {
  'Quasar Pod': { env: { STAR_CHART_PARADIGM: 'solar' }, reach: halcyon('Quasar Pod') },
  'Pulsar Pod': { env: { STAR_CHART_PARADIGM: 'solar' }, reach: halcyon('Pulsar Pod') },
  'Convoy Planning Pod': {
    env: { STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'meridian-sprint' },
    reach: async (page) => {
      await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).first().click();
      await page.locator('.chooser button', { hasText: 'Sprint 7' }).click();
      await toPod(page, 'Convoy Planning Pod');
    },
  },
  'Harbor Pod': {
    env: { STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint' },
    reach: async (page) => {
      await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
      await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
      await toPod(page, 'Harbor Pod');
    },
  },
};

function halcyon(pod: string): Reach {
  return async (page) => {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await toPod(page, pod);
  };
}
/** From a sprint's scene into a pod: wait for the sprint, then double-click the pod. */
async function toPod(page: Page, pod: string): Promise<void> {
  await sceneIs(page, 'sprint:');
  await settle(page);
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await sceneIs(page, 'pod:');
  await settle(page);
}

for (const [label, isos] of Object.entries(MONTAGE_BEATS)) {
  if (!isos.length) continue;
  test(`${label}: every montage beat draws the note that names its cause`, async () => {
    test.setTimeout(180_000);
    const pod = PODS[label]!;
    const { app, page }: { app: ElectronApplication; page: Page } = await launchApp(pod.env);
    try {
      await pod.reach(page);
      const box = (await page.locator('.chart-host canvas').boundingBox())!;
      await page.mouse.move(box.x + 6, box.y + box.height - 6);
      await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); t.pause(); });
      const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
      const undrawn: string[] = [], absent: string[] = [];
      for (const iso of isos) {
        // Match within a second, so a few ms of clock rounding can't miss a beat.
        const b = beats.find((x) => Math.abs(x.sourceUtc - Date.parse(iso)) < 1000);
        // The list is the app's own schedule (story time, block E audit), so a listed beat the app doesn't play is a failure.
        if (!b) { absent.push(iso); continue; }
        await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), b.startMs - 1);
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__starChartTest!.stepBeat());
        let drawn = false;
        for (let i = 0; i < 24 && !drawn; i++) {
          await page.waitForTimeout(125);
          drawn = await page.evaluate(() => {
            const ns = Object.values(window.__starChartTest!.annotations().notes).map((n) => n.text.trim());
            return [...document.querySelectorAll<HTMLElement>('.holo__note')].some((el) => ns.includes((el.textContent ?? '').trim()) && el.getBoundingClientRect().width > 0);
          });
        }
        if (!drawn) undrawn.push(iso);
        await page.evaluate(() => window.__starChartTest!.pause());
      }
      expect(absent, 'listed montage beats missing from the app\'s schedule').toEqual([]);
      expect(undrawn).toEqual([]);
    } finally {
      await app?.close();
    }
  });
}

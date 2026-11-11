import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { launchApp, frames, settle } from './launch';

// 23 C7: with the atlas flag on, asteroids draw from the baked sheet: it loads, sprites are used, and no
// view falls back for a missing frame (steps drawn, contact arrivals and the like stay procedural by design).
test('the asteroid atlas path renders with its flag on, no missing frames', async () => {
  const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint' });
  try {
    await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
    await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(page);
    await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await settle(page);
    expect(await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'objective'))).toBe(true);
    await page.evaluate(() => window.__starChartTest!.setAtlasAsteroids(true));
    await page.evaluate(() => window.__starChartTest!.remount());
    await frames(page, 4);
    const s = await page.evaluate(() => window.__starChartTest!.atlasStats());
    expect(s.missing).toBe(0);
    expect(s.hits).toBeGreaterThan(0);
    mkdirSync('review/v1.3/C', { recursive: true });
    await page.screenshot({ path: 'review/v1.3/C/C7-pod-atlas-on.png' });
    await page.evaluate(() => window.__starChartTest!.setAtlasAsteroids(false));
  } finally {
    await app.close();
  }
});

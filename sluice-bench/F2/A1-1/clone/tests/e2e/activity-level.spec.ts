// Activity (05 §5, decided 2026-10-09): how much the ships do. At Maximum every Medium-or-better change
// has a ship at work on it, in parallel, so the chart keeps moving between the big moments; Calm is
// the pace before the dial. Measured on the fx census while a Feature system plays, and through the
// ⋯ menu. Test runs start at Calm.
import { expect, test } from '@playwright/test';
import { enterNodeByKey, keyOf, launchApp, openCometCrew } from './launch';

test.describe.configure({ timeout: 120_000 });

type Level = 'calm' | 'lively' | 'maximum';

test('Activity (E): Maximum keeps ships and tractor beams at work far more of the time than Calm; the ⋯ menu sets it', async () => {
  const { app, page } = await launchApp();
  try {
    await openCometCrew(page);
    await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
    const census = () => page.evaluate(() => window.__starChartTest!.fxCensus());
    const ended = () => page.evaluate(() => window.__starChartTest!.session().status === 'ended');
    /** Play the whole scene at 4× and sample: how often a beam is up, and the most at once. */
    const playThrough = async (level: Level) => {
      await page.evaluate((l) => { window.__starChartTest!.setActivity(l); window.__starChartTest!.setScheduleMs(0); }, level);
      await page.waitForTimeout(150);
      await page.evaluate(() => { window.__starChartTest!.setRate(4); window.__starChartTest!.play(); });
      let samples = 0;
      let withBeam = 0;
      let peak = 0;
      let guests = 0;
      const first = (await census()).started;
      for (let i = 0; i < 400 && !(await ended()); i++) {
        const c = await census();
        samples++;
        if (c.beams > 0) withBeam++;
        peak = Math.max(peak, c.beams);
        guests = Math.max(guests, c.guests);
        await page.waitForTimeout(50);
      }
      await page.evaluate(() => window.__starChartTest!.pause());
      return { share: withBeam / Math.max(1, samples), peak, guests, started: (await census()).started - first };
    };
    const calm = await playThrough('calm');
    const maximum = await playThrough('maximum');
    console.log('activity', JSON.stringify({ calm, maximum }));
    expect(maximum.started).toBeGreaterThan(calm.started * 1.5); // many more ship actions begin over the same week
    expect(maximum.share).toBeGreaterThan(calm.share);
    expect(maximum.peak).toBeGreaterThanOrEqual(calm.peak);
    expect(maximum.share).toBeGreaterThan(0.5); // more than half the time, somebody is working something

    // The ⋯ menu offers the three levels and the choice sticks.
    await page.locator('.transport__more').click();
    const group = page.locator('.transport__activity');
    await expect(group.locator('button')).toHaveText(['Calm', 'Lively', 'Maximum']);
    await group.locator('button', { hasText: 'Lively' }).click();
    await expect(group.locator('button', { hasText: 'Lively' })).toHaveAttribute('aria-checked', 'true');
    await expect(group.locator('button', { hasText: 'Maximum' })).toHaveAttribute('aria-checked', 'false');
    await page.screenshot({ path: 'test-results/activity-menu.png' });
  } finally {
    await app.close();
  }
});

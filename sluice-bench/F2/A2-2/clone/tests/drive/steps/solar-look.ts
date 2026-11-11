// Stills for a visual review of the solar region (fixture data only, INV-18): the fitted region at the end of
// the round, then partway through playing. Run with --paradigm solar.
import type { Drive } from '../drive';

export default async function solarLook(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  const sprint13 = page.locator('.chooser button', { hasText: 'Sprint 13' });
  if (await sprint13.count()) await sprint13.first().click();
  else await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.waitForTimeout(900);
  await d.shot('region-end');
  await page.keyboard.press('Home');
  await page.evaluate(() => { window.__starChartTest!.setRate(2); window.__starChartTest!.play(); });
  await page.waitForTimeout(9000);
  await d.shot('playing-mid');
}

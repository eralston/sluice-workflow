// Repro walk for a camera error seen in a dev run (2026-10-12): in a solar region, tap pieces
// (objectives, threats, seats, facilities, captains), stopped and while playing, and record any
// page errors. Run with --paradigm solar. Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function solarTap(d: Drive): Promise<void> {
  const { page } = d;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}\n${e.stack ?? ''}`));
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
  await page.waitForTimeout(800);

  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const tapAll = async (round: string) => {
    for (const kind of ['objective', 'threat', 'seat', 'facility', 'captain']) {
      const keys = await page.evaluate((k) => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === k).map((n) => n.canonicalKey).slice(0, 4), kind);
      for (const key of keys) {
        const p = await page.evaluate((k) => window.__starChartTest!.screenOf(k), key);
        if (!p) continue;
        await page.mouse.click(box.x + p.x, box.y + p.y);
        await page.waitForTimeout(700);
        d.note(`${round} tap ${kind}: errors so far ${errors.length}`);
      }
    }
    await d.shot(`after-${round}`);
  };
  await tapAll('stopped');
  await page.keyboard.press('Home');
  await page.evaluate(() => window.__starChartTest!.play());
  await tapAll('playing');
  d.note(`page errors: ${errors.length}`);
  for (const e of [...new Set(errors)].slice(0, 5)) d.note(e);
}

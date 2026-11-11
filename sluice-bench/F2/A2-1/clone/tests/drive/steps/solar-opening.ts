// An episode's opening (2026-10-13, run with --paradigm solar): on pod-sprint's Harbor Pod, from the
// start, press Play and shoot every 300 ms: the star breathes (the planets are already there), then what
// was already there makes its entrance seat by seat (asteroids curve in round their planets, hive ships
// come through rifts, captains drop out of warp), and the stations' tenders muster. Fixture data only.
import type { Drive } from '../drive';

export default async function solarOpening(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); t.pause(); t.setScheduleMs(0); });
  await page.waitForTimeout(800);
  await d.shot('opening-before');
  await page.evaluate(() => window.__starChartTest!.play());
  for (let i = 0; i < Number(process.env.OPEN_SHOTS ?? 14); i++) {
    await page.waitForTimeout(300);
    await d.shot(`opening-${String(i).padStart(2, '0')}`);
  }
  d.note(`first beat at ${await page.evaluate(() => window.__starChartTest!.beatTimes()[0]?.startMs)} ms`);
}

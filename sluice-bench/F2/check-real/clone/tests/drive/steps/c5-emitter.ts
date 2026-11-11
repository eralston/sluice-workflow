// 23 C5: stills of a station's beam leaving its emitter. Scans Harbor Pod's beats for one whose
// stepping puts a beam on screen, and shoots it. Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function c5(d: Drive): Promise<void> {
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
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes().map((b) => b.startMs));
  let shots = 0;
  for (const ms of beats) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), ms);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    for (let i = 0; i < 16 && shots < 6; i++) {
      await page.waitForTimeout(250);
      const beams = await page.evaluate(() => window.__starChartTest!.fxCensus().beams);
      if (beams > 0) { await d.shot(`beam-${ms}-${i}`); shots++; }
    }
    if (shots >= 6) break;
  }
  d.note(`beam stills: ${shots}`);
}

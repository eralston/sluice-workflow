// The board at rest (2026-10-12, run with --paradigm solar): on pod-sprint's Harbor Pod, seek to a
// busy moment, pause, and shoot every 1.5 s while nothing plays: the idle life of the scene (spinning
// asteroids, welding glints, hive eyes and limbs, captains' idle work, the star's breath, engines at
// rest). Logs the live effects with each shot. Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function solarIdle(d: Drive): Promise<void> {
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
  const at = Number(process.env.IDLE_AT ?? 0.35);
  await page.evaluate((k) => { const t = window.__starChartTest!; t.setReduced(false); t.setScheduleMs(t.beatTimes().at(-1)!.startMs * k); }, at);
  // Zoom in on the right of the board, where the hive ships are (IDLE_ZOOM wheel steps).
  for (let i = 0; i < Number(process.env.IDLE_ZOOM ?? 0); i++) {
    await page.mouse.move(box.x + box.width * Number(process.env.IDLE_ZX ?? 0.62), box.y + box.height * Number(process.env.IDLE_ZY ?? 0.5));
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
  }
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.waitForTimeout(2500);
  const t0 = Date.now();
  for (let i = 0; i < Number(process.env.IDLE_SHOTS ?? 20); i++) {
    await d.shot(`idle-${String(i).padStart(2, '0')}`);
    d.note(`idle-${String(i).padStart(2, '0')} +${((Date.now() - t0) / 1000).toFixed(1)}s ${JSON.stringify(await page.evaluate(() => { const c = window.__starChartTest!.fxCensus() as Record<string, number>; return { live: window.__starChartTest!.liveCommands(), idle: c.idle }; }))}`);
    await page.waitForTimeout(1500);
  }
}

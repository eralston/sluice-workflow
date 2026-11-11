// A station's arrival and its life at rest (2026-10-12, run with --paradigm solar): on pod-sprint's
// Harbor Pod, find the beat where the first station comes in, step it at 1× and shoot it every 400 ms
// (the summoner flies through the spot without stopping and gives one call blip, and the station jumps in at that instant, 27 F2). Then hold on the
// board and shoot it every 8 s: the hull's slow drift and its tenders' patrol. Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function solarStation(d: Drive): Promise<void> {
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

  const arrival = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const b of t.beatTimes()) {
      t.setScheduleMs(b.startMs + 1);
      await frame();
      const f = t.viewGraph()!.nodes.find((n) => n.kind === 'facility');
      if (f) return { startMs: b.startMs, label: f.label };
    }
    return null;
  });
  if (!arrival) { d.note('no station arrives'); return; }
  d.note(`arrival: "${arrival.label}" at ${arrival.startMs} ms`);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), arrival.startMs);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__starChartTest!.stepBeat());
  for (let i = 0; i < Number(process.env.STATION_SHOTS ?? 12); i++) {
    await page.waitForTimeout(400);
    await d.shot(`arrive-${String(i).padStart(2, '0')}`);
  }
  // Later, with several tenders out: hold and watch them patrol.
  await page.evaluate(() => { const t = window.__starChartTest!; t.setScheduleMs(t.beatTimes().at(-1)!.startMs * 0.55); });
  for (let i = 0; i < Number(process.env.IDLE_SHOTS ?? 4); i++) {
    await page.waitForTimeout(i ? 8000 : 1500);
    await d.shot(`idle-${String(i).padStart(2, '0')}`);
  }
}

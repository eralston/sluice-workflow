// The board in the orbit (06 §3, 2026-10-09): Feature 101's system at the start, middle and end of
// orbit-week, then a stretch of play at 1× to watch bodies travel along their rings.
import type { Drive } from '../drive';

export default async function (d: Drive): Promise<void> {
  await d.openFeature101();
  await d.settle();
  const at = (x: number) => d.page.evaluate((v) => window.__starChartTest!.setScheduleMs(v), x);
  const total = await d.page.evaluate(() => window.__starChartTest!.session().totalMs);
  for (const f of [0.02, 0.5, 1]) {
    await at(total * f);
    await d.page.waitForTimeout(400);
    await d.shot(`feature101-${Math.round(f * 100)}pct`);
  }
  await at(0);
  await d.page.evaluate(() => { window.__starChartTest!.setActivity('maximum'); window.__starChartTest!.setRate(1); window.__starChartTest!.play(); });
  for (let i = 0; i < 12; i++) {
    await d.page.waitForTimeout(1500);
    await d.shot(`play-${i}`);
  }
  await d.dump('end');
}

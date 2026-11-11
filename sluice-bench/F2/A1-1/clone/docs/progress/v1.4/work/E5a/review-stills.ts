// Reviewer drive (E5a round 1): Quasar Pod, each beat stepped into (seek to just before it, then Step: exactly
// that beat plays, as solar-play's stepInto), shot partway through. Fixture data only (INV-18).
import type { Drive } from '../../../../../tests/drive/drive';

export default async function review(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); t.pause(); });
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  d.note(`beats ${beats.length}; total ${(await page.evaluate(() => window.__starChartTest!.session())).totalMs}`);
  const shoot = async (index: number, offsets: number[], name: string) => {
    const b = beats.find((x) => x.index === index)!;
    d.note(`${name}: beat ${index} at ${b.startMs} ms, ${new Date(b.sourceUtc).toISOString()}, accented ${b.accented}`);
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), b.startMs - 1);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    const t0 = Date.now();
    for (const off of offsets) {
      const wait = off - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      const s = await page.evaluate(() => { const t = window.__starChartTest!; return { x: t.session().x, status: t.session().status, census: t.fxCensus(), ann: t.annotations() }; });
      d.note(`${name} +${off}: x=${s.x} ${s.status} maneuvers=${s.census.maneuvers} beams=${s.census.beams} playing=${s.ann.playing.length} notes=${JSON.stringify(Object.values(s.ann.notes).map((n) => n.text))}`);
      await d.shot(`${name}-${off}`);
    }
  };
  // Indices are the solar app's (review-scan.ts), which differ from the ledger's.
  await shoot(24, [700, 1300], 'progress');           // 15 Sep 16:03, agent.progress alone: act 300..1100, echo to 1500
  await shoot(15, [1200, 2600], 'short-link');        // 14 Sep 22:17, attachment.merge short: act 720, echo at 1980
  await shoot(26, [1500, 3000], 'close-26');          // 15 Sep 16:31, a beamed strike (len 5880): short or full?
}

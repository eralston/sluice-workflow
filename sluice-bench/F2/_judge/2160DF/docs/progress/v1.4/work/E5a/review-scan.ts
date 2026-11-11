// Reviewer drive (E5a round 1): Quasar Pod in solar, each beat stepped into; notes what each plays, to pick stills.
import type { Drive } from '../../../../../tests/drive/drive';

export default async function scan(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  d.note(`scene ${await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey)}`);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); t.pause(); });
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  for (let i = 0; i < Math.min(beats.length, 120); i++) {
    const b = beats[i]!;
    if (!b.accented) continue;
    const len = Math.round((beats[i + 1]?.startMs ?? b.startMs) - b.startMs);
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), b.startMs - 1);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    await page.waitForTimeout(450);
    const s = await page.evaluate(() => { const t = window.__starChartTest!; return { c: t.fxCensus(), a: t.annotations() }; });
    d.note(`#${b.index} start=${Math.round(b.startMs)} len=${len} utc=${new Date(b.sourceUtc).toISOString()} man=${s.c.maneuvers} beams=${s.c.beams} playing=${s.a.playing.map((k) => k.split(':')[0]).join(',')} notes=${JSON.stringify(Object.values(s.a.notes).map((n) => n.text))}`);
  }
}

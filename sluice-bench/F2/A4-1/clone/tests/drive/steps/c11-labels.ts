// 23 C11: labels before arrivals (R11). In a pod, play at 2x and seek, sampling every visible plate against
// its node's drawn alpha: a plate showing while its body is under 30% drawn is a label before its arrival.
// Notes the count (expect 0) per kind. Fixture data only (INV-18). Run with --paradigm solar.
import type { Drive } from '../drive';

export default async function c11Labels(d: Drive): Promise<void> {
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
  const sample = (ms: number) => page.evaluate(async (dur) => {
    const t = window.__starChartTest!;
    const bad: Record<string, number> = {};
    let looked = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < dur) {
      const nodes = t.viewGraph()!.nodes;
      const alpha = t.viewAlphas(nodes.map((n) => n.projectionKey));
      const titles = new Set([...document.querySelectorAll<HTMLElement>('.callout')]
        .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && Number(getComputedStyle(e).opacity) > 0.3)
        .map((e) => e.querySelector('.callout__title')?.textContent ?? e.title));
      for (const n of nodes) {
        const a = alpha[n.projectionKey];
        if (a === undefined) continue;
        if (titles.has(n.label)) looked++;
        if (a < 0.3 && titles.has(n.label)) bad[n.kind] = (bad[n.kind] ?? 0) + 1;
      }
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return { bad, looked };
  }, ms);
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(2); t.setScheduleMs(0); });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.play());
  const play = sample(9000);
  await page.waitForTimeout(3000);
  await d.shot('play');
  d.note(`play 2x: ${JSON.stringify(await play)}`);
  const total = await page.evaluate(() => window.__starChartTest!.session().totalMs);
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), Math.round(total * 0.6));
  d.note(`after seek: ${JSON.stringify(await sample(3000))}`);
  await d.shot('seek');
}

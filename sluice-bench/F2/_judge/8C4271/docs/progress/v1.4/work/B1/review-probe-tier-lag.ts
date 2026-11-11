// Review probe (B1 round 1): in Convoy Planning Pod (meridian-sprint) while playing, how long does a seat plate sit at a
// raised tier without being expanded? Logs every change of a seat plate's data-holo-tier / is-expanded with its time.
// Run: npm run drive -- docs/progress/v1.4/work/B1/review-probe-tier-lag.ts --paradigm solar --name b1-review-lag (with STAR_CHART_FIXTURE=meridian-sprint)
import { writeFileSync } from 'node:fs';
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  await d.settle();
  if (!(await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey.startsWith('pod:')))) {
    if (await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).count()) {
      await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).first().dblclick();
      await page.waitForFunction(() => !window.__starChartTest!.viewGraph()?.sceneKey.startsWith('cosmos'), undefined, { timeout: 30_000 });
      await d.settle();
    }
    await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
  }
  await page.mouse.move(2, 2);
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(2); t.setScheduleMs(0); });
  await d.settle();
  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { __b1log: string[] }).__b1log = log;
    let frame = 0;
    const tick = () => { frame++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const seen = new Map<Element, string>();
    const look = () => {
      for (const e of document.querySelectorAll<HTMLElement>('.callout--seat')) {
        const s = `${e.dataset.holoTier}|${e.classList.contains('is-expanded') ? 'exp' : '-'}|${e.classList.contains('is-hover') ? 'hov' : '-'}`;
        if (seen.get(e) !== s) {
          seen.set(e, s);
          log.push(`${performance.now().toFixed(0)} f${frame} ${e.querySelector('.callout__title')?.textContent}: ${s}`);
        }
      }
    };
    new MutationObserver(look).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-holo-tier', 'class'] });
    look();
  });
  await page.evaluate(() => window.__starChartTest!.play());
  await page.waitForTimeout(24_000);
  await page.evaluate(() => window.__starChartTest!.pause());
  const log = await page.evaluate(() => (window as unknown as { __b1log: string[] }).__b1log);
  writeFileSync('test-results/drive/b1-review-lag.txt', log.join('\n'));
  console.log(log.filter((l) => !l.includes('sky|-|-')).slice(0, 80).join('\n'));
  console.log(`changes: ${log.length}`);
}

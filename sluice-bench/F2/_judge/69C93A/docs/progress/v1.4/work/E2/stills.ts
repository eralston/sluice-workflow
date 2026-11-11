// E2 stills (fixture data only, INV-18): meridian's Convoy Planning Pod at 1x. Plays from 30% in, watches
// the visible plates of pieces and captains, and shoots 'flight' when four are up (a captain still travelling:
// its own plate is shut until it parks) and 'parked' two seconds later (the captain's plate and its piece's up).
// Run: npm run drive -- docs/progress/v1.4/work/E2/stills.ts --paradigm solar
import type { Drive } from '../../../../../tests/drive/drive';

export default async function stills(d: Drive): Promise<void> {
  const { page } = d;
  await page.waitForTimeout(1500);
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.chooser button', { hasText: 'Sprint 7' }).first().click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(1); t.setScheduleMs(Math.round(t.session().totalMs * 0.3)); });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.play());
  const seen = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const t0 = performance.now();
    // The scene's lit plates plus the named (acting) captains: the attention budget's count (solar-dense.spec.ts).
    const count = () => {
      const lit = Object.values(t.annotations().lit).filter((x) => x > 0.55).length;
      const acting = [...document.querySelectorAll<HTMLElement>('.callout--captain.is-acting')]
        .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && Number(getComputedStyle(e).opacity || '1') > 0.55).length;
      return lit + acting;
    };
    while (performance.now() - t0 < 120_000) {
      if (count() >= 4) return { ms: Math.round(performance.now() - t0), n: count() };
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return null;
  });
  d.note(`four labels up: ${JSON.stringify(seen)}`);
  await d.shot('flight-four-labels');
  await page.waitForTimeout(2000);
  await d.shot('parked-plates');
}

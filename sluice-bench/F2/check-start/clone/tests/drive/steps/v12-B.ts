// Block B's tour (22 B1–B8; fixture data only, INV-18): meridian-sprint's Convoy Planning Pod.
// - Words (HG-B-words): the round with Convoy selected (the star's count line, the inspector's
//   identity line), the In view list, the map key; in the region, a story, a bug, a homeworld (its
//   item list) and a station selected, each with its inspector; a homeworld expanded (its rows).
// - Play (HG-B-play): from a quarter in, at 1×, a still every 1.2 s with History open. Each still's
//   note gives the plates' notes and History's *now* rows, so the two can be read side by side.
import type { Drive } from '../drive';

export default async function v12B(d: Drive): Promise<void> {
  const { page } = d;
  const box = async () => (await page.locator('.chart-host canvas').boundingBox())!;
  const off = async () => {
    const b = await box();
    await page.mouse.move(b.x + 4, b.y + b.height - 4);
    await page.waitForTimeout(700);
  };
  const scene = (prefix: string) => page.waitForFunction((p) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(p) === true, prefix, { timeout: 30_000 });
  const inspector = async (name: string) => {
    const text = (await page.locator('.inspector').allInnerTexts()).join(' / ').replace(/\s*\n\s*/g, ' | ');
    d.note(`${name} inspector: ${text.slice(0, 600)}`);
  };
  const pick = async (name: string, kind: string, nth = 0) => {
    const key = await page.evaluate(([k, i]) => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === k && n.selectable)[Number(i)]?.canonicalKey ?? null, [kind, nth] as const);
    if (!key) { d.note(`${name}: none`); return; }
    await page.evaluate((k) => window.__starChartTest!.select(k), key);
    await page.waitForTimeout(500);
    await off();
    await d.shot(name);
    await inspector(name);
  };

  await page.waitForTimeout(1500);
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.chooser button', { hasText: 'Sprint 7' }).first().click();
  await scene('sprint:');
  await d.settle();
  await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().click();
  await off();
  await d.shot('round-convoy-selected');
  await inspector('round-convoy');
  await page.keyboard.press('k');
  await page.waitForTimeout(400);
  await d.shot('round-key');
  await page.keyboard.press('k');

  await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().dblclick();
  await scene('pod:');
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.6));
  await d.settle();
  await page.locator('#tab-inView').click();
  await pick('story-selected', 'objective');
  await pick('bug-selected', 'threat');
  await pick('homeworld-selected', 'seat', 2);
  await pick('station-selected', 'facility');
  await d.shot('in-view');
  await page.evaluate(() => window.__starChartTest!.select(null));
  const seat = page.locator('.callout--seat:visible').first();
  if (await seat.count()) {
    await seat.hover();
    await page.waitForTimeout(600);
    await d.shot('homeworld-expanded');
  }
  await off();

  await page.evaluate(() => { const t = window.__starChartTest!; t.setRate(1); t.setScheduleMs(t.session().totalMs * 0.25); });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.play());
  for (let i = 1; i <= 20; i++) {
    await page.waitForTimeout(1200);
    await d.shot(`playing-${String(i).padStart(2, '0')}`);
    d.note(`playing-${String(i).padStart(2, '0')}: ${JSON.stringify(await page.evaluate(() => ({
      notes: [...document.querySelectorAll<HTMLElement>('.holo__note')].filter((e) => (e.parentElement as HTMLElement).style.display !== 'none').map((e) => `${e.parentElement!.querySelector('.callout__title')?.textContent}: ${e.textContent}`),
      now: [...document.querySelectorAll<HTMLElement>('.history-row.is-now .history-card__text')].map((e) => e.textContent),
      captains: [...document.querySelectorAll<HTMLElement>('.callout--captain.is-acting')].map((e) => `${e.querySelector('.callout__title')?.textContent}: ${e.querySelector('.holo__note')?.textContent}`),
    })))}`);
    if (await page.evaluate(() => window.__starChartTest!.session().status === 'ended')) break;
  }
  await page.evaluate(() => window.__starChartTest!.pause());
}

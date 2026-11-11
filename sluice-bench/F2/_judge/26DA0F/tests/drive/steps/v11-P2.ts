// Stills for P2 (19 P2; fixture data only, INV-18): Solar's map key at each level, the galaxies, the
// round and a region, beside the object list's group heads and the inspector's kind words (both layers
// at once since 22 B1: there is no wording toggle). Run with --paradigm solar; the key should name only what Solar draws, with Solar's meanings.
import type { Drive } from '../drive';

export default async function v11P2(d: Drive): Promise<void> {
  const { page } = d;
  const read = async (where: string) => {
    const rows = await page.locator('.map-key__table tr').evaluateAll((trs) => trs.map((tr) => `${tr.classList.contains('is-here') ? '* ' : '  '}${[...tr.querySelectorAll('td')].map((td) => td.textContent).join(' | ')}`));
    for (const r of rows) d.note(`${where} key: ${r}`);
    const rest = await page.locator('.map-key__stages li, .map-key__lines li').allInnerTexts();
    for (const r of rest) d.note(`${where} key: ${r.replace(/\n/g, ' — ')}`);
    const heads = await page.locator('.object-list__group-head').allInnerTexts();
    d.note(`${where} list: ${heads.map((h) => h.replace(/\n/g, ' ')).join(' / ')}`);
    const kind = await page.locator('.inspector__kind').allInnerTexts();
    if (kind.length) d.note(`${where} inspector: ${kind.join(' / ')}`);
  };
  const keyShot = async (name: string) => {
    await page.keyboard.press('k');
    await page.locator('.map-key').waitFor();
    await page.mouse.move(5, 300);
    await page.waitForTimeout(400);
    await read(name);
    await d.shot(name);
    await page.keyboard.press('k');
  };
  await d.settle();
  await keyShot('galaxies-key');
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  await read('galaxy-selected');
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await keyShot('round-key');
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().click();
  await page.waitForTimeout(500);
  await read('round-harbor-selected');
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await keyShot('region-key');
  // Each kind's inspector words: the identity line, then the chart's name.
  for (const kind of ['star', 'seat', 'objective', 'threat', 'facility', 'captain']) {
    const key = await page.evaluate((k) => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.kind === k && n.selectable)?.canonicalKey ?? null, kind);
    if (!key) continue;
    await page.locator(`.object-list button[data-key="${key}"]`).first().dispatchEvent('click');
    await page.waitForTimeout(200);
    d.note(`region inspector ${kind}: ${(await page.locator('.inspector__kind').allInnerTexts()).join(' / ')}`);
  }
}

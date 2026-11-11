// Close crops of the solar region's pieces (fixture data only, INV-18): each objective and threat at
// the fitted zoom, found by the test hook, to review how they read on their planets (draw order,
// auras). Then the same after zooming in two steps. Run with --paradigm solar.
import type { Drive } from '../drive';

export default async function solarPieces(d: Drive): Promise<void> {
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
  await page.waitForTimeout(900);
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const crops = async (tag: string, half: number) => {
    const keys = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes
      .filter((n) => n.kind === 'objective' || n.kind === 'threat').map((n) => ({ key: n.canonicalKey, kind: n.kind })));
    let i = 0;
    for (const k of keys) {
      const p = await page.evaluate((key) => window.__starChartTest!.screenOf(key), k.key);
      if (!p || p.x < half || p.y < half || p.x > box.width - half || p.y > box.height - half) continue;
      await page.screenshot({ path: `test-results/drive/solar-pieces/${tag}-${String(i++).padStart(2, '0')}-${k.kind}.png`, clip: { x: box.x + p.x - half, y: box.y + p.y - half, width: half * 2, height: half * 2 } });
    }
    d.note(`${tag}: ${i} crops`);
  };
  await crops('fit', 28);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(250);
  }
  await d.settle();
  await page.waitForTimeout(900);
  await d.shot('zoomed');
  await crops('zoom', 48);
}

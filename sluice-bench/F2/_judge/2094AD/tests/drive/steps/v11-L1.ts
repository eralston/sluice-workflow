// Stills for HG-L1 (19 §2, L1, L3, L4; fixture data only, INV-18): every Solar label as a holo plate,
// by tier. The galaxy at rest and with one galaxy pointed at; the round (Tidewater Array's Sprint 13)
// at rest and with Harbor Pod pointed at; Harbor Pod's region at the round's end, with its star and a
// homeworld pointed at; then playing at 2×. Run with --paradigm solar.
import type { Drive } from '../drive';

export default async function v11L1(d: Drive): Promise<void> {
  const { page } = d;
  const hover = async (text: string, kind = '') => {
    await page.locator(`.callout${kind}`, { hasText: text }).first().hover();
    await page.waitForTimeout(400);
  };
  await d.settle();
  await d.shot('galaxy-rest');
  await hover('Tidewater Array');
  await d.shot('galaxy-pointed');
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.mouse.move(5, 300);
  await page.waitForTimeout(400);
  await d.shot('round-rest');
  await hover('Harbor Pod');
  await d.shot('round-pointed');
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.mouse.move(5, 300);
  await page.waitForTimeout(900);
  // Entering keeps the pod's star selected (the round's double-click picked it): lifted, with its counts.
  await d.shot('region-star-selected');
  // Select a homeworld from the object list instead, to see the star at rest (T3, its name only).
  await page.locator('.object-list button', { hasText: 'Planet Wren' }).first().click();
  await page.mouse.move(5, 300);
  await page.waitForTimeout(1200);
  await d.shot('region-rest');
  await d.dump('region-rest');
  // Point at the star itself (its disc, not its plate): it lifts and shows its counts.
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const star = await page.evaluate(() => {
    const pk = window.__starChartTest!.viewGraph()!.nodes.find((n) => n.kind === 'star')!.projectionKey;
    return window.__starChartTest!.displayed().find((p) => p.pk === pk) ?? null;
  });
  if (star) {
    await page.mouse.move(box.x + star.x, box.y + star.y);
    await page.waitForTimeout(500);
    await d.shot('region-star-pointed');
  }
  const seat = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.kind === 'seat')?.label ?? null);
  if (seat) {
    await hover(seat, '--seat');
    await d.shot('region-homeworld-pointed');
  }
  await page.mouse.move(5, 300);
  await page.keyboard.press('Home');
  await page.evaluate(() => { window.__starChartTest!.setRate(2); window.__starChartTest!.play(); });
  await page.waitForTimeout(9000);
  await d.shot('region-playing');
}

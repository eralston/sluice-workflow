// 23 B3 (HG-B), 27 B2: the Quasar (or Pulsar) star plate, at rest (the top Feature and `+N more` on one line) and pointed at (all of them, in place; 27 B2).
// Run: npm run drive -- tests/drive/steps/feature-row.ts --paradigm solar   (POD="Pulsar Pod" for the other)
// Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function featureRow(d: Drive): Promise<void> {
  const { page } = d;
  const pod = process.env.POD ?? 'Quasar Pod';
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.select(null)); // belt and braces: entering a pod no longer selects its star (27 B2), but rest must mean nothing selected
  await page.mouse.move(2, 2);
  await page.waitForTimeout(800); // past the 450 ms grace
  const name = pod.split(' ')[0]!.toLowerCase();
  d.note(`features: ${JSON.stringify(await page.locator('.callout--star .holo__feat').allTextContents())}`);
  await d.shot(`${name}-star-features-rest`);
  await page.locator('.callout--star').first().hover();
  await page.waitForTimeout(600);
  d.note(`features: ${JSON.stringify(await page.locator('.callout--star .holo__feat').allTextContents())}`);
  await d.shot(`${name}-star-features-pointed`);
}

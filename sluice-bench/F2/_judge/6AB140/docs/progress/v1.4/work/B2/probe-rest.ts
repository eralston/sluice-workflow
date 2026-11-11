import type { Drive } from '../../../../../tests/drive/drive';
export default async function p(d: Drive): Promise<void> {
  const { page } = d;
  const pod = process.env.POD ?? 'Quasar Pod';
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.select(null));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1200);
  const n = pod.split(' ')[0]!.toLowerCase();
  d.note(`feats ${JSON.stringify(await page.locator('.callout--star .holo__feat').allTextContents())} side ${await page.locator('.callout--star').first().getAttribute('data-side')}`);
  await d.shot(`${n}-probe-rest`); await page.locator('.callout--star').first().hover({position:{x:4,y:4}}); await page.waitForTimeout(700); await d.shot(`${n}-probe-open`);
}

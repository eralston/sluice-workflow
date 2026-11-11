// 27 E9: the directed camera. Run: npm run drive -- tes../../../../../tests/drive/drive/steps/e9-camera.ts --paradigm solar
// Pulsar Pod: the board just before a climax, then mid-climax shot. Quasar Pod: mid-montage (the board).
// Stills are copied to docs/progress/v1.4/work/E9/e9-*.png by hand. Fixture data only (INV-18).
import type { Drive } from '../../../../../tests/drive/drive';

export default async function e9(d: Drive): Promise<void> {
  const { page } = d;
  const enter = async (pod: string) => {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await d.settle();
    await held(pod + ' sprint settled');
    await page.locator('.callout', { hasText: pod }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await held(pod + ' pod settled');
    await page.mouse.move(box.x + 6, box.y + box.height - 6);
    await held(pod + ' after move');
    await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setReduced(false); t.setRate(1); });
  };
  const held = async (at: string) => d.note(`held ${at}: ${await page.evaluate(() => window.__starChartTest!.cameraHeld())} t=${await page.evaluate(() => Math.round(performance.now()))}`);
  const shots = () => page.evaluate(() => window.__starChartTest!.shots());
  const note = async (name: string) => d.note(`${name}: ${JSON.stringify(await page.evaluate(() => window.__starChartTest!.directedCamera()))}`);

  await enter('Pulsar Pod');
  const climax = (await shots()).find((s) => s.kind === 'climax');
  if (!climax) d.note('Pulsar: no climax');
  else {
    d.note(`climax beat ${climax.index} ${Math.round(climax.startMs)}..${Math.round(climax.endMs)}, gather at ${Math.round(climax.gatherMs)}, cast ${climax.cast.length}`);
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), climax.startMs - 1);
    await d.settle();
    await note('before');
    await d.shot('before-climax');
    await page.evaluate(() => window.__starChartTest!.play());
    await page.waitForFunction((x) => window.__starChartTest!.session().x >= x, climax.gatherMs + 1200, { timeout: 120_000, polling: 50 });
    await page.evaluate(() => window.__starChartTest!.pause());
    await note('mid-climax');
    await d.shot('climax-shot');
  }

  // A fresh view of Quasar: back out to the galaxy, then in.
  await held('before esc');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await d.settle();
  await held('after esc');
  await enter('Quasar Pod');
  const montage = (await shots()).find((s) => s.kind === 'montage');
  if (!montage) d.note('Quasar: no montage');
  else {
    d.note(`montage beat ${montage.index} ${Math.round(montage.startMs)}..${Math.round(montage.endMs)}`);
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), montage.startMs - 1);
    await d.settle();
    await page.evaluate(() => window.__starChartTest!.play());
    await page.waitForFunction((x) => window.__starChartTest!.session().x >= x, montage.startMs + 1200, { timeout: 120_000, polling: 50 });
    await page.evaluate(() => window.__starChartTest!.pause());
    await held('mid-montage');
    await note('mid-montage');
    await page.waitForTimeout(3000);
    await held('mid-montage +3s');
    await d.shot('montage-board');
  }
}

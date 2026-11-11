// 27 E9: the directed camera. Run: npm run drive -- tests/drive/steps/e9-camera.ts --paradigm solar
// Pulsar Pod: the board just before a climax, then mid-climax shot. Quasar Pod: the camera offset from the board just
// before a montage, then mid-montage (pulled back to the board). A click holds the camera for CAMERA_HOLD_AFTER_MS
// (1.5 s, 05 §6 item 1), and a directed beat inside the hold loses its shot by design, so each pod is entered and then
// left alone for HOLD_MS before playing (block E audit, E9-Q1). Stills are copied to docs/progress/v1.4/work/E9/e9-*.png
// by hand, before any e2e run clears test-results/. Fixture data only (INV-18).
import type { Drive } from '../drive';

/** Past ChartApp's CAMERA_HOLD_AFTER_MS (1500 ms) after the double-click that entered a pod. */
const HOLD_MS = 1700;

export default async function e9(d: Drive): Promise<void> {
  const { page } = d;
  const enter = async (pod: string) => {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await d.settle();
    await page.locator('.callout', { hasText: pod }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + 6, box.y + box.height - 6);
    await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setReduced(false); t.setRate(1); });
    await page.waitForTimeout(HOLD_MS);
    d.note(`${pod}: camera held ${await page.evaluate(() => window.__starChartTest!.cameraHeld())}`);
  };
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
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await d.settle();
  await enter('Quasar Pod');
  const montage = (await shots()).find((s) => s.kind === 'montage');
  if (!montage) d.note('Quasar: no montage');
  else {
    d.note(`montage beat ${montage.index} ${Math.round(montage.startMs)}..${Math.round(montage.endMs)}`);
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), montage.startMs - 1);
    await d.settle();
    // Off the board, as camera-directs.spec.ts does, so the still shows the pull-back and not a camera that never left.
    await page.evaluate(() => { const t = window.__starChartTest!; const f = t.directedCamera().fit; t.setCamera({ x: f.x + 200 / f.scale, y: f.y, scale: f.scale * 1.4 }); });
    await d.settle();
    await note('before-montage');
    await d.shot('before-montage');
    await page.evaluate(() => window.__starChartTest!.play());
    await page.waitForFunction((x) => window.__starChartTest!.session().x >= x, montage.startMs + 1200, { timeout: 120_000, polling: 50 });
    await page.evaluate(() => window.__starChartTest!.pause());
    await note('mid-montage');
    await d.shot('montage-board');
  }
}

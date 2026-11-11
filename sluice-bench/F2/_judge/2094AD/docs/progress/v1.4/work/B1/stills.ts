// B1: one still of Pulsar Pod at rest (paused, nothing pointed at) and one while playing, for the final check (fixture data only).
// Run: npm run drive -- docs/progress/v1.4/work/B1/stills.ts --paradigm solar
import type { Drive } from '../../../../../tests/drive/drive';

export default async function stills(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setScheduleMs(t.session().totalMs * 0.5); });
  await page.mouse.click(300, 250); // empty sky clears the selection (Esc would go back a level)
  await page.mouse.move(2, 2);
  await page.waitForTimeout(2000);
  await d.settle();
  await page.screenshot({ path: 'docs/progress/v1.4/work/B1/pulsar-rest.png' });
  // Play from earlier in the pod, then wait until a plate is raised by play (a cast piece or a named captain).
  await page.evaluate(() => { const t = window.__starChartTest!; t.setScheduleMs(t.session().totalMs * 0.3); t.setRate(1); t.play(); });
  await page.waitForFunction(() => document.querySelector('.holo[data-holo-tier]:not([data-holo-tier="sky"])') !== null, undefined, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/progress/v1.4/work/B1/pulsar-playing.png' });
}

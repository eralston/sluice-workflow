// The Sprints view in fixture mode (run with --paradigm sprints, as STAR_CHART_PODS=mechanics npm run drive: the
// Story below is in the old Halcyon Reach, sprint-mechanics): galaxy → Sprint 41 → Comet Pod → a
// Story, then play the sprint a little.
import type { Drive } from '../drive';

export default async function sprints(d: Drive): Promise<void> {
  const { page } = d;
  await d.shot('galaxy');
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().click();
  await page.waitForTimeout(600);
  await d.shot('project-selected');
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await d.shot('sprint');
  await d.dump('sprint');
  await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await d.shot('pod');
  await d.dump('pod');
  await page.locator('.callout', { hasText: 'Week view for the calendar' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('body:'), undefined, { timeout: 20_000 });
  await d.settle();
  await d.shot('story');
  await page.keyboard.press('Escape');
  await d.settle();
  await page.keyboard.press('Home');
  await page.evaluate(() => window.__starChartTest!.play());
  await page.waitForTimeout(6000);
  await d.shot('pod-playing');
}

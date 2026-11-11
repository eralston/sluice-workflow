// 23 B4 (HG-B): the v0 board on Halcyon's Quasar Pod with the team's board columns (a custom Code Review, a split
// Resolved), at mid-sprint and at the end. Run: npm run drive -- tests/drive/steps/board-columns.ts --paradigm sprints
// (POD="Pulsar Pod" for the other). Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function boardColumns(d: Drive): Promise<void> {
  const { page } = d;
  const pod = process.env.POD ?? 'Quasar Pod';
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.keyboard.press('0'); // the opening view: the whole board
  await d.settle();
  await page.waitForTimeout(800);
  // The whole board is far wider than the window (06 §3: dense boards shrink), so look at its first lanes: the
  // column names over the first one.
  await page.evaluate(() => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const rings = g.board!.rings;
    const span = rings[Math.min(1, rings.length - 1)]!.span;
    const cam = t.camera();
    t.setCamera({ ...cam, x: 0, y: g.board!.columns![0]!.y + 700, scale: Math.min(0.5, 1100 / (2 * span)) });
  });
  await d.settle();
  await page.waitForTimeout(800);
  d.note(`columns: ${JSON.stringify(await page.locator('.column-head').allTextContents())}`);
  await d.shot('board-end');
  const range = await page.evaluate(() => window.__starChartTest!.historyRange()!);
  await page.evaluate((ms) => window.__starChartTest!.setScheduleMs(ms), Math.round((range.endUtc - range.startUtc) * 0.45));
  await d.settle();
  await page.waitForTimeout(800);
  await d.shot('board-mid');
}

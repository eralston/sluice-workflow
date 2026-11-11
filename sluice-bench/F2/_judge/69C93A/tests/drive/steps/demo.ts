// The Halcyon Reach demo (23 A1, docs/demo-script.md), in the default Solar view on the default fixture:
// All projects → Halcyon Reach → Sprint 41 → each pod in turn. For each pod: its end state, the schedule's
// length, then stills a quarter, half and three quarters of the way through, and a moment of real play.
// For HG-A-demo: does each pod read denser than the last? Fixture data only (INV-18).
import type { Drive } from '../drive';

const PODS = ['Comet Pod', 'Nova Pod', 'Quasar Pod', 'Pulsar Pod'];

export default async function demo(d: Drive): Promise<void> {
  const { page } = d;
  await d.shot('all-projects');
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await d.shot('sprint-41-round');
  await d.dump('sprint-41-round');

  for (const pod of PODS) {
    const slug = pod.split(' ')[0]!.toLowerCase();
    await page.locator('.callout', { hasText: pod }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
    await page.waitForTimeout(800);
    const nodes = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.map((n) => n.kind));
    const count = (k: string) => nodes.filter((x) => x === k).length;
    d.note(`${pod}: seats ${count('seat')}, objectives ${count('objective')}, threats ${count('threat')}, stations ${count('facility') + count('station')}`);
    await d.shot(`${slug}-end`);
    await d.dump(`${slug}-end`);

    // How long it plays at 1×, and where it stands a quarter, half and three quarters through.
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    const total = await page.evaluate(() => window.__starChartTest!.session().totalMs);
    d.note(`${pod}: ${Math.round(total / 1000)} s at 1× (${Math.round(total / 4000)} s at 4×)`);
    for (const f of [0.25, 0.5, 0.75]) {
      await page.evaluate((ms) => window.__starChartTest!.setScheduleMs(ms), Math.round(total * f));
      await page.waitForTimeout(500);
      await d.shot(`${slug}-${Math.round(f * 100)}pct`);
    }

    // A few seconds of real play from a third of the way in.
    await page.evaluate((ms) => window.__starChartTest!.setScheduleMs(ms), Math.round(total / 3));
    await page.evaluate(() => { window.__starChartTest!.setRate(4); window.__starChartTest!.play(); });
    await page.waitForTimeout(4000);
    await d.shot(`${slug}-playing`);
    await page.evaluate(() => { window.__starChartTest!.pause(); window.__starChartTest!.setRate(1); });

    await page.keyboard.press('Escape');
    await d.settle();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  }
}

// Block E audit probe (finding 1): each Halcyon pod's schedule length as the app plays it (x and beats), to set
// against the ledger's. Run: npm run drive -- docs/progress/v1.4/work/block-E/probe-pods.ts --paradigm solar. Fixture data only.
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  for (const pod of ['Comet Pod', 'Nova Pod', 'Pulsar Pod']) {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await d.settle();
    await page.locator('.callout', { hasText: pod }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
    const s = await page.evaluate(() => { const t = window.__starChartTest!; return { x: t.session().totalMs, beats: t.beatTimes().length }; });
    d.note(`${pod}: app x ${(s.x / 1000).toFixed(1)} s, beats ${s.beats}`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await d.settle();
  }
}

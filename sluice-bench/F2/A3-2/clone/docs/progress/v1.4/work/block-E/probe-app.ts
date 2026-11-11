// Block E audit probe (E9-Q1, E10-Q1). Run: npm run drive -- docs/progress/v1.4/work/block-E/probe-app.ts --paradigm solar
// Notes the app's Quasar schedule near 2026-09-15 19:00-20:30Z, and cameraHeld() after each navigation. Fixture data only.
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  const held = async (at: string) => d.note(`held ${at}: ${await page.evaluate(() => window.__starChartTest!.cameraHeld())}`);
  const enter = async (pod: string) => {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await held('after galaxy dblclick');
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await d.settle();
    await held('sprint settled');
    await page.locator('.callout', { hasText: pod }).first().dblclick();
    await held('after pod dblclick');
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
    await held(`${pod} settled`);
  };
  const dumpSchedule = async (pod: string) => {
    const r = await page.evaluate(() => {
      const t = window.__starChartTest!;
      return { range: t.historyRange(), session: t.session(), beats: t.beatTimes() };
    });
    const iso = (u: number) => new Date(u).toISOString();
    d.note(`${pod}: range ${r.range ? iso(r.range.startUtc) + '..' + iso(r.range.endUtc) : null}; beats ${r.beats.length}; totalMs ${Math.round(r.session.totalMs)}`);
    for (const b of r.beats) {
      const s = iso(b.sourceUtc);
      if (s >= '2026-09-15T18:50' && s <= '2026-09-15T20:30') d.note(`  ${pod} beat ${b.index} ${s} start ${Math.round(b.startMs)} accented ${b.accented}`);
    }
    d.note(`${pod} beat isos: ${r.beats.map((b) => iso(b.sourceUtc).slice(5, 16)).join(' ')}`);
  };

  await held('launch');
  await enter('Quasar Pod');
  await dumpSchedule('Quasar fresh');
  await page.keyboard.press('Escape');
  await held('esc 1');
  await page.keyboard.press('Escape');
  await held('esc 2');
  await d.settle();
  await held('galaxy settled');
  await enter('Pulsar Pod');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await d.settle();
  await held('galaxy again');
  await enter('Quasar Pod');
  await dumpSchedule('Quasar second');
  await page.waitForTimeout(2500);
  await held('Quasar second +2.5s');
}

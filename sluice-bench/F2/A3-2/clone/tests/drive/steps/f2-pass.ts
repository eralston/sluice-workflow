// 27 F2: a summoner's pass on Meteor Pod (36 summons). Run: npm run drive -- tests/drive/steps/f2-pass.ts --paradigm solar --name f2
// Opens Halcyon Reach's Sprint 41 and Meteor Pod, plays from the start at 1x, and samples every 50 ms for a plate marked
// `is-passing` (a pass's plate riding its ship); it shoots once when it first sees one, noting how far that ship has moved
// between samples, and once more half a second later. Fixture data only (INV-18). The still is copied to
// docs/progress/v1.4/work/F2/f2-meteor-pass.png by hand.
import type { Drive } from '../drive';

export default async function f2(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Meteor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); t.pause(); t.setScheduleMs(0); });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.play());
  let shot = 0;
  let last: { x: number; y: number } | null = null;
  for (let i = 0; i < 400 && shot < 2; i++) {
    await page.waitForTimeout(50);
    const s = await page.evaluate(() => {
      const t = window.__starChartTest!;
      const e = [...document.querySelectorAll<HTMLElement>('.callout--captain.is-passing')].find((x) => x.style.display !== 'none' && x.offsetParent !== null);
      if (!e) return null;
      const title = e.querySelector('.callout__title')?.textContent ?? '';
      const pk = t.viewGraph()!.nodes.find((n) => n.kind === 'captain' && n.label === title)?.projectionKey;
      const at = pk ? t.displayed().find((x) => x.pk === pk) : undefined;
      return { title, note: e.querySelector('.holo__note')?.textContent ?? '', at: at ? { x: at.x, y: at.y } : null, ms: Math.round(t.session().x) };
    });
    if (!s) { last = null; continue; }
    if (shot === 0 || i % 10 === 0) {
      d.note(`+${s.ms} ms: ${s.title} passing (${s.note}); moved ${last && s.at ? Math.round(Math.hypot(s.at.x - last.x, s.at.y - last.y)) : '-'} px since the last look`);
      await d.shot(shot === 0 ? 'meteor-pass' : 'meteor-pass-later');
      shot++;
    }
    last = s.at;
  }
  if (!shot) d.note('no pass seen');
  await page.evaluate(() => window.__starChartTest!.pause());
}

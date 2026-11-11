// B2 planner's probe (fixture data only, INV-18): where the star plate sits, and whether it covers Quasar's
// payments-sync and search-api plates, today and with the Features row cut to one line (emulated with CSS).
// B2_EARLY=1 injects the one-line CSS before entering either pod, so the plate is placed fresh (no kept side).
// Run: .claude/sluice/with-lock.sh npm run drive -- docs/progress/v1.4/work/B2/probe-oneline.ts --paradigm solar --name b2-probe
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  const scene = (p: string) => page.waitForFunction((x) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(x), p, { timeout: 30_000 });
  const census = (tag: string) => page.evaluate((tag) => {
    const r = (e: Element) => { const b = e.getBoundingClientRect(); return { x0: Math.round(b.left), y0: Math.round(b.top), x1: Math.round(b.right), y1: Math.round(b.bottom) }; };
    const star = document.querySelector<HTMLElement>('.callout--star');
    const g = window.__starChartTest!.viewGraph()!;
    const sn = g.nodes.find((n) => n.kind === 'star');
    const plates = [...document.querySelectorAll<HTMLElement>('.callout--facility')].map((e) => ({
      text: e.querySelector('.callout__title')?.textContent, shown: e.style.display !== 'none', rect: r(e),
    }));
    const sr = star ? r(star) : null;
    const hit = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    return `${tag}: star side=${star?.dataset.side} rect=${JSON.stringify(sr)} feats=${sn?.features?.length} lines=${sn?.featureLines} | stations: ${plates.map((p) => `${p.text}${p.shown ? '' : '(hidden)'}${sr && p.shown && hit(sr, p.rect) ? '(UNDER STAR)' : ''}`).join(', ')}`;
  }, tag);
  const look = async (pod: string) => {
    await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.select(null); });
    await page.mouse.move(2, 2);
    for (const f of [1, 0.5, 0.2]) {
      await page.evaluate((f) => { const t = window.__starChartTest!; t.setScheduleMs(t.session().totalMs * f - 1); }, f);
      await page.waitForTimeout(900);
      await d.settle();
      d.note(await census(`${pod} today @${f}`));
    }
    await d.shot(`${pod}-today`);
    await page.addStyleTag({ content: '.callout--star .holo__feat-scroll > .holo__feat:nth-child(n+2), .callout--star .holo__feat-more { display: none !important; }' });
    for (const f of [1, 0.5, 0.2]) {
      await page.evaluate((f) => { const t = window.__starChartTest!; t.setScheduleMs(t.session().totalMs * f - 3); }, f);
      await page.waitForTimeout(900);
      await d.settle();
      d.note(await census(`${pod} one-line @${f}`));
    }
    await d.shot(`${pod}-oneline`);
    if (!process.env.B2_EARLY) await page.evaluate(() => document.querySelectorAll('style').forEach((s) => { if (s.textContent?.includes('holo__feat-more { display: none')) s.remove(); }));
  };
  if (process.env.B2_EARLY) await page.addStyleTag({ content: '.callout--star .holo__feat-scroll > .holo__feat:nth-child(n+2), .callout--star .holo__feat-more { display: none !important; }' });
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await scene('sprint:');
  await d.settle();
  await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
  await scene('pod:');
  await d.settle();
  await look('quasar');
  await page.keyboard.press('Escape');
  await scene('sprint:');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  await scene('sprint:');
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await scene('pod:');
  await d.settle();
  await look('harbor');
}

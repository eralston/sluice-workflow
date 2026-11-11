// 23 B1 (HG-B): an expanded station plate on Halcyon's Quasar or Pulsar Pod, with several PR stat lines.
// Run: npm run drive -- tests/drive/steps/pr-stat.ts --paradigm solar   (POD="Pulsar Pod" for the other)
// Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function prStat(d: Drive): Promise<void> {
  const { page } = d;
  const pod = process.env.POD ?? 'Quasar Pod';
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const pk = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const rows = (k: string) => g.lists?.[k]?.rows.filter((r) => r.stat).length ?? 0;
    return g.nodes.filter((n) => n.kind === 'facility').sort((a, b) => rows(b.projectionKey) - rows(a.projectionKey))[0]?.projectionKey ?? null;
  });
  if (!pk) { d.note('no station'); return; }
  await page.evaluate((k) => {
    const t = window.__starChartTest!;
    const n = t.viewGraph()!.nodes.find((x) => x.projectionKey === k)!;
    const p = t.screenOf(n.canonicalKey)!;
    const r = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
    const into = (v: number, lo: number, hi: number) => (v < lo ? v - lo : v > hi ? v - hi : 0);
    const dx = into(p.x, 120, r.width - 460), dy = into(p.y, 200, r.height - 260);
    const cam = t.camera();
    if (dx || dy) t.setCamera({ ...cam, x: cam.x + dx / cam.scale, y: cam.y + dy / cam.scale });
  }, pk);
  await d.settle();
  await page.waitForTimeout(800);
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const at = (await page.evaluate((k) => window.__starChartTest!.displayed().find((x) => x.pk === k) ?? null, pk))!;
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await page.waitForTimeout(600);
  d.note(`stat lines: ${JSON.stringify(await page.locator('.callout--facility.is-expanded .holo__stat').allTextContents())}`);
  d.note(`geometry: ${JSON.stringify(await page.evaluate(() => { const r = (e: Element | null) => { const b = e?.getBoundingClientRect(); return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } : null; }; const pl = document.querySelector('.callout--facility.is-expanded'); return { plate: r(pl), host: r(document.querySelector('.chart-host')), list: r(pl?.querySelector('.holo__list') ?? null), title: r(pl?.querySelector('.callout__title') ?? null), kids: [...(pl?.children ?? [])].map((c) => c.className + ':' + Math.round(c.getBoundingClientRect().top) + '-' + Math.round(c.getBoundingClientRect().bottom)), scrollTop: (pl as HTMLElement | null)?.scrollTop, maxH: (pl as HTMLElement | null)?.style.maxHeight, css: (pl as HTMLElement | null)?.style.cssText, cv: (() => { const c = document.querySelector('.chart-host canvas') as HTMLCanvasElement; return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, dpr: devicePixelRatio, style: c.style.cssText }; })(), win: innerHeight }; }))}`);
  await d.shot(`${pod.split(' ')[0]!.toLowerCase()}-station-plate`);
}

// D1 planner probe: through each merge beat in Quasar Pod and Pulsar Pod, sample every 100 ms and report
// captain plates that overlap each other or another captain's ship. Fixture data only (INV-18).
// Run: npm run drive -- docs/progress/v1.4/work/D1/probe-baseline.ts --paradigm solar
import { writeFileSync } from 'node:fs';
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  const report: unknown[] = [];
  for (const pod of (process.env.D1_PODS ?? 'Quasar Pod,Pulsar Pod').split(',')) {
    await page.locator('.callout', { hasText: pod }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
    await page.mouse.move(2, 2);
    const merges = await page.evaluate(async () => {
      const t = window.__starChartTest!;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const mg = (stage: string) => Number(/\|mg=(\d+)/.exec(stage)?.[1] ?? 0);
      let before = new Map<string, number>();
      const out: { startMs: number; label: string }[] = [];
      for (const b of t.beatTimes()) {
        t.setScheduleMs(b.startMs + 1);
        await frame();
        const fac = t.viewGraph()!.nodes.filter((n) => n.kind === 'facility');
        for (const n of fac) { const was = before.get(n.projectionKey); if (was !== undefined && mg(n.stage) > was) out.push({ startMs: b.startMs, label: n.label }); }
        before = new Map(fac.map((n) => [n.projectionKey, mg(n.stage)]));
      }
      return out;
    });
    d.note(`${pod}: ${merges.length} merges ${JSON.stringify(merges)}`);
    let k = 0;
    for (const m of merges.slice(0, Number(process.env.D1_MAX ?? 3))) {
      await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), m.startMs);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__starChartTest!.stepBeat());
      let worst = { n: 0, at: 0 };
      let plateHits = 0, shipHits = 0, samples = 0;
      const t0 = Date.now();
      for (let i = 0; i < 150; i++) {
        await page.waitForTimeout(100);
        const s = await page.evaluate(() => {
          const t = window.__starChartTest!;
          const scale = t.camera().scale;
          const caps = new Map(t.viewGraph()!.nodes.filter((n) => n.kind === 'captain').map((n) => [n.label, n]));
          const pos = new Map(t.displayed().map((x) => [x.pk, x]));
          const host = document.querySelector('.chart-host')!.getBoundingClientRect();
          const plates = [...document.querySelectorAll<HTMLElement>('.callout--captain.callout--holo')].filter((e) => e.style.display !== 'none' && e.offsetParent !== null && e.style.opacity !== '0')
            .map((e) => { const r = e.getBoundingClientRect(); const title = e.querySelector('.callout__title')?.textContent ?? ''; return { title, tier: e.dataset.tier, side: e.dataset.side, x0: r.left - host.x, y0: r.top - host.y, x1: r.right - host.x, y1: r.bottom - host.y, acting: e.classList.contains('is-acting') }; })
            .filter((p) => p.tier !== 'picture' && p.x1 - p.x0 > 0);
          const ships = [...caps.values()].map((n) => { const p = pos.get(n.projectionKey); return p ? { title: n.label, x: p.x, y: p.y, r: Math.max(7, n.world.r * scale) } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
          return { plates, ships };
        });
        samples++;
        const ov = (a: typeof s.plates[0], b: typeof s.plates[0]) => !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
        let pp = 0, ps = 0;
        for (let a = 0; a < s.plates.length; a++) for (let b = a + 1; b < s.plates.length; b++) if (ov(s.plates[a]!, s.plates[b]!)) pp++;
        for (const p of s.plates) for (const sh of s.ships) {
          if (sh.title === p.title) continue;
          const nx = Math.max(p.x0, Math.min(sh.x, p.x1)), ny = Math.max(p.y0, Math.min(sh.y, p.y1));
          if (Math.hypot(nx - sh.x, ny - sh.y) < sh.r) ps++;
        }
        if (pp) plateHits++;
        if (ps) shipHits++;
        if (pp + ps > worst.n) { worst = { n: pp + ps, at: i }; await d.shot(`${pod.split(' ')[0]}-${k}-worst`); }
        if (i % 10 === 0 && s.plates.length) d.note(`${pod} m${k} +${((Date.now() - t0) / 1000).toFixed(1)}s plates=${s.plates.map((p) => `${p.title}:${p.side}${p.acting ? '*' : ''}`).join(' ')}`);
      }
      report.push({ pod, merge: m, samples, plateHits, shipHits, worst });
      d.note(JSON.stringify(report.at(-1)));
      k++;
    }
    await page.keyboard.press('Escape');
    await d.settle();
  }
  writeFileSync('docs/progress/v1.4/work/D1/probe-baseline.json', JSON.stringify(report, null, 2));
}

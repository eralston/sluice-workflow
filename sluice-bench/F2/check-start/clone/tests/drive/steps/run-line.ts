// 23 B2 (HG-B): station plates on Halcyon's Quasar Pod, each with its repository's last pipeline run.
// One still per result (failed, running, partly passed, passed, canceled, and a repo with no pipeline).
// Run: npm run drive -- tests/drive/steps/run-line.ts --paradigm solar   (POD="Pulsar Pod" for the other)
// Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function runLine(d: Drive): Promise<void> {
  const { page } = d;
  const pod = process.env.POD ?? 'Quasar Pod';
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  // The runs are read after the scene is drawn: wait until the lines have landed.
  await page.waitForFunction(() => {
    const g = window.__starChartTest!.viewGraph()!;
    return g.nodes.filter((n) => n.kind === 'facility').some((n) => (g.lists?.[n.projectionKey]?.run?.text ?? '') !== '');
  }, undefined, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const stations = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    return g.nodes.filter((n) => n.kind === 'facility').map((n) => ({ pk: n.projectionKey, name: n.label, text: g.lists?.[n.projectionKey]?.run?.text ?? '', state: g.lists?.[n.projectionKey]?.run?.state ?? 'none', rows: g.lists?.[n.projectionKey]?.rows.length ?? 0 }));
  });
  d.note(`stations: ${JSON.stringify(stations)}`);
  const wanted = ['failed', 'running', 'partly', 'passed', 'canceled', 'none'];
  for (const state of wanted) {
    const st = stations.filter((s) => s.state === state && s.rows > 0).sort((a, b) => b.rows - a.rows)[0];
    if (!st) { d.note(`no station with ${state}`); continue; }
    await page.evaluate((k) => {
      const t = window.__starChartTest!;
      const n = t.viewGraph()!.nodes.find((x) => x.projectionKey === k)!;
      const p = t.screenOf(n.canonicalKey)!;
      const r = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
      const into = (v: number, lo: number, hi: number) => (v < lo ? v - lo : v > hi ? v - hi : 0);
      const dx = into(p.x, 120, r.width - 460), dy = into(p.y, 200, r.height - 260);
      const cam = t.camera();
      if (dx || dy) t.setCamera({ ...cam, x: cam.x + dx / cam.scale, y: cam.y + dy / cam.scale });
    }, st.pk);
    await d.settle();
    await page.waitForTimeout(800);
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const at = (await page.evaluate((k) => window.__starChartTest!.displayed().find((x) => x.pk === k) ?? null, st.pk))!;
    await page.mouse.move(box.x + at.x, box.y + at.y);
    await page.waitForTimeout(700);
    d.note(`${state}: ${st.name} → ${JSON.stringify(await page.locator('.callout--facility.is-expanded .holo__run').allTextContents())}`);
    await d.shot(`${pod.split(' ')[0]!.toLowerCase()}-${state}`);
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.waitForTimeout(700);
  }
}

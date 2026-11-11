// 27 E9 (05 §6): the directed camera. In Halcyon's Pulsar Pod a climax eases the camera toward its cast
// (the target stays inside the cast's bounds), a seek lands on the fitted board, and under reduced motion
// the camera does not move. In Quasar Pod a montage pulls it back to the fitted board. Fresh apps per pod
// (27 D1). Fixture data only (INV-18).
import { expect, test, type Page } from '@playwright/test';
import { frames, launchApp, settle } from './launch';

const LEAD_MS = 1000; // upper bound used only to trim the window; the shot must hold to the beat's end less a lead-in
const CLIMAX_MS = 900;

async function enter(page: Page, pod: string): Promise<void> {
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(page);
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(page);
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setReduced(false); t.setRate(1); });
}

type Cam = { x: number; y: number; scale: number };
const near = (a: Cam, b: Cam) => Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 && Math.abs(a.scale / b.scale - 1) <= 1e-3;

test.describe('the camera directs (27 E9)', () => {
  test.setTimeout(300_000);

  test('Pulsar Pod: the climax shot stays within its cast; a seek lands on the board; reduced motion holds still', async () => {
    const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '' });
    try {
      await enter(page, 'Pulsar Pod');
      const board = await page.evaluate(() => window.__starChartTest!.camera());
      const fit0 = (await page.evaluate(() => window.__starChartTest!.directedCamera())).fit;
      expect(near(board, fit0), 'the board is the fit').toBe(true);
      const shots = (await page.evaluate(() => window.__starChartTest!.shots())).filter((s) => s.kind === 'climax');
      expect(shots.length, 'Pulsar has climaxes').toBeGreaterThan(0);
      const shot = shots.find((s) => s.endMs - LEAD_MS - (s.gatherMs + CLIMAX_MS) >= 500);
      expect(shot, 'a climax with a window of at least 500 ms').toBeTruthy();
      const s = shot!;

      // 1. The climax: sampled in the page every frame while x is inside the window.
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), s.startMs - 1);
      await frames(page);
      await page.evaluate(({ from, to, cast }) => {
        type Rec = { samples: { x: number; y: number; scale: number; fitScale: number; inX: boolean; inY: boolean }[]; on: boolean };
        const rec: Rec = { samples: [], on: true };
        (window as unknown as { __e9: Rec }).__e9 = rec;
        const t = window.__starChartTest!;
        const tick = () => {
          if (!rec.on) return;
          const x = t.session().x;
          if (x >= from && x <= to) {
            const d = t.directedCamera();
            const ns = t.targetNodes().filter((n) => cast.includes(n.canonicalKey));
            const minX = Math.min(...ns.map((n) => n.world.x)), maxX = Math.max(...ns.map((n) => n.world.x));
            const minY = Math.min(...ns.map((n) => n.world.y)), maxY = Math.max(...ns.map((n) => n.world.y));
            rec.samples.push({ ...d.target, fitScale: d.fit.scale, inX: d.target.x >= minX - 1 && d.target.x <= maxX + 1, inY: d.target.y >= minY - 1 && d.target.y <= maxY + 1 });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        t.play();
      }, { from: s.gatherMs + CLIMAX_MS, to: s.endMs - LEAD_MS, cast: s.cast });
      await page.waitForFunction((end) => window.__starChartTest!.session().x >= end, s.endMs - LEAD_MS, { timeout: 120_000, polling: 100 });
      const samples = await page.evaluate(() => {
        const rec = (window as unknown as { __e9: { samples: { x: number; y: number; scale: number; fitScale: number; inX: boolean; inY: boolean }[]; on: boolean } }).__e9;
        rec.on = false;
        return rec.samples;
      });
      expect(samples.length, 'sampled the climax shot').toBeGreaterThanOrEqual(3);
      expect(samples.every((q) => q.inX && q.inY), 'the target lies within the cast bounds').toBe(true);
      expect(samples.every((q) => q.scale >= q.fitScale * (1 - 1e-3)), 'never out past the board').toBe(true);

      // 2. The seek: inside the shot, then back three seconds before the beat.
      expect((await page.evaluate(() => window.__starChartTest!.directedCamera())).shot, 'the climax shot holds').toBe('climax');
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), s.startMs - 3000);
      await frames(page);
      const after = await page.evaluate(() => ({ cam: window.__starChartTest!.camera(), d: window.__starChartTest!.directedCamera() }));
      expect(near(after.cam, after.d.fit), 'the camera is on the fitted board').toBe(true);
      expect(near(after.d.target, after.d.fit), 'its target is the fitted board').toBe(true);
      await page.evaluate(() => window.__starChartTest!.pause());

      // 4. Reduced motion: the camera does not move.
      await page.evaluate((x) => { const t = window.__starChartTest!; t.setReduced(true); t.setScheduleMs(x); }, s.startMs - 1);
      await frames(page);
      const still = await page.evaluate(() => window.__starChartTest!.camera());
      await page.evaluate(() => window.__starChartTest!.play());
      await page.waitForFunction((x) => window.__starChartTest!.session().x >= x, s.gatherMs + 1500, { timeout: 120_000, polling: 100 });
      const end = await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); return t.camera(); });
      await page.evaluate(() => window.__starChartTest!.setReduced(false));
      expect(near(end, still), 'reduced motion: the camera holds still').toBe(true);
    } finally {
      await app.close();
    }
  });

  test('Quasar Pod: a montage pulls the camera back to the fitted board', async () => {
    const { app, page } = await launchApp({ STAR_CHART_PARADIGM: 'solar' });
    try {
      await enter(page, 'Quasar Pod');
      const fit = (await page.evaluate(() => window.__starChartTest!.directedCamera())).fit;
      const shot = (await page.evaluate(() => window.__starChartTest!.shots())).find((s) => s.kind === 'montage');
      expect(shot, 'Quasar has a montage').toBeTruthy();
      const s = shot!;
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), s.startMs - 1);
      await frames(page);
      await page.evaluate((c) => window.__starChartTest!.setCamera(c), { x: fit.x + 200 / fit.scale, y: fit.y, scale: fit.scale * 1.4 });
      await page.evaluate(({ from, to }) => {
        type Rec = { n: number; bad: number; on: boolean };
        const rec: Rec = { n: 0, bad: 0, on: true };
        (window as unknown as { __e9m: Rec }).__e9m = rec;
        const t = window.__starChartTest!;
        const tick = () => {
          if (!rec.on) return;
          const x = t.session().x;
          if (x >= from && x < to) {
            const g = t.directedCamera().target;
            rec.n++;
            const f = t.directedCamera().fit; // the board drifts a little as the day's state changes: the fit now
            if (Math.abs(g.x - f.x) > 0.5 || Math.abs(g.y - f.y) > 0.5 || Math.abs(g.scale / f.scale - 1) > 1e-3) rec.bad++;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        t.play();
      }, { from: s.startMs, to: s.endMs });
      await page.waitForFunction((end) => window.__starChartTest!.session().x >= end, s.endMs, { timeout: 120_000, polling: 100 });
      const rec = await page.evaluate(() => {
        const r = (window as unknown as { __e9m: { n: number; bad: number; on: boolean } }).__e9m;
        r.on = false;
        window.__starChartTest!.pause();
        return { n: r.n, bad: r.bad };
      });
      expect(rec.n, 'sampled the montage').toBeGreaterThanOrEqual(3);
      expect(rec.bad, 'the target is the fitted board on every sample').toBe(0);
    } finally {
      await app.close();
    }
  });
});

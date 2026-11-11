// The board in the orbit (06 §3, 05 §5, decided 2026-10-09): in a Feature system, a body that moves to
// a later column travels rightward along its own ring (or bows out to the next ring while passing),
// never cutting straight across. Sampled from the drawn positions while playing.
import { expect, test } from '@playwright/test';
import { frames, launchApp, openFeature101 } from './launch';

test.describe.configure({ timeout: 120_000 });

test('a state change travels along the ring, left to right (E)', async () => {
  const { app, page } = await launchApp();
  try {
    await openFeature101(page);
    // A beat in this scene that moves a planet or anomaly rightward on its ring. Each seek is read
    // after two frames have drawn it (`frames`), not after a fixed wait: under load a 30 ms wait could
    // see no frame, and the plan then read the places of the seek before.
    type Place = { x: number; y: number };
    type Ring = { cx: number; cy: number; rx: number; ry: number };
    /** Seek, let it draw, then each selectable planet's and anomaly's place and its orbit ring. */
    const bodiesAt = async (ms: number) => {
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
      await frames(page);
      return page.evaluate(() => {
        const t = window.__starChartTest!;
        const g = t.viewGraph()!;
        return t.targetNodes().filter((n) => (n.kind === 'planet' || n.kind === 'anomaly') && n.selectable).map((n) => {
          const e = g.edges.find((x) => x.kind === 'orbit' && x.to === n.projectionKey);
          const ring = e?.geometry?.kind === 'ellipse' ? { cx: e.geometry.cx, cy: e.geometry.cy, rx: e.geometry.rx, ry: e.geometry.ry } : null;
          return { pk: n.projectionKey, world: { x: n.world.x, y: n.world.y }, ring, rings: g.board?.rings.map((r) => r.rx) ?? [] };
        });
      });
    };
    let plan: { pk: string; startMs: number; from: Place; to: Place; ring: Ring; rings: number[] } | null = null;
    for (const b of await page.evaluate(() => window.__starChartTest!.beatTimes())) {
      const before = new Map((await bodiesAt(Math.max(0, b.startMs - 1))).map((n) => [n.pk, n]));
      for (const n of await bodiesAt(b.startMs + 1)) {
        const w = before.get(n.pk);
        if (w?.ring && n.ring && Math.abs(w.ring.rx - n.ring.rx) < 1 && n.world.x - w.world.x > 300) {
          plan = { pk: n.pk, startMs: b.startMs, from: w.world, to: n.world, ring: n.ring, rings: n.rings };
          break;
        }
      }
      if (plan) break;
    }
    expect(plan, 'a rightward move on a ring in this week').not.toBeNull();
    const p = plan!;
    await page.evaluate((x) => { const t = window.__starChartTest!; t.setScheduleMs(x - 400); t.setRate(1); }, p.startMs);
    // The seek has drawn when the body is back where it was. Polled, not a fixed wait: under load a
    // fixed wait raced the draw, and the travel then started from the stale place.
    const drawnAt = (pk: string) => page.evaluate((k) => window.__starChartTest!.liveNodes().find((m) => m.projectionKey === k)?.world ?? null, pk);
    await expect.poll(async () => { const w = await drawnAt(p.pk); return w ? Math.hypot(w.x - p.from.x, w.y - p.from.y) : Infinity; }, { timeout: 10_000 }).toBeLessThan(1);
    // Sampled in the page on every frame, from play until the body arrives, so a slow round trip under
    // load can't leave too few samples. Bounded by the chart's own clock, not the wall's: 8 s of playhead
    // past the beat (at 1×) is far longer than the travel, and a loaded machine, whose clock advances at
    // most 100 ms a frame, gets the same stretch of the move (a flat 8 s of wall time cut it short).
    const path = await page.evaluate(async ({ pk, to, endMs }) => {
      const t = window.__starChartTest!;
      const out: { x: number; y: number }[] = [];
      t.play();
      const wallCap = performance.now() + 60_000; // a backstop only a stalled clock reaches
      while (t.session().x < endMs && t.session().status === 'playing') {
        if (performance.now() > wallCap) { t.pause(); throw new Error(`the playhead stalled at ${Math.round(t.session().x)} ms (wanted ${endMs})`); }
        await new Promise((r) => requestAnimationFrame(r));
        const w = t.liveNodes().find((m) => m.projectionKey === pk)?.world;
        if (w) out.push({ x: w.x, y: w.y });
        if (w && Math.hypot(w.x - to.x, w.y - to.y) < 0.5) break;
      }
      t.pause();
      return out;
    }, { pk: p.pk, to: p.to, endMs: p.startMs + 8_000 });
    const moving = path.filter((q, i) => i > 0 && Math.hypot(q.x - path[i - 1]!.x, q.y - path[i - 1]!.y) > 0.5);
    expect(moving.length).toBeGreaterThan(5);
    // Left to right, mostly: x never steps back by more than a little.
    for (let i = 1; i < path.length; i++) expect(path[i]!.x).toBeGreaterThanOrEqual(path[i - 1]!.x - 5);
    // On the orbit: each point lies on an ellipse around the star between this ring and its neighbour
    // (the bow while passing), never inside it the way a straight chord across the front would. The
    // inner bound sits halfway between the ring (k = 1) and the chord's deepest point: a fixed 0.97
    // was below the chord itself on this move, so it couldn't tell the two apart.
    const { cx, cy, rx, ry } = p.ring;
    const kOf = (q: { x: number; y: number }) => Math.hypot((q.x - cx) / rx, (q.y - cy) / ry);
    const chord = kOf({ x: (p.from.x + p.to.x) / 2, y: (p.from.y + p.to.y) / 2 });
    expect(chord, 'the move is long enough that a chord would show').toBeLessThan(0.995);
    const inner = (1 + chord) / 2;
    const i = p.rings.findIndex((r) => Math.abs(r - rx) < 1);
    const outer = (p.rings[i + 1] ?? rx) / rx;
    for (const q of moving) {
      const k = kOf(q);
      expect(k, `${q.x.toFixed(0)},${q.y.toFixed(0)}`).toBeGreaterThan(inner);
      expect(k).toBeLessThan(outer + 0.05);
    }
    // And it gets there: at least most of the way to its new column inside the sampling window.
    expect(path.at(-1)!.x - p.from.x).toBeGreaterThan((p.to.x - p.from.x) * 0.75);
  } finally {
    await app.close();
  }
});

test('lane heads say whose ring it is, without taking clicks; the map key explains the board (E)', async () => {
  const { app, page } = await launchApp();
  try {
    await openFeature101(page);
    const g = await page.evaluate(() => window.__starChartTest!.viewGraph()!);
    expect(g.board!.heads.length).toBeGreaterThan(1);
    await expect(page.locator('.lane-head')).toHaveCount(g.board!.heads.length);
    expect(await page.locator('.lane-head').first().evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(g.board!.ticks).toHaveLength(3); // four columns, three boundaries
    await page.keyboard.press('k');
    await expect(page.locator('.map-key')).toContainText('Each ring is a person');
    await page.screenshot({ path: 'test-results/board-1-key.png' });
  } finally {
    await app.close();
  }
});


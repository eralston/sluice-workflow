// 27 C3: the look gate for the baked role outlines. For up to six open asteroids (blue), six hive ships (red) and six Closed
// pieces (gold), at the fit and at 2x, it shoots a crop with `auraBake` off (the live filters), on (the cached layers) and with
// no aura, flipping the profile switch between shots, then compares the two in-page: the per-pixel max-channel difference,
// over the pixels the aura touches (those where either mode differs from the bare shot by 8/255 or more) and over the whole crop.
// Pass: the 99th percentile over the aura's pixels is at most 12/255 and no pixel is past 64/255. Reduced motion, paused.
// C3_POD="Galaxy|Sprint|Pod" picks the region (default Tidewater Array, Sprint 13, Harbor Pod; Pulsar is "Halcyon Reach|Sprint 41|Pulsar Pod");
// C3_PICKS pieces per role; C3_ZOOMS the zooms. Shots are at device scale. Run with --paradigm solar. DRIVE_NAME names the output folder.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Drive } from '../drive';

const BLUE = 0x009ccc;
const RED = 0xcc293d;
const GOLD = 0xffc76b;

export default async function c3(d: Drive): Promise<void> {
  const { page } = d;
  const out = resolve(process.cwd(), 'test-results/drive', process.env.DRIVE_NAME ?? 'c3-aura-diff');
  await d.settle();
  const [galaxy, sprint, pod] = (process.env.C3_POD ?? 'Tidewater Array|Sprint 13|Harbor Pod').split('|') as [string, string, string];
  await page.locator('.callout--galaxy', { hasText: galaxy }).first().click();
  await page.waitForTimeout(600);
  const chooser = page.locator('.chooser button', { hasText: sprint });
  if (await chooser.count()) await chooser.first().click();
  else await page.locator('.callout--galaxy', { hasText: galaxy }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.evaluate(() => { window.__starChartTest!.pause(); window.__starChartTest!.setReduced(true); });
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height - 4);
  const fit = await page.evaluate(() => window.__starChartTest!.camera());
  // C3_PARTS=rim|glow|unkeyed|all shoots one part alone (to find which part differs).
  const parts = (process.env.C3_PARTS ?? 'all') as 'all' | 'rim' | 'glow' | 'unkeyed';
  const bake = async (on: boolean) => {
    await page.evaluate((v) => window.__starChartTest!.setProfile({ render: { switches: { auraBake: v } } }), on);
    await page.waitForTimeout(260);
  };
  const rows: { noise: number; color: string; zoom: number; i: number; aura: number; p99: number; p999: number; max: number; allP99: number; meanAura: number }[] = [];
  for (const phase of [{ at: 0.35, colors: [BLUE, RED] }, { at: 0.999, colors: [GOLD] }]) {
    await page.evaluate((f) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * f), phase.at);
    await d.settle();
    await page.waitForTimeout(900);
    await page.evaluate((c) => window.__starChartTest!.setCamera(c), fit);
    await page.waitForTimeout(500);
    const nodes = await page.evaluate(() => window.__starChartTest!.liveNodes()
      .filter((n) => n.kind === 'objective' || n.kind === 'threat').map((n) => ({ key: n.canonicalKey, x: n.world.x, y: n.world.y })));
    const withColor = await page.evaluate((a) => {
      const auras = window.__starChartTest!.auras();
      return a.nodes.map((n) => {
        const p = window.__starChartTest!.screenOf(n.key);
        const hit = p ? auras.find((x) => Math.abs(x.x - p.x) < 12 && Math.abs(x.y - p.y) < 12) : undefined;
        return { ...n, color: hit?.color ?? 0 };
      });
    }, { nodes });
    for (const color of phase.colors) {
      const picks = withColor.filter((n) => n.color === color).slice(0, Number(process.env.C3_PICKS ?? 6));
      for (const zoom of (process.env.C3_ZOOMS ?? '1,2').split(',').map(Number)) {
        for (const [i, p] of picks.entries()) {
          // Each shot is taken at one camera; the modes are flipped between shots at the same camera, so only the mode differs.
          await page.evaluate((v) => window.__starChartTest!.showAuras(v), parts);
          await bake(false);
          await page.evaluate((c) => window.__starChartTest!.setCamera(c), { x: p.x, y: p.y, scale: fit.scale * zoom });
          await page.waitForTimeout(450);
          const at = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), p.key))!;
          const half = 30 * Math.min(zoom, 3);
          const clip = { x: box.x + at.x - half, y: box.y + at.y - half, width: half * 2, height: half * 2 };
          const tag = `${color.toString(16)}-z${zoom}-${i}`;
          const shot = async (name: string) => (await page.screenshot({ clip, scale: 'device', path: join(out, name) })).toString('base64');
          const live = await shot(`${tag}-live.png`);
          await page.evaluate(() => window.__starChartTest!.showAuras('none'));
          await page.waitForTimeout(120);
          const bare = await shot(`${tag}-bare.png`);
          await page.evaluate((v) => window.__starChartTest!.showAuras(v), parts);
          await bake(true);
          const baked = await shot(`${tag}-baked.png`);
          await bake(false);
          const live2 = await shot(`${tag}-live2.png`);
          const r = await page.evaluate(async (a) => {
            const pixels = async (b64: string) => {
              const img = new Image();
              img.src = `data:image/png;base64,${b64}`;
              await img.decode();
              const c = document.createElement('canvas');
              c.width = img.width; c.height = img.height;
              const g = c.getContext('2d')!;
              g.drawImage(img, 0, 0);
              return g.getImageData(0, 0, c.width, c.height).data;
            };
            const [l, b, k, l2] = [await pixels(a.live), await pixels(a.baked), await pixels(a.bare), await pixels(a.live2)];
            // Pieces move a little between shots (orbiting satellites, paint): mask every pixel within 2 px of one where two
            // live shots differ by 6/255 or more, so only the mode's own difference is judged. `noise` counts the masked pixels.
            const W = Math.round(Math.sqrt(l.length / 4)); const H = (l.length / 4) / W; // the crops are square
            const moving = new Uint8Array(W * H);
            for (let q = 0; q < l.length; q += 4) {
              let m = 0;
              for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(l[q + c]! - l2[q + c]!));
              if (m >= 6) moving[q / 4] = 1;
            }
            const masked = new Uint8Array(W * H);
            let noise = 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (!moving[y * W + x]) continue;
              for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                const yy = y + dy; const xx = x + dx;
                if (yy >= 0 && yy < H && xx >= 0 && xx < W) masked[yy * W + xx] = 1;
              }
            }
            for (const v of masked) noise += v;
            const all: number[] = []; const ar: number[] = [];
            for (let q = 0; q < l.length; q += 4) {
              if (masked[q / 4]) continue;
              let df = 0; let la = 0; let ba = 0;
              for (let c = 0; c < 3; c++) {
                df = Math.max(df, Math.abs(l[q + c]! - b[q + c]!));
                la = Math.max(la, Math.abs(l[q + c]! - k[q + c]!));
                ba = Math.max(ba, Math.abs(b[q + c]! - k[q + c]!));
              }
              all.push(df);
              if (la >= 8 || ba >= 8) ar.push(df);
            }
            const pct = (xs: number[], p: number) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))]! : 0; };
            return { noise, aura: ar.length, p99: pct(ar, 0.99), p999: pct(ar, 0.999), max: Math.max(0, ...all), allP99: pct(all, 0.99), meanAura: ar.length ? ar.reduce((x, y) => x + y, 0) / ar.length : 0 };
          }, { live, baked, bare, live2 });
          rows.push({ color: color.toString(16), zoom, i, ...r });
          d.note(`${tag}: masked ${r.noise}, aura px ${r.aura}, p99 ${r.p99}, p99.9 ${r.p999}, max ${r.max}, mean ${r.meanAura.toFixed(2)}, whole-crop p99 ${r.allP99}`);
        }
      }
    }
  }
  const worstP99 = Math.max(...rows.map((r) => r.p99));
  const worstMax = Math.max(...rows.map((r) => r.max));
  d.note(`GATE ${pod}: ${rows.length} crops; worst p99 ${worstP99} (limit 12), worst max ${worstMax} (limit 64): ${worstP99 <= 12 && worstMax <= 64 ? 'PASS' : 'FAIL'}`);
  writeFileSync(join(out, 'measure.json'), JSON.stringify(rows, null, 2));
  await page.evaluate(() => window.__starChartTest!.setProfile(null));
  await page.evaluate((c) => window.__starChartTest!.setCamera(c), fit);
}

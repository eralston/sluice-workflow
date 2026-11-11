// Stills and a measurement for 19 S1 (fixture data only, INV-18): the one outline weight for danger
// and opportunity. Harbor Pod's region a third of the way through the round, reduced motion (each aura
// at its steady alpha), at three zooms: the fit, 2× and 4× (`S1_ZOOMS`). At each zoom the camera
// centres on three open asteroids and three open hive ships in turn, and shoots a crop round each
// twice, with every aura drawn and with none (the `showAuras` hook), so the difference is the outline
// alone. Along 32 rays out of the piece it measures that difference: the band's width at half its
// peak (the rim as it reads), the peak, its ΔE (CIE76) against the bare sky, and how far past the band
// the glow still lifts the sky by 8 levels (its reach). The medians go to the console log and to
// `measure.json`; `sheet.png` is a contact sheet, a row per zoom. `S1_PART=rim|glow` measures one part.
// Run with --paradigm solar.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Drive } from '../drive';

/** One aura's outline, measured on screen (CSS px). */
interface Measure { kind: string; zoom: number; rays: number; fwhm: number; peak: number; dE: number; reach: number; rimPx: number; blurPx: number; alpha: string }

export default async function v11S1(d: Drive): Promise<void> {
  const { page } = d;
  const out = resolve(process.cwd(), 'test-results/drive', process.env.DRIVE_NAME ?? 'v11-S1');
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  const sprint13 = page.locator('.chooser button', { hasText: 'Sprint 13' });
  if (await sprint13.count()) await sprint13.first().click();
  else await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.35));
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.setReduced(true));
  if (process.env.S1_PAINT === 'off') await page.evaluate(() => window.__starChartTest!.setPaint(false));
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height - 4);
  await page.waitForTimeout(900);
  await d.shot('fit');
  const fit = await page.evaluate(() => window.__starChartTest!.camera());
  const nodes = await page.evaluate(() => window.__starChartTest!.liveNodes()
    .filter((n) => n.kind === 'objective' || n.kind === 'threat').map((n) => ({ key: n.canonicalKey, kind: n.kind, x: n.world.x, y: n.world.y })));
  // Pieces whose aura is in its role colour now (open work), three of each role.
  const open = await page.evaluate((ns) => {
    const auras = window.__starChartTest!.auras();
    return ns.filter((n) => {
      const p = window.__starChartTest!.screenOf(n.key);
      return !!p && auras.some((a) => (a.color === 0x009ccc || a.color === 0xcc293d) && Math.abs(a.x - p.x) < 12 && Math.abs(a.y - p.y) < 12);
    }).map((n) => n.key);
  }, nodes);
  const live = nodes.filter((n) => open.includes(n.key));
  const picks = [...live.filter((n) => n.kind === 'objective').slice(0, 3), ...live.filter((n) => n.kind === 'threat').slice(0, 3)];
  d.note(`${nodes.length} pieces, ${live.length} open with an aura`);
  const results: Measure[] = [];
  const tiles: { zoom: number; b64: string }[] = [];
  for (const zoom of (process.env.S1_ZOOMS ?? '1,2,4').split(',').map(Number)) {
    for (const [i, p] of picks.entries()) {
      await page.evaluate((c) => window.__starChartTest!.setCamera(c), { x: p.x, y: p.y, scale: fit.scale * zoom });
      await page.waitForTimeout(500);
      const at = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), p.key))!;
      const half = 30 * Math.min(zoom, 3);
      const clip = { x: box.x + at.x - half, y: box.y + at.y - half, width: half * 2, height: half * 2 };
      // S1_PART=rim or glow measures that part alone (the other is hidden in both shots).
      const part: 'all' | 'rim' | 'glow' = process.env.S1_PART === 'rim' || process.env.S1_PART === 'glow' ? process.env.S1_PART : 'all';
      const show = (on: boolean) => {
        const parts: 'all' | 'none' | 'rim' | 'glow' = on ? part : 'none';
        return page.evaluate((v) => window.__starChartTest!.showAuras(v), parts);
      };
      const name = `z${zoom}-${i}-${p.kind}`;
      await show(true);
      await page.waitForTimeout(120);
      const on = await page.screenshot({ clip, scale: 'css', path: join(out, `${name}.png`) });
      await show(false);
      await page.waitForTimeout(120);
      const off = await page.screenshot({ clip, scale: 'css', path: join(out, `${name}-bare.png`) });
      await show(true);
      tiles.push({ zoom, b64: on.toString('base64') });
      const m = await page.evaluate(async (a) => {
        const pixels = async (b64: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d')!;
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, c.width, c.height);
        };
        const [on, off] = [await pixels(a.on), await pixels(a.off)];
        const w = on.width;
        const h = on.height;
        const diff = (x: number, y: number) => {
          const xi = Math.round(x);
          const yi = Math.round(y);
          if (xi < 0 || yi < 0 || xi >= w || yi >= h) return -1;
          const k = (yi * w + xi) * 4;
          return Math.max(0, on.data[k]! - off.data[k]!, on.data[k + 1]! - off.data[k + 1]!, on.data[k + 2]! - off.data[k + 2]!);
        };
        // The aura nearest the centre: its own numbers (rim offset and blur on screen, alphas).
        const best = window.__starChartTest!.auras().reduce((p, q) => (Math.hypot(q.x - a.cx, q.y - a.cy) < Math.hypot(p.x - a.cx, p.y - a.cy) ? q : p));
        // CIE76 ΔE between the drawn and the bare pixel: how far the outline stands off the sky behind it.
        const lab = (r8: number, g8: number, b8: number) => {
          const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          const [r, g, b] = [lin(r8), lin(g8), lin(b8)];
          const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
          const [x, y, z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089];
          return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))] as const;
        };
        const deltaE = (x: number, y: number) => {
          const k = (Math.round(y) * w + Math.round(x)) * 4;
          const p = lab(on.data[k]!, on.data[k + 1]!, on.data[k + 2]!);
          const q = lab(off.data[k]!, off.data[k + 1]!, off.data[k + 2]!);
          return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        };
        const dE: number[] = [];
        const fwhm: number[] = [];
        const peak: number[] = [];
        const reach: number[] = [];
        for (let r = 0; r < 32; r++) {
          const ux = Math.cos((r / 32) * Math.PI * 2);
          const uy = Math.sin((r / 32) * Math.PI * 2);
          const prof: number[] = [];
          for (let s = 0; s < w; s += 0.5) {
            const v = diff(w / 2 + ux * s, h / 2 + uy * s);
            if (v < 0) break;
            prof.push(v);
          }
          // The outermost band: the last sample over 20, then its peak inward from there.
          let end = prof.length - 1;
          while (end >= 0 && prof[end]! < 20) end--;
          if (end < 0) continue;
          let pk = end;
          for (let s = end; s >= 0 && prof[s]! >= 20; s--) if (prof[s]! > prof[pk]!) pk = s;
          const halfV = prof[pk]! / 2;
          let lo = pk;
          let hi = pk;
          while (lo > 0 && prof[lo - 1]! >= halfV) lo--;
          while (hi < prof.length - 1 && prof[hi + 1]! >= halfV) hi++;
          let far = hi;
          while (far < prof.length - 1 && prof[far + 1]! >= 8) far++;
          fwhm.push((hi - lo + 1) * 0.5);
          dE.push(deltaE(w / 2 + ux * pk * 0.5, h / 2 + uy * pk * 0.5));
          peak.push(prof[pk]!);
          reach.push((far - hi) * 0.5);
        }
        const med = (xs: number[]) => (xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)]! : NaN);
        return { rays: fwhm.length, fwhm: med(fwhm), peak: med(peak), dE: Math.round(med(dE)), reach: med(reach), rimPx: best.rimPx, blurPx: best.blurPx, alpha: `${best.rimAlpha.toFixed(2)}/${best.glowAlpha.toFixed(2)} #${best.color.toString(16)}` };
      }, { on: on.toString('base64'), off: off.toString('base64'), cx: at.x, cy: at.y });
      const row = { kind: p.kind, zoom, ...m };
      results.push(row);
      d.note(`${name}: rays ${m.rays} band ${m.fwhm}px peak ${m.peak} ΔE ${m.dE} glow ${m.reach}px | rim offset ${m.rimPx.toFixed(2)}px blur ${m.blurPx.toFixed(2)}px alpha ${m.alpha}`);
    }
  }
  writeFileSync(join(out, 'measure.json'), JSON.stringify(results, null, 2));
  // A contact sheet: a row per zoom, the asteroids then the hive ships, each crop at 240 px, pixels kept sharp.
  const sheet = await page.evaluate(async (ts) => {
    const T = 240;
    const zooms = [...new Set(ts.map((t) => t.zoom))];
    const cols = Math.max(...zooms.map((z) => ts.filter((t) => t.zoom === z).length));
    const c = document.createElement('canvas');
    c.width = cols * T;
    c.height = zooms.length * T;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const [r, z] of zooms.entries()) {
      for (const [k, t] of ts.filter((x) => x.zoom === z).entries()) {
        const img = new Image();
        img.src = `data:image/png;base64,${t.b64}`;
        await img.decode();
        g.drawImage(img, k * T, r * T, T, T);
      }
    }
    return c.toDataURL('image/png').split(',')[1]!;
  }, tiles);
  writeFileSync(join(out, 'sheet.png'), Buffer.from(sheet, 'base64'));
  await page.evaluate((c) => window.__starChartTest!.setCamera(c), fit);
}

// 23 C1: the role outlines' contrast, measured from what is drawn (fixture data only, INV-18). Harbor Pod,
// reduced motion (each aura at its steady alpha). For up to six open asteroids (Opportunity blue), six open
// hive ships (Deadly red) and six Closed pieces (Victory gold), at the fit and at 2x, it shoots a crop four
// ways: rim only (to find the band), every part but the keyline, every part, no aura. Along 32 rays out of
// the piece it finds the rim's band, then reads the outline's brightest pixel and, as WCAG 2 contrast
// ((L1 + 0.05) / (L2 + 0.05) on relative luminance), compares it with: the bare backdrop under it, the pixel
// 1 px past the band (as rendered: the keyline's own), the pixel 3.5 px past it, and the body 2 px inside it,
// with the keyline on and off. Rays are pooled per role and split by backdrop: night sky (bare luminance
// under 0.02) or planet face / bright nebula (above). Medians go to the console and `measure.json`.
// Gold's "body" is the dark gap inside its ring, not a body. Shots are at device scale (C1_SCALE=css for CSS px).
// C1_POD, C1_PICKS (pieces per role), C1_ZOOMS pick the region, the sample and the zooms. Run with --paradigm solar.
// DRIVE_NAME names the output folder.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Drive } from '../drive';

const BLUE = 0x009ccc;
const RED = 0xcc293d;
const GOLD = 0xffc76b;

export default async function c1(d: Drive): Promise<void> {
  const { page } = d;
  const out = resolve(process.cwd(), 'test-results/drive', process.env.DRIVE_NAME ?? 'c1-contrast');
  await d.settle();
  // C1_POD="Galaxy|Sprint|Pod" picks the region (default Tidewater Array, Sprint 13, Harbor Pod); the fixture-rich
  // red-on-a-planet case is C1_POD="Meridian Works|Sprint 7|Convoy Planning Pod" (bugs sit on the planets' right halves).
  const [galaxy, sprint, pod] = (process.env.C1_POD ?? 'Tidewater Array|Sprint 13|Harbor Pod').split('|') as [string, string, string];
  await page.locator('.callout--galaxy', { hasText: galaxy }).first().click();
  await page.waitForTimeout(600);
  const chooser = page.locator('.chooser button', { hasText: sprint });
  if (await chooser.count()) await chooser.first().click();
  else await page.locator('.callout--galaxy', { hasText: galaxy }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: pod }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.setReduced(true));
  // C1_AURABAKE=off|on forces the profile's aura switch (27 C3: the baked outlines must read the same).
  if (process.env.C1_AURABAKE) await page.evaluate((v) => window.__starChartTest!.setProfile({ render: { switches: { auraBake: v === 'on' } } }), process.env.C1_AURABAKE);
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height - 4);
  const fit = await page.evaluate(() => window.__starChartTest!.camera());
  const results: Record<string, unknown>[] = [];
  for (const phase of [{ at: 0.35, colors: [BLUE, RED] }, { at: 0.999, colors: [GOLD] }]) {
    await page.evaluate((f) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * f), phase.at);
    await d.settle();
    await page.waitForTimeout(900);
    await page.evaluate((c) => window.__starChartTest!.setCamera(c), fit);
    await page.waitForTimeout(500);
    const nodes = await page.evaluate(() => window.__starChartTest!.liveNodes()
      .filter((n) => n.kind === 'objective' || n.kind === 'threat').map((n) => ({ key: n.canonicalKey, kind: n.kind, x: n.world.x, y: n.world.y })));
    const withColor = await page.evaluate((a) => {
      const auras = window.__starChartTest!.auras();
      return a.nodes.map((n) => {
        const p = window.__starChartTest!.screenOf(n.key);
        const hit = p ? auras.find((x) => Math.abs(x.x - p.x) < 12 && Math.abs(x.y - p.y) < 12) : undefined;
        return { ...n, color: hit?.color ?? 0 };
      });
    }, { nodes });
    d.note(`phase ${phase.at}: ${nodes.length} pieces; colours ${[...new Set(withColor.map((n) => n.color.toString(16)))].join(',')}`);
    for (const color of phase.colors) {
      const picks = withColor.filter((n) => n.color === color).slice(0, Number(process.env.C1_PICKS ?? 6));
      for (const zoom of (process.env.C1_ZOOMS ?? '1,2').split(',').map(Number)) {
        for (const [i, p] of picks.entries()) {
          await page.evaluate((c) => window.__starChartTest!.setCamera(c), { x: p.x, y: p.y, scale: fit.scale * zoom });
          await page.waitForTimeout(450);
          const at = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), p.key))!;
          const half = 30 * Math.min(zoom, 3);
          const clip = { x: box.x + at.x - half, y: box.y + at.y - half, width: half * 2, height: half * 2 };
          const shot = async (parts: 'all' | 'rim' | 'none' | 'unkeyed', name: string) => {
            await page.evaluate((v) => window.__starChartTest!.showAuras(v), parts);
            await page.waitForTimeout(120);
            return (await page.screenshot({ clip, scale: process.env.C1_SCALE === 'css' ? 'css' : 'device', path: join(out, name) })).toString('base64');
          };
          const tag = `${color.toString(16)}-z${zoom}-${i}`;
          const rim = await shot('rim', `${tag}-rim.png`);
          const unkeyed = await shot('unkeyed', `${tag}-unkeyed.png`);
          const all = await shot('all', `${tag}.png`);
          const off = await shot('none', `${tag}-bare.png`);
          await page.evaluate(() => window.__starChartTest!.showAuras('all'));
          const rays = await page.evaluate(async (a) => {
            const pixels = async (b64: string) => {
              const img = new Image();
              img.src = `data:image/png;base64,${b64}`;
              await img.decode();
              const c = document.createElement('canvas');
              c.width = img.width; c.height = img.height;
              const g = c.getContext('2d')!;
              g.drawImage(img, 0, 0);
              return g.getImageData(0, 0, c.width, c.height);
            };
            const [rim, unkeyed, all, off] = [await pixels(a.rim), await pixels(a.unkeyed), await pixels(a.all), await pixels(a.off)];
            const w = all.width; const h = all.height;
            const f = w / (2 * a.half); // device pixels per CSS px
            const at = (im: ImageData, x: number, y: number) => {
              const xi = Math.round(x); const yi = Math.round(y);
              if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null;
              const k = (yi * w + xi) * 4;
              return [im.data[k]!, im.data[k + 1]!, im.data[k + 2]!] as const;
            };
            const lum = (c: readonly number[]) => {
              const lin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
              return 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
            };
            const ratio = (a1: readonly number[], b1: readonly number[]) => { const [x, y] = [lum(a1), lum(b1)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
            const diff = (x: number, y: number) => {
              const p = at(rim, x, y); const q = at(off, x, y);
              return p && q ? Math.max(0, p[0] - q[0], p[1] - q[1], p[2] - q[2]) : -1;
            };
            const out: { clean: boolean; backdropL: number; outL: number; keyedBare: number; unkeyedBare: number; keyedAdj: number; unkeyedAdj: number; keyedFar: number; unkeyedFar: number; body: number }[] = [];
            for (let r = 0; r < 32; r++) {
              const ux = Math.cos((r / 32) * Math.PI * 2); const uy = Math.sin((r / 32) * Math.PI * 2);
              const prof: number[] = [];
              for (let s = 0; s < w; s += 0.5) { const v = diff(w / 2 + ux * s * f, h / 2 + uy * s * f); if (v < 0) break; prof.push(v); }
              let end = prof.length - 1;
              while (end >= 0 && prof[end]! < 20) end--;
              if (end < 0) continue;
              let pk = end;
              for (let s = end; s >= 0 && prof[s]! >= 20; s--) if (prof[s]! > prof[pk]!) pk = s;
              const halfV = prof[pk]! / 2;
              let lo = pk; let hi = pk;
              while (lo > 0 && prof[lo - 1]! >= halfV) lo--;
              while (hi < prof.length - 1 && prof[hi + 1]! >= halfV) hi++;
              const P = (n: number) => [w / 2 + ux * n * 0.5 * f, h / 2 + uy * n * 0.5 * f] as const;
              const bare = at(off, ...P(pk));
              const ok = at(all, ...P(pk)); const uo = at(unkeyed, ...P(pk));
              const ka = at(all, ...P(hi + 2)); const ua = at(unkeyed, ...P(hi + 2));
              const kf = at(all, ...P(hi + 7)); const uf = at(unkeyed, ...P(hi + 7));
              const inside = at(off, ...P(lo - 4));
              if (!bare || !ok || !uo || !ka || !ua || !kf || !uf || !inside) continue;
              // The keyline shows where nothing of the piece covers it: a ray whose neighbour is the piece's own hull (legs, weapons) does not.
              out.push({ clean: lum(ua) - lum(ka) > 0.004, backdropL: lum(bare), outL: lum(ok), keyedBare: ratio(ok, bare), unkeyedBare: ratio(uo, bare), keyedAdj: ratio(ok, ka), unkeyedAdj: ratio(uo, ua), keyedFar: ratio(ok, kf), unkeyedFar: ratio(uo, uf), body: ratio(ok, inside) });
            }
            return out;
          }, { rim, unkeyed, all, off, half });
          for (const r of rays) results.push({ color: color.toString(16), zoom, i, kind: p.kind, ...r });
          d.note(`${tag}: ${rays.length} rays`);
        }
      }
    }
  }
  // Pooled by role and backdrop: the night sky (the bare pixel under the rim is darker than L 0.02) or a planet's
  // lit face / bright nebula (lighter). Medians over every ray of every piece.
  type Ray = { clean: boolean; color: string; backdropL: number; outL: number; keyedBare: number; unkeyedBare: number; keyedAdj: number; unkeyedAdj: number; keyedFar: number; unkeyedFar: number; body: number };
  const med = (xs: number[]) => (xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)]! : NaN);
  for (const color of [RED, BLUE, GOLD]) {
    for (const [name, pick] of [['night sky', (r: Ray) => r.backdropL < 0.02], ['planet face', (r: Ray) => r.backdropL >= 0.02], ['planet face, clean rays (keyline visible: the neighbour is not the piece\'s own hull)', (r: Ray) => r.backdropL >= 0.02 && r.clean]] as const) {
      const rs = (results as unknown as Ray[]).filter((r) => r.color === color.toString(16) && pick(r));
      const m = (k: keyof Ray) => med(rs.map((r) => r[k] as number)).toFixed(2);
      d.note(`ROLE #${color.toString(16)} on ${name} (n=${rs.length}): vs backdrop keyed ${m('keyedBare')} unkeyed ${m('unkeyedBare')} | vs adjacent pixel keyed ${m('keyedAdj')} unkeyed ${m('unkeyedAdj')} | vs pixel 3.5 px out keyed ${m('keyedFar')} unkeyed ${m('unkeyedFar')} | vs body inside ${m('body')} | outline L ${m('outL')}`);
    }
  }
  writeFileSync(join(out, 'measure.json'), JSON.stringify(results, null, 2));
  await page.evaluate((c) => window.__starChartTest!.setCamera(c), fit);
}

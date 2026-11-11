// Stills for 19 L8 (fixture data only, INV-18): captains' plates with square pictures. Harbor Pod's
// region mid-round: at rest (initials on their swatches, square at the plate's near end), a captain
// pointed at (lifted), invented pictures laid into two plates (a square one, and a wide one that fills
// the square from its centre: Harbor Pod's people have no pictures), then playing at 1× (each captain
// the picture alone, a small square with the plate's corners and frame line), with the pictures laid
// in again. Each still has a close-up of the first captains' plates. Run with --paradigm solar.
import { join, resolve } from 'node:path';
import type { Drive } from '../drive';

/** An invented picture (06 §4: illustrations, never photos) as an inline SVG data URL, `w`×`h`. */
const picture = (w: number, h: number, sky: string, coat: string, band?: string): string => {
  const cx = w / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${sky}"/>`
    + (band ? `<rect width="${(w - h) / 2}" height="${h}" fill="${band}"/><rect x="${(w + h) / 2}" width="${(w - h) / 2}" height="${h}" fill="${band}"/>` : '')
    + `<circle cx="${cx}" cy="${h * 0.44}" r="${h * 0.2}" fill="#efc39b"/>`
    + `<rect x="${cx - h * 0.36}" y="${h * 0.7}" width="${h * 0.72}" height="${h * 0.3}" rx="${h * 0.14}" fill="${coat}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};
const PICTURES = [picture(64, 64, '#2f6b5c', '#c8553d'), picture(112, 64, '#3d4f8f', '#d9a441', '#8a2b2b')];

export default async function v11L8(d: Drive): Promise<void> {
  const { page } = d;
  const out = resolve(process.cwd(), 'test-results/drive', process.env.DRIVE_NAME ?? 'v11-L8');
  const off = async () => {
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await page.waitForTimeout(700);
  };
  /** Lays the invented pictures into the first two captains' squares, as a picture from ADO would draw. */
  const lay = () => page.evaluate((pics) => {
    const squares = [...document.querySelectorAll<HTMLElement>('.callout--captain .callout__avatar')].filter((e) => e.offsetParent);
    squares.slice(0, pics.length).forEach((sq, i) => {
      sq.querySelector('img')?.remove();
      const img = document.createElement('img');
      img.alt = '';
      img.src = pics[i]!;
      sq.append(img);
    });
    return squares.length;
  }, PICTURES);
  /** The shown captains' labels on screen, nearest the top first. */
  const shown = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.callout--captain')]
    .filter((e) => e.style.display !== 'none' && e.offsetParent).map((e) => e.getBoundingClientRect())
    .filter((b) => b.width > 0).map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height })).sort((a, b) => a.y - b.y));
  /** A close-up round each of the first two shown captains' labels. */
  const close = async (name: string) => {
    const all = await shown();
    for (const [i, r] of all.slice(0, 2).entries()) {
      const x = Math.max(0, r.x - 60);
      const y = Math.max(0, r.y - 40);
      await page.screenshot({ path: join(out, `close-${name}-${i + 1}.png`), clip: { x, y, width: r.w + 120, height: r.h + 100 } });
    }
  };
  const plates = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.callout--captain')].filter((e) => e.style.display !== 'none').map((e) => {
    const sq = e.querySelector<HTMLElement>('.callout__avatar')!.getBoundingClientRect();
    return `${e.dataset.tier} plate ${e.offsetWidth}×${e.offsetHeight} square ${sq.width}×${sq.height} clip ${e.style.clipPath ? 'yes' : 'no'}`;
  }));
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.35));
  await d.settle();
  await off();
  await d.shot('rest');
  await close('rest');
  d.note(`captains at rest: ${JSON.stringify(await plates())}`);
  // A captain's plate pointed at: lifted, the square unchanged.
  const first = (await shown())[0];
  if (first) await page.mouse.move(first.x + first.w / 2, first.y + first.h / 2);
  await page.waitForTimeout(500);
  await d.shot('captain-pointed');
  await close('pointed');
  await off();
  d.note(`squares with pictures laid in: ${await lay()}`);
  await page.waitForTimeout(200);
  await d.shot('pictures');
  await close('pictures');
  // Playing: each captain is the picture alone.
  await page.evaluate(() => { const t = window.__starChartTest!; t.setScheduleMs(t.session().totalMs * 0.2); t.setRate(1); t.play(); });
  await page.waitForTimeout(1500);
  await d.shot('playing');
  await close('playing');
  d.note(`captains playing: ${JSON.stringify(await plates())}`);
  await page.evaluate(() => window.__starChartTest!.pause());
  await page.waitForTimeout(150);
  await lay();
  await page.waitForTimeout(100);
  await d.shot('playing-pictures');
  await close('playing-pictures');
}

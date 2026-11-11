// Touch (23 F5): a smoke check of the touch paths the chart has, on pod-sprint in Solar. Real touches,
// through the Chrome DevTools Protocol's Input.dispatchTouchEvent (Playwright's `touchscreen` needs a
// context made with `hasTouch`, which an Electron window can't be given): Chromium turns them into
// touch events and pointer events with `pointerType: 'touch'`, as a touchscreen would. Paths: a tap on
// a plate selects its object, a double tap enters it (DOUBLE_TAP_MS), a tap on the canvas selects what
// is under the finger, and on an expanded plate a long press on a row (LONG_PRESS_MS, holoRows.ts)
// lights its object without selecting it, while a short tap selects it. Fixture data only (INV-18).
import { expect, test, type CDPSession, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

let app: ElectronApplication;
let page: Page;
let cdp: CDPSession;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint' }));
  cdp = await page.context().newCDPSession(page);
});
test.afterAll(async () => { await app?.close(); });

const down = (x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
const up = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const tap = async (x: number, y: number) => { await down(x, y); await up(); };
/** Two taps, sent together: awaited one call at a time, a loaded run could put DOUBLE_TAP_MS between them. */
const doubleTap = (x: number, y: number) => Promise.all([down(x, y), up(), down(x, y), up()]);
/** The middle of an element, in the page's CSS px (what the protocol's touch points are in). */
const middle = async (el: ReturnType<Page['locator']>) => {
  const b = (await el.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const selected = () => page.evaluate(() => window.__starChartTest!.selected());
/** holoRows.ts' LONG_PRESS_MS (not imported: that module pulls in renderer art). Keep the two in step. */
const LONG_PRESS_MS = 450;

test('a tap selects, a double tap enters, and the canvas takes a tap (touch)', { tag: '@keystone' }, async () => {
  // Touch reaches the page as pointer events of the touch kind (what the rows' long press keys on).
  const kinds = page.evaluate(() => new Promise<string>((done) => window.addEventListener('pointerdown', (e) => done(e.pointerType), { once: true, capture: true })));
  const galaxy = page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first();
  const g = await middle(galaxy);
  await tap(g.x, g.y);
  expect(await kinds).toBe('touch');
  // A tap on a plate selects its object: the project's chooser shows.
  await expect(page.locator('.chooser button', { hasText: 'Sprint 13' })).toBeVisible();
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(page);
  // A double tap on a plate enters it.
  const pod = await middle(page.locator('.callout', { hasText: 'Harbor Pod' }).first());
  await doubleTap(pod.x, pod.y);
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(page);
  // A tap on the canvas over a drawn homeworld selects it (the Pixi stage's own hit test).
  await page.evaluate(() => window.__starChartTest!.select(null));
  const target = await page.evaluate(() => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const w = document.querySelector('.chart-host canvas')!.getBoundingClientRect().width;
    const seats = new Map(g.nodes.filter((n) => n.kind === 'seat' && n.selectable).map((n) => [n.projectionKey, n.canonicalKey]));
    // Clear of the side panel and the player, so the finger lands on the canvas.
    const d = t.displayed().find((x) => seats.has(x.pk) && x.x > 40 && x.x < w - 420 && x.y > 120);
    return d ? { x: d.x, y: d.y, key: seats.get(d.pk)! } : null;
  });
  expect(target, 'a homeworld drawn clear of the panels').not.toBeNull();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await tap(box.x + target!.x, box.y + target!.y);
  await expect.poll(selected).toBe(target!.key);
});

test('on an expanded plate, a long press on a row lights its object and selects nothing; a tap selects it (touch)', { tag: '@keystone' }, async () => {
  // A homeworld with a row whose object is drawn, mid-round (as solar.spec's expand case).
  const pick = () => page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const drawn = new Set(g.nodes.map((n) => n.canonicalKey));
    for (const n of g.nodes) {
      const row = g.lists?.[n.projectionKey]?.rows.find((r) => drawn.has(r.key));
      if (n.kind === 'seat' && n.selectable && row) return { label: n.label, row: row.key };
    }
    return null;
  });
  let seat: Awaited<ReturnType<typeof pick>> = null;
  for (const at of [0.5, 0.35, 0.65, 0.2, 0.8, 1]) {
    await page.evaluate((f) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * f), at);
    await settle(page);
    if ((seat = await pick())) break;
  }
  expect(seat).not.toBeNull();
  await page.evaluate(() => window.__starChartTest!.select(null));
  // A touchscreen has no hover: the plate is expanded by the mouse resting on its title, which lights no row.
  const own = page.locator('.callout--seat', { hasText: seat!.label }).first();
  await own.locator('.callout__title').first().hover();
  await expect(own).toHaveClass(/is-expanded/);
  const row = own.locator(`.holo__row[data-key="${seat!.row}"]`);
  await expect(row).not.toHaveClass(/is-lit/);
  const r = await middle(row);
  // Held: lit once the press has lasted LONG_PRESS_MS, not before; let go, unlit, and nothing selected.
  // How long the press took to light it is timed in the page (from the touch's pointerdown to the row's
  // is-lit), not by reading the row soon after the touch: under load that read could itself take
  // longer than the press, so it would prove nothing either way.
  const litAfter = page.evaluate((key) => new Promise<number>((done) => {
    let t0 = -1;
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') t0 = performance.now(); }, { once: true, capture: true });
    const li = document.querySelector(`.callout--seat.is-expanded .holo__row[data-key="${key}"]`)!;
    const watch = new MutationObserver(() => { if (li.classList.contains('is-lit') && t0 >= 0) { watch.disconnect(); done(performance.now() - t0); } });
    watch.observe(li, { attributes: true, attributeFilter: ['class'] });
  }), seat!.row);
  await down(r.x, r.y);
  expect(await litAfter, 'ms from touch to lit').toBeGreaterThanOrEqual(LONG_PRESS_MS);
  await expect(row).toHaveClass(/is-lit/);
  await expect(page.locator('.hover-ring')).toBeVisible();
  await up();
  await expect(row).not.toHaveClass(/is-lit/);
  expect(await selected()).toBeNull();
  // A quick tap on the same row selects its object.
  await tap(r.x, r.y);
  await expect.poll(selected).toBe(seat!.row);
});

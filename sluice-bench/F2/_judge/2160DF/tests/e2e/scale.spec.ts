// Scenes that scale (decided 2026-10-07): 188 synthetic projects (fixtures/scenarios/crowded-org.ts).
// The galaxy is a tall grid that opens on its first rows and scrolls; scroll pans and pinch zooms;
// labels are their objects' buttons; In view rows bring their object into view.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp({ STAR_CHART_FIXTURE: 'crowded-org' }));
});
test.afterAll(async () => { await app?.close(); });

const camera = () => page.evaluate(() => window.__starChartTest!.camera());
const canvasBox = async () => (await page.locator('.chart-host canvas').boundingBox())!;
/** Galaxies whose centre is on screen (left of the side panel), with their hit circles in CSS px. */
const onScreen = () => page.evaluate(() => {
  const canvas = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
  const panel = document.querySelector('.sidepanel')!.getBoundingClientRect();
  return window.__starChartTest!.hitCircles().filter((c) => c.kind === 'galaxy' && c.x > 0 && c.x < panel.left - canvas.left && c.y > 0 && c.y < canvas.height);
});

test('galaxy grid (E): 188 projects open on the first rows at a touchable size, A–Z, quiet ones dimmer', { tag: '@keystone' }, async () => {
  const graph = await page.evaluate(() => window.__starChartTest!.viewGraph()!);
  expect(graph.nodes.filter((n) => n.kind === 'galaxy')).toHaveLength(188);
  const visible = await onScreen();
  expect(visible.length).toBeGreaterThan(8);
  expect(visible.length).toBeLessThan(188);
  // Every visible target is at least a touch target across, and no two overlap.
  for (const c of visible) expect(c.r * 2).toBeGreaterThanOrEqual(44);
  for (const a of visible) for (const b of visible) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 1);
  // A–Z: the first project alphabetically is in the first row, on screen.
  const names = graph.nodes.filter((n) => n.kind === 'galaxy').map((n) => n.label);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  expect(visible.map((c) => c.label)).toContain(names[0]);
  expect(graph.nodes.filter((n) => n.flags.quiet).length).toBeGreaterThan(150);
  await expect(page.locator('.callout--galaxy.is-quiet').first()).toBeAttached();
  await expect(page.locator('.scrollbar--y .scrollbar__thumb')).toBeVisible(); // 188 can't fit even zoomed all the way out
  await expect(page.locator('.scrollbar--x')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/scale-1-galaxy-top.png' });
});

test('the wheel zooms; the scrollbar moves (E): dragging its thumb goes down the grid, clamped at the end', async () => {
  const box = await canvasBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  const before = await camera();
  // The wheel zooms, here as everywhere (decided 2026-10-07).
  await page.mouse.wheel(0, -60);
  await expect.poll(async () => (await camera()).scale).toBeGreaterThan(before.scale);
  await page.keyboard.press('0');
  await expect.poll(async () => Math.abs((await camera()).scale - before.scale)).toBeLessThan(1e-3);
  // The vertical scrollbar's thumb drags the view down.
  const thumb = (await page.locator('.scrollbar--y .scrollbar__thumb').boundingBox())!;
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + 8);
  await page.mouse.down();
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + 140, { steps: 6 });
  await page.mouse.up();
  const after = await camera();
  expect(after.y).toBeGreaterThan(before.y);
  expect(after.scale).toBeCloseTo(before.scale, 2);
  await page.screenshot({ path: 'test-results/scale-2-scrolled.png' });
  // Paging past the end stops at it: the view stays on the content.
  for (let i = 0; i < 12; i++) await page.locator('.scrollbar--y').click({ position: { x: 5, y: ((await page.locator('.scrollbar--y').boundingBox())!.height) - 4 } });
  const bottom = await camera();
  await page.locator('.scrollbar--y').click({ position: { x: 5, y: ((await page.locator('.scrollbar--y').boundingBox())!.height) - 4 } });
  expect((await camera()).y).toBeCloseTo(bottom.y, 3);
  await page.keyboard.press('0');
  await expect.poll(async () => Math.abs((await camera()).scale - before.scale)).toBeLessThan(1e-3);
  await expect.poll(async () => Math.abs((await camera()).y - before.y)).toBeLessThan(1);
});

test('labels are buttons (E): a click selects, a drag from a label pans without selecting', async () => {
  const visible = await onScreen();
  const target = visible[1]!;
  const label = page.locator('.callout--galaxy', { hasText: target.label }).first();
  await label.click();
  await expect(page.locator('.inspector__title')).toHaveText(target.label);
  // A drag that starts on another label pans, and selects nothing new.
  const other = page.locator('.callout--galaxy', { hasText: visible[2]!.label }).first();
  const lb = (await other.boundingBox())!;
  const before = await camera();
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width / 2 + 40, lb.y + lb.height / 2 - 120, { steps: 6 });
  await page.mouse.up();
  expect((await camera()).y).not.toBeCloseTo(before.y, 1);
  await expect(page.locator('.inspector__title')).toHaveText(target.label);
  await page.keyboard.press('0');
  await settle(page);
});

test('In view (E): the filter narrows 188 rows; a row far down brings its galaxy on screen; a double-click on its label enters', async () => {
  const filter = page.locator('.object-list__filter');
  await expect(filter).toBeVisible();
  await filter.fill('Juniper');
  const rows = page.locator('nav[aria-label="Objects in view"] li button');
  await expect(rows).toHaveCount(await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'galaxy' && n.label.includes('Juniper')).length));
  const ridge = rows.filter({ hasText: 'Juniper Ridge' });
  const offBefore = (await onScreen()).some((c) => c.label === 'Juniper Ridge');
  expect(offBefore).toBe(false); // far down the grid
  await ridge.click();
  await expect(page.locator('.inspector__title')).toHaveText('Juniper Ridge');
  await expect.poll(async () => (await onScreen()).find((c) => c.label === 'Juniper Ridge')?.r ?? 0).toBeGreaterThanOrEqual(22);
  await page.screenshot({ path: 'test-results/scale-3-revealed.png' });
  // Its label is a button: a double-click enters, as on the galaxy itself.
  await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy');
  await settle(page);
  expect(await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey)).toMatch(/^(sector|feature):/);
  await page.keyboard.press('Escape');
  await settle(page);
});

test('search (E): the title-bar search finds a project and brings it into view', async () => {
  await page.locator('nav[aria-label="Objects in view"] .object-list__filter').fill('');
  const search = page.getByLabel('Search work items');
  await search.fill('Maple');
  const first = page.locator('.search__results button').first();
  await expect(first).toContainText('Maple');
  const name = (await first.textContent())!.replace('Project', '').trim();
  await first.click();
  await expect(page.locator('.inspector__title')).toHaveText(name);
  await expect.poll(async () => (await onScreen()).some((c) => c.label === name)).toBe(true);
});

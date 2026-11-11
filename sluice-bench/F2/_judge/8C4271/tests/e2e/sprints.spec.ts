// The Sprints view (decided 2026-10-07): project → sprint → pods (saved Area Paths) → stories → tasks;
// Backlog stays a switch away. Pinned: v1 opens in Solar (14 §7), so Sprints is reached by pin. Fixture
// mode on sprint-pods, then ADO against the fake org.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { enterNodeByKey, keyOf, launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const graph = (page: Page) => page.evaluate(() => window.__starChartTest!.viewGraph()!);
const sceneIs = (page: Page, level: string) => page.waitForFunction((l) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(`${l}:`), level, { timeout: 30_000 });

test.describe('Sprints in fixture mode', () => {
  test.describe.configure({ mode: 'serial' });
  let app: ElectronApplication;
  let page: Page;
  const dbDir = mkdtempSync(join(tmpdir(), 'sc-sprints-'));
  // The mechanics fixture: Halcyon Reach's carry-over and two pods. The demo's five pods are in demo.spec.
  test.beforeAll(async () => { ({ app, page } = await launchApp({ STAR_CHART_PODS: 'mechanics', STAR_CHART_PARADIGM: 'sprints', STAR_CHART_DB_DIR: dbDir })); });
  test.afterAll(async () => { await app?.close(); });

  test('Sprints (E): a project offers its sprints, current first, and its pods', { tag: '@keystone' }, async () => {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().click();
    await expect(page.locator('.chooser button', { hasText: 'Sprint 41' })).toContainText('current');
    await expect(page.locator('.chooser button', { hasText: 'Sprint 40' })).toBeVisible();
    await expect(page.locator('.chooser button', { hasText: 'Sprint 42' })).toHaveCount(0); // not started yet
    await expect(page.locator('.inspector__h3', { hasText: 'Pods' })).toBeVisible();
    await expect(page.locator('.inspector__h3', { hasText: 'Epics' })).toHaveCount(0);
  });

  test('sprint → pod → story (E): pods are stars, their stories planets; the sprint is the clock', { tag: '@keystone' }, async () => {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await sceneIs(page, 'sprint');
    await settle(page);
    const sprint = await graph(page);
    expect(sprint.nodes.filter((n) => n.kind === 'star').map((n) => n.label)).toEqual(['Comet Pod', 'Nova Pod']);
    await expect(page.locator('.team-pill__type')).toHaveText('Sprint');
    // The player runs over the sprint: it starts at its first day.
    const range = await page.evaluate(() => window.__starChartTest!.historyRange()!);
    expect(new Date(range.startUtc).toISOString()).toBe('2026-09-14T07:00:00.000Z');
    await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    const pod = await graph(page);
    expect(pod.nodes.filter((n) => (n.kind === 'planet' || n.kind === 'anomaly') && n.selectable).map((n) => n.label).sort())
      .toEqual(['Double-booked slots after a timezone change', 'Drag to reschedule', 'Week view for the calendar']);
    expect(pod.nodes.find((n) => n.label === 'Week view for the calendar')!.meta).toContain('Booking calendar');
    await page.screenshot({ path: 'test-results/sprints-1-pod.png' });
    // Its label may hide where a ship or a lane head would be covered (decided 2026-10-09): enter the planet itself.
    await enterNodeByKey(page, await keyOf(page, 'planet', 'Week view for the calendar'));
    await sceneIs(page, 'body');
    await settle(page);
    expect((await graph(page)).nodes.filter((n) => n.kind === 'missionPoint').length).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await settle(page);
  });

  test('each scene opens at its end state, and plays only its own work (decided 2026-10-08)', { tag: '@keystone' }, async () => {
    await page.locator('.breadcrumb button', { hasText: 'All projects' }).click(); // this suite runs serially
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await sceneIs(page, 'sprint');
    await settle(page);
    // The sprint opens where it ended up: the player sits at the end, and Play means from the start.
    const sprint = await page.evaluate(() => window.__starChartTest!.session());
    expect(sprint.status).toBe('ended');
    expect(sprint.x).toBe(sprint.totalMs);
    await expect(page.locator('.transport__play')).toHaveText('↻');
    await expect(page.locator('.transport__play')).toHaveAccessibleName('Play from the start');
    // Into a pod: its own end state, and fewer beats — the other pod's work is not this scene's.
    await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    const pod = await page.evaluate(() => window.__starChartTest!.session());
    expect(pod.status).toBe('ended');
    expect(pod.x).toBe(pod.totalMs);
    expect(pod.beats).toBeGreaterThan(0);
    expect(pod.beats).toBeLessThanOrEqual(sprint.beats);
    // Every beat here touches this pod: the ruler has no out-of-view hairlines left to draw.
    await expect(page.locator('.transport__tick')).not.toHaveCount(0);
    await expect(page.locator('.transport__tick:not(.is-inview)')).toHaveCount(0);
    // Play starts its story from the beginning.
    await page.evaluate(() => window.__starChartTest!.play());
    await page.waitForTimeout(120);
    const playing = await page.evaluate(() => window.__starChartTest!.session());
    expect(playing.x).toBeLessThan(pod.totalMs);
    await page.evaluate(() => window.__starChartTest!.pause());
    await page.keyboard.press('Escape');
    await settle(page);
  });

  test('the sprint’s ▾ lists sprints newest first, and switches sideways (E)', async () => {
    await page.locator('.team-pill__switch').click();
    const items = page.locator('.sibling-menu button');
    await expect(items.first()).toContainText('Sprint 41');
    await expect(items.nth(1)).toContainText('Sprint 40');
    await items.nth(1).click();
    await page.waitForFunction(() => window.__starChartTest!.stack().some((e) => e.label === 'Sprint 40'), undefined, { timeout: 20_000 });
    await settle(page);
    const range = await page.evaluate(() => window.__starChartTest!.historyRange()!);
    expect(new Date(range.startUtc).toISOString()).toBe('2026-08-31T07:00:00.000Z');
  });

  test('the switch (E): Backlog is a click away, back at the galaxy; a pin wins over the stored value', async () => {
    await page.locator('.toggle--paradigm button', { hasText: 'Backlog' }).click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey === 'galaxy');
    await page.locator('.callout--galaxy', { hasText: 'Nimbus Deck' }).first().click();
    await expect(page.locator('.inspector__h3', { hasText: 'Epics' })).toBeVisible();
    // Backlog is now the stored choice; v1 no longer reads it at boot (14 §7), and the pin wins.
    await app.close();
    ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: 'sprints', STAR_CHART_DB_DIR: dbDir }));
    await expect(page.locator('.toggle--paradigm button[aria-pressed="true"]')).toHaveText('Sprints');
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().click();
    await expect(page.locator('.inspector__h3', { hasText: 'Pods' })).toBeVisible();
  });
});

test('Sprints in ADO mode (E): pick the pods, and the current sprint opens, its history streaming in behind it', { tag: '@keystone' }, async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-sprints-ado-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    // Nothing saved yet: the Area Path plate; the two pods, then Chart opens the current sprint.
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    for (const pod of ['Comet Pod', 'Nova Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await sceneIs(page, 'sprint');
    await settle(page);
    expect((await graph(page)).nodes.filter((n) => n.kind === 'star').map((n) => n.label)).toEqual(['Comet Pod', 'Nova Pod']);
    // Its history streams in behind it (decided 2026-10-08): the player becomes ready, with beats.
    await expect(page.locator('.transport__play')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await page.evaluate(() => window.__starChartTest!.session())).beats, { timeout: 30_000 }).toBeGreaterThan(0);
    // The breadcrumb's + (decided 2026-10-08): add Quasar Pod; the open sprint gains it in place.
    const stars = async () => (await graph(page)).nodes.filter((n) => n.kind === 'star').map((n) => n.label);
    const arrived = (await page.evaluate(() => window.__starChartTest!.motions())).arrive;
    await page.locator('.crumb--add').click();
    await page.locator('.add-picker input').fill('Quasar');
    await page.locator('.add-picker__row', { hasText: 'Quasar Pod' }).click();
    await expect.poll(stars, { timeout: 20_000 }).toEqual(['Comet Pod', 'Nova Pod', 'Quasar Pod']);
    expect((await graph(page)).sceneKey.startsWith('sprint:')).toBe(true); // the same scene, changed in place
    expect((await page.evaluate(() => window.__starChartTest!.motions())).arrive).toBeGreaterThan(arrived);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/sprints-5-add-pod.png' });
    // Its ▾ lists the pods with checks: removing one changes the sprint in place too.
    const departed = (await page.evaluate(() => window.__starChartTest!.motions())).depart;
    await page.locator('.team-pill__switch').click();
    await page.locator('.sibling-menu__item[role="menuitemcheckbox"]', { hasText: 'Quasar Pod' }).click();
    await expect.poll(stars, { timeout: 20_000 }).toEqual(['Comet Pod', 'Nova Pod']);
    expect((await page.evaluate(() => window.__starChartTest!.motions())).depart).toBeGreaterThan(departed);
    await page.keyboard.press('0'); // the opening view: adding brought the new star into view
    await settle(page);
    await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    expect((await graph(page)).nodes.filter((n) => (n.kind === 'planet' || n.kind === 'anomaly') && n.selectable).length).toBe(3);
    await expect(page.locator('.crumb--add')).toHaveCount(0); // a pod's stories are ADO's, not a set you choose
    await page.screenshot({ path: 'test-results/sprints-2-ado-pod.png' });
  } finally {
    await app.close();
  }
});

/**
 * B4 (06 §3): the v0 board lays work out in the team's own board columns, read from ADO (the fake serves
 * Halcyon Reach's Stories board: a custom Code Review column and a split Resolved). The columns are named over
 * the first lane, in the board's order, with a tick between each; and the board still works with the columns
 * refused (the ladder's four, unnamed).
 */
test('the v0 board uses the team’s board columns (B4): a custom column, a split one, in order', { tag: '@keystone' }, async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-pods', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-sprints-board-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Quasar Pod' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await sceneIs(page, 'sprint');
    // Its history streams in behind the first look; the board is read when it has.
    await expect(page.locator('.transport__play')).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => (await page.evaluate(() => window.__starChartTest!.session())).beats, { timeout: 60_000 }).toBeGreaterThan(0);
    await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    const names = ['New', 'Ready', 'Active', 'Code Review', 'Resolved', 'Closed'];
    await expect.poll(async () => (await graph(page)).board?.columns?.map((c) => c.name), { timeout: 30_000 }).toEqual(names);
    // Named on the chart, in the board's order, left to right; the split Resolved is one heading with Doing / Done under it,
    // and a tick falls between each of the seven slots.
    await expect(page.locator('.column-head__name')).toHaveText(names);
    await expect(page.locator('.column-head__sub')).toHaveText(['Doing / Done']);
    const board = (await graph(page)).board!;
    expect(board.ticks).toHaveLength(names.length);
    expect(board.columns!.every((c, i) => i === 0 || c.x > board.columns![i - 1]!.x)).toBe(true);
    // The bodies sit between the first and last tick or beyond them: done work is tucked right of the last tick.
    const bodies = (await graph(page)).nodes.filter((n) => (n.kind === 'planet' || n.kind === 'anomaly') && n.selectable);
    expect(bodies.length).toBeGreaterThan(3);
    await page.screenshot({ path: 'test-results/sprints-6-board-columns.png' });
  } finally {
    await app.close();
  }
});

/**
 * Time to first look (decided 2026-10-08): with every call slowed, the sprint opens on its first look
 * while its history is still streaming, the plate over the galaxy says so, the player gathers, a pod
 * opens once its Tasks are in, and what streams in arrives.
 */
test('Sprints streaming (E): the first look comes first; the rest arrives', { tag: '@keystone' }, async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints', STAR_CHART_FAKE_DELAY_MS: '150',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-sprints-stream-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    for (const pod of ['Comet Pod', 'Nova Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    // One network indicator, on the right, with a bead per call in flight (decided 2026-10-09).
    await expect(page.locator('.activity')).toHaveCount(0); // the old left-hand chip row is gone
    const beads = page.locator('.activity-button .bead');
    await expect.poll(async () => beads.count(), { timeout: 20_000 }).toBeGreaterThan(0);
    // The plate over the galaxy, step by step.
    await expect(page.locator('.loading-plate')).toContainText('Opening Sprint 41');
    await expect(page.locator('.loading-plate__head')).toHaveText('Halcyon Reach');
    await page.screenshot({ path: 'test-results/sprints-3-plate.png' });
    const t0 = Date.now();
    await sceneIs(page, 'sprint');
    const firstLook = Date.now() - t0;
    // The first look: both pods, their stars on the ladder, before any history is in.
    expect((await graph(page)).nodes.filter((n) => n.kind === 'star').map((n) => n.label)).toEqual(['Comet Pod', 'Nova Pod']);
    await expect(page.locator('.transport--gathering')).toBeVisible();
    expect(await page.evaluate(() => window.__starChartTest!.stream())).not.toBeNull();
    await settle(page);
    // Into a pod: its Tasks jump the queue, then it opens with its planets.
    await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    expect((await graph(page)).nodes.filter((n) => (n.kind === 'planet' || n.kind === 'anomaly') && n.selectable).length).toBe(3);
    await page.screenshot({ path: 'test-results/sprints-4-stream.png' });
    // The rest streams in: the player becomes ready, and the stream ends.
    await expect(page.locator('.transport__play')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.stream()), { timeout: 60_000 }).toBeNull();
    console.log(`first look ${firstLook} ms`);
  } finally {
    await app.close();
  }
});

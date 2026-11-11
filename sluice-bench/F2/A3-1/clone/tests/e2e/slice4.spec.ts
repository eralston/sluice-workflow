// Slice 4 (E): ADO mode against the fake ADO org (fixtures/ado.ts, STAR_CHART_FAKE_ADO=1), with the DB
// in a temp folder. AC-25 (the canary PAT), AC-32 (favorites), AC-33 (cache and Purge), and a scope
// synced and charted end to end. No network, no real data (INV-18).
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { keyOf, launchApp, settle } from './launch';

/** INV-17's canary: the only token the suite ever uses. Never a real PAT. */
const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const ORG = 'https://dev.azure.com/fixture-org';

test.describe.configure({ mode: 'serial' });

const dbDir = mkdtempSync(join(tmpdir(), 'star-chart-e2e-'));
let app: ElectronApplication;
let page: Page;
let output = '';

async function launch(): Promise<void> {
  ({ app, page } = await launchApp({ STAR_CHART_FAKE_ADO: '1', STAR_CHART_DB_DIR: dbDir }));
  app.process().stdout?.on('data', (d) => { output += String(d); });
  app.process().stderr?.on('data', (d) => { output += String(d); });
  page.on('console', (m) => { output += `${m.text()}\n`; });
}

async function connect(): Promise<void> {
  if (!(await page.locator('.connect').isVisible())) await page.locator('.mode-chip').click();
  // The panel prefills a known org URL as it opens: let it, so the fill doesn't race the prefill.
  await page.waitForTimeout(400);
  await page.locator('.connect input[name="org"]').fill(ORG);
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected');
}

async function galaxyReady(): Promise<void> {
  await page.waitForFunction(() => (window.__starChartTest!.viewGraph()?.nodes.filter((n) => n.kind === 'galaxy').length ?? 0) > 0);
  await settle(page);
}

async function selectProject(name: string): Promise<void> {
  // By its label, which is the galaxy's button (decided 2026-10-07); scale.spec covers canvas clicks.
  await settle(page);
  await page.locator('.callout--galaxy', { hasText: name }).first().click();
  await expect(page.locator('.inspector__title')).toHaveText(name);
}

test.beforeAll(launch);
test.afterAll(async () => { await app?.close(); });

test('ADO mode (E): connect to the fake org, check access, save an Area Path, sync it, and chart it', { tag: '@keystone' }, async () => {
  await expect(page.locator('.mode-chip')).toHaveText('FIXTURE');
  await connect();
  await expect(page.locator('.connect__msg--ok')).toContainText('Switch to ADO');
  await page.locator('.connect__mode button', { hasText: 'ADO' }).click();
  await expect(page.locator('.mode-chip')).toHaveText('ADO');

  // The probe matrix (04 §2): every family readable in the fake org.
  await page.locator('.connect button', { hasText: 'Check access' }).click();
  await expect(page.locator('.probe tr')).not.toHaveCount(0);
  const statuses = await page.locator('.probe__status').allTextContents();
  expect(statuses.every((s) => s === 'ok')).toBe(true);
  await page.screenshot({ path: 'test-results/slice4-1-connect.png' });
  await page.locator('.connect__close').click();

  // Nothing chosen yet: the empty cosmos offers your recent projects; show them all instead.
  await expect(page.locator('.cosmos__title')).toHaveText('Building Your Cosmos');
  await expect(page.locator('.cosmos__recent li')).not.toHaveCount(0);
  await page.locator('.cosmos button', { hasText: 'show all projects' }).click();
  await galaxyReady();

  // Not synced yet: the caption says so, not "0 events" (decided 2026-10-07).
  await expect(page.locator('.callout--galaxy', { hasText: 'Nimbus Deck' })).toBeAttached();
  const meta = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.label === 'Nimbus Deck')!.meta);
  expect(meta).toContain('not charted yet');
  // No favorites yet: entering the project (a double-click on its label) opens its Area Paths over the
  // galaxy; checking Comet Crew saves it, and the call to action opens it.
  await page.locator('.callout--galaxy', { hasText: 'Nimbus Deck' }).dblclick();
  await expect(page.locator('.area-chooser .cosmos__title')).toHaveText('Charting Nimbus Deck');
  await expect(page.locator('.area-chooser .cosmos__cta')).toBeDisabled();
  await page.screenshot({ path: 'test-results/slice4-2-area-picker.png' });
  await page.locator('.area-chooser label', { hasText: 'Comet Crew' }).locator('input').check();
  await page.locator('.area-chooser .cosmos__cta', { hasText: 'Chart Comet Crew' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sector:area:') === true, undefined, { timeout: 30_000 });
  await settle(page);
  await expect(page.locator('.sync-banner')).toHaveCount(0);
  const stars = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'star').map((n) => n.label).sort());
  expect(stars).toContain('Unified quote ledger');
  await page.screenshot({ path: 'test-results/slice4-3-synced-sector.png' });
  // Loaded by level (decided 2026-10-07): the team opens on its current state; its history loads on
  // request from the player, and the bundle's beats come from ingest.
  await expect(page.locator('.transport--request')).toBeVisible();
  await page.locator('.transport__ranges button', { hasText: '30 days' }).click();
  await page.locator('.transport__load').click();
  await expect(page.locator('.transport__play')).toBeVisible({ timeout: 30_000 });
  const session = await page.evaluate(() => window.__starChartTest!.session());
  expect(session.beats).toBeGreaterThan(0);
});

test('AC-25 (E): the canary PAT never appears in logs, the DB, IPC other than setPat, or renderer state after submit', { tag: '@keystone' }, async () => {
  // Renderer state: the field cleared, and nowhere in the store, the DOM, or web storage.
  await page.locator('.mode-chip').click();
  await expect(page.locator('.connect input[name="pat"]')).toHaveValue('');
  const renderer = await page.evaluate(() => [
    window.__starChartTest!.storeJson(),
    document.documentElement.outerHTML,
    [...document.querySelectorAll('input')].map((i) => i.value).join('\n'),
    JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }),
  ].join('\n'));
  expect(renderer).not.toContain(CANARY);
  await page.locator('.connect__close').click();

  // IPC: only auth.setPat's request carries it, never a response or any other message.
  const log = await app.evaluate(() => (globalThis as unknown as { __starChartIpcLog: { channel: string; args: string; result: string }[] }).__starChartIpcLog);
  expect(log.length).toBeGreaterThan(10);
  const carrying = log.filter((e) => e.args.includes(CANARY) || e.result.includes(CANARY));
  expect(carrying.length).toBeGreaterThan(0);
  expect(carrying.every((e) => e.channel === 'starChart:auth.setPat' && !e.result.includes(CANARY))).toBe(true);

  // Logs: main's stdout and stderr, and the renderer console.
  expect(output).not.toContain(CANARY);

  // The SQLite DB, its WAL, and anything else in its folder.
  const files = readdirSync(dbDir);
  expect(files).toContain('star-chart.sqlite');
  for (const f of files) expect(readFileSync(join(dbDir, f)).includes(Buffer.from(CANARY)), f).toBe(false);
});

test('AC-32 (E): favorites persist per project; one whose area no longer resolves shows as unavailable and can be repaired or removed', async () => {
  // Per project: Harbor Watch has none of Nimbus Deck's.
  await page.keyboard.press('Escape');
  await galaxyReady();
  await selectProject('Harbor Watch');
  await expect(page.locator('.inspector')).toContainText('No saved Area Paths yet.');

  // An area that no longer resolves (a deleted node): saved, then checked against the tree.
  await selectProject('Nimbus Deck');
  const project = await keyOf(page, 'galaxy', 'Nimbus Deck');
  const orgAndProject = project.slice('proj:'.length);
  for (const [node, label] of [[424242, 'Old Crew'], [424243, 'Gone Crew']] as const) {
    await page.evaluate(([areaKey, projectKey, label]) => window.starChart.favorites.save({ areaKey: areaKey as never, projectKey: projectKey as never, path: `Nimbus Deck\\${label}`, label, displayOrder: 5, unavailable: false }),
      [`area:${orgAndProject}:${node}`, project, label] as const);
  }
  await selectProject('Harbor Watch');
  await selectProject('Nimbus Deck');
  const old = page.locator('.chooser li', { hasText: 'Old Crew' });
  await expect(old).toContainText('Unavailable');
  await expect(old.locator('button').first()).toBeDisabled();
  await page.screenshot({ path: 'test-results/slice4-4-unavailable-favorite.png' });

  // Repair: point it at another area.
  await old.locator('button', { hasText: 'Repair' }).click();
  await page.locator('.area-picker button', { hasText: 'Lantern Squad' }).click();
  await expect(page.locator('.chooser li', { hasText: 'Old Crew' })).toHaveCount(0);
  await expect(page.locator('.chooser button', { hasText: 'Lantern Squad' })).toBeEnabled();
  // Remove.
  await page.locator('.chooser li', { hasText: 'Gone Crew' }).locator('button', { hasText: 'Remove' }).click();
  await expect(page.locator('.chooser li', { hasText: 'Gone Crew' })).toHaveCount(0);

  // They persist: relaunch on the same DB. ADO mode is remembered; the token was in memory, so connect again.
  await app.close();
  await launch();
  await expect(page.locator('.mode-chip')).toHaveText('ADO');
  // Not connected (the token was in memory): the empty cosmos asks to connect.
  await expect(page.locator('.cosmos__cta')).toHaveText('Connect to Azure DevOps');
  await page.locator('.cosmos__cta').click();
  await connect();
  await page.locator('.connect__close').click();
  await galaxyReady();
  await selectProject('Nimbus Deck');
  await expect(page.locator('.chooser button', { hasText: 'Comet Crew' })).toBeVisible();
  await expect(page.locator('.chooser button', { hasText: 'Lantern Squad' })).toBeVisible();
  await selectProject('Harbor Watch');
  await expect(page.locator('.inspector')).toContainText('No saved Area Paths yet.');
});

test('AC-33 (E): the cache size and path are shown, and Purge recreates an empty DB', async () => {
  // Sync something so the cache has facts.
  await selectProject('Nimbus Deck');
  await page.locator('.chooser button', { hasText: 'Comet Crew' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sector:area:') === true, undefined, { timeout: 30_000 });
  await settle(page);
  const scope = await page.evaluate(() => {
    const s = window.__starChartTest!.viewGraph()!.sceneKey.split(':');
    return s.slice(2).join(':');
  });

  await page.locator('.mode-chip').click();
  const path = join(dbDir, 'star-chart.sqlite');
  await expect(page.locator('.connect__path')).toHaveText(path);
  await expect(page.locator('.connect__size')).toHaveText(/\d+(\.\d)? (B|KB|MB)/);
  const before = await page.evaluate(() => window.starChart.cache.stats());
  expect(before.path).toBe(path);

  await page.locator('.connect button', { hasText: 'Purge cache' }).click();
  await page.locator('.connect button', { hasText: 'Purge: delete every cached fact?' }).click();
  await expect(page.locator('.connect__msg--ok')).toHaveText('Cache purged.');
  // Loaded by level (decided 2026-10-07) the cache stays near an empty DB's preallocated size, so the
  // size alone proves nothing: the scope having to sync again (below) is the check.
  const after = await page.evaluate(() => window.starChart.cache.stats());
  expect(after.path).toBe(path);
  expect(existsSync(path)).toBe(true);
  // Empty: the scope must sync again, and the favorites (local config in the DB) are gone.
  const reload = await page.evaluate(async (areaKey) => {
    const projectKey = `proj:${areaKey.split(':')[1]}:${areaKey.split(':')[2]}`;
    try {
      await window.starChart.history.load({ projectKey: projectKey as never, sector: { kind: 'area', areaKey: areaKey as never, path: 'Nimbus Deck\\Comet Crew' } }, await window.starChart.history.range());
      return 'loaded';
    } catch (e) { return String(e); }
  }, scope);
  expect(reload).toMatch(/NotSynced/);
  // Still connected: the token lives in its own store.
  await expect(page.locator('.connect__status')).toContainText('Connected to https://dev.azure.com/fixture-org');
  await page.locator('.connect__close').click();
  // Everything is gone, the choice of projects included: the empty cosmos again.
  await expect(page.locator('.cosmos__title')).toHaveText('Building Your Cosmos');
});

/**
 * Remove from View, and Add, where the object is (19 N1, R2), in the Solar round against the fake org
 * on pod-sprint: its own app. The one galaxy can't be removed (the last project stays); the round with
 * nothing selected adds Reef Pod from the inspector, and a selected pod star removes it again. Both
 * change the local saved Area Paths only (INV-21).
 */
test('Remove from View and Add in the round (E, 19 N1): the inspector adds a pod star and removes it, in place', async () => {
  const solar = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'pod-sprint', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'solar',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-n1-')),
  });
  const p = solar.page;
  const stars = async () => p.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'star').map((n) => n.label));
  const motions = () => p.evaluate(() => window.__starChartTest!.motions());
  try {
    await p.locator('.cosmos__cta').click();
    await p.locator('.connect input[name="org"]').fill(ORG);
    await p.locator('.connect input[name="pat"]').fill(CANARY);
    await p.locator('.connect button[type="submit"]').click();
    await expect(p.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await p.locator('.connect__close').click();
    await p.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await p.waitForFunction(() => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'galaxy'), undefined, { timeout: 20_000 });
    await settle(p);
    // The only project: Remove from View is there, disabled, and says why.
    await p.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
    await expect(p.locator('.inspector__title')).toHaveText('Tidewater Array');
    await expect(p.locator('.inspector .enter-link', { hasText: 'Remove from View' })).toBeDisabled();
    await expect(p.locator('.inspector')).toContainText('The last project stays in view');
    const projectKey = await p.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.kind === 'galaxy')!.canonicalKey);

    await p.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
    for (const pod of ['Harbor Pod', 'Lantern Pod']) await p.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await p.locator('.area-chooser .cosmos__cta').click();
    await p.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:') === true, undefined, { timeout: 30_000 });
    await settle(p);
    expect(await stars()).toEqual(['Harbor Pod', 'Lantern Pod']);

    // Nothing selected: + Add an Area Path opens the + crumb's picker, here.
    const arrived = (await motions()).arrive;
    await p.locator('.inspector .enter-link', { hasText: '+ Add an Area Path' }).click();
    await expect(p.locator('.add-picker')).toBeVisible();
    await expect(p.locator('.add-picker__row', { hasText: 'Harbor Pod' })).toHaveAttribute('aria-disabled', 'true');
    await p.locator('.add-picker__row', { hasText: 'Reef Pod' }).click();
    await expect.poll(stars, { timeout: 20_000 }).toEqual(['Harbor Pod', 'Lantern Pod', 'Reef Pod']);
    await expect(p.locator('.add-picker')).toHaveCount(0);
    expect((await motions()).arrive).toBeGreaterThan(arrived);
    await settle(p);

    // A selected pod star: Remove from View unsaves it, and it Departs; the round stays.
    await p.locator('.object-list button', { hasText: 'Reef Pod' }).first().click();
    await expect(p.locator('.inspector__title')).toHaveText('Reef Pod');
    const departed = (await motions()).depart;
    await p.locator('.inspector .enter-link', { hasText: 'Remove from View' }).click();
    await expect.poll(stars, { timeout: 20_000 }).toEqual(['Harbor Pod', 'Lantern Pod']);
    expect((await motions()).depart).toBeGreaterThan(departed);
    expect(await p.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey.startsWith('sprint:'))).toBe(true);
    await expect(p.locator('.inspector__title')).toHaveCount(0);
    const saved = await p.evaluate(async (k) => (await window.starChart.favorites.list(k as never)).map((f) => f.label), projectKey);
    expect(saved).toEqual(['Harbor Pod', 'Lantern Pod']);

    // Inside a region, its star has no Remove from View (the round is where pods are chosen).
    await p.locator('.object-list button', { hasText: 'Harbor Pod' }).first().dblclick();
    await p.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:') === true, undefined, { timeout: 30_000 });
    await settle(p);
    await expect(p.locator('.inspector .enter-link', { hasText: '+ Add an Area Path' })).toHaveCount(0);
  } finally {
    await solar.app.close();
  }
});

// Request activity (decided 2026-10-07): busy controls, the status bar's abacus of chips, and the
// request panel. Fake ADO with a small delay per call, so loading is visible; crowded-org.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const base = { STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'crowded-org', STAR_CHART_START_MODE: '', STAR_CHART_FAKE_DELAY_MS: '120' };

/** Open a team from the galaxy: double-click a project, pick its Field Team on the Area Path plate, chart it. */
async function openTeam(page: Page, wait = true): Promise<void> {
  const project = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'galaxy')[0]!.label);
  await page.locator('.callout--galaxy', { hasText: project }).first().dblclick();
  await page.locator('.area-chooser label', { hasText: 'Field Team' }).locator('input').check({ timeout: 20_000 });
  await page.locator('.area-chooser .cosmos__cta').click();
  if (wait) {
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 30_000 });
    await settle(page);
  }
}

async function connectAndChoose(page: Page): Promise<void> {
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
  await page.locator('.connect__close').click();
  await page.locator('.cosmos__cta', { hasText: 'Add these' }).click({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.length), { timeout: 20_000 }).toBeGreaterThan(0);
  await settle(page);
}

test.describe('request activity', () => {
  let app: ElectronApplication;
  let page: Page;
  test.beforeAll(async () => { ({ app, page } = await launchApp({ ...base, STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-activity-')) })); });
  test.afterAll(async () => { await app?.close(); });

  test('the one indicator (E, revised 2026-10-09): it names the work and beads a call each, and empties when done; busy controls say what they wait on', { tag: '@keystone' }, async () => {
    await connectAndChoose(page);
    await openTeam(page, false);
    // One indicator, in the status bar's right-hand button: no separate chip row (decided 2026-10-09).
    await expect(page.locator('.activity')).toHaveCount(0);
    await expect(page.locator('.activity-button .bead').first()).toBeAttached();
    await expect(page.locator('.activity-button__label')).not.toHaveText('Requests'); // it names the work
    await page.screenshot({ path: 'test-results/activity-1-chips.png' });
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 30_000 });
    await settle(page);
    // Nothing in flight: the beads leave and it goes back to its resting label.
    // First wait on the condition itself: no call in flight (a filled bead is one). How long the load
    // takes depends on the machine, so this has a generous ceiling, not a guess. Then the finished
    // calls' hollow beads age out, which is the app's own 2 s window, not the machine's speed (23 F).
    await expect(page.locator('.activity-button .bead--on')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('.activity-button .bead')).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator('.activity-button__label')).toHaveText('Requests');
    // The team switcher waits on a request: it says so in place. The wait lasts one call (~120 ms here),
    // so it is watched for from before the click, not polled for afterwards: under load a 5 s poll
    // could first look after the teams had come back and the label had gone (23 F5).
    await page.evaluate(() => {
      const w = window as unknown as { __loadingTeamsShown?: boolean };
      w.__loadingTeamsShown = false;
      const seen = () => !!document.querySelector('.team-pill__switch .busy')?.textContent?.includes('Loading teams');
      const watch = new MutationObserver(() => { if (seen()) { w.__loadingTeamsShown = true; watch.disconnect(); } });
      watch.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await page.locator('.team-pill__switch').click();
    await page.waitForFunction(() => (window as unknown as { __loadingTeamsShown?: boolean }).__loadingTeamsShown === true, undefined, { timeout: 15_000 });
    await expect(page.locator('.sibling-menu')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    // The panel lists what ran.
    await page.locator('.activity-button').click();
    await expect(page.locator('.activity-panel')).toBeVisible();
    await expect(page.locator('.activity-panel__list li').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.activity-panel')).toHaveCount(0);
  });
});

// A picture is a visual nice-to-have, not data (decided 2026-10-09): when ADO won't give us one it's listed
// as an error but never marks the indicator. 401: this PAT can't read other people's pictures, once per
// person, every time. 404: there isn't one we can see (the fake org's own answer for people with none).
for (const status of [401, 404] as const) {
test(`pictures that answer ${status} are listed as errors but never mark the indicator`, async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    // 401 is forced; 404 is what the fake serves on its own for a person with no picture.
    ...(status === 401 ? { STAR_CHART_FAKE_FAIL: 'MemberAvatars', STAR_CHART_FAKE_FAIL_STATUS: '401' } : {}),
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), `sc-activity-quiet-${status}-`)),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    // The panel stays open through the load, watched for a picture's call showing as failed in its
    // Recent list. That list holds the last 50 calls, and the sprint's load makes ~40 more after the
    // pictures (they sat in rows 40–47 of 50 at the end): read once at the end, as this test used to,
    // a few more calls pushed them out of it, which a busy run's ordering sometimes did (23 F5).
    await page.locator('.activity-button').click();
    await page.evaluate(() => {
      const w = window as unknown as { __pictureFailedRow?: boolean };
      w.__pictureFailedRow = false;
      const seen = () => [...document.querySelectorAll('.activity-panel__list li.is-failed')].some((li) => li.textContent?.includes('Fetching pictures'));
      const watch = new MutationObserver(() => { if (seen()) { w.__pictureFailedRow = true; watch.disconnect(); } });
      watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      if (seen()) { w.__pictureFailedRow = true; watch.disconnect(); } // a row already there counts
    });
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.length), { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    for (const pod of ['Comet Pod', 'Nova Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(page);
    // Wait until the pictures have actually been asked for and refused (the panel is open already).
    await expect(page.locator('.activity-panel')).toBeVisible();
    await expect.poll(() => page.locator('.activity-panel__errors li').count(), { timeout: 20_000 }).toBeGreaterThan(0);
    // In the panel, as errors, with their details and the reason they're calm…
    await expect(page.locator('.activity-panel__errors li').first()).toContainText(`Fetching pictures failed (${status})`);
    await expect(page.locator('.activity-panel__errors li').first()).toContainText('expected');
    await expect(page.locator('.activity-panel__quiet')).toContainText('expected');
    await page.locator('.activity-panel__errors summary', { hasText: 'Details' }).first().click();
    await expect(page.locator('.activity-panel .error-details__meaning').first()).toContainText(status === 401 ? 'read teammates’ pictures' : 'no picture for this person');
    await page.screenshot({ path: `test-results/activity-3-quiet-${status}.png` });
    await page.keyboard.press('Escape');
    // …but the indicator stays calm: no coral, no count.
    await expect(page.locator('.activity-button--errors')).toHaveCount(0);
    await expect(page.locator('.activity-button__errors')).toHaveCount(0);
    // The requests that failed showed in the Recent list as failures.
    await page.waitForFunction(() => (window as unknown as { __pictureFailedRow?: boolean }).__pictureFailedRow === true, undefined, { timeout: 20_000 });
  } finally {
    await app.close();
  }
});
}

test('failures (E, revised 2026-10-09): a failed call marks the indicator and stays; the panel shows its Details', async () => {
  const { app, page } = await launchApp({ ...base, STAR_CHART_FAKE_FAIL: '/_apis/git/repositories\\?', STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-activity-fail-')) });
  await connectAndChoose(page);
  await openTeam(page, false);
  await expect(page.locator('.activity-button--errors')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.activity-button__errors')).toHaveText('1');
  await page.waitForTimeout(2500); // past the success linger: the failure stays
  await expect(page.locator('.activity-button--errors')).toBeVisible();
  await page.locator('.error__close').click().catch(() => {});
  await page.locator('.activity-button').click();
  await expect(page.locator('.activity-panel__errors li').first()).toContainText('failed (500)');
  await page.locator('.activity-panel__errors summary', { hasText: 'Details' }).first().click();
  await expect(page.locator('.activity-panel .error-details__meaning').first()).toContainText('ADO failed on its side');
  await page.screenshot({ path: 'test-results/activity-2-panel.png' });
  await app.close();
});

// B5: a scope above the (lowered) threshold reads its history from the project-wide revisions feed; the load completes, the
// indicator moves with it, and the request panel lists the history reads.
test.describe('scale-up ingestion (B5)', () => {
  let app: ElectronApplication;
  let page: Page;
  const logDir = mkdtempSync(join(tmpdir(), 'sc-feed-log-'));
  test.beforeAll(async () => { ({ app, page } = await launchApp({ ...base, STAR_CHART_FEED_THRESHOLD: '1', STAR_CHART_DEVLOG: '1', STAR_CHART_DEVLOG_DIR: logDir, STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-feed-')) })); });
  test.afterAll(async () => { await app?.close(); });

  test('a team loads its history through the feed, with progress', async () => {
    await connectAndChoose(page);
    await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Pine Team' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await expect(page.locator('.activity-button .bead').first()).toBeAttached();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 30_000 });
    await settle(page);
    await expect(page.locator('.activity-button .bead--on')).toHaveCount(0, { timeout: 60_000 });
    // History loads when the player asks for it (explore.spec): through the feed, not per item. The redacted session
    // log (counts only, 03 §10) records the feed's pages; the per-item revisions call never appears.
    await expect(page.locator('.transport--request')).toBeVisible({ timeout: 20_000 });
    await page.locator('.transport__load').click();
    await expect(page.locator('.transport__play')).toBeVisible({ timeout: 30_000 });
    const log = () => readdirSync(logDir).map((f) => readFileSync(join(logDir, f), 'utf8')).join('\n');
    await expect.poll(log, { timeout: 10_000 }).toContain('"kind":"feed-pages"');
    expect(log()).not.toMatch(/workItems\/\d+\/revisions/);
  });
});

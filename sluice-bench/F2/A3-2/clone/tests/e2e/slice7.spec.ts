// Slice 7 (decided 2026-10-10), end to end through the fake ADO:
// - a PR ADO won't let us read is listed in the coverage panel (and the scope says partial);
// - teams on their own cadences: each sprint opens with only the pods whose team runs it;
// - a Story in a child iteration ("Sprint 7\Hardening") is on its sprint's pod.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

test.describe.configure({ timeout: 120_000 });
const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const graph = (page: Page) => page.evaluate(() => window.__starChartTest!.viewGraph()!);
const sceneIs = (page: Page, level: string) => page.waitForFunction((l) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(`${l}:`), level, { timeout: 30_000 });

async function connect(page: Page) {
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
  await page.locator('.connect__close').click();
  await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
  await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await settle(page);
}

test('a PR ADO won’t let us read is listed in coverage, and the scope says partial (E)', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_FAKE_FAIL: 'pullRequests/9501(\\?|$)', STAR_CHART_FAKE_FAIL_STATUS: '403',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-s7-pr-')),
  });
  try {
    await connect(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Comet Pod' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await sceneIs(page, 'sprint');
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.stream()), { timeout: 30_000 }).toBeNull();
    await expect(page.locator('.coverage__when')).toContainText('partial', { timeout: 20_000 });
    await page.locator('.coverage__when').click();
    await expect(page.locator('.coverage__panel')).toContainText('1 pull request couldn’t be read');
    await expect(page.locator('.coverage__missing li')).toHaveCount(1);
    await expect(page.locator('.coverage__missing li')).toContainText('PR 9501');
    await expect(page.locator('.coverage__missing li')).toContainText('not allowed (403)');
    await page.screenshot({ path: 'test-results/slice7-1-missing.png' });
  } finally {
    await app.close();
  }
});

test('teams on their own cadence: each sprint opens with its team’s pods; a child iteration’s Story is in its sprint (E)', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-gaps', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-s7-teams-')),
  });
  try {
    await connect(page);
    await page.locator('.callout--galaxy', { hasText: 'Lyra Station' }).first().dblclick();
    for (const pod of ['Orbit Pod', 'Relay Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await sceneIs(page, 'sprint');
    await settle(page);
    const pods = async () => (await graph(page)).nodes.filter((n) => n.kind === 'star').map((n) => n.label).sort();
    // The sprint ▾ offers both teams' sprints; each opens with only its own team's pod.
    await page.locator('.team-pill__switch').click();
    const items = page.locator('.sibling-menu button');
    await expect(page.locator('.sibling-menu')).toContainText('Sprint 7');
    await expect(page.locator('.sibling-menu')).toContainText('Relay 3');
    await items.filter({ hasText: 'Relay 3' }).first().click();
    await page.waitForFunction(() => window.__starChartTest!.stack().some((e) => e.label === 'Relay 3'), undefined, { timeout: 20_000 });
    await settle(page);
    await expect.poll(pods, { timeout: 20_000 }).toEqual(['Relay Pod']);
    await page.locator('.team-pill__switch').click();
    await page.locator('.sibling-menu button').filter({ hasText: 'Sprint 7' }).first().click();
    await page.waitForFunction(() => window.__starChartTest!.stack().some((e) => e.label === 'Sprint 7'), undefined, { timeout: 20_000 });
    await settle(page);
    await expect.poll(pods, { timeout: 20_000 }).toEqual(['Orbit Pod']);
    // Into the pod: the Hardening Story is here, though its iteration is "Sprint 7\Hardening".
    await page.locator('.callout', { hasText: 'Orbit Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    await expect.poll(async () => (await graph(page)).nodes.some((n) => n.label === 'Retry budget for flaky links' && n.selectable), { timeout: 30_000 }).toBe(true);
    await page.screenshot({ path: 'test-results/slice7-2-teams.png' });
  } finally {
    await app.close();
  }
});

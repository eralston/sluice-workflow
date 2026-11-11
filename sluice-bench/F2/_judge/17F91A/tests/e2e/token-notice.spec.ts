// A refused token, and a request that didn't finish (decided 2026-10-22). The "ADO refused the token"
// error sat in the Requests panel, so: a notice under the mode chip, the same words and a button in the
// player's loading widgets, and Retry on the player when requests were attempted but not completed.
// Fake ADO with every history call refused (401) or failing (500). Fixture data only (INV-18).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const HISTORY = '/(revisions|updates)(\\?|$)';

async function open(status: 401 | 500, delayMs = 50): Promise<{ app: ElectronApplication; page: Page; historyCalls: () => Promise<number> }> {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'crowded-org', STAR_CHART_START_MODE: '', STAR_CHART_FAKE_DELAY_MS: String(delayMs),
    STAR_CHART_FAKE_FAIL: HISTORY, STAR_CHART_FAKE_FAIL_STATUS: String(status),
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), `sc-token-${status}-`)),
  });
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
  await page.locator('.connect__close').click();
  await page.locator('.cosmos__cta', { hasText: 'Add these' }).click({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => window.__starChartTest!.viewGraph()?.nodes.length ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
  await settle(page);
  await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
  const plate = page.locator('.area-chooser label', { hasText: 'Pine Team' });
  const opened = page.waitForFunction(() => window.__starChartTest!.exploring() || window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 20_000 });
  await Promise.race([opened, plate.waitFor({ timeout: 20_000 }).then(async () => {
    await plate.locator('input').check();
    await page.locator('.area-chooser .cosmos__cta').click();
  })]);
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sector:'), undefined, { timeout: 30_000 });
  await settle(page);
  const historyCalls = async () => (await app.evaluate(() => ((globalThis as unknown as { __starChartFakeLog?: { url: string }[] }).__starChartFakeLog ?? []).map((r) => r.url))).filter((u) => /\/(revisions|updates)(\?|$)/.test(u)).length;
  return { app, page, historyCalls };
}

test('a refused token (401) is said under the mode chip and in the player, with a button that opens the token field', async () => {
  const { app, page } = await open(401);
  try {
    // Nothing refused yet: no notice, and the player offers its request.
    await expect(page.locator('.token-notice')).toHaveCount(0);
    await page.locator('.transport__load').click();
    // The notice hangs under the chip, in words, and the chip itself turns.
    const notice = page.locator('.token-notice');
    await expect(notice).toBeVisible({ timeout: 20_000 });
    await expect(notice).toContainText('ADO refused your token');
    await expect(notice).toContainText('expired, been revoked, or lack the read scope');
    await expect(page.locator('.mode-chip')).toHaveAttribute('data-alert', 'token');
    // The player says it too, since the request that was made can't finish.
    const player = page.locator('.transport--request');
    await expect(player.locator('.transport__warn')).toContainText('ADO refused your token');
    await expect(player.getByRole('button', { name: 'Enter a new token' })).toBeVisible();
    await expect(player.locator('.transport__retry', { hasText: 'Retry' })).toHaveCount(0); // asking again can't help yet
    await page.screenshot({ path: 'test-results/token-1-notice.png' });
    // The button opens Connect with the token field ready, and says why.
    await notice.getByRole('button', { name: 'Enter a new token' }).click();
    await expect(page.locator('.connect input[name="pat"]')).toBeFocused();
    await expect(page.locator('.connect__refused')).toContainText('ADO refused your token');
    await expect(notice).toHaveCount(0); // Connect is open: the notice has done its job
    await page.screenshot({ path: 'test-results/token-2-connect.png' });
  } finally {
    await app.close();
  }
});

test('a dismissed notice stays gone until ADO refuses the token again', async () => {
  const { app, page } = await open(401);
  try {
    await page.locator('.transport__load').click();
    await expect(page.locator('.token-notice')).toBeVisible({ timeout: 20_000 });
    await page.locator('.token-notice__close').click();
    await expect(page.locator('.token-notice')).toHaveCount(0);
    await expect(page.locator('.mode-chip')).toHaveAttribute('data-alert', 'token'); // the chip still says so
    // The widget still names it, too.
    await expect(page.locator('.transport--request .transport__warn')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('a history request stopped before it finished: the player offers Retry, which asks again', async () => {
  const { app, page, historyCalls } = await open(500, 700); // slow enough to stop it part-way
  try {
    await expect(page.locator('.transport__retry')).toHaveCount(0); // nothing attempted yet
    await page.locator('.transport__load').click();
    await expect(page.locator('.transport--loading')).toContainText('Loading 7 days of history', { timeout: 20_000 });
    await page.locator('.transport--loading').getByRole('button', { name: 'Cancel' }).click();
    // Back to the request, with what happened said, and the same request on one button.
    const retry = page.locator('.transport--request .transport__retry', { hasText: 'Retry' });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.transport--request .transport__warn')).toContainText('Stopped before it finished');
    // Not the token: nothing was refused.
    await expect(page.locator('.token-notice')).toHaveCount(0);
    await expect(page.locator('.mode-chip')).not.toHaveAttribute('data-alert', 'token');
    await page.screenshot({ path: 'test-results/token-3-retry.png' });
    const before = await historyCalls();
    await retry.click();
    await expect(page.locator('.transport--loading')).toContainText('Loading 7 days of history', { timeout: 20_000 }); // it asked again
    await expect.poll(historyCalls, { timeout: 20_000 }).toBeGreaterThan(before);
  } finally {
    await app.close();
  }
});

test('a sprint whose history stops short: the gathering widget says so and offers Retry, which asks again', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    // Every item's history fails for good (a 500 is tolerated per item: its last known facts stay), so the
    // stream ends with history still missing and the player would wait for it forever.
    STAR_CHART_FAKE_FAIL: HISTORY, STAR_CHART_FAKE_FAIL_STATUS: '500',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-gather-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.viewGraph()?.nodes.length ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Comet Pod' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    const gathering = page.locator('.transport--gathering');
    await expect(gathering).toBeVisible({ timeout: 20_000 });
    // The stream ended with history missing: it says so, and offers to ask again.
    await expect(gathering).toContainText('History stopped', { timeout: 30_000 });
    const retry = gathering.locator('.transport__retry', { hasText: 'Retry' });
    await expect(retry).toBeVisible();
    await expect(page.locator('.token-notice')).toHaveCount(0); // a 500 isn't a refused token
    await page.screenshot({ path: 'test-results/token-4-gathering.png' });
    await retry.click();
    await expect(gathering.locator('.transport__retry')).toContainText('Retrying', { timeout: 5_000 }).catch(() => {}); // brief
    await expect(gathering).toContainText('History stopped', { timeout: 30_000 }); // and, still short, says so again
  } finally {
    await app.close();
  }
});

test('a 401 on a team’s settings is not a refused token, nor a red error: the app carries on, and says so in the details', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    // The token reads the work and is refused every team's settings, as on a real org that limits them.
    STAR_CHART_FAKE_FAIL: 'teamsettings|teamfieldvalues', STAR_CHART_FAKE_FAIL_STATUS: '401',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-teams401-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.viewGraph()?.nodes.length ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Comet Pod' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(page);
    // The refusals are in the request list, quietly (decided 2026-10-26): the token isn't what's wrong, so no
    // red error count, no notice, no coral chip, no token button in the player.
    await page.waitForTimeout(3_000);
    await expect(page.locator('.activity-button--errors')).toHaveCount(0);
    await expect(page.locator('.token-notice')).toHaveCount(0);
    await expect(page.locator('.mode-chip')).not.toHaveAttribute('data-alert', 'token');
    await expect(page.getByRole('button', { name: 'Enter a new token' })).toHaveCount(0);
    // And the details no longer say the token is expired.
    await page.locator('.activity-button').click();
    await page.locator('.activity-panel__errors summary', { hasText: 'Details' }).first().click();
    await expect(page.locator('.activity-panel .error-details__meaning').first()).toContainText('settings');
    await expect(page.locator('.activity-panel .error-details__meaning').first()).not.toContainText('expired');
    await page.screenshot({ path: 'test-results/token-5-teams.png' });
  } finally {
    await app.close();
  }
});

// Sign in with the Azure CLI (04 §1a, 23 E5) and "Is this you?" (13 §7, 23 E4). A fake `az` (a shell
// script on a test PATH) stands in for the CLI; the canary token is the only token (INV-17). The fake ADO
// org answers connectionData with the signed-in user, `STAR_CHART_FAKE_ME` naming a scenario person.
// Fixture data only, invented names (INV-18).
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

const ORG = 'https://dev.azure.com/fixture-org';
const AZ_CANARY = 'CANARY-AZ-TOKEN-9b2e-not-a-real-token';
const PAT_CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';

/** A directory holding a fake `az`: logged in or out, answering only `account show` and `account get-access-token`. */
function fakeAz(loggedIn: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-fake-az-'));
  const script = `#!/bin/sh
if [ "${loggedIn ? 1 : 0}" != "1" ]; then echo "Please run 'az login' to setup account." >&2; exit 1; fi
case "$1 $2" in
  "account show") exit 0 ;;
  "account get-access-token")
    [ "$4" = "499b84ac-1321-427f-aa17-267ca6975798" ] || { echo "wrong resource" >&2; exit 2; }
    echo '{"accessToken": "${AZ_CANARY}", "expires_on": 4102444800, "expiresOn": "2099-12-31 00:00:00.000000", "tokenType": "Bearer"}' ;;
  *) exit 3 ;;
esac
`;
  const file = join(dir, 'az');
  writeFileSync(file, script);
  chmodSync(file, 0o755);
  return dir;
}
/** The test's only route to an `az` (STAR_CHART_TEST_AZ_DIR); none: az is missing, whatever the machine has. */
const pathWith = (dir: string | null): Record<string, string> => (dir ? { STAR_CHART_TEST_AZ_DIR: dir } : {});

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? filesUnder(p) : [p]; });
}

async function open(env: Record<string, string>): Promise<{ app: ElectronApplication; page: Page; dbDir: string; userData: string }> {
  const dbDir = mkdtempSync(join(tmpdir(), 'sc-az-'));
  const userData = `${dbDir}-user-data`;
  mkdirSync(userData, { recursive: true });
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'pod-sprint', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'solar',
    STAR_CHART_DB_DIR: dbDir, ...env,
  });
  await page.locator('.cosmos__cta').click();
  return { app, page, dbDir, userData };
}

const azButton = (p: Page) => p.locator('.connect button', { hasText: 'Sign in with Azure CLI' });

test('the button shows only when az is on the PATH and logged in @keystone', async () => {
  for (const [name, env, shown] of [
    ['no az', pathWith(null), false],
    ['az logged out', pathWith(fakeAz(false)), false],
    ['az logged in', pathWith(fakeAz(true)), true],
  ] as const) {
    const { app, page } = await open(env);
    try {
      await expect(page.locator('.connect button[type="submit"]'), name).toBeVisible();
      if (shown) await expect(azButton(page), name).toBeVisible({ timeout: 10_000 });
      else { await page.waitForTimeout(1500); await expect(azButton(page), name).toHaveCount(0); }
    } finally { await app.close(); }
  }
});

test('signing in with the Azure CLI reaches a synced chart, never storing or sending the token to the page, then "Is this you?" asks', async () => {
  const { app, page, dbDir, userData } = await open({ ...pathWith(fakeAz(true)), STAR_CHART_FAKE_ME: 'wren' });
  try {
    await page.locator('.connect input[name="org"]').fill(ORG);
    await expect(azButton(page)).toBeVisible({ timeout: 10_000 });
    await azButton(page).click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await expect(page.locator('.connect__status')).toContainText('Azure CLI');
    await expect(page.locator('.connect button', { hasText: 'Sign out of Azure CLI' })).toBeVisible();
    expect((await page.evaluate(() => window.starChart.auth.status())).method).toBe('az');
    await page.screenshot({ path: 'review/v1.3/E/E5-connect.png' });
    await page.locator('.connect__close').click();

    // A synced state: the project loads and a sprint opens against the fake org.
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'galaxy'), undefined, { timeout: 20_000 });
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
    for (const pod of ['Harbor Pod', 'Lantern Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:') === true, undefined, { timeout: 30_000 });
    await settle(page);

    // 23 E4: the signed-in user is suggested, and nothing is chosen until they confirm.
    await page.locator('.settings-button').click();
    await page.locator('#settings-modal [role="tab"]', { hasText: 'Your captain' }).click();
    const ask = page.locator('.settings__suggest');
    await expect(ask).toContainText('Is this you?');
    await expect(ask).toContainText('Wren Calloway');
    expect(await page.evaluate(() => window.starChart.settings.get().then((s) => Object.values(s.viewer)))).toEqual([]);
    await page.screenshot({ path: 'review/v1.3/E/E4-is-this-you.png' });
    // "No" leaves the picker and chooses no one.
    await ask.getByRole('button', { name: 'No, choose myself' }).click();
    await expect(ask).toHaveCount(0);
    expect(await page.evaluate(() => window.starChart.settings.get().then((s) => Object.values(s.viewer)))).toEqual([]);
    // Reopen: asked again, and "Yes" chooses them.
    await page.locator('.settings__close').click();
    await page.locator('.settings-button').click();
    await page.locator('#settings-modal [role="tab"]', { hasText: 'Your captain' }).click();
    await page.locator('.settings__suggest').getByRole('button', { name: 'Yes, that’s me' }).click();
    await expect(page.locator('.settings__suggest')).toHaveCount(0);
    const wren = await page.locator('select[data-log="viewer-choose"] option', { hasText: 'Wren Calloway' }).getAttribute('value');
    await expect(page.locator('select[data-log="viewer-choose"]')).toHaveValue(wren!);
    expect(await page.evaluate(() => window.starChart.settings.get().then((s) => Object.values(s.viewer)))).toEqual([wren]);
    await page.screenshot({ path: 'review/v1.3/E/E4-confirmed.png' });
    await page.locator('.settings__close').click();

    // INV-17: the token crossed no IPC, and reached no file under userData or the cache folder.
    const ipc = await app.evaluate(() => JSON.stringify((globalThis as { __starChartIpcLog?: unknown }).__starChartIpcLog ?? []));
    expect(ipc).not.toContain(AZ_CANARY);
    for (const f of [...filesUnder(dbDir), ...filesUnder(userData)]) expect(readFileSync(f).includes(AZ_CANARY), f).toBe(false);
  } finally { await app.close(); }
});

test('fixtures never suggest anyone, and a PAT signs the Azure CLI out', async () => {
  const fx = await launchApp({ STAR_CHART_FIXTURE: 'pod-sprint', STAR_CHART_PARADIGM: 'solar' });
  try {
    await fx.page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
    await fx.page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
    await fx.page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(fx.page);
    await fx.page.locator('.settings-button').click();
    await fx.page.locator('#settings-modal [role="tab"]', { hasText: 'Your captain' }).click();
    await expect(fx.page.locator('select[data-log="viewer-choose"]')).toBeVisible();
    await expect(fx.page.locator('.settings__suggest')).toHaveCount(0);
  } finally { await fx.app.close(); }

  const { app, page } = await open(pathWith(fakeAz(true)));
  try {
    await page.locator('.connect input[name="org"]').fill(ORG);
    await azButton(page).click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    expect((await page.evaluate(() => window.starChart.auth.status())).method).toBe('az');
    await page.locator('.connect input[name="pat"]').fill(PAT_CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    expect((await page.evaluate(() => window.starChart.auth.status())).method).toBe('pat');
  } finally { await app.close(); }
});

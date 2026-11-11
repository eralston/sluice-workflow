// Slice 7 (decided 2026-10-10): the diagnostic log in a packaged build is off until the user turns it
// on in Connect; then it writes the redacted log (no tokens, no work data) under userData, at once.
// The test run stands in for a packaged build (STAR_CHART_AS_PACKAGED) and names the log folder.
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';

test('the diagnostic log is off until turned on, then writes redacted entries at once (E)', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'sc-diag-')), 'logs');
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_AS_PACKAGED: '1', STAR_CHART_DEVLOG_DIR: dir, STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-diag-db-')),
  });
  try {
    const files = () => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')) : []);
    expect(files()).toHaveLength(0); // off by default
    await page.locator('.cosmos__cta').click();
    const toggle = page.locator('.connect__diagnostics input[type="checkbox"]');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
    expect(files()).toHaveLength(1);
    // Some activity, so the log has network entries: connect with the canary.
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await expect(page.locator('.connect__diagnostics button', { hasText: 'Show log file' })).toBeVisible();
    await page.locator('.connect__diagnostics button', { hasText: 'Show log file' }).click();
    const text = readFileSync(join(dir, files()[0]!), 'utf8');
    expect(text).toMatch(/"kind":"net-end"/);
    expect(text).not.toContain(CANARY); // never the token (INV-17)
    expect(text).not.toContain('Halcyon Reach'); // never work data (INV-18): names are hashed
    // Off again: nothing more is written.
    await toggle.uncheck();
    const size = readFileSync(join(dir, files()[0]!), 'utf8').length;
    await page.locator('.connect button[type="submit"]').click();
    await page.waitForTimeout(800);
    expect(readFileSync(join(dir, files()[0]!), 'utf8').length).toBe(size);
  } finally {
    await app.close();
  }
});

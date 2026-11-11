// Incremental refresh, the part both loaders share (04 §5 step 7; decided 2026-10-09 that it lives at
// the shared layer). Checkpoints make re-reading an item's history nearly free, but two things they
// can't see:
//   - **A PR that moved on.** Its record is cached whole, with no checkpoint, so an open PR that has
//     since merged would stay open on the chart forever. Re-read the ones that could still change:
//     open, or closed inside the last week.
//   - **A late correction.** An update revised after we read it sits *behind* our checkpoint, so a
//     plain refresh skips it. Every so often, re-read recently-changed items from scratch; the facts
//     are upserted and event keys are deterministic, so a rescan changes nothing unless ADO did
//     (INV-13).
import type { UtcMs } from '@shared/contracts/keys';
import type { Cache } from '../db/cache';

const DAY = 86_400_000;
/** PR records worth re-reading: open, or closed this recently. */
export const PR_REFETCH_DAYS = 7;
/** How far back a rescan re-reads items whose history we already hold. */
export const RESCAN_DAYS = 14;
/** One refresh in this many rescans; the rest trust the checkpoints. */
export const RESCAN_EVERY = 7;

const countKey = (org: string, scopeKey: string) => `refresh:${org}:${scopeKey}`;

/** Count this refresh of a scope, and say whether it's the one that rescans. */
export function countRefresh(cache: Cache, org: string, scopeKey: string): { n: number; rescan: boolean } {
  const n = (cache.setting<number>(countKey(org, scopeKey)) ?? 0) + 1;
  cache.setSetting(countKey(org, scopeKey), n);
  return { n, rescan: n % RESCAN_EVERY === 0 };
}

/** How many refreshes a scope has had (tests, and the dev log). */
export const refreshCount = (cache: Cache, org: string, scopeKey: string): number => cache.setting<number>(countKey(org, scopeKey)) ?? 0;

/**
 * The cached PRs whose record could still have changed: open ones, and those closed within
 * `PR_REFETCH_DAYS`, and those whose stat line facts were never read (B1: cached before they existed).
 * Keyed `repoId:prId`, to filter a re-read by.
 */
export function prsWorthRefetching(cache: Cache, org: string, now: UtcMs): Set<string> {
  const since = now - PR_REFETCH_DAYS * DAY;
  const out = new Set<string>();
  for (const { pr } of cache.prs(org)) {
    if (pr.status === 'active' || (pr.closedAt ?? 0) >= since || pr.stats === undefined) out.add(`${pr.repoId}:${pr.prId}`);
  }
  return out;
}

/** The members changed within `RESCAN_DAYS`, whose history is worth re-reading from scratch. */
export function itemsToRescan(cache: Cache, org: string, members: number[], now: UtcMs): number[] {
  const since = now - RESCAN_DAYS * DAY;
  const withHistory = cache.itemsWithHistory(org, members);
  return [...cache.currentItems(org, members).values()]
    .filter((it) => withHistory.has(it.itemId) && it.changedAt >= since)
    .sort((a, b) => b.changedAt - a.changedAt)
    .map((it) => it.itemId);
}

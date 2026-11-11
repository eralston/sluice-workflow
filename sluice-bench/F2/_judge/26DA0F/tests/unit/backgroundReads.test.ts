// B audit (v1.3): the stat and run reads deferred past a level load are one queue per org on one stoppable controller.
// Fixture-free: a stub client that records its calls and waits on a gate. Invented data only (INV-18).
import { describe, expect, it } from 'vitest';
import type { PullRequestFact } from '@shared/contracts/facts';
import type { AdoClient } from '../../src/main/ado/client';
import type { Cache } from '../../src/main/db/cache';
import { runStatsInBackground, settleStats, type StatsJob } from '../../src/main/sync/prStats';

const pr = (prId: number): PullRequestFact => ({ projectId: 'p', repoId: 'r', prId, title: `PR ${prId}`, status: 'active', createdAt: 0, closedAt: null, author: null, closedBy: null, targetRef: 'refs/heads/main', adoUrl: '' });
const jobs = (...ids: number[]) => new Map<string, StatsJob>(ids.map((id) => [`r:${id}`, { pr: pr(id) }]));

function rig() {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const calls: string[] = [];
  const client = new Proxy({}, { get: (_t, name: string) => async (...args: unknown[]) => { calls.push(`${name}:${args[1] ?? ''}`); await gate; return []; } }) as unknown as AdoClient;
  const stored: number[] = [];
  const cache = { setPrStats: (_o: string, _r: string, prId: number) => { stored.push(prId); } } as unknown as Cache;
  const ac = new AbortController();
  const ctx = { client, cache, clock: () => 1_000_000, background: { client, signal: ac.signal } };
  return { ctx, calls, stored, open, ac };
}
const reviewers = (calls: string[]) => calls.filter((c) => c.startsWith('reviewers:'));

describe('deferred reads: one queue per org, one controller', () => {
  it('two loads share the queue: a PR queued by both is read once, and never more than two at a time', async () => {
    const r = rig();
    runStatsInBackground(r.ctx, 'org', jobs(1, 2, 3, 4));
    runStatsInBackground(r.ctx, 'org', jobs(3, 4, 5, 6));
    await new Promise((res) => setTimeout(res, 20));
    expect(reviewers(r.calls)).toHaveLength(2); // two wide, though two loads queued work
    r.open();
    await settleStats();
    expect(r.stored.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(reviewers(r.calls)).toHaveLength(6); // each PR once
  });

  it('aborting the background controller (a purge, a new token, another scope) stops the reads and drops the queue', async () => {
    const r = rig();
    runStatsInBackground(r.ctx, 'org-b', jobs(1, 2, 3, 4, 5, 6));
    await new Promise((res) => setTimeout(res, 20));
    expect(reviewers(r.calls)).toHaveLength(2);
    r.ac.abort(new Error('Stopped'));
    r.open();
    await settleStats();
    expect(reviewers(r.calls)).toHaveLength(2); // the other four never started
    // A later load, on a fresh controller, starts clean: nothing left over from the stopped queue.
    const again = rig();
    again.open();
    runStatsInBackground(again.ctx, 'org-b', jobs(9));
    await settleStats();
    expect(again.stored).toEqual([9]);
  });
});

// Halcyon's pipelines (B2, 23): the latest run on each station repo's default branch, for the plate's
// `Last run: …` line. Seeded and fixed: the states walk a fixed cycle over the repos in cast order, and each
// repo's age is a hash of its name, so no pod's generator is drawn from and nothing else moves. The cycle holds
// every result once or more (passed, failed, running, partly passed, canceled) and a repo with no pipeline.
// Invented names only (INV-18).
import type { RunState } from '@shared/contracts/facts';
import { fnv1a32 } from '@shared/hash';
import type { Ev } from './gen';
import { COMET_REPOS, METEOR_REPOS, NOVA_REPOS, PULSAR_REPOS, QUASAR_REPOS } from './cast';

const MINUTE = 60_000;
/** Runs finish (or start) before the scenario's end (the sprint's close, 28 Sep 07:00 UTC). */
const END = Date.parse('2026-09-28T07:00:00Z');
const CYCLE: (RunState | null)[] = ['passed', 'failed', 'running', 'partly', 'canceled', null, 'passed', 'passed', 'failed', 'running', 'partly', 'passed', 'canceled', 'passed'];

export interface StationRun { repo: string; state: RunState | null; at: number }

/** Every station repo with its run (null: no pipeline), in cast order: Comet, Nova, Quasar, Pulsar, Meteor. */
export function stationRuns(): StationRun[] {
  const repos = [COMET_REPOS, NOVA_REPOS, QUASAR_REPOS, PULSAR_REPOS, METEOR_REPOS].flat().map((r) => r.split(' ')[0]!);
  return repos.map((repo, i) => {
    // A finished run is 5 minutes to about 30 hours old; one still going started minutes ago.
    const state = CYCLE[i % CYCLE.length]!;
    const h = fnv1a32(`halcyon-run|${repo}`);
    const ago = state === 'running' ? (3 + (h % 50)) * MINUTE : 5 * MINUTE + (h % 1800) * MINUTE;
    return { repo, state, at: END - ago };
  });
}

/** The runs as timed builder calls. */
export const runEvents = (): Ev[] => stationRuns().flatMap((r) => (r.state ? [{ t: r.at, fn: (b: Parameters<Ev['fn']>[0]) => { b.run(r.repo, r.state!); } }] : []));

// Halcyon Reach is the demo project (decided 2026-10-27): five pods, each a bigger story than the one before, which
// together show every kind of object the chart draws. A look comes only from a hash (INV-12), so a
// reseed or a rename could quietly lose a variant; these tests fail when one goes missing.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keys } from '@shared/contracts/keys';
import { shipSeedFor } from '@shared/captains';
import { artSeed } from '@shared/scene/project/ctx';
import { guardCount } from '@shared/engine/solar/compound';
import { FIXTURE_ORG, guidFromName } from '../../fixtures/dsl';
import { COMET_CAST, METEOR_CAST, METEOR_REPOS, NOVA_CAST, PULSAR_CAST, PULSAR_REPOS, QUASAR_CAST, QUASAR_REPOS, NOVA_REPOS, COMET_REPOS } from '../../fixtures/scenarios/halcyon/cast';
import { nova, pulsar, quasar, type PodBuild } from '../../fixtures/scenarios/halcyon/pods';
import type { ItemPlan } from '../../fixtures/scenarios/halcyon/gen';
import halcyon from '../../fixtures/scenarios/sprint-pods';
import { ACTIVITY_HALF_MS, STANDBY_BELOW } from '@shared/scene/project/solar';
import { sizeBand } from '@shared/prStat';
import { stationRuns } from '../../fixtures/scenarios/halcyon/runs';
import { toHistory } from '../../fixtures/dsl';
import { runLine } from '@shared/runLine';
import { mapping } from '../golden/helpers';
import { resolvePods, scheduleOf } from '../../scripts/pacing-ledger';

// Renderer code sits outside this project's tsconfig; load it by path and type it by hand.
const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
const art = await load<{ fleetDesign: (seed: number) => { hull: number; colourway: number } }>('chart/art/fleet');
const worlds = await load<{ worldLineOf: (seed: number) => string }>('chart/art/worlds');
const swarm = await load<{ hiveDesign: (seed: number) => { style: number; colourway: number } }>('chart/art/swarm');
const rocks = await load<{ asteroidMaterial: (seed: number) => string }>('chart/art/asteroids');
const factions = await load<{ stationLook: (seed: number) => { faction: string; colourway: number } }>('theme/starChart/factions');

const PROJECT = 'Halcyon Reach';
const handles = (cast: { handle: string }[]) => cast.map((c) => c.handle);
const repoNames = (xs: string[]) => xs.map((x) => x.split(' ')[0]!);
const last = (p: ItemPlan) => p.steps.at(-1)?.state;
const shipOf = (handle: string) => art.fleetDesign(shipSeedFor(FIXTURE_ORG, guidFromName('person', handle)));
const lineOf = (handle: string) => worlds.worldLineOf(shipSeedFor(FIXTURE_ORG, guidFromName('person', handle)));
const repoKey = (name: string) => keys.repo(FIXTURE_ORG, guidFromName(`repo:${PROJECT}`, name));

const pods: Record<string, PodBuild> = { nova: nova(), quasar: quasar(), pulsar: pulsar() };
const allPlans = Object.values(pods).flatMap((p) => p.plans);

describe('every pod', () => {
  it('gives each Story and Bug between 1 and 5 Tasks', () => {
    for (const p of allPlans) expect(p.tasks.length, `${p.id}`).toBeGreaterThanOrEqual(1);
    for (const p of allPlans) expect(p.tasks.length, `${p.id}`).toBeLessThanOrEqual(5);
  });
  it('finishes each Task before its parent is done', () => {
    for (const p of allPlans) {
      const done = p.steps.find((s) => s.state === 'Closed' || s.state === 'Removed' || s.state === 'Rejected')?.at;
      for (const t of p.tasks) if (t.endAt !== null && done !== undefined) expect(t.endAt, `${t.id} under ${p.id}`).toBeLessThan(done);
    }
  });
});

describe('Nova: three developers on one shared repo', () => {
  const { plans } = pods.nova!;
  const [a, b, c] = handles(NOVA_CAST) as [string, string, string];
  const of = (h: string) => plans.filter((p) => p.owner === h);
  it('gives one developer 3 Stories, one 3 Bugs, and one 2 of each', () => {
    expect(of(a).map((p) => p.kind)).toEqual(['story', 'story', 'story']);
    expect(of(b).map((p) => p.kind)).toEqual(['bug', 'bug', 'bug']);
    expect(of(c).filter((p) => p.kind === 'story')).toHaveLength(2);
    expect(of(c).filter((p) => p.kind === 'bug')).toHaveLength(2);
  });
  it('has one repo, so one dreadnought', () => {
    expect(new Set(plans.flatMap((p) => p.prs.map((x) => x.repo))).size).toBe(1);
  });
  it('has the other two review every merge', () => {
    for (const p of plans) for (const pr of p.prs) if (pr.outcome === 'merged') expect([...pr.reviewers].sort()).toEqual([a, b, c].filter((h) => h !== pr.author).sort());
  });
  it('lets two finish everything and leaves one Bug open, with its PR still open', () => {
    const open = plans.filter((p) => last(p) !== 'Closed');
    expect(open).toHaveLength(1);
    expect(open[0]!.kind).toBe('bug');
    expect(open[0]!.prs.some((x) => x.outcome === 'open')).toBe(true);
    for (const h of [a, c]) expect(of(h).every((p) => last(p) === 'Closed')).toBe(true);
  });
});

describe('Quasar: six developers and a manager on a polyrepo', () => {
  const { plans } = pods.quasar!;
  const devs = handles(QUASAR_CAST).slice(0, 6);
  const manager = QUASAR_CAST[6]!.handle;
  const tasks = plans.flatMap((p) => p.tasks.map((t) => ({ p, t })));
  it('gives each developer 3 to 6 items, and the manager none', () => {
    for (const d of devs) expect(plans.filter((p) => p.owner === d).length).toBeGreaterThanOrEqual(3);
    for (const d of devs) expect(plans.filter((p) => p.owner === d).length).toBeLessThanOrEqual(6);
    expect(plans.some((p) => p.owner === manager)).toBe(false);
  });
  it('gives the manager 5 to 8 Tasks under other people\'s work', () => {
    const mine = tasks.filter(({ t }) => t.assignee === manager);
    expect(mine.length).toBeGreaterThanOrEqual(5);
    expect(mine.length).toBeLessThanOrEqual(8);
  });
  it('spans 1 to 3 repos per Story with 1 or 2 PRs each', () => {
    for (const p of plans.filter((x) => x.kind === 'story')) {
      const per = new Map<string, number>();
      for (const pr of p.prs) per.set(pr.repo, (per.get(pr.repo) ?? 0) + 1);
      expect(per.size).toBeGreaterThanOrEqual(1);
      expect(per.size).toBeLessThanOrEqual(3);
    }
  });
  it('has exactly two reviewers on every merge, the manager among them', () => {
    for (const p of plans) for (const pr of p.prs) { expect(pr.reviewers).toHaveLength(2); expect(pr.reviewers).toContain(manager); expect(pr.reviewers).not.toContain(pr.author); }
  });
  it('has a station that stands by on a weekday while others are still at work (23 C2)', () => {
    const DAY = 86_400_000;
    const END = Date.parse('2026-09-28T07:00:00Z'); // the scenario's end (the sprint's close)
    const prs = plans.flatMap((p) => p.prs);
    // Each repo's last PR event, and when standby starts: activity halves per ACTIVITY_HALF_MS, under STANDBY_BELOW.
    const standbyAt = (repo: string) => {
      const mine = prs.filter((pr) => pr.repo === repo);
      if (!mine.length || mine.some((pr) => pr.endAt === null)) return null;
      return Math.max(...mine.flatMap((pr) => [pr.openAt, pr.endAt!])) + ACTIVITY_HALF_MS * Math.log2(1 / STANDBY_BELOW);
    };
    const weekday = (t: number) => { const d = new Date(t - 7 * 3_600_000).getUTCDay(); return d >= 1 && d <= 5; }; // Pacific
    const found = repoNames(QUASAR_REPOS).filter((repo) => {
      const t = standbyAt(repo);
      if (t === null || t >= END || !weekday(t) || t + DAY > END) return false;
      // Others are still moving that day: some other repo has a PR event within the day before it.
      return repoNames(QUASAR_REPOS).some((o) => o !== repo && prs.some((pr) => pr.repo === o && [pr.openAt, pr.endAt ?? 0].some((e) => e > t && e < t + DAY)));
    });
    expect(found).toContain('search-api');
  });
  it('finishes every item, and reopens one Story and one Bug on different captains', () => {
    expect(plans.every((p) => last(p) === 'Closed')).toBe(true);
    const reopened = plans.filter((p) => p.steps.filter((s) => s.state === 'Closed').length > 1);
    expect(reopened.map((p) => p.kind).sort()).toEqual(['bug', 'story']);
    expect(new Set(reopened.map((p) => p.owner)).size).toBe(2);
    for (const p of reopened) expect(p.steps.some((s, i) => s.state === 'Active' && p.steps.slice(0, i).some((x) => x.state === 'Closed'))).toBe(true);
  });
});

describe('Pulsar: twenty captains', () => {
  const { plans } = pods.pulsar!;
  const crew = handles(PULSAR_CAST);
  it('gives each of the twenty 1 to 4 items', () => {
    expect(crew).toHaveLength(20);
    for (const h of crew) { const n = plans.filter((p) => p.owner === h).length; expect(n, h).toBeGreaterThanOrEqual(1); expect(n, h).toBeLessThanOrEqual(4); }
  });
  it('gives each captain 1 to 5 Tasks under other people\'s work', () => {
    for (const h of crew) {
      const n = plans.flatMap((p) => p.tasks.filter((t) => t.assignee === h && p.owner !== h)).length;
      expect(n, h).toBeGreaterThanOrEqual(1);
      expect(n, h).toBeLessThanOrEqual(5);
    }
  });
  it('puts 1 to 3 reviewers on a merge, mostly 2', () => {
    const prs = plans.flatMap((p) => p.prs).filter((x) => x.outcome === 'merged');
    for (const pr of prs) { expect(pr.reviewers.length).toBeGreaterThanOrEqual(1); expect(pr.reviewers.length).toBeLessThanOrEqual(3); expect(pr.reviewers).not.toContain(pr.author); }
    expect(prs.filter((x) => x.reviewers.length === 2).length / prs.length).toBeGreaterThan(0.5);
  });
  it('closes about a fifth of its items without a PR', () => {
    const closed = plans.filter((p) => last(p) === 'Closed');
    const share = closed.filter((p) => p.prs.length === 0).length / closed.length;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.3);
  });
  it('leaves nobody without a planet for want of a live item', () => {
    for (const h of crew) expect(plans.some((p) => p.owner === h && !['Removed', 'Rejected'].includes(last(p) ?? '')), h).toBe(true);
  });
});

describe('the whole project shows every variation', () => {
  const everyone = [...COMET_CAST, ...NOVA_CAST, ...QUASAR_CAST, ...PULSAR_CAST, ...METEOR_CAST];
  it('flies all 9 hulls in all 8 colourways, over all 3 world lines', () => {
    expect(new Set(everyone.map((c) => shipOf(c.handle).hull)).size).toBe(9);
    expect(new Set(everyone.map((c) => shipOf(c.handle).colourway)).size).toBe(8);
    expect(new Set(everyone.map((c) => lineOf(c.handle))).size).toBe(3);
  });
  it('lets Pulsar alone show every hull and colourway', () => {
    expect(new Set(PULSAR_CAST.map((c) => shipOf(c.handle).hull)).size).toBe(9);
    expect(new Set(PULSAR_CAST.map((c) => shipOf(c.handle).colourway)).size).toBe(8);
  });
  it('keeps the cast file honest about what each handle looks like', () => {
    for (const c of everyone) expect(shipOf(c.handle), c.handle).toEqual({ hull: c.hull, colourway: c.colourway });
  });
  it('builds all 9 station designs and 0 to 3 guards', () => {
    const repos = repoNames([...COMET_REPOS, ...NOVA_REPOS, ...QUASAR_REPOS, ...PULSAR_REPOS]);
    const looks = repos.map((r) => factions.stationLook(artSeed(repoKey(r))));
    expect(new Set(looks.map((l) => `${l.faction}.${l.colourway}`)).size).toBe(9);
    expect(new Set(repos.map((r) => guardCount(repoKey(r))))).toEqual(new Set([0, 1, 2, 3]));
  });
  it('draws all 3 asteroid materials, all 3 swarms and several hostile colourways', () => {
    const seed = (p: ItemPlan) => artSeed(keys.workItem(FIXTURE_ORG, p.id));
    const stories = allPlans.filter((p) => p.kind === 'story'), bugs = allPlans.filter((p) => p.kind === 'bug');
    expect(new Set(stories.map((p) => rocks.asteroidMaterial(seed(p)))).size).toBe(3);
    expect(new Set(bugs.map((p) => swarm.hiveDesign(seed(p)).style)).size).toBe(3);
    expect(new Set(bugs.map((p) => swarm.hiveDesign(seed(p)).colourway)).size).toBeGreaterThanOrEqual(5);
  });
  it('reaches every rung, including the ones that go off the ladder', () => {
    const states = new Set(allPlans.flatMap((p) => p.steps.map((s) => s.state)));
    for (const s of ['Ready', 'Ready for Review', 'Active', 'Resolved', 'Ready to Accept', 'Closed', 'Deferred', 'Removed', 'Rejected']) expect(states.has(s), s).toBe(true);
  });
  it('has an abandoned PR, an unassigned Story, a close with no PR, and a reopen', () => {
    expect(allPlans.some((p) => p.prs.some((x) => x.outcome === 'abandoned'))).toBe(true);
    expect(allPlans.some((p) => p.owner === null && p.kind === 'story')).toBe(true);
    expect(allPlans.some((p) => p.prs.length === 0 && last(p) === 'Closed')).toBe(true);
    expect(allPlans.some((p) => p.variant === 'reopen')).toBe(true);
  });
});

describe('the PR stat line (B1)', () => {
  const specs = halcyon.ops.flatMap((o) => (o.op === 'prStats' ? [o] : []));
  const prOps = halcyon.ops.flatMap((o) => (o.op === 'pr' ? [o.prId] : []));
  const votes = specs.flatMap((o) => Object.values(o.spec.votes ?? {}));
  it('gives every PR its review facts', () => {
    expect(new Set(specs.map((o) => o.prId))).toEqual(new Set(prOps));
    for (const o of specs) {
      expect(o.spec.pushes, `PR ${o.prId}`).toBeGreaterThanOrEqual(1);
      expect(o.spec.files, `PR ${o.prId}`).toBeGreaterThanOrEqual(1);
      expect(o.spec.threads, `PR ${o.prId}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('shows every vote kind and every size band somewhere', () => {
    for (const v of [10, 5, -5, -10]) expect(votes.includes(v), `vote ${v}`).toBe(true);
    expect(new Set(specs.map((o) => sizeBand(o.spec.files!)))).toEqual(new Set(['S', 'M', 'L']));
  });
  it('varies pushes and threads, and gives some PRs no thread', () => {
    expect(new Set(specs.map((o) => o.spec.pushes)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(specs.map((o) => o.spec.threads)).size).toBeGreaterThanOrEqual(4);
    expect(specs.some((o) => o.spec.threads === 0)).toBe(true);
  });
  it('lets only approvers vote 10 or 5 on a merged PR', () => {
    const done = new Map(halcyon.ops.flatMap((o) => (o.op === 'closePr' && o.status === 'completed' ? [[o.prId, new Set(o.approvedBy ?? [])] as const] : [])));
    for (const o of specs) {
      const approvers = done.get(o.prId);
      if (!approvers) continue;
      for (const [who, v] of Object.entries(o.spec.votes ?? {})) if (v >= 5) expect(approvers.has(who), `PR ${o.prId} ${who}`).toBe(true);
    }
  });
});

describe('the pipeline line (B2)', () => {
  const runs = stationRuns();
  const withPrs = new Set(halcyon.ops.flatMap((o) => (o.op === 'pr' ? [o.opts.repo] : [])));
  it('gives every station repo a run, or no pipeline, and every kind appears among the stations that have PRs', () => {
    expect(runs.map((r) => r.repo).sort()).toEqual([...COMET_REPOS, ...NOVA_REPOS, ...QUASAR_REPOS, ...PULSAR_REPOS, ...METEOR_REPOS].map((x) => x.split(' ')[0]!).sort());
    const shown = runs.filter((r) => withPrs.has(r.repo)).map((r) => r.state);
    for (const state of ['passed', 'failed', 'running', 'partly', 'canceled', null]) expect(shown.includes(state as never), String(state)).toBe(true);
  });
  it('is seeded: the same on every run, minutes to a day ago, before the scenario ends', () => {
    expect(stationRuns()).toEqual(runs);
    for (const r of runs) {
      expect(r.at).toBeLessThan(halcyon.range.endUtc);
      expect(halcyon.range.endUtc - r.at).toBeLessThanOrEqual(31 * 3_600_000);
    }
  });
  it('reaches the bundle: a repo with a run carries it, one without carries none, and the line reads in the chart\'s words', () => {
    const h = toHistory(halcyon, mapping, halcyon.defaultScope);
    const byName = new Map(h.entities.repos.map((r) => [r.name, r]));
    for (const r of runs) {
      const e = byName.get(r.repo);
      if (!e) continue;
      expect(e.run?.state, r.repo).toBe(r.state ?? undefined);
      if (e.run) expect(runLine(e.run, halcyon.range.endUtc)).toMatch(/^Last run: (passed|failed|running|partly passed|canceled) · (just now|\d+ (min|h) ago)$/);
    }
  });
});

describe('Features on the star plate (B3)', () => {
  const countsOf = (plans: ItemPlan[]) => {
    const m = new Map<number, number>();
    for (const p of plans) m.set(p.parent, (m.get(p.parent) ?? 0) + 1);
    return m;
  };
  it('gives Quasar and Pulsar more than three Features, with varied piece counts, so the plate says +N more', () => {
    for (const pod of ['quasar', 'pulsar'] as const) {
      const c = countsOf(pods[pod]!.plans);
      expect(c.size, pod).toBeGreaterThan(3);
      expect(new Set(c.values()).size, `${pod}: counts vary`).toBeGreaterThan(2);
    }
  });
  it('gives Nova one Feature', () => {
    expect(countsOf(pods.nova!.plans).size).toBe(1);
  });
});

describe('Meteor: the bulk-PR run (27 F1)', () => {
  const [A, , C, D, E, F, G, H] = handles(METEOR_CAST) as [string, string, string, string, string, string, string, string];
  const repo = (i: number) => repoNames(METEOR_REPOS)[i]!;
  const ops = halcyon.ops;
  const prs = ops.flatMap((o) => (o.op === 'pr' ? [o] : []));
  const prOf = (id: number) => prs.find((o) => o.prId === id)!;
  const merges = ops.flatMap((o) => (o.op === 'closePr' && o.status === 'completed' ? [o] : []));
  const mergeOf = (id: number) => merges.find((o) => o.prId === id)!;
  const states = ops.flatMap((o) => (o.op === 'state' ? [o] : []));
  const dayOf = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: halcyon.tz });
  const U = (iso: string) => Date.parse(iso);
  const runIds = Array.from({ length: 36 }, (_, i) => 21001 + i);
  /** Merge j completes PR index (7j) mod 36. */
  const mergeJ = (j: number) => mergeOf(21001 + ((7 * j) % 36));

  it('has A open 36 PRs within 60 s into 36 distinct repos, each the first into its repo in the scenario', () => {
    const run = runIds.map(prOf);
    expect(run.every((o) => o.opts.author === A && o.opts.links?.[0] === 12001)).toBe(true);
    expect(new Set(run.map((o) => o.opts.repo)).size).toBe(36);
    expect(run.map((o) => o.opts.repo)).toEqual(Array.from({ length: 36 }, (_, i) => repo(i)));
    expect(Math.max(...run.map((o) => o.t)) - Math.min(...run.map((o) => o.t))).toBeLessThan(60_000);
    for (const o of run) {
      const first = prs.filter((x) => x.opts.repo === o.opts.repo).sort((x, y) => x.t - y.t || x.prId - y.prId)[0]!;
      expect(first.prId, o.opts.repo).toBe(o.prId);
    }
  });

  it('merges 18 of them on each of Wed 16 and Thu 17 (local), approved by sets of 3, 4 then 5 that overlap and grow to D-H', () => {
    const js = Array.from({ length: 36 }, (_, j) => mergeJ(j));
    expect(js.filter((o) => dayOf(o.t) === '2026-09-16').length).toBe(18);
    expect(js.filter((o) => dayOf(o.t) === '2026-09-17').length).toBe(18);
    const sets = [0, 12, 24].map((j) => new Set(mergeJ(j).approvedBy));
    expect(sets.map((x) => x.size)).toEqual([3, 4, 5]);
    expect([...sets[0]!].every((x) => [D, E, F].includes(x))).toBe(true);
    for (let k = 1; k < 3; k++) expect([...sets[k - 1]!].some((x) => sets[k]!.has(x)), `set ${k} overlaps the last`).toBe(true);
    expect(new Set(js.flatMap((o) => o.approvedBy ?? []))).toEqual(new Set([D, E, F, G, H]));
    expect(new Set(js.map((o) => o.t)).size).toBe(36);
    // The merge order isn't the ring order.
    expect(js.map((o) => o.prId)).not.toEqual([...runIds].sort((a, b) => a - b));
    expect(js.every((o, j) => j === 0 || o.t > js[j - 1]!.t)).toBe(true);
  });

  it("puts B's work strictly between opens 17/18 and merges 25/26", () => {
    const open = (i: number) => prOf(21001 + i).t;
    const start = states.find((o) => o.id === 12040 && o.to === 'Active')!;
    expect(start.t).toBeGreaterThan(open(17));
    expect(start.t).toBeLessThan(open(18));
    expect(states.filter((o) => o.id === 12040 && dayOf(o.t) === dayOf(start.t))).toEqual([start]);
    const resolved = states.find((o) => o.id === 12041 && o.to === 'Resolved')!;
    expect(resolved.t).toBeGreaterThan(mergeJ(25).t);
    expect(resolved.t).toBeLessThan(mergeJ(26).t);
  });

  it("has C complete 21040 into 21036's repo at 21036's instant", () => {
    expect(prOf(21040).opts.author).toBe(C);
    expect(prOf(21040).opts.repo).toBe(prOf(21036).opts.repo);
    expect(mergeOf(21040).t).toBe(mergeOf(21036).t);
    expect(mergeOf(21040).by).toBe(C);
    expect(mergeOf(21040).approvedBy).toEqual([G]);
    expect(merges.findIndex((o) => o.prId === 21040)).toBeGreaterThan(merges.findIndex((o) => o.prId === 21036));
  });

  it("puts 21041 and 21042 on one local day with 12011's close strictly between their merges, and no other 12010 work that day", () => {
    expect(dayOf(prOf(21041).t)).toBe(dayOf(prOf(21042).t));
    expect(prOf(21041).opts.repo).toBe(repo(3));
    expect(prOf(21042).opts.repo).toBe(repo(20));
    const close = states.find((o) => o.id === 12011 && o.to === 'Closed')!;
    expect(close.t).toBeGreaterThan(mergeOf(21041).t);
    expect(close.t).toBeLessThan(mergeOf(21042).t);
    expect(dayOf(mergeOf(21041).t)).toBe(dayOf(mergeOf(21042).t));
    expect(dayOf(close.t)).toBe(dayOf(mergeOf(21041).t));
    expect(states.filter((o) => (o.id === 12010 || o.id === 12011) && dayOf(o.t) === dayOf(close.t))).toEqual([close]);
    expect(states.filter((o) => o.id === 12010).map((o) => o.to)).toEqual(['Active']);
  });

  it('puts 21043 and 21044 more than a working day apart, with a Meteor event on every working day between A\'s merge days', () => {
    const t1 = mergeOf(21043).t, t2 = mergeOf(21044).t;
    expect(t2 - t1).toBeGreaterThan(24 * 3_600_000);
    const mine = new Set([...ops.flatMap((o) => (o.op === 'state' && o.id >= 12001 && o.id <= 12051 ? [o.t] : [])), ...prs.filter((o) => o.prId >= 21001 && o.prId <= 21045).map((o) => o.t), ...merges.filter((o) => o.prId >= 21001 && o.prId <= 21045).map((o) => o.t)]);
    const mergeDays = [...new Set(merges.filter((o) => o.prId !== 21040 && o.prId >= 21001 && o.prId <= 21045).map((o) => dayOf(o.t)))].sort();
    const busy = new Set([...mine].map(dayOf));
    for (let t = U(`${mergeDays[0]}T12:00:00Z`); t <= U(`${mergeDays.at(-1)}T12:00:00Z`); t += 86_400_000) {
      const wd = new Date(t).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      expect(busy.has(dayOf(t)), `a Meteor event on ${dayOf(t)}`).toBe(true);
    }
  });

  it('leaves 21045 the only PR into the 37th repo, still open, with no other first-PR-into-a-repo by A after Wed 16', () => {
    expect(prs.filter((o) => o.opts.repo === repo(36)).map((o) => o.prId)).toEqual([21045]);
    expect(merges.some((o) => o.prId === 21045)).toBe(false);
    expect(ops.some((o) => o.op === 'closePr' && o.prId === 21045)).toBe(false);
    const seen = new Set<string>();
    for (const o of [...prs].sort((x, y) => x.t - y.t)) {
      const first = !seen.has(o.opts.repo);
      seen.add(o.opts.repo);
      if (first && o.opts.author === A && o.t > U('2026-09-17T07:00:00Z')) expect(o.prId).toBe(21045);
    }
    expect(new Set(prs.filter((o) => o.prId >= 21001).map((o) => o.opts.repo)).size).toBe(37);
  });

  it('groups 21036 and 21040 as one E6 volley, in recorded and in story time', () => {
    for (const story of [false, true]) {
      const rp = resolvePods({ story, all: true }).find((p) => p.label === 'Meteor Pod')!;
      const dir = scheduleOf(rp.h, rp.scene, rp.tz, {}).limelight!.direction!;
      const evOf = (prId: number) => rp.h.events.find((e) => e.kind === 'pr_completed' && e.evidence.some((x) => x.ref.endsWith(`:${prId}`)))!.eventKey;
      const want = new Set([evOf(21036), evOf(21040)]);
      const vs = [...(dir.volleys?.values() ?? [])].map((v) => new Set(v.members.map((k) => k.slice(0, k.lastIndexOf('|')))));
      expect(vs.some((v) => v.size === want.size && [...want].every((x) => v.has(x))), `${story ? 'story' : 'recorded'}: a volley of exactly those two`).toBe(true);
    }
  }, 120_000);
});

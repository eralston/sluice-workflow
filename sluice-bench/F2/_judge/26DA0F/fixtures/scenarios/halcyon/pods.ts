// The five pods of Halcyon Reach, each a bigger story than the one before (decided 2026-10-27; Meteor added in 27 F1):
//   Comet   one captain, one Story and one Bug, hand-authored beat by beat
//   Nova    three developers on one shared repo, one of them left with a Bug open
//   Quasar  six developers and a manager on a ten-repo polyrepo, two items reopened
//   Pulsar  twenty captains, every hull, a polyrepo of fourteen
//   Meteor  one captain opens a run of 36 pull requests in a minute and merges them over two days (hand-written, with
//           the cases F2 to F4's grouping must bound: a captain inside the run, a same-instant merge, a refused link, a lone summon)
// Comet and Meteor are written out; the others are drawn from a fixed seed, so every run is the same demo.
import { emitItem, lendTasks, prStatsFor, namer, planItem, rngOf, windowFor, HORIZON, type Ev, type ItemPlan, type Kind, type Rng, type Spec } from './gen';
import { COMET_CAST, COMET_REPOS, METEOR_CAST, METEOR_REPOS, NOVA_CAST, NOVA_REPOS, PULSAR_CAST, PULSAR_REPOS, QUASAR_CAST, QUASAR_REPOS } from './cast';

export const S41 = 'Halcyon Reach\\Sprint 41';
export const COMET = 'Halcyon Reach\\Comet Pod';
export const NOVA = 'Halcyon Reach\\Nova Pod';
export const QUASAR = 'Halcyon Reach\\Quasar Pod';
export const PULSAR = 'Halcyon Reach\\Pulsar Pod';
export const METEOR = 'Halcyon Reach\\Meteor Pod';

export interface PodBuild { events: Ev[]; plans: ItemPlan[] }

// ---- Comet: the whole ladder, twice ---------------------------------------------------------------

const at = (iso: string) => Date.parse(iso);

export function comet(): PodBuild {
  const [captain, reviewer] = COMET_CAST.map((c) => c.handle) as [string, string];
  const repo = COMET_REPOS[0]!.split(' ')[0]!;
  const w = { parent: 9001, area: COMET, iteration: S41 };
  const events: Ev[] = [];
  const e = (iso: string, fn: Ev['fn']) => events.push({ t: at(iso), fn });
  // The Story: planned in on the Friday, then every rung up to Closed. Its PR merges with the outsider's approval.
  e('2026-09-11T18:00:00Z', (b) => b.story(10001, 'Month view with availability colours', { ...w, assignee: captain }));
  e('2026-09-11T18:01:00Z', (b) => b.task(10002, 'Design the month grid', { parent: 10001, iteration: S41, assignee: captain }));
  e('2026-09-11T18:02:00Z', (b) => b.task(10003, 'Colour the open nights', { parent: 10001, iteration: S41, assignee: captain }));
  e('2026-09-11T18:03:00Z', (b) => b.task(10004, 'Keyboard navigation', { parent: 10001, iteration: S41, assignee: captain }));
  e('2026-09-14T17:00:00Z', (b) => b.state(10001, 'Ready'));
  e('2026-09-15T16:30:00Z', (b) => b.state(10001, 'Active').state(10002, 'Active'));
  e('2026-09-16T21:00:00Z', (b) => b.state(10002, 'Closed').state(10003, 'Active'));
  e('2026-09-17T22:00:00Z', (b) => b.pr(20001, { repo, author: captain, title: 'Month grid and availability colours', links: [10001] }).prStats(20001, { votes: { [reviewer]: 10 }, pushes: 3, threads: 2, files: 4 }));
  e('2026-09-18T20:00:00Z', (b) => b.state(10003, 'Closed').state(10004, 'Active'));
  e('2026-09-21T17:00:00Z', (b) => b.completePr(20001, { approvedBy: [reviewer] }));
  e('2026-09-21T17:30:00Z', (b) => b.state(10001, 'Resolved'));
  e('2026-09-22T18:00:00Z', (b) => b.state(10004, 'Closed'));
  e('2026-09-22T19:00:00Z', (b) => b.state(10001, 'Ready to Accept'));
  e('2026-09-23T17:00:00Z', (b) => b.state(10001, 'Closed'));
  // The Bug: found mid-sprint, taken up after the Story, and the sprint's last victory.
  e('2026-09-16T18:00:00Z', (b) => b.bug(10005, 'Double-booked slots after a timezone change', { ...w, assignee: captain }));
  e('2026-09-16T18:01:00Z', (b) => b.task(10006, 'Reproduce it from the fixture', { parent: 10005, iteration: S41, assignee: captain }));
  e('2026-09-16T18:02:00Z', (b) => b.task(10007, 'Keep slots in UTC', { parent: 10005, iteration: S41, assignee: captain }));
  e('2026-09-17T17:00:00Z', (b) => b.state(10005, 'Ready'));
  e('2026-09-22T21:00:00Z', (b) => b.state(10005, 'Active').state(10006, 'Active'));
  e('2026-09-23T22:00:00Z', (b) => b.state(10006, 'Closed').state(10007, 'Active'));
  e('2026-09-24T17:00:00Z', (b) => b.pr(20002, { repo, author: captain, title: 'Keep slots in UTC', links: [10005] }).prStats(20002, { votes: { [reviewer]: 5 }, pushes: 2, threads: 1, files: 11 }));
  e('2026-09-24T21:00:00Z', (b) => b.state(10007, 'Closed'));
  e('2026-09-25T17:00:00Z', (b) => b.completePr(20002, { approvedBy: [reviewer] }));
  e('2026-09-25T17:10:00Z', (b) => b.state(10005, 'Resolved'));
  e('2026-09-25T20:00:00Z', (b) => b.state(10005, 'Ready to Accept'));
  e('2026-09-25T22:00:00Z', (b) => b.state(10005, 'Closed'));
  return { events, plans: [] };
}

// ---- The generated pods ---------------------------------------------------------------------------

interface PodOpts {
  seed: number; area: string; features: number[]; idBase: number; prBase: number;
  owners: { handle: string; kinds: Kind[] }[];
  repoFor: (r: Rng, kind: Kind) => { repo: string; prs: number }[];
  reviewers: (r: Rng) => (author: string) => string[];
  /** Share of items that close without a PR. */
  noPrShare: number;
  /** Reviewers who hold no item of their own (they may still vote on an open PR). */
  extraReviewers?: string[];
  /** Set variants, windows and extras on the specs before they are planned. */
  tweak?: (specs: Spec[], r: Rng, ctx: { next: () => number; nextPr: () => number; taskTitle: () => string }) => void;
  /** After planning: hand tasks around. */
  lend?: (plans: ItemPlan[], r: Rng) => void;
}

function buildPod(o: PodOpts): PodBuild {
  const r = rngOf(o.seed);
  const names = namer(r);
  let id = o.idBase, prId = o.prBase;
  const ctx = { next: () => ++id, nextPr: () => ++prId, taskTitle: names.task };
  const specs: Spec[] = [];
  for (const { handle, kinds } of o.owners) {
    kinds.forEach((kind, i) => {
      const win = windowFor(i, kinds.length);
      specs.push({
        id: ctx.next(), kind, owner: handle, title: kind === 'story' ? names.story() : names.bug(), parent: r.pick(o.features), ...win,
        preCreated: kind === 'story' || r.chance(0.5), repos: o.repoFor(r, kind), reviewers: o.reviewers(r),
        nextId: ctx.next, nextPr: ctx.nextPr, taskTitle: ctx.taskTitle, taskCount: r.int(1, 5),
        noPr: false, variant: 'normal', readyFirst: r.chance(0.6), reviewFirst: kind === 'story' && r.chance(0.2),
      });
    });
  }
  r.shuffle(specs).slice(0, Math.round(o.noPrShare * specs.length)).forEach((s) => { s.noPr = true; });
  o.tweak?.(specs, r, ctx);
  const plans = specs.sort((a, b) => a.id - b.id).map((s) => planItem(r, s));
  o.lend?.(plans, r);
  const where = { area: o.area, iteration: S41 };
  return { events: plans.flatMap((p) => emitItem(p, where, [...o.owners.map((x) => x.handle), ...(o.extraReviewers ?? [])])), plans };
}

const others = (everyone: string[]) => (author: string) => everyone.filter((h) => h !== author);

/** Nova: one shared repo, so one dreadnought. The three review each other; one bug stays open. */
export function nova(): PodBuild {
  const [a, b, c] = NOVA_CAST.map((m) => m.handle) as [string, string, string];
  const repo = NOVA_REPOS[0]!.split(' ')[0]!;
  const kindsC = rngOf(0x5eed01).shuffle<Kind>(['story', 'story', 'bug', 'bug']);
  return buildPod({
    seed: 0x4e0a01, area: NOVA, features: [9002], idBase: 10100, prBase: 20100,
    owners: [{ handle: a, kinds: ['story', 'story', 'story'] }, { handle: b, kinds: ['bug', 'bug', 'bug'] }, { handle: c, kinds: kindsC }],
    repoFor: (r, kind) => [{ repo, prs: kind === 'story' && r.chance(0.35) ? 2 : 1 }],
    reviewers: () => others([a, b, c]),
    noPrShare: 0,
    tweak: (specs) => {
      // The bug the sprint ends without: its PR is still open.
      const last = specs.filter((s) => s.owner === b).sort((x, y) => x.b - y.b).at(-1)!;
      last.variant = 'open'; last.b = HORIZON; last.preCreated = true;
    },
  });
}

/** Quasar: polyrepo, a manager who reviews and takes tasks but holds no Story or Bug, two items reopened. */
export function quasar(): PodBuild {
  const devs = QUASAR_CAST.slice(0, 6).map((m) => m.handle);
  const manager = QUASAR_CAST[6]!.handle;
  const repos = QUASAR_REPOS.map((x) => x.split(' ')[0]!);
  const kindRng = rngOf(0x51a5a7);
  return buildPod({
    seed: 0x51a5a8, area: QUASAR, features: [9003, 9005, 9007, 9008, 9009], idBase: 10400, prBase: 20300,
    owners: devs.map((handle) => ({ handle, kinds: Array.from({ length: kindRng.int(3, 6) }, (): Kind => (kindRng.chance(0.5) ? 'story' : 'bug')) })),
    repoFor: (r, kind) => (kind === 'story' ? r.shuffle(repos).slice(0, r.int(1, 3)).map((repo) => ({ repo, prs: r.int(1, 2) })) : [{ repo: r.pick(repos), prs: r.chance(0.25) ? 2 : 1 }]),
    // Always two: the manager, and one developer who isn't the author.
    reviewers: (r) => (author) => [manager, r.pick(devs.filter((d) => d !== author))],
    extraReviewers: [manager],
    noPrShare: 0,
    tweak: (specs, r) => {
      // One Story and one Bug that were done and weren't, on different captains. They need room after.
      const early = (kind: Kind, not?: string) => r.pick(specs.filter((s) => s.kind === kind && s.owner !== not && s.a < 28));
      const story = early('story');
      const bug = early('bug', story.owner!);
      for (const s of [story, bug]) { s.variant = 'reopen'; s.b = Math.min(s.b, 38); s.preCreated = true; }
    },
    lend: (plans, r) => { lendTasks(r, plans, manager, r.int(5, 8), true); },
  });
}

/** Pulsar: twenty captains in a polyrepo, a mix of everything an item can do. */
export function pulsar(): PodBuild {
  const crew = PULSAR_CAST.map((m) => m.handle);
  const repos = PULSAR_REPOS.map((x) => x.split(' ')[0]!);
  const kindRng = rngOf(0x9015a1);
  return buildPod({
    seed: 0x9015a2, area: PULSAR, features: [9004, 9006, 9010, 9011, 9012, 9013, 9014, 9015, 9016, 9017], idBase: 11000, prBase: 20700,
    owners: crew.map((handle) => ({ handle, kinds: Array.from({ length: kindRng.int(1, 4) }, (): Kind => (kindRng.chance(0.5) ? 'story' : 'bug')) })),
    repoFor: (r, kind) => (kind === 'story' ? r.shuffle(repos).slice(0, r.int(1, 3)) : [r.pick(repos)]).map((repo) => ({ repo, prs: r.chance(0.3) ? 2 : 1 })),
    // Two reviewers as a rule; sometimes one, sometimes three.
    reviewers: (r) => (author) => {
      const u = r.next();
      return r.shuffle(crew.filter((h) => h !== author)).slice(0, u < 0.15 ? 1 : u < 0.85 ? 2 : 3);
    },
    noPrShare: 0.2,
    tweak: (specs, r, ctx) => {
      // A few items that don't just close: one Removed, one Rejected, one Deferred, one with an abandoned PR,
      // and one nobody has picked up. They sit on people with other work, so nobody is left without a planet.
      const spare = (kind: Kind) => r.pick(specs.filter((s) => s.kind === kind && s.variant === 'normal' && specs.filter((x) => x.owner === s.owner).length > 1));
      const removed = spare('story'); removed.variant = 'removed'; removed.noPr = true;
      const rejected = spare('bug'); rejected.variant = 'rejected'; rejected.noPr = true;
      const deferred = spare('story'); deferred.variant = 'deferred'; deferred.noPr = false;
      const abandoned = spare('story'); abandoned.variant = 'abandoned'; abandoned.noPr = false;
      specs.push({
        id: ctx.next(), kind: 'story', owner: null, title: 'Offline mode for the host app', parent: 9006, a: 0, b: HORIZON, preCreated: true,
        repos: [], reviewers: () => [], nextId: ctx.next, nextPr: ctx.nextPr, taskTitle: ctx.taskTitle, taskCount: 2,
        noPr: true, variant: 'unassigned', readyFirst: false,
      });
    },
    // Each captain also lends a hand on one to five tasks under other people's work.
    lend: (plans, r) => { for (const h of crew) lendTasks(r, plans, h, r.int(1, 5)); },
  });
}

// ---- Meteor: a bulk-PR run (27 F1) -----------------------------------------------------------------

/**
 * Meteor: captain A opens 36 PRs into 36 repos in 52.5 s (Wed 16 Sep) and merges them over Wed and Thu, approved by
 * sets of 3, 4 then 5 of five approvers who hold no items. Around the run sit the cases F2 to F4's grouping must bound,
 * each timed so that B-1, B-12 and B-13 can't blur it (the packet's timeline, to the second). Roles by cast index:
 * [0] A the run's captain, [1] B the other captain, [2] C the second author, [3..7] D-H the approvers.
 * Repos: [0..35] the run's, [36] the lone summon's. Items 12001+, PRs 21001+. All times UTC (the zone is America/Los_Angeles).
 */
export function meteor(): PodBuild {
  const [A, B, C, D, E, F, G, H] = METEOR_CAST.map((c) => c.handle) as [string, string, string, string, string, string, string, string];
  const roster = METEOR_CAST.map((c) => c.handle);
  const repo = (i: number) => METEOR_REPOS[i]!.split(' ')[0]!;
  const events: Ev[] = [];
  const e = (iso: string, fn: Ev['fn']) => events.push({ t: at(iso), fn });
  const w = { parent: 9018, area: METEOR, iteration: S41 };
  const tw = (parent: number, assignee: string) => ({ parent, iteration: S41, assignee });
  /** A PR opened by `author` (its item Active at the time, so the board's Code Review column first), then its review facts. */
  const open = (t: number, id: number, repoIx: number, title: string, item: number, author: string, outcome: 'merged' | 'open', reviewers: string[]) => {
    events.push({ t, fn: (b) => b.column(item, 'Code Review') });
    events.push({ t, fn: (b) => b.pr(id, { repo: repo(repoIx), author, title, links: [item] }) });
    events.push({ t, fn: (b) => b.prStats(id, prStatsFor({ id, repo: repo(repoIx), title, author, openAt: t, endAt: null, outcome, reviewers }, roster)) });
  };
  const merge = (t: number, id: number, approvedBy: string[], by?: string) => events.push({ t, fn: (b) => b.completePr(id, { approvedBy, ...(by ? { by } : {}) }) });

  // Planning (Fri 11 Sep): every item is made in S41, none inside the round, so there is no opening sweep.
  e('2026-09-11T18:00:00Z', (b) => b.story(12001, 'Move every service to the new base image', { ...w, assignee: A }));
  e('2026-09-11T18:01:00Z', (b) => b.task(12002, 'Write the upgrade script', tw(12001, A)));
  e('2026-09-11T18:02:00Z', (b) => b.task(12003, 'Open the PRs', tw(12001, A)));
  e('2026-09-11T18:03:00Z', (b) => b.story(12040, 'Tidy the host dashboard', { ...w, assignee: B }));
  e('2026-09-11T18:04:00Z', (b) => b.task(12042, 'Group the dashboard cards', tw(12040, B)));
  e('2026-09-11T18:05:00Z', (b) => b.bug(12041, 'Dashboard totals lag after a refund', { ...w, assignee: B }));
  e('2026-09-11T18:06:00Z', (b) => b.task(12043, 'Recompute totals after a refund', tw(12041, B)));
  e('2026-09-11T18:07:00Z', (b) => b.story(12050, 'Cache the rate tables', { ...w, assignee: C }));
  e('2026-09-11T18:08:00Z', (b) => b.task(12051, 'Add a rate table cache', tw(12050, C)));
  e('2026-09-11T18:09:00Z', (b) => b.story(12010, 'Rotate the shared signing keys', { ...w, assignee: A }));
  e('2026-09-11T18:10:00Z', (b) => b.task(12011, 'Rotate the staging keys', tw(12010, A)));
  e('2026-09-11T18:11:00Z', (b) => b.story(12020, 'Retire the legacy health checks', { ...w, assignee: A }));
  e('2026-09-11T18:12:00Z', (b) => b.task(12021, 'Remove the old probes', tw(12020, A)));
  e('2026-09-11T18:13:00Z', (b) => b.story(12030, 'Pin the base image in the new search service', { ...w, assignee: A }));
  e('2026-09-11T18:14:00Z', (b) => b.task(12031, 'Pin the image digest', tw(12030, A)));

  // A's run, S1 12001.
  e('2026-09-14T17:00:00Z', (b) => b.state(12001, 'Ready'));
  e('2026-09-15T16:30:00Z', (b) => b.state(12001, 'Active'));
  e('2026-09-15T16:35:00Z', (b) => b.state(12002, 'Active'));
  e('2026-09-15T21:00:00Z', (b) => b.state(12002, 'Closed'));
  e('2026-09-15T21:30:00Z', (b) => b.state(12003, 'Active'));
  e('2026-09-16T16:50:00Z', (b) => b.state(12003, 'Closed'));
  // Merges: PR index (7j) mod 36, a fixed permutation, so the merge order isn't the ring order. 7 * 31 = 1 (mod 36), so
  // PR index i merges at j = 31 i mod 36. A PR's review facts name its approvers at the time it opens (the votes ingest reads back).
  const approvers = (j: number) => (j < 12 ? [D, E, F] : j < 24 ? [E, F, G, H] : [D, E, F, G, H]);
  const runOpen = at('2026-09-16T17:00:00Z');
  for (let i = 0; i < 36; i++) open(runOpen + 1500 * i, 21001 + i, i, `Move ${repo(i)} to the new base image`, 12001, A, 'merged', approvers((31 * i) % 36));
  for (let j = 0; j < 36; j++) {
    const t = j < 18 ? at('2026-09-16T18:00:00Z') + 17 * 60_000 * j : at('2026-09-17T16:30:00Z') + 17 * 60_000 * (j - 18);
    merge(t, 21001 + ((7 * j) % 36), approvers(j));
    // F-Q5: C completes PR 21040 at the instant of j=5's merge (21036's, in the same repo), emitted just after A's.
    if (j === 5) merge(t, 21040, [G], C);
  }
  open(at('2026-09-16T18:40:00Z'), 21040, 35, 'Cache the rate tables for the shared client', 12050, C, 'merged', [G]);
  e('2026-09-17T21:40:00Z', (b) => b.state(12001, 'Resolved'));
  e('2026-09-18T16:30:00Z', (b) => b.state(12001, 'Ready to Accept'));
  e('2026-09-18T17:00:00Z', (b) => b.state(12001, 'Closed'));

  // B inside the run (gather-back cases).
  e('2026-09-15T18:00:00Z', (b) => b.state(12041, 'Active'));
  e('2026-09-15T18:05:00Z', (b) => b.state(12043, 'Active'));
  e('2026-09-16T17:00:26Z', (b) => b.state(12040, 'Active'));
  e('2026-09-17T18:35:00Z', (b) => b.state(12043, 'Closed'));
  e('2026-09-17T18:40:00Z', (b) => b.state(12041, 'Resolved'));
  e('2026-09-18T17:00:00Z', (b) => b.state(12042, 'Active'));
  e('2026-09-18T18:00:00Z', (b) => b.state(12041, 'Closed'));
  e('2026-09-21T17:30:00Z', (b) => b.state(12042, 'Closed'));
  e('2026-09-21T18:00:00Z', (b) => b.state(12040, 'Resolved'));
  e('2026-09-22T17:30:00Z', (b) => b.state(12040, 'Closed'));

  // C's story (F-Q5): its work is nowhere near the merge, so no arc.
  e('2026-09-14T17:30:00Z', (b) => b.state(12050, 'Active'));
  e('2026-09-14T17:35:00Z', (b) => b.state(12051, 'Active'));
  e('2026-09-15T19:00:00Z', (b) => b.state(12051, 'Closed'));
  e('2026-09-22T18:00:00Z', (b) => b.state(12050, 'Resolved'));
  e('2026-09-24T17:00:00Z', (b) => b.state(12050, 'Closed'));

  // A link the B-15 guard must refuse: 12011's close lands between the two merges, on the same local day.
  e('2026-09-18T19:30:00Z', (b) => b.state(12010, 'Active'));
  e('2026-09-18T19:45:00Z', (b) => b.state(12011, 'Active'));
  open(at('2026-09-18T20:00:00Z'), 21041, 3, 'Rotate the staging signing keys', 12010, A, 'merged', [D, E]);
  open(at('2026-09-18T20:05:00Z'), 21042, 20, 'Rotate the shared signing keys', 12010, A, 'merged', [E, F]);
  merge(at('2026-09-21T17:00:00Z'), 21041, [D, E]);
  e('2026-09-21T17:20:00Z', (b) => b.state(12011, 'Closed'));
  merge(at('2026-09-21T17:40:00Z'), 21042, [E, F]);

  // Two merges more than a working day apart.
  e('2026-09-22T19:30:00Z', (b) => b.state(12020, 'Active'));
  e('2026-09-22T19:40:00Z', (b) => b.state(12021, 'Active'));
  open(at('2026-09-22T20:00:00Z'), 21043, 11, 'Retire the old health checks in the booking service', 12020, A, 'merged', [D, E, F]);
  open(at('2026-09-22T20:05:00Z'), 21044, 27, 'Retire the old health checks in the second service', 12020, A, 'merged', [E, G]);
  merge(at('2026-09-23T18:00:00Z'), 21043, [D, E, F]);
  merge(at('2026-09-25T18:00:00Z'), 21044, [E, G]);
  e('2026-09-25T17:30:00Z', (b) => b.state(12021, 'Closed'));
  e('2026-09-25T18:30:00Z', (b) => b.state(12020, 'Resolved'));
  e('2026-09-25T21:00:00Z', (b) => b.state(12020, 'Closed'));

  // The same captain's single summon: a new station (the 37th), its PR left open.
  e('2026-09-24T18:30:00Z', (b) => b.state(12030, 'Active'));
  e('2026-09-24T18:35:00Z', (b) => b.state(12031, 'Active'));
  open(at('2026-09-24T19:00:00Z'), 21045, 36, 'Pin the base image in the search service', 12030, A, 'open', []);
  return { events, plans: [] };
}

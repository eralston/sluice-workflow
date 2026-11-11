// Halcyon Reach demo data (decided 2026-10-27): a seeded generator for Stories and Bugs that live out
// their whole ladder. A plan (`planItem`) is pure data, so tests can read it; `emitItem` replays it
// through the fixture DSL. One fixed seed per pod keeps every run identical. Invented names only (INV-18).
import { fnv1a32, seededRandom } from '@shared/hash';
import type { PrStatsSpec, scenario } from '../../dsl';

export type B = ReturnType<typeof scenario>;
/** One timed call on the builder; everything is collected, sorted by time, then replayed. */
export interface Ev { t: number; fn: (b: B) => void }

// ---- Randomness ---------------------------------------------------------------------------------

export interface Rng {
  next: () => number;
  between: (lo: number, hi: number) => number;
  /** Whole number in [lo, hi]. */
  int: (lo: number, hi: number) => number;
  pick: <T>(xs: readonly T[]) => T;
  chance: (p: number) => boolean;
  shuffle: <T>(xs: readonly T[]) => T[];
}

export function rngOf(seed: number): Rng {
  const next = seededRandom(seed);
  const rng: Rng = {
    next,
    between: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)]!,
    chance: (p) => next() < p,
    shuffle: (xs) => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
      return a;
    },
  };
  return rng;
}

// ---- Time: Sprint 41 is ten work days, Mon 14 Sep to Fri 25 Sep 2026, 9:00 to 16:00 Pacific ------

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SPRINT_START = Date.parse('2026-09-14T16:00:00Z');
/** The Friday before: when stories are planned in and the sprint's items are made. */
export const PLANNING = Date.parse('2026-09-11T18:00:00Z');
export const WORK_DAY_HOURS = 7;
/** Work hours the generator uses; the last day's afternoon is left for the finale. */
export const HORIZON = 66;

/** `h` work hours into the sprint, as UTC milliseconds (weekends skipped). */
export function workTime(h: number): number {
  const day = Math.floor(h / WORK_DAY_HOURS);
  const inDay = h - day * WORK_DAY_HOURS;
  const calendarDays = Math.floor(day / 5) * 7 + (day % 5);
  return Math.round((SPRINT_START + calendarDays * DAY + inDay * HOUR) / 60_000) * 60_000;
}

export const iso = (t: number) => new Date(t).toISOString();

// ---- Titles -------------------------------------------------------------------------------------

const STORY_VERBS = ['Add', 'Show', 'Let guests change', 'Support', 'Sync', 'Export', 'Filter', 'Group', 'Remind guests about', 'Auto-fill', 'Surface', 'Streamline', 'Preview', 'Bulk-edit'];
const NOUNS = [
  'calendar colour themes', 'late checkout requests', 'pet policy notices', 'rate overrides', 'guest notes', 'group bookings',
  'invoice downloads', 'check-in QR codes', 'housekeeping handoffs', 'review replies', 'photo ordering', 'loyalty tiers',
  'waitlist offers', 'payout schedules', 'channel mappings', 'maintenance tickets', 'tax summaries', 'cancellation reasons',
  'arrival messages', 'unit availability', 'seasonal pricing', 'deposit holds', 'door code delivery', 'host digests',
  'booking comparisons', 'cleaning windows', 'key handovers', 'minimum stays', 'refund rules', 'guest verification',
];
const SYMPTOMS = [
  'shows the wrong total', 'fails after a timezone change', 'duplicates on retry', 'drops the last entry', 'times out under load',
  'ignores the saved filter', 'double-charges on refresh', 'loses the guest note', 'renders blank on mobile', 'sends two emails',
  'crashes when empty', 'mis-sorts by date', 'rounds the wrong way', 'sticks on "pending"',
];
const TASKS = [
  'Design the states', 'Add the endpoint', 'Write the migration', 'Cover with tests', 'Wire the UI', 'Update the docs', 'Add telemetry',
  'Review the copy', 'Accessibility pass', 'Put it behind a flag', 'Backfill the data', 'Load test it', 'Handle the errors', 'Review the API shape',
];

/** Titles that don't repeat within a pod. */
export function namer(r: Rng) {
  const used = new Set<string>();
  const fresh = (make: () => string) => {
    for (let i = 0; i < 50; i++) { const t = make(); if (!used.has(t)) { used.add(t); return t; } }
    const t = `${make()} (again)`; used.add(t); return t;
  };
  return {
    story: () => fresh(() => `${r.pick(STORY_VERBS)} ${r.pick(NOUNS)}`),
    bug: () => fresh(() => `${r.pick(NOUNS).replace(/^./, (c) => c.toUpperCase())} ${r.pick(SYMPTOMS)}`),
    task: () => r.pick(TASKS),
  };
}

// ---- Plans --------------------------------------------------------------------------------------

export type Kind = 'story' | 'bug';
export type Variant = 'normal' | 'removed' | 'rejected' | 'deferred' | 'abandoned' | 'reopen' | 'open' | 'unassigned';

export interface TaskPlan { id: number; title: string; assignee: string | null; activeAt: number | null; endAt: number | null; endState: 'Closed' | 'Removed' }
export interface PrPlan { id: number; repo: string; title: string; author: string; openAt: number; endAt: number | null; outcome: 'merged' | 'abandoned' | 'open'; reviewers: string[] }
export interface Step { at: number; state: string }
export interface ItemPlan {
  id: number; kind: Kind; title: string; parent: number; owner: string | null; variant: Variant;
  createAt: number; steps: Step[]; prs: PrPlan[]; tasks: TaskPlan[];
}

export interface Spec {
  id: number; kind: Kind; owner: string | null; title: string; parent: number;
  /** Work-hour window the whole lifecycle must fit in. */
  a: number; b: number;
  /** Made at planning (before the sprint) rather than appearing in it. */
  preCreated: boolean;
  /** One entry per repo it needs: how many PRs go into it. */
  repos: { repo: string; prs: number }[];
  reviewers: (author: string) => string[];
  nextId: () => number;
  nextPr: () => number;
  taskTitle: () => string;
  taskCount: number;
  noPr: boolean;
  variant: Variant;
  /** New → Ready first (else straight to Active). */
  readyFirst: boolean;
  /** Ready → Ready for Review → Active. */
  reviewFirst?: boolean;
}

/** Lay out one item's whole life inside its window. All times are fractions of the window, then work hours. */
export function planItem(r: Rng, s: Spec): ItemPlan {
  const L = s.b - s.a;
  const owner = s.owner;
  const createAt = s.preCreated ? PLANNING + r.int(0, 180) * 60_000 : workTime(s.a);
  const plan: ItemPlan = { id: s.id, kind: s.kind, title: s.title, parent: s.parent, owner, variant: s.variant, createAt, steps: [], prs: [], tasks: [] };

  const fActive = s.variant === 'deferred' ? r.between(0.2, 0.3) : r.between(0.05, 0.14);
  const hours: { activeAt: number; resolveAt: number | null } = { activeAt: 0, resolveAt: null };
  const T = (f: number) => workTime(s.a + f * L);

  // Variants that never reach Closed.
  if (s.variant === 'unassigned') {
    // Sits New in the frontier belt, un-owned all sprint.
  } else if (s.variant === 'removed') {
    plan.steps.push({ at: T(fActive * 0.5), state: 'Ready' }, { at: T(fActive), state: 'Active' }, { at: T(r.between(0.45, 0.6)), state: 'Removed' });
    hours.activeAt = T(fActive); hours.resolveAt = T(0.45);
  } else if (s.variant === 'rejected') {
    plan.steps.push({ at: T(fActive * 0.6), state: 'Ready' }, { at: T(r.between(0.25, 0.4)), state: 'Rejected' });
    hours.activeAt = T(fActive); hours.resolveAt = plan.steps[1]!.at;
  } else {
    if (s.variant === 'deferred') plan.steps.push({ at: T(0.04), state: 'Deferred' });
    else if (s.readyFirst) {
      plan.steps.push({ at: T(fActive * 0.4), state: 'Ready' });
      if (s.reviewFirst) plan.steps.push({ at: T(fActive * 0.7), state: 'Ready for Review' });
    }
    plan.steps.push({ at: T(fActive), state: 'Active' });
    hours.activeAt = T(fActive);

    // PRs: each opens during the work and merges a while later; repos overlap in time.
    const authorOf = owner ?? 'nobody';
    let lastEnd = fActive;
    // PR times stay fractions until the squeeze below has run.
    const prF: { pr: PrPlan; open: number; end: number | null }[] = [];
    const addPr = (pr: Omit<PrPlan, 'openAt' | 'endAt'>, open: number, end: number | null) => {
      const full: PrPlan = { ...pr, openAt: 0, endAt: null };
      plan.prs.push(full); prF.push({ pr: full, open, end });
    };
    if (!s.noPr) {
      let first = true;
      for (const { repo, prs } of s.repos) {
        for (let k = 0; k < prs; k++) {
          const open = r.between(Math.max(0.18, fActive + 0.05), 0.55);
          const end = Math.min(0.78, open + r.between(0.06, 0.2));
          const abandon = s.variant === 'abandoned' && first;
          const keepOpen = s.variant === 'open';
          addPr({
            id: s.nextPr(), repo, title: `${s.title}${s.repos.length > 1 || prs > 1 ? ` (${repo})` : ''}`, author: authorOf,
            outcome: abandon ? 'abandoned' : keepOpen ? 'open' : 'merged', reviewers: abandon || keepOpen ? [] : s.reviewers(authorOf),
          }, open, keepOpen ? null : end);
          if (!keepOpen) lastEnd = Math.max(lastEnd, end);
          if (abandon) {
            // Its replacement, in the same repo, a little later.
            const reopen = Math.min(0.7, end + 0.03);
            const reEnd = Math.min(0.8, reopen + r.between(0.06, 0.15));
            addPr({ id: s.nextPr(), repo, title: `${s.title} (take two)`, author: authorOf, outcome: 'merged', reviewers: s.reviewers(authorOf) }, reopen, reEnd);
            lastEnd = Math.max(lastEnd, reEnd);
          }
          first = false;
        }
      }
    }
    const settlePrs = (sq: (f: number) => number) => {
      for (const { pr, open, end } of prF) { pr.openAt = T(sq(open)); pr.endAt = end === null ? null : T(sq(end)); }
    };

    if (s.variant === 'open') {
      // The item the sprint ends without: PR still open, work still on.
      hours.resolveAt = null;
      settlePrs((f) => f);
    } else {
      const quick = s.noPr && r.chance(0.5);
      let fResolve = s.noPr ? r.between(0.4, 0.7) : lastEnd + r.between(0.02, 0.05);
      let fAccept = fResolve + r.between(0.04, 0.1);
      let fClose = quick ? r.between(0.4, 0.7) : fAccept + r.between(0.03, 0.08);
      // Squeeze everything after Active so it fits the window.
      const scale = Math.min(1, 0.97 / Math.max(fClose, 0.001));
      const sq = (f: number) => fActive + (f - fActive) * scale;
      if (scale < 1) { fResolve = sq(fResolve); fAccept = sq(fAccept); fClose = sq(fClose); }
      settlePrs(scale < 1 ? sq : (f) => f);
      if (!quick) plan.steps.push({ at: T(fResolve), state: 'Resolved' }, { at: T(fAccept), state: 'Ready to Accept' });
      plan.steps.push({ at: T(fClose), state: 'Closed' });
      hours.resolveAt = T(quick ? fClose : fResolve);

      if (s.variant === 'reopen') {
        // It was done; then it wasn't (02 §2, reopened). One fix PR, then done for good.
        const closeH = s.a + fClose * L;
        const back = closeH + r.between(4, 9);
        const repo = r.pick(s.repos).repo;
        const prOpen = back + r.between(0.5, 1.5), prEnd = prOpen + r.between(1.5, 3);
        plan.steps.push({ at: workTime(back), state: 'Active' });
        plan.prs.push({ id: s.nextPr(), repo, title: `${s.title} (fix the regression)`, author: authorOf, openAt: workTime(prOpen), endAt: workTime(prEnd), outcome: 'merged', reviewers: s.reviewers(authorOf) });
        plan.steps.push(
          { at: workTime(prEnd + r.between(0.5, 1)), state: 'Resolved' },
          { at: workTime(prEnd + r.between(2, 3.5)), state: 'Ready to Accept' },
          { at: workTime(prEnd + r.between(4, 5.5)), state: 'Closed' },
        );
      }
    }
  }

  // Tasks: 1 to 5, each done at some point before its parent is.
  const resolveAt = hours.resolveAt ?? workTime(s.b);
  for (let i = 0; i < s.taskCount; i++) {
    const id = s.nextId();
    const base: TaskPlan = { id, title: s.taskTitle(), assignee: owner, activeAt: null, endAt: null, endState: 'Closed' };
    if (s.variant === 'unassigned') { plan.tasks.push(base); continue; }
    const span = Math.max(resolveAt - hours.activeAt, HOUR);
    const startAt = hours.activeAt + Math.round(r.between(0, 0.5) * span);
    const closeAt = startAt + Math.round(r.between(0.15, 0.5) * span);
    if (s.variant === 'open') {
      // Some done, one under way, the rest still New.
      if (i < Math.ceil(s.taskCount / 2)) plan.tasks.push({ ...base, activeAt: startAt, endAt: Math.min(closeAt, resolveAt - HOUR) });
      else if (i === Math.ceil(s.taskCount / 2)) plan.tasks.push({ ...base, activeAt: hours.activeAt + Math.round(0.6 * span) });
      else plan.tasks.push(base);
    } else {
      plan.tasks.push({ ...base, activeAt: startAt, endAt: Math.min(closeAt, resolveAt - 10 * 60_000), endState: s.variant === 'removed' || s.variant === 'rejected' ? 'Removed' : 'Closed' });
    }
  }
  return plan;
}

/** Hand some of the tasks under other people's items to `who`. Returns how many it found. */
export function lendTasks(r: Rng, plans: ItemPlan[], who: string, count: number, distinctParents = false): number {
  const slots = r.shuffle(plans.flatMap((p) => (p.owner && p.owner !== who ? p.tasks.filter((t) => t.assignee === p.owner).map((t) => ({ p, t })) : [])));
  const parents = new Set<number>();
  let n = 0;
  for (const { p, t } of slots) {
    if (n >= count) break;
    if (distinctParents && parents.has(p.id)) continue;
    t.assignee = who; parents.add(p.id); n++;
  }
  return n;
}

// ---- Replaying a plan through the DSL -----------------------------------------------------------

/**
 * A PR's review facts for the plate's stat line (B1): votes, pushes, threads, files. Every value is a
 * hash of the PR's number, never a draw from a pod's generator, so adding them moved nothing else. A
 * merged PR's approvers vote 10, one in five of them 5 (approved with suggestions), and now and then a
 * reviewer who didn't approve is still waiting (-5); an open one gets one or two reviewers with a vote
 * of any kind; an abandoned one, a reviewer who rejected it (-10) and one who waited (-5). `roster`: who may review.
 */
export function prStatsFor(pr: PrPlan, roster: readonly string[]): PrStatsSpec {
  const h = (salt: string) => fnv1a32(`halcyon-pr|${pr.id}|${salt}`);
  const others = roster.filter((x) => x !== pr.author);
  const pickOther = (salt: string, not: readonly string[] = []) => {
    const pool = others.filter((x) => !not.includes(x));
    return pool.length ? pool[h(salt) % pool.length]! : undefined;
  };
  const votes: Record<string, number> = {};
  if (pr.outcome === 'merged') {
    pr.reviewers.forEach((who, i) => { votes[who] = h(`vote${i}`) % 5 === 0 ? 5 : 10; });
    const idle = h('idle') % 8 === 0 ? pickOther('idler', pr.reviewers) : undefined;
    if (idle) votes[idle] = -5;
  } else if (pr.outcome === 'abandoned') {
    // Abandoned after a rejection, with a second reviewer who was still waiting.
    const who = pickOther('abandoner');
    if (who) votes[who] = -10;
    const waiter = pickOther('waiter', who ? [who] : []);
    if (waiter) votes[waiter] = -5;
  } else {
    const first = pickOther('first');
    if (first) votes[first] = [10, 5, -5, -10][h('v1') % 4]!;
    const second = h('two') % 2 === 0 ? pickOther('second', first ? [first] : []) : undefined;
    if (second) votes[second] = [10, 5, -5][h('v2') % 3]!;
  }
  const u = h('size') % 100;
  const files = u < 40 ? 1 + (h('f') % 5) : u < 80 ? 6 + (h('f') % 15) : 21 + (h('f') % 40);
  const pushes = 1 + (h('p') % (files > 20 ? 7 : 4));
  return { votes, pushes, threads: h('t') % 7, files };
}

export function emitItem(p: ItemPlan, where: { area: string; iteration: string }, roster: readonly string[] = []): Ev[] {
  const ev: Ev[] = [];
  const opts = { parent: p.parent, area: where.area, iteration: where.iteration, ...(p.owner ? { assignee: p.owner } : {}) };
  ev.push({ t: p.createAt, fn: (b) => (p.kind === 'story' ? b.story(p.id, p.title, opts) : b.bug(p.id, p.title, opts)) });
  p.tasks.forEach((t, i) => {
    ev.push({ t: p.createAt + 1000 * (i + 1), fn: (b) => b.task(t.id, t.title, { parent: p.id, iteration: where.iteration, ...(t.assignee ? { assignee: t.assignee } : {}) }) });
    if (t.activeAt !== null) ev.push({ t: t.activeAt, fn: (b) => b.state(t.id, 'Active') });
    if (t.endAt !== null) ev.push({ t: t.endAt, fn: (b) => b.state(t.id, t.endState) });
  });
  for (const s of p.steps) ev.push({ t: s.at, fn: (b) => b.state(p.id, s.state) });
  // B4: while an item is Active, opening its PR moves it into the board's Code Review column (a column inside the Active
  // state). The column rides on the revision that links the PR, so no revision number moves.
  const stateAt = (t: number) => p.steps.filter((x) => x.at <= t).at(-1)?.state ?? 'New';
  for (const pr of p.prs) {
    if (stateAt(pr.openAt) === 'Active') ev.push({ t: pr.openAt, fn: (b) => b.column(p.id, 'Code Review') });
    ev.push({ t: pr.openAt, fn: (b) => b.pr(pr.id, { repo: pr.repo, author: pr.author, title: pr.title, links: [p.id] }) });
    ev.push({ t: pr.openAt, fn: (b) => b.prStats(pr.id, prStatsFor(pr, roster)) });
    if (pr.outcome === 'merged') ev.push({ t: pr.endAt!, fn: (b) => b.completePr(pr.id, { approvedBy: pr.reviewers }) });
    if (pr.outcome === 'abandoned') ev.push({ t: pr.endAt!, fn: (b) => b.abandonPr(pr.id) });
  }
  return ev;
}

/** Replay events in time order (ties keep their emitted order). */
export function replay(b: B, events: Ev[]): B {
  events.map((e, i) => ({ e, i })).sort((x, y) => x.e.t - y.e.t || x.i - y.i).forEach(({ e }) => { b.at(iso(e.t)); e.fn(b); });
  return b;
}

// ---- Laying items out along a person's sprint ---------------------------------------------------

/** Window `i` of `n` for one person: consecutive, each overlapping the one before. */
export function windowFor(i: number, n: number): { a: number; b: number } {
  const w = HORIZON / n;
  return { a: Math.max(0, i * w - (i > 0 ? 0.35 * w : 0)), b: (i + 1) * w };
}

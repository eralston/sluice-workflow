// Request activity (decided 2026-10-07): the status bar's abacus of chips, one per kind of work, with
// a bead per call, and the panel's lists. A pure reducer over the events main sends, so it unit-tests.
import { isQuiet, type NetError } from './contracts/neterror';

export type ActivityEvent =
  | { phase: 'start'; id: number; family: string; at: number }
  | { phase: 'end'; id: number; family: string; at: number; status: number; ms: number; attempts: number }
  | { phase: 'fail'; id: number; family: string; at: number; status: number; ms: number; net?: NetError }
  | { phase: 'throttle'; id: number; family: string; at: number; waitMs: number };

/** What each kind of work is called: fixed app phrases, never data. */
export const PHRASES: Record<string, { phrase: string; icon: string }> = {
  org: { phrase: 'Signing in', icon: '⚿' },
  projects: { phrase: 'Listing projects', icon: '◎' },
  areas: { phrase: 'Reading Area Paths', icon: '◇' },
  wiql: { phrase: 'Finding work items', icon: '⌕' },
  recent: { phrase: 'Finding your recent work', icon: '⌕' },
  items: { phrase: 'Reading work items', icon: '✦' },
  history: { phrase: 'Reading history', icon: '⟲' },
  states: { phrase: 'Reading states', icon: '▤' },
  repos: { phrase: 'Listing repositories', icon: '⌂' },
  prs: { phrase: 'Reading pull requests', icon: '▸' },
  review: { phrase: 'Reading reviews', icon: '✓' },
  builds: { phrase: 'Reading pipeline runs', icon: '⚙' },
  iterations: { phrase: 'Reading sprints', icon: '◷' },
  teams: { phrase: 'Reading team settings', icon: '⚑' },
  avatar: { phrase: 'Fetching pictures', icon: '◐' },
};
export const phraseOf = (family: string) => PHRASES[family] ?? { phrase: 'Talking to ADO', icon: '•' };

/** A finished success lingers this long (its ✓), then the chip departs. */
export const LINGER_MS = 1500;
/** A chip shows its phrase once its burst has run this long. */
export const PHRASE_AFTER_MS = 800;
const RECENT_MAX = 50;

export interface Call { id: number; family: string; startedAt: number; endedAt?: number; status?: number; ms?: number; attempts?: number; ok?: boolean; net?: NetError; waitUntil?: number }
/**
 * `quiet`: expected, and not worth worrying anyone about (decided 2026-10-09). It stays in the list —
 * the panel shows it with its full details — but never turns the indicator into an error. See `isQuiet`.
 */
export interface ActivityError { id: number; family: string; at: number; status: number; net?: NetError; quiet?: boolean }

export { isQuiet };

/** The errors that should worry someone: everything but the quiet ones. */
export const loudErrors = (s: ActivityState): ActivityError[] => s.errors.filter((e) => !e.quiet);
export interface ActivityState { active: Map<number, Call>; recent: Call[]; errors: ActivityError[] }

export const emptyActivity = (): ActivityState => ({ active: new Map(), recent: [], errors: [] });

export function reduce(s: ActivityState, e: ActivityEvent): ActivityState {
  const active = new Map(s.active);
  if (e.phase === 'start') {
    active.set(e.id, { id: e.id, family: e.family, startedAt: e.at });
    return { ...s, active };
  }
  if (e.phase === 'throttle') {
    const c = active.get(e.id);
    if (c) active.set(e.id, { ...c, waitUntil: e.at + e.waitMs });
    return { ...s, active };
  }
  const c = active.get(e.id) ?? { id: e.id, family: e.family, startedAt: e.at - e.ms };
  active.delete(e.id);
  const done: Call = { ...c, endedAt: e.at, status: e.status, ms: e.ms, ok: e.phase === 'end' && e.status < 400, ...(e.phase === 'end' ? { attempts: e.attempts } : {}), ...(e.phase === 'fail' && e.net ? { net: e.net } : {}), waitUntil: undefined };
  const recent = [done, ...s.recent].slice(0, RECENT_MAX);
  // A failure stays as an error chip until dismissed. (Quiet skips, 403/404 on PRs, are failures too:
  // they show in the panel's recent list, but only other failures become sticky errors.)
  const errors = !done.ok && !(e.phase === 'end' && e.status < 400) && !(done.family === 'prs' || done.family === 'review' || done.family === 'builds') ? [...s.errors, { id: e.id, family: e.family, at: e.at, status: e.status, ...(done.net ? { net: done.net } : {}), ...(isQuiet(e.family, e.status) ? { quiet: true } : {}) }] : s.errors;
  return { active, recent, errors };
}

export function dismiss(s: ActivityState, id: number | 'all'): ActivityState {
  return { ...s, errors: id === 'all' ? [] : s.errors.filter((x) => x.id !== id) };
}

export interface Chip { family: string; phrase: string; icon: string; active: number; done: number; failed: number; since: number; showPhrase: boolean; waitingMs: number | null; settled: boolean }

/** The chips at `now`: a family with calls in flight, or finished within LINGER_MS, or with errors. Errors first. */
export function chips(s: ActivityState, now: number): Chip[] {
  const by = new Map<string, Chip>();
  const chip = (family: string): Chip => {
    let c = by.get(family);
    if (!c) { const p = phraseOf(family); c = { family, ...p, active: 0, done: 0, failed: 0, since: now, showPhrase: false, waitingMs: null, settled: false }; by.set(family, c); }
    return c;
  };
  for (const call of s.active.values()) {
    const c = chip(call.family);
    c.active++;
    c.since = Math.min(c.since, call.startedAt);
    if (call.waitUntil && call.waitUntil > now) c.waitingMs = Math.max(c.waitingMs ?? 0, call.waitUntil - now);
  }
  for (const call of s.recent) {
    if (!call.endedAt || now - call.endedAt > LINGER_MS) continue;
    const c = by.get(call.family) ?? (call.ok ? chip(call.family) : undefined);
    if (!c) continue;
    if (call.ok) c.done++;
    c.since = Math.min(c.since, call.startedAt);
  }
  for (const e of s.errors) if (!e.quiet) chip(e.family).failed++; // a quiet one isn't a failure to show
  for (const c of by.values()) {
    c.showPhrase = now - c.since >= PHRASE_AFTER_MS || c.failed > 0 || c.waitingMs !== null;
    c.settled = c.active === 0;
  }
  return [...by.values()].sort((a, b) => b.failed - a.failed || a.since - b.since);
}

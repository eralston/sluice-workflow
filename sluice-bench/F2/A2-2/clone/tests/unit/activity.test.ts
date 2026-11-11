// Request activity (decided 2026-10-07): which failures count as trouble. A picture is a visual
// nice-to-have, not data: when ADO won't give us one (a 401 because the PAT can't read other people's
// pictures, or a 404 because there isn't one we can see) it's predictable and nothing to worry about
// (decided 2026-10-09). Those stay in the list but never mark the indicator. 06 §5.
import { describe, expect, it } from 'vitest';
import { chips, dismiss, emptyActivity, isQuiet, loudErrors, reduce, type ActivityEvent, type ActivityState } from '@shared/activity';
import { classify, refusesToken } from '@shared/contracts/neterror';
import { resolve } from 'node:path';

// The renderer's pure watch, loaded by path as the other renderer tests do (it isn't in the node project).
interface GatherModule {
  GATHER_STALL_MS: number; GATHER_STOP_GRACE_MS: number;
  gatherStalled(w: { streaming: boolean; stoppedAt: number | null; active: number; lastEndedAt: number | null; now: number }): boolean;
}
const { GATHER_STALL_MS, GATHER_STOP_GRACE_MS, gatherStalled } = (await import(/* @vite-ignore */ resolve(__dirname, '../../src/renderer/src/gather.ts'))) as GatherModule;

let id = 0;
/** One call that started and then failed with `status`. */
function fail(s: ActivityState, family: string, status: number): ActivityState {
  const n = ++id;
  const start: ActivityEvent = { phase: 'start', id: n, family, at: 1000 };
  const end: ActivityEvent = { phase: 'fail', id: n, family, at: 1100, status, ms: 100 };
  return reduce(reduce(s, start), end);
}

describe('quiet failures', () => {
  it('a picture that is refused or missing is expected; nothing else is', () => {
    expect(isQuiet('avatar', 401)).toBe(true);
    expect(isQuiet('avatar', 404)).toBe(true);
    // Anything else wrong with a picture is still trouble.
    expect(isQuiet('avatar', 403)).toBe(false);
    expect(isQuiet('avatar', 429)).toBe(false);
    expect(isQuiet('avatar', 500)).toBe(false);
    expect(isQuiet('avatar', 0)).toBe(false); // no response at all: that's the connection
    // A team's settings refused is quiet too: the app carries on without them.
    expect(isQuiet('teams', 401)).toBe(true);
    expect(isQuiet('teams', 403)).toBe(false);
    expect(isQuiet('teams', 500)).toBe(false);
    // And the same statuses on real data are not quiet.
    for (const family of ['items', 'wiql', 'history', 'prs', 'repos']) {
      expect(isQuiet(family, 401)).toBe(false);
      expect(isQuiet(family, 404)).toBe(false);
    }
  });

  it.each([401, 404])('a %i stays in the list, with its details, but is not loud', (status) => {
    let s = fail(emptyActivity(), 'avatar', status);
    expect(s.errors).toHaveLength(1); // the panel can show it
    expect(s.errors[0]!.quiet).toBe(true);
    expect(loudErrors(s)).toHaveLength(0); // the indicator can't see it
    expect(s.recent[0]!.ok).toBe(false); // and it's still a failure in the recent list
    s = fail(s, 'avatar', status);
    expect(s.errors).toHaveLength(2);
    expect(loudErrors(s)).toHaveLength(0);
  });

  it('a mix of 401s and 404s is all quiet', () => {
    const s = fail(fail(fail(emptyActivity(), 'avatar', 401), 'avatar', 404), 'avatar', 401);
    expect(s.errors).toHaveLength(3);
    expect(loudErrors(s)).toHaveLength(0);
    expect(chips(s, 1200).every((c) => c.failed === 0)).toBe(true);
  });

  it.each([403, 429, 500, 503, 0])('a picture failing with %i still counts', (status) => {
    const s = fail(emptyActivity(), 'avatar', status);
    expect(s.errors[0]!.quiet).toBeUndefined();
    expect(loudErrors(s)).toHaveLength(1);
    expect(chips(s, 1200).find((c) => c.family === 'avatar')!.failed).toBe(1);
  });

  it('cannot hide a real expired token or a deleted item: those fail other families, and those are loud', () => {
    let s = fail(emptyActivity(), 'avatar', 401);
    s = fail(s, 'avatar', 404);
    s = fail(s, 'wiql', 401);
    s = fail(s, 'items', 401);
    s = fail(s, 'history', 404);
    expect(s.errors).toHaveLength(5);
    expect(loudErrors(s).map((e) => e.family).sort()).toEqual(['history', 'items', 'wiql']);
    expect(chips(s, 1200).filter((c) => c.failed > 0).map((c) => c.family).sort()).toEqual(['history', 'items', 'wiql']);
  });

  it('is dismissed like any other error', () => {
    let s = fail(emptyActivity(), 'avatar', 401);
    s = fail(s, 'avatar', 401);
    expect(dismiss(s, s.errors[0]!.id).errors).toHaveLength(1);
    expect(dismiss(s, 'all').errors).toHaveLength(0);
  });
});

describe('how an expected picture failure is explained', () => {
  it('a 401 says nothing is wrong, rather than telling you to replace a working token', () => {
    const c = classify({ status: 401, family: 'avatar' });
    expect(c.label).toBe('401 · Pictures not readable');
    expect(c.meaning).not.toMatch(/expired|revoked/);
    expect(c.advice).not.toMatch(/new personal access token/);
    expect(c.advice).toMatch(/Nothing to fix/);
  });

  it('a 404 says there is no picture we can see, rather than that something was deleted', () => {
    const c = classify({ status: 404, family: 'avatar' });
    expect(c.label).toBe('404 · No picture');
    expect(c.meaning).not.toMatch(/deleted|moved/);
    expect(c.advice).not.toMatch(/Refresh the project list/);
    expect(c.advice).toMatch(/Nothing to fix/);
  });

  it('a real 401 on anything else still says to replace the token', () => {
    for (const family of ['wiql', 'items', 'history', 'projects']) {
      const c = classify({ status: 401, family });
      expect(c.label).toBe('401 · Not signed in');
      expect(c.advice).toMatch(/new personal access token/);
    }
  });

  it('a real 404 on anything else is still "not found"', () => {
    for (const family of ['items', 'history', 'prs']) expect(classify({ status: 404, family }).label).toBe('404 · Not found');
  });

  it('a picture failing some other way is explained as that, not as the quiet case', () => {
    expect(classify({ status: 500, family: 'avatar' }).label).toMatch(/Server error/);
    expect(classify({ status: 403, family: 'avatar' }).label).toBe('403 · Denied');
  });
});

describe('history that has stopped short (decided 2026-10-22)', () => {
  const base = { streaming: true, stoppedAt: null, active: 0, lastEndedAt: 1000, now: 1000 };
  it('while the stream runs: stalled only after a long silence with nothing in flight', () => {
    expect(gatherStalled(base)).toBe(false);
    expect(gatherStalled({ ...base, now: 1000 + GATHER_STALL_MS })).toBe(false);
    expect(gatherStalled({ ...base, now: 1001 + GATHER_STALL_MS })).toBe(true);
    expect(gatherStalled({ ...base, active: 1, now: 99_000 })).toBe(false); // a request is out: not stalled
    expect(gatherStalled({ ...base, lastEndedAt: null, now: 99_000 })).toBe(false); // nothing has happened yet
  });
  it('once the stream has ended with history missing: stopped after a short grace, not at the instant it ends', () => {
    const ended = { ...base, streaming: false, stoppedAt: 5000 };
    expect(gatherStalled({ ...ended, now: 5000 })).toBe(false); // the last bundle is still loading
    expect(gatherStalled({ ...ended, now: 5000 + GATHER_STOP_GRACE_MS - 1 })).toBe(false);
    expect(gatherStalled({ ...ended, now: 5000 + GATHER_STOP_GRACE_MS })).toBe(true);
    expect(gatherStalled({ ...ended, stoppedAt: null })).toBe(false); // not yet seen stopped
  });
});

describe('what says the token is refused (decided 2026-10-22)', () => {
  it('a 401 where it stops the work does; the quiet picture 401 and a team’s settings do not', () => {
    for (const family of ['org', 'projects', 'items', 'history', 'wiql', 'repos', 'areas', 'iterations']) expect(refusesToken(family, 401), family).toBe(true);
    expect(refusesToken('avatar', 401)).toBe(false); // pictures a token can't read: expected
    expect(refusesToken('teams', 401)).toBe(false); // the app carries on without a team's settings
  });
  it('only a 401: other refusals and failures are not the token', () => {
    for (const status of [0, 400, 403, 404, 429, 500, 503]) expect(refusesToken('items', status), String(status)).toBe(false);
  });
  it('a team’s 401 is explained as that, not as an expired token', () => {
    const c = classify({ status: 401, family: 'teams' });
    expect(c.label).toBe('401 · Team settings not readable');
    expect(c.meaning).toContain('team’s settings');
    expect(c.meaning).not.toMatch(/expired|revoked/);
    expect(classify({ status: 401, family: 'items' }).meaning).toContain('expired'); // everything else still says so
  });
});

// 04 §1a, 23 E5: the Azure CLI sign-in. Parsing `az account get-access-token`, the refresh timing, the
// failures (missing, not logged in, garbage), and the transport's Bearer header and once-only re-fetch
// on a 401. The token below is the canary (INV-17); no real `az` is run.
import { describe, expect, it } from 'vitest';
import { ADO_RESOURCE, AzSession, azLoggedIn, fetchAzToken, parseAzToken, refreshDelayMs, type AzExec, type AzTimers } from '../../src/main/credentials/azCli';
import { HttpTransport } from '../../src/main/ado/http';

const CANARY = 'CANARY-AZ-TOKEN-7d1f-not-a-real-token';
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const json = (o: object) => JSON.stringify(o);

describe('parseAzToken', () => {
  it('reads expires_on (epoch seconds) first', () => {
    expect(parseAzToken(json({ accessToken: CANARY, expires_on: 1_800_000_000, expiresOn: '2020-01-01 00:00:00.000000' }), NOW)).toEqual({ token: CANARY, expiresAtMs: 1_800_000_000_000 });
  });
  it('reads expiresOn (local time) when there is no expires_on', () => {
    const t = parseAzToken(json({ accessToken: CANARY, expiresOn: '2026-10-28 13:30:15.123456' }), NOW)!;
    expect(t.expiresAtMs).toBe(new Date(2026, 9, 28, 13, 30, 15).getTime());
  });
  it('treats an unreadable expiry as an hour', () => {
    expect(parseAzToken(json({ accessToken: CANARY }), NOW)!.expiresAtMs).toBe(NOW + 3_600_000);
    expect(parseAzToken(json({ accessToken: CANARY, expiresOn: 'soon' }), NOW)!.expiresAtMs).toBe(NOW + 3_600_000);
  });
  it('refuses anything without a token', () => {
    for (const bad of ['', 'not json', '[]', 'null', json({}), json({ accessToken: '' }), json({ accessToken: 5 })]) expect(parseAzToken(bad, NOW)).toBeNull();
  });
});

describe('refreshDelayMs', () => {
  it('is before expiry, and never a tight loop', () => {
    expect(refreshDelayMs(NOW + 3_600_000, NOW)).toBe(3_300_000);
    expect(refreshDelayMs(NOW + 10_000, NOW)).toBe(60_000);
    expect(refreshDelayMs(NOW - 5_000, NOW)).toBe(60_000);
  });
});

const ok = (expires = NOW / 1000 + 3600): AzExec => async () => ({ code: 0, stdout: json({ accessToken: CANARY, expires_on: expires }) });

describe('fetchAzToken and azLoggedIn', () => {
  it('asks for ADO’s resource with a fixed argument list', async () => {
    const seen: string[][] = [];
    await fetchAzToken(async (a) => { seen.push(a); return { code: 0, stdout: json({ accessToken: CANARY }) }; }, NOW);
    expect(seen[0]).toEqual(['account', 'get-access-token', '--resource', ADO_RESOURCE, '--output', 'json']);
    expect(ADO_RESOURCE).toBe('499b84ac-1321-427f-aa17-267ca6975798');
  });
  it('names the failures without carrying the CLI’s output', async () => {
    expect(await fetchAzToken(async () => ({ code: 'ENOENT', stdout: '' }), NOW)).toEqual({ ok: false, reason: 'missing' });
    expect(await fetchAzToken(async () => ({ code: 1, stdout: '' }), NOW)).toEqual({ ok: false, reason: 'not-logged-in' });
    expect(await fetchAzToken(async () => ({ code: 'timeout', stdout: '' }), NOW)).toEqual({ ok: false, reason: 'error' });
    expect(await fetchAzToken(async () => ({ code: 0, stdout: 'garbage' }), NOW)).toEqual({ ok: false, reason: 'error' });
  });
  it('is available only when az answers account show', async () => {
    expect(await azLoggedIn(async () => ({ code: 0, stdout: '' }))).toEqual({ available: true });
    expect(await azLoggedIn(async () => ({ code: 'ENOENT', stdout: '' }))).toEqual({ available: false, reason: 'missing' });
    expect(await azLoggedIn(async () => ({ code: 1, stdout: '' }))).toEqual({ available: false, reason: 'not-logged-in' });
  });
});

/** Timers that run on demand. */
function manual() {
  const pending: { fn: () => void; ms: number; id: number }[] = [];
  let n = 0;
  const timers: AzTimers = { set: (fn, ms) => { pending.push({ fn, ms, id: ++n }); return n; }, clear: (h) => { const i = pending.findIndex((p) => p.id === h); if (i >= 0) pending.splice(i, 1); } };
  return { timers, pending };
}

describe('AzSession', () => {
  it('signs in, schedules a refresh before expiry, and swaps the token when it fires', async () => {
    let clock = NOW;
    let calls = 0;
    const exec: AzExec = async () => ({ code: 0, stdout: json({ accessToken: `${CANARY}-${++calls}`, expires_on: (clock + 3_600_000) / 1000 }) });
    const m = manual();
    const s = new AzSession(exec, () => clock, m.timers);
    expect((await s.start()).ok).toBe(true);
    expect(s.token()).toBe(`${CANARY}-1`);
    expect(m.pending).toHaveLength(1);
    expect(m.pending[0]!.ms).toBe(3_300_000);
    clock += 3_300_000;
    m.pending.shift()!.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.token()).toBe(`${CANARY}-2`);
    expect(m.pending).toHaveLength(1); // the next refresh
  });
  it('keeps the old token and tries again in a minute when a refresh fails', async () => {
    const clock = NOW;
    let fail = false;
    const exec: AzExec = async () => (fail ? { code: 1, stdout: '' } : { code: 0, stdout: json({ accessToken: CANARY, expires_on: (clock + 3_600_000) / 1000 }) });
    const m = manual();
    const s = new AzSession(exec, () => clock, m.timers);
    await s.start();
    fail = true;
    m.pending.shift()!.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.token()).toBe(CANARY);
    expect(m.pending.map((p) => p.ms)).toEqual([60_000]);
  });
  it('a failed start installs nothing; stop clears the token and the timer', async () => {
    const m = manual();
    const bad = new AzSession(async () => ({ code: 1, stdout: '' }), () => NOW, m.timers);
    expect(await bad.start()).toEqual({ ok: false, reason: 'not-logged-in' });
    expect(bad.active).toBe(false);
    const s = new AzSession(ok(), () => NOW, m.timers);
    await s.start();
    s.stop();
    expect(s.token()).toBeNull();
    expect(m.pending).toHaveLength(0);
  });
  it('re-fetches on request, but not in a loop', async () => {
    let clock = NOW;
    let calls = 0;
    const exec: AzExec = async () => ({ code: 0, stdout: json({ accessToken: `t${++calls}`, expires_on: (clock + 3_600_000) / 1000 }) });
    const s = new AzSession(exec, () => clock, manual().timers);
    await s.start();
    expect(await s.refetch()).toBe(false); // just fetched
    clock += 30_000;
    expect(await s.refetch()).toBe(true);
    expect(s.token()).toBe('t2');
  });
});

describe('the transport with an Azure CLI token', () => {
  const url = 'https://dev.azure.com/contoso/_apis/connectionData';
  it('sends it as Bearer, never Basic', async () => {
    const auth: string[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => { auth.push((init.headers as Record<string, string>).Authorization!); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    const t = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => CANARY, scheme: () => 'bearer', fetch: fetchFn });
    await t.send({ method: 'GET', url });
    expect(auth).toEqual([`Bearer ${CANARY}`]);
    const basic = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => 'pat', fetch: fetchFn });
    await basic.send({ method: 'GET', url });
    expect(auth[1]).toBe(`Basic ${Buffer.from(':pat').toString('base64')}`);
  });
  it('re-fetches once on a 401 and retries; a second 401 is the dead-token answer', async () => {
    let token = 'old';
    const seen: string[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => {
      const a = (init.headers as Record<string, string>).Authorization!;
      seen.push(a);
      return new Response('{}', { status: a === 'Bearer new' ? 200 : 401 });
    }) as unknown as typeof fetch;
    let refreshes = 0;
    const t = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => token, scheme: () => 'bearer', fetch: fetchFn, refresh: async () => { refreshes++; token = 'new'; return true; } });
    expect((await t.send({ method: 'GET', url })).status).toBe(200);
    expect(seen).toEqual(['Bearer old', 'Bearer new']);
    // Still refused after the fresh token: one re-fetch only, then the 401 stands.
    token = 'old'; seen.length = 0; refreshes = 0;
    const stubborn = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => token, scheme: () => 'bearer', fetch: (async (_u: string, init: RequestInit) => { seen.push((init.headers as Record<string, string>).Authorization!); return new Response('{}', { status: 401 }); }) as unknown as typeof fetch, refresh: async () => { refreshes++; token = 'new'; return true; } });
    expect((await stubborn.send({ method: 'GET', url })).status).toBe(401);
    expect(refreshes).toBe(1);
    expect(seen).toEqual(['Bearer old', 'Bearer new']);
  });
});

describe('concurrent requests share one re-fetch', () => {
  it('a second 401 that arrives after the first’s refresh retries with the new token, no second fetch', async () => {
    let token = 'old';
    const seen: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    const fetchFn = (async (_u: string, init: RequestInit) => {
      const a = (init.headers as Record<string, string>).Authorization!;
      seen.push(a);
      if (a === 'Bearer old' && ++n === 2) await gate; // the second request's 401 comes back late
      return new Response('{}', { status: a === 'Bearer new' ? 200 : 401 });
    }) as unknown as typeof fetch;
    let refreshes = 0;
    const t = new HttpTransport({
      orgUrl: 'https://dev.azure.com/contoso', pat: () => token, scheme: () => 'bearer', fetch: fetchFn,
      refresh: async () => { refreshes++; token = 'new'; return true; },
    });
    const url = 'https://dev.azure.com/contoso/_apis/connectionData';
    const a = t.send({ method: 'GET', url });
    const b = t.send({ method: 'GET', url });
    expect((await a).status).toBe(200);
    release();
    expect((await b).status).toBe(200);
    expect(refreshes).toBe(1);
    expect(seen.filter((x) => x === 'Bearer new')).toHaveLength(2);
  });
});

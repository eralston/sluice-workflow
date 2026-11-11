// 04 §1a — signing in with the Azure CLI. `az account get-access-token --resource <ADO>` gives a
// short-lived Entra token for Azure DevOps. It is held in memory only: never written to the Keychain,
// the cache or any log (INV-17), and never returned to the renderer. `az` is run with execFile (no shell),
// a fixed argument list and a timeout; whatever it prints is parsed and dropped, never logged or shown.
import { execFile } from 'node:child_process';

/** Azure DevOps' Entra resource id (the same for every org). */
export const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';
const AZ_TIMEOUT_MS = 15_000;
const AZ_MAX_OUTPUT = 64 * 1024;
/** A GUI app on macOS starts with a short PATH; these are where Homebrew puts `az`. */
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin'];
/** Refresh this long before the token expires, but not sooner than MIN_REFRESH_MS from now. */
const REFRESH_MARGIN_MS = 5 * 60_000;
const MIN_REFRESH_MS = 60_000;
/** A token with no readable expiry is treated as an hour's (az's usual). */
const DEFAULT_LIFE_MS = 60 * 60_000;
/** A 401 asks for a fresh token, but not more often than this: a second 401 is then a dead token. */
const REFETCH_GAP_MS = 20_000;

export interface AzToken { token: string; expiresAtMs: number }
export type AzFailure = 'missing' | 'not-logged-in' | 'error';
export type AzResult = { ok: true; value: AzToken } | { ok: false; reason: AzFailure };

/** Reads `az account get-access-token`'s JSON. `expires_on` (epoch seconds) is newer; `expiresOn` is local time. */
export function parseAzToken(stdout: string, nowMs: number): AzToken | null {
  let o: unknown;
  try { o = JSON.parse(stdout); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const token = r.accessToken;
  if (typeof token !== 'string' || !token.trim()) return null;
  let expiresAtMs = NaN;
  const secs = typeof r.expires_on === 'number' ? r.expires_on : typeof r.expires_on === 'string' && /^\d+$/.test(r.expires_on) ? Number(r.expires_on) : NaN;
  if (Number.isFinite(secs)) expiresAtMs = secs * 1000;
  else if (typeof r.expiresOn === 'string') {
    const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(r.expiresOn);
    if (m) expiresAtMs = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!).getTime();
  }
  if (!Number.isFinite(expiresAtMs)) expiresAtMs = nowMs + DEFAULT_LIFE_MS;
  return { token: token.trim(), expiresAtMs };
}

/** When to fetch the next token: before expiry, never in a tight loop. */
export function refreshDelayMs(expiresAtMs: number, nowMs: number): number {
  return Math.max(MIN_REFRESH_MS, expiresAtMs - nowMs - REFRESH_MARGIN_MS);
}

export type AzExec = (args: string[]) => Promise<{ code: number | 'ENOENT' | 'timeout'; stdout: string }>;

/** Runs `az` for real: execFile (no shell), a fixed argument list, a timeout. */
export const execAz: AzExec = (args) => new Promise((resolve) => {
  // Test runs never reach the developer's own `az`: only a directory the test supplies, else it is missing.
  const test = process.env.STAR_CHART_TEST === '1';
  const dir = process.env.STAR_CHART_TEST_AZ_DIR;
  if (test && !dir) { resolve({ code: 'ENOENT', stdout: '' }); return; }
  const env = { ...process.env, PATH: test ? `${dir}:/usr/bin:/bin` : [process.env.PATH ?? '', ...EXTRA_PATH].filter(Boolean).join(':'), AZURE_CORE_ONLY_SHOW_ERRORS: 'true', AZURE_CORE_NO_COLOR: 'true' };
  execFile('az', args, { timeout: AZ_TIMEOUT_MS, maxBuffer: AZ_MAX_OUTPUT, env, shell: false, windowsHide: true }, (err, stdout) => {
    if (!err) { resolve({ code: 0, stdout: String(stdout) }); return; }
    const e = err as NodeJS.ErrnoException & { killed?: boolean };
    if (e.code === 'ENOENT') resolve({ code: 'ENOENT', stdout: '' });
    else if (e.killed) resolve({ code: 'timeout', stdout: '' });
    else resolve({ code: typeof e.code === 'number' ? e.code : 1, stdout: '' });
  });
});

/** Whether `az` is on the PATH and logged in (no token is read). */
export async function azLoggedIn(exec: AzExec = execAz): Promise<{ available: boolean; reason?: AzFailure }> {
  const r = await exec(['account', 'show', '--output', 'none']);
  if (r.code === 0) return { available: true };
  return { available: false, reason: r.code === 'ENOENT' ? 'missing' : r.code === 'timeout' ? 'error' : 'not-logged-in' };
}

/** Fetches a token. Exit codes and output other than the JSON are never kept. */
export async function fetchAzToken(exec: AzExec = execAz, nowMs = Date.now()): Promise<AzResult> {
  const r = await exec(['account', 'get-access-token', '--resource', ADO_RESOURCE, '--output', 'json']);
  if (r.code === 'ENOENT') return { ok: false, reason: 'missing' };
  if (r.code === 'timeout') return { ok: false, reason: 'error' };
  if (r.code !== 0) return { ok: false, reason: 'not-logged-in' };
  const value = parseAzToken(r.stdout, nowMs);
  return value ? { ok: true, value } : { ok: false, reason: 'error' };
}

export interface AzTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realTimers: AzTimers = {
  set: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; },
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** The signed-in Azure CLI token, in memory, refreshed before it expires. */
export class AzSession {
  private current: AzToken | null = null;
  private timer: unknown = null;
  private fetchedAt = 0;
  private flight: Promise<boolean> | null = null;
  constructor(
    private readonly exec: AzExec = execAz,
    private readonly now: () => number = Date.now,
    private readonly timers: AzTimers = realTimers,
  ) {}

  get active(): boolean { return this.current !== null; }
  token(): string | null { return this.current?.token ?? null; }
  expiresAt(): number | null { return this.current?.expiresAtMs ?? null; }

  /** Signs in: fetches a token and starts the refresh timer. */
  async start(): Promise<AzResult> {
    const r = await fetchAzToken(this.exec, this.now());
    if (r.ok) this.install(r.value);
    return r;
  }

  snapshot(): AzToken | null { return this.current ? { ...this.current } : null; }
  restore(s: AzToken | null): void { if (s) this.install(s); else this.stop(); }

  stop(): void {
    this.current = null;
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  /** A fresh token now (a 401 with this token). False if az failed or was asked too recently to try again. */
  refetch(): Promise<boolean> {
    if (!this.current) return Promise.resolve(false);
    if (this.flight) return this.flight;
    if (this.now() - this.fetchedAt < REFETCH_GAP_MS) return Promise.resolve(false);
    this.flight = fetchAzToken(this.exec, this.now()).then((r) => {
      if (r.ok && this.current) { this.install(r.value); return true; }
      return false;
    }).finally(() => { this.flight = null; });
    return this.flight;
  }

  private install(t: AzToken): void {
    this.current = t;
    this.fetchedAt = this.now();
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => { void this.refreshOnTimer(); }, refreshDelayMs(t.expiresAtMs, this.now()));
  }

  /** The hourly refresh. A failure keeps the old token (ADO then refuses it, the dead-token path) and tries again in a minute. */
  private async refreshOnTimer(): Promise<void> {
    if (!this.current) return;
    const r = await fetchAzToken(this.exec, this.now());
    if (!this.current) return; // signed out meanwhile
    if (r.ok) this.install(r.value);
    else this.timer = this.timers.set(() => { void this.refreshOnTimer(); }, MIN_REFRESH_MS);
  }
}

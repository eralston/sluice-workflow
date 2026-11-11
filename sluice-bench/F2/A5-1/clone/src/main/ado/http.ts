// 04 §§1, 6 — the real transport. Main is the only process that calls ADO, and only the org's own
// origin and path (the allowlist). The PAT goes out as HTTP Basic with an empty user name; headers are
// never logged (INV-17). At most 4 requests in flight; 429/503 honor Retry-After, else back off with
// full jitter (base 1 s, cap 60 s).
import type { AdoRequest, AdoResponse, Transport } from '@shared/contracts/transport';
import { devlog } from '../devlog';
import { activity } from '../activity';
import { throttleGate } from '../sync/scheduler';

export interface HttpOptions {
  orgUrl: string;
  pat: () => string | null;
  /** How the token is sent: Basic with an empty user name (a PAT, the default) or Bearer (an Azure CLI token, 04 §1a). */
  scheme?: () => 'basic' | 'bearer';
  /** A 401 with an Azure CLI token asks for a fresh one, once; true if it got one (04 §1a). */
  refresh?: () => Promise<boolean>;
  fetch?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  maxInFlight?: number;
  maxRetries?: number;
}

const BASE_MS = 1000;
const CAP_MS = 60_000;
/** Below this many remaining TSTUs, pause briefly before the next call (04 §6). */
const LOW_REMAINING = 20;

export const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal!.reason); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * The org's identity host, where Graph lives (pictures: 04 §7): `vssps.dev.azure.com/{org}` for a
 * `dev.azure.com` org, `{org}.vssps.visualstudio.com` for a legacy one. Null for anything else (a
 * server on premises has no such host).
 */
export function vsspsBaseOf(orgUrl: string): string | null {
  try {
    const org = new URL(orgUrl);
    if (org.protocol !== 'https:') return null;
    if (org.hostname === 'dev.azure.com') return `https://vssps.dev.azure.com${org.pathname.replace(/\/+$/, '')}`;
    const legacy = /^([a-z0-9-]+)\.visualstudio\.com$/i.exec(org.hostname);
    return legacy ? `https://${legacy[1]}.vssps.visualstudio.com` : null;
  } catch {
    return null;
  }
}

/** The org's origin and path prefix, `https://dev.azure.com/{org}/`, and (for the transport, not for opening pages) its identity host's. Anything else is refused. */
export function allowlist(orgUrl: string, withIdentityHost = true): (url: string) => boolean {
  const prefixes = [orgUrl, withIdentityHost ? vsspsBaseOf(orgUrl) : null].flatMap((base) => {
    if (!base) return [];
    const u = new URL(base);
    return [{ origin: u.origin, prefix: `${u.pathname.replace(/\/+$/, '')}/` }];
  });
  return (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && !u.username && !u.password && prefixes.some((p) => u.origin === p.origin && u.pathname.startsWith(p.prefix));
    } catch {
      return false;
    }
  };
}

/** Delay before retry `attempt` (0-based): Retry-After when given, else full jitter. */
export function retryDelay(attempt: number, retryAfter: string | undefined, random: () => number): number {
  const secs = retryAfter !== undefined ? Number(retryAfter) : NaN;
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, CAP_MS * 5);
  const date = retryAfter ? Date.parse(retryAfter) : NaN;
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), CAP_MS * 5));
  return random() * Math.min(CAP_MS, BASE_MS * 2 ** attempt);
}

/** Server errors that may pass, and how many times one is retried (slice 7, decided 2026-10-10). */
export const TRANSIENT_STATUS = new Set([500, 502, 504]);
export const TRANSIENT_RETRIES = 3;

export class HttpTransport implements Transport {
  private readonly allowed: (url: string) => boolean;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: NonNullable<HttpOptions['sleep']>;
  private readonly random: () => number;
  private readonly maxInFlight: number;
  private readonly maxRetries: number;
  private inFlight = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly opts: HttpOptions) {
    this.allowed = allowlist(opts.orgUrl);
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.random = opts.random ?? Math.random;
    this.maxInFlight = opts.maxInFlight ?? 4;
    this.maxRetries = opts.maxRetries ?? 6;
  }

  async send(req: AdoRequest, signal?: AbortSignal): Promise<AdoResponse> {
    if (!this.allowed(req.url)) throw new Error('Refused: not the connected org');
    if (!this.opts.pat()) return { status: 401, headers: {}, body: null };
    let refreshed = false;
    let waitedMs = 0;
    let transient = 0;
    for (let attempt = 0; ; attempt++) {
      let res: AdoResponse;
      let sent = null as string | null;
      try {
        // The token and its scheme are read together, when the request goes out (not before waiting for a slot).
        res = await this.slot(() => {
          sent = this.opts.pat();
          if (!sent) return Promise.resolve<AdoResponse>({ status: 401, headers: {}, body: null });
          return this.once(req, sent, this.opts.scheme?.() ?? 'basic', signal);
        }, signal);
      } catch (e) {
        // No response at all (a dropped connection, a timeout): retried a few times (slice 7,
        // decided 2026-10-10), never a cancellation.
        if (signal?.aborted || (e instanceof Error && e.name === 'AbortError') || transient >= TRANSIENT_RETRIES) throw e;
        const wait = retryDelay(transient++, undefined, this.random);
        waitedMs += wait;
        devlog.write('main', 'net-retry', { status: 0, attempt: transient, waitMs: Math.round(wait) });
        await this.sleep(wait, signal);
        continue;
      }
      // A server error that may pass (500, 502, 504): the same few retries, then the caller decides.
      if (TRANSIENT_STATUS.has(res.status) && transient < TRANSIENT_RETRIES) {
        const wait = retryDelay(transient++, undefined, this.random);
        waitedMs += wait;
        devlog.write('main', 'net-retry', { status: res.status, attempt: transient, waitMs: Math.round(wait) });
        await this.sleep(wait, signal);
        continue;
      }
      const throttled = res.status === 429 || res.status === 503 || /TF400733/.test(JSON.stringify(res.body ?? ''));
      if (throttled && attempt < this.maxRetries) {
        const wait = retryDelay(attempt, res.headers['retry-after'], this.random);
        waitedMs += wait;
        throttleGate.until = Math.max(throttleGate.until, Date.now() + wait); // the whole queue waits (decided 2026-10-08)
        devlog.write('main', 'net-throttle', { status: res.status, attempt: attempt + 1, waitMs: Math.round(wait), retryAfter: res.headers['retry-after'] ?? null });
        if (req.callId) activity.emit({ phase: 'throttle', id: req.callId, family: '', at: Date.now(), waitMs: Math.round(wait) });
        await this.sleep(wait, signal);
        continue;
      }
      if (res.status === 401 && !refreshed && this.opts.refresh) {
        refreshed = true; // once: a second 401 is a dead token (04 §6)
        // Another request may already have fetched a newer token while this one waited: use it, no fetch.
        const now = this.opts.pat();
        if (now && now !== sent) continue;
        if (await this.opts.refresh().catch(() => false) && this.opts.pat()) continue;
      }
      const remaining = Number(res.headers['x-ratelimit-remaining']);
      if (Number.isFinite(remaining) && remaining < LOW_REMAINING) await this.sleep(BASE_MS, signal);
      return { ...res, attempts: attempt + 1, waitedMs };
    }
  }

  private async slot<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    // A waiter whose request is cancelled leaves the line (decided 2026-10-08).
    while (this.inFlight >= this.maxInFlight) {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) { reject(signal.reason); return; }
        const go = () => { signal?.removeEventListener('abort', stop); resolve(); };
        const stop = () => { this.waiting = this.waiting.filter((w) => w !== go); reject(signal!.reason); };
        signal?.addEventListener('abort', stop, { once: true });
        this.waiting.push(go);
      });
    }
    this.inFlight++;
    try {
      return await fn();
    } finally {
      this.inFlight--;
      this.waiting.shift()?.();
    }
  }

  private async once(req: AdoRequest, pat: string, scheme: 'basic' | 'bearer', signal?: AbortSignal): Promise<AdoResponse> {
    const res = await this.fetchFn(req.url, {
      method: req.method,
      headers: {
        Authorization: scheme === 'bearer' ? `Bearer ${pat}` : `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
        Accept: req.binary ? 'image/*' : 'application/json',
        ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      redirect: 'manual', // a redirect could leave the allowlist with the PAT attached
      signal,
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let body: unknown = null;
    if (req.binary && res.ok) body = new Uint8Array(await res.arrayBuffer());
    else {
      const text = await res.text();
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }
      if (!res.ok) return { status: res.status, headers, body, text };
    }
    return { status: res.status, headers, body };
  }
}

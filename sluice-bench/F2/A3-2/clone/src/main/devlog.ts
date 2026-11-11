// The dev log (decided 2026-10-07): a rolling, redacted record of one launch, for analysing live-data
// behaviour after a session of clicking around. Developer runs only (never a packaged build, and not
// tests unless asked): logs/run-YYYYMMDD-HHMMSS.jsonl under the app path, the last 3 kept. Every entry
// passes the redactor (redact.ts) before it's written. No Electron imports, so it unit-tests in Node.
import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeRedactor, type Redactor } from './redact';

export const KEEP_RUNS = 3;
/** At most this many entries per second; a `devlog-throttled` entry records any dropped. */
const MAX_PER_SECOND = 200;

/**
 * Whether this launch logs. Developer runs do by default; tests only when asked. A packaged build logs
 * only when the user turned the diagnostic log on (`optIn`, slice 7, decided 2026-10-10).
 */
export function devLogEnabled(o: { packaged: boolean; test: boolean; env: Record<string, string | undefined>; optIn?: boolean }): boolean {
  if (o.env.STAR_CHART_DEVLOG === '0') return false;
  if (o.packaged) return o.optIn === true || (o.test && o.env.STAR_CHART_DEVLOG === '1');
  if (o.env.STAR_CHART_DEVLOG === '1') return true; // tests can ask
  return !o.test;
}

/** The file being written now, if any (for "Show log file"). */
export function currentLogFile(): string | null {
  return sink instanceof FileLog ? sink.file : null;
}

/** Keep the newest `keep - 1` earlier runs, so with this one there are `keep`. */
export function rotate(dir: string, keep = KEEP_RUNS): void {
  const runs = readdirSync(dir).filter((f) => /^run-\d{8}-\d{6}(-\d+)?\.jsonl$/.test(f))
    .map((f) => ({ f, at: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.at - a.at || (a.f < b.f ? 1 : -1));
  for (const { f } of runs.slice(Math.max(0, keep - 1))) rmSync(join(dir, f), { force: true });
}

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export interface DevLogSink {
  readonly on: boolean;
  write(src: 'main' | 'renderer', kind: string, fields?: Record<string, unknown>): void;
}

class FileLog implements DevLogSink {
  readonly on = true;
  private readonly started = Date.now();
  private second = 0;
  private count = 0;
  private dropped = 0;

  constructor(readonly file: string, private readonly redact: Redactor) {}

  write(src: 'main' | 'renderer', kind: string, fields: Record<string, unknown> = {}): void {
    const now = Date.now();
    const sec = Math.floor(now / 1000);
    if (sec !== this.second) {
      if (this.dropped) this.append({ t: now - this.started, at: new Date(now).toISOString(), src: 'main', kind: 'devlog-throttled', dropped: this.dropped });
      this.second = sec;
      this.count = 0;
      this.dropped = 0;
    }
    if (++this.count > MAX_PER_SECOND) { this.dropped++; return; }
    const entry = this.redact.entry({ kind, ...fields });
    this.append({ t: now - this.started, at: new Date(now).toISOString(), src, ...entry });
  }

  private append(o: Record<string, unknown>): void {
    try { appendFileSync(this.file, `${JSON.stringify(o)}\n`); } catch { /* a dev aid: never break the app */ }
  }
}

const OFF: DevLogSink = { on: false, write() {} };
let sink: DevLogSink = OFF;

/** The process-wide log: a no-op unless `startDevLog` turned it on. */
export const devlog: DevLogSink = {
  get on() { return sink.on; },
  write: (src, kind, fields) => sink.write(src, kind, fields),
};

export function startDevLog(dir: string, salt: Buffer, guard: () => string[]): string {
  mkdirSync(dir, { recursive: true });
  rotate(dir);
  let file = join(dir, `run-${stamp(new Date())}.jsonl`);
  for (let i = 1; existsSafe(file); i++) file = join(dir, `run-${stamp(new Date())}-${i}.jsonl`);
  const log = new FileLog(file, makeRedactor(salt, guard));
  sink = log;
  return file;
}

function existsSafe(f: string): boolean {
  try { statSync(f); return true; } catch { return false; }
}

/** For tests: turn the log off again. */
export function stopDevLog(): void {
  sink = OFF;
}

// Local working hours (05 §3): weekdays WORKDAY_START_HOUR to WORKDAY_END_HOUR in a time zone, read a
// quarter-hour at a time. The schedule weighs its gaps by them; story time measures an arc's reach in
// them (05 §8.3a B-12). Pure.
import type { UtcMs } from '../contracts/keys';
import { WORKDAY_END_HOUR, WORKDAY_START_HOUR } from './constants';

export const QUARTER_MS = 15 * 60_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
const working = new Map<string, boolean>();

/** Whether the quarter-hour starting at `q` (a quarter boundary) is inside working hours in `tz`. */
export function isWorkingQuarter(q: UtcMs, tz: string): boolean {
  const key = `${tz}|${q}`;
  let w = working.get(key);
  if (w !== undefined) return w;
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
    formatters.set(tz, f);
  }
  const parts = f.formatToParts(new Date(q + QUARTER_MS / 2));
  const day = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  w = day !== 'Sat' && day !== 'Sun' && hour >= WORKDAY_START_HOUR && hour < WORKDAY_END_HOUR;
  working.set(key, w);
  return w;
}

/** Working hours between two instants in `tz`: nights and weekends count for nothing. */
export function workingHours(a: UtcMs, b: UtcMs, tz: string): number {
  let total = 0;
  for (let t = a; t < b;) {
    const q = Math.floor(t / QUARTER_MS) * QUARTER_MS;
    const next = Math.min(q + QUARTER_MS, b);
    if (isWorkingQuarter(q, tz)) total += next - t;
    t = next;
  }
  return total / 3_600_000;
}

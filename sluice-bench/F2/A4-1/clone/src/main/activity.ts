// Request activity (decided 2026-10-07): every network call's start, end, failure, and throttle wait,
// sent to the window so it can show what's loading (the status-bar abacus). The same moments the dev
// log records; this stream carries only fixed phrases, families, and statuses, never names.
import type { ActivityEvent } from '@shared/activity';

let sink: ((e: ActivityEvent) => void) | null = null;
let seq = 0;

export const activity = {
  setSink(fn: ((e: ActivityEvent) => void) | null): void { sink = fn; },
  nextId(): number { return ++seq; },
  emit(e: ActivityEvent): void { sink?.(e); },
};

// B2: a station's pipeline line on its expanded plate, `Last run: passed · 2 h ago` (15 §6 `run-line`).
// The repository's latest run on its default branch, in the chart's neutral words. It is a state, not an
// event: guards stay idle art and nothing flares (13 §4.4, Q7). The tone is a neutral dot that is never red,
// never a hostile or ladder colour, and never the only carrier of the result (the words say it). Pure.
import type { RepoRun, RunState } from './contracts/facts';

/** A run as the history carries it: when it ran, and when it was read (`readAt`: its age counts to at least then). */
export type ReadRun = RepoRun & { readAt?: number };

/** The result in the chart's words. Partially succeeded and canceled are said as they are. */
export const RUN_WORD: Record<RunState, string> = {
  passed: 'passed', partly: 'partly passed', failed: 'failed', canceled: 'canceled', running: 'running', queued: 'queued',
};

/**
 * The dot's colour per result: two tones, clear of the signal ladder (blue, violet, gold and two greys, 15 §3), of every
 * hostile colourway (saturated, hue 320 to 40 degrees) and of red: soft green for a run that went through or is going,
 * and a light cool slate for one that did not. Failed is not red and not warm: a quiet slate beside the word.
 * The slate is a grey like the ladder's Ready and Off, but lighter than both, and a dot beside text rather than a rung
 * mark; the word and the dot's shape carry the result, never colour alone.
 */
export const RUN_DOT_HEX: Record<RunState, string> = {
  passed: '#6EDC82', partly: '#6EDC82', running: '#6EDC82', queued: '#6EDC82', failed: '#B4BCC9', canceled: '#B4BCC9',
};

/** The dot's shape, a different one for each result (INV-20: never colour alone). Failed is hollow. */
export const RUN_DOT_SHAPE: Record<RunState, 'full' | 'half' | 'ring' | 'dotted' | 'diamond' | 'bar'> = {
  passed: 'full', partly: 'half', running: 'ring', queued: 'dotted', failed: 'diamond', canceled: 'bar',
};

/**
 * A repository's run is read again when this much time has passed since it was last read: a run changes with no
 * sign on the PR side, and a read costs one call per station, so the line is kept fresh on the PR's cadence (a
 * refresh runs it) but never faster than this (04 §3 builds).
 */
export const RUN_REREAD_MS = 15 * 60_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long before the as-of time the run was, in the plate's words: `just now` (under a minute, or a run
 * stamped after the as-of time), `5 min ago`, `2 h ago` (to 48 hours), then `3 d ago`.
 * The as-of time is the scope's last sync (the clock the facts were read at), not the playhead: a run is current
 * state, like the PR votes, and does not rewind.
 */
export function runAgo(at: number, asOf: number): string {
  const d = asOf - at;
  if (d < MINUTE) return 'just now';
  if (d < HOUR) return `${Math.floor(d / MINUTE)} min ago`;
  if (d < 2 * DAY) return `${Math.floor(d / HOUR)} h ago`;
  return `${Math.floor(d / DAY)} d ago`;
}

/** The line, e.g. `Last run: partly passed · 3 h ago`. A run still going or waiting says when it started or queued. */
export const runLine = (run: RepoRun, asOf: number): string => `Last run: ${RUN_WORD[run.state]} · ${runAgo(run.at, asOf)}`;

/** The time a run's age counts to: the as-of time (the last sync), or when the run was read if that is later. */
export const runAsOf = (run: ReadRun, asOf: number): number => Math.max(asOf, run.readAt ?? 0);

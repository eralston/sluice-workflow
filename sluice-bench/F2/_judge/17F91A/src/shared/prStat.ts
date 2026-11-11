// B1: the PR stat line on a station's expanded plate (15 §6 `pr-stat`). One quiet T3 line under a PR
// row: current votes, pushes, threads and a size band, e.g. `✓ 2  ⧖ 1 · 4 pushes · 3 threads · M`.
// A fact the cache doesn't hold is left out, and a PR with none gets no line. It counts volume and
// never merit (INV-19), and votes are the standing ones only: no history, no events (INV-07). Pure.
import type { PrStats } from './contracts/facts';

/** Files changed up to this many: Small. */
export const PR_SIZE_SMALL_MAX = 5;
/** Files changed up to this many (and over `PR_SIZE_SMALL_MAX`): Medium. Over it: Large. */
export const PR_SIZE_MEDIUM_MAX = 20;

/** Vote glyphs, one shape each (INV-20). Approved with suggestions folds into approved. */
export const VOTE_GLYPH = { approved: '✓', waiting: '⧖', rejected: '✕' } as const;

export type SizeBand = 'S' | 'M' | 'L';

/** The size band of a change that touched `files` files. */
export const sizeBand = (files: number): SizeBand => (files <= PR_SIZE_SMALL_MAX ? 'S' : files <= PR_SIZE_MEDIUM_MAX ? 'M' : 'L');

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The stat line's text, or undefined when there is nothing to say. */
export function prStatLine(stats: PrStats | undefined): string | undefined {
  if (!stats) return undefined;
  const parts: string[] = [];
  const v = stats.votes;
  if (v) {
    const approved = (v.approved ?? 0) + (v.suggestions ?? 0);
    const votes = [
      approved > 0 ? `${VOTE_GLYPH.approved} ${approved}` : '',
      (v.waiting ?? 0) > 0 ? `${VOTE_GLYPH.waiting} ${v.waiting}` : '',
      (v.rejected ?? 0) > 0 ? `${VOTE_GLYPH.rejected} ${v.rejected}` : '',
    ].filter(Boolean);
    if (votes.length) parts.push(votes.join('  '));
  }
  if (stats.pushes !== undefined) parts.push(plural(stats.pushes, 'push', 'pushes'));
  if (stats.threads !== undefined) parts.push(plural(stats.threads, 'thread', 'threads'));
  if (stats.files !== undefined) parts.push(sizeBand(stats.files));
  return parts.length ? parts.join(' · ') : undefined;
}

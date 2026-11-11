// PartialHistory history (23 B7; 04 §5, 05 §2). A history request can finish with gaps: an item's reads
// failed (a 5xx, a timeout) and are tolerated so the rest can play, or the revisions feed stopped at
// its page cap (04 §5c) and the rest waits for the next load. The bundle says which, per scene, in
// `coverage.played[]`; the player says it, and Retry asks again for the missing items only. Pure.
import type { CanonicalKey } from './contracts/keys';
import type { ScopeHistory } from './contracts/history';

export interface PartialHistory { missing: number; capped: boolean }

/** What a played scene is short of, or null when it is whole. `scene`: 'team' or a Feature's key. */
export function scenePartial(h: ScopeHistory | null | undefined, scene: 'team' | CanonicalKey): PartialHistory | null {
  const p = h?.coverage.played?.find((x) => x.scene === scene);
  if (!p) return null;
  const missing = new Set(p.missing ?? []).size;
  const capped = p.capped === true;
  return missing || capped ? { missing, capped } : null;
}

/** The player's line (06 §5). Missing items have Retry; a capped crawl is only a note (the next load resumes it). */
export function partialText(p: PartialHistory): string {
  if (p.missing) return `History partial · ${p.missing} missing`;
  return 'History partial · more on the next load';
}

/**
 * Retry's request set: the scene's missing items that are still members of the scope, in order and without
 * repeats. Everything else already has its history (or has a checkpoint that makes a re-read pointless).
 */
export function retrySet(saved: readonly number[] | undefined, members: ReadonlySet<number>): number[] {
  return [...new Set(saved ?? [])].filter((id) => members.has(id)).sort((a, b) => a - b);
}

/** A scene's missing set after a pass: whatever failed this time (what answered leaves; the rest of the scene was not asked). */
export function missingAfter(failed: Iterable<number>): number[] {
  return [...new Set(failed)].sort((a, b) => a - b);
}

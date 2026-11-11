// B4 (03 §3, 04 §3) — board columns from revisions. Pure. One function is shared by the derivation and
// the fixture DSL, so a fixture's bundle and the bundle read back from the fake ADO agree (AC-27).
import type { BoardColumnFact } from '../contracts/facts';
import type { ScopeBoard } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';

/** A revision's board fields, in revision order. */
export interface RevisionColumn { changedAt: UtcMs; column?: string; done?: boolean }

/**
 * One item's placements: an entry whenever its (column, done) pair differs from the revision before.
 * A first revision with no column gives nothing (never on a board); a column that goes away gives
 * `column: ''`.
 */
export function placementsOf(key: CanonicalKey, revs: readonly RevisionColumn[]): ScopeBoard['placements'] {
  const out: ScopeBoard['placements'] = [];
  let column = '';
  let done = false;
  for (const r of revs) {
    const c = r.column ?? '';
    const d = c !== '' && r.done === true;
    if (c === column && d === done) continue;
    column = c;
    done = d;
    out.push({ key, at: r.changedAt, column: c, done: d });
  }
  return out;
}

/** The bundle's `board`: absent when the scope's team board has no columns. Placements in (time, key) order. */
export function boardOf(columns: readonly BoardColumnFact[] | undefined, placements: ScopeBoard['placements']): ScopeBoard | undefined {
  if (!columns?.length) return undefined;
  return {
    columns: columns.map((c) => ({ ...c })),
    placements: [...placements].sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  };
}

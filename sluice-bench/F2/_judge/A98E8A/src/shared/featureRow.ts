// B3: the Features on a star's plate (15 §6 `feature-row`). Containers are never drawn (INV-10): this is text on the
// pod's plate and in its Inspector body, the top Feature by how many of the pod's pieces (Stories and Bugs)
// sit under each, then `+N more` on the same line (27 B2); the whole list when pointed at or selected. Pieces whose parent is not a Feature are not counted anywhere. Pure.
import type { CanonicalKey } from './contracts/keys';
import { workItemId } from './contracts/keys';

/** How many Features the plate names at rest before `+N more` (on the same line, 27 B2). */
export const FEATURE_ROW_CAP = 1;
/** The opened list shows at most this many lines and scrolls beyond them (R5), each `FEATURE_LINE_PX` tall. */
export const FEATURE_OPEN_LINES = 8;
export const FEATURE_LINE_PX = 12;
/** The ADO type that counts: a piece's parent of this type is its Feature; any other parent (an Epic, a Story) is not counted. */
export const FEATURE_TYPE = 'Feature';

/** One Feature on the plate: how many of the pod's pieces it holds now. `title` is null while it isn't known. */
export interface FeatureTally { key: CanonicalKey; id: number; title: string | null; count: number }

/**
 * The Features, most pieces first. A tie goes to the lower Feature id, so the order is the same on every run and
 * never moves with the title (which can be edited or arrive late).
 */
export function rankFeatures(counts: ReadonlyMap<CanonicalKey, number>, titleOf: (key: CanonicalKey) => string | null): FeatureTally[] {
  return [...counts]
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, id: workItemId(key), title: titleOf(key), count }))
    .sort((a, b) => b.count - a.count || a.id - b.id);
}

/** The Feature named the ADO way: `Feature #123 · Title`; `Feature #123` while the title isn't known (R4: counts first). */
export const featureName = (f: Pick<FeatureTally, 'id' | 'title'>): string => `${FEATURE_TYPE} #${f.id}${f.title ? ` · ${f.title}` : ''}`;

/** What the row shows: the first `FEATURE_ROW_CAP` (or all, once opened), and how many `+N more` stands for. */
export function featureRows(all: readonly FeatureTally[], open = false): { shown: readonly FeatureTally[]; more: number } {
  return open ? { shown: all, more: 0 } : { shown: all.slice(0, FEATURE_ROW_CAP), more: Math.max(0, all.length - FEATURE_ROW_CAP) };
}

// 14 §1.2, 12 §6 — mega-lists: the expanded label of a seat or a facility, one row per thing it
// stands for, each with its rung (13 §4.1–4.4). A seat lists its objectives and threats, the members
// of its formations among them; a facility lists its attachments (19 L6), each with the objectives
// and threats it serves as a subtitle and as the pieces its row lights. A piece has no list of its
// own (19 L7: the inspector shows its steps). Lists hold at most ROW_BUDGET rows and count the rest
// in `more`. Engine code: rows carry the source's own names as data (title, type, raw state, the
// pack's word for an attachment), and the rung decides the look. Pure.
import type { StateMapping } from '../../contracts/history';
import { workItemId, type CanonicalKey } from '../../contracts/keys';
import type { MegaList, MegaRow, Snapshot, WorkItemState } from '../../contracts/view';
import { attachmentSignal, resolveRole, resolveSignal } from '../../engine/signal';
import { identityLine } from '../../identity';
import type { PrStats } from '../../contracts/facts';
import { runAsOf, runLine, type ReadRun } from '../../runLine';
import { prStatLine } from '../../prStat';

/** A row's role, when its type has one (an unmapped type has none, INV-11). */
const roleOf = (map: StateMapping, type: string) => { const role = resolveRole(map, type); return role ? { role } : {}; };

/** The rows a mega-list shows before "+N" (14 §2.9). */
export const ROW_BUDGET = 16;

/** A list from its rows: the first `budget`, and a count of the rest. */
export function megaList(title: string, rows: readonly MegaRow[], budget = ROW_BUDGET): MegaList {
  const cap = Math.max(0, Math.floor(budget));
  return { title, rows: rows.slice(0, cap), more: Math.max(0, rows.length - cap) };
}

/**
 * One work item's row: its title, its identity line (type, number and raw state, INV-11 keeps the raw
 * name; 22 B3), its rung, and its role, which the renderer names in the chart's words after the line.
 */
export function itemRow(map: StateMapping, wi: WorkItemState): MegaRow {
  return {
    key: wi.key, label: wi.title, meta: identityLine(wi.type, workItemId(wi.key), wi.rawState),
    rung: resolveSignal(map, wi.type, wi.rawState).rung, ...roleOf(map, wi.type),
  };
}

/** A seat's list (13 §4.1): its pieces, in the order given (objectives, then threats, by slot). */
export function seatList(title: string, map: StateMapping, pieces: readonly WorkItemState[]): MegaList {
  return megaList(title, pieces.map((wi) => itemRow(map, wi)));
}

/** An attachment a facility lists, and the pieces it serves (a step stands for its parent), in order. */
export interface ServedBy { key: CanonicalKey; serves: readonly CanonicalKey[] }

/** An attachment's number, from its key (`pr:{org}:{repo}:{id}`). */
const attachmentId = (key: CanonicalKey) => key.slice(key.lastIndexOf(':') + 1);
/** The source's status as its web pages show it: the raw name, its first letter capitalised. */
const statusName = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

/**
 * A facility's list (13 §4.4, 19 L6): its attachments, in the order given, one row each: the title,
 * `{word} #{id} · {status}` (the pack's word for an attachment, when it has one), its rung, and the
 * pieces it serves, named as the subtitle (`→ {type} #{id}`, comma separated) and carried in `serves`
 * for the row to light. An attachment the snapshot doesn't hold, or that serves nothing it holds, has
 * no row. A PR with stat facts (B1) gets one more line, `stat`. The list always carries its facility's `run` (B2):
 * its latest pipeline run as of `run.asOf`, or an empty line when none was read, so the plate reserves the space.
 */
export function facilityList(
  title: string, map: StateMapping, s: Snapshot, attachments: readonly ServedBy[], word?: string,
  stats?: ReadonlyMap<CanonicalKey, PrStats>, run?: { run: ReadRun | undefined; asOf: number },
): MegaList {
  const rows: MegaRow[] = [];
  for (const a of attachments) {
    const pr = s.prs.get(a.key);
    const served = a.serves.flatMap((k) => { const wi = s.workItems.get(k); return wi ? [wi] : []; });
    if (!pr || !served.length) continue;
    const line = prStatLine(stats?.get(pr.key));
    rows.push({
      key: pr.key, label: pr.title, meta: identityLine(word, attachmentId(pr.key), statusName(pr.status)), role: 'attachment',
      rung: attachmentSignal(map, pr.status).rung, serves: served.map((wi) => wi.key),
      subtitle: { label: `→ ${served.map((wi) => `${wi.type} #${workItemId(wi.key)}`).join(', ')}`, url: null },
      ...(line ? { stat: line } : {}),
    });
  }
  const list = megaList(title, rows);
  if (!run) return list;
  return { ...list, run: run.run ? { text: runLine(run.run, runAsOf(run.run, run.asOf)), state: run.run.state } : { text: '' } };
}

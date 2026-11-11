// The board in the orbit (06 §3, decided 2026-10-09): a star system read like the team's kanban board.
// Each ring is a person's swimlane, A–Z from the inner (top) ring outward, Unassigned outermost. Along
// a ring, a body's place is its stage: Ready at the left end, Underway left of centre, Nearing right
// of centre, Accomplished at the right end. So reading top to bottom is by assignee, and work travels
// left to right as it moves along the board.
//
// The *frame* (which lanes, how many rings each, how wide each column is) is fixed over the whole
// loaded history, so a seek never reflows it (INV-14 as amended for systems). Only a body's place
// inside the frame follows the playhead, a pure function of (history, t, lens) like the Task radar
// (INV-12). Bodies are packed along each ring's arc so they never overlap. Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { BoardPlacement, ScopeHistory } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import type { Lens, Snapshot } from '../contracts/view';
import { snapshotAt } from '../replay/snapshotAt';
import { resolveState } from '../stateMapping';
import { FORMATION, orbitThrough } from './layout';

/** Every tunable in one place, to dial the board in (06 §3; 91 has the open row). */
export const BOARD = {
  /** The default columns, in order, when the scope has no team board (09's rungs, as kanban columns). */
  columns: ['ready', 'underway', 'nearing', 'accomplished'] as const,
  /** No column narrower than this share of a ring, however empty it is over the history (never more than `minTotal` / columns). */
  minShare: 0.14,
  minTotal: 0.9,
  /**
   * One ring per person, always (decided 2026-10-09): no shared lanes and no second ring. A busy
   * person's ring is simply longer. Kept as numbers so they can be dialed back if a team is huge.
   */
  maxLanes: Infinity,
  maxPerRing: Infinity,
  /** Every ring is sized for at least this many bodies, so the four columns read even when sparse. */
  minPerRing: 6,
  /** Centre-to-centre room along the arc for a body (r ≈ 130) and a short label gap. */
  sep: 620,
  /**
   * Rings step this far down (world units); the first sits this far below the star. Wide apart
   * (2026-10-09), so the gap between two swimlanes always holds a ship: each person's home track.
   */
  depth0: FORMATION.y0 + 250,
  depthStep: 950,
  /** After working outside their lane (a shuttle, a station, someone else's planet), a ship stays there this long (source hours), then drifts home. */
  awayHours: 6,
  /** Each ring's ends sit at least this much further out than the ring inside it. */
  spanStep: 220,
  /** Accomplished this long ago (source days, at the playhead): shrink and tuck together at the right. */
  doneAfterDays: 2,
  doneScale: 0.6,
  /** Each ring is drawn as a swimlane this thick (world units): the bodies sit inside it. */
  bandWidth: 330,
  /** A body passing another on its ring bows out to the neighbouring ring's path (05 §5); the eclipse otherwise. */
  passLift: 1,
  eclipseS: 0.5,
};

/** A ladder column (09's rungs as kanban columns): 0 Ready, 1 Underway, 2 Nearing, 3 Accomplished. */
export type BoardColumn = 0 | 1 | 2 | 3;

/** A visual stage (state-mapping.json) as a board column: the rung of 09, Removed and rejected as done. */
export function columnOf(stage: string): BoardColumn {
  const s = stage.slice(stage.indexOf('.') + 1);
  if (['terraforming', 'disturbance', 'active', 'lit'].includes(s)) return 1;
  if (['developed', 'developedAccept', 'contracted', 'contractedAccept', 'accept'].includes(s)) return 2;
  if (['lush', 'remnant', 'whiteDwarf', 'settled', 'ghost', 'rejected'].includes(s)) return 3;
  return 0; // Ready, and unknown states (neutral, INV-11)
}

/**
 * The board's slots, left to right (B4, 06 §3). Without a team board they are the four ladder columns. With
 * one they are its columns in the board's order, a split column as two slots (Doing, then Done).
 */
export interface BoardSlots {
  names: string[];
  /** A body in a done slot packs tight at the right once it has been there a while (an outgoing column; Accomplished). */
  done: boolean[];
  /** The slot of each ladder column, for work with no column (06 §3: the fallback keeps today's placement). */
  ladder: [number, number, number, number];
  /** The slot of a named column (and its Done half), or undefined for a name the board doesn't have. */
  byColumn: Map<string, { slot: number; split: boolean }>;
  /** One heading per board column: a split column's two slots share one (`first`..`last`). */
  headings: { name: string; split: boolean; first: number; last: number }[];
  /** Whether the slots came from a team board. */
  fromBoard: boolean;
}

const DEFAULT_SLOTS: BoardSlots = { names: [...BOARD.columns], done: [false, false, false, true], ladder: [0, 1, 2, 3], byColumn: new Map(), headings: [], fromBoard: false };

export function slotsOf(h: ScopeHistory): BoardSlots {
  const cols = h.board?.columns;
  if (!cols?.length) return DEFAULT_SLOTS;
  const names: string[] = [];
  const done: boolean[] = [];
  const inProgress: number[] = [];
  const byColumn = new Map<string, { slot: number; split: boolean }>();
  const headings: BoardSlots['headings'] = [];
  for (const c of cols) {
    byColumn.set(c.name, { slot: names.length, split: c.split });
    headings.push({ name: c.name, split: c.split, first: names.length, last: names.length + (c.split ? 1 : 0) });
    for (const part of c.split ? ['Doing', 'Done'] : [null]) {
      if (c.type === 'inProgress') inProgress.push(names.length);
      names.push(part ? `${c.name}: ${part}` : c.name);
      done.push(c.type === 'outgoing');
    }
  }
  const n = names.length;
  // Monotonic: Underway never lies left of Ready, nor Nearing left of Underway (a two-slot board has no In Progress column).
  const underway = inProgress[0] ?? Math.min(1, n - 1);
  const ladder: BoardSlots['ladder'] = [0, underway, Math.max(underway, inProgress.at(-1) ?? Math.max(n - 2, 0)), n - 1];
  return { names, done, ladder, byColumn, headings, fromBoard: true };
}

/** The slot a body sits in at `t`: its latest placement's column when the board knows it, else the ladder column (06 §3). */
function slotAt(slots: BoardSlots, placed: BoardPlacement[] | undefined, lad: BoardColumn, t: UtcMs): number {
  if (slots.fromBoard && placed) {
    let p: BoardPlacement | undefined;
    for (const x of placed) { if (x.at > t) break; p = x; }
    const hit = p && slots.byColumn.get(p.column);
    if (hit) return hit.slot + (hit.split && p!.done ? 1 : 0);
  }
  return slots.ladder[lad];
}

export interface BoardRing {
  /** Its index, inner (top) to outer (bottom), and the lane it belongs to. */
  index: number;
  lane: number;
  span: number;
  depth: number;
  rx: number;
  ry: number;
  /** Arc length from the left end to the right end, through the front. */
  length: number;
  /** The lane's home track for its person's ship: an orbit in the gap just above the band. */
  track: { span: number; depth: number; rx: number; ry: number };
}

export interface BoardLane {
  /** The people whose work this lane holds, A–Z (several when lanes are shared); null is Unassigned. */
  people: (CanonicalKey | null)[];
  rings: number[];
}

export interface BoardFrame {
  lanes: BoardLane[];
  rings: BoardRing[];
  /** Column boundaries as fractions of a ring's arc length: [0, a, b, c, 1]. */
  bounds: number[];
  /** Each child's column history: when it entered each slot, oldest first. */
  timelines: Map<CanonicalKey, { at: UtcMs; col: number; who: CanonicalKey | null }[]>;
  /** The slots (columns), and each child's placements on the team board (empty without one). */
  slots: BoardSlots;
  placed: Map<CanonicalKey, BoardPlacement[]>;
}

export interface BoardPlace {
  x: number;
  y: number;
  rx: number;
  ry: number;
  ring: number;
  /** Its slot (column) on the board. */
  col: number;
  labelSide: 'left' | 'right';
  /** Accomplished a while ago: drawn smaller and packed tighter at the right end. */
  compact: boolean;
}

// --- Arc geometry --------------------------------------------------------------------------------

const ARC_SAMPLES = 160;

/** The front arc of the orbit through (±span, depth), sampled by x, with cumulative length. */
function arcTable(span: number, depth: number): { xs: number[]; ys: number[]; len: number[]; rx: number; ry: number } {
  const { rx, ry } = orbitThrough(span, depth);
  const xs: number[] = [];
  const ys: number[] = [];
  const len: number[] = [0];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const x = -span + (2 * span * i) / ARC_SAMPLES;
    xs.push(x);
    ys.push(ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)));
    if (i > 0) len.push(len[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!));
  }
  return { xs, ys, len, rx, ry };
}

const arcLength = (span: number, depth: number) => arcTable(span, depth).len[ARC_SAMPLES]!;

/** The half-span whose front arc at `depth` is `length` long. */
function spanFor(length: number, depth: number): number {
  let lo = 1;
  let hi = Math.max(length, 100);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (arcLength(mid, depth) < length) lo = mid;
    else hi = mid;
  }
  return hi;
}

const tables = new Map<string, ReturnType<typeof arcTable>>();
function tableOf(r: BoardRing) {
  const k = `${r.span.toFixed(3)}|${r.depth}`;
  let t = tables.get(k);
  if (!t) {
    t = arcTable(r.span, r.depth);
    if (tables.size > 256) tables.clear();
    tables.set(k, t);
  }
  return t;
}

/** The point `s` along a ring's arc (0 = left end). */
export function pointOnRing(r: BoardRing, s: number): { x: number; y: number } {
  const t = tableOf(r);
  const L = t.len[ARC_SAMPLES]!;
  const at = Math.min(L, Math.max(0, s));
  let j = 1;
  while (j < ARC_SAMPLES && t.len[j]! < at) j++;
  const k = (at - t.len[j - 1]!) / (t.len[j]! - t.len[j - 1]! || 1);
  return { x: t.xs[j - 1]! + (t.xs[j]! - t.xs[j - 1]!) * k, y: t.ys[j - 1]! + (t.ys[j]! - t.ys[j - 1]!) * k };
}

// --- The frame: fixed over the whole history ----------------------------------------------------

const frames = new WeakMap<ScopeHistory, Map<string, BoardFrame>>();

/**
 * The board's frame for these children (every child ever, slot order): their lanes, rings and
 * column widths, from a sweep over each child's (assignee, column) history. Memoized per bundle.
 */
export function boardFrame(
  h: ScopeHistory, children: CanonicalKey[], lens: Lens, names: (key: CanonicalKey) => string,
  /** Which of the children the scene shows at an instant; absent, all of them. */
  shownAt?: (t: UtcMs) => Set<CanonicalKey>,
): BoardFrame {
  let byScene = frames.get(h);
  if (!byScene) frames.set(h, (byScene = new Map()));
  const memo = `${lens}|${children.join(',')}`;
  const hit = byScene.get(memo);
  if (hit) return hit;

  const typeOf = new Map(h.entities.workItems.map((w) => [w.key, w.type]));
  const ladderOfRaw = (key: CanonicalKey, raw: string) => columnOf(resolveState(h.stateMapping, typeOf.get(key) ?? '', raw).stage);
  const slots = slotsOf(h);
  const placed = new Map<CanonicalKey, BoardPlacement[]>();
  for (const p of h.board?.placements ?? []) (placed.get(p.key) ?? placed.set(p.key, []).get(p.key)!).push(p);
  const base = snapshotAt(h, h.range.startUtc - 1, lens);
  const set = new Set(children);
  // Per child: the ladder column its state gives and who holds it, at each event; placements are merged in below.
  const raw = new Map<CanonicalKey, { at: UtcMs; lad: BoardColumn; who: CanonicalKey | null }[]>();
  for (const key of children) {
    const w = base.workItems.get(key);
    if (w) raw.set(key, [{ at: -Infinity, lad: columnOf(w.stage), who: w.assigneeKey }]);
  }
  for (const e of h.events as AnyTimelineEvent[]) {
    if (e.occurredAt < h.range.startUtc || !set.has(e.entityKey)) continue;
    const line = raw.get(e.entityKey);
    const last = line?.at(-1);
    if (e.kind === 'wi_created') {
      const entry = { at: e.occurredAt, lad: ladderOfRaw(e.entityKey, e.payload.state), who: e.payload.assigneeKey };
      if (line) line.push(entry); else raw.set(e.entityKey, [entry]);
    } else if (e.kind === 'wi_state_changed' && last) {
      line!.push({ at: e.occurredAt, lad: ladderOfRaw(e.entityKey, e.payload.to), who: last.who });
    } else if (e.kind === 'wi_assignee_changed' && last) {
      line!.push({ at: e.occurredAt, lad: last.lad, who: e.payload.to });
    }
  }
  const timelines = new Map<CanonicalKey, { at: UtcMs; col: number; who: CanonicalKey | null }[]>();
  for (const [key, line] of raw) {
    // A placement is a moment too (a move between columns inside one state), carrying the state's ladder column and the holder.
    const moments = [...line, ...(placed.get(key) ?? []).filter((p) => p.at >= h.range.startUtc).map((p) => ({ at: p.at, lad: null as BoardColumn | null, who: null as CanonicalKey | null }))];
    moments.sort((a, b) => a.at - b.at); // stable: an event keeps its place before a placement at the same instant
    let cur = line[0]!;
    timelines.set(key, moments.map((m) => {
      if (m.lad !== null) cur = m as typeof cur;
      return { at: m.at, col: slotAt(slots, placed.get(key), cur.lad, m.at === -Infinity ? h.range.startUtc - 1 : m.at), who: cur.who };
    }));
  }
  // A child known only from current state (no history yet) still needs a lane.
  for (const key of children) if (!timelines.has(key)) timelines.set(key, [{ at: -Infinity, col: slots.ladder[0], who: null }]);

  // The sweep, at the range's start and every instant one of these children changes: who holds what
  // while it is in the scene. `shownAt` is the scene's own rule (a pod's membership, a Feature's
  // children), so a person whose work is never on screen in this range gets no lane (2026-10-09).
  const times = [...new Set([h.range.startUtc, ...(h.events as AnyTimelineEvent[])
    .filter((e) => e.occurredAt >= h.range.startUtc && e.occurredAt < h.range.endUtc && set.has(e.entityKey)).map((e) => e.occurredAt)])].sort((a, b) => a - b);
  const idx = new Map<CanonicalKey, number>();
  const counts: { people: Map<CanonicalKey | null, number>; cols: number[] }[] = [];
  const people = new Set<CanonicalKey | null>();
  for (const t of times) {
    const shown = shownAt ? shownAt(t) : null;
    const byPerson = new Map<CanonicalKey | null, number>();
    const cols = new Array<number>(slots.names.length).fill(0);
    for (const [key, line] of timelines) {
      let i = idx.get(key) ?? -1;
      while (i + 1 < line.length && line[i + 1]!.at <= t) i++;
      idx.set(key, i);
      if (i < 0 || (shown && !shown.has(key))) continue;
      const p = line[i]!;
      people.add(p.who);
      byPerson.set(p.who, (byPerson.get(p.who) ?? 0) + 1);
      cols[p.col]!++;
    }
    counts.push({ people: byPerson, cols });
  }

  // Lanes: everyone who holds shown work at some point, A–Z by name (keyed by ID, INV-22), then Unassigned.
  const named = [...people].filter((p): p is CanonicalKey => p !== null)
    .sort((a, b) => names(a).localeCompare(names(b), undefined, { sensitivity: 'base' }) || (a < b ? -1 : 1));
  const ordered: (CanonicalKey | null)[] = [...named, ...(people.has(null) ? [null] : [])];
  if (!ordered.length) ordered.push(null);
  const groups = Math.max(1, Math.min(BOARD.maxLanes, ordered.length));
  const per = Number.isFinite(BOARD.maxLanes) ? Math.ceil(ordered.length / groups) || 1 : 1;
  const laneOfPerson = new Map<CanonicalKey | null, number>();
  const lanePeople: (CanonicalKey | null)[][] = [];
  ordered.forEach((p, i) => {
    const g = Math.floor(i / per);
    laneOfPerson.set(p, g);
    (lanePeople[g] ??= []).push(p);
  });
  const laneCount = lanePeople.length;
  const lanePeak = new Array<number>(laneCount).fill(0);
  const colPeak = new Array<number>(slots.names.length).fill(0);
  for (const c of counts) {
    const lanes = new Array<number>(laneCount).fill(0);
    for (const [who, n] of c.people) lanes[laneOfPerson.get(who) ?? laneCount - 1]! += n;
    lanes.forEach((n, g) => { lanePeak[g] = Math.max(lanePeak[g]!, n); });
    c.cols.forEach((n, i) => { colPeak[i] = Math.max(colPeak[i]!, n); });
  }

  // Columns: shares follow each column's peak, never narrower than minShare.
  const total = colPeak.reduce((a, b) => a + b, 0) || 1;
  const floor = Math.min(BOARD.minShare, BOARD.minTotal / slots.names.length);
  const shares = colPeak.map((n) => Math.max(floor, n / total));
  const sum = shares.reduce((a, b) => a + b, 0);
  const bounds = [0];
  for (const r of shares) bounds.push(bounds.at(-1)! + r / sum);
  bounds[bounds.length - 1] = 1;

  // Rings: inner to outer, lane by lane; each sized for its share of the lane's peak.
  const rings: BoardRing[] = [];
  const lanes: BoardLane[] = [];
  let prevSpan = 0;
  for (let g = 0; g < laneCount; g++) {
    const peak = Math.max(1, lanePeak[g]!);
    const count = Math.max(1, Math.ceil(peak / BOARD.maxPerRing));
    const need = Math.max(BOARD.minPerRing, Math.ceil(peak / count));
    const lane: BoardLane = { people: lanePeople[g] ?? [null], rings: [] };
    for (let k = 0; k < count; k++) {
      const index = rings.length;
      const depth = BOARD.depth0 + index * BOARD.depthStep;
      const span = Math.max(spanFor(need * BOARD.sep, depth), prevSpan + BOARD.spanStep);
      prevSpan = span;
      const { rx, ry } = orbitThrough(span, depth);
      // The track runs midway between this band and the one inside it (or the star, for the first).
      const inner = rings.at(-1);
      const tDepth = inner ? (inner.depth + depth) / 2 : depth - BOARD.depthStep / 2;
      const tSpan = inner ? (inner.span + span) / 2 : Math.max(span - BOARD.spanStep, span * 0.8);
      const track = { span: tSpan, depth: tDepth, ...orbitThrough(tSpan, tDepth) };
      rings.push({ index, lane: g, span, depth, rx, ry, length: arcLength(span, depth), track });
      lane.rings.push(index);
    }
    lanes.push(lane);
  }

  const frame: BoardFrame = { lanes, rings, bounds, timelines, slots, placed };
  byScene.set(memo, frame);
  return frame;
}

// --- Placement at the playhead -------------------------------------------------------------------

/**
 * Isotonic packing along one ring: the positions closest to `want` (least squares) that keep the
 * order and at least `gap[i]` between neighbours, inside [lo, hi]. Pool-adjacent-violators.
 */
function pack(want: number[], width: number[], length: number): number[] {
  const n = want.length;
  if (!n) return [];
  const offset = [0];
  for (let i = 1; i < n; i++) offset.push(offset[i - 1]! + (width[i - 1]! + width[i]!) / 2);
  const y = want.map((w, i) => w - offset[i]!);
  const blocks: { sum: number; n: number }[] = [];
  for (const v of y) {
    blocks.push({ sum: v, n: 1 });
    while (blocks.length > 1 && blocks.at(-2)!.sum / blocks.at(-2)!.n > blocks.at(-1)!.sum / blocks.at(-1)!.n) {
      const b = blocks.pop()!;
      blocks.at(-1)!.sum += b.sum;
      blocks.at(-1)!.n += b.n;
    }
  }
  const fit: number[] = [];
  for (const b of blocks) for (let i = 0; i < b.n; i++) fit.push(b.sum / b.n);
  const lo = width[0]! / 2;
  const hi = Math.max(lo, length - width[n - 1]! / 2 - offset[n - 1]!);
  return fit.map((v, i) => Math.min(hi, Math.max(lo, v)) + offset[i]!);
}

export interface BoardBody {
  key: CanonicalKey;
  stage: string;
  /** First-join slot: the last tie-break, so placement is deterministic. */
  slot: number;
}

/** Where each body shown at `t` sits on the board. */
export function boardPlace(frame: BoardFrame, s: Snapshot, bodies: BoardBody[], t: UtcMs): Map<CanonicalKey, BoardPlace> {
  const laneOf = new Map<CanonicalKey | null, number>();
  frame.lanes.forEach((l, g) => { for (const p of l.people) laneOf.set(p, g); });
  const DAY = 86_400_000;
  // When it entered the column it is in now (newest sit at the column's left, entry, edge).
  const entered = (key: CanonicalKey, col: number): number => {
    let cur: number | null = null;
    let at = -Infinity;
    for (const p of frame.timelines.get(key) ?? []) {
      if (p.at > t) break;
      if (p.col !== cur) { cur = p.col; at = p.at; }
    }
    return cur === col ? at : -Infinity;
  };
  const byLane = new Map<number, { b: BoardBody; col: number; at: number; compact: boolean }[]>();
  for (const b of bodies) {
    const who = s.workItems.get(b.key)?.assigneeKey ?? null;
    const g = laneOf.get(who) ?? frame.lanes.length - 1;
    const col = slotAt(frame.slots, frame.placed.get(b.key), columnOf(b.stage), t);
    const at = entered(b.key, col);
    const compact = frame.slots.done[col]! && (at === -Infinity || t - at > BOARD.doneAfterDays * DAY);
    (byLane.get(g) ?? byLane.set(g, []).get(g)!).push({ b, col, at, compact });
  }
  const out = new Map<CanonicalKey, BoardPlace>();
  for (const [g, items] of byLane) {
    const lane = frame.lanes[g]!;
    // Board order: by column, then newest into the column first (leftmost), then first join.
    items.sort((a, b) => a.col - b.col || b.at - a.at || a.b.slot - b.b.slot);
    // Deal them across the lane's rings, so each ring keeps the left-to-right order.
    const perRing = lane.rings.map(() => [] as typeof items);
    items.forEach((it, i) => perRing[i % lane.rings.length]!.push(it));
    perRing.forEach((ringItems, k) => {
      const ring = frame.rings[lane.rings[k]!]!;
      const width = ringItems.map((it) => BOARD.sep * (it.compact ? BOARD.doneScale : 1));
      // Each body wants the middle of its column, its cell-mates spread around it.
      const want: number[] = [];
      for (let c = 0; c < frame.slots.names.length; c++) {
        const cell = ringItems.map((it, i) => ({ it, i })).filter((x) => x.it.col === c);
        const mid = ((frame.bounds[c]! + frame.bounds[c + 1]!) / 2) * ring.length;
        const span = cell.reduce((sum, x) => sum + width[x.i]!, 0);
        let at = mid - span / 2;
        for (const x of cell) {
          want[x.i] = at + width[x.i]! / 2;
          at += width[x.i]!;
        }
      }
      const pos = pack(want, width, ring.length);
      ringItems.forEach((it, i) => {
        const p = pointOnRing(ring, pos[i]!);
        out.set(it.b.key, { x: p.x, y: p.y, rx: ring.rx, ry: ring.ry, ring: ring.index, col: it.col, labelSide: p.x < 0 ? 'left' : 'right', compact: it.compact });
      });
    });
  }
  return out;
}

/** The frame's outline as formation-style points (ring ends and fronts), for the station row and fit. */
export function frameOutline(frame: BoardFrame): { x: number; y: number }[] {
  return frame.rings.flatMap((r) => [{ x: -r.span, y: r.depth }, { x: r.span, y: r.depth }, { x: 0, y: r.ry }]);
}

/** Where a column boundary crosses a ring (for the faint ticks), and where a lane's head sits. */
export function boardGuides(frame: BoardFrame): {
  ticks: { x: number; y: number; nx: number; ny: number }[]; heads: { x: number; y: number; people: (CanonicalKey | null)[] }[];
  /** A team board's column names (B4), each centred over its column on the inner ring; none without a team board. */
  columns: { x: number; y: number; name: string; split: boolean }[];
} {
  const outer = frame.rings.at(-1);
  const ticks = !outer ? [] : frame.bounds.slice(1, -1).map((f) => {
    const p = pointOnRing(outer, f * outer.length);
    // The orbit's outward normal at that point, for a short tick across the line.
    const nx = p.x / (outer.rx * outer.rx);
    const ny = p.y / (outer.ry * outer.ry);
    const l = Math.hypot(nx, ny) || 1;
    return { x: p.x, y: p.y, nx: nx / l, ny: ny / l };
  });
  // A lane's head sits just above its band's left end (decided 2026-10-09), clear of the line where the
  // left-hand bodies' labels go.
  const heads = frame.lanes.map((l) => {
    const r = frame.rings[l.rings[0]!]!;
    return { x: -r.span, y: r.depth - BOARD.bandWidth * 1.05, people: l.people };
  });
  const inner = frame.rings[0];
  const columns = !frame.slots.fromBoard || !inner ? [] : frame.slots.headings.map((c) => {
    const p = pointOnRing(inner, ((frame.bounds[c.first]! + frame.bounds[c.last + 1]!) / 2) * inner.length);
    return { x: p.x, y: p.y - BOARD.bandWidth * 1.05, name: c.name, split: c.split };
  });
  return { ticks, heads, columns };
}


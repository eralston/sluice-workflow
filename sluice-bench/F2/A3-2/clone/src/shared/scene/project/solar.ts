// 14 §1.2, §3 step 5 — the solar layout (v1): a region's fixed setup (seats on their orbits, free
// pieces, formations, the frontier and facilities) plus the snapshot gives the scene's nodes. The
// plan (engine/solar) fixes every place over the loaded history; this file decides only which slots
// are filled at the playhead and which neutral stage each node shows (14 §4), so a seek to x and a
// play to x give the same graph. Engine code: it reads roles, rungs and signals only, and may not
// import the v0 layouts or any pack (the import fence in eslint.config.mjs, the literal fence in
// tests/unit), apart from the shared captain projection. Pure.
//
// Resting looks (14 §4): an Accomplished objective is hidden and counted on its seat (m); an
// Accomplished threat rests at its slot and is counted (r); Off pieces show as ghosts where they
// went off. The look comes from the snapshot; membership and seat come from the round's facts, the
// same timeline the plan was built from, so a piece always lands on one of its own slots.
import type { AnyTimelineEvent } from '../../contracts/events';
import type { Rung } from '../../contracts/history';
import type { CanonicalKey, UtcMs } from '../../contracts/keys';
import type { PieceState, ViewNode, WorkItemState } from '../../contracts/view';
import { PLACED_ROLES } from '../../engine/moves';
import { entryAt, heldSpans, knownOff, meet, onSpans, seatsOf, signalAtTime } from '../../engine/facts';
import { helpOf, presentAt } from '../../engine/guests';
import { awayFromStar, loiterOffset } from '../../engine/solar/mandala';
import { attachmentSignal, resolveSignal } from '../../engine/signal';
import { compoundAt, slotMask } from '../../engine/solar/compound';
import { pieceAt, planSolar, slotKey, type PlanPack } from '../../engine/solar/plan';
import { isSlotRole, type SlotRole } from '../../engine/solar/slots';
import { RING_MAX_SCALE } from '../../engine/solar/stations';
import { GEOMETRY } from '../../engine/solar/version';
import { encodePiece } from '../../engine/stageCode';
import type { AttachmentFacts, DomainPack, Interval, PieceFacts, PieceSlot, RoundFacts, Signal, SolarPlan } from '../../engine/types';
import type { SceneRef, SolarSource } from '../../hierarchy/types';
import { artSeed, captainAvatar, orbitEdge, projectionKey, workNode, type ProjectCtx } from './ctx';
import { facilityList, seatList, type ServedBy } from './lists';
import { loiterSlots } from './loiter';
import { projectCaptains, projectGuests } from './traffic';

/** What the projection reads from a pack: its id, and optionally its words and links. */
export type ProjectPack = PlanPack & Partial<Pick<DomainPack, 'words' | 'containerUrl'>>;

/** A source without a pack: no words, no links. */
const DEFAULT_PACK: ProjectPack = { id: 'default' };

/** A guard's look while it's visual only (13 §4.4): idle. */
const GUARD_SIGNAL: Signal = Object.freeze({ rung: 'ready' });

/**
 * The closed categories (12 §4) by the rung they read as, for an aggregate (a seat, a facility) that
 * has no state of its own. Bare keys: engine names, one of which is also an SDLC state's name.
 */
const CATEGORY_RUNG = { Proposed: 'ready', InProgress: 'underway', Resolved: 'nearing', Completed: 'accomplished', Removed: 'off' } as const satisfies Record<string, Rung>;
const CATEGORY_OF = Object.fromEntries(Object.entries(CATEGORY_RUNG).map(([c, r]) => [r, c])) as Record<Rung, string>;

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ---- Board facts: who holds a seat ----

/**
 * A piece's seat timeline on the board: a reseat made while it's Off waits until it's back on the
 * ladder (a ghost stays where it went off), so an Off piece never opens a seat, unless the new seat is
 * already on the board (`ghostSeats`, 23 C9): then the ghost goes there at once and takes a slot in its
 * mandala, holding nothing (a seat whose only piece is a ghost reads vacant, 23 C3).
 */
function boardSeatAt(p: PieceFacts, ghostSeats?: ReadonlySet<CanonicalKey>): PieceFacts['seatAt'] {
  if (p.seatAt.length === 0) return [];
  const out = [{ ...p.seatAt[0]! }];
  const times = [...new Set([...p.seatAt.map((s) => s.from), ...p.signalAt.map((s) => s.from)])].sort((a, b) => a - b);
  for (const t of times) {
    if (t <= out[0]!.from) continue;
    const want = entryAt(p.seatAt, t)!.seat;
    if (knownOff(signalAtTime(p, t)) && !(want && ghostSeats?.has(want))) continue;
    const last = out.at(-1)!;
    if (want === last.seat) continue;
    if (last.from === t) last.seat = want;
    else out.push({ from: t, seat: want });
  }
  return out;
}

const firstHeldMemo = new WeakMap<RoundFacts, Map<CanonicalKey, UtcMs>>();

/** When each seat first held a placed piece in the round (v1.4 B4): a vacant seat before it is awaiting. Memoised per facts object. */
function firstHeld(f: RoundFacts): Map<CanonicalKey, UtcMs> {
  const hit = firstHeldMemo.get(f);
  if (hit) return hit;
  const out = new Map<CanonicalKey, UtcMs>();
  for (const p of f.pieces.values()) {
    if (!PLACED_ROLES.has(p.role)) continue;
    for (const s of heldSpans(p, f.round)) {
      if (s.seat && !((out.get(s.seat) ?? Infinity) <= s.from)) out.set(s.seat, s.from);
    }
  }
  firstHeldMemo.set(f, out);
  return out;
}

const boardMemo = new WeakMap<RoundFacts, RoundFacts>();
const boards = new WeakSet<RoundFacts>();

/**
 * The facts the board is planned from (14 §4: seats are people who held a piece in the round). Seats
 * come only from pieces held while on the ladder: an objective or threat never on the ladder while a
 * member in the round isn't on the board, a reseat while Off waits for the piece to come back, and
 * the seats are the facts' own rule (`seatsOf`) over what's left. An attachment keeps only its links
 * to the board's pieces (a step through its final parent), and one with none left is dropped, so a
 * facility linked only to dropped pieces is never drawn. Everything else is the round's facts as
 * given. Memoised per facts object; board facts map to themselves.
 */
export function boardFacts(f: RoundFacts): RoundFacts {
  if (boards.has(f)) return f;
  const hit = boardMemo.get(f);
  if (hit) return hit;
  const r: Interval = { from: f.round.startUtc, to: f.round.endUtc };
  const pieces = new Map<CanonicalKey, PieceFacts>();
  for (const key of [...f.pieces.keys()].sort(byKey)) {
    const p = f.pieces.get(key)!;
    if (!isSlotRole(p.role)) { pieces.set(key, p); continue; }
    const on = onSpans(p);
    if (!p.member.some((m) => on.some((o) => { const a = meet(m, o); return !!a && !!meet(a, r); }))) continue;
    pieces.set(key, { ...p, seatAt: boardSeatAt(p) });
  }
  // A ghost reseated while Off to a seat that is on the board (23 C9): the seats are the first pass's,
  // so a ghost never opens one, and a reseat to anyone else still waits.
  const seats = seatsOf(pieces, f.round);
  const onBoardSeats = new Set(seats);
  for (const [key, p] of pieces) {
    if (!isSlotRole(p.role) || !onSpans(p).length) continue;
    const seatAt = boardSeatAt(f.pieces.get(key)!, onBoardSeats);
    if (JSON.stringify(seatAt) !== JSON.stringify(p.seatAt)) pieces.set(key, { ...p, seatAt });
  }
  const onBoard = (k: CanonicalKey): boolean => {
    const p = pieces.get(k);
    if (!p) return false;
    // A step stands in for its final parent, as the facility's readers take it (servedBy, placeFacilities).
    return isSlotRole(p.role) || (!!p.parent && isSlotRole(pieces.get(p.parent)?.role ?? ''));
  };
  const attachments = new Map<CanonicalKey, AttachmentFacts>();
  for (const [key, a] of f.attachments) {
    const links = a.links.filter(onBoard);
    if (links.length) attachments.set(key, links.length === a.links.length ? a : { ...a, links });
  }
  const out: RoundFacts = { ...f, pieces, seats, attachments };
  boardMemo.set(f, out);
  boards.add(out);
  return out;
}

// ---- Reading the plan at the playhead ----

/**
 * Where a piece shows at `t`: the slot of the seat the facts say holds it (the frontier's while
 * unassigned), or null while it isn't a member. The plan's own reader (`pieceAt`, over
 * engine/facts), so the projection and the plan never disagree.
 */
export const slotAt: (plan: SolarPlan, f: RoundFacts, piece: CanonicalKey, t: UtcMs) => PieceSlot | null = pieceAt;

/** How a group of pieces stands: on the ladder, done, nearing, and under way. Off pieces don't count. */
interface Tally { total: number; done: number; near: number; busy: number }

function tally(signals: readonly Signal[]): Tally {
  const t: Tally = { total: 0, done: 0, near: 0, busy: 0 };
  for (const s of signals) {
    if (s.rung === 'off') continue;
    t.total++;
    if (s.rung === 'accomplished') t.done++;
    else if (s.rung === 'nearing') t.near++;
    else if (s.rung === 'underway') t.busy++;
  }
  return t;
}

/**
 * An aggregate's rung (as a pod's star reads, 09): all done is Accomplished, three quarters nearing or
 * done is Nearing, anything moving is Underway, otherwise Ready.
 */
function aggregate(t: Tally, active = false): Signal {
  if (t.total > 0 && t.done === t.total) return { rung: 'accomplished' };
  if (t.total > 0 && (t.done + t.near) / t.total >= 0.75) return { rung: 'nearing' };
  if (active || t.done + t.near + t.busy > 0) return { rung: 'underway' };
  return { rung: 'ready' };
}

/**
 * A seat's look from the signals of what it holds (13 §4.1): its aggregate rung, and its own share,
 * the fraction of those on the ladder that are Accomplished. Also the round's preview planets (19 P1).
 */
export function seatPiece(signals: readonly Signal[]): PieceState {
  const t = tally(signals);
  // Finished pieces are platforms in orbit now, not structures on the surface (13 §3, v4), so a seat
  // counts nothing on its surface (22 C9, G-14).
  const signal = aggregate(t);
  return { role: 'seat', signal, category: CATEGORY_OF[signal.rung], share: t.total ? t.done / t.total : 0 };
}

/** A step's mark on its parent (14 §2.4): not started, active, completed. Off steps aren't drawn. */
function stepCode(s: Signal): 'n' | 'a' | 'c' | null {
  if (s.rung === 'off') return null;
  return s.rung === 'ready' ? 'n' : s.rung === 'accomplished' ? 'c' : 'a';
}

/** One shown piece at the playhead. */
interface Shown { key: CanonicalKey; role: SlotRole; slot: PieceSlot; wi: WorkItemState; signal: Signal }

// ---- Guests: help from someone with no seat ----

/**
 * Where each guest last helped, by the playhead (2026-10-12; 22 C8): the shown node of the piece their
 * help served (a step stands for its parent, a PR for the work it serves while it serves the region,
 * 22 C12), never a facility while there's a piece to wait by (K-14); a facility's only when its
 * attachment serves nothing shown. People with a seat are left out (they have their own ship), as are
 * those with no ship of their own here, and, when the schedule planned it, anyone not in the region
 * now (K-13, K-14).
 */
function guestAnchors(ctx: ProjectCtx, f: RoundFacts, seated: ReadonlySet<CanonicalKey>): Map<CanonicalKey, ViewNode> {
  const shown = new Map<CanonicalKey, ViewNode>();
  for (const n of ctx.graph.nodes) if ((n.kind === 'objective' || n.kind === 'threat' || n.kind === 'facility') && !shown.has(n.canonicalKey)) shown.set(n.canonicalKey, n);
  const out = new Map<CanonicalKey, ViewNode>();
  for (const e of ctx.h.events) {
    if (e.occurredAt > ctx.s.atUtc) break;
    if (e.occurredAt < f.round.startUtc) continue;
    for (const { who, at } of helpOf(f, e)) {
      const n = at.map((k) => shown.get(k)).find((x): x is ViewNode => !!x);
      if (n && !seated.has(who) && ctx.captains.has(who)) out.set(who, n);
    }
  }
  if (ctx.guests) for (const who of [...out.keys()]) if (!presentAt(ctx.guests.get(who), ctx.s.atUtc)) out.delete(who);
  return out;
}

// ---- Loitering (22 D3, D4) ----

/**
 * Every ship resting by a planet takes its loiter slot (`loiterSlots`): on the planet's loiter ring, the
 * first to arrive on its far side from the star, the rest either side by arrival. A ship whose rest the
 * walk read differently (a piece held longest, as `projectCaptains` falls back) takes the next free slot
 * there, by key. Ships resting elsewhere (a frontier piece) keep the shared projection's place.
 */
function pinToLoiter(ctx: ProjectCtx, f: RoundFacts, plan: SolarPlan, homes: ReadonlyMap<CanonicalKey, ViewNode>, ships: ViewNode[]): void {
  const bySeatPk = new Map([...homes].map(([person, n]) => [n.projectionKey, person] as const));
  const seats = new Map(plan.seats.map((st) => [st.person, st]));
  const slots = loiterSlots(ctx.h.events as AnyTimelineEvent[], f, plan.seats.map((st) => st.person), ctx.s.atUtc, ctx.guests);
  const used = new Map<CanonicalKey, Set<number>>();
  const resting = ships.map((n) => ({ n, seat: n.attach ? bySeatPk.get(n.attach.to) : undefined })).filter((x): x is { n: ViewNode; seat: CanonicalKey } => !!x.seat);
  const pick = (seat: CanonicalKey, want?: number) => {
    const u = used.get(seat) ?? new Set<number>();
    used.set(seat, u);
    let j = want ?? 0;
    if (want === undefined || u.has(j)) { j = 0; while (u.has(j)) j++; }
    u.add(j);
    return j;
  };
  // The walk's slots first, so a ship it placed keeps its own; any other after, by key.
  const agreed = resting.filter((x) => slots.get(x.n.canonicalKey)?.seat === x.seat);
  const other = resting.filter((x) => !agreed.includes(x)).sort((a, b) => (a.n.canonicalKey < b.n.canonicalKey ? -1 : 1));
  for (const x of [...agreed, ...other]) {
    const { n, seat } = x;
    const st = seats.get(seat);
    if (!st?.mandala || !n.attach) continue;
    const index = pick(seat, agreed.includes(x) ? slots.get(n.canonicalKey)!.index : undefined);
    const away = awayFromStar(st.x - plan.star.x, st.y - plan.star.y);
    const o = loiterOffset(st.mandala.loiterR, 4 * GEOMETRY.shipR, index, away);
    const len = Math.hypot(o.x, o.y) || 1;
    n.world = { ...n.world, x: st.x + o.x, y: st.y + o.y };
    n.attach = { ...n.attach, dirX: o.x / len, dirY: o.y / len, loiter: index };
  }
}

// ---- The projection ----

export function projectSolar(ctx: ProjectCtx, ref: SceneRef, src: SolarSource): void {
  const { h, s, scene } = ctx;
  const starPk = projectionKey(scene, ref.key);
  const star = src.center(ctx, ref, starPk);
  if (!star) return; // not yet created at this playhead
  const pack: ProjectPack = src.pack?.(h) ?? DEFAULT_PACK;
  const f = boardFacts(src.facts(h, ref));
  const plan = planSolar(f, pack);
  const map = h.stateMapping;
  const x = s.atUtc;

  star.world = { ...plan.star };
  // The system you're inside (19 L4; 22 A3): its name over its counts, above it, as the round's stars.
  star.labelSide = 'above';
  star.labelLayout = 'vertical';
  ctx.graph.nodes.push(star);
  ctx.graph.solar = { star: { x: plan.star.x, y: plan.star.y }, seats: plan.seats, frontier: plan.frontier, formations: plan.formations, unassigned: [],
    stations: plan.stations.map((st) => ({ facility: st.facility, x: st.x, y: st.y, mode: st.mode, size: st.size })) };
  const lists: NonNullable<typeof ctx.graph.lists> = {};

  // Children at the playhead, for steps: the facts' slot order (first bind, INV-14), then any other by key.
  const children = new Map<CanonicalKey, WorkItemState[]>();
  for (const wi of s.workItems.values()) {
    if (wi.parentKey) children.set(wi.parentKey, [...(children.get(wi.parentKey) ?? []), wi]);
  }
  const stepsOf = (p: PieceFacts): WorkItemState[] => {
    const now = new Map((children.get(p.key) ?? []).filter((c) => f.pieces.get(c.key)?.role === 'step').map((c) => [c.key, c]));
    const order = [...p.steps.filter((k) => now.has(k)), ...[...now.keys()].filter((k) => !p.steps.includes(k)).sort(byKey)];
    return order.map((k) => now.get(k)!);
  };

  // Pieces: every objective and threat in a slot now, standing on its seat's planet or, once finished, in orbit.
  const formationSize = new Map(plan.formations.map((fm) => [fm.id, fm.members.length]));
  const shown: Shown[] = [];
  const pieceNodes: ViewNode[] = [];
  for (const key of [...f.pieces.keys()].sort(byKey)) {
    const p = f.pieces.get(key)!;
    if (!isSlotRole(p.role)) continue;
    const slot = slotAt(plan, f, key, x);
    const wi = s.workItems.get(key);
    if (!slot || !wi) continue;
    const signal = resolveSignal(map, wi.type, wi.rawState);
    shown.push({ key, role: p.role, slot, wi, signal });
    // A finished piece lingers in low orbit on its seat's lit edge (13 §3, v4): a pure function of the
    // piece's rung at the playhead, so a seek lands it where play would have. Unassigned work stays put.
    const at = signal.rung === 'accomplished' && slot.mode !== 'frontier' ? plan.platforms.get(slotKey(slot.seat, key)) ?? slot : slot;
    const steps = stepsOf(p);
    const codes = steps.map((st) => stepCode(resolveSignal(map, st.type, st.rawState))).filter((c): c is 'n' | 'a' | 'c' => c !== null);
    // Steps unset when there are none, so one look has one stage string.
    const piece: PieceState = { role: p.role, signal, category: wi.category, ...(codes.length ? { steps: codes } : {}) };
    const node = workNode(ctx, projectionKey(scene, key), wi, p.role, { x: at.x, y: at.y, r: at.r });
    node.asset = p.role;
    const act = activityOf(x, [wi, ...steps]);
    if (act > 0) node.activity = act;
    node.piece = piece;
    node.stage = encodePiece(piece);
    if (steps.length) node.stepKeys = steps.map((st) => st.key); // the inspector's steps (19 L7)
    node.slot = at.index;
    node.labelSide = slot.mode === 'frontier' ? 'below' : p.role === 'objective' ? 'left' : 'right';
    node.labelLayout = 'horizontal';
    // The mandala (22 D1, D2, D7): never drawn past its slot's room, its plate out along its own ray from the planet.
    const seatAt = slot.mode !== 'frontier' ? plan.seats.find((st) => st.person === slot.seat) : undefined;
    if (seatAt?.mandala) {
      // A trophy keeps to its world size, a piece on the planet to its slot's room (keep the symmetry).
      const room = at.mode === 'platform' ? at.r : seatAt.mandala.room;
      if (room > at.r) node.maxScale = room / at.r;
      else node.maxScale = 1;
      const dx = at.x - seatAt.x;
      const dy = at.y - seatAt.y;
      const len = Math.hypot(dx, dy);
      node.labelDir = len > 1e-6 ? { x: dx / len, y: dy / len } : { x: p.role === 'objective' ? -1 : 1, y: 0 };
      node.labelFixed = true;
    }
    // Hover-only (19 L7): a seated piece speaks through its planet's list, a frontier piece by its own
    // plate when pointed at; in play its plate comes and goes with the maneuvers that cast it.
    node.labelOnHover = true;
    if (at !== slot && at.mode === 'platform') node.platform = { seat: slot.seat, role: p.role, index: at.index };
    if (at === slot && slot.formation) {
      node.cluster = { id: slot.formation, index: slot.index, size: formationSize.get(slot.formation) ?? 1 };
    }
    ctx.graph.nodes.push(node);
    pieceNodes.push(node);
    if (slot.mode === 'frontier') ctx.graph.solar.unassigned.push(node.projectionKey); // in the belt (19 S2)
  }

  // Seats: one planet per person on their fixed orbit, at every playhead (INV-14). Its own share is
  // the fraction of what it holds now that is Accomplished (13 §4.1).
  const homes = new Map<CanonicalKey, ViewNode>();
  const rank = (a: Shown) => (a.role === 'objective' ? 0 : 1) * 4 + (a.slot.mode === 'free' ? 0 : 1);
  for (const seat of plan.seats) {
    const pk = projectionKey(scene, seat.person, 'seat');
    const held = shown.filter((a) => a.slot.seat === seat.person).sort((a, b) => rank(a) - rank(b) || a.slot.index - b.slot.index);
    const piece = seatPiece(held.map((a) => a.signal));
    // Nothing on the ladder here at the playhead (an Off ghost holds nothing, as `seatReason` says): the planet stays, dimmed (23 C3).
    if (!held.some((a) => !knownOff(a.signal))) {
      piece.vacant = true;
      // None of its work has come yet this round (v1.4 B4): its first arrival plays first light.
      if (!((firstHeld(f).get(seat.person) ?? Infinity) <= x)) piece.awaiting = true;
    }
    const c = ctx.captains.get(seat.person);
    const name = c?.displayName ?? seat.person;
    // The seat's own title, when the theme names it (2026-10-12); the person's name stays its subtitle.
    const label = src.seatTitle?.(h, seat.person) ?? name;
    // Its label hangs outward, away from the star, pointing back at the seat's rim.
    const out = Math.hypot(seat.x - plan.star.x, seat.y - plan.star.y);
    const node: ViewNode = {
      projectionKey: pk, canonicalKey: seat.person, kind: 'seat', asset: 'seat', piece,
      world: { x: seat.x, y: seat.y, r: GEOMETRY.planetR }, stage: encodePiece(piece), seed: artSeed(seat.person),
      label, ...(label !== name ? { meta: name } : {}), avatar: c ? captainAvatar(c) : undefined, openable: false, selectable: true, labelled: true,
      labelSide: 'below', labelLayout: 'vertical', slot: seat.index, flags: {}, evidence: [],
      ...(out > 0 ? { labelDir: { x: (seat.x - plan.star.x) / out, y: (seat.y - plan.star.y) / out } } : {}),
      // Its captains loiter on this ring (22 D3), and its name hangs just past it (D7).
      ...(seat.mandala ? {
        loiterR: seat.mandala.loiterR,
        loiterWithin: seat.mandala.trophies ? { r: seat.mandala.shells[seat.mandala.shells.length - 1]!.r, trophies: true } : { r: GEOMETRY.planetR, trophies: false },
      } : {}),
    };
    ctx.graph.nodes.push(node);
    homes.set(seat.person, node);
    ctx.graph.edges.push(orbitEdge(starPk, pk, plan.star.x, plan.star.y, seat.rx, seat.ry, false, { from: seat.angle - seat.arc, to: seat.angle + seat.arc }));
    lists[pk] = seatList(label, map, held.map((a) => a.wi));
  }

  // Facilities: each jumps in at its first attachment in the round and stays (14 §4). Its satellites
  // are the attachments open now in their first-fit slots (the snapshot's status decides open), past
  // the cap counted in `more`, and its guards. Intensity is its own share of linked pieces done.
  const facilityNoun = pack.words?.role.facility?.one;
  for (const st of plan.stations) {
    if (x < st.enterAt) continue;
    const status = (key: CanonicalKey) => s.prs.get(key)?.status;
    const open = st.slots.filter((c) => c.role === 'guard' || (status(c.key) ?? 'active') === 'active');
    const { live, more } = compoundAt(open, x); // the plan's cap (st.cap) is the compound cap
    const slots = live.map((c) => {
      if (c.role === 'guard') return { ...c, signal: GUARD_SIGNAL };
      const now = status(c.key);
      const att = f.attachments.get(c.key);
      return { ...c, signal: now ? attachmentSignal(map, now) : (att && signalAtTime(att, x)) ?? attachmentSignal(map, 'active') };
    });
    const openCount = slots.filter((c) => c.role === 'attachment').length + more;
    const served = servedBy(f, [...new Set(st.slots.filter((c) => c.role === 'attachment').map((c) => c.key))], x);
    const linked = servedPieces(served);
    const t = tally(linked.flatMap((k) => { const wi = s.workItems.get(k); return wi ? [resolveSignal(map, wi.type, wi.rawState)] : []; }));
    const intensity = t.total ? t.done / t.total : 0;
    const signal = aggregate(t, openCount > 0);
    // The PRs merged into it that count toward its form (decided 2026-10-13). Every playback starts
    // with every facility in its first form: a facility with merges in the round counts only those so
    // far, so its first one in the round transforms it (the engine's `firstMerge`). A facility none of
    // whose PRs merge in the round counts those merged before it, so it holds its second form all
    // round: there's nothing to play, and the round ends as the scene opens (in its final form).
    const inRound = f.merges?.get(st.facility);
    let merged = 0;
    if (inRound?.length) {
      for (const k of inRound) if (s.prs.get(k)?.status === 'completed') merged++;
    } else {
      for (const pr of s.prs.values()) if (pr.repoKey === st.facility && pr.status === 'completed') merged++;
    }
    // Standby (19 M1): how lately its PRs moved, as a piece's activity, from the last one opened,
    // merged or abandoned (approvals come with the merge). With none open and that under
    // STANDBY_BELOW, it stands by. It keeps its place and size (INV-14, INV-19); only its look quiets.
    const recency = recencyOf(x, lastPrEventAt(f, st.facility, x));
    const standby = openCount === 0 && recency < STANDBY_BELOW;
    const piece: PieceState = {
      role: 'facility', signal, category: CATEGORY_OF[signal.rung], intensity, open: openCount, slots: slotMask(slots), ...(merged ? { merged } : {}), ...(standby ? { standby } : {}),
    };
    const pk = projectionKey(scene, st.facility);
    const label = ctx.repoNames.get(st.facility) ?? st.facility;
    ctx.graph.nodes.push({
      projectionKey: pk, canonicalKey: st.facility, kind: 'facility', asset: 'facility', piece,
      compound: { slots, more, intensity, summoner: st.summoner, guards: st.slots.filter((c) => c.role === 'guard').length },
      world: { x: st.x, y: st.y, r: GEOMETRY.facilityR * st.size }, ...(st.size !== 1 ? { floorScale: st.size } : {}), maxScale: RING_MAX_SCALE, stage: encodePiece(piece), seed: artSeed(st.facility),
      label, meta: facilityNoun, typeName: facilityNoun, openable: Boolean(ctx.adoUrls.get(st.facility)), selectable: true, labelled: true,
      labelSide: 'below', labelLayout: 'vertical', flags: { stale: ctx.stale.has(st.facility) || undefined, ...(standby ? { standby } : {}) }, evidence: [],
      ...(quarters(recency) > 0 ? { activity: quarters(recency) } : {}),
    });
    lists[pk] = facilityList(label, map, s, served, pack.words?.role.attachment?.short ?? pack.words?.role.attachment?.one, ctx.prStats, { run: ctx.repoRuns.get(st.facility), asOf: ctx.runAsOf });
  }

  // Agents: one ship per person (INV-07), beside where they last worked here (the shared captain
  // projection), else beside a piece they hold, else beside their own planet (every seat has a
  // clickable ship, Q10). A ghost reassigned while Off is no anchor for its new assignee's ship, wherever
  // it now stands (23 C9: at its new seat, if that seat is on the board). The ship is drawn by the agent asset.
  const wentOffAt = (a: Shown): CanonicalKey | null | undefined => heldSpans(f.pieces.get(a.key)!, f.round).filter((s) => s.from <= x).sort((u, v) => v.to - u.to)[0]?.seat;
  const anchors = shown.filter((a) => !(knownOff(a.signal) && (a.wi.assigneeKey !== a.slot.seat || wentOffAt(a) !== a.slot.seat))).map((a) => a.key);
  const assignable = pieceNodes.filter((n) => anchors.includes(n.canonicalKey));
  const before = ctx.graph.nodes.length;
  projectCaptains(ctx, assignable, homes);
  // Guests (2026-10-12): someone who holds nothing here has no seat, but their ship still comes to
  // help, beside the last thing they helped in the round, once they have.
  projectGuests(ctx, guestAnchors(ctx, f, new Set(plan.seats.map((st) => st.person))), homes);
  for (const n of ctx.graph.nodes.slice(before)) {
    if (n.kind !== 'captain') continue;
    n.asset = 'agent';
    n.meta = ctx.captains.get(n.canonicalKey)?.callSign;
  }
  pinToLoiter(ctx, f, plan, homes, ctx.graph.nodes.slice(before).filter((n) => n.kind === 'captain'));

  ctx.graph.lists = lists;
  // Planets draw first, so the pieces that overlay them are drawn over them (13 §3, v4); a stable sort keeps the rest in order.
  ctx.graph.nodes = [...ctx.graph.nodes.filter((n) => n.kind === 'seat'), ...ctx.graph.nodes.filter((n) => n.kind !== 'seat')];
}

/** One day of history: how lately a piece was worked halves with each. */
export const ACTIVITY_HALF_MS = 86_400_000;

/**
 * A facility stands by (19 M1) while nothing of its is open and its activity, unquantised, is under
 * this: two days of history since its last PR event.
 */
export const STANDBY_BELOW = 0.25;

/**
 * How lately a piece was worked at `x`: 1 just now, halving every ACTIVITY_HALF_MS since it or one of
 * its steps last changed, quantised to quarters so a look changes in steps (0 under an eighth).
 */
export function activityOf(x: UtcMs, items: readonly WorkItemState[]): number {
  return quarters(recencyOf(x, Math.max(-Infinity, ...items.map((w) => w.lastEventAt ?? -Infinity))));
}

/** 1 at `last`, halving every ACTIVITY_HALF_MS after it; 0 with no `last` by `x`. */
function recencyOf(x: UtcMs, last: number): number {
  return Number.isFinite(last) && last <= x ? Math.pow(0.5, (x - last) / ACTIVITY_HALF_MS) : 0;
}

const quarters = (k: number) => Math.round(k * 4) / 4;

/** When a facility's PRs here last opened or settled by `x` (each change of an attachment's signal), or -Infinity. */
function lastPrEventAt(f: RoundFacts, facility: CanonicalKey, x: UtcMs): number {
  let last = -Infinity;
  for (const a of f.attachments.values()) {
    if (a.facility !== facility) continue;
    for (const s of a.signalAt) if (s.from <= x && s.from > last) last = s.from;
  }
  return last;
}

/**
 * A facility's attachments opened by `t`, in opening order, then by key, each with the objectives and
 * threats it links to. A linked step stands in for its parent.
 */
function servedBy(f: RoundFacts, attachments: readonly CanonicalKey[], t: UtcMs): ServedBy[] {
  const atts = attachments.map((k) => f.attachments.get(k)).filter((a): a is NonNullable<typeof a> => !!a && a.open.from <= t)
    .sort((a, b) => a.open.from - b.open.from || byKey(a.key, b.key));
  return atts.map((a) => {
    const serves: CanonicalKey[] = [];
    for (const link of a.links) {
      const p = f.pieces.get(link);
      const key = p && !isSlotRole(p.role) ? p.parent : link;
      if (key && isSlotRole(f.pieces.get(key)?.role ?? '') && !serves.includes(key)) serves.push(key);
    }
    return { key: a.key, serves };
  });
}

/** The pieces a facility's attachments serve, each once, in the attachments' order. */
const servedPieces = (served: readonly ServedBy[]): CanonicalKey[] => [...new Set(served.flatMap((a) => a.serves))];

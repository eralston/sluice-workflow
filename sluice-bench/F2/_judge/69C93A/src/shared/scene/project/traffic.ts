// 06 §3, 02 §3 — what every system and close-up shares: stations, PR flights and their routes, the PR
// lane, and captains (INV-07, INV-08). Moved out of projectScene.ts unchanged (decided 2026-10-07).
import type { AnyTimelineEvent } from '../../contracts/events';
import { identityLine } from '../../identity';
import type { CanonicalKey } from '../../contracts/keys';
import type { ViewNode } from '../../contracts/view';
import { MAX_STATIONS_PER_FEATURE } from '../../limits';
import { centeredRow, FORMATION } from '../layout';
import { BOARD } from '../board';
import { artSeed, captainAvatar, edge, linkUncertain, projectionKey, type ProjectCtx } from './ctx';

type Captain = NonNullable<ReturnType<ProjectCtx['captains']['get']>>;

export function projectTraffic(
  ctx: ProjectCtx, subtree: Set<CanonicalKey>, bodies: Map<CanonicalKey, ViewNode>,
  stationSlots: (count: number) => [number, number][], axis: 'x' | 'y', mode: 'feature' | 'body',
  lane?: { y: number; halfHeight: number },
): void {
  const { h, s, scene } = ctx;
  const nodeByKey = new Map(ctx.graph.nodes.map((n) => [n.canonicalKey, n]));
  // PRs with a valid link into this subtree at the playhead.
  const prLinks = s.links.filter((l) => l.kind === 'pr' && subtree.has(l.toKey) && s.prs.has(l.fromKey));
  const prKeys = [...new Set(prLinks.map((l) => l.fromKey))];
  const repoOfPr = new Map(h.entities.prs.map((p) => [p.key, p.repoKey]));
  const endpointOf = (itemKey: CanonicalKey): ViewNode | undefined => nodeByKey.get(itemKey) ?? bodies.get(s.workItems.get(itemKey)?.parentKey as CanonicalKey);

  // Stations: every repo ever linked into this subtree (stable across seeks), ordered by the mean
  // position of the work linked to it — the barycenter heuristic, which minimizes route crossings.
  const linkedEver = new Map<CanonicalKey, number[]>();
  /** `dated`: from a link event, so it orders the row. An undated or current-only link only earns the station. */
  const everLinked = (prKey: CanonicalKey, itemKey: CanonicalKey, dated: boolean) => {
    if (!subtree.has(itemKey)) return;
    const repo = repoOfPr.get(prKey);
    const ep = endpointOf(itemKey);
    if (!repo || !ep) return;
    const had = linkedEver.get(repo);
    if (dated) linkedEver.set(repo, [...(had ?? []).filter(Number.isFinite), ep.world[axis]]);
    else if (!had) linkedEver.set(repo, []);
  };
  for (const e of h.events) if (e.kind === 'link_pr_added') everLinked(e.payload.prKey, e.payload.itemKey, true);
  // A link we hold without its dated event (an undated touch, or a PR known only from current state
  // before its item's updates arrive, decided 2026-10-08): the station is still there to dock at. Both
  // are playhead-independent, like the events, so stations stay put across a seek (INV-14). They don't
  // sway the row's order, which follows the routes actually drawn.
  for (const o of h.observations) if (o.kind === 'link_pr' && o.toKey) everLinked(o.fromKey, o.toKey, false);
  for (const l of h.current?.links ?? []) if (l.kind === 'pr') everLinked(l.fromKey, l.toKey, false);
  // A station with no drawn route yet (an undated or current-only link) has no barycenter: it sits at
  // the end of the row, in key order, so it never moves the ones that do.
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity);
  const repos = [...linkedEver.keys()]
    .sort((a, b) => mean(linkedEver.get(a)!) - mean(linkedEver.get(b)!) || (a < b ? -1 : 1))
    .slice(0, MAX_STATIONS_PER_FEATURE);
  const slots = stationSlots(repos.length);
  const stations = new Map<CanonicalKey, ViewNode>();
  repos.forEach((repoKey, i) => {
    if (!prKeys.some((p) => repoOfPr.get(p) === repoKey)) return; // no valid link at this playhead
    const [x, y] = slots[i]!;
    const node: ViewNode = {
      projectionKey: projectionKey(scene, repoKey),
      canonicalKey: repoKey, kind: 'station', world: { x, y, r: mode === 'body' ? 170 : 150 },
      stage: 'station.active', seed: artSeed(repoKey), label: ctx.repoNames.get(repoKey) ?? 'repository',
      meta: 'Repository', openable: Boolean(ctx.adoUrls.get(repoKey)), selectable: true, labelled: true,
      labelSide: 'below', labelLayout: 'vertical', slot: i, flags: {}, evidence: [],
    };
    stations.set(repoKey, node);
    ctx.graph.nodes.push(node);
  });

  const perStation = new Map<CanonicalKey, number>();
  for (const prKey of prKeys.sort()) {
    const pr = s.prs.get(prKey)!;
    const station = stations.get(pr.repoKey);
    const targets = prLinks.filter((l) => l.fromKey === prKey).map((l) => l.toKey).sort();
    const endpoints = targets.map(endpointOf).filter((n): n is ViewNode => Boolean(n));
    const anchor = endpoints[0];
    if (!station || !anchor) continue;
    const idx = perStation.get(pr.repoKey) ?? 0;
    perStation.set(pr.repoKey, idx + 1);
    const dx = station.world.x - anchor.world.x;
    const dy = station.world.y - anchor.world.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const spread = (idx - 0.5) * 120;
    const at = (k: number) => ({ x: anchor.world.x + dx * k + nx * spread, y: anchor.world.y + dy * k + ny * spread });
    // Docked flights get their own berths on an arc facing the work, clear of the station and each other.
    const berth = (i: number) => {
      const a = Math.atan2(-dy, -dx) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55;
      const d = station.world.r + 110;
      return { x: station.world.x + Math.cos(a) * d, y: station.world.y + Math.sin(a) * d };
    };
    // In flight: where the route crosses the PR lane, so vessels never mingle with the children.
    const laneK = lane && dy !== 0 ? Math.min(0.95, Math.max(0.05, (lane.y - anchor.world.y) / dy)) : 0.5;
    const p = pr.status === 'completed'
      ? berth(idx)
      : pr.status === 'abandoned' ? { x: at(laneK).x + nx * 50, y: lane?.y ?? at(0.4).y + ny * 50 } : { x: at(laneK).x, y: lane?.y ?? at(0.5).y };
    const berthDir = (i: number) => {
      const a = Math.atan2(-dy, -dx) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55;
      return { dirX: Math.cos(a), dirY: Math.sin(a) };
    };
    const prId = prKey.slice(prKey.lastIndexOf(':') + 1);
    const flight: ViewNode = {
      projectionKey: projectionKey(scene, prKey),
      canonicalKey: prKey, kind: 'flight', world: { x: p.x, y: p.y, r: mode === 'body' ? 64 : 48 },
      // With a PR lane, every vessel rides in it (completed ones slot above their station), so every
      // PR label has room. Without one, completed vessels berth at the station.
      attach: pr.status === 'completed' && !lane ? { to: station.projectionKey, ...berthDir(idx) } : undefined,
      along: pr.status === 'completed' && !lane ? undefined
        : { from: anchor.projectionKey, to: station.projectionKey, t: laneK, normal: spread + (pr.status === 'abandoned' ? 50 : 0), lane },
      stage: `flight.${pr.status}`, seed: artSeed(prKey), label: pr.title, meta: identityLine('PR', prId, pr.status),
      meta2: pr.authorKey ? ctx.captains.get(pr.authorKey)?.displayName : undefined, // the PR's author
      openable: Boolean(ctx.adoUrls.get(prKey)), selectable: true, labelled: true, labelSide: 'below', labelLayout: 'vertical',
      flags: { stale: ctx.stale.has(prKey) || undefined }, evidence: ctx.evidence.get(prKey) ?? [], // unreadable now, drawn from its last known record (slice 7)
    };
    ctx.graph.nodes.push(flight);
    ctx.graph.edges.push(edge('route', flight.projectionKey, station.projectionKey));
    for (const target of targets) {
      const ep = endpointOf(target);
      if (!ep) continue;
      ctx.graph.edges.push(edge('route', flight.projectionKey, ep.projectionKey, linkUncertain(s, 'pr', prKey, target)));
      // A Task route continues to its actual parent (02 §3); a direct Story/Bug link has no Task.
      const parent = s.workItems.get(target)?.parentKey;
      const parentNode = parent ? bodies.get(parent) : undefined;
      if (ep.kind === 'missionPoint' && parentNode) ctx.graph.edges.push(edge('routeContinuation', ep.projectionKey, parentNode.projectionKey));
    }
  }

  // PR lane slots (06 §3): vessels spread evenly across the station row's width, in the
  // order their routes cross the lane, so routes don't cross each other. Labels alternate below and
  // above, so neighbours on the same side are two slots apart and never collide.
  if (lane) {
    const inFlight = ctx.graph.nodes.filter((n) => n.kind === 'flight' && n.along?.lane);
    const xs = [...stations.values()].map((n) => n.world.x);
    const span = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : FORMATION.stationStep;
    const step = inFlight.length > 1 ? Math.max(FORMATION.stationStep * 0.6, span / (inFlight.length - 1)) : 0;
    const slots = centeredRow(inFlight.length, step);
    // Order by where each vessel wants to be: its route's lane crossing, or its station if completed.
    const want = (n: ViewNode) => (n.stage === 'flight.completed' ? stations.get(s.prs.get(n.canonicalKey)!.repoKey)?.world.x ?? n.world.x : n.world.x);
    [...inFlight].sort((a, b) => want(a) - want(b) || (a.projectionKey < b.projectionKey ? -1 : 1)).forEach((n, i) => {
      n.world = { ...n.world, x: slots[i]!, y: lane.y };
      n.along = { ...n.along!, lane: { ...lane, x: slots[i]! } };
      n.labelSide = i % 2 ? 'above' : 'below';
    });
  }
}

/**
 * The PR lane: a band between the lowest child and the station row (06 §3). It sits in the upper part
 * of the gap, leaving room below each vessel for its label before the stations begin.
 */
export function prLane(childrenBottom: number, stationTop: number): { y: number; halfHeight: number } {
  const gap = Math.max(0, stationTop - childrenBottom);
  return { y: childrenBottom + gap * 0.5, halfHeight: gap * 0.1 }; // centred: a label's room above and below
}

/** Stations spread across the formation's width (never tighter than the base step), so their labels fit. */
export function stationStep(count: number, width: number): number {
  return count <= 1 ? FORMATION.stationStep : Math.max(FORMATION.stationStep, width / (count - 1));
}

/**
 * Where each captain last worked in this scene (decided 2026-10-03): the latest event they made
 * (`changedBy`, or authoring a PR) up to the playhead, on the nearest object the scene shows: the
 * item itself, else its nearest shown ancestor (a Task's planet in a system view); PR work sits at the
 * PR's vessel. Pure, so seeks stay idempotent (INV-12). Events elsewhere don't count, so an
 * assignment in another Feature never moves a ship here (AC-21).
 */
function activityAnchors(ctx: ProjectCtx, solar = false): Map<CanonicalKey, { node: ViewNode; at: number }> {
  if (solar) return pieceAnchors(ctx);
  const shown = new Map<CanonicalKey, ViewNode>();
  for (const n of ctx.graph.nodes) if (n.selectable && n.kind !== 'captain' && n.kind !== 'station' && !shown.has(n.canonicalKey)) shown.set(n.canonicalKey, n);
  const nodeFor = (key: CanonicalKey): ViewNode | undefined => {
    let k: CanonicalKey | null = key;
    for (let i = 0; i < 8 && k; i++) {
      const n = shown.get(k);
      if (n) return n;
      k = ctx.s.workItems.get(k)?.parentKey ?? null;
    }
    return undefined;
  };
  const out = new Map<CanonicalKey, { node: ViewNode; at: number }>();
  for (const e of ctx.h.events as AnyTimelineEvent[]) {
    if (e.occurredAt > ctx.s.atUtc) break;
    const who = e.changedBy ?? (e.kind === 'pr_opened' ? e.payload.authorKey : null);
    if (!who) continue;
    // Linking a PR is work on the PR; a parent link is work on the child.
    const subject = e.kind === 'link_pr_added' || e.kind === 'link_pr_removed' ? e.payload.prKey : e.entityKey;
    const n = nodeFor(subject);
    if (n) out.set(who, { node: n, at: e.occurredAt });
  }
  return out;
}

/**
 * A solar region's anchors (22 C7, 05 §8 K-11): each person's **last asteroid or enemy ship touched**
 * here, even someone else's. A Task's event counts as its parent's; a PR's (opened, merged, abandoned,
 * linked) as the work the PR serves, a Task standing for its parent. Only pieces on the board count (a
 * Feature's own event, or a piece since moved away, leaves the last one before it). Never a station
 * (G-8). With none, no anchor: the ship rests beside its planet's name (G-10).
 */
export function pieceAnchors(ctx: Pick<ProjectCtx, 'graph' | 's' | 'h'>): Map<CanonicalKey, { node: ViewNode; at: number }> {
  const pieces = new Map<CanonicalKey, ViewNode>();
  for (const n of ctx.graph.nodes) if ((n.kind === 'objective' || n.kind === 'threat') && n.selectable && !pieces.has(n.canonicalKey)) pieces.set(n.canonicalKey, n);
  /** The story or bug a key stands for: itself, or the nearest such ancestor (a Task's parent). */
  const pieceOf = (key: CanonicalKey): CanonicalKey | null => {
    let k: CanonicalKey | null = key;
    for (let i = 0; i < 8 && k; i++) {
      const wi = ctx.s.workItems.get(k);
      if (wi && wi.kind !== 'task') return k;
      k = wi?.parentKey ?? null;
    }
    return null;
  };
  const served = (pr: CanonicalKey): CanonicalKey[] => ctx.s.links.filter((l) => l.kind === 'pr' && l.fromKey === pr).map((l) => l.toKey);
  const last = new Map<CanonicalKey, { key: CanonicalKey; at: number }>();
  for (const e of ctx.h.events as AnyTimelineEvent[]) {
    if (e.occurredAt > ctx.s.atUtc) break;
    const who = e.changedBy ?? (e.kind === 'pr_opened' ? e.payload.authorKey : null);
    if (!who) continue;
    const pr = e.kind.startsWith('pr_') ? e.entityKey : e.kind === 'link_pr_added' || e.kind === 'link_pr_removed' ? e.payload.prKey : null;
    const keys = pr ? served(pr) : [e.entityKey];
    const piece = keys.map(pieceOf).find((k): k is CanonicalKey => !!k && pieces.has(k));
    if (piece) last.set(who, { key: piece, at: e.occurredAt });
  }
  return new Map([...last].map(([who, l]) => [who, { node: pieces.get(l.key)!, at: l.at }]));
}

/**
 * One ship per captain per scene (INV-07). It sits beside **where its captain last worked here**
 * (`activityAnchors`): a ship that moves to a child or a PR to work on it stays there, since that work
 * benefits this system, instead of commuting back to the parent. A captain with no activity here yet
 * sits beside a body (planet or anomaly) before a Task, and within that, beside the assignment held
 * longest, so a new concurrent assignment never relocates it (AC-21).
 */
/**
 * A ship's place on its lane's home track (the board, 06 §3), or null when it is away working
 * something outside its lane (or the scene isn't a board). On the track it sits under its latest work
 * in the lane, else under the item it holds longest.
 */
function homeOnTrack(ctx: ProjectCtx, who: CanonicalKey, worked: ViewNode, assigned: ViewNode, workedAt: number | undefined): { x: number; y: number; track: { rx: number; ry: number; span: number } } | null {
  const board = ctx.graph.board;
  if (!board) return null;
  const lane = board.heads.findIndex((h) => h.people.includes(who));
  const ring = board.rings.find((r) => r.lane === lane);
  if (!ring) return null;
  const ringOf = (n: ViewNode) => {
    const e = ctx.graph.edges.find((x) => x.kind === 'orbit' && x.to === n.projectionKey);
    return e?.geometry?.kind === 'ellipse' ? board.rings.find((r) => Math.abs(r.rx - e.geometry!.rx) < 1) : undefined;
  };
  const mine = (n: ViewNode) => (n.kind === 'planet' || n.kind === 'anomaly') && ringOf(n)?.lane === lane;
  const recent = workedAt !== undefined && ctx.s.atUtc - workedAt <= BOARD.awayHours * 3_600_000;
  if (!mine(worked) && recent) return null; // over there, working it
  const under = mine(worked) ? worked : assigned;
  const t = ring.track;
  const x = Math.max(-t.span, Math.min(t.span, under.world.x));
  return { x, y: t.ry * Math.sqrt(Math.max(0, 1 - (x / t.rx) ** 2)), track: { rx: t.rx, ry: t.ry, span: t.span } };
}

/** A ship's radius (a captain's own ship; a secondary-assignment beacon is smaller). */
const SHIP_R = 56;
/** A ship at rest by its own planet stands this far round from the planet's name (radians, 22 A9). */
export const REST_BY_NAME = 0.9;

/**
 * `homes` (v1 solar, 14 §4): a person's own place in the scene (their seat's planet). Someone with
 * a home but no assignable piece shown still gets their one ship (13 Q10), placed as any other ship.
 */
export function projectCaptains(ctx: ProjectCtx, assignable: ViewNode[], homes: ReadonlyMap<CanonicalKey, ViewNode> = new Map()): void {
  const worked = activityAnchors(ctx, homes.size > 0);
  /**
   * Where a solar ship rests (22 A9): never on a planet's face, which is the place for its work. At a
   * piece on a planet, just outside that planet's rim on the piece's side; at its own planet (nothing
   * worked yet), beside the planet's name, so the name and the ship read together. Elsewhere (a
   * frontier piece, a station; any v0 view) beside what it worked, as before.
   */
  const restAt = (n: ViewNode, fallbackDir: number): { to: ViewNode; dirX: number; dirY: number; work?: string } => {
    if (!homes.size) return { to: n, dirX: fallbackDir, dirY: 0 };
    const holder = n.kind === 'objective' || n.kind === 'threat' ? ctx.s.workItems.get(n.canonicalKey)?.assigneeKey : null;
    const planet = holder ? homes.get(holder) : undefined;
    if (planet) {
      const dx = n.world.x - planet.world.x;
      const dy = n.world.y - planet.world.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) return { to: planet, dirX: dx / d, dirY: dy / d, work: n.projectionKey };
      n = planet;
    }
    if (n.kind === 'seat') {
      const out = n.labelDir ?? { x: 1, y: 0 };
      // A turn off the name's own way out, so the ship stands beside the name, not under it.
      const a = Math.atan2(out.y, out.x) + REST_BY_NAME;
      return { to: n, dirX: Math.cos(a), dirY: Math.sin(a) };
    }
    return { to: n, dirX: fallbackDir, dirY: 0 };
  };
  const shipped = new Set<CanonicalKey>();
  const tier = (n: ViewNode) => (n.kind === 'missionPoint' ? 1 : 0);
  const since = (n: ViewNode) => ctx.s.workItems.get(n.canonicalKey)?.assignedAt ?? Infinity;
  for (let n of [...assignable].sort((a, b) => tier(a) - tier(b) || since(a) - since(b) || (a.slot ?? -1) - (b.slot ?? -1) || (a.projectionKey < b.projectionKey ? -1 : 1))) {
    const wi = ctx.s.workItems.get(n.canonicalKey);
    const who = wi?.assigneeKey;
    const captain = who ? ctx.captains.get(who) : undefined;
    if (!who || !captain) continue;
    const first = !shipped.has(who);
    shipped.add(who);
    // Secondary-assignment beacons are disabled for now; the assignee's name on each item's label
    // carries that information instead.
    if (!first) continue;
    const assigned = n;
    const last = worked.get(who);
    n = last?.node ?? n;
    // On a board (06 §3, decided 2026-10-09) a ship lives on its person's home track, in the gap above
    // their lane, under their latest work there. It goes over to something outside the lane (a shuttle,
    // a station, someone else's planet) only while that work is recent, then drifts home.
    const home = homeOnTrack(ctx, who, n, assigned, last?.at);
    // Beside the item, on the side away from its label (the inner side of a ring pair). The world
    // position is a hint; the renderer keeps it attached in screen terms (06 §2 sizing).
    const side = n.labelSide === 'right' ? -1 : 1;
    // On a board the ring is packed side by side, so a ship working away rides above its work.
    const above = !!ctx.graph.board;
    const r = first ? SHIP_R : 22;
    const off = n.world.r * 1.1 + r * 1.3;
    if (home) {
      ctx.graph.nodes.push({
        projectionKey: projectionKey(ctx.scene, who, 'ship'), canonicalKey: who, kind: 'captain', role: 'ship',
        world: { x: home.x, y: home.y, r }, track: home.track,
        stage: 'captain', seed: captain.shipSeed, label: captain.displayName, meta: `Captain · ${captain.callSign}`,
        avatar: captainAvatar(captain), labelSide: 'above', labelLayout: 'vertical',
        openable: false, selectable: true, labelled: true, flags: {}, evidence: [],
      });
      continue;
    }
    const rest = restAt(n, side);
    const roff = rest.to.world.r * 1.1 + r * 1.3;
    ctx.graph.nodes.push({
      projectionKey: projectionKey(ctx.scene, who, first ? 'ship' : `beacon:${n.canonicalKey}`),
      canonicalKey: who,
      kind: first ? 'captain' : 'assignmentBeacon',
      role: first ? 'ship' : 'beacon',
      world: above ? { x: n.world.x + side * off * 0.35, y: n.world.y - off, r } : { x: rest.to.world.x + rest.dirX * roff, y: rest.to.world.y + rest.dirY * roff, r },
      attach: above ? { to: n.projectionKey, dirX: side * 0.35, dirY: -1 } : { to: rest.to.projectionKey, dirX: rest.dirX, dirY: rest.dirY, ...(rest.work ? { work: rest.work } : {}) },
      stage: 'captain', seed: captain.shipSeed, label: captain.displayName, meta: `Captain · ${captain.callSign}`,
      avatar: captainAvatar(captain),
      labelSide: 'above', labelLayout: 'vertical',
      // Call signs label ships in close-ups; in a system view they'd crowd the bodies (hover shows them).
      openable: false, selectable: true, labelled: true, flags: {}, evidence: [],
    });
  }
  // A home with no ship yet: beside where its person last worked here, else beside the home itself.
  for (const [who, home] of [...homes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const captain = ctx.captains.get(who);
    if (!captain || shipped.has(who)) continue;
    shipped.add(who);
    const n = worked.get(who)?.node ?? home;
    const rest = restAt(n, n.labelSide === 'right' ? -1 : 1);
    const ship = shipBeside(ctx, who, captain, rest.to, rest.dirX, rest.dirY);
    if (rest.work && ship.attach) ship.attach.work = rest.work;
    ctx.graph.nodes.push(ship);
  }
}

/** A captain's ship attached beside `n`, along (dirX, dirY) in screen terms (06 §2 sizing). */
function shipBeside(ctx: ProjectCtx, who: CanonicalKey, captain: Captain, n: ViewNode, dirX: number, dirY: number): ViewNode {
  const off = n.world.r * 1.1 + SHIP_R * 1.3;
  return {
    projectionKey: projectionKey(ctx.scene, who, 'ship'), canonicalKey: who, kind: 'captain', role: 'ship',
    world: { x: n.world.x + dirX * off, y: n.world.y + dirY * off, r: SHIP_R }, attach: { to: n.projectionKey, dirX, dirY },
    stage: 'captain', seed: captain.shipSeed, label: captain.displayName, meta: `Captain · ${captain.callSign}`,
    avatar: captainAvatar(captain), labelSide: 'above', labelLayout: 'vertical',
    openable: false, selectable: true, labelled: true, flags: {}, evidence: [],
  };
}

/**
 * Guests' ships (v1, 2026-10-12): people with nothing of their own in the scene who helped with
 * someone else's work, each beside where it last helped (`guests`, by person). One ship per person
 * (INV-07). Ships sharing a node take turns round it (beside, then above, below, and the far side),
 * so their hits never overlap.
 */
export function projectGuests(ctx: ProjectCtx, guests: ReadonlyMap<CanonicalKey, ViewNode>, homes: ReadonlyMap<CanonicalKey, ViewNode> = new Map()): void {
  const shipped = new Set(ctx.graph.nodes.filter((n) => n.kind === 'captain').map((n) => n.canonicalKey));
  // How many ships already stand by each thing: what they attach to, and the piece they rest by.
  const taken = new Map<string, number>();
  for (const n of ctx.graph.nodes) for (const k of n.attach ? [n.attach.work ?? n.attach.to] : []) taken.set(k, (taken.get(k) ?? 0) + 1);
  for (const [who, n] of [...guests].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const captain = ctx.captains.get(who);
    if (!captain || shipped.has(who)) continue;
    shipped.add(who);
    const k = taken.get(n.projectionKey) ?? 0;
    taken.set(n.projectionKey, k + 1);
    // A guest working a piece on a planet stands off that planet on the piece's side, as a captain does
    // (22 A9), turned a little round it when others stand there too.
    const holder = n.kind === 'objective' || n.kind === 'threat' ? ctx.s.workItems.get(n.canonicalKey)?.assigneeKey : null;
    const planet = holder ? homes.get(holder) : undefined;
    const dx0 = planet ? n.world.x - planet.world.x : 0;
    const dy0 = planet ? n.world.y - planet.world.y : 0;
    if (planet && Math.hypot(dx0, dy0) > 1e-6) {
      const a = Math.atan2(dy0, dx0) + GUEST_FAN[k % GUEST_FAN.length]!;
      const ship = shipBeside(ctx, who, captain, planet, Math.cos(a), Math.sin(a));
      if (ship.attach) ship.attach.work = n.projectionKey;
      ctx.graph.nodes.push(ship);
      continue;
    }
    const side = n.labelSide === 'right' ? -1 : 1;
    const [dx, dy] = GUEST_TURNS[k % GUEST_TURNS.length]!;
    ctx.graph.nodes.push(shipBeside(ctx, who, captain, n, side * dx, dy));
  }
}

/** The k-th ship off one planet by one piece turns this far round it (radians, 22 A9). */
const GUEST_FAN: readonly number[] = [0, 0.45, -0.45, 0.9, -0.9];

/** Where the k-th ship beside one node goes (unit directions, mirrored to the node's free side). */
const GUEST_TURNS: readonly (readonly [number, number])[] = [[1, 0], [0.6, -0.8], [0.6, 0.8], [-1, 0], [-0.6, -0.8], [-0.6, 0.8]];

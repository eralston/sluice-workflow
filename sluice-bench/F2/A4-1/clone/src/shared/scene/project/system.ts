// 06 §3 — the system layout (the star system): an oblique orrery around a centre, children on rings,
// each child's mission points in a row beneath it, and the flank station belt. Its centre and children
// come from the level's source (a Feature and its Stories and Bugs, or a pod and its sprint's
// stories); the layout only places them. Pure.
import type { CanonicalKey } from '../../contracts/keys';
import type { ViewNode } from '../../contracts/view';
import type { LevelDef, SceneRef, SystemSource } from '../../hierarchy/types';
import { MAX_TASK_DOTS_IN_SYSTEM } from '../../limits';
import { snapshotAt } from '../../replay/snapshotAt';
import { BOARD, boardFrame, boardGuides, boardPlace, frameOutline } from '../board';
import { centeredRow, featureFormation, stationRowY } from '../layout';
import { SYSTEM_LAYOUT } from '../../limits';
import { artSeed, captainAvatar, orbitEdge, projectionKey, type ProjectCtx } from './ctx';
import { prLane, projectCaptains, projectTraffic, stationStep } from './traffic';

export function projectSystem(ctx: ProjectCtx, ref: SceneRef, src: SystemSource, next: LevelDef | undefined): void {
  const { h } = ctx;
  const starKey = projectionKey(ctx.scene, ref.key);
  const star = src.center(ctx, ref, starKey);
  if (!star) return; // not yet created at this playhead
  star.world = { x: 0, y: 0, r: star.stage === 'feature.whiteDwarf' ? 140 : 240 };
  star.labelSide = 'left'; // parent: horizontal layout, so context doesn't spend vertical space (06 §4)
  star.labelLayout = 'horizontal';
  ctx.graph.nodes.push(star);

  // The board (decided 2026-10-09): rings are people's lanes and the arc is the board's columns, in a
  // frame fixed over the whole history (INV-14 as amended). The ring formation stays one switch away.
  const order = src.order(h, ref);
  const board = SYSTEM_LAYOUT === 'board';
  const formation = board ? [] : featureFormation(order.length);
  // Shown at an instant: the source's own rule, on that instant's snapshot (only on a frame's first build).
  const shownAt = (t: number) => {
    const at = { ...ctx, s: snapshotAt(h, t, ctx.s.lens) };
    return new Set(order.filter((k) => src.child(at, ref, k, projectionKey(ctx.scene, k)) !== null));
  };
  const frame = board ? boardFrame(h, order, ctx.s.lens, (k) => ctx.captains.get(k)?.displayName ?? k, shownAt) : null;
  const shown = order.map((childKey, slot) => ({ childKey, slot, pk: projectionKey(ctx.scene, childKey) }))
    .map((c) => ({ ...c, node: src.child(ctx, ref, c.childKey, c.pk) }))
    .filter((c): c is typeof c & { node: ViewNode } => !!c.node);
  const places = frame ? boardPlace(frame, ctx.s, shown.map((c) => ({ key: c.childKey, stage: c.node.stage, slot: c.slot })), ctx.s.atUtc) : null;
  const bodies = new Map<CanonicalKey, ViewNode>();
  for (const { childKey, slot, pk, node } of shown) {
    const f = places?.get(childKey) ?? formation[slot]!;
    const seed = artSeed(childKey);
    const full = node.kind === 'planet' ? 116 + (seed % 17) : 108 + (seed % 9); // celestial: 2× (06 §2)
    const r = places?.get(childKey)?.compact ? full * BOARD.doneScale : full;
    node.world = { x: f.x, y: f.y, r };
    node.slot = slot;
    if (next) node.zoomTo = ctx.hier.format({ level: next.id, key: childKey });
    node.labelSide = f.labelSide;
    node.labelLayout = 'horizontal';
    ctx.graph.nodes.push(node);
    bodies.set(childKey, node);
    ctx.graph.edges.push(orbitEdge(starKey, pk, 0, 0, f.rx, f.ry, src.uncertain(ctx, ref, childKey)));

    // Mission points: a short row under the body (children below parent, as at every scale).
    const tks = src.points(ctx, childKey).slice(0, MAX_TASK_DOTS_IN_SYSTEM);
    tks.forEach((taskKey, i) => {
      const tpk = projectionKey(ctx.scene, taskKey);
      const t = src.point(ctx, taskKey, tpk);
      t.world = { x: node.world.x + (i - (tks.length - 1) / 2) * 34, y: node.world.y + r + 30, r: 11 };
      t.selectable = false;
      t.labelled = false;
      ctx.graph.nodes.push(t);
    });
  }
  if (frame) {
    const g = boardGuides(frame);
    const who = (p: CanonicalKey | null) => (p ? ctx.captains.get(p) : undefined);
    const heads = g.heads.map((x) => ({
      ...x,
      name: x.people.map((p) => who(p)?.displayName ?? 'Unassigned').join(', '),
      avatars: x.people.flatMap((p) => { const c = who(p); return c ? [captainAvatar(c)!] : []; }),
    }));
    ctx.graph.board = { rings: frame.rings.map((r) => ({ index: r.index, lane: r.lane, rx: r.rx, ry: r.ry, span: r.span, depth: r.depth, track: r.track })), ticks: g.ticks, heads, ...(g.columns.length ? { columns: g.columns } : {}) };
  }

  // Station row nearest the viewer, below the planets (06 §3).
  const subtree = new Set<CanonicalKey>([...bodies.keys()].flatMap((b) => [b, ...src.points(ctx, b)]));
  const outline = frame ? frameOutline(frame) : formation;
  const rowY = stationRowY(outline, star.world.r);
  const formationWidth = Math.max(0, ...outline.map((f) => Math.abs(f.x))) * 2;
  const featureBottom = Math.max(star.world.r, ...[...bodies.values()].map((b) => b.world.y + b.world.r));
  const featureLane = prLane(featureBottom, rowY - 150);
  ctx.graph.lane = { childrenBottom: featureBottom, laneOffset: featureLane.y - featureBottom, stationOffset: rowY - featureBottom, childLabelRow: true };
  projectTraffic(ctx, subtree, bodies, (count) => centeredRow(count, stationStep(count, formationWidth)).map((x) => [x, rowY]), 'x', 'feature', featureLane);
  projectCaptains(ctx, [...bodies.values()]);
}

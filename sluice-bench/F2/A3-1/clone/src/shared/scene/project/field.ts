// 06 §3 — the field layout (the sector): a field of small orreries, one per member, in balanced,
// centered rows. Its members and their miniatures come from the level's source (the Backlog's
// Features, the Sprints' pods), or a preview of what each member opens with (Solar's round, 19 P1,
// placed by preview.ts); the layout only places them. Pure.
import type { LevelDef, FieldSource, SceneRef } from '../../hierarchy/types';
import { MAX_CHILDREN_PER_FEATURE } from '../../limits';
import { balancedRows, centeredRow, featureFormation, MINI_FORMATION } from '../layout';
import { artSeed, orbitEdge, projectionKey, type ProjectCtx } from './ctx';
import { PREVIEW, projectPreview } from './preview';

const SECTOR_STEP_X = 760;
const SECTOR_STEP_Y = 520;

export function projectField(ctx: ProjectCtx, ref: SceneRef, src: FieldSource, next: LevelDef | undefined): void {
  const { h } = ctx;
  const order = src.order(h, ref);
  const counts = new Map(order.map((k) => [k, src.unexplored?.(h, k) ?? null]));
  const loadMore = src.loadMore?.(h) ?? null;
  // Balanced, centered rows (06 §3): 5 → 3+2, 6 → 3+3, every row symmetric about the same axis.
  // Spacing grows with the widest miniature, so dense systems never overlap their neighbors.
  // An unexplored member counts its children from their links; some may be loaded already (a Story
  // reparented under it), so its rings cover whichever is more.
  const childCount = (k: (typeof order)[number]) => {
    const c = counts.get(k);
    const known = src.miniOrder(h, k).length;
    return c ? Math.max(known, Math.min(MAX_CHILDREN_PER_FEATURE, c.planets + c.anomalies)) : known;
  };
  const minis = new Map(order.map((k) => [k, featureFormation(childCount(k), 1, MINI_FORMATION)]));
  // A source with previews (Solar's round, 19 P1) reserves the preview's fixed footprint instead, so
  // the field never reflows as history streams in (INV-14).
  const widest = src.preview ? PREVIEW.reachX : Math.max(0, ...[...minis.values()].flat().map((f) => f.rx));
  const deepest = src.preview ? PREVIEW.reachY : Math.max(0, ...[...minis.values()].flat().map((f) => f.y));
  const stepX = Math.max(SECTOR_STEP_X, widest * 2 + 160);
  const stepY = Math.max(SECTOR_STEP_Y, deepest + 340);
  const positions: { x: number; y: number }[] = [];
  balancedRows(order.length + (loadMore ? 1 : 0), 4).forEach((count, row) => {
    for (const x of centeredRow(count, stepX)) positions.push({ x, y: row * stepY });
  });
  order.forEach((key, slot) => {
    const starKey = projectionKey(ctx.scene, key);
    const star = src.member(ctx, ref, key, starKey);
    if (!star) return;
    const { x: cx, y: cy } = positions[slot]!;
    star.world = { x: cx, y: cy, r: star.stage === 'feature.whiteDwarf' ? 56 : 96 };
    star.slot = slot;
    if (next) star.zoomTo = ctx.hier.format({ level: next.id, key });
    star.labelSide = 'above'; // keeps the miniature system below the star visible
    star.labelLayout = 'vertical';
    const c = counts.get(key);
    if (c) {
      // Not yet explored (decided 2026-10-07): its children aren't loaded; the miniature shows how many.
      const n = c.planets + c.anomalies;
      star.flags = { ...star.flags, unexplored: true };
      star.meta2 = `${n} item${n === 1 ? '' : 's'} · not yet explored`;
      const mini = minis.get(key)!;
      for (let i = 0; i < Math.min(mini.length, n); i++) {
        const f = mini[i]!;
        const pk = `${starKey}|ghost${i}`;
        ctx.graph.nodes.push({
          projectionKey: pk, canonicalKey: key, kind: i < c.planets ? 'planet' : 'anomaly', role: 'unexplored',
          world: { x: cx + f.x, y: cy + f.y, r: 22 }, stage: 'unknown', seed: artSeed(pk as typeof key), label: '', openable: false, selectable: false, labelled: false,
          flags: { unexplored: true }, evidence: [],
        });
        ctx.graph.edges.push(orbitEdge(starKey, pk, cx, cy, f.rx, f.ry));
      }
    }
    ctx.graph.nodes.push(star);
    if (src.preview) {
      const p = src.preview(ctx, key);
      if (p) projectPreview(ctx, starKey, key, cx, cy, p);
      return;
    }
    // A miniature of the member's own system: decorative, not selectable (the member is the unit here).
    const mini = minis.get(key)!; // the same ring rule as inside the system: ring count ≈ child count
    src.miniOrder(h, key).forEach((childKey, i) => {
      const pk = projectionKey(ctx.scene, childKey);
      const n = src.mini(ctx, key, childKey, pk);
      const f = mini[i];
      if (!n || !f) return;
      n.world = { x: cx + f.x, y: cy + f.y, r: 22 };
      n.selectable = false;
      n.labelled = false;
      ctx.graph.nodes.push(n);
      ctx.graph.edges.push(orbitEdge(starKey, pk, cx, cy, f.rx, f.ry));
    });
  });
  if (loadMore) {
    // Load more (decided 2026-10-07): older members, in the next free slot. Its art is a beacon with a +.
    const { x, y } = positions[order.length]!;
    ctx.graph.nodes.push({
      projectionKey: `${ctx.scene}|loadMore`, canonicalKey: ref.key, kind: 'overflow', role: 'loadMore',
      world: { x, y, r: 70 }, stage: 'loadMore', seed: 0, label: 'Load more', meta: loadMore.meta, openable: false, selectable: true, labelled: true,
      labelSide: 'above', labelLayout: 'vertical', flags: {}, evidence: [],
    });
  }
}

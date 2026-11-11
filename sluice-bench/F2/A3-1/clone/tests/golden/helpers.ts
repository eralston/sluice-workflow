import stateMappingJson from '@config/state-mapping.json';
import type { ScopeHistory, StateMapping } from '@shared/contracts/history';
import type { Snapshot, ViewGraph } from '@shared/contracts/view';
import { toHistory, type Scenario } from '@fixtures/dsl';

export const mapping = stateMappingJson as StateMapping;
export const historyOf = (s: Scenario): ScopeHistory => toHistory(s, mapping);

/** Snapshots hold Maps; make them comparable and printable. */
export function plainSnapshot(s: Snapshot) {
  return { atUtc: s.atUtc, lens: s.lens, workItems: [...s.workItems.values()], prs: [...s.prs.values()], links: s.links };
}

/** A view graph without its evidence lists (they're long and covered elsewhere). */
export function plainGraph(g: ViewGraph) {
  return {
    sceneKey: g.sceneKey, atUtc: g.atUtc,
    nodes: g.nodes.map((n) => ({ pk: n.projectionKey, kind: n.kind, stage: n.stage, x: Math.round(n.world.x), y: Math.round(n.world.y), r: Math.round(n.world.r), label: n.label, meta: n.meta, meta2: n.meta2, flags: n.flags })),
    edges: g.edges.map((e) => ({ key: e.key, kind: e.kind, uncertain: e.uncertain })),
    trays: g.trays,
  };
}

// 03 §5 — pure projection from a snapshot to one scene's view graph (INV-09, INV-12, INV-14). A scene
// belongs to a hierarchy (decided 2026-10-07): its level says which layout draws it and which source
// feeds that layout. The Backlog hierarchy is the default.
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { SceneKey, Snapshot, ViewGraph } from '../contracts/view';
import { BACKLOG } from '../hierarchy/backlog';
import type { Hierarchy } from '../hierarchy/types';
import { makeCtx, type ProjectOptions } from './project/ctx';
import { projectField } from './project/field';
import { projectRadar } from './project/radar';
import { projectSolar } from './project/solar';
import { projectSystem } from './project/system';

export { artSeed, projectionKey, type ProjectOptions } from './project/ctx';
export { GALAXY_MAX_COLUMNS, GALAXY_R, GALAXY_STEP_X, GALAXY_STEP_Y, galaxyColumns, projectGalaxy, type GalaxyProject } from './project/galaxy';

export function projectScene(h: ScopeHistory, s: Snapshot, scene: SceneKey, layoutVersion: number, hier: Hierarchy = BACKLOG, opts: ProjectOptions = {}): ViewGraph {
  const graph: ViewGraph = {
    sceneKey: scene, atUtc: s.atUtc, layoutVersion, nodes: [], edges: [],
    trays: { uncharted: hier.uncharted(s, h), unlinked: [...h.unlinkedPrs] },
    coverage: h.coverage,
  };
  const at = hier.resolve(scene);
  if (!at) throw new Error(`projectScene: use projectGalaxy for ${scene}`);
  const ctx = makeCtx(h, s, scene, layoutVersion, graph, hier, opts);
  const next = hier.levels[at.index + 1];
  const def = at.def;
  if (def.layout === 'field') projectField(ctx, at.ref, def.source, next);
  else if (def.layout === 'system') projectSystem(ctx, at.ref, def.source, next);
  else if (def.layout === 'radar') projectRadar(ctx, at.ref, def.source);
  else projectSolar(ctx, at.ref, def.source); // v1 (14 §1.2): a solar region
  graph.nodes.sort((a, b) => (a.projectionKey < b.projectionKey ? -1 : 1));
  graph.edges.sort((a, b) => (a.key < b.key ? -1 : 1));
  return graph;
}

/**
 * A scope scene's only member, if exactly one ever joined it in the loaded history (06 §3, decided
 * 2026-10-03): navigation passes straight through such a sector to its system. Counted over the whole
 * history, never at the playhead, so a seek never changes it.
 */
export function soleFeature(h: ScopeHistory, scene: SceneKey, hier: Hierarchy = BACKLOG): CanonicalKey | null {
  const at = hier.resolve(scene);
  if (!at || at.def.layout !== 'field') return null;
  return at.def.source.passThrough?.(h, at.ref) ?? null;
}

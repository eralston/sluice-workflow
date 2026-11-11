// The hierarchy builder (decided 2026-10-07): chain levels under the galaxy, then add the functions
// that walk an entity's family (goTo, follow, focus, Uncharted). It checks the chain and derives the
// scene key codec from the levels. Pure.
import type { SceneKey } from '../contracts/view';
import { formatScene, parseScene, type LevelTable } from './sceneKey';
import type { Hierarchy, LevelDef } from './types';

/** Everything a hierarchy declares beyond its levels. */
export type HierarchyRest = Omit<Hierarchy, 'id' | 'levels' | 'resolve' | 'format'>;

export interface ChainBuilder {
  then(level: LevelDef): ChainBuilder;
  build(rest: HierarchyRest): Hierarchy;
}

export function chain(id: string, levels: readonly LevelDef[] = []): ChainBuilder {
  return {
    then: (level) => chain(id, [...levels, level]),
    build: (rest) => buildHierarchy(id, levels, rest),
  };
}

function buildHierarchy(id: string, levels: readonly LevelDef[], rest: HierarchyRest): Hierarchy {
  if (!levels.length) throw new Error(`hierarchy ${id}: no levels`);
  const ids = levels.map((l) => l.id);
  if (new Set(ids).size !== ids.length) throw new Error(`hierarchy ${id}: level ids repeat (${ids.join(', ')})`);
  if (ids.includes('galaxy')) throw new Error(`hierarchy ${id}: 'galaxy' is the root, not a level`);
  const radar = levels.findIndex((l) => l.layout === 'radar');
  if (radar >= 0 && radar !== levels.length - 1) throw new Error(`hierarchy ${id}: a radar level must be last`);
  for (const l of levels) if (l.variants?.some((v) => !v || v.includes(':'))) throw new Error(`hierarchy ${id}: bad variant on ${l.id}`);
  const table: LevelTable = new Map(levels.map((l) => [l.id, { variants: l.variants }]));
  const index = new Map(levels.map((l, i) => [l.id, i]));
  return {
    id, levels, ...rest,
    resolve(scene: string) {
      const ref = parseScene(scene, table);
      if (!ref) return null;
      const i = index.get(ref.level)!;
      return { def: levels[i]!, index: i, ref };
    },
    format: (ref): SceneKey => formatScene(ref),
  };
}

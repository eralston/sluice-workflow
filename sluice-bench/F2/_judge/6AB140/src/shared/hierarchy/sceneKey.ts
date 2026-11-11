// The scene key codec (pluggable hierarchy, decided 2026-10-07): the one place scene keys are built
// and read. A key is the level id, an optional variant, and a canonical key, joined by ':' — e.g.
// `sector:area:<areaKey>`, `feature:<wiKey>`. Canonical keys contain colons themselves, so parsing
// needs the level table: it says which levels take a variant token. Pure.
import type { CanonicalKey } from '../contracts/keys';
import type { SceneKey } from '../contracts/view';

/** The galaxy: the root scene, shared by every hierarchy. It has no ref. */
export const ROOT_SCENE = 'galaxy';

export interface SceneRef {
  level: string;
  /** A level's sub-kind, e.g. a sector's 'area' or 'epic'. */
  variant?: string;
  key: CanonicalKey;
}

export type LevelTable = ReadonlyMap<string, { variants?: readonly string[] }>;

export function formatScene(ref: SceneRef): SceneKey {
  return (ref.variant ? `${ref.level}:${ref.variant}:${ref.key}` : `${ref.level}:${ref.key}`) as SceneKey;
}

/** A scene's ref, or null for the root or a key this table doesn't know. */
export function parseScene(scene: string, table: LevelTable): SceneRef | null {
  if (scene === ROOT_SCENE) return null;
  const i = scene.indexOf(':');
  if (i < 0) return null;
  const level = scene.slice(0, i);
  const def = table.get(level);
  if (!def) return null;
  const rest = scene.slice(i + 1);
  if (!def.variants) return { level, key: rest as CanonicalKey };
  const j = rest.indexOf(':');
  const variant = j < 0 ? '' : rest.slice(0, j);
  if (!def.variants.includes(variant)) return null;
  return { level, variant, key: rest.slice(j + 1) as CanonicalKey };
}

/** The level id at the front of a key ('galaxy' for the root). Needs no table. */
export function levelIdOf(scene: string): string {
  const i = scene.indexOf(':');
  return i < 0 ? scene : scene.slice(0, i);
}

export const isRootScene = (scene: string | undefined | null): boolean => scene === ROOT_SCENE;

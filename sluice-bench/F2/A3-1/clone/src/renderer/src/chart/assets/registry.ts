// 14 §2.8 — the asset registry (v1). A v1 node names a neutral role in `ViewNode.asset` (shared
// projection can't know theme words); the active theme binds each role to one of its registered
// assets. Nodes without `asset` (every v0 node) get undefined, and GraphScene keeps its v0 switch.
import type { ViewNode } from '@shared/contracts/view';
import type { AssetDef } from './types';

const defs = new Map<string, AssetDef>();
/** Role (or any alias) → asset id, from the theme's `roleAsset` table. */
const bound = new Map<string, string>();

/** Registers an asset; a later def with the same id replaces it (a theme switch, a hot reload). */
export function registerAsset(def: AssetDef): void {
  defs.set(def.id, def);
}

/** Points a neutral id (`'objective'`) at a registered asset id (the theme's choice). */
export function bindAsset(role: string, id: string): void {
  bound.set(role, id);
}

/** The asset by its own id, or through a binding. */
export function assetById(id: string): AssetDef | undefined {
  return defs.get(bound.get(id) ?? id);
}

/** The asset that draws a node, or undefined for the v0 switch. */
export function assetFor(n: Pick<ViewNode, 'asset'>): AssetDef | undefined {
  return n.asset === undefined ? undefined : assetById(n.asset);
}

/** Every registered asset, by id (gallery, registry tests). */
export function allAssets(): AssetDef[] {
  return [...defs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Tests only: forget every asset and binding. */
export function resetAssets(): void {
  defs.clear();
  bound.clear();
}

// 06 §3 — the galaxy: one per project, in a grid that grows downward. Built from project summaries,
// not a scope bundle, and shared by every hierarchy. Moved out of projectScene.ts unchanged.
import type { CanonicalKey } from '../../contracts/keys';
import type { ViewGraph, ViewNode } from '../../contracts/view';
import { centeredRow, gridRows } from '../layout';
import { artSeed, projectionKey } from './ctx';

export interface GalaxyProject { key: CanonicalKey; name: string; activity: number; favoriteCount: number; pinned?: boolean; charted?: boolean; recentAt?: number }

/** The galaxy grid (decided 2026-10-07): at most this many columns; rows grow downward without limit. */
export const GALAXY_MAX_COLUMNS = 8;
export const GALAXY_R = 300;
/** Pitch between galaxy centres, in world units: room for the galaxy and its compact label below. */
export const GALAXY_STEP_X = 820;
export const GALAXY_STEP_Y = 820;

/**
 * What a galaxy's subtitle says: `full` is v0's (`Project · 2 saved areas · 136 events this week`);
 * `counts` is Solar's holo plate (19 L3), the same counts without "Project" (`2 areas · …`).
 */
export type GalaxyMeta = 'full' | 'counts';

function galaxyMeta(p: GalaxyProject, style: GalaxyMeta): string {
  // Nothing synced yet (ADO mode) says so, rather than a misleading "0 events" (decided 2026-10-07).
  const events = p.charted === false ? 'not charted yet' : `${p.activity} events this week`;
  const s = p.favoriteCount === 1 ? '' : 's';
  return style === 'counts' ? `${p.favoriteCount} area${s} · ${events}` : `Project · ${p.favoriteCount} saved area${s} · ${events}`;
}

export function galaxyColumns(n: number): number {
  return Math.max(1, Math.min(GALAXY_MAX_COLUMNS, Math.ceil(Math.sqrt(n * 1.6))));
}

export function projectGalaxy(projects: GalaxyProject[], atUtc: number, layoutVersion: number, meta: GalaxyMeta = 'full'): ViewGraph {
  // Pinned first, newest of your own recent work first among them, then A–Z (decided 2026-10-07).
  // Recency by your own activity, never an amount (INV-19).
  const byName = (a: GalaxyProject, b: GalaxyProject) =>
    Number(!!b.pinned) - Number(!!a.pinned) || (a.pinned ? (b.recentAt ?? 0) - (a.recentAt ?? 0) : 0)
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const sorted = [...projects].sort(byName);
  const positions: { x: number; y: number }[] = [];
  gridRows(sorted.length, galaxyColumns(sorted.length)).forEach((count, row) => {
    for (const x of centeredRow(count, GALAXY_STEP_X)) positions.push({ x, y: row * GALAXY_STEP_Y });
  });
  const nodes: ViewNode[] = sorted.map((p, i) => ({
    projectionKey: projectionKey('galaxy', p.key),
    canonicalKey: p.key,
    kind: 'galaxy',
    world: { ...positions[i]!, r: GALAXY_R },
    stage: 'galaxy',
    seed: artSeed(p.key),
    label: p.name,
    meta: galaxyMeta(p, meta),
    openable: false, selectable: true, labelled: true, labelCompact: true, slot: i,
    // Quiet: nothing saved and nothing recorded this range. Same size, drawn dimmer (decided 2026-10-07).
    flags: p.activity === 0 && p.favoriteCount === 0 ? { quiet: true } : {}, evidence: [],
  }));
  return {
    sceneKey: 'galaxy', atUtc, layoutVersion, nodes, edges: [],
    trays: { uncharted: [], unlinked: [] },
    coverage: { syncedAt: null, historyFrom: atUtc, partial: false, notes: [] },
  };
}

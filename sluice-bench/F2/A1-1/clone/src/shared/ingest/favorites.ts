// 02 §2, AC-32 — saved Area Path favorites are keyed by classification-node ID, so a renamed area
// keeps its favorite (the path follows the node). A node that no longer resolves leaves the favorite
// marked unavailable, to be repaired (pointed at another area) or removed. Pure.
import type { AreaNodeFact } from '../contracts/facts';

export interface FavoriteRow { projectId: string; nodeId: number; path: string; label: string; displayOrder: number; unavailable: boolean }

export function reconcileFavorites<T extends FavoriteRow>(favorites: T[], nodes: AreaNodeFact[]): T[] {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  return favorites.map((f) => {
    const n = byId.get(f.nodeId);
    if (!n) return { ...f, unavailable: true };
    // Renamed areas carry their own name, unless the user gave the favorite a label of their own.
    const ownLabel = f.label !== (f.path.split('\\').pop() ?? f.path);
    return { ...f, unavailable: false, path: n.path, label: ownLabel ? f.label : (n.path.split('\\').pop() ?? n.path) };
  });
}

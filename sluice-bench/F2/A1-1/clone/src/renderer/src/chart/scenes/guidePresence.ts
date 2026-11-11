// Whether a guide that shows only for some nodes (the frontier belt, 19 S2) is wanted in play: while
// one of its nodes is drawn, or one that kept it shown is still leaving the scene. So the belt fades
// in as the first unassigned piece comes into view (its radar contact, its rift, its fade-up), not as
// the beat lands, and out once the last has gone. Its nodes are the graph's, except those a moment
// holds as they were before its beat (a reassigned piece, until it flies). Pure, so it's tested
// without Pixi; GraphScene asks it every frame.

/** A node's part in a guide as it was before a beat (`was`: it kept the guide shown), held by `count` moments. */
export interface HeldMember { was: boolean; count: number }

/** Hold each of `pks` as `before` (the guide's list before the beat) had it, counted. */
export function holdMembers(held: Map<string, HeldMember>, before: readonly string[], pks: readonly string[]): void {
  const was = new Set(before);
  for (const pk of pks) {
    const h = held.get(pk);
    if (h) h.count++;
    else held.set(pk, { was: was.has(pk), count: 1 });
  }
}

/** Let each of `pks` follow the graph again once every moment holding it has let go. */
export function releaseMembers(held: Map<string, HeldMember>, pks: readonly string[]): void {
  for (const pk of pks) {
    const h = held.get(pk);
    if (h && --h.count <= 0) held.delete(pk);
  }
}

/** The nodes keeping a guide shown now: the graph's list, with each held node as it was. */
export function guideMembers(listed: readonly string[], held?: ReadonlyMap<string, HeldMember>): Set<string> {
  const out = new Set(listed);
  if (held) for (const [pk, h] of held) if (h.was) out.add(pk); else out.delete(pk);
  return out;
}

/** Wanted: one of `members` is drawn now, or `leaving` nodes that kept it shown are still on their way out. */
export function guideWanted(members: ReadonlySet<string>, drawn: (pk: string) => boolean, leaving: number): boolean {
  if (leaving > 0) return true;
  for (const pk of members) if (drawn(pk)) return true;
  return false;
}

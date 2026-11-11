// Classification paths (Area Path, Iteration Path): `A\B\C`. One rule for "under", shared by the
// derivation, the hierarchies, the stream, and the fixtures. Pure.

/** `path` is `root` or anywhere beneath it. */
export const underPath = (path: string, root: string): boolean => path === root || path.startsWith(`${root}\\`);

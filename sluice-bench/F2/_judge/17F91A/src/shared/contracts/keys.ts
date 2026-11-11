// 03 §1 — identity and keys. Names are never keys (INV-22).

export type UtcMs = number;
export type Guid = string;
export type OrgKey = Guid;

export type CanonicalKey =
  | `proj:${OrgKey}:${Guid}`
  | `wi:${OrgKey}:${number}`
  | `repo:${OrgKey}:${Guid}`
  | `pr:${OrgKey}:${Guid}:${number}`
  | `id:${OrgKey}:${Guid}`
  | `area:${OrgKey}:${Guid}:${number}`
  /** An iteration (a sprint) in a project's iteration tree (decided 2026-10-07). */
  | `iter:${OrgKey}:${Guid}:${number}`;

const GUID_RE = /^\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i;

/** Lowercase, hyphenated 8-4-4-4-12. Accepts braces, uppercase, or no hyphens. Throws otherwise. */
export function normalizeGuid(raw: string): Guid {
  const m = GUID_RE.exec(raw.trim());
  if (!m) throw new Error(`Not a GUID: ${JSON.stringify(raw)}`);
  return m.slice(1, 6).join('-').toLowerCase();
}

export const keys = {
  project: (org: OrgKey, projectId: Guid) => `proj:${org}:${projectId}` as const,
  workItem: (org: OrgKey, id: number) => `wi:${org}:${id}` as const,
  repo: (org: OrgKey, repoId: Guid) => `repo:${org}:${repoId}` as const,
  pr: (org: OrgKey, repoId: Guid, prId: number) => `pr:${org}:${repoId}:${prId}` as const,
  identity: (org: OrgKey, identityId: Guid) => `id:${org}:${identityId}` as const,
  area: (org: OrgKey, projectId: Guid, nodeId: number) => `area:${org}:${projectId}:${nodeId}` as const,
  iteration: (org: OrgKey, projectId: Guid, nodeId: number) => `iter:${org}:${projectId}:${nodeId}` as const,
};

export type KeyKind = 'proj' | 'wi' | 'repo' | 'pr' | 'id' | 'area' | 'iter';

export function keyKind(key: CanonicalKey): KeyKind {
  return key.slice(0, key.indexOf(':')) as KeyKind;
}

/** Work item ID from a `wi:` key. */
export function workItemId(key: CanonicalKey): number {
  if (keyKind(key) !== 'wi') throw new Error(`Not a work item key: ${key}`);
  return Number(key.slice(key.lastIndexOf(':') + 1));
}

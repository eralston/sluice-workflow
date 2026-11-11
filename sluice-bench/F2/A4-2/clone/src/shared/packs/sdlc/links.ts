// Read-only links back to Azure DevOps (INV-21): a container's web page. Nothing calls it since 19 L6
// (a station's rows are its PRs); kept for a future container row. Only an https://dev.azure.com/{org} address is ever returned; anything else is null, and
// the app opens nothing it didn't build from the org's own URL. Pure.
import type { ScopeHistory } from '../../contracts/history';
import { keyKind, workItemId, type CanonicalKey } from '../../contracts/keys';

/** The org's web root, from an ADO address under it. */
const ORG_RE = /^https:\/\/dev\.azure\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*(?=\/|$)/;

/** A work item's web page: its own address when the bundle has one, else built from the project's org. */
export function containerUrl(h: ScopeHistory, key: CanonicalKey): string | null {
  if (keyKind(key) !== 'wi') return null;
  const own = h.entities.workItems.find((w) => w.key === key)?.adoUrl ?? '';
  if (ORG_RE.test(own)) return own;
  const project = h.entities.projects.find((p) => p.key === h.scope.projectKey)?.adoUrl ?? '';
  const org = ORG_RE.exec(project)?.[0];
  return org ? `${org}/_workitems/edit/${workItemId(key)}` : null;
}

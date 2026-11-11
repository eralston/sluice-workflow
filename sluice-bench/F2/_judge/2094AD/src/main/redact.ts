// The dev log's redaction (decided 2026-10-07). The log is for analysing behaviour, never for
// reading the tenant's data (INV-18): every identifier becomes a salted, stable hash (the same object
// reads the same across runs on this Mac, but can't be looked up or reversed), and free text is kept
// only in fields that never carry it. Names, titles, paths, typed text, ADO messages, and the PAT are
// never written (INV-17). Pure: the salt and the guard terms are passed in.
import { createHmac } from 'node:crypto';

const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const CANONICAL = /^(proj|wi|repo|pr|id|area):/;
const SCENE = /^(sector:area|sector:epic|feature|body):/;
/** Numbers in these fields are identifiers (work item, PR, revision, node IDs), so they're hashed. */
const ID_FIELDS = new Set(['id', 'itemId', 'prId', 'rev', 'updateId', 'nodeId', 'epicId']);
/** Strings are kept only in these fields: none of them ever carries tenant text. */
const SAFE_TEXT = new Set([
  'kind', 'phase', 'family', 'channel', 'status', 'code', 'key', 'button', 'scene', 'tag', 'role', 'mode', 'lens', 'rate',
  'logName', 'method', 'level', 'outcome', 'type', 'nodeKind', 'side', 'via', 'source', 'classification', 'errorClass', 'stack',
  'template', 'version', 'platform', 'cls', 'field', 'tab', 'reason', 'fixture', 'table', 'setting', 'storage', 'retryAfter', 'target', 'mods',
]);
const URL_FIELDS = new Set(['endpoint', 'url']);
/** A kept string must also look like a short token: no sentences, no paths. */
const TOKENISH = /^[\w .:+\-−?/#*,()=<>→↑↓←⌘⇧]{0,80}$/u;
/** The fixed words of ADO's REST paths: kept in URLs; every other segment is hashed. */
const API_WORDS = new Set([
  '_apis', 'wit', 'git', 'wiql', 'workitems', 'workItems', 'workitemsbatch', 'revisions', 'updates', 'repositories', 'pullrequests',
  'pullRequests', 'reviewers', 'threads', 'projects', 'connectionData', 'classificationnodes', 'Areas', 'workitemtypes', 'states',
  'GraphProfile', 'MemberAvatars', 'Contribution', 'HierarchyQuery', 'graph', 'Subjects', 'avatars', '_api', '_common', 'identityImage',
]);
const SAFE_QUERY = new Set(['api-version', '$top', '$skip', '$depth', 'status', 'queryTimeRangeType', 'minTime', 'maxTime', 'errorPolicy', '$expand']);

export interface Redactor {
  hash(v: string | number): string;
  key(k: string): string;
  url(u: string): string;
  /** A log entry, redacted field by field; null when the guard finds tenant text anyway. */
  entry(e: Record<string, unknown>): Record<string, unknown>;
}

export function makeRedactor(salt: Buffer | string, guard: () => string[] = () => []): Redactor {
  const hash = (v: string | number) => `h:${createHmac('sha256', salt).update(String(v).toLowerCase()).digest('hex').slice(0, 10)}`;
  const key = (k: string) => {
    const [kind, ...rest] = k.split(':');
    return [kind, ...rest.map(hash)].join(':');
  };
  const scene = (s: string) => {
    const m = SCENE.exec(s)!;
    return `${m[1]}:${key(s.slice(m[0].length))}`;
  };
  const url = (u: string) => {
    let parsed: URL;
    try { parsed = new URL(u, 'https://x.invalid'); } catch { return `<text:${u.length}>`; }
    const path = parsed.pathname.split('/').map((seg) => (!seg || API_WORDS.has(seg) ? seg : hash(decodeURIComponent(seg)))).join('/');
    const q = [...parsed.searchParams].map(([k, v]) => {
      const bare = k.replace(/^searchCriteria\./, '');
      return `${k}=${SAFE_QUERY.has(k) || SAFE_QUERY.has(bare) ? v : hash(v)}`;
    });
    return q.length ? `${path}?${q.join('&')}` : path;
  };
  const value = (field: string, v: unknown): unknown => {
    if (v === null || v === undefined || typeof v === 'boolean') return v;
    if (typeof v === 'number') return ID_FIELDS.has(field) ? hash(v) : v;
    if (typeof v === 'string') {
      if (CANONICAL.test(v)) return key(v);
      if (SCENE.test(v)) return scene(v);
      if (URL_FIELDS.has(field)) return url(v);
      if (SAFE_TEXT.has(field) && TOKENISH.test(v)) return v.replace(GUID, (g) => hash(g));
      return `<text:${v.length}>`;
    }
    if (Array.isArray(v)) return v.map((x) => value(field, x));
    if (typeof v === 'object') return walk(v as Record<string, unknown>);
    return `<${typeof v}>`;
  };
  const walk = (o: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(k, v)]));
  const entry = (e: Record<string, unknown>) => {
    const out = walk(e);
    // Defence in depth: a known name, the org URL, or the token's start anywhere means drop the line.
    const line = JSON.stringify(out).toLowerCase();
    const esc = (t: string) => t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const leak = guard().some((term) => term.length >= 4 && line.includes(term.toLowerCase()) && new RegExp(`(^|[^\\p{L}\\p{N}_.-])${esc(term)}($|[^\\p{L}\\p{N}_.-])`, 'u').test(line));
    return leak ? { kind: 'redaction-dropped', was: typeof e.kind === 'string' && TOKENISH.test(e.kind) ? e.kind : '<kind>' } : out;
  };
  return { hash, key, url, entry };
}

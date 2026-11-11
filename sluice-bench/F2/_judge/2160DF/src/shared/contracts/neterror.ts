// Network errors, explained (decided 2026-10-07): any failed ADO call carries what's needed to
// understand it. That's the HTTP status and what it means here, the endpoint, ADO's error code, the
// throttling headers, how many attempts were made, and the literal response body (shown only in the
// app, on this Mac; never logged). Request headers, and so the PAT, are never included (INV-17).
import { z } from 'zod';

export const netErrorSchema = z.object({
  family: z.string(),
  method: z.string(),
  /** The request path and query (no host credentials, no headers). */
  endpoint: z.string(),
  /** 0 when ADO couldn't be reached at all. */
  status: z.number().int(),
  code: z.string().optional(),
  message: z.string().optional(),
  retryAfter: z.string().optional(),
  rateLimit: z.object({ remaining: z.string().optional(), reset: z.string().optional(), resource: z.string().optional(), delay: z.string().optional() }).optional(),
  /** Tries made for this call, retries after throttling included; and the time spent waiting between them. */
  attempts: z.number().int(),
  waitedMs: z.number().int(),
  /** The literal response body, truncated. */
  body: z.string(),
  at: z.number().int(),
});
export type NetError = z.infer<typeof netErrorSchema>;

export const NET_BODY_MAX = 8000;

/** What a failure means here, in plain words, with what to do about it. */
/**
 * Failures that are expected, and so not trouble (decided 2026-10-09). A picture is a visual
 * nice-to-have, not data, so when ADO won't give us one — 401 (this PAT can't read other people's
 * pictures) or 404 (there isn't one we can see) — it is quiet: once per person, every time, and it
 * says nothing about the connection. Anything else that goes wrong with a picture (a 403, a 5xx, no
 * response) is still trouble. A *real* expired token fails every other family too, and those still
 * count, so this can't hide it. A team's settings refused (401, decided 2026-10-26) is quiet for the
 * same reason: a token can read the work and not one team's settings, and the app carries on without them.
 */
export const isQuiet = (family: string, status: number): boolean =>
  (family === 'avatar' && (status === 401 || status === 404)) || ((family === 'teams' || family === 'builds') && status === 401);

/**
 * Whether a failure says the token is refused, where that stops the work (decided 2026-10-22): a 401 on
 * anything but the quiet ones (`isQuiet`, above: a picture, a team's settings or board, builds). Not in that
 * list but handled alike by the PR stat code: a PR's threads 401 (`vso.threads_full`, family `review`, 04 §1). A token can read the work and still be
 * refused one team's settings (the Project and team scope, or a team that limits who sees them): the
 * app carries on without them (`teams-unavailable`), so that 401 says nothing about the token.
 */
export const refusesToken = (family: string, status: number): boolean => status === 401 && !isQuiet(family, 401);

/**
 * What a failure does to a sync (slice 7, decided 2026-10-10):
 * - `stop`: the token was refused (401). Stop, and ask for a new one.
 * - `gone`: this one thing can't be read (403, 404). The scope goes partial; the thing keeps its last
 *   known facts, marked stale, or is listed as missing if it was never read.
 * - `transient`: it may pass (no response, 429, 5xx), and retries already ran out. On one item, the
 *   same as `gone` for this sync, retried on the next; on a scope-level call, the sync fails.
 * - `error`: anything else (a 400, a 409): a mistake in the request, never hidden. It throws.
 */
export type FailureTier = 'stop' | 'gone' | 'transient' | 'error';
export function failureTier(status: number): FailureTier {
  if (status === 401) return 'stop';
  if (status === 403 || status === 404 || status === 410) return 'gone';
  if (status === 0 || status === 408 || status === 429 || status >= 500) return 'transient';
  return 'error';
}

export function classify(e: Pick<NetError, 'status' | 'code' | 'family'>): { label: string; meaning: string; advice: string } {
  const code = e.code ?? '';
  // A team's settings (which Area Paths and sprints it owns): the token works elsewhere, and the app
  // carries on without them, so this is not "enter a new token".
  if (e.status === 401 && e.family === 'teams') {
    return {
      label: '401 · Team settings not readable',
      meaning: 'ADO won’t let this token read this team’s settings (the Area Paths and sprints it owns). Everything else the token asks for works.',
      advice: 'Nothing to fix unless a team’s sprints or Area Paths are missing: then check the token has Project and team: read, and that the team lets you see its settings.',
    };
  }
  // Builds (a station's last run): the token lacks Build (read); the stations just show no run line.
  if (e.status === 401 && e.family === 'builds') {
    return {
      label: '401 · Build not readable',
      meaning: 'ADO won’t let this token read builds (it lacks Build: read). Everything else the token asks for works.',
      advice: 'Nothing to fix unless you want each station’s last run: then add the Build (read) scope to the token.',
    };
  }
  // Not "enter a new token" and not "refresh the project list": the token is fine, ADO just won't give
  // us this picture (it can't read it, or there isn't one we can see). Initials stand in.
  if (isQuiet(e.family, e.status)) {
    return {
      label: `${e.status} · ${e.status === 401 ? 'Pictures not readable' : 'No picture'}`,
      meaning: e.status === 401
        ? 'ADO won’t let this token read teammates’ pictures. Each one answers 401; everything else works.'
        : 'ADO has no picture for this person that this token can see: none uploaded, or not readable. Everything else works.',
      advice: 'Nothing to fix. Their initials are shown instead, and you can add a picture by hand later.',
    };
  }
  if (e.status === 0) return { label: 'Network', meaning: 'ADO couldn’t be reached: no response came back.', advice: 'Check your connection or VPN, then try again.' };
  if (e.status === 429 || code === 'TF400733') {
    return {
      label: '429 · Throttled', meaning: 'ADO is limiting how fast this app may call it (200 TSTUs per sliding 5 minutes per user). The app waited and retried, then gave up.',
      advice: 'Wait a few minutes and sync again; a smaller scope makes fewer calls.',
    };
  }
  if (e.status === 401) return { label: '401 · Not signed in', meaning: 'ADO refused the token: it’s expired, revoked, or not for this organization.', advice: 'Enter a new personal access token from the mode chip.' };
  if (e.status === 403) {
    return {
      label: '403 · Denied', meaning: e.family === 'repos' || e.family === 'prs' || e.family === 'review'
        ? 'The token, or its owner’s access level, can’t read this. Repos and pull requests need Basic access; Stakeholder access can’t read them.'
        : 'The token, or its owner’s permissions, can’t read this.',
      advice: 'Check the token’s scopes (Work items, Code, Project and team: read) and your access level.',
    };
  }
  if (e.status === 404) return { label: '404 · Not found', meaning: 'ADO has nothing at this address: it was deleted, moved, or isn’t visible to you.', advice: 'Refresh the project list; if it persists, check the item in ADO.' };
  if (e.status === 400 && code === 'VS402337') return { label: '400 · Too many results', meaning: 'A query hit ADO’s 20,000-result cap.', advice: 'Choose a smaller Area Path.' };
  if (e.status === 400) return { label: '400 · Bad request', meaning: 'ADO rejected the request as written (often a query or API version it doesn’t accept).', advice: 'Report it with the details below; no work data needs to be shared.' };
  if (e.status === 408 || e.status === 504) return { label: `${e.status} · Timed out`, meaning: 'ADO took too long to answer.', advice: 'Try again; a smaller scope makes lighter queries.' };
  if (e.status === 503) return { label: '503 · Unavailable', meaning: 'ADO is temporarily unavailable or shedding load.', advice: 'Wait a few minutes and try again.' };
  if (e.status >= 500) return { label: `${e.status} · Server error`, meaning: 'ADO failed on its side.', advice: 'Try again later; check the Azure DevOps status page if it persists.' };
  return { label: `${e.status}`, meaning: 'ADO answered with an unexpected status.', advice: 'See the response below.' };
}

/** IPC carries errors as messages only, so a NetError rides inside one, after this marker. */
export const NET_ERROR_MARK = '\u0001NETERR';
export function encodeNetError(message: string, e: NetError): string {
  return `${message}${NET_ERROR_MARK}${JSON.stringify(e)}`;
}
export function decodeNetError(message: string): { message: string; net: NetError | null } {
  const i = message.indexOf(NET_ERROR_MARK);
  const clean = (m: string) => m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  if (i < 0) return { message: clean(message), net: null };
  const parsed = netErrorSchema.safeParse((() => { try { return JSON.parse(message.slice(i + NET_ERROR_MARK.length)); } catch { return null; } })());
  return { message: clean(message.slice(0, i)), net: parsed.success ? parsed.data : null };
}

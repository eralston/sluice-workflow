// 04 — the ADO client's transport seam. `HttpTransport` (main) talks to ADO; `FakeAdoTransport`
// serves a fixture scenario's ADO-shaped responses (fixtures/ado.ts) so ingest runs with no network.
// Requests never carry the PAT here: the HTTP transport adds it, and only for allowlisted origins.

export interface AdoRequest {
  method: 'GET' | 'POST';
  /** Absolute URL, query string included. */
  url: string;
  body?: unknown;
  /** Binary responses (avatars). */
  binary?: boolean;
  /** The call this request belongs to, for request activity (throttle waits). */
  callId?: number;
}

export interface AdoResponse {
  status: number;
  /** Lower-case header names. */
  headers: Record<string, string>;
  /** Parsed JSON, or the raw bytes when the request asked for `binary`. */
  body: unknown;
  /** Tries made (retries after throttling included), and time spent waiting between them. */
  attempts?: number;
  waitedMs?: number;
  /** The body as text, for explaining a failure (06: network errors, decided 2026-10-07). */
  text?: string;
}

export interface Transport {
  send(req: AdoRequest, signal?: AbortSignal): Promise<AdoResponse>;
}

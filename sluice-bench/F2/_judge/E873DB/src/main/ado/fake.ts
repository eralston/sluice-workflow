// The fake transport (07 slice 4): serves a fixture scenario's ADO payloads (fixtures/ado.ts). Tests
// can intercept requests to simulate failures (401, 403, 429, outages) before the fake answers.
import type { AdoRequest, AdoResponse, Transport } from '@shared/contracts/transport';
import type { FakeAdo } from '@fixtures/ado';

export class FakeAdoTransport implements Transport {
  readonly log: AdoRequest[] = [];
  /** Return a response to override the fake, or undefined to let it answer. */
  intercept: ((req: AdoRequest) => AdoResponse | undefined) | null = null;
  offline = false;
  /** Answer after this long (dev and tests: to see loading states). */
  delayMs = 0;

  constructor(private readonly fake: FakeAdo) {}

  async send(req: AdoRequest, signal?: AbortSignal): Promise<AdoResponse> {
    if (signal?.aborted) throw signal.reason;
    if (this.offline) throw new TypeError('fetch failed');
    this.log.push(req);
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    else await Promise.resolve();
    return this.intercept?.(req) ?? this.fake.handle(req);
  }
}

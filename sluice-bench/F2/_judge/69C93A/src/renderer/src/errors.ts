// An error's message, and its network details when it was a failed ADO call (decided 2026-10-07).
import { decodeNetError, refusesToken, type NetError } from '@shared/contracts/neterror';
import { useChart } from './store';

export function explainError(e: unknown): { message: string; net: NetError | null } {
  if (e && typeof e === 'object' && 'net' in e && 'message' in e) return { message: String((e as { message: unknown }).message), net: (e as { net: NetError | null }).net };
  return decodeNetError(e instanceof Error ? e.message : String(e));
}

/**
 * Whether a failure means ADO is out of reach, rather than refusing us (AC-31, decided 2026-10-09): no
 * response at all. A refused token or a denied read is a different thing, and needs an answer rather
 * than a quiet fall back to the cache.
 */
export function isUnreachable(e: unknown): boolean {
  const { message, net } = explainError(e);
  return net?.status === 0 || /Couldn’t reach ADO/.test(message);
}

/** ADO refused the token where it stops the work: said under the mode chip and in the player (04 §6). */
export function noteTokenRefused(family: string | null): void {
  useChart.getState().set({ tokenRefused: { family, at: Date.now() } });
}

/** Notes a failure that is a refused token (a 401 that stops the work); other failures change nothing. */
export function noteIfRefused(e: unknown): void {
  const { net } = explainError(e);
  if (net && refusesToken(net.family, net.status)) noteTokenRefused(net.family);
}

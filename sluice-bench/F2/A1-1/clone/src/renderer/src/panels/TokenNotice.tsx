// A refused token, said where it will be seen (decided 2026-10-22). The refusal sat in the Requests
// panel, which nobody opens; so it also shows as a notice under the mode chip, and as a line with a
// button in the player's loading widgets, which would otherwise wait for something that can't arrive.
// The flag is the app's own: set where a 401 stops the work (a failed sync, a stream cut short, a call
// that threw: `refusesToken`), never by any 401 in the request activity. A token can read the work and
// be refused one team's settings, which the app carries on without, so those don't count. The words
// say what was refused and the likely causes. The button opens Connect with the token field focused.
import { useState } from 'react';
import { phraseOf } from '@shared/activity';
import { useChart } from '../store';

type Refusal = NonNullable<ReturnType<typeof useChart.getState>['tokenRefused']>;

/** The refusal now, or null. */
export function useTokenRefusal(): Refusal | null {
  return useChart((s) => s.tokenRefused);
}

/** Opens Connect with the token field focused. */
export function enterNewToken(): void {
  useChart.getState().set({ connectOpen: true, connectFocus: 'token' });
}

/** What was refused, in plain words (fixed phrases, never data). */
export function refusalWords(r: Refusal): { headline: string; detail: string } {
  if (r.family === 'org' || r.family === 'projects') {
    return { headline: 'Your ADO token has expired', detail: 'ADO refused it when signing in, so nothing can load. It has expired or been revoked: enter a new one.' };
  }
  const what = r.family ? ` for “${phraseOf(r.family).phrase.toLowerCase()}”` : ' part-way through';
  return {
    headline: 'ADO refused your token',
    detail: `ADO refused it${what}. It may have expired, been revoked, or lack the read scope for that: enter a new one.`,
  };
}

/** The floating notice under the mode chip, until dismissed (it returns for a newer refusal) or Connect opens. */
export function TokenNotice() {
  const refusal = useTokenRefusal();
  const connectOpen = useChart((s) => s.connectOpen);
  const [dismissed, setDismissed] = useState<number | null>(null);
  if (!refusal || connectOpen || (dismissed !== null && refusal.at <= dismissed)) return null;
  const { headline, detail } = refusalWords(refusal);
  return (
    <div className="token-notice" role="alert" data-log="token-notice">
      <button type="button" className="token-notice__close" aria-label="Dismiss" onClick={() => setDismissed(refusal.at)} data-tip="Dismiss" data-tip-keys="It returns if ADO refuses the token again">×</button>
      <div className="token-notice__head">{headline}</div>
      <p className="token-notice__body">{detail}</p>
      <button type="button" className="enter-link token-notice__go" onClick={enterNewToken} data-tip="Open the connection, with the token field ready" data-tip-keys="Nothing is lost: the chart keeps what it has">Enter a new token</button>
    </div>
  );
}

/** The same words and button, in one line, for the player's loading widgets. */
export function TokenFix({ refusal }: { refusal: Refusal }) {
  return (
    <>
      <span className="transport__warn" data-tip={refusalWords(refusal).detail} data-tip-keys="This can’t finish until it’s replaced">⚠ {refusalWords(refusal).headline}</span>
      <button type="button" className="transport__retry" onClick={enterNewToken} data-tip="Open the connection, with the token field ready" data-tip-keys="Then load again">Enter a new token</button>
    </>
  );
}

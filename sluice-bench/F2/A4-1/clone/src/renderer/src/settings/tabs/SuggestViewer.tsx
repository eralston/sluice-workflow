// "Is this you?" (13 §7, Q8 closed; 23 E4): in ADO mode the signed-in user (auth.status's `me`, read from
// connectionData) is suggested as the viewer when none is chosen yet. The viewer confirms or says no;
// nothing is ever picked silently. Fixtures have no signed-in user, so they just show the picker.
import { useEffect, useState } from 'react';
import type { CanonicalKey } from '@shared/contracts/keys';
import { useChart } from '../../store';
import { chooseViewer, peopleOf, useViewer } from '../viewer';

export function SuggestViewer() {
  const history = useChart((s) => s.history);
  const mode = useChart((s) => s.mode);
  const viewer = useViewer();
  const [me, setMe] = useState<CanonicalKey | null>(null);
  const [declined, setDeclined] = useState(false);
  useEffect(() => {
    let live = true;
    void window.starChart.auth.status().then((s) => { if (live) setMe(s.me?.key ?? null); }, () => undefined);
    return () => { live = false; };
  }, []);
  const person = mode === 'ado' && me && !viewer && !declined ? peopleOf(history).find((p) => p.key === me) : undefined;
  if (!person) return null;
  return (
    <div className="settings__group settings__suggest" role="group" aria-label="Is this you?" data-suggest={person.key}>
      <p>Is this you? <strong>{person.name}</strong> is signed in to Azure DevOps on this Mac.</p>
      <div className="settings__row">
        <button type="button" className="enter-link" data-log="viewer-suggest-yes" onClick={() => void chooseViewer(person.key)}>Yes, that’s me</button>
        <button type="button" className="connect__link" data-log="viewer-suggest-no" onClick={() => setDeclined(true)}>No, choose myself</button>
      </div>
    </div>
  );
}

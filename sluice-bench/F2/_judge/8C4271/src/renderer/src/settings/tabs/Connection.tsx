// Settings → Connection (13 §7): what the Connect panel holds, in the same markup and class names, so
// every `.connect…` selector and check reads the tab as it reads the panel. Shown while `connectOpen`.
// Below it, what Purge leaves: the settings live in userData/settings.json, apart from the cache
// (main/userSettings.ts), so the viewer, their ship and the achievements switch survive a Purge.
import { ConnectBody } from '../../panels/Connect';

/** What Purge leaves (userSettings.test.ts runs the real purge path and checks it stays true). */
const PURGE_KEEPS =
  'Purge deletes cached work data only. Your settings stay: who you are, your captain’s look, and the achievements switch.';

export function ConnectionTab() {
  return (
    <ConnectBody frame={(body) => (
      <section id="connect-panel" className="connect connect--tab" aria-label="Connection">
        <h2 className="settings__h2">Data source</h2>
        {body}
        <p className="muted small settings__purge-note">{PURGE_KEEPS}</p>
      </section>
    )} />
  );
}

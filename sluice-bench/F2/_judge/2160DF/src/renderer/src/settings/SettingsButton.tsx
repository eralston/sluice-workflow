// The cog in the title bar (13 §7) that opens Settings. Solar only (17 D13), and a v0 view chosen
// with the developer toggle (views.ts), so Solar is one click back: a v0 view pinned at launch keeps
// the mode chip and its floating Connect panel exactly as they were.
import { useChart } from '../store';
import { closeSettings, openSettings, useSettings, useSettingsView } from './store';
import { showsSettings } from './views';
import './settings.css';

export function SettingsButton() {
  const paradigm = useChart((s) => s.paradigm);
  const devView = useSettings((s) => s.devView);
  const { open } = useSettingsView();
  if (!showsSettings(paradigm, devView)) return null;
  return (
    <button type="button" className="settings-button" data-paradigm="solar" aria-label="Settings" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? 'settings-modal' : undefined} data-log="settings-open" data-tip="Settings" data-tip-keys="Connection, theme, your captain, captain avatars, how to read"
      onClick={() => (open ? closeSettings() : openSettings())}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <path fill="currentColor" fillRule="evenodd" d="M19.81 10.29 L22.40 10.56 L22.40 13.44 L19.81 13.71 L18.74 16.31 L20.37 18.34 L18.34 20.37 L16.31 18.74 L13.71 19.81 L13.44 22.40 L10.56 22.40 L10.29 19.81 L7.69 18.74 L5.66 20.37 L3.63 18.34 L5.26 16.31 L4.19 13.71 L1.60 13.44 L1.60 10.56 L4.19 10.29 L5.26 7.69 L3.63 5.66 L5.66 3.63 L7.69 5.26 L10.29 4.19 L10.56 1.60 L13.44 1.60 L13.71 4.19 L16.31 5.26 L18.34 3.63 L20.37 5.66 L18.74 7.69 Z M12 8.6 A3.4 3.4 0 1 0 12 15.4 A3.4 3.4 0 1 0 12 8.6 Z" />
      </svg>
    </button>
  );
}

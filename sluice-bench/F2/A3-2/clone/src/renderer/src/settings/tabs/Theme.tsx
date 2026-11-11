// Settings → Theme (13 §7): the viewer's theme pack. v1 ships one, Star Chart, so the list has one
// entry and room for more. Below it, the developer toggle for the views (13 Q9, views.ts): Solar,
// Sprints (v0) and Backlog (v0). The v0 views are reached only from here (or by pin); under one the
// toggle chose, the cog stays, so this same toggle brings Solar back.
import { DEFAULT_THEME } from '@shared/contracts/settings';
import { allThemes } from '../../theme/registry';
import { useChart } from '../../store';
import { patchSettings, useSettings } from '../store';
import { profileState } from '../../profile';
import { chooseView, DEV_VIEWS } from '../views';

export function ThemeTab() {
  const theme = useSettings((s) => s.settings.theme);
  const paradigm = useChart((s) => s.paradigm);
  const themes = allThemes();
  const prof = profileState();
  const listed = themes.length ? themes.map((t) => ({ id: t.id, title: t.title })) : [{ id: DEFAULT_THEME, title: 'Star Chart' }];
  return (
    <>
      <h2 className="settings__h2">Theme</h2>
      <fieldset className="settings__group">
        <legend>Theme pack</legend>
        {listed.map((t) => (
          <label key={t.id} className="settings__choice">
            <input type="radio" name="theme" value={t.id} checked={theme === t.id} onChange={() => void patchSettings({ theme: t.id })} />
            <span>{t.title}</span>
          </label>
        ))}
        <p className="muted small">More themes can be added later: each is one table of looks, motions and words.</p>
      </fieldset>
      <fieldset className="settings__group settings__group--dev">
        <legend>Developer: view</legend>
        {DEV_VIEWS.map((v) => (
          <label key={v.id} className="settings__choice">
            <input type="radio" name="paradigm" value={v.id} checked={paradigm === v.id} data-log={`paradigm-${v.id}`} onChange={() => void chooseView(v.id).catch(() => undefined)} />
            <span>{v.title} <span className="muted small">· {v.note}</span></span>
          </label>
        ))}
        <p className="muted small">For development. Under a v0 view the cog stays, to come back here. The app opens in the view you chose last, until you choose Solar again.</p>
      </fieldset>
      {prof && (
        <fieldset className="settings__group" data-testid="device-profile">
          <legend>Device profile</legend>
          <p>{prof.profile.title} <span className="muted small">· {prof.source}{prof.overridden ? ', with your overrides' : ''}</span></p>
          {prof.notice && <p className="small" role="status">{prof.notice}</p>}
          <p className="muted small">Override with profile.json in the app&apos;s data folder; applies at next launch.</p>
        </fieldset>
      )}
    </>
  );
}

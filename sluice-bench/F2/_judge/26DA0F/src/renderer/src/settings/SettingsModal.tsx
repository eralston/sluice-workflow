// The Settings modal (13 §7): a vertical tab list in the left quarter, the chosen tab's controls in
// the rest. Tabs are role=tab with ↑/↓ (and Home/End) between them; Esc closes; focus stays inside
// while it's open and goes back where it came from when it closes; every target is at least 44 pt.
// Keys pressed inside never reach the chart's shortcuts.
//
// Mounted, it hosts the Connection tab under Solar (17 D13), and the floating Connect panel stands
// down; `connectOpen` still opens it, so the mode chip, the empty cosmos and the object list work
// unchanged. The awards come in as a prop (17 W3-T1 fills them).
import { useEffect, useRef } from 'react';
import type { Award } from '@shared/engine/types';
import { useChart } from '../store';
import { chooseTab, closeSettings, loadSettings, SETTINGS_TABS, useSettings, useSettingsView, type SettingsTab } from './store';
import { ConnectionTab } from './tabs/Connection';
import { ThemeTab } from './tabs/Theme';
import { CaptainTab } from './tabs/Captain';
import { CaptainAvatarsTab } from './tabs/CaptainAvatars';
import { ReadTab } from './tabs/Read';
import './settings.css';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const NO_AWARDS: Award[] = [];

export function SettingsModal({ awards = NO_AWARDS }: { awards?: Award[] }) {
  const paradigm = useChart((s) => s.paradigm);
  const { open, tab } = useSettingsView();
  const dialog = useRef<HTMLDivElement>(null);
  const tabs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});
  const opener = useRef<HTMLElement | null>(null);

  // Host the Connection tab while mounted under Solar.
  useEffect(() => {
    void loadSettings();
    useSettings.getState().set({ hostsConnection: paradigm === 'solar' });
    return () => useSettings.getState().set({ hostsConnection: false });
  }, [paradigm]);

  // On open, remember who opened it and focus the chosen tab; on close, give focus back.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tabs.current[currentTab()]?.focus();
    return () => {
      const back = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('.settings-button');
      back?.focus();
    };
  }, [open]);

  // Arrow keys move the selection; keep focus on the selected tab when it moved from the tab list.
  useEffect(() => {
    if (open && dialog.current?.querySelector('[role="tablist"]')?.contains(document.activeElement)) tabs.current[tab]?.focus();
  }, [open, tab]);

  if (!open) return null;

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = SETTINGS_TABS.findIndex((t) => t.id === tab);
    const n = SETTINGS_TABS.length;
    const to = e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowUp' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    chooseTab(SETTINGS_TABS[to]!.id);
  };

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // the chart's shortcuts (Space, arrows, Esc = Back) stay quiet behind the modal
    if (e.key === 'Escape') { e.preventDefault(); closeSettings(); return; }
    if (e.key !== 'Tab' || !dialog.current) return;
    const all = tabbable(dialog.current);
    if (!all.length) return;
    const first = all[0]!;
    const last = all[all.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="settings" data-paradigm="solar" onMouseDown={(e) => { if (e.target === e.currentTarget) closeSettings(); }}>
      <div id="settings-modal" className="settings__panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={dialog} onKeyDown={onKey}>
        <header className="settings__head">
          <span id="settings-title">Settings</span>
          <button type="button" className="settings__close connect__close" aria-label="Close settings" data-log="settings-close" onClick={closeSettings}>×</button>
        </header>
        <div className="settings__tabs" role="tablist" aria-orientation="vertical" aria-label="Settings" onKeyDown={onTabKey}>
          {SETTINGS_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`settings-tab-${t.id}`} className="settings__tab" ref={(el) => { tabs.current[t.id] = el; }}
              aria-selected={tab === t.id} aria-controls={tab === t.id ? `settings-panel-${t.id}` : undefined} tabIndex={tab === t.id ? 0 : -1} data-log={`settings-tab-${t.id}`}
              onClick={() => chooseTab(t.id)}>
              {t.title}
            </button>
          ))}
        </div>
        <div className="settings__body" role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`} tabIndex={-1}>
          {tab === 'connection' && <ConnectionTab />}
          {tab === 'theme' && <ThemeTab />}
          {tab === 'captain' && <CaptainTab awards={awards} />}
          {tab === 'avatars' && <CaptainAvatarsTab />}
          {tab === 'read' && <ReadTab />}
        </div>
      </div>
    </div>
  );
}

/**
 * What Tab reaches inside `root`, in order: drawn, enabled (a disabled fieldset disables its
 * controls), not tabindex -1 (the unselected tabs), and one stop per radio group, as the browser
 * makes it: the checked radio, or the group's first when none is. Without the radio rule the
 * trap's last stop could be an unchecked radio Tab never lands on, and focus would leave the modal.
 */
function tabbable(root: HTMLElement): HTMLElement[] {
  const drawn = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((el) => (el.offsetParent !== null || el === document.activeElement) && !el.matches(':disabled') && el.tabIndex >= 0);
  const groups = new Map<string, HTMLInputElement[]>();
  for (const el of drawn) if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) groups.set(el.name, [...(groups.get(el.name) ?? []), el]);
  const stops = new Set([...groups.values()].map((g) => g.find((r) => r.checked) ?? g[0]!));
  return drawn.filter((el) => !(el instanceof HTMLInputElement && groups.has(el.name) && el.type === 'radio') || stops.has(el));
}

/** The tab showing now, read outside React (for the open effect). */
function currentTab(): SettingsTab {
  const s = useSettings.getState();
  return s.hostsConnection && useChart.getState().connectOpen ? 'connection' : s.tab;
}

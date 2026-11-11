// The dev log, renderer side (decided 2026-10-07): significant inputs, navigation and playback, and
// errors, sent to main (which redacts and writes them). Developer runs only: every call is a no-op
// unless the app was launched with the dev log on. Inputs are described by structure (tag, role,
// class, a static data-log name), never by their text; typing is counted, never recorded.
import type { CanonicalKey } from '@shared/contracts/keys';
import { useChart } from './store';

export function rlog(kind: string, fields: Record<string, unknown> = {}): void {
  if (window.starChart?.env.devlog) window.starChart.devlog(kind, fields);
}

/** A UI element by structure only: tag, role, its first class, and its data-log name (static text). */
function describe(el: Element | null): { target: string; logName?: string } {
  if (!el) return { target: 'none' };
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)[0];
  const type = el instanceof HTMLInputElement ? el.type : null;
  const named = el.closest('[data-log]')?.getAttribute('data-log') ?? undefined;
  return { target: `${tag}${type ? `[${type}]` : ''}${role ? `[${role}]` : ''}${cls ? `.${cls}` : ''}`, ...(named ? { logName: named } : {}) };
}

const isTextField = (t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement =>
  (t instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(t.type)) || t instanceof HTMLTextAreaElement;

const stackOf = (e: unknown) => (e instanceof Error ? (e.stack ?? '').split('\n').slice(1, 6).map((l) => (/([\w.-]+\.[jt]sx?):(\d+)/.exec(l) ?? []).slice(1, 3).join(':')).filter(Boolean).join(' < ') : null);

export function installDevLog(): void {
  if (!window.starChart?.env.devlog) return;

  // Keys: names for shortcuts and navigation; in a text field, characters are only counted.
  let typing: { field: string; chars: number; timer: number } | null = null;
  const flushTyping = () => {
    if (!typing) return;
    window.clearTimeout(typing.timer);
    rlog('typing', { field: typing.field, chars: typing.chars });
    typing = null;
  };
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.name === 'pat') return; // the PAT field is never observed (INV-17)
    const mods = [e.metaKey && '⌘', e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && '⇧'].filter(Boolean).join('+') || null;
    if (isTextField(t) && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const field = describe(t).target;
      if (typing && typing.field !== field) flushTyping();
      typing ??= { field, chars: 0, timer: 0 };
      typing.chars++;
      window.clearTimeout(typing.timer);
      typing.timer = window.setTimeout(flushTyping, 900);
      return;
    }
    flushTyping();
    rlog('key', { key: e.key === ' ' ? 'Space' : e.key, ...(mods ? { mods } : {}), field: isTextField(t) ? describe(t).target : null });
  }, true);

  // Clicks on the UI (the canvas logs its own gestures: ChartApp).
  window.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('button, a, input, select, summary, label, [role="tab"], [data-log]') : null;
    if (!el || (e.target instanceof HTMLCanvasElement)) return;
    rlog('click', { ...describe(el), button: e.button === 0 ? 'primary' : String(e.button), detail: e.detail });
  }, true);

  // Errors.
  window.addEventListener('error', (e) => rlog('error', { level: 'window', errorClass: e.error instanceof Error ? e.error.name : 'Error', stack: stackOf(e.error) }));
  window.addEventListener('unhandledrejection', (e) => rlog('error', { level: 'unhandled', errorClass: e.reason instanceof Error ? e.reason.name : typeof e.reason, stack: stackOf(e.reason) }));

  // Navigation, selection, playback, and errors shown, from the store.
  useChart.subscribe((s, p) => {
    const top = s.stack[s.stack.length - 1]?.sceneKey;
    if (top !== p.stack[p.stack.length - 1]?.sceneKey) rlog('scene', { scene: top ?? null, depth: s.stack.length });
    if (s.selectedKey !== p.selectedKey) rlog('select', { key: s.selectedKey });
    if (s.playback?.status !== p.playback?.status) rlog('playback', { status: s.playback?.status ?? null, rate: s.playback?.rate ?? null });
    else if (s.playback && p.playback && s.playback.rate !== p.playback.rate) rlog('playback', { status: s.playback.status, rate: s.playback.rate });
    if (s.lens !== p.lens) rlog('lens', { lens: s.lens });
    if (s.highlights !== p.highlights) rlog('highlights', { outcome: s.highlights ? 'on' : 'off' });
    if (s.follow?.captain !== p.follow?.captain || s.follow?.suspended !== p.follow?.suspended) rlog('follow', { key: s.follow?.captain ?? null, outcome: !s.follow ? 'off' : s.follow.suspended ? 'suspended' : 'following' });
    if (s.panelTab !== p.panelTab) rlog('panel', { tab: s.panelTab });
    if (s.mode !== p.mode) rlog('mode', { mode: s.mode });
    if (s.connectOpen !== p.connectOpen) rlog('connect-panel', { outcome: s.connectOpen ? 'open' : 'closed' });
    if (s.pickAreaFor !== p.pickAreaFor) rlog('area-chooser', { key: s.pickAreaFor, outcome: s.pickAreaFor ? 'open' : 'closed' });
    if (s.sync?.phase !== p.sync?.phase && s.sync) rlog('sync', { phase: s.sync.phase, done: s.sync.done, total: s.sync.total, partial: s.sync.partial });
    if (s.error && s.error !== p.error) rlog('error-shown', { status: s.errorNet?.status ?? null, code: s.errorNet?.code ?? null, family: s.errorNet?.family ?? null });
    if (s.projects !== p.projects) rlog('projects', { count: s.projects.length });
  });
  rlog('renderer-start', { width: window.innerWidth, height: window.innerHeight, reducedMotion: useChart.getState().reducedMotion });
}

/** Something that should have worked didn't (a click on a node that's gone, an enter with nowhere to go). */
export function warn(reason: string, fields: { key?: CanonicalKey | string | null; nodeKind?: string } & Record<string, unknown> = {}): void {
  rlog('warn', { reason, ...fields });
}

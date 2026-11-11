// Remembers where the window was and how big it was, per mode (app, gallery), in userData (never in
// this OneDrive folder). Test runs reuse the last position so they open quietly where the user left
// the window, but use a fixed size so the automated checks are stable, and they never save.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, screen, type BrowserWindow, type Rectangle } from 'electron';

const DEFAULT = { width: 1440, height: 900 };

type Saved = Partial<Record<string, Rectangle>>;

const file = () => join(app.getPath('userData'), 'window-state.json');

function readAll(): Saved {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Saved;
  } catch {
    return {};
  }
}

/** A saved rectangle is used only if most of it is still on a connected display. */
function visible(r: Rectangle): boolean {
  const area = screen.getDisplayMatching(r).workArea;
  const w = Math.min(r.x + r.width, area.x + area.width) - Math.max(r.x, area.x);
  const h = Math.min(r.y + r.height, area.y + area.height) - Math.max(r.y, area.y);
  return w > 0 && h > 0 && w * h >= 0.5 * r.width * r.height;
}

/**
 * Bounds for a new window. `fixedSize` (tests, or STAR_CHART_WINDOW_SIZE=WxH) overrides the saved
 * size but keeps the saved position.
 */
export function initialBounds(key: string, fixedSize?: { width: number; height: number }): Partial<Rectangle> {
  const saved = readAll()[key];
  const size = fixedSize ?? (saved ? { width: saved.width, height: saved.height } : DEFAULT);
  if (!saved) return size; // first launch: Electron centers it
  const r = { x: saved.x, y: saved.y, ...size };
  return visible(r) ? r : size;
}

/** Save position and size as the user moves and resizes (debounced), and on close. */
export function trackBounds(win: BrowserWindow, key: string): void {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const all = readAll();
    all[key] = win.getNormalBounds();
    try {
      writeFileSync(file(), JSON.stringify(all, null, 2));
    } catch {
      // Losing the window position is harmless.
    }
  };
  const later = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  win.on('move', later);
  win.on('resize', later);
  win.on('close', () => {
    if (timer) clearTimeout(timer);
    save();
  });
}

/** STAR_CHART_WINDOW_SIZE=1440x900 forces a size (tests set it by default). */
export function sizeOverride(testMode: boolean): { width: number; height: number } | undefined {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(process.env.STAR_CHART_WINDOW_SIZE ?? '');
  if (m) return { width: Number(m[1]), height: Number(m[2]) };
  return testMode ? DEFAULT : undefined;
}

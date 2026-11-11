// The captain file's two doors (23 E2): save the viewer's ship style (faction, hull, colourway) to a
// small JSON file, and read one back. Both choose the file in a native dialog; test runs name it in
// STAR_CHART_CAPTAIN_FILE instead (the same seam as STAR_CHART_PICK_FILE). Only the four fields of
// `captainFile.ts` are ever written; a file read is checked there, and its path and text stay here.
import { closeSync, openSync, readSync, writeFileSync } from 'node:fs';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { CH, type CaptainExportResult, type CaptainImportResult } from '@shared/contracts/ipc';
import { CAPTAIN_FILE_MAX_BYTES, captainFileSchema, parseCaptainFile, serializeCaptainFile } from '@shared/captainFile';

const FILTERS = [{ name: 'Star Chart captain', extensions: ['json'] }];
const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;

export function registerCaptainFileIpc(testMode: boolean): void {
  const fixed = () => (testMode ? process.env.STAR_CHART_CAPTAIN_FILE || undefined : undefined);

  ipcMain.removeHandler(CH.captainExport);
  ipcMain.removeHandler(CH.captainImport);

  ipcMain.handle(CH.captainExport, async (_e, raw: unknown): Promise<CaptainExportResult> => {
    const f = captainFileSchema.parse(raw); // refused values throw to the caller
    let file = fixed();
    if (!file) {
      const opts: Electron.SaveDialogOptions = { title: 'Export your captain', defaultPath: 'star-chart-captain.json', filters: FILTERS };
      const w = window();
      const chosen = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
      if (chosen.canceled || !chosen.filePath) return { ok: false, reason: 'cancelled' };
      file = chosen.filePath;
    }
    try {
      writeFileSync(file, serializeCaptainFile(f));
      return { ok: true };
    } catch {
      return { ok: false, reason: 'unwritable' };
    }
  });

  ipcMain.handle(CH.captainImport, async (): Promise<CaptainImportResult> => {
    let file = fixed();
    if (!file) {
      const opts: Electron.OpenDialogOptions = { title: 'Import a captain', properties: ['openFile'], filters: FILTERS };
      const w = window();
      const chosen = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      if (chosen.canceled || !chosen.filePaths[0]) return { ok: false, reason: 'cancelled' };
      file = chosen.filePaths[0];
    }
    let text: string;
    try {
      // At most one byte over the limit is ever read, so a huge file is refused without being loaded.
      const fd = openSync(file, 'r');
      try {
        const buf = Buffer.alloc(CAPTAIN_FILE_MAX_BYTES + 1);
        text = buf.toString('utf8', 0, readSync(fd, buf, 0, buf.length, 0));
      } finally { closeSync(fd); }
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    const r = parseCaptainFile(text);
    return r.ok ? { ok: true, style: r.style } : { ok: false, reason: 'invalid', message: r.message };
  });
}

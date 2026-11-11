// Drop a picture on a captain's ship (23 E8, 13 §7). The window's own drop: the file's bytes go through
// the same validated seam as Settings' tiles (`setCaptainPictureBytes` → IPC pictures.set → main cuts
// and keeps it under userData). Here we only check what a drag can show: an image type, the size cap,
// and that the page can decode it; main decodes again. A file dropped anywhere else is ignored, and a
// bad drop on a ship says why in a notice. Pictures are local: nothing is sent to ADO (INV-21).
import { pictureFileProblem } from '@shared/pictureFile';
import { PICTURE_WHY } from '../panels/pictureWhy';
import { setDropNote } from '../panels/dropNoteStore';
import { setCaptainPictureBytes } from '../nav';
import { useChart } from '../store';
import type { ChartApp } from './ChartApp';

const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

/** Whether the page can decode these bytes as a picture. */
async function decodes(file: File): Promise<boolean> {
  try { (await createImageBitmap(file)).close(); return true; } catch { return false; }
}

export function installPictureDrop(host: HTMLElement, chart: ChartApp): () => void {
  const over = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    const ship = chart.captainAt(e.clientX, e.clientY);
    host.dataset.dropShip = ship ? 'true' : '';
    // Always claim the drag so Chromium doesn't navigate to the file; only a ship takes it.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; // over the sky too, so the drop fires and says where to drop
  };
  const leave = () => { host.dataset.dropShip = ''; };
  const drop = async (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    host.dataset.dropShip = '';
    const ship = chart.captainAt(e.clientX, e.clientY);
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!ship) { setDropNote('Drop a picture onto a captain’s ship.'); return; }
    if (useChart.getState().mode !== 'ado') { setDropNote('Pictures can be added when you are connected to ADO.'); return; }
    const file = files[0];
    if (!file) return;
    const who = ship.label || 'that captain';
    const problem = pictureFileProblem(file);
    if (problem === 'notImage') { setDropNote(`${who}: ${PICTURE_WHY.unreadable}`); return; }
    if (problem === 'tooBig') { setDropNote(`${who}: ${PICTURE_WHY.tooBig}`); return; }
    if (problem || !(await decodes(file))) { setDropNote(`${who}: ${PICTURE_WHY.unreadable}`); return; }
    try {
      const r = await setCaptainPictureBytes(ship.canonicalKey, new Uint8Array(await file.arrayBuffer()));
      setDropNote(r.ok ? `${who}’s picture is set. It stays on this Mac.` : `${who}: ${PICTURE_WHY[r.reason ?? 'unreadable']}`);
    } catch {
      setDropNote(`${who}: ${PICTURE_WHY.unreadable}`);
    }
  };
  // A file dropped anywhere else must never navigate the window to it: claim file drags at the window
  // (Settings' tiles and the chart host stop them first and handle their own).
  const refuse = (e: DragEvent) => {
    if (!hasFiles(e) || e.defaultPrevented) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  };
  window.addEventListener('dragover', refuse);
  window.addEventListener('drop', refuse);
  host.addEventListener('dragover', over);
  host.addEventListener('dragleave', leave);
  host.addEventListener('drop', drop);
  return () => { window.removeEventListener('dragover', refuse); window.removeEventListener('drop', refuse); host.removeEventListener('dragover', over); host.removeEventListener('dragleave', leave); host.removeEventListener('drop', drop); };
}

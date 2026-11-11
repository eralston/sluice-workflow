// Settings → Captain Avatars (13 §7): one square per captain in the open scene, wearing their picture or
// their initials on their colour. Click a square to choose a picture for them; drop a picture from
// Finder onto a square to give it to them in one gesture; paste one onto a focused square. Drop
// several onto the grid and their file names are matched to captains (src/shared/captainRoster.ts):
// the matches are shown to confirm, and the pictures that fit nobody wait in the tray to be dragged
// onto the right square. Pictures are kept by main under userData (91); this tab works from what is
// loaded, so it works offline. Fixtures carry their own invented pictures: this is ADO mode's.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { matchFiles, type RosterCaptain } from '@shared/captainRoster';
import type { CanonicalKey } from '@shared/contracts/keys';
import { AVATAR_TEXT } from '@shared/scene/avatar';
import { captainAvatar } from '@shared/scene/project/ctx';
import { applyPicturesById, captainRoster, removeCaptainPicture, setCaptainPictureBytes } from '../../nav';
import { PICTURE_WHY } from '../../panels/pictureWhy';
import { useChart } from '../../store';
import { release, useTray, type TrayItem } from '../avatarTray';
import { CropDialog } from './CropDialog';

const MAX_BYTES = 12_000_000;
const TRAY_TYPE = 'application/x-star-chart-tray';
const CROP_PREF = 'star-chart:avatars-crop';
const IMAGE_NAME = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i;
const isImage = (f: { name: string; type: string }) => f.type.startsWith('image/') || IMAGE_NAME.test(f.name);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The bytes inside a `data:` URL (what undo puts back). */
function bytesOfDataUrl(url: string): Uint8Array {
  const raw = atob(url.slice(url.indexOf(',') + 1));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

/** Files from a drop, folders included (walked three levels down). Entries must be read before the first await. */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null);
  if (!entries.length || entries.some((e) => !e)) return [...dt.files];
  const out: File[] = [];
  const walk = async (e: FileSystemEntry, depth: number): Promise<void> => {
    if (e.isFile) { out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej))); return; }
    if (!e.isDirectory || depth >= 3) return;
    const reader = (e as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) return;
      for (const child of batch) await walk(child, depth + 1);
    }
  };
  for (const e of entries) await walk(e!, 0);
  return out;
}

interface Proposal { key: CanonicalKey; who: string; file: File; url: string; on: boolean; replaces: boolean }
interface Undo { label: string; prev: { key: CanonicalKey; picture: string | null }[] }
interface Cropping { who: RosterCaptain; blob: Blob; back?: { name: string; file: Blob } }

export function CaptainAvatarsTab() {
  const mode = useChart((s) => s.mode);
  const stack = useChart((s) => s.stack);
  const history = useChart((s) => s.history);
  const [everyone, setEveryone] = useState(false);
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const { captains: roster, kind } = useMemo(() => captainRoster(everyone), [stack, history, version, everyone]);
  const tray = useTray((s) => s.items);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [cropOn, setCropOn] = useState(() => localStorage.getItem(CROP_PREF) === '1');
  const [cropping, setCropping] = useState<Cropping | null>(null);
  const [review, setReview] = useState<Proposal[] | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<string | null>(null); // a key, or 'grid'
  const chooser = useRef<HTMLInputElement>(null);
  const forWho = useRef<RosterCaptain | null>(null);
  const many = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const editable = mode === 'ado';
  const have = roster.filter((c) => c.avatar).length;
  const shown = onlyMissing ? roster.filter((c) => !c.avatar) : roster;

  // Pictures held for a review that is closed some other way (the tab left, the modal closed) are not lost: they join the tray.
  const reviewRef = useRef(review);
  reviewRef.current = review;
  useEffect(() => () => {
    const open = reviewRef.current;
    if (open) { useTray.getState().add(open.map((p) => ({ name: p.file.name, file: p.file }))); open.forEach((p) => URL.revokeObjectURL(p.url)); }
  }, []);

  const place = async (c: RosterCaptain, blob: Blob): Promise<boolean> => {
    if (blob.size > MAX_BYTES) { setNote(`${c.displayName}: ${PICTURE_WHY.tooBig}`); return false; }
    const r = await setCaptainPictureBytes(c.key, new Uint8Array(await blob.arrayBuffer()));
    if (!r.ok) setNote(`${c.displayName}: ${PICTURE_WHY[r.reason ?? 'unreadable']}`);
    return r.ok;
  };

  /** Give each captain their picture, remembering what they wore so Undo can put it back. */
  const commit = async (rows: { c: RosterCaptain; blob: Blob; back?: { name: string; file: Blob } }[]): Promise<void> => {
    setBusy(true);
    setNote(null);
    const prev: Undo['prev'] = [];
    for (const r of rows) {
      const before = { key: r.c.key, picture: r.c.handAdded ? r.c.avatar ?? null : null };
      if (await place(r.c, r.blob)) prev.push(before);
      else if (r.back) useTray.getState().add([r.back]); // it didn't take: it goes back to the tray
    }
    if (prev.length) {
      const first = roster.find((c) => c.key === prev[0]!.key)?.displayName ?? 'captain';
      setUndo({ label: prev.length === 1 ? `Set ${first}’s picture.` : `Set ${plural(prev.length, 'picture')}.`, prev });
    }
    setBusy(false);
    bump();
  };

  /** One picture for one captain: cropped first when that option is on. */
  const single = (c: RosterCaptain, blob: Blob, back?: { name: string; file: Blob }) => {
    if (cropOn) setCropping({ who: c, blob, ...(back ? { back } : {}) });
    else void commit([{ c, blob, ...(back ? { back } : {}) }]);
  };

  /** Several pictures: matched to captains by file name, shown to confirm; the rest wait in the tray. */
  const batch = (files: File[]) => {
    const imgs = files.filter(isImage);
    const skipped = files.length - imgs.length;
    if (!imgs.length) { setNote(files.length ? 'Those weren’t pictures. Try PNG, JPEG, GIF or WebP files.' : null); return; }
    const m = matchFiles(imgs.map((f) => f.name), roster);
    if (m.unassigned.length) useTray.getState().add(m.unassigned.map((i) => ({ name: imgs[i]!.name, file: imgs[i]! })));
    setNote([
      m.unassigned.length ? `${plural(m.unassigned.length, 'picture')} matched nobody: drag from the tray onto the right captain.` : '',
      skipped ? `${plural(skipped, 'file')} weren’t pictures and were skipped.` : '',
    ].filter(Boolean).join(' ') || null);
    if (!m.assigned.length) return;
    setReview(m.assigned.map((a) => {
      const c = roster.find((x) => x.key === a.key)!;
      return { key: c.key, who: c.displayName, file: imgs[a.file]!, url: URL.createObjectURL(imgs[a.file]!), on: true, replaces: Boolean(c.handAdded) };
    }));
  };

  const closeReview = (apply: boolean) => {
    const rows = review ?? [];
    setReview(null);
    rows.forEach((p) => URL.revokeObjectURL(p.url));
    const go = rows.filter((p) => p.on);
    if (apply && go.length) void commit(go.map((p) => ({ c: roster.find((x) => x.key === p.key)!, blob: p.file })));
    const rest = apply ? rows.filter((p) => !p.on) : rows;
    if (rest.length) useTray.getState().add(rest.map((p) => ({ name: p.file.name, file: p.file })));
  };

  const fromTray = (item: TrayItem, c: RosterCaptain) => {
    useTray.getState().take(item.id);
    release(item);
    single(c, item.file, { name: item.name, file: item.file });
  };

  const onDropOn = async (e: React.DragEvent, c: RosterCaptain | null) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    if (!editable) return;
    const trayId = e.dataTransfer.getData(TRAY_TYPE);
    if (trayId && c) { const item = useTray.getState().items.find((i) => i.id === trayId); if (item) fromTray(item, c); return; }
    const files = (await filesFromDrop(e.dataTransfer)).filter(isImage);
    if (!files.length) { setNote('Drop picture files (PNG, JPEG, GIF or WebP).'); return; }
    if (!c) { batch(files); return; }
    single(c, files[0]!);
    if (files.length > 1) { // the rest have no captain yet
      useTray.getState().add(files.slice(1).map((f) => ({ name: f.name, file: f })));
      setNote(`${plural(files.length - 1, 'more picture')} went to the tray.`);
    }
  };
  const acceptsDrop = (e: React.DragEvent) => editable && (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes(TRAY_TYPE));

  const doUndo = async () => {
    const u = undo;
    if (!u) return;
    setUndo(null);
    setBusy(true);
    for (const p of u.prev) {
      if (p.picture) await setCaptainPictureBytes(p.key, bytesOfDataUrl(p.picture));
      else await removeCaptainPicture(p.key);
    }
    setBusy(false);
    bump();
  };

  const remove = async (c: RosterCaptain) => {
    setUndo({ label: `Removed ${c.displayName}’s picture.`, prev: [{ key: c.key, picture: c.avatar ?? null }] });
    await removeCaptainPicture(c.key);
    bump();
  };

  const transfer = async (dir: 'out' | 'in') => {
    setBusy(true);
    setNote(null);
    try {
      const r = await (dir === 'out' ? window.starChart.pictures.exportAll() : window.starChart.pictures.importAll());
      if (r.reason === 'cancelled') return;
      if (!r.ok) setNote(r.reason === 'notConnected' ? PICTURE_WHY.notConnected : 'That folder couldn’t be used.');
      else {
        if (dir === 'in' && r.pictures) applyPicturesById(r.pictures);
        setNote(dir === 'out' ? `Copied ${plural(r.count, 'picture')}.` : `Read ${plural(r.count, 'picture')}.`);
      }
    } catch {
      setNote('That folder couldn’t be used.');
    } finally {
      setBusy(false);
      bump();
    }
  };

  const label = stack.at(-1)?.label;
  const scope = kind === 'loaded' ? 'everything loaded' : label ? `“${label}”` : kind === 'system' ? 'this solar system' : 'this sector';

  if (cropping) {
    return (
      <CropDialog blob={cropping.blob} name={cropping.who.displayName} onDone={(png) => {
        const c = cropping;
        setCropping(null);
        if (png) void commit([{ c: c.who, blob: png, ...(c.back ? { back: c.back } : {}) }]);
        else if (c.back) useTray.getState().add([c.back]);
      }} />
    );
  }

  return (
    <section className="avatars" aria-label="Captain Avatars">
      <h2 className="settings__h2">Captain Avatars</h2>
      <p className="muted small settings__note">
        {roster.length
          ? `${plural(roster.length, 'captain')} in ${scope}; ${have} ${have === 1 ? 'has' : 'have'} a picture.`
          : 'No captains are loaded yet. Open a sprint and they will appear here, from what is already on this Mac.'}
        {' '}You can also drop a picture onto a captain’s ship on the chart.
      </p>
      <p className="muted small settings__note" data-testid="avatars-where">
        Where are my pictures? In the “pictures” folder inside this app’s data folder on this Mac (never in the project folder). They never leave this Mac, are never sent to ADO, and stay when you Purge.
      </p>
      {!editable && <p className="muted small settings__note">Pictures can be added when you are connected to ADO. These are the fixtures’ invented ones.</p>}

      <div className="avatars__bar">
        <button type="button" className="enter-link" disabled={!editable || busy || !roster.length} data-log="avatars-add-many" onClick={() => many.current?.click()}>Add pictures…</button>
        <button type="button" className="enter-link" disabled={!editable || busy || !roster.length} data-log="avatars-add-folder" onClick={() => folder.current?.click()}>Choose a folder…</button>
        <label className="settings__choice avatars__check"><input type="checkbox" checked={everyone} data-testid="avatars-everyone" onChange={(e) => setEveryone(e.target.checked)} /><span>Everyone loaded, not just this view</span></label>
        <label className="settings__choice avatars__check"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /><span>Only captains without a picture</span></label>
        <label className="settings__choice avatars__check"><input type="checkbox" checked={cropOn} onChange={(e) => { setCropOn(e.target.checked); localStorage.setItem(CROP_PREF, e.target.checked ? '1' : '0'); }} /><span>Adjust the crop of a single picture first</span></label>
        <span className="avatars__bar-end">
          <button type="button" className="enter-link" disabled={!editable || busy} data-log="avatars-export" onClick={() => void transfer('out')}
            data-tip="Copy every picture you added to a folder" data-tip-keys="Named by ID, never by name">Copy all to a folder…</button>
          <button type="button" className="enter-link" disabled={!editable || busy} data-log="avatars-import" onClick={() => void transfer('in')}
            data-tip="Read pictures copied from another Mac">Read from a folder…</button>
        </span>
      </div>
      <input ref={many} type="file" accept="image/*" multiple hidden data-testid="avatars-many"
        onChange={(e) => { batch([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <input ref={folder} type="file" accept="image/*" multiple hidden data-testid="avatars-folder"
        {...{ webkitdirectory: '' }} onChange={(e) => { batch([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <input ref={chooser} type="file" accept="image/*" hidden data-testid="avatars-one"
        onChange={(e) => { const f = e.target.files?.[0]; const c = forWho.current; e.target.value = ''; if (f && c) single(c, f); }} />

      <p role="status" className="small avatars__note" aria-live="polite">{note ?? ''}</p>
      {undo && (
        <p className="avatars__undo small">
          <span>{undo.label}</span>
          <button type="button" className="enter-link" disabled={busy} data-log="avatars-undo" onClick={() => void doUndo()}>Undo</button>
          <button type="button" className="enter-link" aria-label="Dismiss" onClick={() => setUndo(null)}>×</button>
        </p>
      )}

      {review && (
        <div className="avatars__review" role="group" aria-label="Pictures matched to captains">
          <h3 className="settings__h3">Matched by file name</h3>
          <ul>
            {review.map((p, i) => (
              <li key={p.key}>
                <label className="settings__choice">
                  <input type="checkbox" checked={p.on} onChange={(e) => setReview(review.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                  <img src={p.url} alt="" className="avatars__thumb" />
                  <span><strong>{p.who}</strong> ← <span className="muted">{p.file.name}</span>{p.replaces ? <span className="avatars__tag">replaces their picture</span> : null}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="avatars__actions">
            <button type="button" className="enter-link" data-log="avatars-apply" disabled={!review.some((p) => p.on)} onClick={() => closeReview(true)}>Apply {review.filter((p) => p.on).length}</button>
            <button type="button" className="enter-link" data-log="avatars-review-cancel" onClick={() => closeReview(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="avatars__layout">
        <ul className="avatars__grid" data-over={over === 'grid' ? 'true' : undefined} aria-label="Captains"
          onDragOver={(e) => { if (acceptsDrop(e)) { e.preventDefault(); setOver('grid'); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}
          onDrop={(e) => void onDropOn(e, null)}>
          {shown.map((c) => {
            const a = captainAvatar(c)!;
            return (
              <li key={c.key} className="avatars__tile" data-key={c.key} data-over={over === c.key ? 'true' : undefined} data-picture={c.avatar ? (c.handAdded ? 'hand' : 'ado') : 'none'}
                onPaste={(e) => {
                  const f = [...e.clipboardData.files].find(isImage);
                  if (!f || !editable) return;
                  e.preventDefault();
                  single(c, f);
                }}
                onDragOver={(e) => { if (acceptsDrop(e)) { e.preventDefault(); e.stopPropagation(); setOver(c.key); } }}
                onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
                onDrop={(e) => void onDropOn(e, c)}>
                <button type="button" className="avatars__pic" disabled={!editable || busy} data-log="avatars-choose"
                  style={{ background: hex(a.color), color: hex(AVATAR_TEXT) }}
                  aria-label={`${c.displayName}, ${c.avatar ? (c.handAdded ? 'your picture' : 'a picture from ADO') : 'no picture'}. Choose a picture; or paste or drop one.`}
                  onClick={() => { forWho.current = c; chooser.current?.click(); }}>
                  {c.avatar ? <img src={c.avatar} alt="" /> : <span className="avatars__initials" aria-hidden="true">{a.initials}</span>}
                </button>
                <span className="avatars__name" title={c.displayName}>{c.displayName}</span>
                {c.handAdded && (
                  <button type="button" className="avatars__remove" disabled={busy} aria-label={`Remove ${c.displayName}’s picture`} data-log="avatars-remove" onClick={() => void remove(c)}>×</button>
                )}
              </li>
            );
          })}
        </ul>
        <aside className="avatars__tray" aria-label="Unassigned pictures">
          <h3 className="settings__h3">Tray</h3>
          {tray.length === 0 ? (
            <p className="muted small">Pictures that match nobody wait here. Drag one onto a captain.</p>
          ) : (
            <>
              <ul>
                {tray.map((t) => (
                  <li key={t.id} className="avatars__stray" draggable={editable} data-tray-id={t.id}
                    onDragStart={(e) => { e.dataTransfer.setData(TRAY_TYPE, t.id); e.dataTransfer.effectAllowed = 'move'; }}>
                    <img src={t.url} alt="" />
                    <span className="avatars__stray-name small muted" title={t.name}>{t.name}</span>
                    <select aria-label={`Give ${t.name} to…`} value="" disabled={!editable || busy} onChange={(e) => { const c = roster.find((x) => x.key === e.target.value); if (c) fromTray(t, c); }}>
                      <option value="">Give to…</option>
                      {roster.map((c) => <option key={c.key} value={c.key}>{c.displayName}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
              <button type="button" className="enter-link" data-log="avatars-tray-clear" onClick={() => useTray.getState().clear()}>Clear the tray</button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

// Settings → Captain Avatars: the tray of pictures that matched nobody. It outlives the tab (and the
// modal), so a picture waits there until it is dragged onto a captain or cleared. Files stay in memory
// in this window: nothing is read from disk again, kept, sent or logged until one is placed.
import { create } from 'zustand';

export interface TrayItem { id: string; name: string; file: Blob; url: string }

interface TrayState {
  items: TrayItem[];
  add: (files: { name: string; file: Blob }[]) => void;
  take: (id: string) => TrayItem | undefined;
  clear: () => void;
}

let seq = 0;
export const useTray = create<TrayState>((set, get) => ({
  items: [],
  add: (files) => set((s) => ({ items: [...s.items, ...files.map((f) => ({ id: `tray-${++seq}`, name: f.name, file: f.file, url: URL.createObjectURL(f.file) }))] })),
  take: (id) => {
    const item = get().items.find((i) => i.id === id);
    if (item) set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    return item;
  },
  clear: () => {
    for (const i of get().items) URL.revokeObjectURL(i.url);
    set({ items: [] });
  },
}));

/** A taken item's preview is done with. */
export const release = (item: TrayItem) => URL.revokeObjectURL(item.url);

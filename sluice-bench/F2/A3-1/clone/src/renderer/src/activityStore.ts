// Request activity in the window (decided 2026-10-07): the reducer's state, fed by main's stream.
import { create } from 'zustand';
import { dismiss, emptyActivity, reduce, type ActivityEvent, type ActivityState } from '@shared/activity';

interface Store extends ActivityState {
  panelOpen: boolean;
  apply(e: ActivityEvent): void;
  dismiss(id: number | 'all'): void;
  setPanel(open: boolean): void;
}

export const useActivity = create<Store>((set, get) => ({
  ...emptyActivity(),
  panelOpen: false,
  apply: (e) => set(reduce(get(), e)),
  dismiss: (id) => set(dismiss(get(), id)),
  setPanel: (open) => set({ panelOpen: open }),
}));

let installed = false;
export function installActivity(): void {
  if (installed || !window.starChart?.onActivity) return;
  installed = true;
  window.starChart.onActivity((e) => useActivity.getState().apply(e));
}

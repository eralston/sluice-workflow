// The notice a picture dropped on the chart leaves (23 E8): what happened, in words, fading on its own.
import { create } from 'zustand';

export const useDropNote = create<{ text: string; n: number }>(() => ({ text: '', n: 0 }));
/** How long the notice stays, in ms. */
export const DROP_NOTE_MS = 6000;
let timer: ReturnType<typeof setTimeout> | undefined;

export function setDropNote(text: string): void {
  useDropNote.setState((s) => ({ text, n: s.n + 1 }));
  clearTimeout(timer);
  timer = setTimeout(() => useDropNote.setState({ text: '' }), DROP_NOTE_MS);
}

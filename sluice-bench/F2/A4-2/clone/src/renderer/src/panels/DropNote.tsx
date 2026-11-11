import { useDropNote } from './dropNoteStore';

/** The chart's drop notice (23 E8): a polite status line over the chart. */
export function DropNote() {
  const text = useDropNote((s) => s.text);
  return <div className="drop-note" role="status" aria-live="polite" data-testid="drop-note" hidden={!text}>{text}</div>;
}

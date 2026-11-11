// Busy controls (decided 2026-10-07): an async control says what it's waiting on, right where you
// clicked, with a small spinner, until its content arrives. Reduced motion: a static ellipsis.
import { useCallback, useState } from 'react';
import { useChart } from '../store';

export function Busy({ label }: { label: string }) {
  const reduced = useChart((s) => s.reducedMotion);
  return (
    <span className="busy" role="status" aria-live="polite">
      {reduced ? <span aria-hidden="true">…</span> : <span className="busy__spin" aria-hidden="true" />}
      <span className="busy__label">{label}</span>
    </span>
  );
}

/** Which control (by id) is waiting, and `run` to wrap its request. */
export function useBusy(): { busy: string | null; run: <T>(id: string, work: Promise<T>) => Promise<T> } {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(id: string, work: Promise<T>): Promise<T> => {
    setBusy(id);
    try { return await work; } finally { setBusy((b) => (b === id ? null : b)); }
  }, []);
  return { busy, run };
}

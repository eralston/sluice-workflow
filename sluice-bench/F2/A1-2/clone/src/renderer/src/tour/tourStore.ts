// The guided tour's state (23 E7). The tour is a modal overlay over the live chart: `phase` says whether
// it is closed, getting to Comet Pod ('loading'), or showing a step. Nothing here is saved; the one
// persisted bit is `UserSettings.tourOffered`.
import { create } from 'zustand';

export type TourPhase = 'off' | 'loading' | 'step';

interface TourState {
  phase: TourPhase;
  /** Index into the theme's tour steps. */
  step: number;
  /** The data source the tour found, put back when it closes. */
  priorMode: 'fixture' | 'ado' | null;
  /** The tour could not reach Comet Pod; shown in place of the step. */
  failed: boolean;
  set: (patch: Partial<Omit<TourState, 'set'>>) => void;
}

export const useTour = create<TourState>((set) => ({ phase: 'off', step: 0, priorMode: null, failed: false, set: (p) => set(p) }));

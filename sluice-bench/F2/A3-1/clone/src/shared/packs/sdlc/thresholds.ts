// The SDLC pack's thresholds (18 §5, A2 and A3). Pure.
import type { PackThresholds } from '../../engine/types';

/** Swift passage within 3 working days of 12 hours; Steady hands at no more than 2 Underway at once. */
export const SDLC_THRESHOLDS: PackThresholds = { swiftDays: 3, wipK: 2, dayHours: 12 };

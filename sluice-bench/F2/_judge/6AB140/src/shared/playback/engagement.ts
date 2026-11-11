// How much the ships do (05 §5, "Activity", decided 2026-10-09): who flies, which events get a ship
// and tractor beam, and how much runs in parallel. One table, one level at a time, so the amount can
// be dialed up or down in a single place. `calm` is the pace before the dial existed. Pure.
export type ActivityLevel = 'calm' | 'lively' | 'maximum';
export const ACTIVITY_LEVELS: readonly ActivityLevel[] = ['calm', 'lively', 'maximum'];
export const DEFAULT_ACTIVITY: ActivityLevel = 'maximum';

export interface Engagement {
  /**
   * Beats whose accents the budget cut still get their ships' actions. Ship actions run in parallel with
   * the schedule and cost it no time, which is how the chart keeps moving between the big moments.
   */
  lightActions: boolean;
  /** Beams and tells ignore the busy/overload tiers (05 §5): the scene is allowed to be full. */
  ignoreLoad: boolean;
  /** The most ship actions (a flight and a beam) one beat starts; more are left to the next beat. */
  actionsPerBeat: number;
  /** The subject also acts: a new assignee, a PR's author, the item's assignee beside a different actor. */
  subjects: boolean;
  /** People without a ship in the scene come in as guests to do their part, at most this many at once. */
  maxGuests: number;
  /** Ship actions in one beat start this far apart (seconds), so they read as many hands, not one blast. */
  staggerS: number;
}

export const ENGAGEMENT: Record<ActivityLevel, Engagement> = {
  calm: { lightActions: false, ignoreLoad: false, actionsPerBeat: 99, subjects: false, maxGuests: 0, staggerS: 0 },
  lively: { lightActions: true, ignoreLoad: false, actionsPerBeat: 3, subjects: true, maxGuests: 2, staggerS: 0.3 },
  maximum: { lightActions: true, ignoreLoad: true, actionsPerBeat: 99, subjects: true, maxGuests: 6, staggerS: 0.2 },
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = { calm: 'Calm', lively: 'Lively', maximum: 'Maximum' };
export const ACTIVITY_HINT: Record<ActivityLevel, string> = {
  calm: 'Ships act on the big moments only',
  lively: 'Ships act on most changes, a few at once',
  maximum: 'Every change has a ship at work, all at once',
};

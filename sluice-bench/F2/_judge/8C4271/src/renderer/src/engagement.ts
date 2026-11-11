// The Activity level (05 §5): remembered between runs. Test runs start at Calm unless a spec says
// otherwise, so the motion specs keep measuring the pace they were written for.
import { ACTIVITY_LEVELS, DEFAULT_ACTIVITY, type ActivityLevel } from '@shared/playback/engagement';

const KEY = 'starChart.activity';

export function loadActivity(): ActivityLevel {
  try {
    if (typeof window !== 'undefined' && window.starChart?.env?.testMode) return 'calm';
    const v = localStorage.getItem(KEY) as ActivityLevel | null;
    return v && ACTIVITY_LEVELS.includes(v) ? v : DEFAULT_ACTIVITY;
  } catch {
    return DEFAULT_ACTIVITY;
  }
}

export function saveActivity(v: ActivityLevel): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // storage unavailable: the choice lasts for this session only
  }
}

// What a region's playback reads (05 §8.3a, 22 C2): under Solar, the bundle in story time, so the
// schedule, the board, seeks and the ruler all tell the day's story (arcs, a story's day) and agree with
// each other; every other chain, the bundle as recorded. Memoised per bundle (`storyTime`), so the same
// bundle always presents as the same object.
import type { ScopeHistory } from '@shared/contracts/history';
import { storyTime } from '@shared/playback/storyTime';
import { solarChain } from './lines';

/** The zone story time's days are read in: the schedule's (its working hours), the viewer's own. */
export const STORY_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** A bundle as playback presents it. */
export function presented(h: ScopeHistory): ScopeHistory {
  return solarChain() ? storyTime(h, STORY_TZ).history : h;
}

// A quiet week (03 §8): two events in five days, to test compression and an early end.
import { scenario } from '../dsl';

export default scenario('quiet-week', {
  project: 'Stillwater',
  tz: 'America/Los_Angeles',
  range: ['2026-09-14T07:00:00Z', '2026-09-21T07:00:00Z'],
})
  .area('Stillwater', 40)
  .area('Stillwater\\Moss Team', 41, { favorite: true, defaultScope: true })
  .person('ren', 'Ren Halvorsen')
  .at('2026-08-31T16:00:00Z')
  .feature(901, 'Quiet hours for alerts', { area: 'Stillwater\\Moss Team', state: 'Active' })
  .story(911, 'Do-not-disturb schedule', { parent: 901 })
  .story(912, 'Alert digest email', { parent: 901, state: 'Active', assignee: 'ren' })
  .at('2026-09-15T17:00:00Z').state(911, 'Active')
  .at('2026-09-19T18:00:00Z').state(912, 'Resolved')
  .build();

// Sprints with pods (decided 2026-10-07): a project that plans by sprint, with two pods (saved Area
// Paths) taking cross-cutting stories each sprint. Sprint 40 ends with a carry-over into Sprint 41;
// Sprint 41 (the current one) gets a Bug added mid-sprint and loses a Story to Sprint 42. A third
// Area Path, Quasar Pod, isn't saved: its story is in the sprint but outside the pods until it's added
// (decided 2026-10-08: adding a pod from the breadcrumb). Invented names only (INV-18).
//
// Test-only since 2026-10-27: this was Halcyon Reach until the demo project took the name and the
// content (`sprint-pods.ts`). It stays because the sprint mechanics it holds (a carry-over, a mid-sprint
// Bug, a Story planned out) are what a lot of tests check, and the demo has none of them. It keeps the
// project name, so those tests' paths are unchanged; fixture mode never serves it beside the demo
// (src/main/fixtures.ts), only in its place when STAR_CHART_FIXTURE names it.
import { scenario } from '../dsl';

const S40 = 'Halcyon Reach\\Sprint 40';
const S41 = 'Halcyon Reach\\Sprint 41';
const S42 = 'Halcyon Reach\\Sprint 42';
const COMET = 'Halcyon Reach\\Comet Pod';
const NOVA = 'Halcyon Reach\\Nova Pod';
const QUASAR = 'Halcyon Reach\\Quasar Pod';

export default scenario('sprint-mechanics', {
  project: 'Halcyon Reach',
  tz: 'America/Los_Angeles',
  range: ['2026-09-14T07:00:00Z', '2026-09-21T07:00:00Z'],
})
  .area('Halcyon Reach', 8000)
  .area(COMET, 8001, { favorite: true, defaultScope: true })
  .area(NOVA, 8002, { favorite: true })
  .area(QUASAR, 8003)
  .iteration(S40, 8100, '2026-08-31T07:00:00Z', '2026-09-14T07:00:00Z')
  .iteration(S41, 8101, '2026-09-14T07:00:00Z', '2026-09-28T07:00:00Z')
  .iteration(S42, 8102, '2026-09-28T07:00:00Z', '2026-10-12T07:00:00Z')
  .repo('booking-web')
  .person('maren', 'Maren Solis')
  .person('teo', 'Teo Halvorsen')
  .person('priya', 'Priya Okafor')
  .person('dax', 'Dax Moreau')
  // Features the pods' stories roll up to (their label line), in the project's root area.
  .at('2026-08-20T16:00:00Z')
  .feature(9001, 'Booking calendar', { area: 'Halcyon Reach', state: 'Active' })
  .feature(9002, 'Guest messaging', { area: 'Halcyon Reach', state: 'Active' })
  // ---- Sprint 40 ----
  .at('2026-08-31T16:00:00Z')
  .story(9101, 'Month view for the calendar', { parent: 9001, area: COMET, iteration: S40, assignee: 'maren' })
  .story(9102, 'Message templates', { parent: 9002, area: NOVA, iteration: S40, assignee: 'priya' })
  .story(9103, 'Drag to reschedule', { parent: 9001, area: COMET, iteration: S40, assignee: 'teo' })
  .at('2026-09-01T17:00:00Z').state(9101, 'Active').state(9102, 'Active').state(9103, 'Active')
  .at('2026-09-08T18:00:00Z').state(9101, 'Resolved')
  .at('2026-09-10T18:00:00Z').state(9101, 'Closed').state(9102, 'Closed')
  // The carry-over: unfinished at the sprint's end, it moves on to Sprint 41.
  .at('2026-09-14T15:00:00Z').moveIteration(9103, S41, { by: 'teo' })
  // ---- Sprint 41 (the current sprint) ----
  .at('2026-09-14T17:00:00Z')
  .story(9104, 'Week view for the calendar', { parent: 9001, area: COMET, iteration: S41, assignee: 'maren' })
  .story(9105, 'Holiday blackout dates', { parent: 9001, area: COMET, iteration: S41 })
  .story(9106, 'Read receipts', { parent: 9002, area: NOVA, iteration: S41, assignee: 'priya' })
  .story(9107, 'Quiet hours for messages', { parent: 9002, area: NOVA, iteration: S41, assignee: 'dax' })
  .story(9109, 'Waitlist for full slots', { parent: 9002, area: QUASAR, iteration: S41, assignee: 'dax' })
  .task(9201, 'Grid layout', { parent: 9104, iteration: S41, assignee: 'maren' })
  .task(9202, 'Keyboard navigation', { parent: 9104, iteration: S41 })
  .task(9203, 'Snap to half hours', { parent: 9103, iteration: S41, assignee: 'teo' })
  .task(9204, 'Receipt indicator', { parent: 9106, iteration: S41, assignee: 'priya' })
  .at('2026-09-15T16:00:00Z').state(9104, 'Active').state(9201, 'Active').state(9106, 'Active').state(9204, 'Active')
  .at('2026-09-15T18:00:00Z').state(9203, 'Active')
  // A Bug found mid-sprint, taken into it.
  .at('2026-09-16T17:00:00Z').bug(9108, 'Double-booked slots after a timezone change', { parent: 9001, area: COMET, iteration: S41, assignee: 'teo' })
  .at('2026-09-16T19:00:00Z').state(9108, 'Active')
  .at('2026-09-16T20:00:00Z').pr(9501, { repo: 'booking-web', author: 'teo', title: 'Keep slots in UTC', links: [9108] })
  .at('2026-09-17T16:00:00Z').state(9201, 'Closed').state(9107, 'Active')
  .at('2026-09-17T19:00:00Z').state(9203, 'Closed').state(9103, 'Resolved')
  .at('2026-09-18T17:00:00Z').completePr(9501, { approvedBy: ['maren'] }).state(9108, 'Resolved')
  // Too big for this sprint: planned out to the next one.
  .at('2026-09-18T20:00:00Z').moveIteration(9105, S42, { by: 'maren' })
  .at('2026-09-19T17:00:00Z').state(9204, 'Closed').state(9106, 'Resolved').state(9103, 'Closed')
  .at('2026-09-20T17:00:00Z').assign(9202, 'dax').state(9202, 'Active')
  .build();

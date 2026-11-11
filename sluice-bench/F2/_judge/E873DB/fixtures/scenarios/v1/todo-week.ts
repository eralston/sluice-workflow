// The Todo v1 episode (17 W3-T2, 12 the Todo column): one household's week, played back as a solar
// system. *Juniper Household* is the workspace, Week 41 the round, and its lists the regions: House
// (the default) and Garden. Hazel is the intended viewer, picked in Settings (seats go by first hold,
// so she isn't necessarily seated first). Work items are 30000–30999 and notes (PRs) 31000+, all
// filed against one shared context, the `Home` repo. Read by the Todo pack (`domainPack: 'todo'`,
// config/packs/todo.mapping.json), served under Solar only (17 A3). Invented names only (INV-18).
//
// What it exercises:
// - Seats: Hazel (3 Todos, a carry-over among them, and a Problem), Bram (2 Todos and a Problem) and
//   Odette (a Todo and a Problem). Garden is the round's other list, with one of Bram's Todos.
// - The frontier: a Todo and a Problem start unassigned. Odette picks up the Problem and fixes it;
//   the Todo is later Dropped.
// - Every rung, plus Someday (deferred), Not a Problem (struck), a carry-over from Week 40, a Todo
//   already planned for Week 42 and a reassignment (Bram hands the shelves to Odette).
// - Checklist Items held by someone other than their Todo's holder (Hazel ticks one on Bram's Todo).
// - The facility: Home serves every seat. One note is discarded and one is still open at the end.
// - Achievements (18 §5, the Todo thresholds: 2 working days, K = 3): Hazel lands all three of her
//   Todos and her Problem (Clear skies, Hat trick: landings), one within a day (Swift passage), one
//   with its whole checklist ticked (Clean landing), never has more than 3 Doing (Steady hands) and
//   ticks a Checklist Item on Bram's hallway (Wingman).
import { scenario, type Scenario } from '../../dsl';
import { TODO_MAPPING } from '@shared/packs/todo';

const ROOT = 'Juniper Household';
const HOUSE = 'Juniper Household\\House';
const GARDEN = 'Juniper Household\\Garden';
const W_PREV = 'Juniper Household\\Week 40';
const W0 = 'Juniper Household\\Week 41';
const W_NEXT = 'Juniper Household\\Week 42';

const week = scenario('todo-week', {
  project: ROOT,
  tz: 'America/Los_Angeles',
  // Week 41, Monday to Monday: the episode is the whole round.
  range: ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'],
})
  .area(ROOT, 32000)
  .area(HOUSE, 32001, { favorite: true, defaultScope: true })
  .area(GARDEN, 32002, { favorite: true })
  .iteration(W_PREV, 32100, '2026-09-28T07:00:00Z', '2026-10-05T07:00:00Z')
  .iteration(W0, 32101, '2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z')
  .iteration(W_NEXT, 32102, '2026-10-12T07:00:00Z', '2026-10-19T07:00:00Z')
  .repo('Home')
  // The intended viewer (declaration order doesn't seat anyone first).
  .person('hazel', 'Hazel Juniper')
  .person('bram', 'Bram Juniper')
  .person('odette', 'Odette Juniper')

  // ---- Week 40 (the week before) ----
  .at('2026-09-28T16:00:00Z')
  .item('Todo', 30171, 'Return the library books', { area: HOUSE, iteration: W_PREV, assignee: 'hazel', state: 'Planned' })
  // The carry-over: still on the list at Week 40's end, it moves into Week 41.
  .at('2026-10-05T06:00:00Z').moveIteration(30171, W0, { by: 'hazel' })

  // ---- Week 41, Monday morning ----
  .at('2026-10-05T15:00:00Z')
  // Hazel's seat.
  .item('Todo', 30101, 'Plan the birthday dinner', { area: HOUSE, iteration: W0, assignee: 'hazel', state: 'Planned' })
  .item('Checklist Item', 30301, 'Buy candles', { parent: 30101, iteration: W0, assignee: 'hazel', state: 'Open' })
  .item('Checklist Item', 30302, 'Send the invitations', { parent: 30101, iteration: W0, assignee: 'odette', state: 'Open' })
  .item('Todo', 30102, 'Sort the tax papers', { area: HOUSE, iteration: W0, assignee: 'hazel', state: 'Planned' })
  .item('Problem', 30201, 'Leaky kitchen tap', { area: HOUSE, iteration: W0, assignee: 'hazel', state: 'Spotted' })
  // Bram's seat.
  .item('Todo', 30111, 'Repaint the hallway', { area: HOUSE, iteration: W0, assignee: 'bram', state: 'Planned' })
  .item('Checklist Item', 30311, 'Fill the cracks', { parent: 30111, iteration: W0, assignee: 'bram', state: 'Open' })
  .item('Checklist Item', 30312, 'Pick a colour', { parent: 30111, iteration: W0, assignee: 'hazel', state: 'Open' })
  .item('Todo', 30112, 'Hang the shelves', { area: HOUSE, iteration: W0, assignee: 'bram', state: 'Planned' })
  .item('Problem', 30211, 'Squeaky stair', { area: HOUSE, iteration: W0, assignee: 'bram', state: 'Spotted' })
  // Odette's seat.
  .item('Todo', 30121, 'Book the dentist', { area: HOUSE, iteration: W0, assignee: 'odette', state: 'New' })
  .item('Problem', 30221, 'Wi-Fi drops upstairs', { area: HOUSE, iteration: W0, assignee: 'odette', state: 'Spotted' })
  // The frontier: on the House list this week, held by nobody.
  .item('Todo', 30131, 'Clear the attic', { area: HOUSE, iteration: W0, state: 'New' })
  .item('Problem', 30231, 'Fridge light out', { area: HOUSE, iteration: W0, state: 'Spotted' })
  // The Garden list, the round's other region.
  .item('Todo', 30141, 'Plant the spring bulbs', { area: GARDEN, iteration: W0, assignee: 'bram', state: 'Planned' })
  .item('Problem', 30241, 'Mole in the lawn', { area: GARDEN, iteration: W0, state: 'Spotted' })
  // Already planned for next week.
  .item('Todo', 30181, 'Winter coats to the cleaner', { area: HOUSE, iteration: W_NEXT, state: 'New' })

  // ---- Monday ----
  .at('2026-10-05T16:00:00Z').state(30101, 'Doing').state(30301, 'Started').state(30121, 'Planned')
  .at('2026-10-06T01:00:00Z').state(30201, 'Confirmed').state(30111, 'Doing').state(30311, 'Started').state(30171, 'Doing')
  // ---- Tuesday ----
  .at('2026-10-06T15:30:00Z').state(30121, 'Doing').state(30221, 'Confirmed')
  .at('2026-10-06T17:00:00Z').state(30121, 'Done')
  // Hazel's library run takes a day: Swift passage.
  .at('2026-10-07T01:00:00Z').state(30171, 'Done').state(30201, 'Fixing')
  .pr(31000, { repo: 'Home', author: 'hazel', title: 'Tap washer receipt', links: [30201] })
  // ---- Wednesday ----
  .at('2026-10-07T02:30:00Z').state(30301, 'Checked').state(30302, 'Started')
  // The reassignment: Bram hands the shelves to Odette.
  .at('2026-10-07T03:00:00Z').assign(30112, 'odette', { by: 'bram' })
  .pr(31001, { repo: 'Home', author: 'bram', title: 'Shelf bracket order', links: [30112] })
  .at('2026-10-07T16:00:00Z').state(30302, 'Checked')
  .at('2026-10-08T01:00:00Z').state(30201, 'Checking').state(30101, 'Almost Done').state(30312, 'Started')
  // Odette picks up the frontier's Problem.
  .at('2026-10-08T02:00:00Z').assign(30231, 'odette').state(30231, 'Fixing')
  // ---- Thursday ----
  .at('2026-10-08T15:00:00Z').completePr(31000, { approvedBy: ['bram'] }).state(30201, 'Fixed').state(30231, 'Fixed')
  // Hazel ticks Bram's colour choice.
  .at('2026-10-09T01:00:00Z').state(30312, 'Checked').state(30102, 'Doing')
  .pr(31002, { repo: 'Home', author: 'bram', title: 'Paint swatches', links: [30111] })
  .pr(31003, { repo: 'Home', author: 'hazel', title: 'Birthday menu', links: [30101] })
  // The stair only wanted a rug.
  .at('2026-10-09T02:00:00Z').state(30211, 'Not a Problem')
  // ---- Friday ----
  .at('2026-10-09T15:00:00Z').completePr(31002, { approvedBy: ['hazel'] }).state(30311, 'Checked').state(30111, 'Almost Done')
  // The dinner lands with its whole checklist ticked: Clean landing.
  .at('2026-10-09T16:00:00Z').state(30101, 'Done')
  .at('2026-10-09T17:00:00Z').state(30221, 'Fixing')
  .pr(31004, { repo: 'Home', author: 'odette', title: 'Router settings', links: [30221] })
  .at('2026-10-10T01:00:00Z').state(30102, 'Almost Done')
  // ---- The weekend ----
  .at('2026-10-10T17:00:00Z').state(30102, 'Done').completePr(31004, { approvedBy: ['hazel'] }).state(30221, 'Checking')
  // Too big for this week: Odette puts the shelves off, and the bracket order goes.
  .at('2026-10-10T18:00:00Z').state(30112, 'Someday').abandonPr(31001).state(30141, 'Doing')
  .at('2026-10-11T18:00:00Z').state(30131, 'Dropped', { by: 'hazel' })
  .at('2026-10-11T20:00:00Z').state(30111, 'Done')
  .at('2026-10-11T21:00:00Z').state(30141, 'Done')
  .at('2026-10-11T22:00:00Z').state(30221, 'Fixed')
  // 31003 is still open when the week ends.
  .build();

const todoWeek: Scenario = { ...week, pack: 'todo', mapping: TODO_MAPPING };
export default todoWeek;

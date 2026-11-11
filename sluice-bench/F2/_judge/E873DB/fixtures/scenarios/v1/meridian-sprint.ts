// The dense pod (22 Block A, A13): one sprint whose main pod has 12 homeworlds, the stress case for
// label placement, captain positioning, target visibility and animation timing. Convoy Planning Pod
// (the default) sits deep in its project's areas; Signals Pod is the round's small one. Mara, the
// intended viewer, is the first person. Work items are 55000–55999 and PRs 56000+. Invented names only
// (INV-18).
//
// What it exercises:
// - Twelve seats in one region, holding 30 Stories and 9 Bugs, past the old preview caps (24 rocks,
//   5 hives; A1), with titles of 60 characters and more (A7) and a deep area path (A3).
// - The empty homeworld (A2), three ways: Rook's only Story moves to Signals Pod, Tove's is handed to
//   Hana, and Ulla's is Removed. Each keeps a planet, held earlier in the round. Vash holds Bugs only.
// - Back-to-back work by one captain (A9–A11): Mara starts two Stories in one beat and resolves one
//   an hour later; Bram works three pieces on consecutive hours; Esme fights two Bugs back to back.
// - Guests: Pim holds Tasks only, Quin only reviews.
// - A carry-over: Dov's photo capture moves in from Sprint 6, unfinished.
// - The frontier: 2 Stories and 1 Bug start unassigned; Cleo picks up the Bug, and the belt empties.
// - A PR that changes regions (22 C12): Rook's kiosk-firmware PR opens while its Story is Convoy's
//   and merges after it moved to Signals, so only Signals plays the merge.
import { scenario } from '../../dsl';

const ROOT = 'Meridian Works';
const FLEET = 'Meridian Works\\Fleet Operations';
const LOGISTICS = 'Meridian Works\\Fleet Operations\\Logistics';
const CONVOY = 'Meridian Works\\Fleet Operations\\Logistics\\Convoy Planning Pod';
const SIGNALS = 'Meridian Works\\Fleet Operations\\Signals Pod';
const S_PREV = 'Meridian Works\\Sprint 6';
const S0 = 'Meridian Works\\Sprint 7';
const S_NEXT = 'Meridian Works\\Sprint 8';

/** One piece in Convoy Planning Pod, Sprint 7: its id, title, holder (null: the frontier) and first state. */
type Piece = [id: number, title: string, who: string | null, state?: string];
const STORIES: Piece[] = [
  [55101, 'Reconcile convoy manifests against customs declarations at every waypoint', 'mara'],
  [55102, 'Waypoint ETA board', 'mara', 'Ready'],
  [55103, 'Driver rest-stop planner with legal hours-of-service limits built in', 'mara', 'Ready'],
  [55111, 'Fuel stop optimiser', 'bram', 'Ready'],
  [55112, 'Cold-chain temperature alerts for refrigerated trailers on long hauls', 'bram', 'Ready'],
  [55113, 'Convoy split and merge', 'bram'],
  [55121, 'Depot capacity heatmap', 'cleo', 'Ready'],
  [55122, 'Escort vehicle scheduling across overlapping regional jurisdictions', 'cleo'],
  [55131, 'Route hazard feed', 'dov', 'Ready'],
  [55132, 'Bridge clearance warnings for oversized loads, sourced from the road authority', 'dov', 'Ready'],
  [55133, 'Ferry crossing slots', 'dov'],
  [55141, 'Manifest diff view', 'esme', 'Ready'],
  [55151, 'Toll cost estimator', 'faro', 'Ready'],
  [55152, 'Border crossing paperwork checklist generated from the cargo classification', 'faro'],
  [55153, 'Night convoy lighting rules', 'faro', 'Ready'],
  [55161, 'Weather reroute suggestions', 'gil', 'Ready'],
  [55162, 'Axle weight calculator', 'gil'],
  [55171, 'Dispatcher handover notes', 'hana', 'Ready'],
  [55172, 'Convoy roster export to the payroll system, with overtime split per leg', 'hana'],
  [55181, 'Parking permit lookup', 'rook', 'Ready'],
  [55191, 'Spare parts cache map', 'tove', 'Ready'],
  [55201, 'Legacy route import', 'ulla', 'Ready'],
  [55211, 'Convoy replay timeline', 'mara'],
  [55212, 'Loading dock booking', 'cleo'],
  [55213, 'Hazmat placard reference', 'dov'],
  [55214, 'Trailer swap log', 'gil'],
  [55215, 'Driver fatigue self-report form shown at every mandatory rest stop', 'hana'],
  [55216, 'Delivery window negotiation', 'faro'],
  // The frontier.
  [55291, 'Convoy colour coding', null, 'Ready'],
  [55292, 'Customer arrival notifications by text message and email, with opt-out', null],
];
const BUGS: Piece[] = [
  [55401, 'Manifest totals double-count split pallets after a convoy merge', 'esme', 'Ready'],
  [55402, 'ETA board freezes', 'esme'],
  [55411, 'Fuel stops ignore the vehicle tank size and suggest unreachable stations', 'bram', 'Ready'],
  [55421, 'Toll estimate in wrong currency', 'faro', 'Ready'],
  [55431, 'Hazard feed drops alerts', 'vash', 'Ready'],
  [55432, 'Bridge heights shown in feet for metric-only regions after a locale change', 'vash'],
  [55441, 'Roster export truncates names', 'hana', 'Ready'],
  [55451, 'Depot heatmap blank on Mondays', 'cleo'],
  // The frontier.
  [55491, 'Rest-stop planner rounds the legal limit up instead of down near midnight', null, 'Ready'],
];

export default scenario('meridian-sprint', {
  project: ROOT,
  tz: 'America/Los_Angeles',
  // Sprint 7, start to finish: the episode is the whole round.
  range: ['2026-09-21T07:00:00Z', '2026-10-05T07:00:00Z'],
})
  .area(ROOT, 57000)
  .area(FLEET, 57001)
  .area(LOGISTICS, 57002)
  .area(CONVOY, 57003, { favorite: true, defaultScope: true })
  .area(SIGNALS, 57004, { favorite: true })
  .iteration(S_PREV, 57100, '2026-09-07T07:00:00Z', '2026-09-21T07:00:00Z')
  .iteration(S0, 57101, '2026-09-21T07:00:00Z', '2026-10-05T07:00:00Z')
  .iteration(S_NEXT, 57102, '2026-10-05T07:00:00Z', '2026-10-19T07:00:00Z')
  .repo('convoy-api')
  .repo('manifest-ui')
  .repo('signals-relay')
  .repo('kiosk-firmware')
  // The viewer first, then the other eleven seats, in the order they first hold work.
  .person('mara', 'Mara Ellingsen')
  .person('bram', 'Bram Okonkwo-Lindqvist')
  .person('cleo', 'Cleo Ravensworth')
  .person('dov', 'Dov Abernathy')
  .person('esme', 'Esme Thorncastle')
  .person('faro', 'Faro Vintergaard')
  .person('gil', 'Gil Marchbanks')
  .person('hana', 'Hana Iwasaki-Brook')
  .person('rook', 'Rook Halvorsen')
  .person('tove', 'Tove Lindgren')
  .person('ulla', 'Ulla Brennick')
  .person('vash', 'Vash Okafor')
  // Signals Pod's own seat.
  .person('wil', 'Wil Castellane')
  // Guests: Tasks only, and review only.
  .person('pim', 'Pim Achterhof')
  .person('quin', 'Quin Delacroix-Hart')

  // ---- Containers, in the project's root area ----
  .at('2026-09-01T16:00:00Z')
  .feature(55001, 'Convoy planning', { area: ROOT, state: 'Active' })
  .feature(55002, 'Road safety', { area: ROOT, state: 'Active' })

  // ---- Sprint 6 (the round before): one Story done there, and one carried over ----
  .at('2026-09-08T16:00:00Z')
  .story(55221, 'Convoy check-in kiosk', { parent: 55001, area: CONVOY, iteration: S_PREV, assignee: 'gil' })
  .story(55222, 'Waypoint photo capture', { parent: 55001, area: CONVOY, iteration: S_PREV, assignee: 'dov' })
  .at('2026-09-09T17:00:00Z').state(55221, 'Active').state(55222, 'Active')
  .at('2026-09-16T18:00:00Z').state(55221, 'Closed')
  .at('2026-09-21T15:00:00Z').moveIteration(55222, S0, { by: 'dov' })

  // ---- Sprint 7, planning day ----
  .at('2026-09-21T16:00:00Z')
  .apply((b) => {
    for (const [id, title, who, state] of STORIES) {
      b.story(id, title, { parent: id % 2 ? 55001 : 55002, area: CONVOY, iteration: S0, ...(who ? { assignee: who } : {}), ...(state ? { state } : {}) });
    }
    for (const [id, title, who, state] of BUGS) {
      b.bug(id, title, { parent: 55002, area: CONVOY, iteration: S0, ...(who ? { assignee: who } : {}), ...(state ? { state } : {}) });
    }
  })
  .task(55601, 'Map customs codes', { parent: 55101, iteration: S0, assignee: 'pim' })
  .task(55602, 'Waypoint fixtures', { parent: 55101, iteration: S0, assignee: 'mara' })
  .task(55603, 'Hours-of-service table', { parent: 55103, iteration: S0, assignee: 'pim' })
  // Signals Pod, the round's small region.
  .story(55701, 'Relay health page', { parent: 55001, area: SIGNALS, iteration: S0, assignee: 'wil', state: 'Ready' })
  .bug(55711, 'Relay drops the first packet after reconnecting to a roaming base station', { parent: 55002, area: SIGNALS, iteration: S0, assignee: 'wil', state: 'Ready' })
  // Already planned for the next sprint.
  .story(55801, 'Winter tyre rota', { parent: 55002, area: CONVOY, iteration: S_NEXT })

  // ---- Week one ----
  // Mara starts two Stories in one beat, then resolves the first an hour later (back to back).
  .at('2026-09-22T16:00:00Z').state(55101, 'Active').state(55102, 'Active').state(55602, 'Active')
  .at('2026-09-22T17:00:00Z').state(55101, 'Resolved')
  // Bram works three pieces on consecutive hours.
  .at('2026-09-22T18:00:00Z').state(55111, 'Active')
  .at('2026-09-22T19:00:00Z').state(55112, 'Active')
  .at('2026-09-22T20:00:00Z').state(55411, 'Active')
  // Esme fights two Bugs back to back.
  .at('2026-09-23T16:00:00Z').state(55401, 'Active').state(55402, 'Active')
  .at('2026-09-23T17:00:00Z').state(55401, 'Resolved')
  .at('2026-09-23T18:00:00Z').state(55121, 'Active').state(55131, 'Active').state(55151, 'Active')
  .at('2026-09-23T19:00:00Z').state(55161, 'Active').state(55171, 'Active').state(55431, 'Active')
  .at('2026-09-23T21:00:00Z').pr(56000, { repo: 'manifest-ui', author: 'mara', title: 'Customs reconciliation view', links: [55101] })
  .at('2026-09-24T16:00:00Z').state(55601, 'Active').state(55181, 'Active').state(55191, 'Active')
  .at('2026-09-24T17:00:00Z').state(55141, 'Active').state(55701, 'Active')
  // Cleo picks up the frontier's Bug.
  .at('2026-09-24T18:00:00Z').assign(55491, 'cleo').state(55491, 'Active')
  .at('2026-09-24T19:00:00Z').pr(56001, { repo: 'convoy-api', author: 'bram', title: 'Fuel stop ranking', links: [55111, 55411] })
  .at('2026-09-24T21:00:00Z').completePr(56000, { approvedBy: ['quin'] }).state(55101, 'Closed').state(55601, 'Closed')
  // Rook's only Story turns out to be Signals Pod's: his Convoy planet is empty from here (A2).
  // Rook's PR for it opens while it's Convoy's and merges once it's Signals': the merge is Signals' to play, never Convoy's (22 C12).
  .at('2026-09-24T20:00:00Z').pr(56005, { repo: 'kiosk-firmware', author: 'rook', title: 'Kiosk offline queue', links: [55181] })
  .at('2026-09-25T16:00:00Z').moveArea(55181, SIGNALS, { by: 'rook' })
  .at('2026-09-25T17:00:00Z').state(55112, 'Resolved').state(55122, 'Active').state(55132, 'Active')
  .at('2026-09-25T18:00:00Z').pr(56002, { repo: 'convoy-api', author: 'dov', title: 'Hazard feed consumer', links: [55131] })
  .at('2026-09-25T20:00:00Z').state(55421, 'Active').state(55441, 'Active').state(55711, 'Active')

  // ---- Week two ----
  // Tove hands the parts map to Hana: her planet is empty from here (A2).
  .at('2026-09-28T16:00:00Z').assign(55191, 'hana', { by: 'tove' })
  .at('2026-09-28T17:00:00Z').completePr(56001, { approvedBy: ['mara', 'quin'] }).state(55111, 'Closed').state(55411, 'Closed')
  // Ulla's legacy import is dropped: her planet holds a ghost (A2).
  .at('2026-09-28T18:00:00Z').state(55201, 'Removed', { by: 'ulla' })
  .at('2026-09-28T19:00:00Z').state(55102, 'Resolved').state(55402, 'Resolved').state(55451, 'Active')
  .at('2026-09-29T16:00:00Z').state(55121, 'Closed').state(55141, 'Resolved').state(55491, 'Resolved')
  .at('2026-09-29T17:00:00Z').pr(56003, { repo: 'signals-relay', author: 'wil', title: 'Replay first packet', links: [55711] })
  .at('2026-09-29T18:00:00Z').state(55152, 'Active').state(55162, 'Active').state(55172, 'Active')
  .at('2026-09-29T20:00:00Z').completePr(56002, { approvedBy: ['quin'] }).state(55131, 'Resolved').state(55431, 'Resolved')
  .at('2026-09-30T16:00:00Z').state(55401, 'Closed').state(55402, 'Closed').state(55102, 'Closed')
  .at('2026-09-30T17:00:00Z').state(55112, 'Closed').state(55131, 'Closed').state(55491, 'Closed')
  .at('2026-09-30T18:00:00Z').pr(56004, { repo: 'manifest-ui', author: 'esme', title: 'Manifest diff renderer', links: [55141] })
  .at('2026-09-30T19:00:00Z').state(55431, 'Closed').state(55432, 'Active').state(55603, 'Active')
  .at('2026-09-30T20:00:00Z').completePr(56005, { approvedBy: ['wil'] })
  .at('2026-10-01T16:00:00Z').completePr(56003, { approvedBy: ['quin'] }).state(55711, 'Closed').state(55181, 'Resolved')
  .at('2026-10-01T17:00:00Z').state(55151, 'Resolved').state(55161, 'Resolved').state(55171, 'Resolved')
  .at('2026-10-01T18:00:00Z').state(55421, 'Closed').state(55441, 'Resolved').state(55122, 'Resolved')
  .at('2026-10-02T16:00:00Z').completePr(56004, { approvedBy: ['mara'] }).state(55141, 'Closed')
  .at('2026-10-02T17:00:00Z').state(55151, 'Closed').state(55161, 'Closed').state(55441, 'Closed')
  .at('2026-10-02T18:00:00Z').state(55103, 'Active').state(55133, 'Active').state(55153, 'Active')
  .at('2026-10-02T19:00:00Z').state(55212, 'Active').state(55213, 'Active').state(55214, 'Active')
  // Too big for this sprint: planned out to the next one.
  .at('2026-10-02T20:00:00Z').state(55216, 'Deferred').moveIteration(55216, S_NEXT)
  .at('2026-10-02T21:00:00Z').state(55171, 'Closed').state(55122, 'Closed').state(55701, 'Resolved')
  // 55432, 55451 and much of the week-two work are still open when the sprint ends.
  .build();

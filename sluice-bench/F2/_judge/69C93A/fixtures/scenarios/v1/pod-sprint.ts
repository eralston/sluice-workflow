// The SDLC v1 episode (17 W1-T2, 13 §3): one pod's sprint, played back as a solar system. Harbor Pod
// (the default) runs Sprint 13 with four seats and a frontier; Lantern Pod is the round's other
// region, and Reef Pod is an Area Path that isn't saved. Wren, the intended viewer, is the first
// person (the fake ADO's @Me). Work items are 20000–20999 and PRs 21000+. Invented names only
// (INV-18).
//
// What it exercises, by 13's sections:
// - Seats (§3): Wren (3 Stories), Ossian (5 Stories and 4 Bugs, past both 3+3 caps, so both his
//   formations form), and two light seats, Juno and Kit. Pell holds Tasks only, so has no seat.
//   Sable and Tamsin only review.
// - The frontier: 2 Stories and 1 Bug start unassigned. Juno picks up the Bug and closes it.
// - Every rung (New, Ready, Ready for Review, Active, Resolved, Ready to Accept, Closed, Removed),
//   plus Deferred, Rejected, a reopen, a mid-sprint Bug, a carry-over into the sprint, a move out
//   to the next one, a pod move (Lantern → Harbor) and a reassignment (Kit → Juno).
// - Tasks closed by someone other than their assignee (Wren closes one of Pell's).
// - Milestones (13 §6): a seat completes (Juno in Lantern, Wren in Harbor), and Harbor's last open
//   Bug closes near the sprint's end, so its system is clear.
// - Stations (§4.4): tide-gateway serves three seats and holds 7 PRs open at once ("+N");
//   harbor-console serves Kit alone; ledger-sync's one PR is linked to 2 items. Wren approves 3
//   merges, one PR is abandoned and one is still open at the end.
// - Achievements (18 §5 A1): Wren lands all three of her Stories (Clear skies, Hat trick:
//   landings), one inside 3 working days with its Tasks done first (Swift passage, Clean landing),
//   never holds more than 2 Underway (Steady hands), approves 3 merges (Hat trick: reviews) and
//   closes a Task on Ossian's Story (Wingman).
import { scenario } from '../../dsl';

const ROOT = 'Tidewater Array';
const HARBOR = 'Tidewater Array\\Harbor Pod';
const LANTERN = 'Tidewater Array\\Lantern Pod';
const REEF = 'Tidewater Array\\Reef Pod';
const S_PREV = 'Tidewater Array\\Sprint 12';
const S0 = 'Tidewater Array\\Sprint 13';
const S_NEXT = 'Tidewater Array\\Sprint 14';

export default scenario('pod-sprint', {
  project: ROOT,
  tz: 'America/Los_Angeles',
  // Sprint 13, start to finish: the episode is the whole round.
  range: ['2026-09-28T07:00:00Z', '2026-10-12T07:00:00Z'],
})
  // B4: Harbor's Stories board. Active is split (Doing, Done), Code Review is a custom column inside the Active state, and
  // Ready to Accept is a column of its own (the Agile board has no such column). `column` calls below ride on the PR link.
  .board({
    columns: [{ name: 'New' }, { name: 'Ready' }, { name: 'Active', split: true }, { name: 'Code Review' }, { name: 'Resolved' }, { name: 'Ready to Accept' }, { name: 'Closed' }],
    byState: {
      New: 'New', Ready: 'Ready', 'Ready for Review': 'Ready', Deferred: 'Ready', Active: 'Active', Resolved: 'Resolved',
      'Ready to Accept': 'Ready to Accept', Closed: 'Closed', Removed: 'Closed', Rejected: 'Closed',
    },
  })
  .area(ROOT, 22000)
  .area(HARBOR, 22001, { favorite: true, defaultScope: true })
  .area(LANTERN, 22002, { favorite: true })
  .area(REEF, 22003)
  .iteration(S_PREV, 22100, '2026-09-14T07:00:00Z', '2026-09-28T07:00:00Z')
  .iteration(S0, 22101, '2026-09-28T07:00:00Z', '2026-10-12T07:00:00Z')
  .iteration(S_NEXT, 22102, '2026-10-12T07:00:00Z', '2026-10-26T07:00:00Z')
  .repo('tide-gateway')
  .repo('harbor-console')
  .repo('ledger-sync')
  // The viewer first.
  .person('wren', 'Wren Calloway')
  .person('ossian', 'Ossian Vale')
  .person('juno', 'Juno Achterberg')
  .person('kit', 'Kit Marchetti')
  .person('pell', 'Pell Ibarra')
  // Reviewer-only guests: they approve PRs and are never assigned.
  .person('sable', 'Sable Nakamura')
  .person('tamsin', 'Tamsin Oduya')

  // ---- Containers: 3 Features in the project's root area (station mega-label subtitles) ----
  .at('2026-09-01T16:00:00Z')
  .feature(20001, 'Tide tables', { area: ROOT, state: 'Active' })
  .feature(20002, 'Harbor alerts', { area: ROOT, state: 'Active' })
  .feature(20003, 'Mooring ledger', { area: ROOT, state: 'Active' })

  // ---- Sprint 12 (the round before) ----
  .at('2026-09-14T16:00:00Z')
  .story(20171, 'Harbor landing page', { parent: 20001, area: HARBOR, iteration: S_PREV, assignee: 'wren' })
  .story(20121, 'Harbor alerts opt-in', { parent: 20002, area: HARBOR, iteration: S_PREV, assignee: 'juno' })
  .at('2026-09-15T17:00:00Z').state(20171, 'Active')
  .at('2026-09-21T17:00:00Z').state(20121, 'Active')
  .at('2026-09-23T18:00:00Z').state(20171, 'Closed')
  // The carry-over: unfinished at Sprint 12's end, it moves into Sprint 13.
  .at('2026-09-28T15:00:00Z').moveIteration(20121, S0, { by: 'juno' })

  // ---- Sprint 13, planning day ----
  .at('2026-09-28T16:00:00Z')
  // Wren's seat: three Stories, worked one or two at a time.
  .story(20101, 'Tide table widget', { parent: 20001, area: HARBOR, iteration: S0, assignee: 'wren' })
  .story(20102, 'Low-water warnings', { parent: 20002, area: HARBOR, iteration: S0, assignee: 'wren' })
  .story(20103, 'Berth schedule export', { parent: 20003, area: HARBOR, iteration: S0, assignee: 'wren', state: 'Ready' })
  .task(20301, 'Chart the high tides', { parent: 20101, iteration: S0, assignee: 'wren' })
  .task(20302, 'Moon phase overlay', { parent: 20101, iteration: S0, assignee: 'pell' })
  .task(20303, 'Threshold settings', { parent: 20102, iteration: S0, assignee: 'pell' })
  // Ossian's seat: 5 Stories and 3 Bugs now, and a fourth Bug mid-sprint.
  .story(20111, 'Harbor master dashboard', { parent: 20002, area: HARBOR, iteration: S0, assignee: 'ossian', state: 'Ready' })
  .story(20112, 'Pilot boat roster', { parent: 20003, area: HARBOR, iteration: S0, assignee: 'ossian', state: 'Ready for Review' })
  .story(20113, 'Swell forecast feed', { parent: 20001, area: HARBOR, iteration: S0, assignee: 'ossian' })
  .story(20114, 'Mooring fee calculator', { parent: 20003, area: HARBOR, iteration: S0, assignee: 'ossian', state: 'Ready' })
  .story(20115, 'Quay camera grid', { parent: 20002, area: HARBOR, iteration: S0, assignee: 'ossian', state: 'Ready' })
  .bug(20211, 'Buoy pings drop at midnight', { parent: 20001, area: HARBOR, iteration: S0, assignee: 'ossian', state: 'Ready' })
  .bug(20212, 'Duplicate berth bookings', { parent: 20003, area: HARBOR, iteration: S0, assignee: 'ossian' })
  .bug(20213, 'Tide offsets off by an hour', { parent: 20001, area: HARBOR, iteration: S0, assignee: 'ossian', state: 'Ready' })
  .task(20311, 'Dashboard layout', { parent: 20111, iteration: S0, assignee: 'pell' })
  .task(20312, 'Vessel status tiles', { parent: 20111, iteration: S0, assignee: 'ossian' })
  // The light seats.
  .story(20122, 'Crane booking form', { parent: 20003, area: HARBOR, iteration: S0, assignee: 'kit', state: 'Ready' })
  .task(20321, 'Opt-in copy review', { parent: 20121, iteration: S0, assignee: 'pell' })
  .bug(20221, 'Console freezes on export', { parent: 20003, area: HARBOR, iteration: S0, assignee: 'kit', state: 'Ready' })
  // The frontier: in the pod and the sprint, held by nobody.
  .story(20131, 'Seasonal berth pricing', { parent: 20003, area: HARBOR, iteration: S0 })
  .story(20132, 'Harbor map legend', { parent: 20001, area: HARBOR, iteration: S0, state: 'Ready' })
  .bug(20231, 'Wrong time zone on receipts', { parent: 20003, area: HARBOR, iteration: S0, state: 'Ready' })
  // Lantern Pod, the round's other region.
  .story(20141, 'Lamp-room telemetry', { parent: 20002, area: LANTERN, iteration: S0, assignee: 'kit', state: 'Ready' })
  .story(20151, 'Beacon rotation timer', { parent: 20002, area: LANTERN, iteration: S0, assignee: 'juno' })
  .bug(20251, 'Beacon log gaps', { parent: 20002, area: LANTERN, iteration: S0 })
  // Reef Pod isn't saved: its Story is in the sprint, but outside the pods.
  .story(20161, 'Reef sensor calibration', { parent: 20001, area: REEF, iteration: S0, assignee: 'kit' })
  // Already planned for the next sprint.
  .story(20181, 'Winter mooring plan', { parent: 20003, area: HARBOR, iteration: S_NEXT })

  // ---- Week one ----
  .at('2026-09-29T16:00:00Z').state(20101, 'Active').state(20301, 'Active').state(20111, 'Active').state(20211, 'Active')
  .at('2026-09-29T18:00:00Z').state(20302, 'Active').state(20151, 'Active').state(20113, 'Ready')
  .at('2026-09-29T20:00:00Z').state(20112, 'Active').state(20141, 'Active')
  .at('2026-09-30T17:00:00Z').state(20301, 'Closed').state(20212, 'Rejected')
  .at('2026-09-30T19:00:00Z').column(20111, 'Code Review').pr(21000, { repo: 'tide-gateway', author: 'ossian', title: 'Dashboard endpoints', links: [20111] })
  .at('2026-09-30T21:00:00Z').state(20302, 'Closed').state(20101, 'Resolved')
  .at('2026-10-01T16:00:00Z').state(20101, 'Closed')
  .at('2026-10-01T17:00:00Z').state(20102, 'Active').state(20303, 'Active').state(20115, 'Active')
  .at('2026-10-01T19:00:00Z').column(20121, 'Active', true).pr(21001, { repo: 'tide-gateway', author: 'juno', title: 'Alert opt-in flags', links: [20121] })
  // A pod move: Kit's Lantern Story turns out to be Harbor's.
  .at('2026-10-02T16:00:00Z').moveArea(20141, HARBOR, { by: 'kit' })
  // Juno picks up the frontier's Bug.
  .at('2026-10-02T17:00:00Z').assign(20231, 'juno').state(20231, 'Active')
  .at('2026-10-02T19:00:00Z')
  .column(20102, 'Code Review').column(20211, 'Active', true)
  .pr(21002, { repo: 'tide-gateway', author: 'wren', title: 'Low-water thresholds', links: [20102] })
  .pr(21003, { repo: 'tide-gateway', author: 'ossian', title: 'Keep buoy pings across midnight', links: [20211] })
  .at('2026-10-02T21:00:00Z').state(20221, 'Active').state(20151, 'Closed')
  .at('2026-10-03T00:00:00Z').column(20115, 'Code Review').pr(21004, { repo: 'tide-gateway', author: 'ossian', title: 'Camera grid tiling', links: [20115] })

  // ---- Week two ----
  // A Bug found mid-sprint, taken into it.
  .at('2026-10-05T16:00:00Z').bug(20214, 'Alert sound loops', { parent: 20002, area: HARBOR, iteration: S0, assignee: 'ossian' })
  .at('2026-10-05T17:00:00Z').state(20231, 'Closed').state(20214, 'Active').state(20121, 'Resolved')
  // The reassignment: Kit hands the crane form to Juno.
  .at('2026-10-05T18:00:00Z').assign(20122, 'juno', { by: 'kit' }).state(20122, 'Active')
  .at('2026-10-05T19:00:00Z')
  .pr(21005, { repo: 'tide-gateway', author: 'wren', title: 'Berth export endpoint', links: [20103] })
  .pr(21006, { repo: 'tide-gateway', author: 'juno', title: 'Crane slot lookup', links: [20122] })
  // tide-gateway now holds 7 open PRs at once.
  .at('2026-10-05T21:00:00Z').state(20111, 'Resolved').state(20303, 'Closed').state(20103, 'Active')
  .at('2026-10-06T16:00:00Z').completePr(21001, { approvedBy: ['wren'] }).state(20121, 'Closed')
  .at('2026-10-06T17:00:00Z').completePr(21002, { approvedBy: ['sable'] }).state(20102, 'Closed')
  .at('2026-10-06T18:00:00Z').pr(21007, { repo: 'harbor-console', author: 'kit', title: 'Stream the export', links: [20221] })
  .at('2026-10-06T20:00:00Z').state(20115, 'Closed').state(20213, 'Active')
  // Wren closes a Task on Ossian's Story that Pell holds.
  .at('2026-10-07T16:00:00Z').state(20311, 'Closed', { by: 'wren' }).state(20312, 'Closed')
  .at('2026-10-07T17:00:00Z').completePr(21000, { approvedBy: ['wren', 'sable'] }).state(20111, 'Closed')
  // Too big for this sprint: deferred, and planned out to the next one.
  .at('2026-10-07T19:00:00Z').state(20114, 'Deferred').moveIteration(20114, S_NEXT)
  .at('2026-10-07T20:00:00Z').pr(21008, { repo: 'ledger-sync', author: 'ossian', title: 'Roster and export ledger rows', links: [20112, 20221] })
  // A reopen: the camera grid's tiling fails on the night shift.
  .at('2026-10-07T22:00:00Z').state(20115, 'Active')
  .at('2026-10-08T16:00:00Z').completePr(21003, { approvedBy: ['tamsin'] }).state(20211, 'Resolved')
  .at('2026-10-08T17:00:00Z').completePr(21007, { approvedBy: ['wren', 'tamsin'] }).state(20221, 'Closed')
  .at('2026-10-08T18:00:00Z').abandonPr(21004).state(20103, 'Ready to Accept').state(20213, 'Ready to Accept')
  .at('2026-10-08T20:00:00Z').state(20211, 'Closed').state(20112, 'Resolved').state(20141, 'Resolved')
  .at('2026-10-09T16:00:00Z').completePr(21005, { approvedBy: ['tamsin'] }).state(20103, 'Closed')
  .at('2026-10-09T17:00:00Z').completePr(21008, { approvedBy: ['sable'] }).state(20214, 'Resolved')
  .at('2026-10-09T19:00:00Z').state(20131, 'Removed', { by: 'ossian' })
  // Ossian closes Harbor's last two open Bugs: the system is clear (13 §6, 2026-10-13).
  .at('2026-10-09T20:00:00Z').state(20214, 'Closed')
  .at('2026-10-09T21:00:00Z').state(20213, 'Closed')
  // 21006 is still open when the sprint ends.
  .build();

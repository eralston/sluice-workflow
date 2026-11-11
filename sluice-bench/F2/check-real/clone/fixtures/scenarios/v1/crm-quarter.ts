// The CRM v1 episode (17 W3-T2, 12 the CRM column): one sales team's quarter, played back as a solar
// system. *Larch & Pine Trading* is the pipeline, Q3 2026 the round, and its territories the
// regions: North (the default) and Coastal. Imelda is the intended viewer, picked in Settings (seats
// go by first hold, so she isn't necessarily seated first). Work items are 40000–40999 and quotes
// (PRs) 41000+. Accounts are the facilities (repos), a quote is delivered into its account, the
// discount desk signs quotes off (as their approver) and a lost quote is abandoned. Read by the CRM
// pack (`domainPack: 'crm'`, config/packs/crm.mapping.json), served under Solar only (17 A3).
// Invented names and companies only (INV-18).
//
// What it exercises:
// - Seats: Imelda (3 Deals, a carry-over among them, and an Escalation), Caspian (2 Deals and an
//   Escalation with a Follow-up) and Noor (a Deal and an Escalation, then a lead from the
//   frontier). Coastal is the quarter's other territory, with one of Caspian's Deals.
// - The frontier (unowned leads): a Deal and an Escalation start unowned. Noor picks up the lead and
//   works it; the Escalation turns out to be a Duplicate.
// - Every rung, plus On Hold (deferred), Withdrawn (struck), Closed Lost, a carry-over from Q2, a
//   Deal already planned for Q4 and a reassignment (Caspian hands the cold-chain trial to Noor).
// - Facilities: Osprey Freight serves two seats and Birchwood Mills one; Quillon Dairy holds a lost
//   quote and one still out at the end; Saltmarsh Outfitters serves Coastal alone.
// - Achievements (18 §5, the CRM thresholds: 10 working days, K = 4): Imelda closes all three of
//   her Deals and settles her Escalation (Clear skies, Hat trick: landings), wins the renewal with
//   every Follow-up done (Clean landing), never has more than 4 In progress (Steady hands) and
//   approves the billing credit that settles Caspian's dispute (Wingman).
import { scenario, type Scenario } from '../../dsl';
import { CRM_MAPPING } from '@shared/packs/crm';

const ROOT = 'Larch & Pine Trading';
const NORTH = 'Larch & Pine Trading\\North Territory';
const COAST = 'Larch & Pine Trading\\Coastal Territory';
const Q_PREV = 'Larch & Pine Trading\\Q2 2026';
const Q0 = 'Larch & Pine Trading\\Q3 2026';
const Q_NEXT = 'Larch & Pine Trading\\Q4 2026';

const quarter = scenario('crm-quarter', {
  project: ROOT,
  tz: 'America/New_York',
  // Q3 2026, start to finish: the episode is the whole round.
  range: ['2026-07-01T04:00:00Z', '2026-10-01T04:00:00Z'],
})
  .area(ROOT, 42000)
  .area(NORTH, 42001, { favorite: true, defaultScope: true })
  .area(COAST, 42002, { favorite: true })
  .iteration(Q_PREV, 42100, '2026-04-01T04:00:00Z', '2026-07-01T04:00:00Z')
  .iteration(Q0, 42101, '2026-07-01T04:00:00Z', '2026-10-01T04:00:00Z')
  .iteration(Q_NEXT, 42102, '2026-10-01T04:00:00Z', '2027-01-01T05:00:00Z')
  // Accounts.
  .repo('Birchwood Mills')
  .repo('Osprey Freight')
  .repo('Quillon Dairy')
  .repo('Saltmarsh Outfitters')
  // The intended viewer (declaration order doesn't seat anyone first).
  .person('imelda', 'Imelda Larch')
  .person('caspian', 'Caspian Pine')
  .person('noor', 'Noor Ashgrove')
  // Approver only: signs off discounts, and is never assigned.
  .person('desk', 'Discount Desk')

  // ---- Q2 (the quarter before) ----
  .at('2026-06-15T14:00:00Z')
  .item('Deal', 40171, 'Birchwood spring order', { area: NORTH, iteration: Q_PREV, assignee: 'imelda', state: 'Qualified' })
  .at('2026-06-22T14:00:00Z').state(40171, 'Negotiation')
  // The carry-over: still open at Q2's end, it moves into Q3.
  .at('2026-06-30T20:00:00Z').moveIteration(40171, Q0, { by: 'imelda' })

  // ---- Q3, the first morning ----
  .at('2026-07-01T14:00:00Z')
  // Imelda's seat.
  .item('Deal', 40101, 'Birchwood Mills renewal', { area: NORTH, iteration: Q0, assignee: 'imelda', state: 'Qualified' })
  .item('Follow-up', 40301, 'Call the buyer', { parent: 40101, iteration: Q0, assignee: 'imelda', state: 'Scheduled' })
  .item('Follow-up', 40302, 'Send the renewal terms', { parent: 40101, iteration: Q0, assignee: 'imelda', state: 'Scheduled' })
  .item('Deal', 40102, 'Osprey Freight expansion', { area: NORTH, iteration: Q0, assignee: 'imelda', state: 'Lead' })
  .item('Escalation', 40201, 'Birchwood late shipment', { area: NORTH, iteration: Q0, assignee: 'imelda', state: 'Reported' })
  // Caspian's seat.
  .item('Deal', 40111, 'Quillon Dairy pilot', { area: NORTH, iteration: Q0, assignee: 'caspian', state: 'Lead' })
  .item('Deal', 40112, 'Osprey cold-chain trial', { area: NORTH, iteration: Q0, assignee: 'caspian', state: 'Qualified' })
  .item('Escalation', 40211, 'Osprey billing dispute', { area: NORTH, iteration: Q0, assignee: 'caspian', state: 'Reported' })
  .item('Follow-up', 40311, 'Credit memo meeting', { parent: 40211, iteration: Q0, assignee: 'caspian', state: 'Scheduled' })
  // Noor's seat.
  .item('Deal', 40121, 'Quillon cheese line', { area: NORTH, iteration: Q0, assignee: 'noor', state: 'Lead' })
  .item('Escalation', 40221, 'Quillon portal outage', { area: NORTH, iteration: Q0, assignee: 'noor', state: 'Reported' })
  // The frontier: unowned in the North this quarter.
  .item('Deal', 40131, 'Inbound lead: Fernhall Co-op', { area: NORTH, iteration: Q0, state: 'Lead' })
  .item('Escalation', 40231, 'Unrouted complaint', { area: NORTH, iteration: Q0, state: 'Reported' })
  // The Coastal territory, the round's other region.
  .item('Deal', 40141, 'Saltmarsh summer order', { area: COAST, iteration: Q0, assignee: 'caspian', state: 'Qualified' })
  .item('Escalation', 40241, 'Saltmarsh returns backlog', { area: COAST, iteration: Q0, state: 'Reported' })
  // Already planned for next quarter.
  .item('Deal', 40181, 'Birchwood winter contract', { area: NORTH, iteration: Q_NEXT, state: 'Lead' })

  // ---- July ----
  .at('2026-07-02T15:00:00Z').state(40171, 'Verbal Commit')
  .pr(41000, { repo: 'Birchwood Mills', author: 'imelda', title: 'Spring order quote', links: [40171] })
  .at('2026-07-07T15:00:00Z').completePr(41000, { approvedBy: ['desk'] }).state(40171, 'Closed Won')
  .at('2026-07-08T14:00:00Z').state(40101, 'Negotiation').state(40301, 'In Progress')
  .at('2026-07-09T18:00:00Z').state(40301, 'Done')
  .at('2026-07-10T14:00:00Z').state(40201, 'Triaged').state(40211, 'Triaged').state(40111, 'Qualified')
  .at('2026-07-14T14:00:00Z').state(40201, 'Working').state(40311, 'In Progress')
  // Noor picks up the frontier's lead.
  .at('2026-07-15T15:00:00Z').assign(40131, 'noor').state(40131, 'Qualified').state(40141, 'Negotiation')
  .at('2026-07-16T15:00:00Z').state(40211, 'Working')
  .at('2026-07-20T14:00:00Z').state(40102, 'Qualified').state(40121, 'Qualified').state(40221, 'Triaged')
  .at('2026-07-21T14:00:00Z').pr(41001, { repo: 'Osprey Freight', author: 'caspian', title: 'Billing credit', links: [40211] })
  .at('2026-07-22T16:00:00Z').state(40111, 'Proposal')
  .pr(41002, { repo: 'Quillon Dairy', author: 'caspian', title: 'Pilot quote', links: [40111] })
  .at('2026-07-24T14:00:00Z').state(40201, 'Mitigated')
  .at('2026-07-28T14:00:00Z').state(40311, 'Done').completePr(41001, { approvedBy: ['imelda'] }).state(40211, 'Customer Review')
  .at('2026-07-29T15:00:00Z').state(40102, 'Proposal')

  // ---- August ----
  .at('2026-08-03T14:00:00Z').state(40102, 'Negotiation')
  .pr(41003, { repo: 'Osprey Freight', author: 'imelda', title: 'Expansion quote', links: [40102] })
  .at('2026-08-04T14:00:00Z').state(40201, 'Settled')
  .at('2026-08-05T15:00:00Z').state(40211, 'Settled')
  .at('2026-08-06T15:00:00Z').state(40111, 'Negotiation')
  // The reassignment: Caspian hands the cold-chain trial to Noor, who puts it on hold.
  .at('2026-08-10T14:00:00Z').assign(40112, 'noor', { by: 'caspian' })
  .at('2026-08-12T14:00:00Z').state(40112, 'On Hold').state(40121, 'Proposal').state(40302, 'In Progress')
  .at('2026-08-14T16:00:00Z').state(40302, 'Done').state(40101, 'Verbal Commit')
  .at('2026-08-17T14:00:00Z').pr(41004, { repo: 'Birchwood Mills', author: 'imelda', title: 'Renewal quote', links: [40101] })
  // The customer withdraws the outage report.
  .at('2026-08-19T15:00:00Z').state(40221, 'Withdrawn')
  // A lost quote: the pilot goes to a competitor.
  .at('2026-08-20T15:00:00Z').abandonPr(41002).state(40111, 'Closed Lost')
  .at('2026-08-24T14:00:00Z').state(40101, 'Contract Out')
  // The renewal is won with every Follow-up done: Clean landing.
  .at('2026-08-26T15:00:00Z').completePr(41004, { approvedBy: ['desk'] }).state(40101, 'Closed Won')
  .at('2026-08-27T14:00:00Z').state(40121, 'Negotiation')
  .pr(41005, { repo: 'Quillon Dairy', author: 'noor', title: 'Cheese line quote', links: [40121] })
  .at('2026-08-31T14:00:00Z').state(40131, 'Proposal')

  // ---- September ----
  .at('2026-09-02T15:00:00Z').state(40231, 'Duplicate', { by: 'caspian' })
  .at('2026-09-08T14:00:00Z').state(40102, 'Verbal Commit')
  .pr(41006, { repo: 'Saltmarsh Outfitters', author: 'caspian', title: 'Summer order quote', links: [40141] })
  .at('2026-09-09T15:00:00Z').completePr(41006, { approvedBy: ['desk'] }).state(40141, 'Closed Won')
  .at('2026-09-14T14:00:00Z').state(40102, 'Contract Out')
  .at('2026-09-16T15:00:00Z').completePr(41003, { approvedBy: ['desk', 'caspian'] }).state(40102, 'Closed Won')
  .at('2026-09-21T14:00:00Z').state(40131, 'Negotiation')
  // 41005 is still out when the quarter ends.
  .build();

const crmQuarter: Scenario = { ...quarter, pack: 'crm', mapping: CRM_MAPPING };
export default crmQuarter;

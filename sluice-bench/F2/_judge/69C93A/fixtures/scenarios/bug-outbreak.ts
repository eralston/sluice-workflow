// Kestrel Team (added at HG-3a, 2026-10-03): an average Feature that turns into a bug outbreak. Two
// people work two Stories (six Tasks, two PRs each, reviewing each other), and then, as missed
// requirements surface, the Bugs come one after another: a Bug, its PR, resolved; another, its PR,
// resolved; then two at once, one PR for both, with a third teammate helping review. It should feel
// like a team calmly handling a rough week, never an alarm (INV-19, 09 signal ladder). Applied inside
// orbit-week (Nimbus Deck) so fixture mode can show it. Invented names only.
import type { scenario } from '../dsl';

type Builder = ReturnType<typeof scenario>;

export function bugOutbreak(b: Builder): void {
  b.area('Nimbus Deck\\Kestrel Team', 14, { favorite: true })
    .repo('reminder-svc')
    .repo('member-web')
    .person('odile', 'Odile Ferrand')
    .person('bram', 'Bram Castellanos')
    .at('2026-09-08T17:00:00Z').feature(141, 'Policy renewal reminders', { area: 'Nimbus Deck\\Kestrel Team', state: 'Active' })
    .story(281, 'Schedule renewal reminder emails', { parent: 141, state: 'Ready', assignee: 'odile' })
    .story(282, 'Reminder preferences page', { parent: 141, state: 'Ready', assignee: 'bram' })

    // Steps sit an hour or more apart, so each plays as its own beat (05 §3 groups closer events).
    // --- Monday and Tuesday: two Stories under way ------------------------------------------
    .at('2026-09-14T16:00:00Z').state(281, 'Active')
    .task(501, 'Reminder schedule table', { parent: 281, assignee: 'odile' })
    .task(502, 'Nightly reminder job', { parent: 281, assignee: 'odile' })
    .at('2026-09-14T17:00:00Z').state(501, 'Active')
    .at('2026-09-14T18:00:00Z').state(282, 'Active')
    .task(503, 'Preferences form', { parent: 282, assignee: 'bram' })
    .task(504, 'Preferences API', { parent: 282, assignee: 'bram' })
    .at('2026-09-14T19:00:00Z').state(503, 'Active')
    .at('2026-09-15T16:00:00Z').pr(9501, { repo: 'reminder-svc', author: 'odile', title: 'Reminder schedule storage', links: [501] })
    .at('2026-09-15T17:30:00Z').pr(9502, { repo: 'member-web', author: 'bram', title: 'Reminder preferences form', links: [503] })
    .at('2026-09-15T20:00:00Z').state(501, 'Closed').state(502, 'Active')

    // --- Wednesday: the first PRs merge, the second ones open --------------------------------
    .at('2026-09-16T15:00:00Z').completePr(9501, { approvedBy: ['bram'] })
    .at('2026-09-16T16:00:00Z').pr(9503, { repo: 'reminder-svc', author: 'odile', title: 'Nightly reminder job and email template', links: [502] })
    .at('2026-09-16T17:00:00Z').completePr(9502, { approvedBy: ['odile'] })
    .at('2026-09-16T18:00:00Z').state(503, 'Closed').state(504, 'Active')
    .task(505, 'Reminder email template', { parent: 281, assignee: 'odile' })
    .task(506, 'Preferences page accessibility pass', { parent: 282, assignee: 'bram' })
    .at('2026-09-16T19:00:00Z').state(505, 'Active').linkPr(9503, 505, { by: 'odile' })
    .at('2026-09-16T20:00:00Z').pr(9504, { repo: 'member-web', author: 'bram', title: 'Preferences API and accessibility', links: [504, 506] })
    .at('2026-09-16T21:00:00Z').completePr(9503, { approvedBy: ['bram'] })
    .at('2026-09-16T22:00:00Z').state(502, 'Closed').state(505, 'Closed').state(281, 'Resolved')

    // --- The outbreak: one Bug, then another, then two at once ------------------------------
    .at('2026-09-16T23:00:00Z').bug(331, 'Reminders sent twice on the DST change', { parent: 141, assignee: 'odile', by: 'bram' })
    .at('2026-09-17T15:30:00Z').state(331, 'Active')
    .at('2026-09-17T16:30:00Z').pr(9505, { repo: 'reminder-svc', author: 'odile', title: 'Dedupe reminders across DST', links: [331] })
    .at('2026-09-17T18:00:00Z').completePr(9505, { approvedBy: ['bram'] })
    .at('2026-09-17T19:00:00Z').state(331, 'Resolved')
    .at('2026-09-17T20:00:00Z').bug(332, 'Saving preferences drops the time zone', { parent: 141, assignee: 'bram', by: 'odile' })
    .at('2026-09-17T21:00:00Z').state(332, 'Active')
    .at('2026-09-17T22:00:00Z').pr(9506, { repo: 'member-web', author: 'bram', title: 'Keep the time zone on save', links: [332] })
    .at('2026-09-18T15:00:00Z').completePr(9506, { approvedBy: ['odile'] })
    .at('2026-09-18T16:00:00Z').state(332, 'Resolved')
    .at('2026-09-18T17:00:00Z')
    .bug(333, 'Reminder email links to the wrong policy', { parent: 141, assignee: 'odile', by: 'bram' })
    .bug(334, 'Opt-out ignored for paperless members', { parent: 141, assignee: 'bram', by: 'odile' })
    .at('2026-09-18T18:00:00Z').state(333, 'Active').state(334, 'Active')
    .at('2026-09-18T19:00:00Z').pr(9507, { repo: 'reminder-svc', author: 'odile', title: 'Fix reminder links and honor opt-out', links: [333, 334] })
    // A third teammate (a guest here) helps review the last fix.
    .at('2026-09-18T20:30:00Z').completePr(9507, { approvedBy: ['bram', 'sana'] })
    .at('2026-09-18T21:30:00Z').state(333, 'Resolved').state(334, 'Resolved', { by: 'odile' })

    // --- Friday evening: the second Story lands, and the week settles ------------------------
    .at('2026-09-18T22:30:00Z').completePr(9504, { approvedBy: ['odile'] })
    .at('2026-09-18T23:30:00Z').state(504, 'Closed').state(506, 'Closed')
    .at('2026-09-19T00:30:00Z').state(282, 'Resolved')
    .expect('2026-09-20T00:00:00Z', (snap, k) => {
      for (const id of [331, 332, 333, 334]) if (snap.workItems.get(k.wi(id))?.rawState !== 'Resolved') throw new Error(`Bug ${id} should be resolved`);
      for (const pr of [9501, 9502, 9503, 9504, 9505, 9506, 9507]) if (snap.prs.get(k.pr(pr))?.status !== 'completed') throw new Error(`${pr} should be completed`);
      if (snap.workItems.get(k.wi(141))?.rawState !== 'Active') throw new Error('PRs and Bugs never close the Feature (INV-05)');
    }, { project: 'Nimbus Deck', area: 'Nimbus Deck\\Kestrel Team' });
}

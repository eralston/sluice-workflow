// Ember Desk (added at HG-3a, 2026-10-03): the simplest whole story. One person, alone, takes the
// smallest possible Feature from start to done with a single PR: two Tasks, the PR, a third Task
// joining it, everything closing, the merge, and the Feature becoming a white dwarf. One ship, no
// reviewers. Applied inside orbit-week (Nimbus Deck) so fixture mode can show it. Invented names only.
import type { scenario } from '../dsl';

type Builder = ReturnType<typeof scenario>;

export function soloDesk(b: Builder): void {
  b.area('Nimbus Deck\\Ember Desk', 13, { favorite: true })
    .repo('notes-svc')
    .person('tove', 'Tove Brandt')
    // Planned the Friday before; the whole life of the work plays in the week.
    .at('2026-09-11T22:00:00Z').feature(131, 'Notes on saved quotes', { area: 'Nimbus Deck\\Ember Desk', assignee: 'tove' })
    .at('2026-09-14T16:30:00Z').story(271, 'Add a note to a saved quote', { parent: 131, assignee: 'tove' })
    .at('2026-09-14T17:00:00Z').state(131, 'Active').state(271, 'Active')
    // Two Tasks, one at a time.
    .at('2026-09-14T18:00:00Z').task(491, 'Notes table migration', { parent: 271, assignee: 'tove' })
    .at('2026-09-14T18:30:00Z').state(491, 'Active')
    .at('2026-09-15T16:00:00Z').task(492, 'Notes API endpoint', { parent: 271, assignee: 'tove' })
    .at('2026-09-15T17:30:00Z').state(491, 'Closed').state(492, 'Active')
    // The one PR, opened for the first two Tasks.
    .at('2026-09-15T21:00:00Z').pr(9401, { repo: 'notes-svc', author: 'tove', title: 'Quote notes: storage and API', links: [491, 492] })
    // A third Task found along the way joins the same PR.
    .at('2026-09-16T17:00:00Z').task(493, 'Notes panel on the quote page', { parent: 271, assignee: 'tove' })
    .at('2026-09-16T17:30:00Z').state(493, 'Active').linkPr(9401, 493)
    .at('2026-09-17T16:00:00Z').state(492, 'Closed')
    .at('2026-09-17T20:00:00Z').state(493, 'Closed')
    // Merged alone (no approvals), then the Story and the Feature close.
    .at('2026-09-18T16:30:00Z').completePr(9401)
    .at('2026-09-18T18:00:00Z').state(271, 'Resolved')
    .at('2026-09-18T21:00:00Z').state(271, 'Closed')
    .at('2026-09-18T22:00:00Z').state(131, 'Closed')
    .expect('2026-09-20T00:00:00Z', (snap, k) => {
      if (snap.workItems.get(k.wi(131))?.rawState !== 'Closed') throw new Error('131 should be closed');
      if (snap.prs.get(k.pr(9401))?.status !== 'completed') throw new Error('9401 should be completed');
      for (const id of [491, 492, 493]) if (snap.workItems.get(k.wi(id))?.rawState !== 'Closed') throw new Error(`${id} should be closed`);
    }, { project: 'Nimbus Deck', area: 'Nimbus Deck\\Ember Desk' });
}

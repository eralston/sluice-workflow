// Achievement cases (17 W2-T7, 18 §4): test-only mini sprints, one earn and one near miss per v1
// achievement. Each is one pod's one-week sprint with three people; Vesna is the viewer. The near
// miss changes one fact from the earn, so the pair pins the rule's edge. Not served by the app and
// not in `v1Scenarios`. Work items are 23200–23499 and PRs 23500+. Invented names only (INV-18).
import { scenario, type Scenario } from '../../dsl';

const PROJECT = 'Quillmoor';
export const CASE_POD = 'Quillmoor\\Lark Pod';
export const CASE_SPRINT = 'Quillmoor\\Sprint 7';
/** The viewer's handle in every case. */
export const CASE_VIEWER = 'vesna';

/** In the pod and the sprint. */
const IN = { area: CASE_POD, iteration: CASE_SPRINT };

/** A Monday-to-Monday sprint, Pacific time, on its planning morning (Mon 09:00 PDT). */
function sprint(name: string) {
  return scenario(`achievement-${name}`, { project: PROJECT, tz: 'America/Los_Angeles', range: ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'] })
    .area(PROJECT, 23000)
    .area(CASE_POD, 23001, { favorite: true, defaultScope: true })
    .iteration(CASE_SPRINT, 23100, '2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z')
    .repo('quill-core')
    .person('vesna', 'Vesna Holloway')
    .person('teodor', 'Teodor Brask')
    .person('ilse', 'Ilse Marrow')
    .at('2026-10-05T16:00:00Z');
}

type Builder = ReturnType<typeof sprint>;

export interface AchievementCase {
  /** The rule's id (engine/achievements.ts). */
  id: string;
  /** What separates the earn from the near miss. */
  edge: string;
  earn: Scenario;
  near: Scenario;
}

/** One case: the same story told twice, `near` for the miss. */
function pair(id: string, edge: string, story: (b: Builder, near: boolean) => Builder): AchievementCase {
  return { id, edge, earn: story(sprint(`${id}-earn`), false).build(), near: story(sprint(`${id}-near`), true).build() };
}

export const achievementCases: AchievementCase[] = [
  pair('clear-skies', 'one Story only Resolved at the end', (b, near) => b
    .story(23201, 'Inkwell presets', { ...IN, assignee: 'vesna' })
    .story(23202, 'Margin notes', { ...IN, assignee: 'vesna' })
    .bug(23203, 'Nib skips on curves', { ...IN, assignee: 'vesna' })
    // A Removed Story is Off, so it never stands in the way.
    .story(23204, 'Parchment import', { ...IN, assignee: 'vesna' })
    .at('2026-10-06T16:00:00Z').state(23201, 'Active').state(23202, 'Active').state(23203, 'Active').state(23204, 'Removed')
    .at('2026-10-07T18:00:00Z').state(23201, 'Closed').state(23203, 'Closed')
    .at('2026-10-08T18:00:00Z').state(23202, near ? 'Resolved' : 'Closed')),

  pair('hat-trick-landings', 'the third Story only reaches Resolved', (b, near) => b
    .story(23211, 'Quill sharpening guide', { ...IN, assignee: 'vesna' })
    .story(23212, 'Ink drying timer', { ...IN, assignee: 'vesna' })
    .story(23213, 'Blotter widget', { ...IN, assignee: 'vesna' })
    .at('2026-10-06T16:00:00Z').state(23211, 'Active').state(23212, 'Active')
    .at('2026-10-07T16:00:00Z').state(23211, 'Closed').state(23213, 'Active')
    .at('2026-10-08T16:00:00Z').state(23212, 'Closed')
    .at('2026-10-09T16:00:00Z').state(23213, near ? 'Resolved' : 'Closed')),

  pair('hat-trick-defences', 'the third Bug is Rejected, not defeated', (b, near) => b
    .bug(23221, 'Smudge on save', { ...IN, assignee: 'vesna' })
    .bug(23222, 'Lost page breaks', { ...IN, assignee: 'vesna' })
    .bug(23223, 'Ruler drifts', { ...IN, assignee: 'vesna' })
    .at('2026-10-06T16:00:00Z').state(23221, 'Active').state(23222, 'Active').state(23223, 'Active')
    .at('2026-10-07T16:00:00Z').state(23221, 'Closed')
    .at('2026-10-08T16:00:00Z').state(23222, 'Closed')
    .at('2026-10-09T16:00:00Z').state(23223, near ? 'Rejected' : 'Closed')),

  pair('hat-trick-reviews', 'the third merge was approved by someone else', (b, near) => b
    .story(23231, 'Scroll archive', { ...IN, assignee: 'teodor' })
    .story(23232, 'Seal stamping', { ...IN, assignee: 'teodor' })
    .at('2026-10-06T16:00:00Z').state(23231, 'Active').state(23232, 'Active')
    .pr(23501, { repo: 'quill-core', author: 'teodor', title: 'Archive index', links: [23231] })
    .pr(23502, { repo: 'quill-core', author: 'teodor', title: 'Archive search', links: [23231] })
    .pr(23503, { repo: 'quill-core', author: 'teodor', title: 'Wax colours', links: [23232] })
    .at('2026-10-07T16:00:00Z').completePr(23501, { approvedBy: ['vesna'] })
    .at('2026-10-08T16:00:00Z').completePr(23502, { approvedBy: ['ilse', 'vesna'] })
    .at('2026-10-09T16:00:00Z').completePr(23503, { approvedBy: near ? ['ilse'] : ['vesna'] })),

  pair('swift-passage', 'Active Monday to Closed Friday: past 3 working days', (b, near) => b
    .story(23241, 'Copperplate font', { ...IN, assignee: 'vesna' })
    // Earn: Tue 09:00 → Thu 09:00 PDT (26.4 weighted hours). Near: Mon 09:00 → Fri 09:00 PDT (52.8).
    .at(near ? '2026-10-05T16:00:00Z' : '2026-10-06T16:00:00Z').state(23241, 'Active')
    .at(near ? '2026-10-09T16:00:00Z' : '2026-10-08T16:00:00Z').state(23241, 'Closed')),

  pair('steady-hands', 'three Stories Active at once', (b, near) => b
    .story(23251, 'Folio binding', { ...IN, assignee: 'vesna' })
    .story(23252, 'Gilt edges', { ...IN, assignee: 'vesna' })
    .story(23253, 'Spine labels', { ...IN, assignee: 'vesna' })
    .at('2026-10-06T16:00:00Z').state(23251, 'Active').state(23252, 'Active')
    .apply((x) => (near ? x.state(23253, 'Active') : x))
    .at('2026-10-07T16:00:00Z').state(23251, 'Closed')
    .apply((x) => (near ? x : x.state(23253, 'Active')))
    .at('2026-10-09T16:00:00Z').state(23252, 'Closed')),

  pair('clean-landing', 'one Task still Active when the Story closes', (b, near) => b
    .story(23261, 'Letterhead designer', { ...IN, assignee: 'vesna' })
    .task(23361, 'Crest picker', { parent: 23261, iteration: CASE_SPRINT, assignee: 'vesna' })
    .task(23362, 'Address block', { parent: 23261, iteration: CASE_SPRINT, assignee: 'ilse' })
    // A Removed Task is Off: it neither spoils the landing nor makes it.
    .task(23363, 'Watermark', { parent: 23261, iteration: CASE_SPRINT, assignee: 'ilse' })
    .at('2026-10-06T16:00:00Z').state(23261, 'Active').state(23361, 'Active').state(23362, 'Active').state(23363, 'Removed')
    .at('2026-10-07T16:00:00Z').state(23361, 'Closed')
    .apply((x) => (near ? x : x.state(23362, 'Closed')))
    .at('2026-10-08T16:00:00Z').state(23261, 'Closed')),

  pair('wingman', 'the helped Story is still Active at the end', (b, near) => b
    .story(23271, 'Calligraphy lessons', { ...IN, assignee: 'teodor' })
    .task(23371, 'Stroke drills', { parent: 23271, iteration: CASE_SPRINT, assignee: 'ilse' })
    .at('2026-10-06T16:00:00Z').state(23271, 'Active').state(23371, 'Active')
    // Vesna closes a Task on Teodor's Story (one Ilse holds).
    .at('2026-10-07T16:00:00Z').state(23371, 'Closed', { by: 'vesna' })
    .at('2026-10-08T16:00:00Z').state(23271, near ? 'Resolved' : 'Closed')),
];

// The CRM pack's words (12 §2–§4, the CRM column): what a sales pipeline calls each role, level and
// rung, for the source register. The chart register's words belong to the theme. Pure.
import type { SourceWords } from '../../engine/types';

export const CRM_WORDS: SourceWords = {
  role: {
    objective: { one: 'Deal', many: 'Deals' },
    threat: { one: 'Escalation', many: 'Escalations' },
    step: { one: 'Follow-up', many: 'Follow-ups' },
    facility: { one: 'Account', many: 'Accounts' },
    attachment: { one: 'Quote', many: 'Quotes' },
    guard: { one: 'Approval', many: 'Approvals' },
  },
  agent: { one: 'rep', many: 'reps' },
  level: {
    workspace: { one: 'Pipeline', many: 'Pipelines' },
    round: { one: 'Quarter', many: 'Quarters' },
    region: { one: 'Territory', many: 'Territories' },
    seat: { one: 'Sales rep', many: 'Sales reps' },
    frontier: { one: 'Unowned', many: 'Unowned' },
  },
  // The states each rung usually reads as (config/packs/crm.mapping.json has the full table).
  rung: { ready: 'Open', underway: 'In progress', nearing: 'Committed', accomplished: 'Closed', off: 'Lost' },
  source: 'the CRM',
};

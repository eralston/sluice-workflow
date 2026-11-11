// The Todo pack's words (12 §2–§4, the Todo column): what a household's todo list calls each role,
// level and rung, for the source register. The chart register's words belong to the theme. Pure.
import type { SourceWords } from '../../engine/types';

export const TODO_WORDS: SourceWords = {
  role: {
    objective: { one: 'Todo', many: 'Todos' },
    threat: { one: 'Problem', many: 'Problems' },
    step: { one: 'Checklist Item', many: 'Checklist Items' },
    facility: { one: 'Context', many: 'Contexts' },
    attachment: { one: 'Note', many: 'Notes' },
    guard: { one: 'Reminder', many: 'Reminders' },
  },
  agent: { one: 'member', many: 'members' },
  level: {
    workspace: { one: 'Workspace', many: 'Workspaces' },
    round: { one: 'Week', many: 'Weeks' },
    region: { one: 'List', many: 'Lists' },
    seat: { one: 'Member', many: 'Members' },
    frontier: { one: 'Unassigned', many: 'Unassigned' },
  },
  // The states each rung usually reads as (config/packs/todo.mapping.json has the full table).
  rung: { ready: 'To do', underway: 'Doing', nearing: 'Almost done', accomplished: 'Done', off: 'Dropped' },
  source: 'the todo list',
};

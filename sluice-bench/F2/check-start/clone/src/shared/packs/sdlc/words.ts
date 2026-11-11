// The SDLC pack's words (12 §2–§4, the SDLC column): what Azure DevOps calls each role, level and
// rung, for the source register. The chart register's words belong to the theme. Pure.
import type { SourceWords } from '../../engine/types';

export const SDLC_WORDS: SourceWords = {
  role: {
    objective: { one: 'User Story', many: 'User Stories' },
    threat: { one: 'Bug', many: 'Bugs' },
    step: { one: 'Task', many: 'Tasks' },
    container: { one: 'Feature', many: 'Features' },
    facility: { one: 'Repository', many: 'Repositories' },
    attachment: { one: 'Pull Request', many: 'Pull Requests', short: 'PR' },
    guard: { one: 'Pipeline run', many: 'Pipeline runs' },
  },
  agent: { one: 'person', many: 'people' },
  level: {
    workspace: { one: 'Project', many: 'Projects' },
    round: { one: 'Sprint', many: 'Sprints' },
    region: { one: 'Area Path', many: 'Area Paths' },
    seat: { one: 'Assignee', many: 'Assignees' },
    frontier: { one: 'Unassigned', many: 'Unassigned' },
  },
  // The states each rung usually reads as (config/state-mapping.json has the full table).
  rung: { ready: 'New', underway: 'Active', nearing: 'Resolved', accomplished: 'Closed', off: 'Removed' },
  source: 'Azure DevOps',
};

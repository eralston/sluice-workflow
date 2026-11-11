#!/usr/bin/env node
// The tree guard (roadmap D12): a PreToolUse hook on Bash (in settings.json) that refuses, for sluice agents
// only, the git commands that rewrite the shared working tree, the index or history: checkout, switch,
// restore, stash, reset, clean, commit, push, rebase, merge, cherry-pick, revert. Agents share one tree, so
// `git checkout <file>` throws away another agent's (or the human's) uncommitted work. In v1.4 F5 a fixer did
// exactly that to the builder's spec. The item contract already says agents never commit or change branches;
// this makes it code (P11). The main session and other sessions are never blocked.
//   node .claude/sluice/guard.mjs --check "<command>"   prints the refused git verb, or nothing; exit 1 if refused
import { readStdinJson, readJsonl, subagentTranscript, sluiceHeader, logError } from './lib.mjs'

const REFUSED = ['checkout', 'switch', 'restore', 'stash', 'reset', 'clean', 'commit', 'push', 'rebase', 'merge', 'cherry-pick', 'revert']

// The first refused git verb in a shell command, or null. Global options before the verb (-C <dir>,
// -c <k=v>, --no-pager, --git-dir=…) are skipped, so `git -C x checkout y` is caught too.
export function refusedVerb(command = '') {
  const re = /(?:^|[\s;&|()`$])git((?:\s+(?:-C|-c)\s+\S+|\s+--?[\w-]+(?:=\S+)?)*)\s+([a-z][a-z-]*)/g
  for (const m of command.matchAll(re)) if (REFUSED.includes(m[2])) return m[2]
  return null
}

if (process.argv.includes('--check')) {
  const verb = refusedVerb(process.argv[process.argv.indexOf('--check') + 1] || '')
  if (verb) console.log(verb)
  process.exit(verb ? 1 : 0)
}

const input = await readStdinJson()
try {
  const command = input.tool_input?.command
  const verb = input.tool_name === 'Bash' && typeof command === 'string' ? refusedVerb(command) : null
  if (!verb || !input.agent_id) process.exit(0) // only subagents' calls carry agent_id
  const transcript = subagentTranscript(input)
  if (!transcript || !sluiceHeader(readJsonl(transcript))) process.exit(0) // not a sluice agent
  process.stderr.write(`Refused: \`git ${verb}\` rewrites the shared tree, index or history, and sluice agents share one tree ` +
    `with other agents and the human. To see a file as it was, use \`git show <commit>:<path>\` or \`git diff\`; to undo ` +
    `your own edit, edit the file back. Never commit or change branches: the orchestrator does.\n`)
  process.exit(2)
} catch (err) {
  logError('guard', err)
  process.exit(0) // a broken guard must not trap an agent
}

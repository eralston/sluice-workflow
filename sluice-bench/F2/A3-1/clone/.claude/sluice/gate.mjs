#!/usr/bin/env node
// The gate (design doc §4, §12): a SubagentStop hook (in settings.json) that acts only on sluice agents in
// the writer roles (gateRoles in config.json: builder, clerk, fixer). It runs the fast checks in
// config.json. Exit 2 blocks the agent's finish and hands it the failure; after gateMaxBlocks blocks
// in a row it lets the agent stop and records the gate as red, so a gate can never loop forever.
// A launch header with gate=off (read-only clerk work) skips it.
//   node .claude/sluice/gate.mjs --run    runs the checks once, by hand: exit 0 if green, 1 if not.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadConfig, readStdinJson, readJsonl, subagentTranscript, sluiceHeader, stateDir, ensureDir, projectDir, logError, patchLedgerGate } from './lib.mjs'

function runChecks(config) {
  for (const check of config.gate) {
    const r = spawnSync('sh', ['-c', check.cmd], { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (r.status !== 0) return { name: check.name, out: `${r.stdout || ''}${r.stderr || ''}` }
  }
  return null
}

if (process.argv.includes('--run')) {
  const config = loadConfig()
  const failure = runChecks(config)
  if (failure) console.error(`Gate failed on "${failure.name}":\n${failure.out.trim().split('\n').slice(-40).join('\n')}`)
  else console.log(`Gate passed: ${config.gate.map((c) => c.name).join(', ') || 'no checks configured'}`)
  process.exit(failure ? 1 : 0)
}

const input = await readStdinJson()
try {
  const config = loadConfig()
  const transcript = subagentTranscript(input)
  const header = transcript ? sluiceHeader(readJsonl(transcript)) : null
  const role = header?.role || input.agent_type
  const roles = config.gateRoles || ['builder', 'clerk', 'fixer']
  if (!header || !roles.includes(role) || header.gate === 'off') process.exit(0)

  ensureDir(stateDir)
  const stateFile = path.join(stateDir, `gate-${input.agent_id || input.session_id || 'main'}.json`)
  // blocks: every block in this agent's life (for the ledger); streak: blocks since the last pass.
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { blocks: 0, streak: 0, red: false }
  const save = (s) => {
    fs.writeFileSync(stateFile, JSON.stringify(s))
    patchLedgerGate(config, header.tranche, input.agent_id, { blocks: s.blocks, red: s.red })
  }

  const failure = runChecks(config)

  if (!failure) {
    save({ blocks: state.blocks, streak: 0, red: false, last: 'pass' })
    process.exit(0)
  }
  const tail = failure.out.trim().split('\n').slice(-40).join('\n')
  if (state.streak >= config.gateMaxBlocks) {
    save({ blocks: state.blocks, streak: state.streak, red: true, last: failure.name })
    process.stderr.write(`Gate still red on "${failure.name}" after ${state.streak} blocks. Stopping anyway; ` +
      `say so plainly in your run record (verdict "gate-red").\n${tail}\n`)
    process.exit(0)
  }
  save({ blocks: state.blocks + 1, streak: state.streak + 1, red: false, last: failure.name })
  process.stderr.write(`Gate failed on "${failure.name}" (block ${state.streak + 1} of ${config.gateMaxBlocks}). ` +
    `Fix this before finishing; if the failure is outside your item, say so in your run record and stop.\n${tail}\n`)
  process.exit(2)
} catch (err) {
  logError('gate', err)
  process.exit(0) // a broken gate must not trap an agent
}

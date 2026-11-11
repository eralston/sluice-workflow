#!/usr/bin/env node
// The ledger (design doc §6, §10): a SubagentStop hook. For an agent launched with a sluice header, it
// writes one line to <progressDir>/<tranche>/ledger.jsonl: role, item, tier, time and tokens. A later
// stop of the same agent (after a gate block, or a resume) replaces its earlier line. Never fails.
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, progressDir, readStdinJson, readJsonl, subagentTranscript, sluiceHeader, sumUsage, priceOf, stateDir, ensureDir, logError } from './lib.mjs'

const input = await readStdinJson()
try {
  const transcript = subagentTranscript(input)
  if (!transcript) process.exit(0)
  const entries = readJsonl(transcript)
  const header = sluiceHeader(entries)
  if (!header?.tranche) process.exit(0)

  const config = loadConfig()
  const usage = sumUsage(entries)
  const gateFile = path.join(stateDir, `gate-${input.agent_id}.json`)
  const gate = fs.existsSync(gateFile) ? JSON.parse(fs.readFileSync(gateFile, 'utf8')) : null

  const line = {
    t: new Date().toISOString(),
    tranche: header.tranche, item: header.item ?? null, role: header.role ?? input.agent_type ?? null,
    tier: header.tier ?? null, round: header.round ? Number(header.round) : null,
    agent_id: input.agent_id, agent_type: input.agent_type ?? null,
    model: [...usage.models].join(','), calls: usage.calls, secs: usage.secs,
    in: usage.in, cache_read: usage.cacheRead, cache_write_5m: usage.cacheWrite5m,
    cache_write_1h: usage.cacheWrite1h, out: usage.out,
    usd_equiv: Number(priceOf(usage.records, config.prices).toFixed(4)),
    gate: gate ? { blocks: gate.blocks, red: gate.red } : null,
  }

  const dir = path.join(progressDir(config), header.tranche)
  ensureDir(dir)
  const file = path.join(dir, 'ledger.jsonl')
  const kept = readJsonl(file).filter((l) => l.agent_id !== input.agent_id)
  fs.writeFileSync(file, [...kept, line].map((l) => JSON.stringify(l)).join('\n') + '\n')

  // Redraw the views (visualize.mjs), loaded late so a fault there can't cost a ledger line.
  try { (await import('./visualize.mjs')).renderTranche(header.tranche, config) } catch (err) { logError('visualize', err) }
} catch (err) {
  logError('ledger', err)
}
process.exit(0)

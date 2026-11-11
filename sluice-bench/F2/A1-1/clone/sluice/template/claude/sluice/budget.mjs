#!/usr/bin/env node
// The budget check (design doc §9). The orchestrator runs it before each launch. It prints one line:
//   GO     room left
//   HOLD   the window is past windowHoldPct: start nothing expensive; finish what's running
//   STOP   the week is past weekStopPct: finish the block, then stop for the human
//   UNKNOWN no fresh usage data (the statusline hasn't run, or isn't on a plan that reports it)
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, stateDir } from './lib.mjs'

const { budget } = loadConfig()
const file = path.join(stateDir, 'usage.json')
if (!fs.existsSync(file)) { console.log('UNKNOWN no usage data yet (.claude/state/usage.json)'); process.exit(0) }
const u = JSON.parse(fs.readFileSync(file, 'utf8'))
const ageMin = (Date.now() - Date.parse(u.updated_at)) / 60000
const five = u.five_hour?.used_percentage, week = u.seven_day?.used_percentage
const resets = (r) => (r?.resets_at ? new Date(r.resets_at * 1000).toLocaleTimeString() : '?')
const facts = `window ${five ?? '?'}% (resets ${resets(u.five_hour)}), week ${week ?? '?'}%, data ${Math.round(ageMin)} min old`

if (ageMin > budget.staleMinutes) console.log(`UNKNOWN stale usage data: ${facts}`)
else if (week !== undefined && week >= budget.weekStopPct) console.log(`STOP ${facts}`)
else if (five !== undefined && five >= budget.windowHoldPct) console.log(`HOLD ${facts}`)
else console.log(`GO ${facts}`)

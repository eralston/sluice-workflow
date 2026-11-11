#!/usr/bin/env node
// The statusline (design doc §9): shows the model and the usage window, and records the window's and
// week's used percentages in .claude/state/usage.json, where budget.mjs reads them.
import fs from 'node:fs'
import path from 'node:path'
import { readStdinJson, stateDir, ensureDir } from './lib.mjs'

const input = await readStdinJson()
const rl = input.rate_limits || {}
const five = rl.five_hour?.used_percentage
const week = rl.seven_day?.used_percentage
try {
  if (five !== undefined || week !== undefined) {
    ensureDir(stateDir)
    fs.writeFileSync(path.join(stateDir, 'usage.json'), JSON.stringify({
      updated_at: new Date().toISOString(),
      five_hour: rl.five_hour ?? null,
      seven_day: rl.seven_day ?? null,
    }))
  }
} catch { /* the status line must always print */ }

const parts = [input.model?.display_name || input.model?.id || 'Claude']
if (five !== undefined) parts.push(`5h ${Math.round(five)}%`)
if (week !== undefined) parts.push(`wk ${Math.round(week)}%`)
process.stdout.write(parts.join(' · '))

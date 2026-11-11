#!/usr/bin/env node
// The scoreboard (design doc §10): every block of every tranche, one row each, read from
// <progressDir>/scoreboard.jsonl (written by summary.mjs --write), then totals per tranche. Escapes are
// counted live from each block note's "## Escapes" list, since they're found at the human gate later.
// It answers "is the sluice getting cheaper and better?" without reading a single transcript.
//   node .claude/sluice/scoreboard.mjs [--md]
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, progressDir, readJsonl } from './lib.mjs'

const config = loadConfig()
const root = progressDir(config)
const rows = readJsonl(path.join(root, 'scoreboard.jsonl'))
if (!rows.length) { console.log('No blocks recorded yet: summary.mjs <tranche> --block <B> --write records one.'); process.exit(0) }

function escapes(tranche, block) {
  const note = path.join(root, tranche, `block-${block}.md`)
  if (!fs.existsSync(note)) return null
  const m = fs.readFileSync(note, 'utf8').match(/## Escapes[^\n]*\n([\s\S]*?)(?=\n## |$)/)
  if (!m) return null
  return m[1].split('\n').filter((l) => /^\s*[-*] /.test(l) && !/^\s*[-*]\s*(none\b|—\s*$|-\s*$)/i.test(l)).length
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—')
const firstOf = (h) => {
  const v = h && !h.error ? Object.values(h.extra || {})[0] : null
  return v ? v.split(' · ')[0] : ''
}
for (const r of rows) r.escapes = escapes(r.tranche, r.block)

const blockHead = ['Block', 'Date', 'Items', 'Win/item', 'First pass', 'Fix rounds', 'Re-plans', 'Blocker+major', 'Escapes', 'Gate blocks', 'Large files', 'Health']
const blockRows = rows.map((r) => [
  `${r.tranche} ${r.block}`, r.t.slice(0, 10), r.items, r.windows_per_item.toFixed(2), pct(r.first_pass, r.reviewed),
  r.fix_rounds_mean.toFixed(1), r.replans, (r.findings?.blocker || 0) + (r.findings?.major || 0),
  r.escapes ?? '—', r.gate_blocks, r.health && !r.health.error ? r.health.large.count : '—', firstOf(r.health),
])

const tranches = [...new Set(rows.map((r) => r.tranche))]
const trancheHead = ['Tranche', 'Blocks', 'Items', 'Windows', 'Win/item', 'First pass', 'Fix rounds', 'Escapes/item']
const trancheRows = tranches.map((t) => {
  const rs = rows.filter((r) => r.tranche === t)
  const sum = (k) => rs.reduce((s, r) => s + (r[k] || 0), 0)
  const items = sum('items'), esc = rs.filter((r) => r.escapes !== null)
  return [t, rs.length, items, sum('windows').toFixed(2), items ? (sum('windows') / items).toFixed(2) : '—',
    pct(sum('first_pass'), sum('reviewed')),
    items ? (rs.reduce((s, r) => s + r.fix_rounds_mean * r.items, 0) / items).toFixed(1) : '—',
    esc.length ? (esc.reduce((s, r) => s + r.escapes, 0) / esc.reduce((s, r) => s + r.items, 0)).toFixed(2) : '—']
})

function table(head, body) {
  if (process.argv.includes('--md')) {
    return [head, head.map(() => '---'), ...body].map((r) => `| ${r.join(' | ')} |`).join('\n')
  }
  const w = head.map((h, i) => Math.max(String(h).length, ...body.map((r) => String(r[i]).length)))
  return [head, ...body].map((r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd()).join('\n')
}
console.log(`${table(blockHead, blockRows)}\n\n${table(trancheHead, trancheRows)}`)

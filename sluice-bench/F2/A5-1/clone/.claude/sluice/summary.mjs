#!/usr/bin/env node
// The block summary (design doc §10). Reads <progressDir>/<tranche>/ledger.jsonl and the run records in
// work/<ID>/, and prints the one-screen summary. With --write it also puts it under "## Summary" in
// <progressDir>/<tranche>/block-<B>.md, adds the code-health snapshot under "## Health", and records the
// block as one line of <progressDir>/scoreboard.jsonl (replacing its earlier line), for scoreboard.mjs.
//   node .claude/sluice/summary.mjs <tranche> [--block B | --items B1,B2] [--write] [--no-main]
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, progressDir, readJsonl, sumUsage, priceOf, sessionsDir, projectDir, sluiceHeader, findingCounts } from './lib.mjs'
import { healthSnapshot, healthText } from './health.mjs'

const args = process.argv.slice(2)
const tranche = args.find((a) => !a.startsWith('--') && !isFlagValue(a))
function isFlagValue(a) { const i = args.indexOf(a); return i > 0 && ['--block', '--items'].includes(args[i - 1]) }
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
if (!tranche) { console.error('usage: summary.mjs <tranche> [--block B | --items B1,B2] [--write] [--no-main]'); process.exit(1) }

const config = loadConfig()
const root = path.join(progressDir(config), tranche)
const block = opt('--block')
const itemList = opt('--items')?.split(',')
const inScope = (id) => {
  if (!id) return false
  if (itemList) return itemList.includes(id)
  if (block) return id === `block-${block}` || new RegExp(`^${block}\\d`).test(id)
  return true
}

const fullLedger = readJsonl(path.join(root, 'ledger.jsonl'))
const sessions = sessionsDir()
// Sessions that launched this scope's agents, by the agent IDs in their subagents/ folders.
const ownerOf = {}
if (fs.existsSync(sessions)) for (const s of fs.readdirSync(sessions)) {
  const sub = path.join(sessions, s, 'subagents')
  if (fs.existsSync(sub)) for (const f of fs.readdirSync(sub)) {
    const m = f.match(/^agent-(.+)\.jsonl$/)
    if (m) ownerOf[m[1]] = s
  }
}
// Agents stopped before the ledger hook ran (a usage cap kills them mid-call) are recovered from their
// transcripts' sluice headers.
const recovered = []
const ledgered = new Set(fullLedger.map((l) => l.agent_id))
for (const [id, s] of Object.entries(ownerOf)) {
  if (ledgered.has(id)) continue
  const entries = readJsonl(path.join(sessions, s, 'subagents', `agent-${id}.jsonl`))
  const header = sluiceHeader(entries)
  if (header?.tranche !== tranche || !header.item) continue
  const usage = sumUsage(entries)
  const last = [...entries].reverse().find((e) => e.timestamp)?.timestamp
  recovered.push({
    t: last, tranche, item: header.item, role: header.role ?? null, tier: header.tier ?? null,
    round: header.round ? Number(header.round) : null, agent_id: id, model: [...usage.models].join(','),
    calls: usage.calls, secs: usage.secs, usd_equiv: Number(priceOf(usage.records, config.prices).toFixed(4)),
    gate: null, recovered: true,
  })
}
fullLedger.push(...recovered)
const ledger = fullLedger.filter((l) => inScope(l.item))
const items = [...new Set(ledger.map((l) => l.item).filter((id) => !id.startsWith('block-')))]
const workDir = path.join(root, 'work')
if (fs.existsSync(workDir)) for (const id of fs.readdirSync(workDir)) if (inScope(id) && !items.includes(id)) items.push(id)
items.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

// Run records per item: plan-1.json, build-1.json, review-1.json, fix-1.json, review-2.json, …
const records = {}
for (const id of items) {
  const dir = path.join(workDir, id)
  records[id] = {}
  if (!fs.existsSync(dir)) continue
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^([a-z]+)-(\d+)\.json$/)
    if (!m) continue
    try { (records[id][m[1]] ??= [])[Number(m[2]) - 1] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { /* skip */ }
  }
}

// Spend
const byRole = {}
let subUsd = 0
for (const l of ledger) { byRole[l.role] = (byRole[l.role] || 0) + (l.usd_equiv || 0); subUsd += l.usd_equiv || 0 }
const spans = ledger.map((l) => [Date.parse(l.t) - l.secs * 1000, Date.parse(l.t)]).sort((a, b) => a[0] - b[0])
let agentMs = 0, cur = null
for (const s of spans) { if (!cur || s[0] > cur[1]) { if (cur) agentMs += cur[1] - cur[0]; cur = [...s] } else cur[1] = Math.max(cur[1], s[1]) }
if (cur) agentMs += cur[1] - cur[0]

// The orchestrator (approximate): main-session calls of the sessions that launched this scope's agents,
// within its time span ±10 minutes. A call that also falls in another block's span in the same session
// is split evenly between them, so blocks that ran side by side aren't counted twice.
let mainUsd = 0
if (!args.includes('--no-main') && spans.length) {
  const pad = 10 * 60000
  const spanOf = (lines) => [Math.min(...lines.map((l) => Date.parse(l.t) - l.secs * 1000)) - pad,
    Math.max(...lines.map((l) => Date.parse(l.t))) + pad]
  const groupOf = (id) => id.startsWith('block-') ? id : id.match(/^[A-Za-z]+/)?.[0] ?? id
  const others = {}
  for (const l of fullLedger) if (!inScope(l.item)) (others[groupOf(l.item)] ??= []).push(l)
  for (const s of new Set(ledger.map((l) => ownerOf[l.agent_id]).filter(Boolean))) {
    const own = spanOf(ledger.filter((l) => ownerOf[l.agent_id] === s))
    const rivals = Object.values(others).map((ls) => ls.filter((l) => ownerOf[l.agent_id] === s))
      .filter((ls) => ls.length).map(spanOf)
    const shares = new Map()
    for (const e of readJsonl(path.join(sessions, `${s}.jsonl`))) {
      const t = e.timestamp && Date.parse(e.timestamp)
      if (e.isSidechain || !t || t < own[0] || t > own[1]) continue
      const n = 1 + rivals.filter(([a, b]) => t >= a && t <= b).length
      if (!shares.has(n)) shares.set(n, [])
      shares.get(n).push(e)
    }
    for (const [n, entries] of shares) mainUsd += priceOf(sumUsage(entries).records, config.prices) / n
  }
}
if (mainUsd) byRole.orchestrator = mainUsd
const totalUsd = subUsd + mainUsd
const win = (usd) => (usd / config.windowCapacityUsd).toFixed(2)
const pct = (usd) => `${Math.round((100 * usd) / (totalUsd || 1))}%`

// Quality
const reviewed = items.filter((id) => records[id].review?.[0])
const firstPass = reviewed.filter((id) => records[id].review[0].verdict === 'pass').length
const fixRounds = items.map((id) => (records[id].fix || []).filter(Boolean).length)
// A re-plan is any plan after the first. A split part re-planned on its own has only plan-2.json in its
// folder (plan-1 is its parent's), so count by the file's round, not by how many plans the folder holds.
const replans = items.filter((id) => (records[id].plan || []).some((p, i) => p && (i > 0 || p.round > 1)))
const findings = findingCounts(null)
for (const id of items) for (const r of records[id].review || []) {
  const n = findingCounts(r?.findings)
  for (const k in findings) findings[k] += n[k]
}
const gateBlocks = ledger.reduce((n, l) => n + (l.gate?.blocks || 0), 0)
const gateRed = ledger.filter((l) => l.gate?.red).map((l) => `${l.item} ${l.role}`)
const recoveredHere = ledger.filter((l) => l.recovered)

// Spend per item, by the tier its builder ran at
const itemUsd = {}, itemTier = {}
for (const l of ledger) {
  if (!items.includes(l.item)) continue
  itemUsd[l.item] = (itemUsd[l.item] || 0) + (l.usd_equiv || 0)
  if (['builder', 'clerk'].includes(l.role)) itemTier[l.item] = l.tier
}
const tiers = {}
for (const id of items) { const t = itemTier[id] || 'unknown'; (tiers[t] ??= []).push(itemUsd[id] || 0) }
const largest = items.slice().sort((a, b) => (itemUsd[b] || 0) - (itemUsd[a] || 0))[0]

const label = block ? `Block ${block}` : itemList ? `Items ${itemList.join(', ')}` : `Tranche ${tranche}`
const lines = [
  `${label} · ${items.length} items · ${win(totalUsd)} windows · ${(agentMs / 3.6e6).toFixed(1)} h with agents`,
  `First-pass acceptance   ${firstPass}/${reviewed.length}    Fix rounds   ${fixRounds.length ? (fixRounds.reduce((a, b) => a + b, 0) / fixRounds.length).toFixed(1) : '0'} mean, max ${Math.max(0, ...fixRounds)}    Re-plans   ${replans.length}${replans.length ? ` (${replans.join(', ')})` : ''}`,
  `Findings               blocker ${findings.blocker} · major ${findings.major} · minor ${findings.minor} · nit ${findings.nit}`,
  `Spend by role          ${Object.entries(byRole).sort((a, b) => b[1] - a[1]).map(([r, u]) => `${r} ${pct(u)}`).join(' · ') || '—'}${mainUsd ? '   (orchestrator approximate)' : ''}`,
  `Spend per item         ${Object.entries(tiers).map(([t, v]) => `${t} ${win(v.reduce((a, b) => a + b, 0) / v.length)} win (${v.length})`).join(' · ') || '—'}`,
  `Gate blocks            ${gateBlocks}${gateRed.length ? `    Gate red: ${gateRed.join(', ')}` : ''}${recoveredHere.length ? `    Recovered from transcripts: ${recoveredHere.map((l) => `${l.item} ${l.role}`).join(', ')}` : ''}`,
  `Largest item           ${largest ? `${largest}: ${win(itemUsd[largest] || 0)} win, ${(records[largest].review || []).filter(Boolean).length} reviews` : '—'}`,
  `Escapes                record at the human gate`,
]
const text = lines.join('\n')
console.log(text)

if (args.includes('--write') && block) {
  const health = healthSnapshot(config)
  const note = path.join(root, `block-${block}.md`)
  let body = fs.existsSync(note) ? fs.readFileSync(note, 'utf8') : `# ${tranche} · Block ${block}\n`
  body = setSection(body, 'Summary', text)
  body = setSection(body, 'Health', healthText(health), 'Summary')
  fs.writeFileSync(note, body)

  const board = path.join(progressDir(config), 'scoreboard.jsonl')
  const row = {
    t: new Date().toISOString(), tranche, block, items: items.length,
    windows: +win(totalUsd), windows_per_item: items.length ? +(totalUsd / config.windowCapacityUsd / items.length).toFixed(3) : 0,
    usd_equiv: +totalUsd.toFixed(2), agent_hours: +(agentMs / 3.6e6).toFixed(1),
    first_pass: firstPass, reviewed: reviewed.length,
    fix_rounds_mean: fixRounds.length ? +(fixRounds.reduce((a, b) => a + b, 0) / fixRounds.length).toFixed(2) : 0,
    replans: replans.length, findings, gate_blocks: gateBlocks,
    by_role: Object.fromEntries(Object.entries(byRole).map(([r, u]) => [r, +u.toFixed(2)])),
    health,
  }
  const rows = readJsonl(board).filter((r) => !(r.tranche === tranche && r.block === block))
  fs.writeFileSync(board, [...rows, row].map((r) => JSON.stringify(r)).join('\n') + '\n')
  console.log(`\nWritten to ${path.relative(projectDir, note)} and ${path.relative(projectDir, board)}`)
}

// Replaces a "## <name>" section's body with a text block. A new section goes after the section named
// by `after`, or at the end.
function setSection(body, name, content, after) {
  const section = `## ${name}\n\n\`\`\`text\n${content}\n\`\`\`\n`
  const find = (n) => new RegExp(`## ${n}\\n[\\s\\S]*?(?=\\n## |$)`)
  if (find(name).test(body)) return body.replace(find(name), section)
  if (after && find(after).test(body)) return body.replace(find(after), (m) => `${m.trimEnd()}\n\n${section}`)
  return `${body.trimEnd()}\n\n${section}`
}

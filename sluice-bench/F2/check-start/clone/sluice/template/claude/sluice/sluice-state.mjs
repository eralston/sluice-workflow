#!/usr/bin/env node
// The sluice's state as one snapshot (design doc §6): the scope doc's items and State lines, the work
// folders' run records, the ledger, and the launches the start hook saw (live.jsonl). The views
// (visualize.mjs) read only this snapshot, so a change to the sluice's file formats changes only this file.
//   node .claude/sluice/sluice-state.mjs [<tranche>]     prints the snapshot as JSON
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, progressDir, projectDir, stateDir, readJsonl, modelFamily } from './lib.mjs'

export const liveFile = () => path.join(stateDir, 'live.jsonl')
const STALE_SECS = 4 * 3600 // a launch with no ledger line after this long is not shown as running
const ROLE_OF = { plan: 'planner', build: 'builder', clerk: 'clerk', review: 'reviewer', fix: 'fixer', audit: 'auditor' }
export const COLUMNS = ['open', 'planned', 'building', 'review', 'fixing', 'accepted', 'blocked']
// Where an item sits while an agent of each role works on it, and once that role's record is written.
const RUNNING_IN = { planner: 'planned', builder: 'building', clerk: 'building', reviewer: 'review', fixer: 'fixing', auditor: 'review' }

export function tranches(config = loadConfig()) {
  const dir = progressDir(config)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && ['ledger.jsonl', 'work'].some((f) => fs.existsSync(path.join(dir, e.name, f))))
    .map((e) => e.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

// The tranche with the newest ledger line or launch.
export function activeTranche(config = loadConfig()) {
  const names = tranches(config)
  const latest = (t) => {
    const runs = readJsonl(path.join(progressDir(config), t, 'ledger.jsonl')).map((l) => Date.parse(l.t) || 0)
    const live = readJsonl(liveFile()).filter((l) => l.tranche === t).map((l) => Date.parse(l.t) || 0)
    return Math.max(0, ...runs, ...live)
  }
  return names.sort((a, b) => latest(b) - latest(a))[0] ?? null
}

export function findScopeDoc(config, tranche) {
  const dir = path.join(projectDir, config.scopeDir || 'docs')
  if (!fs.existsSync(dir)) return null
  const mds = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
  const named = mds.find((f) => f === `${tranche}.md` || f.endsWith(`-${tranche}.md`))
  if (named) return path.join(dir, named)
  const mention = mds.find((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes(`/${tranche}/work/`))
  return mention ? path.join(dir, mention) : null
}

// Items under "## Items": "### <ID> <title>", then "- State: <text>".
export function parseScope(text) {
  const items = []
  let inItems = false, cur = null
  for (const line of text.split('\n')) {
    if (/^## /.test(line)) { inItems = /^## Items\b/.test(line); cur = null; continue }
    if (!inItems) continue
    const h = line.match(/^### (\S+)\s+(.*)$/)
    if (h) { cur = { id: h[1], title: h[2].replace(/`/g, '').trim(), state: 'open' }; items.push(cur); continue }
    const s = line.match(/^- State:\s*(.*)$/)
    if (s && cur) cur.state = s[1].trim()
  }
  return items
}

// A work folder or ledger item serves an item when it is the item, a split of it (C4a, E4bc), or a
// bundle naming it (A1-A3).
export function serves(name, id) {
  if (name === id || new RegExp(`^${id}[a-z]+$`).test(name)) return true
  return !name.startsWith('block-') && name.includes('-') && name.split('-').includes(id)
}

export const blockOf = (id) => (id.match(/^block-([A-Za-z]+)/)?.[1] ?? id.match(/^[A-Za-z]+/)?.[0] ?? '?').toUpperCase()

function readRecords(workDir, name) {
  const dir = path.join(workDir, name)
  const out = []
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(plan|build|clerk|review|fix|audit)-(\d+)\.json$/)
    if (!m) continue
    const file = path.join(dir, f)
    let rec = {}
    try { rec = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* a record being written */ }
    out.push({
      dir: name, file: path.relative(projectDir, file), role: ROLE_OF[m[1]], round: Number(m[2]),
      verdict: rec.verdict ?? null, findings: rec.findings ?? null, summary: rec.summary ?? null, tier: rec.tier ?? null,
      split: Array.isArray(rec.split) ? rec.split : null,
      mtime: fs.statSync(file).mtimeMs,
    })
  }
  return out
}

export function loadState(tranche, config = loadConfig(), now = Date.now()) {
  const tdir = path.join(progressDir(config), tranche)
  const workDir = path.join(tdir, 'work')
  const scopeFile = findScopeDoc(config, tranche)
  const scope = scopeFile ? parseScope(fs.readFileSync(scopeFile, 'utf8')) : []
  const dirs = fs.existsSync(workDir) ? fs.readdirSync(workDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []
  const records = dirs.flatMap((d) => readRecords(workDir, d))

  const runs = readJsonl(path.join(tdir, 'ledger.jsonl')).map((l) => {
    const end = Date.parse(l.t)
    const rec = records.find((r) => r.dir === l.item && r.role === l.role && r.round === l.round)
    return { ...l, end, start: end - (l.secs || 0) * 1000, family: modelFamily(l.model), verdict: rec?.verdict ?? null, findings: rec?.findings ?? null, record: rec?.file ?? null }
  }).sort((a, b) => a.end - b.end)

  // A launch is running until a ledger line for the same item, role and round lands after it.
  const running = readJsonl(liveFile()).filter((l) => l.tranche === tranche).map((l) => ({ ...l, start: Date.parse(l.t) }))
    .filter((l) => now - l.start < STALE_SECS * 1000)
    .filter((l) => !runs.some((r) => r.item === l.item && r.role === l.role && Number(r.round) === Number(l.round) && r.end >= l.start - 5000))

  // Work folders and ledger items the scope doc doesn't name (block audits, renamed items) get their own card.
  const named = new Set(scope.map((i) => i.id))
  const orphans = [...new Set([...dirs, ...runs.map((r) => r.item), ...running.map((r) => r.item)])]
    .filter((n) => n && !scope.some((i) => serves(n, i.id)) && !named.has(n))
    .map((n) => ({ id: n, title: n.startsWith('block-') ? `Block ${blockOf(n)} audit` : n, state: 'open', extra: true }))

  // An item the planner split (plan's `split`) shows one card per part until its State says accepted or
  // blocked, so one part's pass doesn't accept the whole item. The shared plan's runs go to the first part.
  const cards = [...scope, ...orphans].flatMap((it) => {
    if (it.extra || /^(accepted|blocked|rescope)/i.test(it.state)) return [it]
    const plan = records.filter((r) => r.dir === it.id && r.role === 'planner').sort((a, b) => a.mtime - b.mtime).at(-1)
    const parts = (plan?.split ?? []).filter((p) => p && typeof p.id === 'string' && p.id !== it.id)
    if (!parts.length) return [it]
    return parts.map((p, i) => ({
      id: p.id, title: `${it.title} · ${p.title || p.part || p.id}`, state: 'open', parent: it.id, plan, shared: i === 0,
    }))
  })

  const items = cards.map((it) => {
    const mine = (n) => it.extra ? n === it.id : it.parent ? n === it.id || (it.shared && n === it.parent) : serves(n, it.id)
    const recs = records.filter((r) => mine(r.dir)).sort((a, b) => a.mtime - b.mtime)
    const itemRuns = runs.filter((r) => mine(r.item))
    const live = running.filter((r) => mine(r.item))
    const reviews = recs.filter((r) => r.role === 'reviewer' || r.role === 'auditor')
    const last = recs.at(-1)
    let column
    if (/^accepted/i.test(it.state)) column = 'accepted'
    else if (/^(blocked|rescope)/i.test(it.state)) column = 'blocked'
    else if (live.length) column = RUNNING_IN[live.at(-1).role] ?? 'building'
    else if (!last) column = it.extra && itemRuns.length ? 'accepted' : it.parent ? 'planned' : 'open'
    else if (last.role === 'planner') column = 'planned'
    else if (last.role === 'reviewer' || last.role === 'auditor') column = /pass/i.test(last.verdict || '') ? 'accepted' : 'fixing'
    else if (it.extra && last.role === 'fixer') column = 'accepted' // a block's fixer ends the block's audit
    else column = 'review'
    const packet = [...dirs.filter(mine), ...(it.parent ? [it.parent] : [])].map((d) => path.join(workDir, d, 'packet.md')).find((f) => fs.existsSync(f))
    return {
      id: it.id, title: it.title, state: it.state, block: blockOf(it.id), extra: !!it.extra, parent: it.parent ?? null, column,
      waiting: !live.length && !['accepted', 'blocked', 'open'].includes(column),
      running: live, runs: itemRuns, records: recs,
      dirs: dirs.filter(mine).map((d) => path.relative(projectDir, path.join(workDir, d))),
      packet: packet ? path.relative(projectDir, packet) : null,
      review: reviews.length ? reviews.at(-1).file.replace(/\.json$/, '.md') : null,
      usd: itemRuns.reduce((s, r) => s + (r.usd_equiv || 0), 0),
      secs: itemRuns.reduce((s, r) => s + (r.secs || 0), 0),
      fixRounds: recs.filter((r) => r.role === 'fixer').length,
      firstPass: reviews.length ? /pass/i.test(reviews[0].verdict || '') : null,
      builderTier: (recs.filter((r) => r.role === 'planner').at(-1) ?? it.plan)?.tier ?? null, // the planner's choice (§7)
    }
  })

  const blocks = [...new Set(items.map((i) => i.block))].map((b) => ({ id: b, items: items.filter((i) => i.block === b).map((i) => i.id) }))
  return {
    tranche, now, scopeDoc: scopeFile ? path.relative(projectDir, scopeFile) : null, tranches: tranches(config),
    blocks, items, runs, running,
    scoreboard: readJsonl(path.join(progressDir(config), 'scoreboard.jsonl')).filter((l) => l.tranche === tranche),
    totals: { runs: runs.length, usd: runs.reduce((s, r) => s + (r.usd_equiv || 0), 0), secs: runs.reduce((s, r) => s + (r.secs || 0), 0) },
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig()
  const t = process.argv[2] || activeTranche(config)
  if (!t) { console.error('No tranche found under', progressDir(config)); process.exit(1) }
  console.log(JSON.stringify(loadState(t, config), null, 2))
}

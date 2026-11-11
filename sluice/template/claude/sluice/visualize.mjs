#!/usr/bin/env node
// The sluice's views (design doc §10): Markdown with Mermaid, rewritten from the snapshot (sluice-state.mjs)
// whenever the sluice moves, for a Markdown preview left open beside the run. Never fails a hook.
//   node .claude/sluice/visualize.mjs [<tranche>]            write <progressDir>/<t>/views/*.md once
//   node .claude/sluice/visualize.mjs [<tranche>] --watch    rewrite on every change, and each minute
//   node .claude/sluice/visualize.mjs <t> --freeze <B>       a committed copy at a block's end: snapshots/block-<B>/
//   node .claude/sluice/visualize.mjs --hook-start           PreToolUse hook on Agent: records a sluice launch
// --out <dir> writes somewhere else (links are relative to it).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout, clearTimeout, setInterval } from 'node:timers'
import { loadConfig, progressDir, projectDir, stateDir, readStdinJson, readJsonl, parseHeader, ensureDir, logError, modelFamily, findingCounts, SEVERITIES } from './lib.mjs'
import { loadState, activeTranche, liveFile, COLUMNS } from './sluice-state.mjs'

const VIEWS = [['now', 'Now'], ['board', 'Board'], ['pipeline', 'Pipeline'], ['timeline', 'Timeline'], ['effort', 'Effort']]
const COLUMN_TITLE = { open: 'Open', planned: 'Planned', building: 'Building', review: 'Review', fixing: 'Fixing', human: 'Waiting on you', accepted: 'Accepted', blocked: 'Blocked' }
const WAITS_FOR = { planned: 'a builder', review: 'a reviewer', fixing: 'a fixer', human: 'you' }
// Slate for a run, crimson for one that asked for a fix, ochre for one running now: dark enough for the
// bars' white labels (6.5:1, 7.3:1 and 5.5:1, past WCAG AA's 4.5:1).
const GANTT_THEME = ['---', 'config:', '  themeVariables:', "    taskBkgColor: '#4a5d8a'", "    taskBorderColor: '#34446a'",
  "    critBkgColor: '#a4262c'", "    critBorderColor: '#6e1a1e'", "    activeTaskBkgColor: '#8f5f00'", "    activeTaskBorderColor: '#5e3e00'", '---']
const KEEP_LIVE_SECS = 2 * 24 * 3600

// Formatting.
const pad = (n) => String(n).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayOf = (ms) => { const d = new Date(ms); return `${MONTHS[d.getMonth()]} ${d.getDate()}` }
const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const when = (ms, now) => dayOf(ms) === dayOf(now) ? clock(ms) : `${dayOf(ms)} ${clock(ms)}`
const dur = (secs) => (secs = Math.max(0, secs)) < 60 ? `${Math.round(secs)} s` : secs < 3600 ? `${Math.round(secs / 60)} min`
  : `${Math.floor(secs / 3600)} h ${pad(Math.round((secs % 3600) / 60))} min`
const usd = (n) => `$${(n || 0).toFixed(2)}`
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const mm = (s, max = 60, keep = '') => { const t = String(s ?? '').replace(new RegExp(`[^\\p{L}\\p{N}\\s.,·○●/+$×?!_${keep}-]`, 'gu'), ' ').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t }
const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-')

function findingsText(f) {
  const n = findingCounts(f)
  return SEVERITIES.filter((k) => n[k]).map((k) => `${n[k]} ${k}`).join(' · ')
}

function runResult(r) {
  if (r.gate?.red) return 'gate red'
  const v = r.verdict ? r.verdict : 'done'
  const f = (r.role === 'reviewer' || r.role === 'auditor') ? findingsText(r.findings) : ''
  return [v, f].filter(Boolean).join(': ') + (r.gate?.blocks ? ` · gate blocked ×${r.gate.blocks}` : '')
}

function agentModel(type) {
  try {
    const md = fs.readFileSync(path.join(projectDir, '.claude', 'agents', `${type}.md`), 'utf8')
    return md.match(/^model:\s*(\S+)/m)?.[1] ?? null
  } catch { return null }
}

// Links: project-relative paths, made relative to the view's folder.
const linker = (outDir) => (p, anchor) => p ? encodeURI(path.relative(outDir, path.join(projectDir, p)).split(path.sep).join('/')) + (anchor ? `#${anchor}` : '') : null
function itemLink(s, it, link) {
  if (it.packet) return link(it.packet)
  if (!it.extra && s.scopeDoc) return link(s.scopeDoc, slug(`${it.id} ${it.title}`))
  return it.dirs[0] ? link(it.dirs[0]) : null
}

function nav(s, current, outDir, frozen) {
  const views = VIEWS.map(([f, t]) => f === current ? `**${t}**` : `[${t}](${f}.md)`).join(' · ')
  if (frozen) return `${views}  \n<sub>Frozen at ${dayOf(s.now)}, ${new Date(s.now).getFullYear()} ${clock(s.now)}</sub>`
  const others = s.tranches.filter((t) => t !== s.tranche)
    .map((t) => `[${t}](${encodeURI(path.relative(outDir, path.join(path.dirname(path.dirname(outDir)), t, path.basename(outDir), `${current}.md`)).split(path.sep).join('/'))})`)
  return `${views} · Tranche **${s.tranche}**${others.length ? ` · ${others.join(' · ')}` : ''}  \n<sub>Updated ${clock(s.now)}</sub>`
}

// The pipeline, the design doc's §3 graph cut to the nodes an item visits, with each item where it is.
function pipeline(s) {
  const at = { open: [], planner: [], builder: [], reviewer: [], fixer: [], auditor: [] }
  const live = new Set(), waiting = new Set()
  for (const it of s.items) {
    for (const r of it.running) { const n = r.role === 'clerk' ? 'builder' : r.role; (at[n] ??= []).push(`● ${it.id}`); live.add(n) }
    if (it.running.length) continue
    if (it.column === 'open' && !it.extra) at.open.push(it.id)
    else if (it.waiting) {
      const n = it.extra && it.column === 'review' ? 'auditor' : { planned: 'builder', review: 'reviewer', fixing: 'fixer' }[it.column]
      if (n) { at[n].push(`○ ${it.id}`); waiting.add(n) }
    }
  }
  const chips = (list) => list.length > 6 ? [...list.slice(0, 5), `+${list.length - 5}`] : list
  const label = (title, list) => `"${title}${list.length ? '<br/>' + chips(list).join(' ') : ''}"`
  const accepted = s.items.filter((i) => i.column === 'accepted' && !i.extra).length
  const lines = [
    'flowchart LR',
    `  open[${label(`Open · ${at.open.length}`, [])}] --> planner[${label('Planner', at.planner)}]`,
    `  planner --> builder[${label('Builder · Clerk', at.builder)}]`,
    '  builder --> gate{{"Gate"}}',
    `  gate --> reviewer[${label('Reviewer', at.reviewer)}]`,
    `  reviewer -->|fix needed| fixer[${label('Fixer', at.fixer)}]`,
    '  fixer --> gate',
    `  reviewer -->|pass| commit[${label(`Accepted · ${accepted}`, [])}]`,
    `  commit --> auditor[${label('Block audit', at.auditor)}]`,
    '  classDef live stroke:#d4a017,stroke-width:3px',
    '  classDef wait stroke-dasharray:5 4',
  ]
  for (const n of live) lines.push(`  class ${n} live`)
  for (const n of waiting) if (!live.has(n)) lines.push(`  class ${n} wait`)
  return lines.join('\n')
}

function viewNow(s, outDir, frozen) {
  const link = linker(outDir)
  const byId = new Map(s.items.map((i) => [i.id, i]))
  const owner = (name) => s.items.find((i) => i.id === name || i.runs.some((r) => r.item === name) || i.running.some((r) => r.item === name))
  const out = [`# ${s.tranche} · Now`, '', nav(s, 'now', outDir, frozen), '']

  const running = s.items.flatMap((it) => it.running.map((r) => ({ it, r })))
  if (running.length) {
    for (const { it, r } of running) {
      out.push(`### ● ${it.id} · ${r.role} r${r.round ?? 1} · ${dur((s.now - r.start) / 1000)}`)
      out.push(`${it.title} · ${[r.tier, r.model].filter(Boolean).join(' · ')}${it.packet ? ` · [packet](${link(it.packet)})` : ''}`, '')
    }
  } else if (frozen) {
    out.push(`### Snapshot at the block's end · ${dayOf(s.now)} ${clock(s.now)}`, '')
  } else {
    const lastEnd = s.runs.at(-1)?.end
    out.push(`### Nothing running${lastEnd ? ` · quiet for ${dur((s.now - lastEnd) / 1000)}` : ''}`)
    out.push('The orchestrator, or you, are next.', '')
  }

  const last = s.runs.at(-1)
  if (last) {
    const it = owner(last.item) ?? byId.get(last.item)
    const doc = last.record ? link(last.record.replace(/\.json$/, last.role === 'reviewer' || last.role === 'auditor' ? '.md' : '.json')) : null
    out.push(`**Last** · ${when(last.end, s.now)} · **${last.item}** ${last.role} r${last.round ?? 1} → ${runResult(last)} · ${last.family} · ${dur(last.secs || 0)} · ${usd(last.usd_equiv)}${doc ? ` · [record](${doc})` : ''}`)
    if (it && it.id !== last.item) out.push(`<sub>${it.id}: ${it.title}</sub>`)
    out.push('')
  }
  const next = s.items.filter((i) => i.waiting)
  if (next.length) out.push(`**Waiting** · ${next.map((i) => `${i.id} for ${i.extra && i.column === 'review' ? 'an auditor' : WAITS_FOR[i.column]}`).join(' · ')}`, '')

  out.push('```mermaid', pipeline(s), '```', '')

  const recent = s.runs.slice(-8).reverse()
  if (recent.length) {
    out.push('| When | Item | Role | Result | Model | Time | Cost |', '|---|---|---|---|---|---|---|')
    for (const r of recent) out.push(`| ${when(r.end, s.now)} | ${r.item} | ${r.role} r${r.round ?? 1} | ${runResult(r)} | ${r.family} | ${dur(r.secs || 0)} | ${usd(r.usd_equiv)} |`)
    out.push('')
  }
  const done = s.items.filter((i) => i.column === 'accepted' && !i.extra).length, total = s.items.filter((i) => !i.extra).length
  out.push(`<sub>${done} of ${total} items accepted · ${plural(s.totals.runs, 'agent run')} · ${dur(s.totals.secs)} of agent time · ${usd(s.totals.usd)} (API-equivalent)</sub>`)
  return out.join('\n') + '\n'
}

function inFlightNote(s, it) {
  const r = it.running.at(-1)
  if (r) return `● ${r.role} r${r.round ?? 1} · ${r.model ?? r.tier ?? ''} · ${dur((s.now - r.start) / 1000)}`
  return `○ waits for ${it.extra && it.column === 'review' ? 'an auditor' : WAITS_FOR[it.column]}`
}

// The board: a row per block, a column per state, every card a link; then what's in flight, then every item's record.
function viewBoard(s, outDir, frozen) {
  const link = linker(outDir)
  const cols = COLUMNS.filter((c) => s.items.some((i) => i.column === c))
  const cell = (it) => { const l = itemLink(s, it, link); const mark = it.running.length ? ' ●' : it.waiting ? ' ○' : ''; return `${l ? `[${it.id}](${l})` : it.id}${mark}` }
  const out = [`# ${s.tranche} · Board`, '', nav(s, 'board', outDir, frozen), '',
    `| Block | ${cols.map((c) => `${COLUMN_TITLE[c]} · ${s.items.filter((i) => i.column === c).length}`).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`]
  for (const b of s.blocks) {
    const items = s.items.filter((i) => i.block === b.id)
    out.push(`| **${b.id}** | ${cols.map((c) => items.filter((i) => i.column === c).map(cell).join(' ')).join(' | ')} |`)
  }
  out.push('', '<sub>● an agent is on it · ○ waiting for the next agent · open items link to the scope doc, the rest to their packet</sub>', '')
  const inFlight = s.items.filter((i) => i.running.length || i.waiting)
  if (inFlight.length) {
    out.push('**In flight**', '')
    for (const it of inFlight) {
      const links = [it.packet && `[packet](${link(it.packet)})`, it.review && `[latest review](${link(it.review)})`].filter(Boolean).join(' · ')
      out.push(`- **${it.id}** ${it.title} · ${inFlightNote(s, it)} · ${usd(it.usd)} so far${links ? ` · ${links}` : ''}`)
    }
    out.push('')
  }
  out.push('| Item | Title | State | Runs | Reviews | Fix rounds | Agent time | Cost |', '|---|---|---|---|---|---|---|---|')
  for (const it of s.items.filter((i) => i.runs.length || i.running.length)) {
    const reviews = it.records.filter((r) => r.role === 'reviewer' || r.role === 'auditor')
    const rv = reviews.map((r) => `[r${r.round}](${link(r.file.replace(/\.json$/, '.md'))}) ${r.verdict === 'pass' ? '✓' : '✗'}`).join(' ')
    out.push(`| ${cell(it)} | ${mm(it.title, 44)} | ${COLUMN_TITLE[it.column]} | ${it.runs.length} | ${rv || '–'} | ${it.fixRounds} | ${dur(it.secs)} | ${usd(it.usd)} |`)
  }
  return out.join('\n') + '\n'
}

// A gantt per day, newest first: one bar per agent run, a section per item.
function viewTimeline(s, outDir, frozen) {
  const out = [`# ${s.tranche} · Timeline`, '', nav(s, 'timeline', outDir, frozen), '']
  const bars = [
    ...s.items.flatMap((it) => it.running.map((r) => ({ item: r.item, role: r.role, round: r.round, family: modelFamily(r.model || '') === 'unknown' ? (r.model ?? '') : modelFamily(r.model), start: r.start, end: s.now, tag: 'active' }))),
    ...s.runs.map((r) => ({ item: r.item, role: r.role, round: r.round, family: r.family, start: r.start, end: r.end, usd: r.usd_equiv, secs: r.secs,
      tag: r.gate?.red || (/fix needed/i.test(r.verdict || '')) ? 'crit' : '' })),
  ]
  const days = [...new Set(bars.map((b) => dayOf(b.start)))].sort((a, b) => Math.max(...bars.filter((x) => dayOf(x.start) === b).map((x) => x.start)) - Math.max(...bars.filter((x) => dayOf(x.start) === a).map((x) => x.start)))
  for (const day of days) {
    const today = bars.filter((b) => dayOf(b.start) === day).sort((a, b) => a.start - b.start)
    const secs = today.reduce((n, b) => n + (b.secs ?? (b.end - b.start) / 1000), 0)
    out.push(`### ${day} · ${plural(today.length, 'run')} · ${dur(secs)} of agent time · ${usd(today.reduce((n, b) => n + (b.usd || 0), 0))}`, '')
    out.push('```mermaid', ...GANTT_THEME, 'gantt', '  dateFormat x', '  axisFormat %H:%M', '  todayMarker off')
    for (const item of [...new Set(today.map((b) => b.item))]) {
      out.push(`  section ${mm(item)}`)
      for (const b of today.filter((x) => x.item === item)) {
        const end = Math.max(b.end, b.start + 60_000) // a bar at least a minute wide, to stay visible
        out.push(`    ${mm(`${b.role} r${b.round ?? 1} ${b.family}`)} :${b.tag ? `${b.tag}, ` : ''}${Math.round(b.start)}, ${Math.round(end)}`)
      }
    }
    out.push('```', '')
  }
  if (!days.length) out.push('No agent runs yet.')
  out.push('<sub>Red: a review or audit that asked for a fix, or a gate that stayed red · highlighted: running now</sub>')
  return out.join('\n') + '\n'
}

// The design doc's §3 graph: each edge counted from the ledger (dotted if never taken), each item where it is.
function viewPipeline(s, outDir, frozen) {
  const link = linker(outDir)
  const n = (f) => s.runs.filter(f).length
  const pass = (r) => /pass/i.test(r.verdict || ''), fix = (r) => /fix/i.test(r.verdict || '')
  const tierNode = (tier, role) => role === 'clerk' || tier === 'small' ? 'clerk' : tier === 'large' ? 'builderL' : 'builderM'
  const at = { planner: [], builderL: [], builderM: [], clerk: [], reviewer: [], fixer: [], auditor: [] }
  const live = new Set(), waiting = new Set()
  for (const it of s.items) {
    for (const r of it.running) {
      const node = r.role === 'builder' || r.role === 'clerk' ? tierNode(r.tier, r.role) : r.role
      if (at[node]) { at[node].push(`● ${it.id}`); live.add(node) }
    }
    if (it.running.length || !it.waiting || it.column === 'human') continue
    const node = it.column === 'planned' ? tierNode(it.builderTier) : it.column === 'fixing' ? 'fixer' : it.extra ? 'auditor' : 'reviewer'
    at[node].push(`○ ${it.id}`); waiting.add(node)
  }
  const chips = (list) => list.length > 6 ? [...list.slice(0, 5), `+${list.length - 5}`] : list
  const node = (id, title, shape = '[]') => `  ${id}${shape[0]}"${title}${at[id]?.length ? '<br/>' + chips(at[id]).join(' ') : ''}"${shape[1]}`
  const edge = (a, b, count, label = '') => count ? `  ${a} -->|${[label, `×${count}`].filter(Boolean).join(' ')}| ${b}` : `  ${a} -.-> ${b}`
  const gateBlocks = s.runs.reduce((t, r) => t + (r.gate?.blocks || 0), 0), gateRed = n((r) => r.gate?.red)
  const open = s.items.filter((i) => i.column === 'open' && !i.extra).length
  const accepted = s.items.filter((i) => i.column === 'accepted' && !i.extra).length
  const g = [
    'flowchart LR',
    `  scope["Scope doc<br/>${open} open"]`,
    node('planner', 'Planner'), '  risk{"Risk"}',
    node('builderL', 'Builder · large'), node('builderM', 'Builder · medium'), node('clerk', 'Clerk · small'),
    `  gate{{"Gate${gateBlocks ? `<br/>blocked ×${gateBlocks}` : ''}${gateRed ? ` · red ×${gateRed}` : ''}"}}`,
    node('reviewer', 'Reviewer'), node('fixer', 'Fixer'), `  commit["Accepted · ${accepted}"]`, node('auditor', 'Block audit'),
    edge('scope', 'planner', n((r) => r.role === 'planner')),
    '  planner --> risk',
    edge('risk', 'builderL', n((r) => r.role === 'builder' && r.tier === 'large' && r.round === 1)),
    edge('risk', 'builderM', n((r) => r.role === 'builder' && r.tier !== 'large' && r.round === 1)),
    edge('risk', 'clerk', n((r) => r.role === 'clerk')),
    '  builderL --> gate', '  builderM --> gate', '  clerk --> gate',
    edge('gate', 'reviewer', n((r) => r.role === 'reviewer')),
    edge('reviewer', 'fixer', n((r) => r.role === 'reviewer' && fix(r)), 'fix needed'),
    edge('fixer', 'gate', n((r) => r.role === 'fixer')),
    edge('reviewer', 'commit', n((r) => r.role === 'reviewer' && pass(r)), 'pass'),
    edge('commit', 'auditor', n((r) => r.role === 'auditor')),
    edge('auditor', 'fixer', n((r) => r.role === 'auditor' && fix(r)), 'fixes'),
    '  classDef live stroke:#d4a017,stroke-width:3px',
    '  classDef wait stroke-dasharray:5 4',
    ...[...live].map((id) => `  class ${id} live`),
    ...[...waiting].filter((id) => !live.has(id)).map((id) => `  class ${id} wait`),
  ]
  const out = [`# ${s.tranche} · Pipeline`, '', nav(s, 'pipeline', outDir, frozen), '', '```mermaid', ...g, '```', '',
    '<sub>Edges count agent runs this tranche (dotted: not taken yet) · ● running · ○ waiting there</sub>', '']

  // Each item's path through the graph: the ones in flight first, then the most recent.
  const step = (r) => `${r.role}${r.round > 1 ? ` r${r.round}` : ''}${pass(r) && (r.role === 'reviewer' || r.role === 'auditor') ? ' ✓' : fix(r) ? ' ✗' : ''}${r.gate?.red ? ' (gate red)' : ''}`
  const lastAt = (it) => Math.max(0, ...it.runs.map((r) => r.end), ...it.running.map((r) => r.start))
  const journeys = s.items.filter((i) => i.runs.length || i.running.length)
    .sort((a, b) => (b.running.length || b.waiting) - (a.running.length || a.waiting) || lastAt(b) - lastAt(a)).slice(0, 12)
  if (journeys.length) {
    out.push('**Journeys**', '')
    for (const it of journeys) {
      const steps = [...it.runs.map(step), ...it.running.map((r) => `**● ${r.role}${r.round > 1 ? ` r${r.round}` : ''}**`)]
      if (it.waiting) steps.push(`○ ${it.extra && it.column === 'review' ? 'audit' : WAITS_FOR[it.column].replace(/^an? /, '')}`)
      if (it.column === 'accepted') steps.push('accepted')
      const l = itemLink(s, it, link)
      out.push(`- ${l ? `[**${it.id}**](${l})` : `**${it.id}**`} ${steps.join(' → ')} <sub>· ${usd(it.usd)} · ${dur(it.secs)}</sub>`)
    }
  }
  return out.join('\n') + '\n'
}

// What the work cost, and where it went.
const CHART_THEME = ['---', 'config:', '  themeVariables:', '    xyChart:', "      plotColorPalette: '#8da2c8, #c9a64a'", '---']
const PIE_THEME = ['---', 'config:', '  themeVariables:', ...['#8da2c8', '#c9a64a', '#a7b8a0', '#c7a6a0', '#b5afc9', '#d8d2c4'].map((c, i) => `    pie${i + 1}: '${c}'`), '---']
function viewEffort(s, outDir, frozen) {
  const link = linker(outDir)
  const items = s.items.filter((i) => i.runs.length && !i.extra) // block audits are in the block table
  const accepted = s.items.filter((i) => i.column === 'accepted' && !i.extra).length
  const r2 = (x) => Math.round(x * 100) / 100
  const out = [`# ${s.tranche} · Effort`, '', nav(s, 'effort', outDir, frozen), '',
    `**${usd(s.totals.usd)}** API-equivalent · ${dur(s.totals.secs)} of agent time · ${plural(s.totals.runs, 'agent run')}${accepted ? ` · ${usd(s.totals.usd / accepted)} per accepted item` : ''} <sub>(agents only; the orchestrator is in the block table)</sub>`, '']
  if (!s.runs.length) return out.concat('No agent runs yet.').join('\n') + '\n'

  out.push('```mermaid', ...CHART_THEME, 'xychart-beta', '  title "Cost per item, $"',
    `  x-axis [${items.map((i) => `"${mm(i.id)}"`).join(', ')}]`, '  y-axis "$"', `  bar [${items.map((i) => r2(i.usd)).join(', ')}]`, '```', '')

  const days = [...new Set(s.runs.map((r) => dayOf(r.end)))]
  const perDay = days.map((d) => s.runs.filter((r) => dayOf(r.end) === d).reduce((t, r) => t + (r.usd_equiv || 0), 0))
  let cum = 0
  out.push('```mermaid', ...CHART_THEME, 'xychart-beta', '  title "Spend per day, and in all, $"', `  x-axis [${days.map((d) => `"${d}"`).join(', ')}]`, '  y-axis "$"',
    `  bar [${perDay.map(r2).join(', ')}]`, `  line [${perDay.map((v) => r2(cum += v)).join(', ')}]`, '```', '')

  // Spend from model to role to block.
  const flows = new Map()
  const add = (a, b, v) => flows.set(`${a},${b}`, (flows.get(`${a},${b}`) || 0) + v)
  for (const r of s.runs) { add(r.family, r.role, r.usd_equiv || 0); add(r.role, `Block ${s.items.find((i) => i.runs.includes(r))?.block ?? '?'}`, r.usd_equiv || 0) }
  out.push('**Where the spend went:** model → role → block', '', '```mermaid', 'sankey-beta', '',
    ...[...flows].filter(([, v]) => v >= 0.01).map(([k, v]) => `${k},${r2(v)}`), '```', '')

  const roles = [...new Set(s.runs.map((r) => r.role))]
  out.push('```mermaid', ...PIE_THEME, 'pie showData', '  title Agent time by role, minutes',
    ...roles.map((role) => `  "${role}" : ${Math.round(s.runs.filter((r) => r.role === role).reduce((t, r) => t + (r.secs || 0), 0) / 60)}`), '```', '')

  out.push('| Block | Items | Accepted | Runs | Agent time | Cost | Per item | First pass | Fix rounds |', '|---|---|---|---|---|---|---|---|---|')
  for (const b of s.blocks) {
    const its = s.items.filter((i) => i.block === b.id && !i.extra), extra = s.items.filter((i) => i.block === b.id && i.extra)
    const runs = [...new Set([...its, ...extra].flatMap((i) => i.runs))] // a bundle's runs serve each of its items
    if (!runs.length && !its.length) continue
    const cost = runs.reduce((t, r) => t + (r.usd_equiv || 0), 0), secs = runs.reduce((t, r) => t + (r.secs || 0), 0)
    const reviewed = its.filter((i) => i.firstPass !== null), ok = its.filter((i) => i.firstPass === true).length
    out.push(`| **${b.id}** | ${its.length} | ${its.filter((i) => i.column === 'accepted').length} | ${runs.length} | ${runs.length ? dur(secs) : '–'} | ${runs.length ? usd(cost) : '–'} | ${its.length && runs.length ? usd(cost / its.length) : '–'} | ${reviewed.length ? `${ok}/${reviewed.length}` : '–'} | ${new Set(its.flatMap((i) => i.records.filter((r) => r.role === 'fixer').map((r) => r.file))).size} |`)
  }
  out.push('')
  if (s.scoreboard.length) {
    out.push('**Closed blocks** (the scoreboard: agents and the orchestrator)', '',
      '| Block | Items | Windows | Cost | Orchestrator | First pass | Fix rounds | Findings |', '|---|---|---|---|---|---|---|---|')
    for (const b of s.scoreboard) {
      const note = path.join(path.relative(projectDir, progressDir(loadConfig())), s.tranche, `block-${b.block}.md`)
      const orch = b.by_role?.orchestrator
      out.push(`| [${b.block}](${link(note)}) | ${b.items} | ${b.windows} | ${usd(b.usd_equiv)} | ${orch != null ? `${usd(orch)} (${Math.round(100 * orch / b.usd_equiv)}%)` : '–'} | ${b.first_pass}/${b.reviewed} | ${b.fix_rounds_mean} mean | ${findingsText(b.findings) || 'none'} |`)
    }
    out.push('')
  }
  out.push('<sub>Costs are API-equivalent list prices from the ledger, not a bill.</sub>')
  return out.join('\n') + '\n'
}

export function renderTranche(tranche, config = loadConfig(), outDir = null, frozen = false) {
  if (config.views === 'off') return null
  const dir = outDir || path.join(progressDir(config), tranche, config.views?.dir || 'views')
  ensureDir(dir)
  const s = loadState(tranche, config)
  if (frozen && s.runs.length) s.now = s.runs.at(-1).end // a snapshot is as of the block's last run, not the clock
  const views = { now: viewNow, board: viewBoard, pipeline: viewPipeline, timeline: viewTimeline, effort: viewEffort }
  for (const [name, fn] of Object.entries(views)) {
    const file = path.join(dir, `${name}.md`), text = fn(s, dir, frozen)
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text) // an unchanged view isn't touched
  }
  return dir
}

// PreToolUse on the Agent tool: a sluice launch's header goes into live.jsonl, so the views can show it running.
async function hookStart() {
  const input = await readStdinJson()
  const header = parseHeader(input.tool_input?.prompt || '')
  if (!header?.tranche) return
  const t = Date.now()
  const kept = readJsonl(liveFile()).filter((l) => t - Date.parse(l.t) < KEEP_LIVE_SECS * 1000)
  kept.push({ t: new Date(t).toISOString(), tranche: header.tranche, item: header.item ?? null, role: header.role ?? input.tool_input?.subagent_type ?? null,
    tier: header.tier ?? null, round: header.round ? Number(header.round) : null, model: input.tool_input?.model ?? agentModel(input.tool_input?.subagent_type) })
  ensureDir(stateDir)
  fs.writeFileSync(liveFile(), kept.map((l) => JSON.stringify(l)).join('\n') + '\n')
  renderTranche(header.tranche)
}

function watch(tranche, config, outDir) {
  const tdir = path.join(progressDir(config), tranche)
  const viewDir = path.resolve(outDir || path.join(tdir, config.views?.dir || 'views'))
  let timer = null
  const render = (why) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try { renderTranche(tranche, config, outDir); console.log(`${clock(Date.now())} rendered (${why})`) } catch (err) { console.error(err) }
    }, 300)
  }
  const skip = (f) => !f || path.resolve(tdir, f).startsWith(viewDir) || f.startsWith('snapshots')
  fs.watch(tdir, { recursive: true }, (_, f) => { if (!skip(f)) render(f) })
  ensureDir(stateDir)
  fs.watch(stateDir, (_, f) => { if (f === 'live.jsonl') render('launch') })
  const scopeDir = path.join(projectDir, config.scopeDir || 'docs')
  fs.watch(scopeDir, (_, f) => { if (f?.endsWith('.md')) render(f) })
  setInterval(() => render('tick'), 60_000)
  render('start')
  console.log(`Watching ${path.relative(projectDir, tdir)}; views in ${path.relative(projectDir, viewDir) || viewDir}. Ctrl-C to stop.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--hook-start')) {
    try { await hookStart() } catch (err) { logError('visualize', err) }
    process.exit(0)
  }
  const config = loadConfig()
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
  const tranche = args.find((a, i) => !a.startsWith('--') && !['--out', '--freeze'].includes(args[i - 1])) || activeTranche(config)
  if (!tranche) { console.error(`No tranche found under ${progressDir(config)}`); process.exit(1) }
  const block = opt('--freeze')
  const out = opt('--out') ? path.resolve(opt('--out'))
    : block ? path.join(progressDir(config), tranche, 'snapshots', `block-${block}`) : null
  if (args.includes('--watch')) watch(tranche, config, out)
  else console.log(path.relative(projectDir, renderTranche(tranche, config, out, !!block)) || '.')
}

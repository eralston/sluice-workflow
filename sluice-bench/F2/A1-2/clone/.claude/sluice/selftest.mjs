#!/usr/bin/env node
// Self-test for the sluice's hooks and scripts, on synthetic data in a temp folder. Run it after
// installing or changing the sluice:   node .claude/sluice/selftest.mjs [--real-gate]
// --real-gate also runs this project's configured gate once, on the real tree. When the sluice package is
// in this repository (two folders above designDoc), it also checks that .claude/ still matches the
// package's template/claude/, apart from this project's own values.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { sluiceDir, projectDir } from './lib.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sluice-selftest-'))
const proj = path.join(tmp, 'proj'), progress = path.join(tmp, 'progress'), sessions = path.join(tmp, 'sessions')
fs.mkdirSync(path.join(sessions, 'sess', 'subagents'), { recursive: true })
fs.mkdirSync(proj, { recursive: true })
fs.writeFileSync(path.join(sessions, 'sess.jsonl'), '')

// The synthetic project is a git repository with a few commits, for the health snapshot.
const sh = (cmd) => spawnSync(cmd, { shell: true, cwd: proj, encoding: 'utf8' })
sh('git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false')
fs.writeFileSync(path.join(proj, 'big.ts'), 'x\n'.repeat(900))
fs.writeFileSync(path.join(proj, 'small.ts'), 'y\n')
fs.writeFileSync(path.join(proj, 'notes.md'), 'z\n')
sh('git add -A && git commit -qm one')
for (const n of [2, 3]) { fs.appendFileSync(path.join(proj, 'big.ts'), 'x\n'); sh(`git commit -qam c${n}`) }

const realConfig = JSON.parse(fs.readFileSync(path.join(sluiceDir, 'config.json'), 'utf8'))
const testHealth = { extensions: ['.ts'], include: [], largeFileLines: 800, hotspotCommits: 50, commands: [{ name: 'Probe', cmd: 'echo 7 things' }] }
const cfg = (gate) => { const f = path.join(tmp, `cfg-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ ...realConfig, gate, health: testHealth })); return f }
const testCfg = cfg([])
const env = (extra = {}) => ({ ...process.env, CLAUDE_PROJECT_DIR: proj, SLUICE_PROGRESS_DIR: progress, SLUICE_CONFIG: testCfg, ...extra })
const run = (script, input, extra) => spawnSync(process.execPath, [path.join(sluiceDir, script), ...(extra?.args || [])],
  { input: input === undefined ? '' : JSON.stringify(input), env: env(extra?.env), encoding: 'utf8' })

function transcript(id, header) {
  const lines = [
    { type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { role: 'user', content: `${header}\nWork folder: x` } },
    { type: 'assistant', timestamp: '2026-01-01T10:01:00Z', message: { id: 'm1', model: 'claude-sonnet-x', usage: { input_tokens: 2, cache_read_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 50000 }, output_tokens: 100 } } },
    { type: 'assistant', timestamp: '2026-01-01T10:01:05Z', message: { id: 'm1', model: 'claude-sonnet-x', usage: { input_tokens: 2, cache_read_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 50000 }, output_tokens: 900 } } },
    { type: 'assistant', timestamp: '2026-01-01T10:10:00Z', message: { id: 'm2', model: 'claude-sonnet-x', usage: { input_tokens: 3, cache_read_input_tokens: 51000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2000 }, output_tokens: 400 } } },
  ]
  fs.writeFileSync(path.join(sessions, 'sess', 'subagents', `agent-${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'))
  return { session_id: 'sess', agent_id: id, agent_type: 'builder', transcript_path: path.join(sessions, 'sess.jsonl') }
}

const readLines = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

// Ledger: one line per agent even after two stops; the streamed duplicate counted once.
const a = transcript('a1', 'sluice: tranche=t1 item=B7 role=builder tier=medium round=1')
run('ledger.mjs', a); run('ledger.mjs', a)
const ledgerFile = path.join(progress, 't1', 'ledger.jsonl')
const lines = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
check('ledger writes one line per agent', lines.length === 1, `${lines.length} lines`)
check('ledger dedupes streamed responses', lines[0]?.calls === 2 && lines[0]?.out === 1300, JSON.stringify({ calls: lines[0]?.calls, out: lines[0]?.out }))
check('ledger ignores agents without a sluice header', (() => { const n = transcript('n1', 'no header here'); run('ledger.mjs', n); return fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').length === 1 })())

// Views: the ledger redraws them; the start hook shows a launch as running until its ledger line lands.
const scopeDir = path.join(proj, realConfig.scopeDir || 'docs') // wherever this project keeps its scope docs
fs.mkdirSync(scopeDir, { recursive: true })
fs.writeFileSync(path.join(scopeDir, 't1.md'), '# t1: scope\n\n## Items\n\n### B7 Partial-history notice\n- State:       open\n\n### B8 Retry button\n- State:       open\n\n## Decisions\n')
fs.mkdirSync(path.join(progress, 't1', 'work', 'B7'), { recursive: true })
fs.writeFileSync(path.join(progress, 't1', 'work', 'B7', 'build-1.json'), JSON.stringify({ item: 'B7', role: 'builder', round: 1, verdict: 'done' }))
run('ledger.mjs', a)
const views = path.join(progress, 't1', 'views'), view = (n) => fs.existsSync(path.join(views, `${n}.md`)) ? fs.readFileSync(path.join(views, `${n}.md`), 'utf8') : ''
check('views are drawn from the ledger hook', ['now', 'board', 'pipeline', 'timeline', 'effort'].every((n) => n === 'board' || view(n).includes('```mermaid')) && view('board').includes('| **B** |'))
check('views place a built item in review', /\| \[B7\]\([^)]*\) ○ \| Partial-history notice \| Review \|/.test(view('board')), view('board'))
const launch = (prompt) => run('visualize.mjs', { tool_name: 'Agent', tool_input: { subagent_type: 'planner', prompt } }, { args: ['--hook-start'] })
check('start hook ignores launches without a sluice header', launch('no header').status === 0 && !fs.existsSync(path.join(proj, '.claude', 'state', 'live.jsonl')))
launch('sluice: tranche=t1 item=B8 role=planner tier=large round=1\nWork folder: x')
check('start hook shows a launch as running', view('now').includes('### ● B8 · planner r1') && /\[B8\]\([^)]*\) ●/.test(view('board')) && view('pipeline').includes('planner["Planner<br/>● B8"]'))
check('pipeline counts the edges taken', view('pipeline').includes('risk -->|×1| builderM') && view('pipeline').includes('risk -.-> clerk'))
const frozen = run('visualize.mjs', undefined, { args: ['t1', '--freeze', 'B'] })
check('views freeze a block snapshot', frozen.status === 0 && fs.readFileSync(path.join(progress, 't1', 'snapshots', 'block-B', 'now.md'), 'utf8').includes('Frozen'), frozen.stderr.trim())

// Gate: blocks, then gives up red; skips gate=off; passes when green.
const failing = cfg([{ name: 'fails', cmd: 'echo boom; exit 1' }])
const codes = [1, 2, 3, 4].map(() => run('gate.mjs', a, { env: { SLUICE_CONFIG: failing } }).status)
const realMax = realConfig.gateMaxBlocks
const expected = [...Array(realMax).fill(2), 0]
check('gate blocks, then stops red', JSON.stringify(codes.slice(0, realMax + 1)) === JSON.stringify(expected), `exits ${codes.join(',')}`)
const gateState = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'state', 'gate-a1.json'), 'utf8'))
check('gate records red', gateState.red === true)
const off = transcript('o1', 'sluice: tranche=t1 item=B8 role=clerk tier=small round=1 gate=off')
check('gate skips gate=off', run('gate.mjs', off, { env: { SLUICE_CONFIG: failing } }).status === 0)
const rv = transcript('r1', 'sluice: tranche=t1 item=B7 role=reviewer tier=large round=1')
check('gate ignores non-writer roles', run('gate.mjs', { ...rv, agent_type: 'reviewer' }, { env: { SLUICE_CONFIG: failing } }).status === 0)
check('gate ignores agents without a sluice header', run('gate.mjs', transcript('x1', 'no header'), { env: { SLUICE_CONFIG: failing } }).status === 0)
check('gate --run checks by hand', run('gate.mjs', undefined, { args: ['--run'], env: { SLUICE_CONFIG: failing } }).status === 1 &&
  run('gate.mjs', undefined, { args: ['--run'], env: { SLUICE_CONFIG: cfg([{ name: 'ok', cmd: 'exit 0' }]) } }).status === 0)
check('gate passes when green', run('gate.mjs', a, { env: { SLUICE_CONFIG: cfg([{ name: 'ok', cmd: 'exit 0' }]) } }).status === 0)
run('ledger.mjs', a)
const after = JSON.parse(fs.readFileSync(ledgerFile, 'utf8').trim().split('\n')[0])
check('ledger carries the gate state', after.gate?.blocks === realMax, JSON.stringify(after.gate))

// Statusline and budget.
const status = (five, week) => run('statusline.mjs', { model: { display_name: 'Test' }, rate_limits: { five_hour: { used_percentage: five }, seven_day: { used_percentage: week } } })
check('statusline prints usage', status(42, 10).stdout.includes('5h 42%'))
check('budget GO', run('budget.mjs').stdout.startsWith('GO'))
status(91, 10); check('budget HOLD', run('budget.mjs').stdout.startsWith('HOLD'))
status(50, 95); check('budget STOP', run('budget.mjs').stdout.startsWith('STOP'))

// Summary.
fs.mkdirSync(path.join(progress, 't1', 'work', 'B7'), { recursive: true })
fs.writeFileSync(path.join(progress, 't1', 'work', 'B7', 'review-1.json'), JSON.stringify({ verdict: 'pass', findings: { minor: 1 } }))
const sum = run('summary.mjs', undefined, { args: ['t1', '--block', 'B', '--no-main', '--write'] })
check('summary reports the block', sum.stdout.includes('First-pass acceptance   1/1'), sum.stderr.trim())
check('summary writes the block note', fs.existsSync(path.join(progress, 't1', 'block-B.md')))

// Health and the scoreboard.
const health = JSON.parse(run('health.mjs', undefined, { args: ['--json'] }).stdout || 'null')
check('health measures size and large files', health?.files === 2 && health?.large.count === 1, JSON.stringify(health))
check('health finds the hotspot', health?.hotspots.top[0]?.file === 'big.ts' && health?.hotspots.top[0]?.changes === 3)
check('health runs project commands', health?.extra?.Probe === '7 things')
check('summary puts health in the block note', fs.readFileSync(path.join(progress, 't1', 'block-B.md'), 'utf8').includes('## Health'))
fs.appendFileSync(path.join(progress, 't1', 'block-B.md'), '\n## Escapes\n\n- B7: a label overlapped\n')
run('summary.mjs', undefined, { args: ['t1', '--block', 'B', '--no-main', '--write'] })
const board = readLines(path.join(progress, 'scoreboard.jsonl'))
check('scoreboard keeps one line per block', board.length === 1 && board[0].first_pass === 1, `${board.length} lines`)
const sb = run('scoreboard.mjs').stdout
check('scoreboard reports blocks and tranches', /t1 B .*100%/.test(sb) && sb.includes('Escapes/item') && /\bt1\s+1\s+1\b/.test(sb), sb)

// Lock.
const lock = spawnSync(path.join(sluiceDir, 'with-lock.sh'), ['true'], { env: env(), encoding: 'utf8' })
check('with-lock runs the command', lock.status === 0, lock.stderr.trim())

// Drift: the installed .claude/ against the package's template, when the package is in this repository.
// Only config.json (this project's values; its keys must match) and project.md may differ.
const pkgTemplate = path.resolve(projectDir, realConfig.designDoc || '', '..', '..', 'template', 'claude')
const installed = path.join(projectDir, '.claude')
if (fs.existsSync(pkgTemplate) && !sluiceDir.startsWith(pkgTemplate)) {
  const drift = []
  const keys = (o) => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) && !k.startsWith('_') ? [k, ...Object.keys(v).map((s) => `${k}.${s}`)] : [k])
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
  for (const file of walk(pkgTemplate)) {
    const rel = path.relative(pkgTemplate, file), mine = path.join(installed, rel)
    if (!fs.existsSync(mine)) { drift.push(`missing ${rel}`); continue }
    if (rel === path.join('sluice', 'config.json')) {
      const theirs = keys(JSON.parse(fs.readFileSync(file, 'utf8'))), ours = keys(JSON.parse(fs.readFileSync(mine, 'utf8')))
      const gone = theirs.filter((k) => !ours.includes(k))
      if (gone.length) drift.push(`config.json lacks ${gone.join(', ')}`)
    } else if (rel === 'settings.json') {
      const ours = fs.readFileSync(mine, 'utf8')
      const cmds = [...fs.readFileSync(file, 'utf8').matchAll(/"command":\s*("(?:[^"\\]|\\.)*")/g)].map((m) => m[1])
      if (cmds.some((c) => !ours.includes(c))) drift.push('settings.json lacks a sluice hook or the statusline')
    } else if (!fs.readFileSync(file).equals(fs.readFileSync(mine))) drift.push(`differs ${rel}`)
  }
  check('.claude/ matches the sluice package', drift.length === 0, `${drift.join('; ')} (copy from ${path.relative(projectDir, pkgTemplate)}/)`)
}

// Optionally: this project's real gate, on the real tree.
if (process.argv.includes('--real-gate')) {
  const realEnv = { ...process.env, CLAUDE_PROJECT_DIR: projectDir }
  delete realEnv.SLUICE_CONFIG
  delete realEnv.SLUICE_PROGRESS_DIR
  const r = spawnSync(process.execPath, [path.join(sluiceDir, 'gate.mjs'), '--run'], { env: realEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  check('the real gate passes on this tree', r.status === 0, (r.stderr || r.stdout).trim().split('\n').slice(0, 3).join(' | '))
}

fs.rmSync(tmp, { recursive: true, force: true })
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `  (${r.detail})` : ''}`)
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`)
process.exit(failed ? 1 : 0)

#!/usr/bin/env node
// The code-health snapshot (roadmap L1): measured from git and the file tree, so it costs no tokens.
// Size, very large files, hotspots (files changed most often lately), dependencies, plus any project
// commands under health.commands (each prints one line, e.g. a complexity count from the linter).
// summary.mjs --write puts it in the block note and the scoreboard.
//   node .claude/sluice/health.mjs [--json]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { loadConfig, projectDir } from './lib.mjs'

const git = (args) => spawnSync('git', args, { cwd: projectDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

export function healthSnapshot(config) {
  const h = config.health
  if (!h || h === 'off') return null
  const head = git(['rev-parse', '--short', 'HEAD'])
  if (head.status !== 0) return { error: 'not a git repository with commits' }

  const exts = h.extensions || []
  const under = (f, r) => f === r || f.startsWith(r.endsWith('/') ? r : `${r}/`)
  const roots = h.include || [], skip = h.exclude || []
  const wanted = (f) => (!exts.length || exts.includes(path.extname(f))) &&
    (!roots.length || roots.some((r) => under(f, r))) && !skip.some((r) => under(f, r))
  const files = git(['ls-files', '-z']).stdout.split('\0').filter((f) => f && wanted(f))

  const lines = {}
  for (const f of files) {
    try { lines[f] = fs.readFileSync(path.join(projectDir, f), 'utf8').split('\n').length } catch { /* deleted in the tree */ }
  }
  const present = Object.keys(lines)
  const limit = h.largeFileLines || 800
  const bySize = present.slice().sort((a, b) => lines[b] - lines[a])

  // Hotspots: files changed often in the last N commits, ranked by changes × lines (size standing in for
  // complexity). Often-changed large files are where agents spend the most tokens and break the most
  // (research.md §6).
  const n = h.hotspotCommits || 50
  const log = git(['log', `-n${n}`, '--name-only', '--format=%x00']).stdout
  const commits = log.split('\0').filter((c) => c.trim()).length
  const changes = {}
  for (const f of log.split('\n')) if (lines[f] !== undefined) changes[f] = (changes[f] || 0) + 1
  const touched = Object.values(changes).sort((a, b) => a - b)
  const hot = Object.keys(changes).sort((a, b) => changes[b] * lines[b] - changes[a] * lines[a]).slice(0, 3)

  let deps = null
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'))
    deps = { runtime: Object.keys(pkg.dependencies || {}).length, dev: Object.keys(pkg.devDependencies || {}).length }
  } catch { /* not a Node project */ }

  const extra = {}
  for (const c of h.commands || []) {
    const r = spawnSync(c.cmd, { shell: true, cwd: projectDir, encoding: 'utf8', timeout: (c.timeoutSecs || 180) * 1000 })
    extra[c.name] = r.status === 0 ? (r.stdout.trim().split('\n').pop() || '') : `error (exit ${r.status ?? 'timeout'})`
  }

  return {
    commit: head.stdout.trim(),
    files: present.length,
    lines: present.reduce((s, f) => s + lines[f], 0),
    large: { over: limit, count: present.filter((f) => lines[f] > limit).length, top: bySize.slice(0, 3).map((f) => ({ file: f, lines: lines[f] })) },
    hotspots: { commits, median: touched.length ? touched[Math.floor(touched.length / 2)] : 0, top: hot.map((f) => ({ file: f, changes: changes[f], lines: lines[f] })) },
    deps,
    extra,
  }
}

export function healthText(s) {
  if (!s) return 'Code health            off (see "health" in config.json)'
  if (s.error) return `Code health            ${s.error}`
  const k = (x) => x.toLocaleString('en-US')
  // File names alone, unless two shown would read the same.
  const shown = [...s.large.top, ...s.hotspots.top].map((t) => t.file)
  const base = (f) => shown.some((g) => g !== f && path.basename(g) === path.basename(f)) ? f : path.basename(f)
  const out = [
    `Code health at ${s.commit} · ${k(s.files)} files · ${k(s.lines)} lines`,
    `Large files            ${s.large.count} over ${s.large.over} lines · largest ${s.large.top.map((t) => `${base(t.file)} ${k(t.lines)}`).join(', ') || '—'}`,
    `Hotspots               ${s.hotspots.top.map((t) => `${base(t.file)} ${t.changes}/${s.hotspots.commits} commits (${k(t.lines)} lines)`).join(' · ') || '—'} · median ${s.hotspots.median}`,
  ]
  if (s.deps) out.push(`Dependencies           ${s.deps.runtime} + ${s.deps.dev} dev`)
  for (const [name, v] of Object.entries(s.extra)) out.push(`${name.padEnd(22)} ${v}`)
  return out.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const snap = healthSnapshot(loadConfig())
  console.log(process.argv.includes('--json') ? JSON.stringify(snap, null, 2) : healthText(snap))
}

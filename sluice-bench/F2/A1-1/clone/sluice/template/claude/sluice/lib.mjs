// Shared helpers for the sluice's hooks and scripts (design doc §12).
// Transcript parsing lives only here: the format is internal to the harness and may change.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

// The scripts live in <project>/.claude/sluice/, so they find their config and the project from there.
export const sluiceDir = path.dirname(fileURLToPath(import.meta.url))
export const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(sluiceDir, '..', '..')
export const stateDir = path.join(projectDir, '.claude', 'state')

export function loadConfig() {
  const file = process.env.SLUICE_CONFIG || path.join(sluiceDir, 'config.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function progressDir(config) {
  return process.env.SLUICE_PROGRESS_DIR || path.join(projectDir, config.progressDir)
}

export async function readStdinJson() {
  if (process.stdin.isTTY) return {}
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  try { return raw.trim() ? JSON.parse(raw) : {} } catch { return {} }
}

export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }

export function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* skip a torn line */ }
  }
  return out
}

// The subagent's own transcript. The hook may hand us the parent session's path instead.
export function subagentTranscript(input) {
  const tp = input.transcript_path || ''
  if (tp.includes(`${path.sep}subagents${path.sep}`)) return tp
  if (!tp || !input.agent_id) return null
  const guess = path.join(path.dirname(tp), input.session_id || path.basename(tp, '.jsonl'),
    'subagents', `agent-${input.agent_id}.jsonl`)
  return fs.existsSync(guess) ? guess : null
}

// Every sluice launch message starts with: sluice: tranche=<t> item=<ID> role=<r> tier=<tier> round=<n>
// (`flow:` is the header from before the rename, still read so older transcripts count.)
export function sluiceHeader(entries) {
  for (const e of entries) {
    if (e.type !== 'user') continue
    const c = e.message?.content
    const text = typeof c === 'string' ? c
      : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : ''
    return parseHeader(text)
  }
  return null
}

// The header line in any text (a transcript's first message, or a launch prompt).
export function parseHeader(text = '') {
  const m = text.match(/^\s*(?:sluice|flow):\s*(.+)$/m)
  if (!m) return null
  const header = {}
  for (const pair of m[1].trim().split(/\s+/)) {
    const [k, v] = pair.split('=')
    if (k && v !== undefined) header[k] = v
  }
  return header
}

export function modelFamily(model = '') {
  for (const f of ['opus', 'sonnet', 'haiku', 'fable']) if (model.includes(f)) return f
  return 'unknown'
}

// Usage summed over unique API responses (a response can be logged more than once while streaming).
export function sumUsage(entries) {
  const byId = new Map()
  let first = null, last = null
  for (const e of entries) {
    if (e.timestamp) { const t = Date.parse(e.timestamp); first ??= t; last = t }
    if (e.type !== 'assistant') continue
    const m = e.message || {}
    if (!m.model || m.model === '<synthetic>' || !m.usage) continue
    const u = m.usage, cc = u.cache_creation || {}
    const rec = {
      model: m.model,
      in: u.input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheWrite5m: cc.ephemeral_5m_input_tokens ?? (cc.ephemeral_1h_input_tokens ? 0 : u.cache_creation_input_tokens || 0),
      cacheWrite1h: cc.ephemeral_1h_input_tokens || 0,
      out: u.output_tokens || 0,
    }
    const prev = byId.get(m.id)
    if (prev) for (const k of ['in', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h', 'out']) prev[k] = Math.max(prev[k], rec[k])
    else byId.set(m.id || Symbol(), rec)
  }
  const total = { calls: byId.size, in: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, out: 0, models: new Set() }
  for (const r of byId.values()) {
    total.models.add(r.model)
    for (const k of ['in', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h', 'out']) total[k] += r[k]
  }
  total.records = [...byId.values()]
  total.secs = first && last ? Math.round((last - first) / 1000) : 0
  return total
}

export function priceOf(records, prices) {
  let usd = 0
  for (const r of records) {
    const p = prices[modelFamily(r.model)]
    if (!p) continue
    usd += (r.in * p.in + r.cacheRead * p.cacheRead + r.cacheWrite5m * p.cacheWrite5m +
      r.cacheWrite1h * p.cacheWrite1h + r.out * p.out) / 1e6
  }
  return usd
}

// Where the harness keeps this project's session transcripts.
export function sessionsDir() {
  return path.join(os.homedir(), '.claude', 'projects', projectDir.replace(/[^A-Za-z0-9]/g, '-'))
}

// The gate and ledger hooks run side by side, so the gate patches its result into the agent's ledger
// line itself when it finishes (the ledger also reads the gate's state file, whichever lands first).
export function patchLedgerGate(config, tranche, agentId, gate) {
  if (!tranche || !agentId) return
  const file = path.join(progressDir(config), tranche, 'ledger.jsonl')
  const lines = readJsonl(file)
  const line = lines.find((l) => l.agent_id === agentId)
  if (!line) return
  line.gate = gate
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}

export function logError(name, err) {
  try {
    ensureDir(stateDir)
    fs.appendFileSync(path.join(stateDir, 'sluice-errors.log'), `${new Date().toISOString()} ${name}: ${err?.stack || err}\n`)
  } catch { /* never fail a hook over logging */ }
}

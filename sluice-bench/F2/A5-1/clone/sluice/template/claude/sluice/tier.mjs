#!/usr/bin/env node
// The builder's tier from the planner's risk score (design doc §7, skills/sluice/heuristics.md). The
// planner scores the five factors, which is judgment, and writes them in plan-<n>.json's `score`. This
// script does the arithmetic and the overrides, so the same scores always give the same tier.
//   node .claude/sluice/tier.mjs <plan json> [--write]
// Prints one line: `<tier> sum=<n>[ needs=<human|rescope>] (<reasons>)`. With --write it also puts
// score.sum and tier in the file, and needs when the file's needs is still empty (a planner's own
// needs, e.g. a rescope for an acceptance line that can't hold, is kept). Exits 1 if the score is
// missing or out of range.
import fs from 'node:fs'

const FACTORS = ['blast', 'verify', 'design', 'acceptance', 'track']

function tierFor(score) {
  const bad = FACTORS.filter((f) => ![0, 1, 2].includes(score?.[f]))
  if (bad.length) throw new Error(`score needs ${bad.join(', ')} as 0, 1 or 2`)
  const sum = FACTORS.reduce((a, f) => a + score[f], 0)
  let tier = sum <= 2 ? 'small' : sum <= 5 ? 'medium' : 'large'
  const why = [`sum ${sum}`]
  let needs = null
  // The overrides, in heuristics.md's order.
  if (score.design === 2) { needs = 'human'; why.push('design openness 2: settle the design in the packet and re-score, or ask the human') }
  else if (score.acceptance === 2) { needs = 'rescope'; why.push('acceptance clarity 2: re-scope') }
  if (score.blast === 2 && tier !== 'large') { tier = 'large'; why.push('blast radius 2: large') }
  if (tier === 'small' && score.verify !== 0) { tier = 'medium'; why.push('small needs a verifiability of 0: medium') }
  return { sum, tier, needs, why }
}

const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!file) { console.error('usage: node .claude/sluice/tier.mjs <plan json> [--write]'); process.exit(1) }
let plan, result
try { plan = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { console.error(`tier.mjs: can't read ${file}: ${e.message}`); process.exit(1) }
try { result = tierFor(plan.score) } catch (e) { console.error(`tier.mjs: ${file}: ${e.message}`); process.exit(1) }

if (process.argv.includes('--write')) {
  plan.score = { ...plan.score, sum: result.sum }
  plan.tier = result.tier
  if (result.needs && !plan.needs) plan.needs = result.needs
  fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n')
}
console.log(`${result.tier} sum=${result.sum}${result.needs ? ` needs=${result.needs}` : ''} (${result.why.join('; ')})`)

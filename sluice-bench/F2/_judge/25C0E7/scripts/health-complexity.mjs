// Complexity line for the sluice's code-health snapshot (.claude/sluice/health.mjs, health.commands): lints
// src/ with only the complexity and function-length rules on, and prints one line. Run with
//   node scripts/health-complexity.mjs
import path from 'node:path'
import { ESLint } from 'eslint'

const MAX_COMPLEXITY = 15
const MAX_LINES = 80

const eslint = new ESLint({
  overrideConfig: {
    rules: {
      complexity: ['warn', MAX_COMPLEXITY],
      'max-lines-per-function': ['warn', { max: MAX_LINES, skipBlankLines: true, skipComments: true }],
    },
  },
  ruleFilter: ({ ruleId }) => ruleId === 'complexity' || ruleId === 'max-lines-per-function',
})
const results = await eslint.lintFiles(['src'])

let complex = 0, long = 0, worst = { score: 0, where: '' }
for (const r of results) {
  for (const m of r.messages) {
    if (m.ruleId === 'max-lines-per-function') long++
    if (m.ruleId !== 'complexity') continue
    complex++
    const score = Number(m.message.match(/complexity of (\d+)/)?.[1] || 0)
    const name = m.message.match(/^(?:Async )?(?:[Mm]ethod|[Ff]unction|Arrow function) '([^']+)'/)?.[1] || `line ${m.line}`
    if (score > worst.score) worst = { score, where: `${path.basename(r.filePath)} ${name}` }
  }
}
console.log(`${complex} functions over ${MAX_COMPLEXITY} · worst ${worst.score} (${worst.where}) · ${long} over ${MAX_LINES} lines`)

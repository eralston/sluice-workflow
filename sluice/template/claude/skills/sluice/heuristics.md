# Choosing the tier, effort and limits (design doc §7)

## The risk score (the planner fills it in, in `plan-<n>.json`)

Score each factor 0, 1 or 2:

| Factor | 0 | 1 | 2 |
|---|---|---|---|
| Blast radius | Docs, copy, isolated UI | Shared code or behaviour inside the app | Persisted data, auth, security, network semantics, concurrency, shared-resource lifecycles |
| Verifiability | An automatic check fully decides correctness | Checks cover most of it | Needs judgment or a real environment |
| Design openness | Approach fully settled in the packet | Small choices left | Real alternatives remain |
| Acceptance clarity | Every line is an executable check | Some lines need a look | Mostly descriptive |
| Track record | This item class passed first time at this tier recently | Mixed, or no history | Failed first review at this tier recently |

Score only these five; don't add them up. A design openness of 2 means a real alternative is still open,
so settle the design in the packet first, and score 2 only if you can't settle it without the human.

**Tier:** write the scores in `plan-<n>.json`'s `score`, then run
`node .claude/sluice/tier.mjs <work folder>/plan-<n>.json --write`. It adds `score.sum` and `tier`, and sets
`needs` if it's still empty. The rules it applies: a sum of 0–2 is small, 3–5 medium and 6 or more large.
Then the overrides, in order: a design openness of 2 sets `needs: "human"`, an acceptance clarity of 2
sets `needs: "rescope"`, a blast radius of 2 is always large, and small needs a verifiability of 0.

**Track record:** read earlier blocks' summaries and run records in `<progressDir>/*/`. With no
history, score 1.

## Tiers today (design doc §14 holds the current mapping)

| Tier | Agent | Model alias |
|---|---|---|
| Large | `builder` launched with `model: "opus"` | opus |
| Medium | `builder` (default) | sonnet |
| Small | `clerk` | haiku |

## Effort and limits (set in each role file)

| Role | Effort | Turns cap | Cache |
|---|---|---|---|
| planner, reviewer, auditor | high | 60–120 | short |
| builder | medium | 200 | long (it waits on test runs) |
| fixer | medium | 120 | short |
| clerk | low | 80 | short |

The block summary records what was used. Change these defaults only on measurement (design doc §10, §15).

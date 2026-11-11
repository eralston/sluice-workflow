# v0.4 · Effort

[Now](now.md) · [Board](board.md) · [Pipeline](pipeline.md) · [Timeline](timeline.md) · **Effort**  
<sub>Frozen at Nov 2, 2026 08:02</sub>

**$4.42** API-equivalent · 1 h 31 min of agent time · 9 agent runs · $2.21 per accepted item <sub>(agents only; the orchestrator is in the block table)</sub>

```mermaid
---
config:
  themeVariables:
    xyChart:
      plotColorPalette: '#8da2c8, #c9a64a'
---
xychart-beta
  title "Cost per item, $"
  x-axis ["A1", "A2"]
  y-axis "$"
  bar [3.21, 0.55]
```

```mermaid
---
config:
  themeVariables:
    xyChart:
      plotColorPalette: '#8da2c8, #c9a64a'
---
xychart-beta
  title "Spend per day, and in all, $"
  x-axis ["Nov 2"]
  y-axis "$"
  bar [4.42]
  line [4.42]
```

**Where the spend went:** model → role → block

```mermaid
sankey-beta

opus,planner,0.79
planner,Block A,0.79
sonnet,builder,1.1
builder,Block A,1.1
opus,reviewer,1.45
reviewer,Block A,1.45
sonnet,fixer,0.41
fixer,Block A,0.41
haiku,clerk,0.01
clerk,Block A,0.01
opus,auditor,0.66
auditor,Block A,0.66
```

```mermaid
---
config:
  themeVariables:
    pie1: '#8da2c8'
    pie2: '#c9a64a'
    pie3: '#a7b8a0'
    pie4: '#c7a6a0'
    pie5: '#b5afc9'
    pie6: '#d8d2c4'
---
pie showData
  title Agent time by role, minutes
  "planner" : 10
  "builder" : 34
  "reviewer" : 22
  "fixer" : 12
  "clerk" : 5
  "auditor" : 9
```

| Block | Items | Accepted | Runs | Agent time | Cost | Per item | First pass | Fix rounds |
|---|---|---|---|---|---|---|---|---|
| **A** | 2 | 2 | 9 | 1 h 31 min | $4.42 | $2.21 | 1/2 | 1 |
| **B** | 1 | 0 | 0 | – | – | – | – | 0 |

**Closed blocks** (the scoreboard: agents and the orchestrator)

| Block | Items | Windows | Cost | Orchestrator | First pass | Fix rounds | Findings |
|---|---|---|---|---|---|---|---|
| [A](../../block-A.md) | 2 | 0.16 | $4.42 | – | 1/2 | 0.5 mean | 1 major · 1 minor · 2 nit |

<sub>Costs are API-equivalent list prices from the ledger, not a bill.</sub>

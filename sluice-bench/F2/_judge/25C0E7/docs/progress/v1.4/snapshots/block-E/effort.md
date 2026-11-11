# v1.4 · Effort

[Now](now.md) · [Board](board.md) · [Pipeline](pipeline.md) · [Timeline](timeline.md) · **Effort**  
<sub>Frozen at Nov 6, 2026 19:39</sub>

**$149.08** API-equivalent · 27 h 53 min of agent time · 115 agent runs · $5.96 per accepted item <sub>(agents only; the orchestrator is in the block table)</sub>

```mermaid
---
config:
  themeVariables:
    xyChart:
      plotColorPalette: '#8da2c8, #c9a64a'
---
xychart-beta
  title "Cost per item, $"
  x-axis ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2", "D3", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10"]
  y-axis "$"
  bar [0.51, 0.83, 0.51, 0.79, 5.93, 3.34, 5.42, 4.39, 1.29, 2.22, 5.1, 3.3, 1.61, 1.52, 1.62, 6.1, 4.77, 3.96, 14.51, 24.34, 20.95, 5.5, 5.78, 5.59, 5.77]
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
  x-axis ["Oct 29", "Oct 31", "Nov 1", "Nov 2", "Nov 6"]
  y-axis "$"
  bar [2.13, 27.61, 74.13, 21.5, 23.71]
  line [2.13, 29.74, 103.87, 125.37, 149.08]
```

**Where the spend went:** model → role → block

```mermaid
sankey-beta

sonnet,planner,5.81
planner,Block A,0.48
haiku,clerk,0.08
clerk,Block A,0.06
sonnet,builder,25.91
builder,Block A,1.08
sonnet,reviewer,2.99
reviewer,Block A,0.5
haiku,fixer,0.01
fixer,Block A,0.01
opus,planner,46.01
planner,Block B,8.84
builder,Block B,5.01
opus,reviewer,38.33
reviewer,Block B,4.77
sonnet,fixer,5.54
fixer,Block B,1.04
planner,Block C,3.27
builder,Block C,4.18
reviewer,Block C,3.48
clerk,Block C,0.02
opus,auditor,9.96
auditor,Block AB,2.13
fixer,Block C,1.23
fixer,Block AB,0.59
auditor,Block C,2.39
planner,Block D,2.07
builder,Block D,2.2
reviewer,Block D,0.49
auditor,Block D,1.15
fixer,Block D,0.26
planner,Block E,37.18
builder,Block E,25.61
reviewer,Block E,32.07
fixer,Block E,4.7
opus,builder,12.17
auditor,Block E,4.29
opus,fixer,2.28
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
  "planner" : 200
  "clerk" : 26
  "builder" : 812
  "reviewer" : 423
  "fixer" : 178
  "auditor" : 34
```

| Block | Items | Accepted | Runs | Agent time | Cost | Per item | First pass | Fix rounds |
|---|---|---|---|---|---|---|---|---|
| **A** | 4 | 4 | 10 | 1 h 47 min | $2.13 | $0.53 | 2/4 | 1 |
| **B** | 4 | 4 | 15 | 6 h 21 min | $19.65 | $4.91 | 3/4 | 1 |
| **C** | 4 | 4 | 23 | 3 h 08 min | $14.58 | $3.64 | 2/4 | 3 |
| **D** | 3 | 3 | 11 | 1 h 48 min | $6.16 | $2.05 | 3/3 | 0 |
| **E** | 10 | 10 | 53 | 14 h 27 min | $103.84 | $10.38 | 8/10 | 6 |
| **F** | 4 | 0 | 0 | – | – | – | – | 0 |
| **AB** | 0 | 0 | 3 | 23 min | $2.72 | – | – | 0 |

**Closed blocks** (the scoreboard: agents and the orchestrator)

| Block | Items | Windows | Cost | Orchestrator | First pass | Fix rounds | Findings |
|---|---|---|---|---|---|---|---|
| [A](../../block-A.md) | 3 | 0.22 | $5.85 | $3.72 (64%) | 2/3 | 0.33 mean | 1 major · 1 minor · 1 nit |
| [B](../../block-B.md) | 5 | 0.95 | $25.52 | $5.87 (23%) | 3/4 | 0.4 mean | 1 major · 4 minor · 8 nit |
| [C](../../block-C.md) | 8 | 1.17 | $31.70 | $17.12 (54%) | 4/6 | 0.5 mean | 1 blocker · 2 major · 6 minor · 13 nit |
| [D](../../block-D.md) | 4 | 0.3 | $8.04 | $1.53 (19%) | 3/3 | 0.25 mean | 2 minor · 1 nit |
| [E](../../block-E.md) | 21 | 3.98 | $107.35 | $3.51 (3%) | 13/16 | 0.33 mean | 1000 blocker · 2000 major · 21No test covers 'none is empty' after lo. Mutating maneuvers.ts:465 to step over a beat that drafts nothing still passes sweep.test.ts (26/26). A hand-built case such as [creations(2), [[]], creations(2)] -> null would pin it.002 minor · 25241 nit |

<sub>Costs are API-equivalent list prices from the ledger, not a bill.</sub>

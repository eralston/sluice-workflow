# v1.4 · Pipeline

[Now](now.md) · [Board](board.md) · **Pipeline** · [Timeline](timeline.md) · [Effort](effort.md)  
<sub>Frozen at Nov 6, 2026 19:39</sub>

```mermaid
flowchart LR
  scope["Scope doc<br/>4 open"]
  planner["Planner"]
  risk{"Risk"}
  builderL["Builder · large"]
  builderM["Builder · medium"]
  clerk["Clerk · small"]
  gate{{"Gate<br/>blocked ×7"}}
  reviewer["Reviewer"]
  fixer["Fixer"]
  commit["Accepted · 25"]
  auditor["Block audit"]
  scope -->|×24| planner
  planner --> risk
  risk -->|×5| builderL
  risk -->|×26| builderM
  risk -->|×2| clerk
  builderL --> gate
  builderM --> gate
  clerk --> gate
  gate -->|×38| reviewer
  reviewer -->|fix needed ×8| fixer
  fixer -->|×16| gate
  reviewer -->|pass ×30| commit
  commit -->|×4| auditor
  auditor -->|fixes ×2| fixer
  classDef live stroke:#d4a017,stroke-width:3px
  classDef wait stroke-dasharray:5 4
```

<sub>Edges count agent runs this tranche (dotted: not taken yet) · ● running · ○ waiting there</sub>

**Journeys**

- [**block-E**](../../work/block-E) auditor ✗ → fixer → accepted <sub>· $6.57 · 31 min</sub>
- [**E10**](../../work/E10/packet.md) planner → builder → reviewer ✓ → accepted <sub>· $5.77 · 55 min</sub>
- [**E9**](../../work/E9/packet.md) planner → builder → fixer → reviewer ✓ → accepted <sub>· $5.59 · 1 h 17 min</sub>
- [**E8**](../../work/E8/packet.md) planner → builder → reviewer ✓ → accepted <sub>· $5.78 · 41 min</sub>
- [**E7**](../../work/E7/packet.md) planner → builder → reviewer ✓ → fixer → builder → reviewer ✓ → accepted <sub>· $5.50 · 1 h 34 min</sub>
- [**E6**](../../work/E6/packet.md) planner → builder → reviewer ✓ → builder → reviewer ✓ → accepted <sub>· $20.95 · 2 h 23 min</sub>
- [**E5**](../../work/E5/packet.md) planner → builder → reviewer ✗ → fixer → reviewer r2 ✓ → builder → reviewer ✓ → builder → reviewer ✗ → fixer → reviewer r2 ✓ → accepted <sub>· $24.34 · 3 h 36 min</sub>
- [**E4**](../../work/E4/packet.md) planner → builder → reviewer ✓ → builder → reviewer ✓ → builder → reviewer ✓ → accepted <sub>· $14.51 · 1 h 36 min</sub>
- [**E3**](../../work/E3/packet.md) planner → builder → reviewer ✓ → accepted <sub>· $3.96 · 22 min</sub>
- [**E2**](../../work/E2/packet.md) planner → builder → fixer ✗ → reviewer ✓ → accepted <sub>· $4.77 · 1 h 00 min</sub>
- [**E1**](../../work/E1/packet.md) planner → builder → reviewer ✗ → fixer → reviewer r2 ✓ → accepted <sub>· $6.10 · 31 min</sub>
- [**block-D**](../../work/block-D) auditor ✓ → fixer → accepted <sub>· $1.41 · 6 min</sub>

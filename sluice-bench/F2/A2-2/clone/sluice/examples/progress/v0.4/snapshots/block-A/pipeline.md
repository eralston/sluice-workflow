# v0.4 · Pipeline

[Now](now.md) · [Board](board.md) · **Pipeline** · [Timeline](timeline.md) · [Effort](effort.md)  
<sub>Frozen at Nov 2, 2026 08:02</sub>

```mermaid
flowchart LR
  scope["Scope doc<br/>1 open"]
  planner["Planner"]
  risk{"Risk"}
  builderL["Builder · large"]
  builderM["Builder · medium"]
  clerk["Clerk · small"]
  gate{{"Gate<br/>blocked ×1"}}
  reviewer["Reviewer"]
  fixer["Fixer"]
  commit["Accepted · 2"]
  auditor["Block audit"]
  scope -->|×2| planner
  planner --> risk
  risk -.-> builderL
  risk -->|×1| builderM
  risk -->|×1| clerk
  builderL --> gate
  builderM --> gate
  clerk --> gate
  gate -->|×3| reviewer
  reviewer -->|fix needed ×1| fixer
  fixer -->|×1| gate
  reviewer -->|pass ×2| commit
  commit -->|×1| auditor
  auditor -.-> fixer
  classDef live stroke:#d4a017,stroke-width:3px
  classDef wait stroke-dasharray:5 4
```

<sub>Edges count agent runs this tranche (dotted: not taken yet) · ● running · ○ waiting there</sub>

**Journeys**

- **block-A** auditor → accepted <sub>· $0.66 · 9 min</sub>
- [**A2**](../../../../scope-v0.4.md#a2-ingestion-doc-the-retry-rules) planner → clerk → reviewer ✓ → accepted <sub>· $0.55 · 14 min</sub>
- [**A1**](../../work/A1/packet.md) planner → builder → reviewer ✗ → fixer → reviewer r2 ✓ → accepted <sub>· $3.21 · 1 h 08 min</sub>

# v1.4 · Pipeline

[Now](now.md) · [Board](board.md) · **Pipeline** · [Timeline](timeline.md) · [Effort](effort.md)  
<sub>Frozen at Nov 1, 2026 12:27</sub>

```mermaid
flowchart LR
  scope["Scope doc<br/>9 open"]
  planner["Planner"]
  risk{"Risk"}
  builderL["Builder · large"]
  builderM["Builder · medium"]
  clerk["Clerk · small"]
  gate{{"Gate<br/>blocked ×4"}}
  reviewer["Reviewer"]
  fixer["Fixer"]
  commit["Accepted · 15"]
  auditor["Block audit"]
  scope -->|×14| planner
  planner --> risk
  risk -.-> builderL
  risk -->|×15| builderM
  risk -->|×2| clerk
  builderL --> gate
  builderM --> gate
  clerk --> gate
  gate -->|×19| reviewer
  reviewer -->|fix needed ×5| fixer
  fixer -->|×9| gate
  reviewer -->|pass ×14| commit
  commit -->|×3| auditor
  auditor -->|fixes ×1| fixer
  classDef live stroke:#d4a017,stroke-width:3px
  classDef wait stroke-dasharray:5 4
```

<sub>Edges count agent runs this tranche (dotted: not taken yet) · ● running · ○ waiting there</sub>

**Journeys**

- [**block-D**](../../work/block-D) auditor ✓ → fixer → accepted <sub>· $1.41 · 6 min</sub>
- [**D3**](../../work/D3/packet.md) planner → builder → reviewer ✓ → accepted <sub>· $1.62 · 23 min</sub>
- [**D2**](../../work/D2/packet.md) planner → reviewer ✓ → builder → accepted <sub>· $1.52 · 46 min</sub>
- [**D1**](../../work/D1/packet.md) planner → builder → reviewer ✓ → accepted <sub>· $1.61 · 33 min</sub>
- [**block-AB**](../../work/block-AB) auditor ✗ → fixer → fixer r2 → accepted <sub>· $2.72 · 23 min</sub>
- [**block-C**](../../work/block-C) auditor ✓ → fixer → accepted <sub>· $2.67 · 9 min</sub>
- [**C3**](../../work/C3/packet.md) planner → builder → reviewer ✗ → fixer → reviewer r2 ✗ → fixer r2 → reviewer r3 ✓ → accepted <sub>· $5.10 · 1 h 24 min</sub>
- [**C4**](../../work/C4/packet.md) planner → builder → reviewer ✓ → builder → reviewer ✓ → builder → reviewer ✓ → accepted <sub>· $3.30 · 1 h 06 min</sub>
- [**block-B**](../../work/block-B) fixer → accepted <sub>· $0.57 · 29 min</sub>
- [**C2**](../../work/C2/packet.md) planner → builder → reviewer ✓ → clerk → accepted <sub>· $2.22 · 18 min</sub>
- [**B4**](../../work/B4/packet.md) planner → builder → reviewer ✓ → accepted <sub>· $4.39 · 42 min</sub>
- [**C1**](../../work/C1/packet.md) planner → builder → reviewer ✗ → accepted <sub>· $1.29 · 11 min</sub>

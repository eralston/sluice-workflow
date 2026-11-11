# F2 · change health by strategy

<sub>Built 2026-11-11 18:46 UTC by `bench/health-table.mjs` from each run's `health.json` (`bench/health.mjs`). Recorded, not scored (doc 30 §6). The **Real F2** column is the accepted, signed-off commit (4f6990a), as a reference. Runtime is noisy on one machine: context only.</sub>

Measured against the start commit (61e4958), with process records left out (work folders, run records, `.claude/`, `sluice/`, the scope doc), as the judge saw it. Complexity is ESLint's cyclomatic score summed over every function in the touched src files. Coverage is v8 line and branch coverage of those files under the unit suite.

**Per-run reports** (effort and timeline): [A1-1](reports/F2-A1-1.md) · [A1-2](reports/F2-A1-2.md) · [A2-1](reports/F2-A2-1.md) · [A2-2](reports/F2-A2-2.md) · [A3-1](reports/F2-A3-1.md) · [A3-2](reports/F2-A3-2.md) · [A4-1](reports/F2-A4-1.md) · [A4-2](reports/F2-A4-2.md) · [A5-1](reports/F2-A5-1.md)

## A1 · F's sluice

| Metric | Run 1 | Run 2 | Real F2 |
|---|---|---|---|
| Cost (list-price $) | $6.88 | $8.36 | $10.13 |
| Time to the commit | 85 min | 94 min | 64 min |
| Gates (typecheck, lint, unit) | fail (lint) | fail (lint) | pass |
| **Size** |  |  |  |
| Lines added / removed | +402 / −82 | +413 / −81 | +372 / −72 |
| src lines + / − | +130 / −44 | +135 / −38 | +130 / −33 |
| tests lines + | +214 | +207 | +179 |
| scripts · docs lines + | +47 · +11 | +50 · +21 | +44 · +19 |
| Files touched (new) | 19 (1) | 22 (0) | 19 (0) |
| src files outside the scope's Touches | 3 | 4 | 3 |
| **Tests** |  |  |  |
| Unit + golden tests added / removed | +7 / −0 | +7 / −1 | +10 / −0 |
| e2e tests added / removed | +1 / −0 | +1 / −0 | +0 / −0 |
| Assertions added (`expect(`) | 47 | 49 | 40 |
| Test lines per src line | 1.65 | 1.53 | 1.38 |
| Goldens moved | 1 | 1 | 1 |
| **Complexity** (touched src files) |  |  |  |
| Cyclomatic complexity added (Σ) | +36 (1798 → 1834) | +43 (2023 → 2066) | +40 (1798 → 1838) |
| Functions added | +4 | +9 | +7 |
| New functions over 15 | 2 | 0 | 1 |
| New functions over 80 lines | 0 | 0 | 0 |
| Files crossing 800 lines | 0 | 0 | 0 |
| Worst function now | 59 (interpreter.ts play) | 59 (interpreter.ts play) | 59 (interpreter.ts play) |
| **Hygiene and coupling** |  |  |  |
| `any` · `as unknown as` added | 0 · 2 | 0 · 0 | 0 · 1 |
| @ts-ignore / -expect-error · eslint-disable added | 0 · 0 | 0 · 0 | 0 · 0 |
| Lint errors · warnings (src, tests, scripts) | 0 · 0 | 0 · 0 | 0 · 0 |
| Imports · exports added (src, scripts) | 7 · 4 | 9 · 5 | 9 · 4 |
| Normative docs touched | 05, 13, 15 | 03, 05, 13, 15 | 03, 05, 13, 15 |
| **Coverage** (v8, unit suite) |  |  |  |
| Touched src files: lines · branches | 74.61% · 62.46% | 63.41% · 55.26% | 74.57% · 62.26% |
| Same files, start → now (lines) | 73.3% → 74.6% | 62.7% → 63.4% | 73.3% → 74.6% |
| **Runtime** (context only) |  |  |  |
| Unit suite (s) · bundle (KB) | 92.7 · 6608 | 90.5 · 6604 | 90 · 6608 |

## A2 · One conversation

| Metric | Run 1 | Run 2 | Real F2 |
|---|---|---|---|
| Cost (list-price $) | $10.46 | $10.59 | $10.13 |
| Time to the commit | 56 min | 64 min | 64 min |
| Gates (typecheck, lint, unit) | pass | pass | pass |
| **Size** |  |  |  |
| Lines added / removed | +453 / −108 | +397 / −105 | +372 / −72 |
| src lines + / − | +247 / −57 | +197 / −65 | +130 / −33 |
| tests lines + | +131 | +142 | +179 |
| scripts · docs lines + | +57 · +18 | +47 · +11 | +44 · +19 |
| Files touched (new) | 21 (0) | 18 (0) | 19 (0) |
| src files outside the scope's Touches | 4 | 5 | 3 |
| **Tests** |  |  |  |
| Unit + golden tests added / removed | +4 / −0 | +5 / −0 | +10 / −0 |
| e2e tests added / removed | +0 / −0 | +0 / −0 | +0 / −0 |
| Assertions added (`expect(`) | 41 | 36 | 40 |
| Test lines per src line | 0.53 | 0.72 | 1.38 |
| Goldens moved | 1 | 1 | 1 |
| **Complexity** (touched src files) |  |  |  |
| Cyclomatic complexity added (Σ) | +76 (1962 → 2038) | +55 (2547 → 2602) | +40 (1798 → 1838) |
| Functions added | +17 | +13 | +7 |
| New functions over 15 | 1 | 1 | 1 |
| New functions over 80 lines | 0 | 0 | 0 |
| Files crossing 800 lines | 0 | 0 | 0 |
| Worst function now | 59 (interpreter.ts play) | 275 (labels.ts position) | 59 (interpreter.ts play) |
| **Hygiene and coupling** |  |  |  |
| `any` · `as unknown as` added | 0 · 1 | 0 · 0 | 0 · 1 |
| @ts-ignore / -expect-error · eslint-disable added | 0 · 0 | 0 · 0 | 0 · 0 |
| Lint errors · warnings (src, tests, scripts) | 0 · 0 | 0 · 0 | 0 · 0 |
| Imports · exports added (src, scripts) | 12 · 10 | 7 · 7 | 9 · 4 |
| Normative docs touched | 03, 05, 13, 15 | 05, 13, 15 | 03, 05, 13, 15 |
| **Coverage** (v8, unit suite) |  |  |  |
| Touched src files: lines · branches | 65.09% · 57.54% | 53.74% · 47.65% | 74.57% · 62.26% |
| Same files, start → now (lines) | 68% → 65.1% | 53.5% → 53.7% | 73.3% → 74.6% |
| **Runtime** (context only) |  |  |  |
| Unit suite (s) · bundle (KB) | 95.5 · 6608 | 101.9 · 6608 | 90 · 6608 |

## A3 · Ultracode workflow

| Metric | Run 1 | Run 2 | Real F2 |
|---|---|---|---|
| Cost (list-price $) | $8.97 | $8.25 | $10.13 |
| Time to the commit | 98 min | 93 min | 64 min |
| Gates (typecheck, lint, unit) | pass | pass | pass |
| **Size** |  |  |  |
| Lines added / removed | +203 / −90 | +416 / −92 | +372 / −72 |
| src lines + / − | +93 / −48 | +128 / −45 | +130 / −33 |
| tests lines + | +66 | +235 | +179 |
| scripts · docs lines + | +34 · +10 | +33 · +20 | +44 · +19 |
| Files touched (new) | 20 (0) | 24 (1) | 19 (0) |
| src files outside the scope's Touches | 5 | 8 | 3 |
| **Tests** |  |  |  |
| Unit + golden tests added / removed | +3 / −1 | +7 / −0 | +10 / −0 |
| e2e tests added / removed | +0 / −0 | +0 / −0 | +0 / −0 |
| Assertions added (`expect(`) | 25 | 50 | 40 |
| Test lines per src line | 0.71 | 1.84 | 1.38 |
| Goldens moved | 1 | 1 | 1 |
| **Complexity** (touched src files) |  |  |  |
| Cyclomatic complexity added (Σ) | +22 (1962 → 1984) | +42 (2818 → 2860) | +40 (1798 → 1838) |
| Functions added | +6 | +5 | +7 |
| New functions over 15 | 0 | 2 | 1 |
| New functions over 80 lines | 0 | 0 | 0 |
| Files crossing 800 lines | 0 | 0 | 0 |
| Worst function now | 59 (interpreter.ts play) | 275 (labels.ts position) | 59 (interpreter.ts play) |
| **Hygiene and coupling** |  |  |  |
| `any` · `as unknown as` added | 0 · 2 | 0 · 1 | 0 · 1 |
| @ts-ignore / -expect-error · eslint-disable added | 0 · 0 | 0 · 0 | 0 · 0 |
| Lint errors · warnings (src, tests, scripts) | 0 · 0 | 0 · 0 | 0 · 0 |
| Imports · exports added (src, scripts) | 7 · 3 | 4 · 3 | 9 · 4 |
| Normative docs touched | 05, 13, 15 | 03, 05, 13, 15 | 03, 05, 13, 15 |
| **Coverage** (v8, unit suite) |  |  |  |
| Touched src files: lines · branches | 67.85% · 59.22% | 48.64% · 44.46% | 74.57% · 62.26% |
| Same files, start → now (lines) | 68% → 67.9% | 47.3% → 48.6% | 73.3% → 74.6% |
| **Runtime** (context only) |  |  |  |
| Unit suite (s) · bundle (KB) | 98.8 · 6604 | 89.6 · 6608 | 90 · 6608 |

## A4 · Tests first, then hill-climb

| Metric | Run 1 | Run 2 | Real F2 |
|---|---|---|---|
| Cost (list-price $) | $7.39 | $8.06 | $10.13 |
| Time to the commit | 107 min | 140 min | 64 min |
| Gates (typecheck, lint, unit) | pass | pass | pass |
| **Size** |  |  |  |
| Lines added / removed | +588 / −71 | +825 / −67 | +372 / −72 |
| src lines + / − | +114 / −34 | +173 / −36 | +130 / −33 |
| tests lines + | +411 | +593 | +179 |
| scripts · docs lines + | +51 · +12 | +48 · +11 | +44 · +19 |
| Files touched (new) | 19 (2) | 22 (3) | 19 (0) |
| src files outside the scope's Touches | 4 | 7 | 3 |
| **Tests** |  |  |  |
| Unit + golden tests added / removed | +10 / −0 | +16 / −0 | +10 / −0 |
| e2e tests added / removed | +1 / −0 | +3 / −0 | +0 / −0 |
| Assertions added (`expect(`) | 55 | 71 | 40 |
| Test lines per src line | 3.61 | 3.43 | 1.38 |
| Goldens moved | 1 | 1 | 1 |
| **Complexity** (touched src files) |  |  |  |
| Cyclomatic complexity added (Σ) | +43 (2023 → 2066) | +61 (2772 → 2833) | +40 (1798 → 1838) |
| Functions added | +7 | +9 | +7 |
| New functions over 15 | 0 | 3 | 1 |
| New functions over 80 lines | 0 | 0 | 0 |
| Files crossing 800 lines | 0 | 0 | 0 |
| Worst function now | 61 (interpreter.ts play) | 276 (labels.ts position) | 59 (interpreter.ts play) |
| **Hygiene and coupling** |  |  |  |
| `any` · `as unknown as` added | 0 · 1 | 2 · 0 | 0 · 1 |
| @ts-ignore / -expect-error · eslint-disable added | 0 · 0 | 0 · 0 | 0 · 0 |
| Lint errors · warnings (src, tests, scripts) | 0 · 0 | 0 · 0 | 0 · 0 |
| Imports · exports added (src, scripts) | 4 · 3 | 5 · 4 | 9 · 4 |
| Normative docs touched | 05, 13, 15 | 03, 05, 13, 15 | 03, 05, 13, 15 |
| **Coverage** (v8, unit suite) |  |  |  |
| Touched src files: lines · branches | 64.56% · 58.08% | 49.8% · 44.53% | 74.57% · 62.26% |
| Same files, start → now (lines) | 62.7% → 64.6% | 48.2% → 49.8% | 73.3% → 74.6% |
| **Runtime** (context only) |  |  |  |
| Unit suite (s) · bundle (KB) | 89.7 · 6608 | 92.7 · 6608 | 90 · 6608 |

## A5 · Today's sluice

| Metric | Run 1 | Real F2 |
|---|---|---|
| Cost (list-price $) | $8.86 | $10.13 |
| Time to the commit | 97 min | 64 min |
| Gates (typecheck, lint, unit) | pass | pass |
| **Size** |  |  |
| Lines added / removed | +423 / −81 | +372 / −72 |
| src lines + / − | +160 / −45 | +130 / −33 |
| tests lines + | +199 | +179 |
| scripts · docs lines + | +49 · +15 | +44 · +19 |
| Files touched (new) | 22 (0) | 19 (0) |
| src files outside the scope's Touches | 4 | 3 |
| **Tests** |  |  |
| Unit + golden tests added / removed | +5 / −0 | +10 / −0 |
| e2e tests added / removed | +1 / −0 | +0 / −0 |
| Assertions added (`expect(`) | 47 | 40 |
| Test lines per src line | 1.24 | 1.38 |
| Goldens moved | 1 | 1 |
| **Complexity** (touched src files) |  |  |
| Cyclomatic complexity added (Σ) | +49 (1798 → 1847) | +40 (1798 → 1838) |
| Functions added | +11 | +7 |
| New functions over 15 | 1 | 1 |
| New functions over 80 lines | 0 | 0 |
| Files crossing 800 lines | 0 | 0 |
| Worst function now | 59 (interpreter.ts play) | 59 (interpreter.ts play) |
| **Hygiene and coupling** |  |  |
| `any` · `as unknown as` added | 0 · 2 | 0 · 1 |
| @ts-ignore / -expect-error · eslint-disable added | 0 · 0 | 0 · 0 |
| Lint errors · warnings (src, tests, scripts) | 0 · 0 | 0 · 0 |
| Imports · exports added (src, scripts) | 8 · 4 | 9 · 4 |
| Normative docs touched | 03, 05, 13, 15 | 03, 05, 13, 15 |
| **Coverage** (v8, unit suite) |  |  |
| Touched src files: lines · branches | 75.04% · 63.18% | 74.57% · 62.26% |
| Same files, start → now (lines) | 73.3% → 75% | 73.3% → 74.6% |
| **Runtime** (context only) |  |  |
| Unit suite (s) · bundle (KB) | 90.9 · 6608 | 90 · 6608 |

## Every run

| Metric | A1-1 | A1-2 | A2-1 | A2-2 | A3-1 | A3-2 | A4-1 | A4-2 | A5-1 | Real F2 |
|---|---|---|---|---|---|---|---|---|---|---|
| Cost (list-price $) | $6.88 | $8.36 | $10.46 | $10.59 | $8.97 | $8.25 | $7.39 | $8.06 | $8.86 | $10.13 |
| Time to the commit | 85 min | 94 min | 56 min | 64 min | 98 min | 93 min | 107 min | 140 min | 97 min | 64 min |
| Gates (typecheck, lint, unit) | fail (lint) | fail (lint) | pass | pass | pass | pass | pass | pass | pass | pass |
| **Size** |  |  |  |  |  |  |  |  |  |  |
| Lines added / removed | +402 / −82 | +413 / −81 | +453 / −108 | +397 / −105 | +203 / −90 | +416 / −92 | +588 / −71 | +825 / −67 | +423 / −81 | +372 / −72 |
| src lines + / − | +130 / −44 | +135 / −38 | +247 / −57 | +197 / −65 | +93 / −48 | +128 / −45 | +114 / −34 | +173 / −36 | +160 / −45 | +130 / −33 |
| tests lines + | +214 | +207 | +131 | +142 | +66 | +235 | +411 | +593 | +199 | +179 |
| scripts · docs lines + | +47 · +11 | +50 · +21 | +57 · +18 | +47 · +11 | +34 · +10 | +33 · +20 | +51 · +12 | +48 · +11 | +49 · +15 | +44 · +19 |
| Files touched (new) | 19 (1) | 22 (0) | 21 (0) | 18 (0) | 20 (0) | 24 (1) | 19 (2) | 22 (3) | 22 (0) | 19 (0) |
| src files outside the scope's Touches | 3 | 4 | 4 | 5 | 5 | 8 | 4 | 7 | 4 | 3 |
| **Tests** |  |  |  |  |  |  |  |  |  |  |
| Unit + golden tests added / removed | +7 / −0 | +7 / −1 | +4 / −0 | +5 / −0 | +3 / −1 | +7 / −0 | +10 / −0 | +16 / −0 | +5 / −0 | +10 / −0 |
| e2e tests added / removed | +1 / −0 | +1 / −0 | +0 / −0 | +0 / −0 | +0 / −0 | +0 / −0 | +1 / −0 | +3 / −0 | +1 / −0 | +0 / −0 |
| Assertions added (`expect(`) | 47 | 49 | 41 | 36 | 25 | 50 | 55 | 71 | 47 | 40 |
| Test lines per src line | 1.65 | 1.53 | 0.53 | 0.72 | 0.71 | 1.84 | 3.61 | 3.43 | 1.24 | 1.38 |
| Goldens moved | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **Complexity** (touched src files) |  |  |  |  |  |  |  |  |  |  |
| Cyclomatic complexity added (Σ) | +36 (1798 → 1834) | +43 (2023 → 2066) | +76 (1962 → 2038) | +55 (2547 → 2602) | +22 (1962 → 1984) | +42 (2818 → 2860) | +43 (2023 → 2066) | +61 (2772 → 2833) | +49 (1798 → 1847) | +40 (1798 → 1838) |
| Functions added | +4 | +9 | +17 | +13 | +6 | +5 | +7 | +9 | +11 | +7 |
| New functions over 15 | 2 | 0 | 1 | 1 | 0 | 2 | 0 | 3 | 1 | 1 |
| New functions over 80 lines | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Files crossing 800 lines | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Worst function now | 59 (interpreter.ts play) | 59 (interpreter.ts play) | 59 (interpreter.ts play) | 275 (labels.ts position) | 59 (interpreter.ts play) | 275 (labels.ts position) | 61 (interpreter.ts play) | 276 (labels.ts position) | 59 (interpreter.ts play) | 59 (interpreter.ts play) |
| **Hygiene and coupling** |  |  |  |  |  |  |  |  |  |  |
| `any` · `as unknown as` added | 0 · 2 | 0 · 0 | 0 · 1 | 0 · 0 | 0 · 2 | 0 · 1 | 0 · 1 | 2 · 0 | 0 · 2 | 0 · 1 |
| @ts-ignore / -expect-error · eslint-disable added | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |
| Lint errors · warnings (src, tests, scripts) | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |
| Imports · exports added (src, scripts) | 7 · 4 | 9 · 5 | 12 · 10 | 7 · 7 | 7 · 3 | 4 · 3 | 4 · 3 | 5 · 4 | 8 · 4 | 9 · 4 |
| Normative docs touched | 05, 13, 15 | 03, 05, 13, 15 | 03, 05, 13, 15 | 05, 13, 15 | 05, 13, 15 | 03, 05, 13, 15 | 05, 13, 15 | 03, 05, 13, 15 | 03, 05, 13, 15 | 03, 05, 13, 15 |
| **Coverage** (v8, unit suite) |  |  |  |  |  |  |  |  |  |  |
| Touched src files: lines · branches | 74.61% · 62.46% | 63.41% · 55.26% | 65.09% · 57.54% | 53.74% · 47.65% | 67.85% · 59.22% | 48.64% · 44.46% | 64.56% · 58.08% | 49.8% · 44.53% | 75.04% · 63.18% | 74.57% · 62.26% |
| Same files, start → now (lines) | 73.3% → 74.6% | 62.7% → 63.4% | 68% → 65.1% | 53.5% → 53.7% | 68% → 67.9% | 47.3% → 48.6% | 62.7% → 64.6% | 48.2% → 49.8% | 73.3% → 75% | 73.3% → 74.6% |
| **Runtime** (context only) |  |  |  |  |  |  |  |  |  |  |
| Unit suite (s) · bundle (KB) | 92.7 · 6608 | 90.5 · 6604 | 95.5 · 6608 | 101.9 · 6608 | 98.8 · 6604 | 89.6 · 6608 | 89.7 · 6608 | 92.7 · 6608 | 90.9 · 6608 | 90 · 6608 |


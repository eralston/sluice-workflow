| Run | Wall to commit | e2e wait | Other build and check wait | Waiting (unattributed) | Other tool time | **Flow time** | **Wall less e2e** | e2e share |
|---|---|---|---|---|---|---|---|---|
| A1-1 | 84.7 min | 37.3 | 22.9 | 0 | 0.1 | **24.4** | **47.3** | 44% |
| A1-2 | 94.2 min | 46.3 | 22.3 | 0 | 0.6 | **25** | **47.9** | 49% |
| A2-1 | 56.3 min | 27.4 | 11.6 | 0 | 0.1 | **17.3** | **28.9** | 49% |
| A2-2 | 63.5 min | 36 | 11.3 | 0 | 0.1 | **16.1** | **27.5** | 57% |
| A3-1 | 98.2 min | 23.6 | 36 | 0 | 0.2 | **38.3** | **74.5** | 24% |
| A3-2 | 93.4 min | 45 | 20.5 | 0 | 0.1 | **27.9** | **48.5** | 48% |
| A4-1 | 106.6 min | 63.5 | 16.8 | 1.7 | 0.7 | **23.9** | **43.1** | 60% |
| A4-2 | 139.6 min | 57.3 | 55 | 0 | 0.1 | **27.2** | **82.3** | 41% |
| A5-1 | 96.9 min | 45.9 | 16.7 | 0 | 0.3 | **34** | **51** | 47% |

| Arm | Wall to commit (mean) | Flow time (mean) | Wall less e2e (mean) | Flow time against A1 |
|---|---|---|---|---|
| A1 · F's sluice (2 runs) | 89 min | **25 min** | 48 min | — |
| A2 · One conversation (2 runs) | 60 min | **17 min** | 28 min | -32% (1.48×) |
| A3 · Ultracode (2 runs) | 96 min | **33 min** | 62 min | +34% (0.75×) |
| A4 · Tests first (2 runs) | 123 min | **26 min** | 63 min | +3% (0.97×) |
| A5 · Today's sluice (1 run) | 97 min | **34 min** | 51 min | +38% (0.73×) |

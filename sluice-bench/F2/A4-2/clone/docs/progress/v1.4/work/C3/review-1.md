# Review C3, round 1 · Verdict: fix needed

The fallback works for most of the acceptance. The cut is a profile switch (`render.switches.auraBake`). The hard
same-run check in `perf.spec.ts` passes, and I reproduced it: 4× off 33.2 ms, on 17.6 ms, a 47% gain. The absolute
lines stay soft. The goldens and gallery don't move because the switch ships off. One part is missing: the third
acceptance line's fallback says "the options go to HG-C with their measured savings", and the look-changing options
have no measurements.

1. Blocker: the HG-C options don't all have measured savings. Option 3 (the look-changing cuts: blur quality, a smaller glow, fewer auras) is marked "not measured here", and the packet's two required probes weren't run.
   Evidence: `profile-note.md`, "Options for HG-C" item 3 ("not measured here"), and "Not done: ... the blur-quality and
   glow-dropped probes for HG-C". `build-1.json` limitations: "the HG-C probes (BlurFilter quality 1, glow dropped) were
   not run". Packet step 8 says: "For the HG-C report also measure, as temporary probe edits only, `BlurFilter quality` 3 to
   1 on the glow and the glow dropped, with p95 for each."
   Acceptance line or rule: "If no cut reaches 20% without changing the look, the options go to HG-C with their measured
   savings." Fix: run the two probe variants (`probe-gpu.ts`, same run as an as-is baseline, hidden window). Add their p95,
   draws and passes to the note's table and to option 3. Revert the probe edits.

2. Minor: the 15 §11 "Aura bake" row understates the look difference. It says the rim "differs from the live one by up to 20/255", but the measured gate result is far larger.
   Evidence: `docs/15-reference.md:1190` versus `profile-note.md` and `build-1.json` (`c3-aura-diff`: worst p99 109/255,
   worst max 140/255; `c1-contrast` baked medians 1.4 to 1.9 lower). The 20/255 seems to come from one pixel column
   (live 162/214 against baked 131/194). The HG-C reader will take the reference table's number.
   Acceptance line or rule: values live in 15, and docs must match the measurements (CLAUDE.md "Values live in 15").

3. Minor: the 15 §10 "Cut gain floor" row cites a file that doesn't hold the constant.
   Evidence: `docs/15-reference.md:1080` Constant cell is ``unguarded: `@shared/profile/bundled.ts` (inline)``.
   `CUT_GAIN_MIN = 0.2` is in `tests/e2e/perf.spec.ts:471`, and `bundled.ts` has no 20%. `docTables` resolves paths from
   `src/renderer/src`, so ``unguarded: `../../../tests/e2e/perf.spec.ts` CUT_GAIN_MIN`` resolves and is checked. There's
   precedent at 15:1144 (`../../main/credentials/azCli.ts`). The packet named this cite.
   Acceptance line or rule: project notes, Sources of truth (every constant with a row, cited where it lives).

4. Minor: the look gate wasn't run on the scene the cut is for, or at devicePixelRatio 2. Both are inputs to HG-C's options 1 and 4.
   Evidence: `build-1.json` checks: `c3-aura-diff` was run on Harbor Pod only. Limitations: "devicePixelRatio 2 check ... not
   run". Packet step 8 asks for Pulsar Pod and Harbor Pod, and a DPR 2 launch once. Lens: "the effect where it's meant".
   Pulsar is the busy pod the switch would ship for. Fix: run `C3_POD="Halcyon Reach|Sprint 41|Pulsar Pod"` and add
   its worst p99 and max to the note. If DPR 2 stays unrun, state it as an open risk for options 1 and 4 in the note.
   Acceptance line or rule: the third acceptance line (the options' look cost is part of what HG-C decides on).

5. Nit: going from live to baked destroys the live group without its `AlphaFilter` (`aura.ts` `build()`,
   `this.group.destroy()`). That leaves one small filter per flip to GC. It doesn't matter at flip frequency.

Not findings (checked; the fixer shouldn't touch these):
- Re-ran typecheck, lint and unit tests (99 files, 1462 tests): green.
- `e2e:spec perf profile`: 7 passed. The cuts test at 4× gave off 33.3/33.2/33.1 against on 17.6/17.7/16.8, a 0.47 gain.
  At 1× this run's cuts-off p95 was 17.6 ms (within 1.25 vsyncs), so the recorded skip clause applied (27 decisions,
  2026-10-31). That's per the packet, not a gap.
- `e2e:spec gallery-v1 slice3b`: 20 passed. `e2e:keystone`: 43 passed. So the goldens and the gallery hold with the switch off.
- Live mode is today's code path: the same single group with `AlphaFilter`, the same erasers (`erasersNow` gives
  `[eraseGlow]` for outside and `[]` for inside), the keyline alpha and renderable via `keyTop` = `keyline`, and the blur
  strength unchanged when not baked. `rebake` is a no-op when live.
- Shared resources: `destroy()` uncaches the layers before destroying them. Pixi's `Container.destroy` is idempotent, so the
  double destroy of `tops` is safe. `profile.spec` reopens Pulsar with the bake on and the scene still draws.
- 09 §7's "about 60-80% of the live contrast" matches the measured ratios (0.63 to 0.71).
- The schema key, the four JSONs, `profile.test.ts`, 15 §11 desktop and deltas rows, and the `tests/README.md` row are consistent.
- `src/shared/` stays pure (only a zod key was added). No real data. Pixi v8 APIs (`cacheAsTexture`, `onRender(renderer)`).

# Packet C3: Pulsar inside the frame budget
Risk: medium (the cut touches the role outlines on every solar piece; the look must hold, and the gain is measured, not assumed) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: e567dfe, plus C4c's uncommitted tree (`applyProfile`, `setProfile`, the four switches). Build on it only once C4c is committed; if C4c's review changes `profile.ts` or the JSONs, rebase your edit on that.

## Acceptance                 (copied from the scope doc, unchanged)
- A profile note in the item's folder names the top costs, with numbers.
- Each cut is a switch in the device profile (C4). `perf.spec.ts` measures Pulsar playing at 1× and 4× with the
  cuts off and on in the same run, on the same machine, and the cuts lower p95 by at least 20% (a hard check). The
  profile's absolute budget (2 vsyncs on `desktop`) is reported, soft (decided 2026-10-31: the machine is busy,
  and the app should port to iPad and iPhone, so relative gains are what's judged). If no cut reaches 20%
  without changing the look, the options go to HG-C with their measured savings.
- The goldens and the gallery are unchanged, apart from what the note names.

## What the planner measured (the profile; fixture data only)
Probes in this folder: `probe-gpu.ts`, `probe-who.ts`. Pulsar Pod, hidden window, 1440x803, devicePixelRatio 1, vsync 16.7 ms,
one run, variants compared in it. Counts are per frame, playing at 4×.
- **The scene submits ~884 draws, ~404 offscreen passes (framebuffer binds), 187 clears, 344 program switches.** 79% of
  the draws land in offscreen targets, and every target is tiny (10x10 to 22x22 px). So the cost is the number of
  passes, not the pixels filled. At 1× it is ~629 draws and ~347 passes.
- **Who binds them (stacks, 60 frames, 357 binds a frame):** `BlurFilter` passes 192 (54%), `FilterSystem.push` for a
  filtered container 98 (27%), `ColorMatrixFilter` 64 (18%), `PaintFilter` 2 (under 1%). That is the role outline
  (`art/aura.ts`) on ~32 live asteroids and hive ships: each aura is three filtered containers (the `outside` group's
  `AlphaFilter`; the glow's flatten `ColorMatrixFilter` plus a quality-3 `BlurFilter`, six passes; the rim's flatten).
  `setAlpha` is called every frame (the glow breathes), `measure` re-lays the copies only on a >2% scale change.
- **Variants, p95 ms (p50 was 16.7 in all):** as-is 4× 33.3 (again 33.3); 1× 18.7; paint off 32.4; twinkle off 33.3; paint and
  twinkle off 33.3; canvas hidden from the compositor 33.3; **draws into offscreen targets skipped 18.6**; all draws skipped
  18.6 (the CPU floor). `gl.finish()` returns in ~0 ms. So paint, twinkle and the compositor are not the cost; the
  aura filter passes are, and removing them reaches the floor (-44%). Frame times vary between runs (B1 saw 50 ms at
  1× on a quiet machine, this run 18.7), which is why the spec compares in one run.

## Approach
1. **The cut: `render.switches.auraBake` (boolean, true in all four profiles).** In `aura.ts`, an aura in baked mode draws
   three cached sprites instead of three live filter chains: no per-frame passes. Mode off is today's code, exactly. Why this cut:
   it removes the measured cost, and at the same pixels. Blur quality, a smaller glow or fewer auras are the look-changing fallbacks
   (step 8).
2. **Tree in baked mode** (rebuilt by `fill()`, which stores `this.parts` so a mode flip calls `fill(this.parts)` again):
   `root > [glowTop > glowLayer > (glow with its filters, its own erasers)]`, `[keyTop > keyLayer > (keyline copies, erasers)]`,
   `[rimTop > rimLayer > (rim with its flatten, erasers)]`. Each `*Layer` is a plain `Container` with `cacheAsTexture({ resolution,
   antialias: true })`; each `*Top` is a plain wrapper that carries the alpha and `renderable`, so the breath and `show()` act outside the
   bake. Erasing each layer apart equals erasing the group (Pixi composites alpha-over, which is associative; only the 1 px antialiased
   edge can differ by rounding). The live mode keeps the single `outside` group with its `AlphaFilter`. `setAlpha` and `show` write to
   `glowTop`/`rimTop`/`keyTop` (in live mode those are `glow`, `rim`, `keyline`, as now).
3. **When it re-bakes:** call `layer.updateCacheTexture()` on `fill()`, on `rewrite()` (colour, and the gold flare's matrix each
   frame during its 1.6 s), and in `measure()` where the scale moved more than 2% (reach, `rimW`, `keyW` change there). Never for
   alpha. A camera zoom therefore costs what the live filters cost today, only while it moves.
4. **Resolution:** a layer's `resolution` is `px * renderer.resolution`, where `px` is `measure()`'s global scale and the renderer comes
   from `root.onRender = (r) => this.measure(r.resolution)` (v8 passes it). That makes one texel one screen pixel, so the blur and rim
   widths (which `measure` already computes in screen px) hold. **Known gotcha:** `cacheAsTexture` sizes the texture from
   `getLocalBounds()`, which does not include the blur's reach. Put an invisible `Graphics` rect (fill alpha 0) in each layer, the
   silhouette bounds grown by `GLOW_MAX_PX / px + RIM_PX + KEYLINE_PX` on every side, so the glow isn't clipped. If `cacheAsTexture`
   still misbehaves after one honest attempt (clipping, filter space, or blur strength off at devicePixelRatio 2), bake by hand
   with a `RenderTexture` and a `Sprite` per layer, and say so in the record.
5. **Live flip:** `aura.ts` subscribes once, at module level, with `onProfile` from `../../profile` and re-modes every aura in `live`
   (so the gallery and tests follow too). Read `activeProfile().render.switches.auraBake` in the constructor. `ChartApp.applyProfile`
   is not touched: the aura isn't a chart-level layer, and the module hook covers every host. (Say this in the record.)
6. **Teardown:** `layer.cacheAsTexture(false)` before a layer is destroyed, in `fill()` and `destroy()`, so pooled textures return.
7. **Schema and docs for the switch:** add `auraBake: z.boolean()` to `switches` in `src/shared/contracts/profile.ts`; `"auraBake": true`
   in the four `config/profiles/*.json`; update the two `toEqual` on `render.switches` in `tests/unit/profile.test.ts` (28, 46); a row in
   15 §11's desktop table (Constant `@shared/profile/bundled.ts` DESKTOP.render.switches.auraBake) and in the deltas table (on, on, on);
   the intro sentence stays.
8. **The look gate decides the default.** Compare baked and live with a new drive step `tests/drive/steps/c3-aura-diff.ts` (model it on
   `c1-contrast.ts`, which decodes screenshots in-page): reduced motion, paused, Pulsar Pod and Harbor Pod, at the fit and 2×, crops
   round 6 pieces per role (blue, red, gold), `setProfile` flip between shots. Pass: the 99th percentile of the per-pixel max-channel
   difference is at most 12/255, no pixel past 64/255, and `c1-contrast` medians within 0.1 of the live numbers. Check devicePixelRatio 2
   once by launching Electron with `--force-device-scale-factor=2` from a probe. If the gate fails and one fix attempt doesn't recover
   it, set the default to false in the JSONs, keep the switch, and report options at HG-C with the savings. For the HG-C report also
   measure, as temporary probe edits only, `BlurFilter quality` 3 to 1 on the glow and the glow dropped, with p95 for each.
9. **`perf.spec.ts`:** move the Pulsar navigation into `ensurePulsar()` (skip if `sceneKey` already starts with `pod:`). Add a test
   *Pulsar Pod: the cuts lower p95* with `test.setTimeout(240_000)` (the file default is 60 s). `const CUTS = ['auraBake'] as const` is
   the list. For rate in [1, 4], three rounds of: cuts off (`setProfile({ render: { switches: { auraBake: false } } })`), `frames(20)`,
   `setScheduleMs(0)`, `sample({ playheadMs: rate * 6000 }, 4000)`; then cuts on (`true`), the same. Off and on alternate, so drift hits
   both. Compare the median of the three p95s. **Hard:** `on <= 0.8 * off`, except when `off <= 1.25 * vsync` (the scene already
   fits one vsync: there is nothing to cut; log that, and pass). Report both with the means in `perf-pulsar-report.json`
   under `cuts: { off, on, gain }`. Leave the absolute `expect.soft` lines soft and rewrite their comment: "Soft: relative gains are
   judged (27 C3); the absolute budget is reported." Add the row `Cut gain floor | 20% | unguarded: tests/e2e/perf.spec.ts CUT_GAIN_MIN`
   to 15 §10.
10. **The profile note** is `profile-note.md` in this folder: the table above re-run on the final tree (`probe-gpu.ts` has the
    `aura-live`/`aura-baked` runs; run with `HIDE=1 .claude/sluice/with-lock.sh npm run drive -- docs/progress/v1.4/work/C3/probe-gpu.ts
    --paradigm solar --name c3-gpu`; the shown-window default differs from the hidden e2e window, so say which), the top costs with
    numbers, the cut, and the before/after. Add the dated numbers to 09 §7's Performance paragraph (replace "the hard budget is v1.4 item
    C3" with the result).
11. **Profile e2e (`profile.spec.ts`):** add a case in Pulsar: flip `auraBake` off and on and assert `auras()` (count, `rimPx`,
    `blurPx`, glow and rim alphas) match between modes within 0.5, and the scene still draws after the pod closes and reopens
    (shared resources lens).

## Files
- `src/renderer/src/chart/art/aura.ts`: 138–200 (fields, constructor), 227–290 (`setColor`, `setFlare`, `rewrite`, `fill`),
  290–360 (`placeRim`, `measure`, `reading`, `show`, `setAlpha`, `destroy`). Users: `art/swarm.ts` 895–905, 1232; `art/asteroids.ts`
  861–880, 1324; `art/asteroidAtlas.ts` 79 (all call `new Aura(..., { outside: true })`, `set*`, `setAlpha` each frame).
- `src/renderer/src/profile.ts` (`activeProfile`, `onProfile`; read-only). `src/shared/contracts/profile.ts` 22–31.
- `config/profiles/{desktop,laptop-battery,tablet,phone}.json`, `tests/unit/profile.test.ts` 28, 46.
- `tests/e2e/perf.spec.ts` 87–170, `tests/e2e/profile.spec.ts`, `tests/drive/steps/c1-contrast.ts` (model), `tests/e2e/slice3b.spec.ts`
  (reads `auras()`).
- `docs/15-reference.md` 1066–1075 (§10), 1162–1215 (§11); `docs/09-signal-ladder.md` §7 Performance; `tests/README.md` rows for
  `art/` and `perf`.

## Excerpts
- Task decision (27, 2026-10-31): relative gains are judged; the absolute budget is soft; the profile switches are the home for cuts.
- 15 §11: "`switches` and `limits` are where C3 adds its cuts: one key per cut, in the schema, in all four files and in the tables below."
- `aura.ts` header: "No filter and no group of its own" applies to the inside aura; the `outside` aura "erases its own inside so only the
  outline shows" and is one offscreen group. Keyline "adds no filter pass and no offscreen group (it shares the rim's)": in baked
  mode it gets its own cached layer, which is the price of dropping the group.
- Project lens: "Shared Pixi resources: `destroy(true)` and texture or geometry teardown can free resources the main chart shares.
  Check that the chart still renders after the new view closes." And: "Frame budget: any per-object filter or extra pass needs a
  before-and-after perf run."
- INV-12 and R9: the drawn count is the true count; the cut draws the same outlines on the same pieces.

## Checks
- `npm test` (`profile`, `docTables`, `auraContrast`). Gate: typecheck, lint, unit.
- Drive: `c3-aura-diff` (new), `c1-contrast --paradigm solar`; look at `npm run gallery` for the aura cells (reduced motion too).
- e2e, under `.claude/sluice/with-lock.sh`: `npm run e2e:spec -- perf profile slice3b solar solar-dense gallery-v1`, then `npm run e2e:keystone`.
  Expect `perf`'s two older absolute checks to stay soft and possibly red; the new cuts test is the hard one.
- `slice1`'s pixel baselines are backlog scenes with no aura: they must not move.

## Out of scope
Paint, twinkle, labels and holo filters (measured: not the cost). A label cap. Resolution or DPR switches (this machine reports
devicePixelRatio 1; leave a note for the iPad/iPhone port). The `needs` of other items. Changing the aura's colours, weights or
widths. Moving the hard budget off its soft absolute lines.

# Slice V1-W0-T2: Mapping, signals and the pack registry

Built 2026-10-10, following [17 W0-T2](../17-v1-phases.md#w0-t2-mapping-signals-and-the-pack-registry)
and [14 §1.1–1.3, §2.1, §2.4](../14-architecture.md#2-interfaces). v0 behaviour doesn't change: no v0
code reads the new mapping fields, and every golden is byte-identical.

## 1. What was built
- **`config/state-mapping.json`**
  - Each type has a `role`: Epic and Feature are `container`, User Story is `objective`, Bug is
    `threat` and Task is `step`.
  - Each state has its `rung` and flags, copied from `SIGNALS` in `art/progress.ts`. For example,
    Resolved is `nearing` with `step: 0.3`, and Rejected is `off` with `ghost` and `strike`.
  - `entities.attachment` maps PR statuses: `active` is `underway`, `completed` is `accomplished`,
    and `abandoned` is `off` with `ghost`. Their category and stage are v0's (`flight.*`).
  - The top `$comment` says where the v1 fields come from and which test keeps them equal.
- **`src/shared/engine/signal.ts`**
  - `resolveRole(mapping, type)` returns `Role | null`.
  - `resolveSignal(mapping, type, rawState)` returns a `Signal`.
  - `attachmentSignal(mapping, status)` returns a `Signal`.
  - All three read a side index: a `WeakMap` per mapping object, built once. The signals they
    return are shared and frozen.
  - Fallbacks, in order:
    - The role falls back to the v0 kind.
    - The signal comes from the mapped `rung` and its flags. Without a rung, it comes from the v0
      stage (`RUNG_OF_STAGE`), then from the category (Proposed, InProgress, Resolved, Completed,
      Removed). Anything else is `UNKNOWN_SIGNAL` (`{ rung: 'off', unknown: true }`, the same as
      `signalOf`).
    - An attachment with no entity mapping reads `flight.<status>`.
  - Also exported: `RUNG_OF_STAGE`, `UNKNOWN_SIGNAL`, `signalOfStage` and `signalOfMapped`.
- **`src/shared/engine/stageCode.ts`**
  - `encodePiece` and `decodePiece`, plus `encodeSignal`, `decodeSignal`, `isPieceStage`,
    `STAGE_PREFIX`, `MAX_STEPS` (6) and `QUANTUM` (0.05).
  - The grammar, as built:
    ```
    v1|<role>|<signal>|c=<category>[|s=<steps>][|sh=<share>][|o=m<m>r<r>][|i=<intensity>][|pr=<open>]
    signal := <rung>[+sketch][+step<0.00>][+deferred][+ghost][+strike][+unknown]
    ```
    For example, `v1|objective|nearing+step0.65|c=Resolved|s=nac`,
    `v1|seat|underway|c=InProgress|sh=0.50|o=m2r1` and
    `v1|facility|underway|c=InProgress|i=0.60|pr=3`.
  - Fields and flags come in a fixed order, and are written only when set. An empty steps list
    is written `s=`.
  - The category is URI-encoded.
  - Share and intensity are clamped to 0..1 and quantised to 0.05, and `step` to two decimals.
    Counts are whole numbers, never negative. Steps are cut to 6.
  - `decodePiece` is strict. It answers `null` for any of these (INV-11):
    - a v0 stage key;
    - another version, role or rung;
    - a flag or field that's unknown, repeated or out of order;
    - a malformed value.
- **`src/shared/packs/registry.ts`**
  - `registerPack`: a later pack with the same id replaces the earlier one.
  - `packById(id)` returns the pack, or undefined.
  - `packIdOf(h)` returns `h.domainPack ?? 'sdlc'` (`DEFAULT_PACK`).
  - `packFor(h)` returns the pack. It throws if that pack isn't registered, rather than reading
    the bundle with another pack's rules.
  - `allPacks()` and `resetPacks()`, modelled on the asset registry.
  - Nothing is registered yet. W1-T1's `packs/all.ts` registers SDLC.
- **`fixtures/scenarios/v1/index.ts`**: `export const v1Scenarios: Scenario[] = []`.
- **`fixtures/dsl.ts`**
  - New optional fields on `Scenario`: `pack?: string` and `mapping?: StateMapping`.
  - `toHistory` adds `domainPack` only when `pack` is set and isn't `'sdlc'`. A probe showed:
    - with no pack, or with `'sdlc'`, the bundle is byte-identical and has no `domainPack` key;
    - with `'todo'`, the bundle carries it, and it survives `scopeHistorySchema`.
  - `toHistory` still uses the mapping it's passed. Picking `s.mapping` is W1-T5's `mappingFor(s)`.
- **Tests**: `tests/unit/signal.test.ts` (47 tests) and `tests/unit/stageCode.test.ts` (54
  tests).

## 2. Contracts changed
- **A fix outside this task's files: `src/shared/contracts/ipc.ts`, one token.**
  `mappedStateSchema.step` was `z.number().int()`. The ladder's steps are fractions (0.3, 0.65), so
  the new mapping failed zod. Every bundle would have been refused at IPC. It is now `z.number()`,
  which matches the type (`step?: number`) and 14 §2.1. `signal.test.ts` now parses the real mapping
  through `stateMappingSchema` to guard it.
- **Departure from 14 §2.4's example strings.** 14 writes `'v1|seat|0.50|m2r1'` and
  `'v1|facility|i0.60|pr3'`. As built, every stage carries its signal and category, and every
  optional field is `key=value`, so the string round-trips losslessly (see the grammar above).
- **03 is not edited.** It isn't one of this task's files, and the change is functions, not new
  shapes. **Follow-up (W4-T3, the final 03 pass):**
  - Add the stage grammar and the signal fallback order to 03 §5d.
  - Add a note that `MappedState.step` is a fraction.
- **A note for the literal fence.** The category table in `signal.ts` uses bare object keys.
  `Resolved` is a neutral category name (12 §4), but it's also an SDLC state name, which the fence
  forbids as a string literal.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 32 files and 473 tests pass.
- **Goldens unchanged**: `git status tests/golden` is clean.
- **`npm run fixtures`**: wrote all 5 bundles. `fixtures/generated/` is gitignored, so this shows
  no diff. The bundles now carry the v1 mapping fields, and `contracts-v1` and `avatar` pass
  against them. Before the zod fix above, both failed.
- **`signal.test.ts`**
  - Parity with `art/progress.ts` `signalOf` (strict equality) for all 31 SDLC states and the 3
    PR statuses.
  - Every entry of `RUNG_OF_STAGE` equals the ladder, and every mapped stage is in it.
  - Every SDLC state declares a rung, and every SDLC type has its role.
  - The mapping survives zod.
  - With roles, rungs and entities stripped, the fallbacks give identical roles and signals.
  - The category fallback works, and a mapped rung wins over its stage.
  - An unknown type or state is neutral, and the signals are frozen and shared.
- **`stageCode.test.ts`**
  - Round trip and re-encode identity for 15 pieces, covering every role and every field. One of
    them has a category containing `|`, `+`, `=` and `%`.
  - 14's examples are written in the as-built grammar.
  - Every SDLC and ladder signal round-trips.
  - Quantising and clamping work, and false flags aren't written.
  - 33 malformed or unknown stages decode to `null` (INV-11).
- **Literal fence**: passes. It now also covers `signal.ts` and `stageCode.ts`.
- **Keystone** (not required for this task, run because the mapping reaches the app): 38 of 38
  passed.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **`signal.test.ts` loads `art/progress.ts` by a runtime path** (`await import(resolvedPath)`).
  `tsconfig.node.json` doesn't include renderer files, so a static import fails typecheck with
  TS6307, and the tsconfig isn't this task's file. The import is typed by hand
  (`{ signalOf(stage): Signal }`).
  - If a later task wants the static import, add `src/renderer/src/chart/art/progress.ts` to
    `tsconfig.node.json`'s `include`. That file imports nothing.
- **`SIGNALS` isn't exported**, so the parity test can only check the stages the engine and the
  mapping list. A stage added only to `SIGNALS` isn't caught until a mapping uses it.
  - Exporting `SIGNALS` would close this, but `art/progress.ts` is on 14's list of files v1 doesn't
    edit.
- **`packFor` throws for an unregistered pack.** Until W1-T1 registers SDLC, any caller would throw.
  No caller exists yet.
  - If a renderer path ever calls it before `packs/all.ts` is imported, that's a wiring bug, and
    it surfaces loudly.
- **`entities.facility` isn't set** (17 asks only for the attachment states). `noun` stays unset
  until a pack's words need it.
- **The `$comment` notes** reach the generated bundles. zod drops them, as it already did in v0.
- **The `sprint-pods` bundle** written by `npm run fixtures` has 0 events. Its default scope isn't a
  sprint scope. That's v0 behaviour, unchanged here.

## Wave gate (W0)
Base (`npm run typecheck`, `npm run lint`, `npm test`) and keystone (38 of 38) were green on
arrival and stayed green after the fixes below. `git status tests/golden` is clean.

Fixes made at the gate, from the W0 reviews:
- **INV-11 hole in `signal.ts`.** `RUNG_OF_STAGE` and `RUNG_OF_CATEGORY` had `Object.prototype`, so
  a pack stage or category named `toString`, `constructor` or `__proto__` resolved to a function.
  `freezeAll` now builds both tables with a null prototype. A new test checks that such names are
  `UNKNOWN_SIGNAL`.
- **`attachmentSignal` now returns shared objects.** They're cached in the mapping's side index,
  like `resolveSignal`'s. There's a new test for this.
- **`decodePiece` accepts only canonical strings.** A string must re-encode to itself, so
  `sh=0.37`, `pr=03`, `o=m01r1` and `c=In%50rogress` are rejected and one look has one string.
  The rejection list covers these cases. The test titled "writes 14's examples" is renamed,
  because the strings it checks aren't 14 §2.4's.
- **`mappedStateSchema.step` (`ipc.ts`, W0-T1's file) is now `z.number().min(0).max(1)`.**
  `contracts-v1.test.ts` used the state index as a stand-in step, so it now uses `(i % 5) / 4`.

Still open, for W4-T3 (docs):
- 14's fence paragraph needs the `projectCaptains` carve-out.
- 03 §5d needs the `stageCode.ts` grammar, the signal fallback order and the fractional `step`
  (0..1).
- 14 §2.4's stage examples (`v1|seat|0.50|m2r1`, `v1|facility|i0.60|pr3`) are out of date.
  **W2-T3 (stageCodec) should build on `decodePiece`/`encodePiece` in `stageCode.ts`, not on
  14's example strings.**
- Not decided: whether builders leave `steps` unset or `[]` for a piece with no step children.
  The two encode differently (nothing vs `s=`). Each builder should pick one and keep to it.

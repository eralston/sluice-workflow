# Packet A2: `PieceState.outcomes` to the art kit
Risk: small (type removal, tsc finds every use; gallery cells already bypass the field) · Score: blast 1, verify 0, design 0, acceptance 0, track 1
Start commit: d39649b

## Acceptance
- `grep -rn "outcomes" src/shared` finds nothing.
- The gallery's world cells that showed outcomes still render them (`npm run e2e:spec -- gallery-v1`).
- Typecheck, lint and unit tests are green. No golden changes, or the packet names them.

## Approach
The gallery's outcome cells (`gallery/v1/worlds.ts`) already feed `WorldView` raw stage strings
(`world.<line>.<pct>.m<m>r<r>`), and `WorldView`'s options and `parseWorldStage` already take `megastructures`
and `research`. So the art kit already holds the parameter; only the shared contract carries a dead copy.
Decisions:
1. Delete `outcomes` from `PieceState` (`view.ts`). Reword its comment-trail in `solar.ts` so `grep outcomes src/shared` is empty.
2. Delete the `o=m<m>r<r>` field from `stageCode.ts`: encode, decode, `FIELDS` (drop `'o'`), the header comment and example. No gallery stage string needs it.
3. `seatLook` (`stageCodec.ts`) still returns `world.<percent>.m0r0` (unchanged output, so no behaviour or golden moves; the suffix also clears any outcomes on a reused view). Drop the `outcomes` read and the doc line; `count` is still used by `facilityLook` (line 103), keep it.
4. `assets/seat.ts` samples: drop `outcomes` from `samplePiece`; relabel `own share ${share}` and the note to "Own share 0 → 1; the line comes from the seed" (outcomes live in the gallery's *Worlds* cells, `gallery/v1/worlds.ts`). Fix the file header comment (line 2) to match the chart (finished pieces are platforms in orbit).
5. `chart/art/worlds.ts`: comment only (lines 6-9): outcomes are an art-kit option set only by the gallery. No code change.
6. `gallery/v1/worlds.ts`: no change needed (verify it still compiles; do not touch).
7. Docs in the same change: 03 (the `PieceState` block line 783, the stage grammar lines 866-868, the seat row 979, the `seatLook` line 1215); 14 (lines 285, 290, 606, 697); 05 G-14 (line 881). State: removed from the contract; the world art takes `megastructures`/`research` as options and the `.m<n>r<n>` stage suffix, set only by the gallery. Call 03's amendment out in the handoff.
8. Tests: `stageCode.test.ts` (drop `outcomes` from PIECES lines 26-27, the clamp case lines 73/78, the line-47 expectation becomes `...|sh=0.50`; add `'v1|seat|underway|c=InProgress|sh=0.50|o=m2r1'` to the rejected list near line 106). `assetStage.test.ts` 174-183: drop the outcomes loop; assert `[megastructures, research]` equal `[0, 0]`.

## Files
- `src/shared/contracts/view.ts` 228-235; `src/shared/scene/project/solar.ts` 163-171; `src/shared/engine/stageCode.ts` 1-12, 68-76, 112-120, 139
- `src/renderer/src/theme/starChart/stageCodec.ts` 1-12, 28-35; `.../assets/seat.ts` 1-3, 76-103
- `src/renderer/src/chart/art/worlds.ts` 1-10 (comment)
- `tests/unit/stageCode.test.ts`, `tests/unit/assetStage.test.ts` 172-190
- `docs/03-contracts.md`, `docs/14-architecture.md`, `docs/05-playback.md` (lines above)

## Excerpts
`view.ts:230-234` (to delete): `/** A seat's surface structures ... for the art and its gallery. The projection never writes it ... */ outcomes?: { m: number; r: number };`
`stageCode.ts:73,116-120`: the `o=` encode line and the `else if (key === 'o')` decode branch. `FIELDS = ['s','sh','o','i','pr','pm','mg','sb','vc']`.
`worlds.ts:62`: `if (m[3] !== undefined) { out.megastructures = Number(m[3]); out.research = Number(m[4]); }` (stays).
CLAUDE.md: "`02` and `03` are normative. If code needs to depart from them, update the doc in the same change and call it out in the slice handoff note." "Keep `src/shared/` pure." Change a constant and its row together (`docTables.test.ts`).

## Checks
- `npm run typecheck`, `npm run lint`, `npm test` (`stageCode`, `assetStage`, `docTables`).
- `npm run -s e2e:spec -- gallery-v1 gallery-assets` plus `npm run e2e:keystone` (wrap each in `.claude/sluice/with-lock.sh`). Check the `*-outcomes` cells still draw (look at `test-results/gallery/`).
- `grep -rn "outcomes" src/shared` is empty.
- No golden should move; if one does, stop and say which.

## Out of scope
Any change to `WorldView` code, the world art's look, `gallery/v1/worlds.ts`, other `PieceState` fields, other docs' prose about "outcomes" meaning achievements (02, 13).

# Slice 1.1-L8: Captain plates with square pictures

Built 2026-10-13, following [19 §3](../19-v1.1.md#3-items) item L8 and Q7 (chart plates only, as
recommended). It builds on L1, L2, L6 and L7 ([slice-1.1-L1.md](slice-1.1-L1.md),
[slice-1.1-L2.md](slice-1.1-L2.md), [slice-1.1-L6.md](slice-1.1-L6.md), [slice-1.1-L7.md](slice-1.1-L7.md)).
None of their work was reverted. No human gate of its own. The stills below are for the user's review.

## 1. What was built
- **The square on the plate.** The `avatar` variant's picture is now a 24 px square at the plate's
  near end. It sets the plate's height, sits flush with the frame (no padding on the top, bottom or
  near side) and has no ring. The plate's own clip (`frameClip`) cuts its corners along with the
  plate's: on an upright captain plate, that is the bottom-left corner. The name is centred beside
  it, with 7 px between them. Initials sit on their `AVATAR_COLORS` swatch in the same square.
- **The picture in play.** The `picture` tier is now a 20 px square:
  - Its corners are cut by the same `frameClip`, so it uses the plates' `HOLO.cut` (6 px) and keeps
    one geometry (R6).
  - The plate's own frame draws its outline with no pointer or rim dot (new `HoloFrame.bare`), in
    the tier's line: T1 at rest, lifted when selected.
  - It still hugs the hull's top (`labelRim`). The label layer sets and clears the clip as the tier
    changes.
  - v0's picture tier (no holo frame) is unchanged.
- **Pictures of any shape** fill the square from its centre (`object-fit: cover`, with the radius
  removed from the `img`). Hand-added pictures are already cut to a centred square in main
  (`src/main/index.ts`, `img.crop`), so that part needed no change.
- **Chart plates only (Q7).** Everything is scoped to `.callout--holo`. `avatarCircle` and the base
  `.callout__avatar` rules are unchanged, so the inspector, the People list, v0's labels, lane heads
  and guest tags keep their circles.
- **Gallery:** *Label hierarchy* gains a *captains · feature* cell (`gallery/labelHierarchy.ts`)
  with three invented captains: a square picture, a wide picture (its side bands cropped away) and
  initials. Each is shown at rest, lifted and in play (the picture alone). It is built with the
  chart's own `renderHoloPlate`, `frameClip` and `HoloFrame`.
- **e2e:** a new `solar.spec.ts` test checks both states:
  - At rest: every shown captain's square is square, as tall as its plate, at (0, 0) in it, with
    radius 0 and no box-shadow, and the plate is clipped by a polygon and has its outline.
  - In play: the plate is exactly the square, clipped, with an outline and an empty pointer.
- **Drive:** `tests/drive/steps/v11-L8.ts`.

## 2. Contracts changed
- **Renderer:** `HoloFrame.bare(x0, y0, w, h)` is new. In `LabelLayer.position`, a holo label in the
  `picture` tier is clipped (`frameClip(w, h, 'above')`) and framed, where before it hid its frame.
  CSS (`chart/holo/holo.css`): the `avatar` variant's padding and gap, `.callout__avatar` at 24 px
  with no radius or ring, and the picture tier's square at 20 px with no ring. No shared contract or
  constant changed, so no 15 table value moved.
- **Doc edits:**
  - **15:** §2 `--holo-line` (the ring is replaced by the picture's frame), the *Ivory for people's
    names* rule; §6 `label-tiers` `picture` row and `holo-variants` captain row.
  - **06:** §2 *Ships collapse*, §4 *Avatar circle* (a square on Solar's holo plates; the crop is from
    the centre), §9 *Captain ships*.
  - **03:** `ViewNode.avatar`'s comment.
  - **19:** L8 **State** and a §5 decision.
  - **tests/README:** the `v11-L8.ts` drive row.
  - The `agent.ts` comment ("the minimal tier" is now "the picture tier").
- **Departures from 02/03/13:** none. 06 §4 said "always a circle". That still holds for every
  surface except Solar's chart plates, and is amended in this change as L8 and Q7 decide.

## 3. Checks
| Check | Result |
|---|---|
| `npm test` (847, incl. `avatar.test.ts`: AA on every swatch, unchanged; `docTables`) | Pass |
| `npm run typecheck`, `npm run lint` | Pass |
| `npm run e2e:spec -- tests/e2e/solar.spec.ts` (with the new L8 test) | 12 passed. See §5 for the L6 test's intermittent failure |
| `npm run e2e:spec -- slice1 slice2 slice3b density gallery-v1 solar-play pictures` (VC-1 pixel baselines, v0 avatars) | 61 passed |
| `GALLERY_FAMILY=labels npm run e2e:spec -- gallery-v1` | Pass (the new cell renders in its frame) |
| `npm run e2e:keystone` | 38 passed |
| `npm run drive -- tests/drive/steps/v11-L8.ts --paradigm solar` | Passed; stills reviewed |
| Goldens | None changed by L8; no `-u`. (`solar.scenes.json` was already modified by L6 and L7) |
| Full `npm run e2e` | Not run (the run's final phase does) |

## 4. Human gates (review stills)
- **Gallery:** `npm run gallery`, then *Label hierarchy*, last cell *captains · feature*
  (`test-results/gallery-v1/labels-c0.png`, bottom). Check whether the square reads as part of the
  plate, whether the cut bottom-left corner of the picture is acceptable, and whether the 20 px play
  square with a 6 px cut is too heavily chamfered (the alternative is a proportionally smaller cut
  for the picture alone).
- **Drive:** `npm run drive -- tests/drive/steps/v11-L8.ts --paradigm solar`, output in
  `test-results/drive/v11-L8/`:
  - `01-rest`: Harbor Pod on Tue Oct 6. Juno Achterberg, Sable Nakamura and Ossian Vale show initials
    squares flush at their plates' left ends.
  - `02-captain-pointed`: a captain's plate, lifted.
  - `03-pictures`: invented pictures laid into two plates; `close-pictures-1.png` shows the wide one
    cropped to its centre. Harbor Pod's people have no pictures, so the drive lays them in.
  - `04-playing`: Mon Oct 5 at 1×. Every captain is a small cut square with its frame line (JA, KM,
    PI, WC, OV).
  - `05-playing-pictures`: the same, with a picture in one square.
  - `close-*`: close-ups of two captains for each still.

## 5. Known limitations and open questions
- **The play square's chamfer.** The 6 px cut is 30% of the 20 px square, so it reads heavier than
  on a plate. I kept one geometry as R6 asks. If it looks too cut, the fix is a picture-only cut (a new
  `HOLO` key and a 15 row).
- **No v1 fixture has a picture.** Only v0's `orbit-week` has one (Mina Sato). The drive lays invented
  pictures into the DOM for its stills, and the gallery cell covers the real path. Adding a picture
  to `pod-sprint` would change its goldens, so I left the fixtures alone.
- **L6's `solar.spec.ts` test is intermittently failing** (1 run in 4 in a `--repeat-each` run): its
  dreadnought plate didn't expand after `pointAt`. With a 400 ms wait before the check it passed 4 of 4,
  and the pointer was on the canvas, not on a label. The hull's on-screen position also differed
  slightly between runs, which suggests the camera is still settling after the `0` fit. This is in
  L6's test, and nothing indicates L8 caused it. I left the test unchanged.
- The inspector and People list keep their circles (Q7). Moving them to squares is a later item if
  the chart's squares are kept.

# Slice 1.3 C11: labels before arrivals (check only)

## What was built
Nothing in the app. C11 (R11, 13 §4 "an object arrives before its label") is closed as already fixed: v1.2
A8 gates ships' and stations' plates on `GraphScene.entering()`, and the pieces' own labels are
hover-only (19 L7), so no piece label can float at an arrival point.

Evidence: drive step `tests/drive/steps/c11-labels.ts` (`npm run drive -- tests/drive/steps/c11-labels.ts --paradigm solar`).
In Harbor Pod it played the episode at 2x for 9 s (arrival- and sortie-heavy start), then seeked to 60% and
sampled 3 s, checking each frame every visible plate against its node's drawn alpha (`viewAlphas`). Result:
0 plates shown over a body under 30% drawn, over 5,877 plate-frames in play and 2,618 after the seek.
The standing e2e guard is `solar-dense.spec.ts` "a ship or station arrives before its plate (22 A8)".
Stills: `review/v1.3/C/C11-play.png`, `C11-seek.png`.

## Contracts changed
None.

## Checks
Drive run passed (above). No code changed, so no typecheck, lint or e2e run.

## Human gates
None.

## Known limitations and open questions
The drive samples per frame in the page, not a recording, so it can miss nothing shorter than a frame; it
covers one pod (Harbor), not Halcyon, whose pods were not on the drive's path.

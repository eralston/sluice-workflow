# Slice 1.2-A8: labels arrive after their ships

**Status:** built 2026-10-14. [22 §3, A8](../22-v1.2.md#3-blocks).

## 1. What was built
- **`GraphScene.entering(pk)`**: a node is still making its entrance while any of these holds:
  - its view is hidden or fading up for it (`fadeView`'s rest alpha is held);
  - a warp-in still offsets it;
  - an arrival motion holds it.
- **Ship and station plates** (`labels.ts`, kinds `captain` and `facility`, the picture tier included)
  wait while their body is entering. When it is in, the plate emerges over `EMERGE_MS` (280 ms, wall
  time):
  - it fades up and grows from its object's side, scale 0.55 to 1, eased out;
  - its frame fades with it;
  - it then stays.

  This covers the opening's warp-ins, a newcomer's entrance, a station's fade-in at its jump-in's act,
  and a ship's fly-in.
- **Snapping:** a seek (`ChartApp.show` with cause `jump`) calls `labels.settleArrivals()`, so plates
  show at once (INV-15). So do scene entry and reduced motion.
- The flash and cast fades and the emergence now share one opacity write. Before this, a later write
  cleared any other.

**After the review (2026-10-14).** A flight owns its node and offsets it too, so the first
`entering` hid a ship's plate for every sortie, not only its arrival. Now a warp-in's offset counts
only while the node isn't owned, and a guard keeps every drawn ship's plate up while ships fly (the
old test gave 0.95; the guard needs 0.98 or more). The picture tier's side (`hug`) now grows its
emergence from the bottom centre.

**Unfurl (2026-10-14, the user's second look).** The scaled plate read as a panel flying in a beat
after its ship: its frame and pointer (a separate SVG) only faded at full size while the plate grew.
It now waits a glance (`EMERGE_DELAY_MS`, 450 ms) after the ship is in, then unfurls from the object
with nothing moving: the pointer draws out from its rim dot, the frame traces itself (`HoloFrame.unfurl`,
dash offsets) and the plate is revealed by a mask from the edge nearest the object. A guard measures the
glance, the mask and the tracing frame, and that nothing scales.

## 2. Contracts changed
- **15 §10:** the *Plate unfurl* row (`EMERGE_DELAY_MS`, `EMERGE_MS`) and the *Ship facing* row.
- Nothing in 02 or 03. R11 (13 §1) is this rule.

## 3. Checks
- **e2e:** `solar-dense.spec` passes (4). Playing meridian's opening at 1× and sampling every 60 ms, no
  captain or station plate shows (opacity above 0.3) while its body's view alpha is under 0.3.
- **The guard fails** with `entering` stubbed to false: every captain's plate floats at its arrival point.
- **Mapped specs:** `solar`, `solar-play`, `slice1`, `density`, `slice3a` and `slice3b` pass (79), and
  keystone passes (38). `npm test` and docTables pass.

## 4. Human gates
**HG-A-motion** (with A9–A11). Judge:
- the order: ship in, then its plate out of it;
- the emergence's pace;
- that nothing floats first.

Look at the `v12-dense` tour's first playing stills, and play the opening yourself at 1×.

## 5. Known limitations and open questions
- A ship that leaves (departs) takes its plate when its node goes. That is today's behaviour, unchanged.
- The emergence is a CSS scale of the plate only. The pointer line fades but doesn't grow.

# Review E4a, round 1 · Verdict: pass

E4a (U1) meets its part of the packet. The `first` merge is 7900 ms (act 2300, land 500). The transform
starts at the gather. Seek and play still agree. The ledger's Built section shows E4a's saving on every pod,
and each saving is at least C2's estimate. I drove all three first merges in Harbor Pod, including the Wars
ring-docking station (`harbor-console`, rig 4.4 s), which the builder's drive didn't reach. On forward play
each logged `played` and then `finished`, with no `interrupted` or `cut`. On the Wars station `finished`
came 4.4 s after `played`, so the transform ends just as the station fires. A seek back mid-merge logs
`interrupted`/`scrubbed-back` and shows the first form (`review-1-station-form.txt`,
`review-1-wars-seek-back.png`).

1. Minor: docs and comments still describe the old transform-at-the-land, and no merge surges any more.
   Evidence:
   - With land 500 on both variants, the surge loop at `powerLink.ts:129` (`for (t = 400; t < land - 200; …)`) emits nothing. Before E4a, only the `first` merge's 4.4 s land surged.
   - Docs that still promise surges: 13 §6's Power link row (E4a edited it) still says "Land (0.5 s): … at-rest-blue surge rings every 0.9 s", and 15's effects row at `docs/15-reference.md:967` still says "Power link | land | `ring` surges through the station".
   - Stale code comments:
     - `pace.ts:482`: "the others surge for the rest".
     - `powerLink.ts:124-126`: "its form changes here (the art plays the transformation), and power surges through it for as long as that takes".
     - `dreadnoughts.ts:64` and `:1082-1083` still say the chart arms the transform with `expectTransform`.
     - `facility.ts:46`: "`transform`: the next change to its second form plays".

   Acceptance line or rule: project notes, sources of truth (15 is where values live) and the reviewer's
   lens on docs that no longer match the code. The fixer can drop the surge sentence and the surge row, or
   keep them as dead code and say so, then reword the comments.
2. Nit: if you pause mid-merge, the transformation finishes while paused, before the dock and the land.
   Evidence:
   - In `review-1-station-form.txt` the tide-gateway pause run reads `played` at 22541, `finished` at 26159 (while paused), and the look lands at 31995 after resume.
   - `review-1-wars-paused-6s.png` shows harbor-console's ring form with the merge not yet landed.
   - Cause: the morph runs on the scene's wall clock (`ChartApp.ts:1062`). The window this can happen in grows from about 0.3 s to 3.2 s.

   Acceptance line or rule: none. This is the same wall-clock morph as the packet's Out of scope 4× case,
   and it's noted here for E8 (tempo) or the human gate.
3. Nit: the moved unit test hard-codes `LINK_CHARGE_MS = 700` (`maneuvers.test.ts:280`) instead of reading
   `fx/timing.ts`, so a retimed charge wouldn't fail it. The packet itself wrote 700, so this is taste.
4. Nit: the new 03 sentence (`03-contracts.md` near line 2081) says "a seek … mid-merge reads `interrupted`
   (`scrubbed-back`)". That holds only before the land. Between the land and the end of the morph (on Wars,
   3.5 to 4.7 s), the morph keeps running after a forward seek, as it always did (`settleForm` acts only while
   `leading`, per the packet).

Not findings:
- `retarget`'s extra `st.morph === undefined` guard is deliberate: it keeps the gallery's pinned progress working.
- Rigs shorter than the land (mecha 2.8 s) finish before the land with no cut.
- At 2× and 4×, the echo's `charge` act can fire before the robot stage swaps in. `leading` still guards it.
- The ledger numbers match the committed `pacing-ledger.json` before and after (my re-generation produced identical files).
- No goldens moved.
- E4bc and E4d edits (03 field list, 05 P-rows, 15 §10, 13 §4.4 overlap) are correctly left for later builds.

# Progress notes

**Status:** current as of 2026-10-26. This folder holds the work in flight: [handoff.md](handoff.md)
(where the work stands; read it first) and the notes of slices not yet closed. A closed slice's note
moves to [../archive/progress/](../archive/progress/). The active plan is
[27-v1.4.md](../27-v1.4.md).

## Sluice tranches

Work built with the sluice ([design](../../sluice/docs/design.md)) keeps its files in `<tranche>/` here:
`work/<ID>/` per item (the packet, one JSON record per agent run, the reviews), `ledger.jsonl` (one line per
agent run, written by a hook), `block-<B>.md` per block (its summary, its code-health snapshot, the stills
for the human gate, the orchestrator's decisions, and any escapes), `retro.md` when the tranche ends, `views/` (gitignored: now, board, pipeline, timeline and effort, redrawn by the hooks for a
Markdown preview left open; `node .claude/sluice/visualize.mjs --watch` keeps them fresh) and `snapshots/block-<B>/`
(the views frozen at each block's end).
`scoreboard.jsonl` here holds one line per block across every tranche: it's the record of whether the
sluice is getting cheaper and better (`node .claude/sluice/scoreboard.mjs`). All of it is committed, so the
metrics can be recomputed later. Formats: `.claude/skills/sluice/formats.md`.

## Handoff notes

**The canonical slice-note format** (moved here from 17 on 2026-10-14, when 17 was archived; it was
07's before that). Every slice ends with a note in this folder, named `slice-<id>.md` (for a v1.3
item, `slice-1.3-<item id>.md`; v1.2's are `slice-1.2-<item id>.md`, in the archive). The note has five numbered parts,
in this order:
1. **What was built.**
2. **Contracts changed,** with the matching edits to 03 (and 02, 05, 06, 08, 09, 15 where a rule or
   a value changed). "None" if none.
3. **Checks:** the results, by name (unit, the mapped specs, keystone, full; the goldens, and which
   were accepted on purpose).
4. **Human gates:** stills or the scene and moment to watch, for any gate (fixture data only; never
   real ADO data, INV-18).
5. **Known limitations and open questions.**

**Source:** archived 17, *Handoff notes* · **Update when:** the format changes.

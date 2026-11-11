# Slice 1.2-A1–A2: literal previews; homeworlds explained

**Status:** built 2026-10-14. [22 §3](../22-v1.2.md#3-blocks): A1 and A2.

## 1. What was built
- **A1. Literal previews.**
  - A pod star's preview in the round draws one rock per objective and one hive mark per threat. The
    caps of 24 and 5 are gone.
  - They come in groups of five, quincunxes, filling two corners, the other two, then the centre, so four
    reads as a square and five as a die.
  - The groups stand four high from the star's level up, then the next column starts further out
    (`groupSpot` replaces the sunflower).
  - A mark's place depends on its index alone, so a count that grows moves none.
  - The fixed footprint (`reachX` 340, INV-14) holds 60 rocks and 40 hive marks. Past that, columns run
    on outward and stay clear of the next star's marks, which start 710 away.
- **A2. Homeworlds explained.** The rule is kept, as decided: anyone who held a piece in the region this
  round has a planet.
  - **`seatReason`** (`engine/facts.ts`, pure) reads the same `heldSpans` that make seats. It returns one
    of three answers:
    - `holds` (how many);
    - `held` (the last piece, until when, and why it ended: `left`, `handed` or `off`);
    - `later` (the first, from when).
  - **The person's panel** has a new *Homeworld* section inside a region (*In this Area Path* under ADO
    names):
    - "Held #55181 · Parking permit lookup until Fri, Sep 25, then moved out, now in Signals Pod.
      Nothing held here now."
    - "…then handed to Hana Iwasaki-Brook."
    - "…then set aside."

**After the review (2026-10-14).** `seatReason` now names the cause in a fixed order when several
land at once: moved out, then set aside, then changed hands. One ADO save often moves a piece and
reassigns it; that read "handed" before. A hand-off to no one reads "unassigned", and `to` names who
held it next at that instant, not the assignee at the playhead. `meridian.test.ts` adds the same-instant
cases.

## 2. Contracts changed
- **15 §5 preview table:** the caps' rows and the sunflower spacing are replaced by the groups'
  (`rockPitch`, `rockStep`, `rockRow`, `hivePitch`, `hiveStep`, `hiveRow`, `groupRows`); the prose and
  `reachX` are updated.
- **13 §4.1:** *A planet says why it's there*.
- No change to 02 or 03. Seats are unchanged (INV-14).

## 3. Checks
- **Unit:** `npm test` passes (891).
  - `solarRound.test.ts`: exact counts for 0, 1, 5, 6, 24, 25 and 60 rocks and 0, 1, 5, 6 and 40 marks;
    groups distinct; prefix-stable; 60 and 40 inside the reach; a lone rock by its star.
  - `meridian.test.ts`: `seatReason` for Rook (`left`), Tove (`handed`), Ulla (`off`), Mara and Vash
    (`holds`, Vash's closed Bug counting); Rook before his move; Quin, not a seat (null).
- **Goldens:** `solar.round.json` and `meridian.round.json` accepted on purpose (preview marks only).
- **e2e:** `solar-dense.spec` passes (3): Rook's panel at the round's end.
- **Drive:** `v12-dense`, the round at rest (Convoy's 28 rocks in six groups, 9 marks in two) and each
  empty homeworld's panel.

## 4. Human gates
**HG-A-counts.** Judge the groups at the round's zoom (do they count at a glance?) and the homeworld lines.
Then check Spencer's planet in the live app against its line, pass or fail only (INV-18).

## 5. Known limitations and open questions
- A-Q1, an empty planet looking vacated, stays open.
- Past 60 rocks, a third column of groups reaches beyond `reachX`. It is still clear of the next star,
  but nearer it.
- "Moved out" names where the piece is now only when it is in the bundle. A piece moved out of the
  round's sprint names that sprint.

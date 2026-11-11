# Slice 1.3-F leftovers: load-proof tests and the merge cast

**Status:** built 2026-10-27; no human gate. Plan: [23-v1.3.md](../23-v1.3.md) Block F. Fixture data only (INV-18).
Follows F5's list of candidates. One app change (item 4); the rest is tests.

## 1. What was built
- **solar-dense, both "(22 A8)" tests (plate before body; plate unfurls).** The cause was a sample taken
  too soon after `play()`, not a slow read. `play()` puts the bodies' entrances in place on the next
  drawn frame, and the plates follow on the one after. Until then the plates are still the seek's. The
  first sample was 60 ms (25 ms in the unfurl test) of wall time after `play()`, which under load is
  before the first frame, so it saw 12 plates with no bodies. Reproduced under load: the first test
  failed 4/4, and the unfurl test showed `shown && !drawn` rows at `at: 36` ms. Both now
  `await frames(page, 3)` after `play()`. The assertions are unchanged.
- **slice2 "stepping shows the beat's state…".** The fixed 100 ms wait is now
  `expect.poll(() => fx().active).toBeGreaterThan(0)` (10 s ceiling), as AC-19 did.
- **activity "one indicator", the bead check.** It first waits on the condition (no filled bead, i.e. no
  call in flight; 60 s ceiling), then on the hollow beads ageing out. That ageing is the app's own
  `LINGER_MS`, not machine speed, so its 8 s ceiling stays.
- **Item 4: a merge or settle lost its attachment cast (real bug, fixed).** Checked with a scratch
  unit test over every planned `attachment.*` maneuver in pod-sprint (Harbor Pod): all 4 merges, all
  3 first-merges and the settle have the attachment's slot on the *before* board only
  (`aS=false bS=true`, and no node of its own on either board). The live `viewOf` found nothing, so
  `views()` dropped the part. The Power link and Satellite cycle draw from the facility and the people,
  so they still played; only the cast was incomplete (the `attachment` part, and the PR as `subject`,
  which `pace.ts` also casts for both rules). No label was lost: a slot view has a `host`, which
  `litOf` skips, and `attachment` isn't in `LABELLED`. `slotOf` now also searches the before board's
  compounds when the target board has no slot, and carries it on the same facility's view on the target board (matched by
  projection key). `castResolves` in the gallery mirrors that, and its documented departure is removed.
  Test: `tests/unit/commands.test.ts`, "an attachment that leaves its facility this beat… resolves
  from the before board's slot" (fails without the fix: `viewOf` returned null).

## 2. Contracts changed
None. `viewOf` resolves more casts; no 02/03/13 text changes.

## 3. Checks
- `npm run typecheck`, `npm run lint`: pass. `npm test`: 75 files, 1095 tests pass.
- Mapped specs (`solar-dense slice2 activity solar-play solar slice3a gallery-assets`): 73 passed (5.0 min).
- Each fixed test 3× in a row: A8 pair 6/6, slice2 3/3, activity 3/3.
- Under load (`--grep @keystone` alongside, `--repeat-each=3`): A8 pair, slice2 stepping, activity
  "one indicator" and 401/404: 18/18. The keystone run used as load: 41/41.
- `npm run e2e:keystone` alone: 41 passed (47.9 s). Full `npm run e2e`: not run (the block's close does).

## 4. Human gates
None.

## 5. Known limitations and open questions
- The unfurl test still checks the glance with wall time (`>= 350 ms` between drawn and shown). The
  plate's delay is itself wall time (`EMERGE_DELAY_MS`), and the check is a lower bound, so load only
  makes it easier to pass.
- A merging attachment now has a cast view, and the merge or settle subject resolves to its facility. Nothing
  in today's theme reads `c.attachment`, and the subject's extra claims duplicate the facility's (same time,
  same owner), so **nothing changes visibly on the chart**. The fix makes the cast complete for any later
  maneuver that reads it. In the gallery, `castResolves` now accepts more merge and settle occurrences, so a
  Power link or Satellite cycle cell may pick a different occurrence (audit, 2026-10-27).
- The new test checks `viewOf` directly; nothing tests the path through `views()`/`play()`.

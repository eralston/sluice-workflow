# Slice 1.3 C2: Standby in play

**Status:** built 2026-10-28 (fix round applied). Item: [23 §3 Block C](../23-v1.3.md#3-blocks), C2.

## 1. What was built
- **No fixture change was needed.** Quasar Pod's seeded data already has idle repos: `search-api` (last PR event
  Wed 16 Sep 21:01Z), `inbox-mobile` (Fri 18 Sep 20:46Z) and `checkin-worker` (Fri 18 Sep 18:28Z). The rule
  (02, 15 §10): none open and activity under 0.25 (strict `recency < STANDBY_BELOW`, halving daily), so a repo
  stands by at exactly two days after its last event. The scenario clock is America/Los_Angeles.
- **The example is `search-api`**: it stands by **Fri 18 Sep 21:01Z (about 2 PM Pacific)** while other repos
  are still working (PRs open and merge that day). The weekend quiets every station, so `checkin-worker`'s
  flip (Sun 20 Sep, in the weekend) would not stand out; it is not the example.
- Weekend and week-two census (drive, at beats): Sat 20 Sep evening Pacific, all ten stations are on standby. By
  Mon 21 Sep ~1:50 PM Pacific four are awake (booking-ui, loyalty-ui, search-gateway, and photos-ui by the end
  of the day); through Thu, calendar-api, payments-api and payments-sync wake as their PRs open. `search-api`,
  `inbox-mobile` and `checkin-worker` have no PR after week one and never wake. (So it is not "all wake on
  Monday".)
- `halcyonCoverage`: a Quasar check, computed from `ACTIVITY_HALF_MS` and `STANDBY_BELOW` (now imported from
  `solar.ts`; `ACTIVITY_HALF_MS` is newly exported, value unchanged), that `search-api` stands by on a Pacific
  weekday with some other repo's PR event within the next day.
- Drive step `tests/drive/steps/c2-standby.ts`: finds the beat where `search-api` flips, shoots a beat on Thu 17
  Sep (before) and the flip beat (after), prints the station census Sun, Mon and later, then plays at 4× and
  samples the tint (1.00 down to 0.70 over ~2.4 s).
- Docs: demo-script §3, 03 §8 (`sprint-pods` row), tests/README (drive step listed).

## 2. Contracts changed
None in code. 03 §8 and demo-script text only. Goldens: none moved (no data changed).

## 3. Checks
Drive: awake Thu 17 Sep 23:44Z (tint 1.00, activity 0.5); standby at the next beat after 21:01Z Fri, 22:14Z
(tint 0.70, activity 0.25); in play the tint eases 1.00 to 0.70. Stills: `review/v1.3/C/C2-before.png`,
`C2-after.png`, `C2-after-in-play.png`. Other checks: see the hand-back.

## 4. Human gates
Look at the stills (or play Quasar at 4× from Thu 17 Sep) and confirm the dim reads.

## 5. Known limitations and open questions
- It depends on the seed, so a reseed could lose it; the coverage test fails if so.
- Beats are sparse: the dim shows at the first beat after 21:01Z Fri, not at the exact minute; in play the
  playhead crosses the two-day mark between beats and the fade starts then.
- The merge is Wednesday of week one, not the first days; make it earlier only if the user wants.

# Slice 1.1-review: the user's review set for v1.1

Assembled 2026-10-14, after every item in [19 §3](../19-v1.1.md#3-items) was built and checked together
([slice-1.1-verify.md](slice-1.1-verify.md)). This note builds nothing in the app. It gives one place to
review v1.1 from: a tour through every item, each item's own stills regenerated on the combined tree,
the gallery cells, and what looked wrong while I went through them. **Update, 2026-10-14:** the one
high finding in §5 (the Title state showed a holo plate's subtitle) is fixed, guarded by a test, and
every still in `review/v1.1/` was taken again after the fix (§3).

## 1. What was built
- **The tour,** `tests/drive/steps/v11-tour.ts` (fixtures, `--paradigm solar`; with
  `--fake-ado pod-sprint --name v11-tour-ado` it connects to the fake org first). In order:
  - the galaxy at rest, Tidewater Array pointed at, then selected;
  - the round (Sprint 13) at rest with its previews, Harbor Pod pointed at, then selected (the
    inspector; Remove from View in ADO mode only);
  - Harbor Pod's region at its end, then at 60% of the round at rest;
  - a homeworld's plate expanded (Ossian's World, the most rows), a seated piece pointed at (Planet
    Wren's row lit), a dreadnought expanded (tide-gateway, its PRs), the map key;
  - play from the start at 2×, a still every 2.5 s (24 stills), then the end and 4.7 s after it.
  
  Each still's note in `console.log` lists the piece plates shown, the expanded plates, the belt's
  presence (0..1) and every station's open PRs, standby and tint.
- **Every item's drive re-run** on the combined tree (the full e2e in the verify run had cleared
  `test-results/`): `v11-L1`, `L2`, `L6`, `L7`, `L8`, `N1` (fake ADO), `P1` (fixtures, then
  fake ADO as `v11-P1-ado`), `P2`, `S1`, `S2`, `M1`. All passed, with no page errors. The gallery's
  *Label hierarchy*, *registry-dreadnought* (M1's standby cells), *v1-asteroids* and *v1-swarm* (S1)
  families were shot too.
- **The review set is in `review/v1.1/`**, copied out of `test-results/` (a Playwright run clears
  that folder, and the final full e2e will). `review/` is new in `.gitignore`. It holds stills of
  fixture data only, about 550 MB, and is never committed. One folder per drive, named as the steps
  file, plus `gallery-v1/`. Each folder has the PNGs, any JSON dumps and `console.log` (the dev logs
  were left out).
- `tests/README.md` gains the `v11-tour.ts` row.

## 2. Contracts changed
None. Edits outside the app:
- `.gitignore` (`review/`);
- `tests/README.md` (the tour's row);
- 19: the status line, a *Review* entry in §3 with its **State**, and §5 rows for the findings in §5
  below;
- `docs/progress/handoff.md`: the v1.1 row and the status line.

No golden changed and no `-u` was run.

## 3. Checks
| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` | Pass: 56 files, 873 tests (incl. `docTables`) |
| `npm run e2e:keystone` | 38 passed (53.8 s) |
| `GALLERY_FAMILY=labels,registry-dreadnought,v1-asteroids,v1-swarm npm run e2e:spec -- tests/e2e/gallery-v1.spec.ts` | 4 passed |
| Drives: `v11-tour` (fixtures, fake ADO), `v11-L1`, `L2`, `L6`, `L7`, `L8`, `N1`, `P1`, `P1-ado`, `P2`, `S1`, `S2`, `M1` | All 14 passed; no `pageerror` in any `console.log` |
| Full `npm run e2e` | Not run (the final phase does). It clears `test-results/`; `review/v1.1/` keeps the stills |
| **After the Title-state fix (2026-10-14)** | `npm test` 873 pass; typecheck and lint clean; full `npm run e2e` 144 + 21 pass. Every drive above and the four gallery families re-run and re-copied into `review/v1.1/` |

## 4. Human gates: what to look at
Paths are under `review/v1.1/`. "Gallery" means `npm run gallery`; the frozen copies are in
`review/v1.1/gallery-v1/`. To try it live, run `npm run dev` with Solar (the default), then
`npm run dev:fake-ado` for N1. The tour shows the items in the order you meet them. Each item's own
drive shows the detail.

**The tour** (`v11-tour/`; `v11-tour-ado/` is the same walk in fake ADO):
| Still | Scene and moment | Items |
|---|---|---|
| `01-galaxy-rest`, `02-galaxy-pointed`, `03-galaxy-selected` | All projects; Tidewater Array pointed at, then selected (the chooser in the inspector) | L1, L3 |
| `04-round-rest`, `05-round-harbor-pointed`, `06-round-harbor-selected` | Sprint 13's round at the round's end: Harbor Pod's 4 planets, 11 rocks and 5 hive marks, Lantern Pod's 2, 1 and 1; the pod star plates; Harbor Pod selected (`Area Path · 16 items · 10 done`) | P1, L4, N1 |
| `v11-tour-ado/03-galaxy-selected`, `06-round-harbor-selected` | Fake ADO: the last project's Remove from View, disabled with its reason; the pod star's Remove from View under *Enter pod system ›* | N1 |
| `07-region-end-star-selected` | Harbor Pod's region at its end, with its star still selected from the round (lifted, over Kit's Haven) | L1, L4 |
| `08-region-rest` | Thu Oct 8, 9:00: no piece plates; homeworlds T3, captains and dreadnoughts T1; the belt drawn (3 unassigned pieces) | L1, L7, S2 |
| `10-homeworld-expanded` | Ossian's World's plate pointed at: 8 rows, its rung marks | L2, L5 |
| `11-piece-pointed-row-lit` | Berth schedule export on Planet Wren's disc pointed at: the planet's plate opens with its row lit | L7 a |
| `12-dreadnought-expanded` | tide-gateway's hull pointed at: 7 PR rows, each `Pull Request #n · status` with `→` the work it serves | L6 |
| `13-map-key` | K in the region: 8 rows, all but Sprint sector and Galaxy marked here; Solar's three lines | P2 |
| `14-…` to `37-playing-24` | Play from Mon Sep 28 at 2×. Look at: `14` (Tide table widget's plate as it arrives), `18` (Mon Oct 5, the strike run on Alert sound loops: its plate, the red ring, the belt), `26` (Wed Oct 7, Harbor master dashboard landing, Tide offsets fading), `36` (Fri Oct 9, Planet Wren flaring, which looks like Homeworld complete). Captains are their squares throughout | L7 b, L8, S1, S2 |
| `38-end`, `39-end-settled` | The episode's end, then 4.7 s later (the finale) | — |

No station goes on standby in this playback: on `pod-sprint` none does (M1 below), so the notes show
every station at tint 1.

**By item.** The gates are HG-L1, HG-P1 and HG-M1. The rest are review stills.
| Item | What to look at | Gallery cell |
|---|---|---|
| **L1 (HG-L1)**, with L3, L4 | `v11-L1/`: `01`, `02` the galaxy at rest and pointed; `03`, `04` the round, Harbor Pod pointed; `05` the region with its star selected; `06` at rest (Planet Wren selected); `08` the star pointed; `09` a homeworld pointed; `10` playing at 2×. **Judge** T1 against T2 against T3, and T3's 0.4 frame over the feature sky. See §5: the *in play (title only)* column and `10` show subtitles they shouldn't | *Label hierarchy*, the four *tiers · …* cells (`gallery-v1/labels-c0.png`, top four rows) |
| L2, L5 | `v11-L2/`: `01` at rest; `02` Kit's Haven pointed on its disc (grown in place); `03` a row lit; `04` folded after the grace; `05` its plate pointed; `07` a dreadnought; `08` a seated piece; `09` a homeworld selected; `10` the same playing. **Judge** the rows' calm under a lifted head, and the plate covering pieces | *expanded · feature* (left pair) |
| L6 | `v11-L6/`: `02` tide-gateway's hull pointed (Thu Oct 8, 7 rows); `04` ledger-sync's row lit (two rings); `05` its plate pointed; `06` the row pressed (Pilot boat roster selected). **Judge** 3 lines a row, and 7 rows over the middle | *expanded · feature* (right pair) |
| L7 (experimental) | `v11-L7/`: `01` no piece plates at rest; `02` a seated piece pointed; `03` selected (ivory row, weight 600); `05` a frontier piece's own plate; `06` the inspector's Steps; `07` the strike run cast (Mon Oct 5); `09`–`12` play at 1×; `13` paused (the cast labels fade). **Judge** hover-only, the pause fade and the 1.5 s linger | — |
| L8 | `v11-L8/`: `01` initials squares at rest; `02` a captain pointed; `03` pictures laid in (`close-pictures-1` the wide one cropped); `04`, `05` playing (cut squares). **Judge** the 6 px cut on the 20 px square | *captains · feature* |
| N1 | `v11-N1/` (fake ADO): `01` the last project's button disabled; `02` the round, + Add an Area Path; `03` the picker above the button; `04` Reef Pod added; `05` selected (Remove from View); `06`, `07` departing, gone. **Judge** the quiet button and the picker's place | — |
| **P1 (HG-P1)** | `v11-P1/`: `01` the round at rest; `03` the long path (`…rbor Night Shift\Harbor Pod · 16 items`); `04` Harbor Pod pointed; `05` close up; `06` inside, for comparison. `v11-P1-ado/`: `01` the first look (Lantern Pod 1 planet), `03` after history (2, the first unmoved). **Judge** whether rocks read as stories and marks as bugs, the composition, the caps, and whether Off pieces should count | — |
| P2 | `v11-P2/`: `01` the key at All projects; `02` in the round; `03` in the region; `04` ADO wording. **Judge** *Pod star*, the sprint sector row, `Homeworld and captain · Assignee` | — |
| S1 | `v11-S1/sheet.png` (a row per zoom: three blue rims, then three red), `01-fit.png` (Ossian's World). **Judge** one weight for red and blue at each zoom. The *before* set wasn't regenerated (S1's note §4 says how) | *v1-asteroids*, *v1-swarm* (`gallery-v1/v1-asteroids-c*.png`, `v1-swarm-c*.png`) |
| S2 | `v11-S2/`: `01` no belt at the start; `02` the arriving beat, 150 ms in (no belt yet); `03` fading in with the first piece; `04` shown; `05` a seek back (gone); `06`–`08` a reassign (the belt holds); `09`–`16` All clear (no red; the sweep in `10`) | — |
| **M1 (HG-M1)**, experimental | `v11-M1/`: `01` pod-sprint's last beat (harbor-console, the closest, awake); `02-crm-region-end` crm-quarter's North Territory, Birchwood Mills and Osprey Freight on standby beside Quillon Dairy awake (and the `*-crop.png` files); `03` Birchwood pointed (lifts, expands); `04` reduced motion. **Judge** idle without broken, the 0.7 and 0.3 depth, two calendar days, and whether to try B | *Registry › facility*: `gallery-v1/registry-dreadnought-c0.png` (bottom-left cell awake) and `-c1.png` (on standby); live, each seeded cell powers down on its 6th step |

**Experimental, to be decided by you:**
- L7: pieces hover-only outside play, and labelled around their maneuvers in play (Q3).
- M1: option A only (standby). B (jump away) and C (shrink) wait on HG-M1.

## 5. Known limitations and open questions
**What looked wrong in the stills** (none fixed here; the brief for this step was to report, not fix):
1. **Fixed 2026-10-14.** The Title state showed a holo plate's subtitle (regression, high). In `holo.css`,
   `.callout.callout--holo .holo__meta { display: flex }` (added with P1's subtitle split) has the
   same specificity as `styles.css`'s `.callout.is-compact .callout__meta { display: none }` and loads
   later, so it wins. Checked in the DOM: every galaxy plate at rest has `data-tier="title"`,
   `is-compact`, and its meta's display is `flex`. As a result:
   - galaxies show `2 areas · 136 events this week` at rest (`v11-tour/01`; L3 meant the name only
     until pointed at);
   - in play, dreadnoughts keep `Repository`, the region's star keeps its path and count, and cast and
     arriving pieces keep `{type} #{id} · {state}` (`v11-tour/14`, `18`, `26`, `36`; `v11-L1/10`;
     `v11-L7/07`), where 19 §2 and L7 b say the title only;
   - the gallery's *in play (title only)* column shows subtitles too (`gallery-v1/labels-c0.png`), so
     **HG-L1 can't be judged as built until this is fixed**;
   - in `v11-L1/06` the region's star has no plate at rest, likely because the wider plate found no
     free place.
   
   **The fix:** that rule, `.callout.callout--holo.is-compact .holo__meta { display: none; }`, in
   `holo.css`. **The guard:** `solar.spec.ts`'s galaxy test now asserts that the subtitle is hidden at
   rest; it fails without the rule. With plates in their Title state narrower, the region's fit moved,
   which left ledger-sync's hull on the view's bottom edge under the status bar in the L6 test. That
   test now pans the hull clear before pointing at it (3 of 3 alone, and the full suite).
2. **A cast plate outlives the episode.** At the end, Tide offsets off by an hour keeps its plate 4.7 s
   after the session ended (`v11-tour/38`, `39`; noted in both). L7 fades cast labels on pause, but
   *ended* seems not to count as paused, so its window holds.
3. **Captain squares overlap the region star's plate in play.** KM in `v11-tour/14`, JA in `26`, SN
   on a piece plate in `39`, KM in `v11-S2/04`. The star stays selected from the round, so its plate
   is lifted and wide (wider still from 1). The squares hug their hulls, and the star's plate already
   covers Kit's Haven's disc (L1's note). Fixing 1 may shrink this.
4. **R3 mismatch on a CRM pod star.** crm-quarter's North Territory plate reads
   `…Pine Trading\North Territory · 8 items`, but its inspector reads `Area Path · 0 items`
   (`v11-M1/02`). The plate counts the preview's pieces (P1); the inspector's `detail` keeps v0's line,
   whose pod membership counts only User Stories and Bugs (M1's note §5). pod-sprint agrees (16 and 16).
5. **Smaller things:**
   - At All projects, Larch & Pine Trading's plate runs under the side panel at rest (`v11-tour/01`,
     `83 events this we…`).
   - In the round, Lantern Pod's one rock sits halfway between the two stars, so it doesn't read as
     Lantern's (`v11-tour/04`).
   - Under Solar the History panel still says `item #20214 joined container #20002` and
     `asteroid #20112 Ready → Underway` (`v11-tour/18`, `26`), close to P2's open History-card question.

**Known, from the item notes, and still visible:**
- An expanded plate covers its neighbours: tide-gateway's 7 rows over the region's middle
  (`v11-tour/12`), Planet Wren's over tide-gateway (`11`).
- Entering a region keeps its star selected, which hides its T3 rest state (`07`).
- No fixture shows a station going on standby or waking in play, and none shows the belt fading out.
  Both need a fixture edit that would move the Solar goldens (M1, S2 notes).

**Open questions, by item** (detail in each note's §5):
- L1: T3's frame over the feature sky.
- L2: the plate covering pieces.
- L6: the Feature dropped from Solar; status words.
- L7: the pause fade; 1.5 s linger; Steps in the inspector only.
- L8: the play square's chamfer.
- N1: the camera after a removal; the last pod.
- P1 (HG-P1): Off pieces in the count.
- P2: the History card's glyph for a Feature.
- S1: the balance by eye; victory gold's rim.
- M1 (HG-M1): calendar or working days; B and C.

# Slice 1.2-B1–B3: one vocabulary in two layers; the normalized names; one identity line

**Status:** built 2026-10-15. [22 §3, Block B](../22-v1.2.md#3-blocks): B1, B2 and B3.

## 1. What was built
- **B1. No toggle.**
  - The header's Star Chart / ADO switch is gone, with `store.vocab`, `loadVocab`/`saveVocab` and the
    redraw it triggered. A stale `starChart.vocab` key in localStorage is ignored.
  - Every former reader shows both layers: the ADO word in its surface's normal text, then the
    chart's, quieter. In the panels that is the `.metaphor` style (`--cyan-70`, 6.2:1 on ink); on a
    plate it is the subtitle's own colour in italics (`.holo__metaphor`), so its contrast holds.
  - **The surfaces:**
    - the inspector;
    - In view (`User Stories · asteroids`);
    - the trays;
    - the map key (the ADO column first);
    - the play gate (`Open an Area Path to play · solar system`);
    - the Steps heading (`Tasks · augmentations`);
    - the homeworld section (`In this Area Path · homeworld`).
  - The star's count line leads with ADO's words: `12 User Stories · 4 Bugs · star`. This supersedes
    A3's wording, as decided in 22 §5.
  - Buttons say ADO's thing (`Open Area Path ›`). `LooksLike` ("On the chart: …") always shows.
  - `v1/lines.ts` takes a register, not a vocabulary: `termsFor(h, 'source' | 'chart')`.
- **B2. The names.**
  - The theme's threat is an *enemy ship*.
  - The kind map (`vocab.ts`) now says Star (Area Path), Enemy ship (Bug) and Station (Repository).
    A person is *Assigned person* with *captain* (`SOLAR_NAMES.captain`), and the planet is still a
    *homeworld*.
  - `kindLine` returns both layers. A person reads `Assigned person · captain and homeworld`, the
    captain first, whichever form was pressed.
  - The kind map's Solar words now match the theme's (they disagreed before: Dreadnought against
    station), and `vocab.test.ts` holds them together.
  - The literal fence bans *enemy*. Internal names (`hive`, `swarm`, `DreadnoughtView`) are unchanged.
  - Trays: "Outside the pods" is now "beyond the stars".
- **B3. The identity line.**
  - `@shared/identity.ts` `identityLine(type, id, status)` gives `User Story · #1234 · Active`.
  - It is used by:
    - `workNode`'s meta;
    - the seat list rows and the facility list rows (`PR · #21008 · Completed`);
    - v0's flight meta;
    - the inspector's head and its item lists.
  - The chart's name is added after the line by the renderer, never in projection (the fence).
    - On plates it comes from `LabelInput.metaphor` and `roleWord`, through `MegaRow.role` (new).
    - Captain and homeworld plates are a name at rest. Their chart name shows only when pointed at,
      selected or expanded (and the plate is measured again).
  - **The inspector:** every body opens with `Head`: the title, then the identity line and its chart
    name. The kind line has moved from above the title to under it. The PR body's chip and its "PR"
    fact row are gone, since the line carries both.
  - **"PR":** an identity line names a pull request `PR`, from the SDLC pack's new `Noun.short`. With
    the full "Pull Request", one v0 PR plate in Unified quote ledger no longer had room and hid (the
    layout test caught it). Your own notes use `PR #…` too.

## 2. Contracts changed
- **06 §2:** *Learnability* is rewritten: the identity line, and *One vocabulary, two layers* replaces
  *Names toggle*.
- **12 §1** *Terminology*, **14** (the register row), **05** *Lines*.
- **15:**
  - §2 `--cyan-70`;
  - §4 `kinds` and `solar-kinds`, with the key's notes;
  - §6 the star-plate row;
  - the `{type} · #{id} · {state}` subtitles (15, 06, 13).
- **03:** `t.short(role)` and `Noun.short`.
- **`ViewNode` / `MegaRow`:** `MegaRow.role` is new.
- No departure from 02. The chart register still names no source type (INV-11's corollary): the two
  registers are shown side by side, never mixed.

## 3. Checks
- **Unit:** `npm test` passes.
  - `vocab.test.ts` (new): the kind map agrees with the theme; the normalized names; no retired name;
    the person's two forms.
  - The fence and `registries`, `solarSeek` and `sprints` are updated for the new line.
- **Goldens:** the scenes, seek and solar goldens were accepted on purpose (the meta format and
  `role` on rows, nothing else).
- **e2e:**
  - `slice1`: the toggle test is replaced (no toggle; title, then identity line, then the chart's
    name), and the title-bar screenshots were retaken on purpose.
  - `solar`: the key rows, the count line, the piece and PR plates, and the person's line.
  - `solar-dense` passes too.
- **Drive:** `v12-B` (its stills and notes).

## 4. Human gates
**HG-B-words:** the two layers on every surface (`review/v1.2/v12-B/`, the first eight stills), and
whether the muted words read without competing.

## 5. Known limitations and open questions
- v0 keeps its own metaphor words (Planet, Supply station). Its captain plate still reads
  `Captain · <call sign>`.
- The map key lists two *Assigned person* rows under Solar (captain and homeworld). The chart word
  tells them apart.

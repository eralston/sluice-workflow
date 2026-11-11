# Slice 1.1-N1: Remove from View, and Add, where the object is

Built 2026-10-13, following [19 §3](../19-v1.1.md#3-items) item N1, rule R2 and the §5 decision (Remove
from View unsaves the Area Path, as the ▾ uncheck does; local only; ADO mode only). Built on L1, L2,
L6, L7 and L8 ([slice-1.1-L1.md](slice-1.1-L1.md) and after). Of their work, only `Inspector.tsx`'s
Steps list (L7) shares a file with this item, and it is untouched. No human gate of its own. The stills
below are for the user's review.

## 1. What was built
- **`nav.ts`: `removable(key)` and `removeFromView(key)`.**
  - `removable` says what Remove from View would do for a selected object. A galaxy at the root gives
    `{ kind: 'project', last }`. A pod star in the round (the scope's scene of a `sprint` sector,
    whose pods include the key) gives `{ kind: 'area', projectKey }`. Anything else gives `null`, as
    does fixture mode (`caps().areaTree`).
  - `removeFromView` clears the selection, then calls the ▾ menus' own `unpinProject` or `removeArea`.
    Nothing new reaches ADO (INV-21): both change only the local pins and saved Area Paths.
- **The Inspector (`panels/Inspector.tsx`).**
  - **`RemoveFromView`** appears on a selected galaxy (`ProjectBody`, under its counts) and on a
    selected pod star (`PodBody`, under *Enter pod system ›*). It's a quiet button (`.enter-link--quiet`,
    ivory, so amber stays the way in), with the line "Changes this view only. Nothing changes in Azure
    DevOps." On the last project in view it's disabled, dashed, and the line gives the reason: "The
    last project stays in view: without one, the chart is the empty cosmos."
  - **`RoundAdd`**: in the round with nothing selected, **+ Add an Area Path** opens the + crumb's
    own `AddPicker`, above and right-aligned to the button. It's portalled to the body, because the
    inspector's `backdrop-filter` would otherwise make the panel the fixed picker's containing block,
    which clipped it in the first still. Choosing a row works as from the crumb: `addArea`, the star
    Arrives in place and is brought into view.
- **`AddPicker`** gains `up` (anchored by its bottom edge) and `onClose` (its own close, rather than
  the store's `adding`). The crumb's use is unchanged. Its head and placeholder now say "an Area Path"
  (they said "a Area Path").
- **Where it shows:** the same places as the ▾ menus' removals. Inside a region, its star (also an
  `area` node) has no Remove from View, since the round is where pods are chosen. The inspector and
  the round are shared code, so the v0 Sprints round and the Backlog galaxy get the same actions in
  ADO mode. Nothing on the v0 chart changed.
- **Drive:** `tests/drive/steps/v11-N1.ts` (`--fake-ado pod-sprint --paradigm solar`).
- **e2e:**
  - `onboarding.spec.ts`, *Remove from View*: on crowded-org's 10 pinned galaxies, the last is
    removed from the inspector. It Departs, the selection clears, and the project is still listed,
    unpinned. It's then added back with the + crumb, so the tests after see the same sky.
  - `slice4.spec.ts`, *Remove from View and Add in the round*: its own app, Solar, fake ADO on
    `pod-sprint`.
    - The one galaxy's button is disabled, with its reason.
    - Harbor and Lantern Pod are saved, then the round's + Add an Area Path adds Reef Pod (saved ones
      show as disabled). Its star Arrives.
    - Reef Pod's star is selected and removed. It Departs, the round stays, and the saved set is back
      to Harbor and Lantern.
    - Inside Harbor Pod's region there's no + Add.

## 2. Contracts changed
- **Renderer only:** `nav.ts` exports `Removable`, `removable`, `removeFromView`. `AddPicker` props
  gain `up?` and `onClose?`. New CSS: `.enter-link--quiet` (and `:disabled`), `.remove-view__why`.
  No shared contract, IPC, DB shape or 15-table constant changed. Favourites keep their shape, so 04
  needs no edit.
- **Doc edits:**
  - **06 §3**, *Adding to the loaded set*: a new *Where the object is* bullet covers the three
    inspector actions, where each shows, the last-project rule, and INV-21's line. The Inspector's
    Area Path list is now "a third way in".
  - **15 §9** `actions-ui` (unguarded): two rows, *Remove from View* and *Add an Area Path*; the Source,
    Guard and Update-when lines.
  - **19:** N1 **State**, and a §5 decision.
  - **tests/README:** a spec-map row and the `v11-N1.ts` drive row.
- **Departures from 02/03/13:** none.

## 3. Checks
| Check | Result |
|---|---|
| `npm test` (847, incl. `docTables`) | Pass |
| `npm run typecheck`, `npm run lint` | Pass |
| `npm run e2e:spec -- onboarding` (with the new test) | 7 passed. The first try failed the next test: after removing a galaxy, the 9-galaxy sky hid the first galaxy's label. Fixed by adding it back with + and pressing 0 (the opening view) |
| `npm run e2e:spec -- explore slice0 slice4 sprints` (with slice4's new test; sprints for the + crumb's picker and the shared round) | 22 passed |
| `npm run e2e:keystone` | 38 passed |
| `npm run drive -- tests/drive/steps/v11-N1.ts --fake-ado pod-sprint --paradigm solar` | Passed; stills reviewed |
| Goldens | None changed; no `-u` |
| Full `npm run e2e` | Not run (the run's final phase does) |

## 4. Human gates (review stills)
`npm run drive -- tests/drive/steps/v11-N1.ts --fake-ado pod-sprint --paradigm solar`, output in
`test-results/drive/v11-N1/`:
- `01-galaxy-selected-last-project`: Tidewater Array selected, the fake org's only project. The button
  is disabled (dashed), with the reason beneath it.
- `02-round-nothing-selected`: Sprint 13's round. The inspector's prompt, then + Add an Area Path.
- `03-round-add-picker`: the picker above the button. Harbor and Lantern Pod are checked (saved), and
  Reef Pod can be added.
- `04-round-reef-added`: Reef Pod's star, arrived and brought into view.
- `05-pod-star-selected`: Reef Pod selected. *Enter pod system ›* (amber), then Remove from View
  (quiet) and its line.
- `06-pod-star-departing`, `07-round-reef-removed`: it Departs and the inspector is back to the round's
  prompt. Check whether the quiet ivory button reads as secondary enough, and whether the picker
  belongs above the button or under the + crumb.

## 5. Known limitations and open questions
- **The camera stays put after a removal** (07: an empty patch where Reef Pod was), exactly as after
  the ▾ uncheck. Reframing on removal would be a separate change to `rescope` and `refreshProjects`.
- **Removing the round's last pod is allowed,** as in the ▾ menu. The sprint is then drawn with no
  pods. Hiding or disabling the button on the last pod would be a one-line rule in `removable`, if
  wanted.
- **v0 shares it.** The v0 Sprints round and the Backlog galaxy show the same inspector actions in ADO
  mode, because the inspector and the round are shared. The ▾ menus already offer the same removals
  there.
- **Unpinning from "All projects"** (nothing pinned) pins every other project, as `unpinProject` always
  has.

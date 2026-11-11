# Slice 1.1-P2: A map key for Solar

Built 2026-10-14, following [19 §3](../19-v1.1.md#3-items) item P2 and rule R3 (the outside matches the
inside). Built on L1–L8, N1, S2 and P1 ([slice-1.1-P1.md](slice-1.1-P1.md): the round's previews draw
`seat`, `objective` and `threat` nodes, which is what lets the key read the same in the round and in a
region). No human gate is named for P2; the stills below are for review.

## 1. What was built
- **Solar's map key** (`panels/MapKey.tsx`, `vocab.ts`):
  - It lists only what Solar draws at any level (`SOLAR_KEY`), in `KIND_ORDER`: Galaxy = Project,
    **Pod star = Area Path**, Captain = Person, Homeworld = Assignee, Asteroid = User Story,
    Hive ship = Bug, Dreadnought = Repository. No Feature, Planet, Anomaly, Mission point, Supply
    station or Cargo flight rows. The rows are the same at All projects, the round and a region; only
    the *here* marks differ. In the round, Pod star, Homeworld, Asteroid and Hive ship are marked here
    (P1's previews); in Harbor Pod's region, all but Galaxy.
  - Solar's words for a shared kind are `SOLAR_NAMES` (only `star` today), read through
    `kindNames(kind, paradigm)`.
  - **Sector rows:** v0's Area sector and Epic sector go. Solar has one, `SOLAR_SECTORS`:
    ◷ Sprint sector = Sprint (the round's breadcrumb glyph).
  - **Lines:** v0's (parent/child orbit, flight route, Task continuation) go. Solar's are
    `SOLAR_LINES`: the orbit arc (an assignee with work in this Area Path), the frontier belt
    (unassigned work, drawn only while there is some, as S2 built it) and the route (work being
    reassigned, in playback).
  - **Looks:** a pod star's stage is its pod's progress (`podStage`), so under Solar
    `explainStage(…, paradigm)` reads it as the pod's work (`POD_MEANING`). For example, it shows
    `Area Path · three quarters of its work resolved or done` where it used to show
    `Feature · Ready to Accept (In Progress)`.
  - **v0's key is unchanged:** `keyKinds('sprints' | 'backlog')` is the old filter, and v0 keeps
    `SECTORS`, `LINES` and the Feature meanings.
- **Object list** (`ObjectList.tsx`): groups use `kindNames`, so under Solar the star's group reads
  `Area Paths · pod stars` (it said `· stars`). The ADO half already came from the node's
  `typeName`, `Area Path`. The other groups already matched the chart.
- **Inspector kind line** (`kindLine` in `vocab.ts`, used by `Inspector.tsx`):
  - A pod star reads `Pod star · Area Path` (it said `Star · Area Path`).
  - A contradiction found while checking: in a region, a person is two forms (their homeworld and
    their captain), and pressing the captain selected the person, whose kind line said
    `Homeworld · Assignee`. Under Solar the line now names every selectable form of the selection:
    `Homeworld and captain · Assignee` (ADO wording: `Assignee`). A guest with no seat reads
    `Captain · Person`. v0 still names the inspected node alone.
  - `kindName` gained a `paradigm` argument.
- **Drive:** `tests/drive/steps/v11-P2.ts`.

## 2. Contracts changed, with doc edits
- No shared contracts changed; this is renderer vocabulary only.
  - `vocab.ts` adds `SOLAR_KEY`, `SOLAR_NAMES`, `kindNames`, `keyKinds`, `SOLAR_SECTORS`,
    `SOLAR_LINES` and `kindLine`, plus the private `POD_MEANING`.
  - `kindName(node, vocab, paradigm)` and `explainStage(stage, mapping, paradigm?)` take the
    paradigm.
- No departure from 02, 03 or 13: 13 §1's pillar *The outside matches the inside* already names the
  map key.
- **Doc edits:**
  - **15** §4: the kinds table's star row (Solar: a pod star), the *Solar's key* paragraph, a new
    `solar-kinds` table and the person's kind line, and the Source/Guard line. `docTables.test.ts`
    gains a `solar-kinds` check. It checks each row's words, that the row cites the words Solar
    actually reads (`SOLAR_NAMES` before `KINDS`), and that the rows' order is `keyKinds('solar')`.
    I confirmed it fails when the star row cites `KINDS.star`.
  - **06** §2 *Learnability*: an *Under Solar* bullet.
  - **19**: P2's **State**, and three §5 decisions.
  - **tests/README**: a mapping row for `vocab.ts` and the panels, and the `v11-P2.ts` drive row.
- **Goldens:** none changed, Solar's or v0's (the change is renderer-only).

## 3. Checks
| Check | Result |
|---|---|
| `npm test` (857, incl. `docTables` `kinds` and the new `solar-kinds`) | Pass |
| `npm run typecheck` | Pass |
| `npm run lint` | **3 errors, none mine:** `chart/art/aura.ts` (lines 92 and 226) and `tests/drive/steps/tmp-s1.ts` (line 22), all `no-explicit-any`, in S1's uncommitted work. `eslint` over every file I touched passes |
| `npm run e2e:spec -- solar`. New: the round's key rows and *here* marks exactly; a pod star's look reads `Area Path · …`; the frontier belt line; no v0 words (Feature, Planet, Anomaly, Supply station, Cargo flight, Area sector, Epic, Task). In the region: the *here* rows, then a seated person's ship pressed on the chart reads `Homeworld and captain · Assignee`, and the list's first group is `Area Path · pod star` | 19 passed. One run had a failure in L7's *pieces are hover-only* test (a frontier plate's meta not found); it passed on the next three runs and on this item's code, so it looks flaky (L7's area, not changed here) |
| `npm run e2e:spec -- slice1 onboarding board` (v0's key: Feature, the Story look, `Task →`, no Hive ship; the object list's groups; `Star · Feature` and the ADO toggle) | 29 passed |
| `npm run e2e:spec -- sprints explore solar` | 33 passed |
| `npm run e2e:keystone` | 38 passed |
| Drive `v11-P2.ts --paradigm solar` | Passed, no page errors; stills reviewed |
| Full `npm run e2e` | Not run (the run's final phase does) |

## 4. Human gates
No HG is named for P2. For review, regenerate the stills (an e2e run clears `test-results/`):
`npm run drive -- tests/drive/steps/v11-P2.ts --paradigm solar` → `test-results/drive/v11-P2/`.
- `01-galaxies-key`: All projects. The key has 8 rows, Sprint sector through Dreadnought, with only
  Galaxy marked here, and Solar's three lines.
- `02-round-key`: Sprint 13's round. Pod star, Homeworld, Asteroid and Hive ship are marked here.
  Under *Looks in this view*, the two pod stars read `Area Path · three quarters of its work resolved
  or done` and `Area Path · some of its work under way or resolved`. The object list reads
  `Area Paths · pod stars 2`.
- `03-region-key`: Harbor Pod's region. Every row but Sprint sector and Galaxy is marked here, and the
  inspector reads `POD STAR · AREA PATH` (the CSS sets it in capitals).
- `04-region-key-ado`: the same in ADO wording. The key's columns swap (Area Path / Pod star), and the
  inspector on a person reads `ASSIGNEE`.
- The drive's notes (in its output) list every row, the object list's group heads, and the kind line
  for each Solar kind in both wordings.
- **Judge:**
  - The chart word **Pod star** (the docs' own term), rather than *Star*.
  - Whether the key should name the sprint sector at all, since you're inside it in the round.
  - The person's `Homeworld and captain · Assignee` line.

## 5. Known limitations and open questions
- **Solar's pieces have no entry under *Looks in this view*.** Their stages are encoded pieces
  (`encodePiece`), not `LOOKS` keys, so the key explains only the pod star's look in Solar. That
  isn't a contradiction (R3), but it's a gap. The looks are in 09 §9, and explaining them per rung
  would be its own item.
- **History cards under Solar:** a Feature's card (role `container`) still uses the star glyph with
  the tooltip `Star · Feature` (`ROLE_KIND` in `History.tsx`), though Solar draws no Features.
  `kindNames` would make it read Pod star, which is worse. It needs a glyph of its own, or no glyph.
  I left it unchanged.
- **The key's lines aren't filtered by what's here:** at All projects, Solar's three lines show
  though none is drawn there. This matches v0, which lists its lines everywhere.
- **The Sprint sector row is never marked here,** even in the round, as v0's sector rows never are.
- The person's two forms: the object list still lists a seated person once, under Assignees as their
  homeworld (it dedupes by key, as before), so People lists only the guests.

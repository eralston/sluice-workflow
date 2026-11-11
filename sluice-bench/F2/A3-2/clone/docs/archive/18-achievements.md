# 18 — Achievements (brainstorm)

**Status:** brainstorm, 2026-10-10. P2. It feeds [13 §8](13-game-design.md#8-achievements-decided-2026-10-10).
Nothing here is decided until the list is picked at HG-V2.

An achievement recognises something the viewer did in a round. It's a small, personal "well done",
never a score. The vocabulary is [12-glossary.md](12-glossary.md); SDLC readings are in brackets.

## 1. Rules for every achievement

- **Personal.** One person earns it, for what they did. It never compares, ranks or totals people
  (INV-19, pillar 2).
- **Viewer only, in v1.** Only the captain chosen in Settings → *Your captain* earns achievements
  ([13 §7](13-game-design.md#7-settings-and-the-viewer-decided-2026-10-10)). Nobody else's are
  computed or shown. With no captain chosen, there are none.
- **Outcome-based.** It's earned from dated events in the round: arrivals at a state (an objective
  reaching Accomplished), merges, approvals. It's never earned from undated observations (INV-02) or
  from activity volume (edits, comments, hours logged).
- **One round at a time.** It's computed from the round's loaded history, so the same history always
  earns the same achievements (INV-12 to INV-15). The engine computes it purely in `src/shared/`, in
  engine terms; the domain pack supplies the names and thresholds.
- **Earned, never lost.** There's no "missed" achievement, no progress bar toward one, and nothing
  drawn for an absence.
- **A fixed bar, not a count.** A hat trick means three in the round, and the badge is all that
  shows. There are no tiers that grow with volume, no XP and no streak counters.
- **Hard to game against quality.** Prefer outcomes a team is glad to see more of (finishing,
  limiting WIP, short lead times) over ones that reward splitting work. Each candidate notes its
  risk.
- **Local and read-only.** Nothing is written to ADO (INV-21) or exported. The dev log records only
  hashes and counts (03 §10).

Peer **mission commendations** ([90-later](90-later.md)) are a different thing: notes one person
gives another. Achievements are earned from the data alone.

## 2. Candidates

| Achievement | Earned when (engine terms) | SDLC reading | Data | Notes and risk |
|---|---|---|---|---|
| **Clear skies** | Every objective and threat on the viewer's seat at the end of the round is Accomplished | All your Stories and Bugs in the sprint closed | Assignments, state arrivals (have) | Counts only what the seat holds at round end, and ignores Off pieces. It could discourage taking on work late; watch for that |
| **Hat trick: landings** | Three of the viewer's objectives reach Accomplished in the round | 3 Stories closed | State arrivals (have) | Low risk of splitting Stories to get there |
| **Hat trick: defences** | Three threats on the viewer's seat are defeated in the round | 3 Bugs closed | State arrivals (have) | Rewards defeating threats, never finding or causing them. Threats belong to the work ([10](10-v1-charter.md#combat-safety)) |
| **Hat trick: reviews** | The viewer approved three attachments that merged in the round | Approved (vote 10 or 5) 3 PRs completed in the sprint | Approvers at completion (built, 04 §6a) | Per-vote history is later (90-later). A rubber-stamp risk; pairing it with merges helps |
| **Swift passage** (lead time) | An objective goes from its first Underway to Accomplished within *N* working days | A Story goes from Active to Closed within *N* days | State arrivals (have) | *N* is set by the pack (A2). Small Stories earn it more easily, which is mostly a good nudge |
| **Steady hands** (limited WIP) | All round, the viewer never has more than *K* of their own pieces Underway at once, and at least one reaches Accomplished | Never more than *K* Active at once, with at least one Closed | State intervals (have) | The "at least one" stops an idle round from earning it. *K* is set by the pack (A3) |
| **Clean landing** | An objective lands with all its steps already Accomplished | A Story closed after all its Tasks closed | Step states (have) | Low risk |
| **Wingman** | The viewer acts on a piece held by another seat, and it's Accomplished in the round | You closed a Task on, or authored or reviewed a PR for, someone else's Story or Bug that closed | Changed-by, PR links (have) | Co-operative play: rewards helping |
| **Frontier scout** | The viewer takes a piece from the frontier and sees it Accomplished in the same round | You picked up an unassigned Story or Bug and closed it | Assignment changes (have) | Low risk |
| **Same-round defence** | A threat on the viewer's seat appears and is defeated in the same round | A Bug created and closed in the sprint | State arrivals (have) | Low risk |
| **Delivery** | An attachment the viewer authored merges, and its linked objective or threat is Accomplished in the round | Your PR completed, and its Story or Bug closed | PR author, links (have) | Low risk |
| **First light** | The viewer's first landing or defence of the round | Your first Story or Bug closed this sprint | State arrivals (have) | Gentle, but may make achievements feel cheap. Probably drop |
| **Green guard** (later) | A guard run on the viewer's attachment passes on its first run | Your PR's build passes first time | Pipeline runs (not ingested yet) | Waits for the pipeline slice |

## 3. Presentation (ideas)

- **In playback.** When the beat that earns it plays, a small insignia lights on the viewer's ship.
  It's an ornament-tier effect, and it never interrupts a protected moment. Under reduced motion it
  appears without the flourish.
- **In the recap.** The episode's recap bloom ends with the viewer's insignia for the round.
- **In Settings → Your captain.** A list of this round's achievements, each with one line on why it
  was earned and links to the pieces involved.
- **Never on anyone else's** ship, planet or label.
- **Art follows [09](09-signal-ladder.md).** Insignia are Accomplished gold, and each achievement
  has its own shape, so hue is never the only signal (INV-20). They're reviewed in the gallery.

## 4. What the engine needs

- A pure function over the viewer, the round and its history, in `src/shared/`, in engine terms.
- Inputs: assignments over time, state arrivals with their categories and rungs, step states,
  attachment authors and approvers at completion, and frontier pickups. Pipeline runs come later.
- Thresholds (*N*, *K*) come from the domain pack, so the todo and CRM packs can set their own.
- Golden tests on synthetic fixtures for each achievement, including near misses.

## 5. Open questions

- **A1 Which candidates make v1?** *Recommendation:* Clear skies, the three hat tricks, Steady
  hands, Swift passage, Clean landing and Wingman.
- **A2 The lead-time bar.** Is it fixed per pack, or measured against the viewer's own past rounds?
  *Recommendation:* fixed per pack (3 working days for SDLC). Own history needs more than one round
  loaded.
- **A3 The WIP limit.** *Recommendation:* *K* = 2 for SDLC.
- **A4 Across rounds.** Should achievements build into a personal log across rounds?
  *Recommendation:* not in v1; each round stands alone.
- **A5 Opting out.** Can the viewer turn achievements off? *Recommendation:* yes, with a switch in
  *Your captain*.
- **A6 Todo and CRM readings.** *Built:* each pack sets its own (`PackThresholds`, with a 12-hour
  working day in all three):

  | Pack | Swift passage | Steady hands (*K*) | Why |
  |---|---|---|---|
  | SDLC (`packs/sdlc/thresholds.ts`) | 3 working days | 2 Underway at once | A2 and A3 above |
  | Todo (`packs/todo/index.ts`) | 2 working days | 3 Doing at once | Chores wait for evenings, which weigh little; a household juggles |
  | CRM (`packs/crm/index.ts`) | 10 working days | 4 deals and escalations In progress at once | A deal takes weeks, not days; a rep works several |

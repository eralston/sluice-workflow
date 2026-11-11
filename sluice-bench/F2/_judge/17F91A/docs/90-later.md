# 90 — Later

**Status:** emptied 2026-10-27; v1.3's last answers and gate tweaks (2026-10-29) went to v1.4's intake, [27](27-v1.4.md). In v1.3's backlog review, every row was built into the plan
([23 §3](archive/23-v1.3.md#3-blocks), Blocks B–F), closed, or removed. Each decision is in
[23 §5](archive/23-v1.3.md#5-decisions). Earlier contents are in git history.

Work deferred from v1.4 on goes here, one row per item, with notes for whoever picks it up and the
item's source.

| Item | Notes for when it's picked up | From |
|---|---|---|
| Foreshadow lock | When a volley is coming, its targets get a quiet lock ring a beat early while unrelated work plays, so the viewer anticipates the payoff and the tell overlaps other motion. A candidate from v1.4's scoping, not picked | [27](27-v1.4.md) Decisions, 2026-10-29 |
| Role glow's reach | The live role glow (`art/aura.ts`) is clipped to the keyline's box, so it is invisible beyond about 4 px, probably not 19 S1's intent. C1's contrast was tuned on today's look, so the same fix round found the rim ignores `RIM_ALPHA` (it draws at full strength; 15 §8), so the re-tune covers both; restoring the reach means re-tuning `AURA_BALANCE` and re-running `c1-contrast`. Found by C3's fix round (`docs/progress/v1.4/work/C3/profile-note.md`) | [27](27-v1.4.md) Decisions, 2026-11-01 |

**Source:** the plan's deferrals · **Update when:** an item is deferred, built (drop it) or picked up.

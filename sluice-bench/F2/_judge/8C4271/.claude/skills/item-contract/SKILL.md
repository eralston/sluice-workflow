---
name: item-contract
description: The contract every sluice agent follows (planner, builder, clerk, reviewer, fixer, auditor) - where its files are, what it writes, how it ends. Preloaded into those agents; not for the main session.
---

# The item contract

You are one role in the sluice (its design doc is `designDoc` in `.claude/sluice/config.json`). Your launch message starts with a header line,
`sluice: tranche=… item=… role=… tier=… round=…`, followed by your work folder, the scope doc, the start
commit and your task.

**Read narrowly.**
- Read your work folder first.
- Then the project notes: the file `projectNotes` in `.claude/sluice/config.json` names, if it exists. They
  hold this project's sources of truth, review lenses and ways to verify. Apply what fits your item.
- Extract your item from the scope doc by its heading:
  `awk '/^### <ID> /{p=1;print;next} /^### /{p=0} p' <scope doc>`. Read the rest of that doc only if
  your item points at it.
- Read the files the packet names, starting with the line ranges it gives.

**Write your run record before you finish:** `<work folder>/<role>-<round>.json`, in the format in
`.claude/skills/sluice/formats.md`. Use `build` for the builder, `fix` for the fixer, `plan`, `review`,
`clerk` and `audit` for the others. Never edit another run's record.

**Stay inside your item.** Note neighbouring problems under `limitations`; don't fix them. Don't refactor
what the packet doesn't name.

**Checks:**
- Builders, fixers and clerks get a gate: when you finish, the checks under `gate` in
  `.claude/sluice/config.json` run (typically typecheck, lint and unit tests), and a failure
  is handed back to you. Run the packet's mapped tests yourself before finishing (`mappedTestsGuide` in
  `.claude/sluice/config.json` says how); don't run the full suite.
- If a check fails for a reason outside your item, re-run it once. If it still fails, say so in your record
  and stop.
- Only update a golden or snapshot that your item meant to move. Check its diff line by line, and say
  which file and why.
- If the header says `parallel=yes`, wrap every command listed under `lockedCommands` in
  `.claude/sluice/config.json` in `.claude/sluice/with-lock.sh`.

**Never** commit, push, or change git branches: the orchestrator commits. The project's hard rules in
CLAUDE.md apply to you in full.

**Report honestly.** If something isn't done, didn't pass, or you deviated from the packet, say so in
your record. A green claim must match the checks you actually ran.

**Your final message** is at most 8 lines: the verdict, the record's path, and anything the orchestrator
must decide. The details belong in your files, not in the message.

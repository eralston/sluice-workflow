# The first session

After the bootstrap, start a **new** Claude Code session in the project, and paste one of these.

## An existing project

```text
Let's start a tranche of work with the sluice. Call it <tranche name>.

Here's what I want, in my own words:
<your notes: features, bugs, ideas, in any order>

Run /sluice scope. Read the code the notes touch. Then ask me multiple-choice questions, a few at a
time, until every item has acceptance checks that someone could run, and every open question has
your recommendation. Group the items into blocks: small, low-risk items first, so the first block also
proves the sluice's plumbing. Show me the scope doc and the block plan. Don't build anything until I
say "run".
```

When you're happy with the scope doc:

```text
/sluice run <path to the scope doc> A
```

While it runs, open `<progressDir>/<tranche name>/views/now.md` in a Markdown preview (in VS Code, "Open
Preview to the Side"). It redraws on every agent launch and stop; `board.md`, `pipeline.md`,
`timeline.md` and `effort.md` sit beside it.

After the block:

```text
/sluice summary <tranche name> A
```

## A new project, or one without tests

```text
Let's start this project with the sluice. Call the first tranche <name>.

What I want to build:
<your notes>

Run /sluice scope. Make Block A the foundation the sluice's gate needs: the project skeleton, a test
runner with one smoke test, a linter and a typecheck (or this stack's equivalents), each runnable as
one command. Put those commands into .claude/sluice/config.json as the gate when they exist. Then scope
the first features as Block B, with acceptance checks that run against that test runner. Ask me
multiple-choice questions as you go. Don't build until I say "run".
```

## Tips

- **Write notes the way you'd talk.** The scoper turns them into items, and its questions catch the gaps.
- **Every item needs a check you could run.** If you can't say how you'd know it's done, the scoper will
  ask; that question is the most valuable one.
- **Between blocks, compact or start fresh** (`/compact`, or a new session with `/sluice run <scope doc>`).
  The files carry everything the next block needs.
- **At the end, look at the work yourself,** and record anything you find under *Escapes* in the block
  note.

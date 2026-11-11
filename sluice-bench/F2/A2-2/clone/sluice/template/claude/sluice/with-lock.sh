#!/usr/bin/env bash
# Runs a command while holding the sluice's shared lock, for commands that share one build folder or
# port (listed as lockedCommands in config.json). Only needed when agents run in parallel.
# Usage: .claude/sluice/with-lock.sh <command…>
set -u
dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}/.claude/state"
mkdir -p "$dir"
lock="$dir/build.lock"
until mkdir "$lock" 2>/dev/null; do
  # Clear a lock left by a process that no longer exists (a missing pid means it's being taken now).
  pid=$(cat "$lock/pid" 2>/dev/null || true)
  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then rm -rf "$lock"; continue; fi
  sleep 2
done
echo $$ > "$lock/pid"
trap 'rm -rf "$lock"' EXIT
"$@"

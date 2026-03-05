#!/usr/bin/env bash
# Unified launcher for c (built) and c-dev (tsx from source).
# Symlink as ~/bin/c and ~/bin/c-dev — behavior determined by invocation name.
#
# c [args...]              Run built dist/index.js
# c-dev                    Run tsx on main source (no args)
# c-dev -- [args...]       Run tsx on main source with args
# c-dev <worktree> [--] [args]  Run tsx on worktree source

set -euo pipefail

# Resolve repo root by following symlink
SCRIPT="$(readlink "$0" 2>/dev/null || echo "$0")"
REPO="$(cd "$(dirname "$SCRIPT")/.." && pwd)"
CMD="$(basename "$0")"

case "$CMD" in
  c)
    exec node "$REPO/dist/index.js" "$@"
    ;;
  c-dev)
    if [ $# -eq 0 ]; then
      exec "$REPO/node_modules/.bin/tsx" "$REPO/src/index.ts"
    elif [ "$1" = "--" ]; then
      shift
      exec "$REPO/node_modules/.bin/tsx" "$REPO/src/index.ts" "$@"
    else
      worktree="$1"; shift
      [ "${1:-}" = "--" ] && shift
      if [ "$worktree" = "main" ]; then
        entry="$REPO/src/index.ts"
      elif [ -d "$REPO/.claude/worktrees/$worktree" ]; then
        entry="$REPO/.claude/worktrees/$worktree/src/index.ts"
      else
        entry="$REPO/.claude/worktrees/c-$worktree/src/index.ts"
      fi
      if [ ! -f "$entry" ]; then
        echo "Not found: $entry" >&2
        echo "" >&2
        echo "Available worktrees:" >&2
        for d in "$REPO/.claude/worktrees"/*/; do
          [ -d "$d" ] && echo "  $(basename "$d")" >&2
        done
        exit 1
      fi
      exec "$REPO/node_modules/.bin/tsx" "$entry" "$@"
    fi
    ;;
  *)
    echo "Unknown invocation: $CMD" >&2
    exit 1
    ;;
esac

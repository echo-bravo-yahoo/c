#!/usr/bin/env bash
# Generate README screenshots using VHS.
# Run from the repo root: bash scripts/generate-screenshots.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

chmod +x scripts/demo-bin/c

for tape in assets/new.tape assets/list.tape assets/list-all.tape assets/show.tape assets/resume.tape assets/archive.tape; do
  echo "Recording $tape..."
  # Substitute __REPO_ROOT__ placeholder with actual path
  tmp=$(mktemp)
  sed "s|__REPO_ROOT__|$REPO_ROOT|g" "$tape" > "$tmp"
  /opt/homebrew/bin/vhs "$tmp"
  rm "$tmp"
done

echo "Done. Screenshots in assets/"

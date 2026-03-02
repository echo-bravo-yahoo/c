#!/usr/bin/env bash
# Wrapper that mimics `c` for demo screenshots.
# Routes commands to the demo-seed.ts script.
cd "$(dirname "$0")/.."

case "$*" in
  "list --all") cmd=list-all ;;
  list)         cmd=list ;;
  show*)        cmd=show ;;
  *)            cmd=list ;;
esac

C_HOME=/tmp/c-demo exec npx tsx scripts/demo-seed.ts "$cmd" 2>/dev/null

#!/usr/bin/env bash
# Shell wrapper for VHS that adds demo-bin to PATH
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$SCRIPT_DIR/demo-bin:$PATH"
exec zsh -f "$@"

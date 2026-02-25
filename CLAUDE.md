# c - Claude Code Session Manager

## Build
npm run build

## Architecture
- Hooks in `src/hooks/` handle Claude Code lifecycle events
- Session state stored via `src/store/`

## Limitations
- `/rename` in Claude Code cannot be captured by hooks; use `c title` instead

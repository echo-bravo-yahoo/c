# c - Claude Code Session Manager

## Build
npm run build

## Architecture
- Hooks in `src/hooks/` handle Claude Code lifecycle events
- Session state stored via `src/store/`

## Notes
- `/rename` titles are read directly from Claude's transcript files

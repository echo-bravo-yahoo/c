# c - Claude Code Session Manager

## Build
npm run build

## Architecture
- Hooks in `src/hooks/` handle Claude Code lifecycle events
- Session state stored via `src/store/`

## Notes
- `/rename` titles are read directly from Claude's transcript files
- Interactive Claude TUI cannot be tested from within a Claude session — `spawn('claude', ..., { stdio: 'inherit' })` deadlocks on TTY. Use `--print` mode for non-interactive flag/arg testing; test interactive launch from a separate terminal.

# c - Claude Code Session Manager

## Build
npm run build

## Architecture
- Hooks in `src/hooks/` handle Claude Code lifecycle events
- Session state stored via `src/store/`

## Testing

### Command tests
Command tests use `test/helpers/cli.ts` to run commands through `createProgram().parseAsync()`. This exercises argument parsing, store persistence, output formatting, and error handling end-to-end.

```ts
import { setupCLI } from '../helpers/cli.js';

let cli: CLIHarness;
beforeEach(() => { cli = setupCLI(); });
afterEach(() => { cli.cleanup(); });

it('does something', async () => {
  await cli.seed({ id: 's1', state: 'busy' });   // populate store
  await cli.run('command', '--flag', 'arg');       // run through Commander
  const s = cli.session('s1');                     // assert store state
  assert.ok(cli.console.logs.some(l => l.includes('expected output')));
});
```

- **Do not** reimplement command logic inline (pushing to arrays, setting state, filtering) — run the real command.
- Seed sessions via `cli.seed()`, assert store state via `cli.session()` / `cli.index()`.
- Assert console output via `cli.console.logs` / `cli.console.errors`, stdout via `cli.stdout.output`, exit codes via `cli.exit.exitCode`.

### Commands that access Claude session data
Commands that import from `src/claude/sessions.ts` (e.g. `list`, `clean`) need `mock.module` **before** any imports that pull in that module. Use dynamic imports:

```ts
import { mock } from 'node:test';
import { resolve } from 'node:path';

mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: { getClaudeSession: () => ({ id: 'stub' }), /* ... */ },
});

const { setupCLI } = await import('../helpers/cli.js');
```

### Commands that spawn external processes
Commands that exec/spawn (`new`, `resume`, `tmux-pick`) cannot be tested through `parseAsync()`. Test their pre-spawn logic directly as unit tests.

## Notes
- `/rename` titles are read directly from Claude's transcript files
- Interactive Claude TUI cannot be tested from within a Claude session — `spawn('claude', ..., { stdio: 'inherit' })` deadlocks on TTY. Use `--print` mode for non-interactive flag/arg testing; test interactive launch from a separate terminal.

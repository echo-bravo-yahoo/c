/**
 * CLI routing integration tests.
 *
 * Only the two tests below that route an unrecognized/implicit positional to
 * `list` depend on the isDirectRun-gated argv-splicing block at the bottom of
 * src/index.ts, which fires only when the file is executed as the real
 * process entry point (checked via realpathSync(process.argv[1]) against
 * import.meta.url) -- never when createProgram() is imported and driven
 * in-process. Those two are the only tests that spawn a real subprocess.
 *
 * Everything else here is a pure Commander dispatch/output check against the
 * same createProgram() config and runs in-process via setupCLI(), which is
 * both far cheaper and immune to subprocess-spawn cost under host load.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// `list` transitively reads real Claude session data via src/claude/sessions.ts
// (CLAUDE_DIR is a module-load-time constant derived from os.homedir(), so it
// is NOT affected by setupCLI()'s C_HOME override) and via src/util/process.ts's
// collectLiveSessions() (reads ~/.claude/sessions). Mock both so this test
// stays hermetic and independent of whatever the host's real ~/.claude
// contains -- same requirement as test/commands/list.test.ts's "empty state"
// test, which this mirrors for a bare, unseeded store.
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => ({ id: 'stub' }),
    listClaudeSessions: () => [],
    getClaudeSessionTitles: () => ({ customTitle: null, summary: null }),
    getClaudeSessionsForDirectory: () => [],
    readClaudeSessionIndex: () => null,
    getPlanExecutionInfo: () => null,
    getPlanExecutionInfoBefore: () => null,
    getPlanContinuationInfo: () => null,
    findTranscriptPath: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    getCwdFromTranscriptHead: () => null,
    findClaudeSessionIdsByTitle: () => [],
    decodeProjectKey: (k: string) => k,
    encodeProjectKey: (d: string) => d,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    extractPlanTitle: () => null,
    listClaudeSessionSizes: () => new Map(),
  },
});

const { makeProcessMock } = await import('../helpers/live-mock.ts');
mock.module(resolve('src/util/process.ts'), {
  // Always-empty index: this file never seeds sessions, so there is nothing
  // for reconcileLiveState()'s liveness projection to reconcile against.
  namedExports: makeProcessMock(() => ({ sessions: {} })),
});

type CLIHarness = import('../helpers/cli.ts').CLIHarness;
const { setupCLI } = await import('../helpers/cli.ts');

describe('c', () => {
  describe('cli', () => {
    describe('routing', () => {
      describe('argv-splicing to implicit list (subprocess)', () => {
        const CLI_PATH = join(import.meta.dirname, '..', '..', 'src', 'index.ts');

        // Fixed, generous ceiling -- not scaled to host load. spawnSync only
        // blocks for as long as the child actually takes, so raising this
        // costs nothing in the success path on fast/idle machines (it only
        // matters when a child is genuinely hung). 30s gives >4x margin over
        // the worst measured cold-start under synthetic 8-way CPU contention
        // on this Pi (4.5-6.9s with the old tsx-based invocation) and 3x
        // margin over the old 10s ceiling, which a real ambient-load run on
        // this host actually exceeded once (a `status: null` timeout-kill).
        // Switching this file's subprocess invocation to
        // --experimental-strip-types below (from `--import tsx`) already
        // roughly halves the typical cold-start cost and removes tsx's
        // load-sensitive esbuild-transform step entirely, so 30s is expected
        // to be reached only in a genuine hang -- this value is deliberately
        // sized against the worse (tsx-based) numbers already on record,
        // treating the strip-types switch as a bonus margin, not the basis
        // for a smaller number.
        const SUBPROCESS_TIMEOUT_MS = 30_000;

        function run(...args: string[]) {
          const tmpHome = mkdtempSync(join(tmpdir(), 'c-test-'));
          return spawnSync('node', ['--experimental-strip-types', CLI_PATH, ...args], {
            env: { ...process.env, HOME: tmpHome },
            timeout: SUBPROCESS_TIMEOUT_MS,
            encoding: 'utf-8',
          });
        }

        it('routes unknown positional to implicit list', () => {
          const result = run('nonexistent');
          assert.strictEqual(result.status, 0);
        });

        it('routes "prune" to implicit list', () => {
          const result = run('prune');
          assert.strictEqual(result.status, 0);
        });
      });

      describe('output smoke tests (in-process)', () => {
        let cli: CLIHarness;
        beforeEach(() => { cli = setupCLI(); });
        afterEach(() => { cli.cleanup(); });

        it('runs list', async () => {
          await cli.run('list');
          assert.strictEqual(cli.exit.exitCode, null);
        });

        it('runs --help', async () => {
          await cli.run('--help');
          assert.strictEqual(cli.exit.exitCode, null);
        });

        it('shows Claude Code options section in new --help', async () => {
          await cli.run('new', '--help');
          // Subcommand-level --help does not route through the root
          // program's exitOverride callback in Commander 12 (only the root
          // Command instance has one -- see _exit() in commander/lib/command.js);
          // it falls through to a real process.exit(0), captured here as
          // exitCode 0, not null. Verified directly against this repo's
          // installed commander version, not assumed.
          assert.strictEqual(cli.exit.exitCode, 0);
          const output = cli.stdout.output.join('');
          assert.ok(output.includes('Claude Code options:'));
          assert.ok(output.includes('--model'));
          assert.ok(output.includes('--permission-mode'));
          const [defaultSection] = output.split('Claude Code options:');
          assert.ok(!defaultSection.includes('--model'));
        });

        it('shows Claude Code options section in resume --help', async () => {
          await cli.run('resume', '--help');
          assert.strictEqual(cli.exit.exitCode, 0); // see comment above
          const output = cli.stdout.output.join('');
          assert.ok(output.includes('Claude Code options:'));
          assert.ok(output.includes('--fork-session'));
          assert.ok(output.includes('--model'));
        });

        it('runs --version', async () => {
          await cli.run('--version');
          assert.strictEqual(cli.exit.exitCode, null);
        });
      });
    });
  });
});

/**
 * Tests for dir command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve, join } from 'node:path';

// Mock claude/sessions.js BEFORE importing anything that depends on it.
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => ({ id: 'stub' }),
    listClaudeSessions: () => [],
    getClaudeSessionTitles: () => ({ customTitle: null, summary: null }),
    getClaudeSessionsForDirectory: () => [],
    readClaudeSessionIndex: () => null,
    getPlanExecutionInfo: () => null,
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

type CLIHarness = import('../helpers/cli.ts').CLIHarness;
const { setupCLI } = await import('../helpers/cli.ts');

describe('c', () => {
  describe('commands', () => {
    describe('dir', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      it('prints session directory to stdout', async () => {
        await cli.seed({ id: 'abc12345', directory: '/home/test/project' });
        await cli.run('dir', 'abc12345');

        assert.ok(cli.stdout.output.join('').includes('/home/test/project'));
      });

      it('resolves by prefix', async () => {
        await cli.seed({ id: 'abc12345', directory: '/home/test/project' });
        await cli.run('dir', 'abc');

        assert.ok(cli.stdout.output.join('').includes('/home/test/project'));
      });

      it('exits 1 when not found', async () => {
        await cli.run('dir', 'nonexistent');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('not found')));
      });

      it('exits 1 with no arg and no current session', async () => {
        delete process.env.CLAUDE_CODE_SESSION_ID;
        await cli.run('dir');

        assert.strictEqual(cli.exit.exitCode, 1);
      });

      describe('--state', () => {
        const savedEnvId = process.env.CLAUDE_CODE_SESSION_ID;
        afterEach(() => {
          if (savedEnvId === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
          else process.env.CLAUDE_CODE_SESSION_ID = savedEnvId;
        });

        it('prints <C_HOME>/state/<id> for an explicit id', async () => {
          await cli.seed({ id: 'abc12345', directory: '/home/test/project' });
          await cli.run('dir', '--state', 'abc12345');

          assert.strictEqual(cli.stdout.output.join(''), join(cli.tmpDir, 'state', 'abc12345'));
        });

        it('resolves the state dir by id prefix', async () => {
          await cli.seed({ id: 'abc12345', directory: '/home/test/project' });
          await cli.run('dir', '--state', 'abc');

          assert.strictEqual(cli.stdout.output.join(''), join(cli.tmpDir, 'state', 'abc12345'));
        });

        it('uses CLAUDE_CODE_SESSION_ID when no id is given, even if untracked', async () => {
          process.env.CLAUDE_CODE_SESSION_ID = 'env-session-id';
          await cli.run('dir', '--state');

          assert.strictEqual(cli.stdout.output.join(''), join(cli.tmpDir, 'state', 'env-session-id'));
        });

        it('exits 1 with no id, no env, and no current session', async () => {
          delete process.env.CLAUDE_CODE_SESSION_ID;
          await cli.run('dir', '--state');

          assert.strictEqual(cli.exit.exitCode, 1);
        });
      });
    });
  });
});

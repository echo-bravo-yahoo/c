/**
 * Tests for dir command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

// Mock claude/sessions.js BEFORE importing anything that depends on it.
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => ({ id: 'stub' }),
    listClaudeSessions: () => [],
    getClaudeSessionTitles: () => ({ customTitle: null, summary: null }),
    getClaudeSessionsForDirectory: () => [],
    readClaudeSessionIndex: () => null,
    getPlanExecutionInfo: () => null,
    findTranscriptPath: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    findClaudeSessionIdsByTitle: () => [],
    decodeProjectKey: (k: string) => k,
    encodeProjectKey: (d: string) => d,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
  },
});

// Dynamic import so the module graph loads AFTER mock.module registration
const { setupCLI } = await import('../helpers/cli.js');
type CLIHarness = import('../helpers/cli.js').CLIHarness;

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
        await cli.run('dir');

        assert.strictEqual(cli.exit.exitCode, 1);
      });
    });
  });
});

/**
 * Tests for delete command
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

type CLIHarness = import('../helpers/cli.ts').CLIHarness;
const { setupCLI } = await import('../helpers/cli.ts');

describe('c', () => {
  describe('commands', () => {
    describe('delete', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      it('deletes session from index', async () => {
        await cli.seed({ id: 's1', state: 'closed' });
        await cli.run('delete', 's1');

        assert.strictEqual(cli.session('s1'), undefined);
      });

      it('deletes multiple sessions', async () => {
        await cli.seed(
          { id: 's1', state: 'closed' },
          { id: 's2', state: 'closed' },
          { id: 's3', state: 'closed' },
        );
        await cli.run('delete', 's1', 's2');

        assert.strictEqual(cli.session('s1'), undefined);
        assert.strictEqual(cli.session('s2'), undefined);
        assert.ok(cli.session('s3'));
      });

      it('reports not found without aborting', async () => {
        await cli.seed({ id: 's1', state: 'closed' });
        await cli.run('delete', 's1', 'nonexistent');

        assert.strictEqual(cli.session('s1'), undefined);
        assert.ok(cli.console.errors.some(l => l.includes('not found')));
      });

      it('unlinks children when parent deleted', async () => {
        await cli.seed(
          { id: 'p1', state: 'closed' },
          { id: 'c1', state: 'busy', parent_session_id: 'p1' },
        );
        await cli.run('delete', 'p1');

        assert.strictEqual(cli.session('p1'), undefined);
        const child = cli.session('c1');
        assert.ok(child);
        assert.strictEqual(child!.parent_session_id, undefined);
      });

      it('--closed deletes all closed', async () => {
        await cli.seed(
          { id: 's1', state: 'busy' },
          { id: 's2', state: 'closed' },
          { id: 's3', state: 'closed' },
        );
        await cli.run('delete', '--closed');

        assert.ok(cli.session('s1'));
        assert.strictEqual(cli.session('s2'), undefined);
        assert.strictEqual(cli.session('s3'), undefined);
      });

      it('exits 1 with no args or flags', async () => {
        await cli.run('delete');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('Specify session IDs')));
      });
    });
  });
});

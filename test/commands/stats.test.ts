/**
 * Tests for stats command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

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
    describe('stats', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      it('displays session counts', async () => {
        await cli.seed(
          { id: 's1', state: 'busy' },
          { id: 's2', state: 'busy' },
          { id: 's3', state: 'idle' },
          { id: 's4', state: 'waiting' },
        );
        await cli.run('stats');

        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('Active sessions: 4'));
        assert.ok(output.includes('2 busy'));
      });

      it('displays total count', async () => {
        await cli.seed(
          { id: 's1', state: 'busy' },
          { id: 's2', state: 'busy' },
          { id: 's3', state: 'busy' },
          { id: 's4', state: 'closed' },
          { id: 's5', state: 'closed' },
        );
        await cli.run('stats');

        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('Total sessions:  5'));
      });

      it('displays repo count', async () => {
        await cli.seed(
          { id: 's1', state: 'busy', directory: '/home/user/project-a' },
          { id: 's2', state: 'busy', directory: '/home/user/project-b' },
          { id: 's3', state: 'busy', directory: '/home/user/project-a' },
        );
        await cli.run('stats');

        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('Repos:'));
        // 2 unique repos (project-a, project-b)
        assert.ok(output.includes('2'));
      });

      it('handles empty index', async () => {
        await cli.run('stats');

        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('Active sessions: 0'));
      });
    });
  });
});

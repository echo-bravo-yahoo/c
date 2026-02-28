/**
 * Tests for list command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

// Mock claude/sessions.js BEFORE importing anything that depends on it.
// Must use dynamic import below to ensure mock is registered first.
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => ({ id: 'stub' }),
    listClaudeSessions: () => [],
    getClaudeSessionTitles: () => ({ customTitle: null, summary: null }),
    getClaudeSessionsForDirectory: () => [],
    readClaudeSessionIndex: () => null,
    getPlanExecutionInfo: () => null,
    decodeProjectKey: (k: string) => k,
    encodeProjectKey: (d: string) => d,
  },
});

// Dynamic import so the module graph loads AFTER mock.module registration
const { setupCLI } = await import('../helpers/cli.js');
type CLIHarness = import('../helpers/cli.js').CLIHarness;

describe('c', () => {
  describe('commands', () => {
    describe('list', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('state filtering', () => {
        it('excludes archived by default', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'closed' },
            { id: 's3', state: 'archived' },
          );
          await cli.run('list');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(output.includes('s2'));
          assert.ok(!output.includes('s3'));
        });

        it('--all includes archived', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'archived' },
          );
          await cli.run('list', '--all');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(output.includes('s2'));
        });

        it('--archived shows only archived', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'archived' },
          );
          await cli.run('list', '--archived');

          const output = cli.console.logs.join('\n');
          assert.ok(!output.includes('s1'));
          assert.ok(output.includes('s2'));
        });
      });

      describe('waiting filter', () => {
        it('--waiting shows only waiting', async () => {
          await cli.seed(
            { id: 's1', state: 'waiting' },
            { id: 's2', state: 'busy' },
            { id: 's3', state: 'closed' },
          );
          await cli.run('list', '--waiting');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
          assert.ok(!output.includes('s3'));
        });
      });

      describe('directory filter', () => {
        it('--dir scopes to directory', async () => {
          await cli.seed(
            { id: 's1', directory: '/home/user/project-a', state: 'busy' },
            { id: 's2', directory: '/home/user/project-b', state: 'busy' },
            { id: 's3', directory: '/home/user/project-a', state: 'busy' },
          );
          await cli.run('list', '--dir', '/home/user/project-a');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
          assert.ok(output.includes('s3'));
        });
      });

      describe('--prs view', () => {
        it('shows only sessions with PRs', async () => {
          await cli.seed(
            { id: 's1', resources: { pr: 'https://github.com/o/r/pull/1' } },
            { id: 's2', resources: {} },
            { id: 's3', resources: { pr: 'https://github.com/o/r/pull/2' } },
          );
          await cli.run('list', '--prs');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('pull/1'));
          assert.ok(output.includes('pull/2'));
        });

        it('shows message when no PRs linked', async () => {
          await cli.seed({ id: 's1', resources: {} });
          await cli.run('list', '--prs');

          assert.ok(cli.console.logs.some(l => l.includes('No PRs')));
        });
      });

      describe('--jira view', () => {
        it('shows only sessions with JIRA tickets', async () => {
          await cli.seed(
            { id: 's1', resources: { jira: 'MAC-123' } },
            { id: 's2', resources: {} },
          );
          await cli.run('list', '--jira');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('MAC-123'));
        });

        it('shows message when no JIRA linked', async () => {
          await cli.seed({ id: 's1', resources: {} });
          await cli.run('list', '--jira');

          assert.ok(cli.console.logs.some(l => l.includes('No JIRA')));
        });
      });

      describe('empty state', () => {
        it('handles no sessions', async () => {
          await cli.run('list');

          assert.strictEqual(cli.exit.exitCode, null);
        });
      });
    });
  });
});

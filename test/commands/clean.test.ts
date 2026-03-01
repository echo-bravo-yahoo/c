/**
 * Tests for clean command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Controlled list of Claude session IDs — tests configure this before running.
let claudeSessionIds: string[] = [];

// Mock claude/sessions.js BEFORE importing anything that depends on it.
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: (id: string) =>
      claudeSessionIds.includes(id) ? { id } : undefined,
    listClaudeSessions: () =>
      claudeSessionIds.map((id) => ({ id, projectKey: '', directory: '', transcriptPath: '', historyPath: '', modifiedAt: new Date() })),
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
    describe('clean', () => {
      let cli: CLIHarness;
      beforeEach(() => {
        cli = setupCLI();
        claudeSessionIds = [];
      });
      afterEach(() => { cli.cleanup(); });

      describe('orphan detection', () => {
        it('detects sessions missing from Claude', async () => {
          claudeSessionIds = ['exists-1', 'exists-2'];
          await cli.seed(
            { id: 'exists-1', directory: cli.tmpDir },
            { id: 'orphan-1', directory: cli.tmpDir },
            { id: 'exists-2', directory: cli.tmpDir },
          );
          await cli.run('clean');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('orphan-1'));
        });

        it('reports clean when all sessions exist', async () => {
          claudeSessionIds = ['exists-1', 'exists-2'];
          await cli.seed(
            { id: 'exists-1', directory: cli.tmpDir },
            { id: 'exists-2', directory: cli.tmpDir },
          );
          await cli.run('clean');

          assert.ok(cli.console.logs.some(l => l.includes('No orphaned')));
        });
      });

      describe('missing directory detection', () => {
        it('detects sessions with deleted directories', async () => {
          const existingDir = join(cli.tmpDir, 'project-a');
          mkdirSync(existingDir);
          claudeSessionIds = ['s1', 's2'];
          await cli.seed(
            { id: 's1', directory: existingDir },
            { id: 's2', directory: '/nonexistent/path' },
          );
          await cli.run('clean');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('/nonexistent'));
          assert.ok(output.includes('missing'));
        });
      });

      describe('prune behavior', () => {
        it('removes orphans with --prune', async () => {
          claudeSessionIds = ['keep-1'];
          await cli.seed(
            { id: 'keep-1', directory: cli.tmpDir },
            { id: 'orphan-1', directory: cli.tmpDir },
            { id: 'orphan-2', directory: cli.tmpDir },
          );
          await cli.run('clean', '--prune');

          const idx = cli.index();
          assert.ok(idx.sessions['keep-1']);
          assert.strictEqual(idx.sessions['orphan-1'], undefined);
          assert.strictEqual(idx.sessions['orphan-2'], undefined);
          assert.ok(cli.console.logs.some(l => l.includes('Pruned')));
        });

        it('does not delete without --prune', async () => {
          claudeSessionIds = [];
          await cli.seed({ id: 'orphan-1', directory: cli.tmpDir });
          await cli.run('clean');

          const idx = cli.index();
          assert.ok(idx.sessions['orphan-1']);
          assert.ok(cli.console.logs.some(l => l.includes('--prune')));
        });
      });

      describe('report output', () => {
        it('reports "no orphans" when clean', async () => {
          claudeSessionIds = ['s1'];
          await cli.seed({ id: 's1', directory: cli.tmpDir });
          await cli.run('clean');

          assert.ok(cli.console.logs.some(l => l.includes('No orphaned')));
        });

        it('shows pruned count', async () => {
          claudeSessionIds = [];
          await cli.seed(
            { id: 'orphan-1', directory: cli.tmpDir },
            { id: 'orphan-2', directory: cli.tmpDir },
            { id: 'orphan-3', directory: cli.tmpDir },
          );
          await cli.run('clean', '--prune');

          assert.ok(cli.console.logs.some(l => l.includes('3')));
        });
      });
    });
  });
});

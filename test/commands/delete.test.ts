/**
 * Tests for delete command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const claudeSessionStubs = new Map<string, { id: string; transcriptPath: string; historyPath: string }>();

// Mock claude/sessions.js BEFORE importing anything that depends on it.
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: (id: string) => claudeSessionStubs.get(id),
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

type CLIHarness = import('../helpers/cli.ts').CLIHarness;
const { setupCLI } = await import('../helpers/cli.ts');

describe('c', () => {
  describe('commands', () => {
    describe('delete', () => {
      let cli: CLIHarness;
      let claudeTmpDir: string;
      beforeEach(() => {
        cli = setupCLI();
        claudeSessionStubs.clear();
        claudeTmpDir = mkdtempSync(join(tmpdir(), 'c-claude-test-'));
      });
      afterEach(() => {
        cli.cleanup();
        rmSync(claudeTmpDir, { recursive: true, force: true });
      });

      function seedClaudeSession(id: string) {
        const transcriptPath = join(claudeTmpDir, `${id}.jsonl`);
        writeFileSync(transcriptPath, '{}\n');
        const historyDir = join(claudeTmpDir, id);
        mkdirSync(historyDir, { recursive: true });
        writeFileSync(join(historyDir, 'history.jsonl'), '{}\n');
        claudeSessionStubs.set(id, { id, transcriptPath, historyPath: join(historyDir, 'history.jsonl') });
        return { transcriptPath, historyDir };
      }

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

      it('--remove-transcript deletes transcript file and history dir', async () => {
        await cli.seed({ id: 's1', state: 'closed' });
        const { transcriptPath, historyDir } = seedClaudeSession('s1');

        await cli.run('delete', 's1', '--remove-transcript');

        assert.strictEqual(cli.session('s1'), undefined);
        assert.strictEqual(existsSync(transcriptPath), false);
        assert.strictEqual(existsSync(historyDir), false);
      });

      it('without --remove-transcript leaves transcript on disk', async () => {
        await cli.seed({ id: 's1', state: 'closed' });
        const { transcriptPath, historyDir } = seedClaudeSession('s1');

        await cli.run('delete', 's1');

        assert.strictEqual(cli.session('s1'), undefined);
        assert.strictEqual(existsSync(transcriptPath), true);
        assert.strictEqual(existsSync(historyDir), true);
      });

      it('--remove-transcript is a silent no-op when no Claude session exists', async () => {
        await cli.seed({ id: 's1', state: 'closed' });
        // no seedClaudeSession('s1') call — getClaudeSession returns undefined

        await cli.run('delete', 's1', '--remove-transcript');

        assert.strictEqual(cli.session('s1'), undefined);
        assert.ok(!cli.console.errors.length);
      });

      it('--remove-transcript composes with --orphans without error', async () => {
        await cli.seed({ id: 's1', state: 'closed' });

        await cli.run('delete', '--orphans', '--remove-transcript');

        assert.strictEqual(cli.session('s1'), undefined);
        assert.ok(!cli.console.errors.length);
      });

      it('--remove-transcript composes with --closed and removes all transcripts', async () => {
        await cli.seed(
          { id: 's1', state: 'closed' },
          { id: 's2', state: 'closed' },
        );
        const t1 = seedClaudeSession('s1');
        const t2 = seedClaudeSession('s2');

        await cli.run('delete', '--closed', '--remove-transcript');

        assert.strictEqual(existsSync(t1.transcriptPath), false);
        assert.strictEqual(existsSync(t2.transcriptPath), false);
      });

      it('success message mentions transcript removal only when one was removed', async () => {
        await cli.seed({ id: 's1', state: 'closed' });
        seedClaudeSession('s1');

        await cli.run('delete', 's1', '--remove-transcript');

        assert.ok(cli.console.logs.some(l => l.includes('and removed transcript')));
      });
    });
  });
});

/**
 * Tests for c adopt command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

let mockClaudeSession: unknown = null;
let mockClaudeSessionTitles = { customTitle: null as string | null, summary: null as string | null };

mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => mockClaudeSession,
    getClaudeSessionTitles: () => mockClaudeSessionTitles,
    listClaudeSessions: () => [],
    getClaudeSessionsForDirectory: () => [],
    readClaudeSessionIndex: () => null,
    findTranscriptPath: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: () => null,
    resetSessionCaches: () => {},
    decodeProjectKey: (k: string) => k,
    encodeProjectKey: (d: string) => d.replace(/\//g, '-'),
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
  },
});

const { setupCLI } = await import('../helpers/cli.ts');
import type { CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('adopt', () => {
    let cli: CLIHarness;

    beforeEach(() => {
      cli = setupCLI();
      mockClaudeSession = null;
      mockClaudeSessionTitles = { customTitle: null, summary: null };
    });

    afterEach(() => {
      cli.cleanup();
    });

    it('adopts a session from Claude storage', async () => {
      mockClaudeSession = {
        id: 'ephemeral-123',
        projectKey: '-tmp-project',
        directory: '/tmp/project',
        transcriptPath: '/tmp/transcript.jsonl',
        modifiedAt: new Date('2025-06-01T12:00:00Z'),
      };

      await cli.run('adopt', 'ephemeral-123');

      const s = cli.session('ephemeral-123');
      assert.ok(s);
      assert.strictEqual(s.state, 'busy');
      assert.strictEqual(s.directory, '/tmp/project');
      assert.ok(cli.console.logs.some(l => l.includes('Adopted session')));
    });

    it('sets name when --name is provided', async () => {
      mockClaudeSession = {
        id: 'ephemeral-456',
        projectKey: '-tmp-project',
        directory: '/tmp/project',
        transcriptPath: '/tmp/transcript.jsonl',
        modifiedAt: new Date('2025-06-01T12:00:00Z'),
      };

      await cli.run('adopt', 'ephemeral-456', '--name', 'my-session');

      const s = cli.session('ephemeral-456');
      assert.ok(s);
      assert.strictEqual(s.name, 'my-session');
    });

    it('stores custom title from Claude index', async () => {
      mockClaudeSession = {
        id: 'ephemeral-789',
        projectKey: '-tmp-project',
        directory: '/tmp/project',
        transcriptPath: '/tmp/transcript.jsonl',
        modifiedAt: new Date('2025-06-01T12:00:00Z'),
      };
      mockClaudeSessionTitles = { customTitle: 'renamed session', summary: null };

      await cli.run('adopt', 'ephemeral-789');

      const s = cli.session('ephemeral-789');
      assert.ok(s);
      assert.strictEqual(s.meta._custom_title, 'renamed session');
    });

    it('errors when session is already tracked', async () => {
      await cli.seed({ id: 'existing-session', state: 'busy' });

      await cli.run('adopt', 'existing-session');

      assert.strictEqual(cli.exit.exitCode, 1);
      assert.ok(cli.console.errors.some(l => l.includes('already tracked')));
    });

    it('errors when session not found in Claude storage', async () => {
      mockClaudeSession = null;

      await cli.run('adopt', 'nonexistent');

      assert.strictEqual(cli.exit.exitCode, 1);
      assert.ok(cli.console.errors.some(l => l.includes('not found')));
    });

    it('outputs JSON when --json is provided', async () => {
      mockClaudeSession = {
        id: 'ephemeral-json',
        projectKey: '-tmp-project',
        directory: '/tmp/project',
        transcriptPath: '/tmp/transcript.jsonl',
        modifiedAt: new Date('2025-06-01T12:00:00Z'),
      };

      await cli.run('adopt', 'ephemeral-json', '--json');

      const output = JSON.parse(cli.stdout.output.join(''));
      assert.strictEqual(output.id, 'ephemeral-json');
      assert.strictEqual(output.state, 'busy');
      assert.strictEqual(output.directory, '/tmp/project');
    });
  });
});

/**
 * Tests for `c repair` command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mock } from 'node:test';
import { resolve } from 'node:path';

// Mutable mock state
let mockClaudeSessions: Array<{ id: string }> = [];
let mockTranscriptPath: string | null = null;
let mockCustomTitle: string | null = null;
let mockTranscriptUsage: { cost_usd: number } | null = null;

// Mock claude/sessions before any imports that pull it in
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    resetSessionCaches: () => {},
    listClaudeSessions: () => mockClaudeSessions,
    getClaudeSession: () => null,
    getClaudeSessionsForDirectory: () => [],
    findTranscriptPath: () => mockTranscriptPath,
    encodeProjectKey: (dir: string) => dir.replace(/\//g, '-'),
    decodeProjectKey: (key: string) => key.replace(/-/g, '/'),
    readClaudeSessionIndex: () => null,
    getClaudeSessionTitles: () => ({}),
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: () => null,
    getCustomTitleFromTranscriptTail: () => mockCustomTitle,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    extractPlanTitle: () => null,
  },
});

mock.module(resolve('src/claude/usage.ts'), {
  namedExports: {
    readTranscriptUsage: () => mockTranscriptUsage,
  },
});

const { setupCLI } = await import('../helpers/cli.ts');
import type { CLIHarness } from '../helpers/cli.ts';

let cli: CLIHarness;

beforeEach(() => {
  cli = setupCLI();
  mockClaudeSessions = [];
  mockTranscriptPath = null;
  mockCustomTitle = null;
  mockTranscriptUsage = null;
});

afterEach(() => {
  cli.cleanup();
});

describe('c repair', () => {
  it('reports no issues when everything is clean', async () => {
    await cli.seed({ id: 's1', state: 'closed' });
    mockClaudeSessions = [{ id: 's1' }];
    await cli.run('repair');
    assert.ok(cli.console.logs.some((l) => l.includes('No issues found')));
  });

  it('clears stale PID and closes session when process is dead', async () => {
    // Use a PID that almost certainly doesn't exist
    await cli.seed({ id: 's1', state: 'busy', pid: 999999 });
    mockClaudeSessions = [{ id: 's1' }];
    await cli.run('repair');
    const s = cli.session('s1');
    assert.strictEqual(s?.state, 'closed');
    assert.strictEqual(s?.pid, undefined);
    assert.ok(cli.console.logs.some((l) => l.includes('stale PID')));
  });

  it('closes stuck sessions with no PID and no Claude data', async () => {
    await cli.seed({ id: 's1', state: 'busy' });
    mockClaudeSessions = []; // no Claude session
    await cli.run('repair');
    const s = cli.session('s1');
    assert.strictEqual(s?.state, 'closed');
    assert.ok(cli.console.logs.some((l) => l.includes('stuck')));
  });

  it('does not close sessions that have Claude data', async () => {
    await cli.seed({ id: 's1', state: 'idle' });
    mockClaudeSessions = [{ id: 's1' }];
    await cli.run('repair');
    const s = cli.session('s1');
    assert.strictEqual(s?.state, 'idle');
  });

  it('scopes to a single session when ID is provided', async () => {
    await cli.seed({ id: 's1', state: 'busy', pid: 999999 });
    await cli.seed({ id: 's2', state: 'busy', pid: 999998 });
    mockClaudeSessions = [{ id: 's1' }, { id: 's2' }];
    await cli.run('repair', 's1');
    // s1 should be fixed
    assert.strictEqual(cli.session('s1')?.state, 'closed');
    // s2 should be untouched
    assert.strictEqual(cli.session('s2')?.state, 'busy');
    assert.strictEqual(cli.session('s2')?.pid, 999998);
  });

  it('errors when ID is not found', async () => {
    await cli.run('repair', 'nonexistent');
    assert.strictEqual(cli.exit.exitCode, 1);
    assert.ok(cli.console.errors.some((l) => l.includes('Session not found')));
  });

  it('does not touch archived or closed sessions', async () => {
    await cli.seed({ id: 's1', state: 'archived', pid: 999999 });
    await cli.seed({ id: 's2', state: 'closed', pid: 999998 });
    mockClaudeSessions = [];
    await cli.run('repair');
    // archived/closed sessions should keep their state even with dead PIDs
    // (stale PID check still clears the PID field, but doesn't change state)
    assert.strictEqual(cli.session('s1')?.state, 'archived');
    assert.strictEqual(cli.session('s2')?.state, 'closed');
  });

  it('backfills _custom_title from transcript when missing (thorough)', async () => {
    await cli.seed({ id: 's1', state: 'closed' });
    mockClaudeSessions = [{ id: 's1' }];
    mockTranscriptPath = '/tmp/fake/s1.jsonl';
    mockCustomTitle = 'My Renamed Session';

    await cli.run('repair', '--thorough');

    const s = cli.session('s1');
    assert.strictEqual(s?.meta._custom_title, 'My Renamed Session');
    assert.ok(cli.console.logs.some((l) => l.includes('Backfilled title')));
  });

  it('skips title backfill without --thorough', async () => {
    await cli.seed({ id: 's1', state: 'closed' });
    mockClaudeSessions = [{ id: 's1' }];
    mockTranscriptPath = '/tmp/fake/s1.jsonl';
    mockCustomTitle = 'My Renamed Session';

    await cli.run('repair');

    const s = cli.session('s1');
    assert.strictEqual(s?.meta._custom_title, undefined);
  });

  it('skips backfill when _custom_title already present', async () => {
    await cli.seed({ id: 's1', state: 'closed', meta: { _custom_title: 'Existing' } });
    mockClaudeSessions = [{ id: 's1' }];
    mockTranscriptPath = '/tmp/fake/s1.jsonl';
    mockCustomTitle = 'New Title';

    await cli.run('repair', '--thorough');

    const s = cli.session('s1');
    assert.strictEqual(s?.meta._custom_title, 'Existing');
    assert.ok(!cli.console.logs.some((l) => l.includes('Backfilled')));
  });

  it('backfills JIRA from branch name (thorough)', async () => {
    await cli.seed({ id: 's1', state: 'closed', resources: { branch: 'feature/MAC-1234-fix-bug' } });
    mockClaudeSessions = [{ id: 's1' }];

    await cli.run('repair', '--thorough');

    const s = cli.session('s1');
    assert.strictEqual(s?.resources.jira, 'MAC-1234');
    assert.ok(cli.console.logs.some((l) => l.includes('JIRA MAC-1234')));
  });

  it('skips JIRA backfill without --thorough', async () => {
    await cli.seed({ id: 's1', state: 'closed', resources: { branch: 'feature/MAC-1234-fix-bug' } });
    mockClaudeSessions = [{ id: 's1' }];

    await cli.run('repair');

    const s = cli.session('s1');
    assert.strictEqual(s?.resources.jira, undefined);
  });

  it('skips JIRA backfill when already present', async () => {
    await cli.seed({
      id: 's1', state: 'closed',
      resources: { branch: 'feature/MAC-1234-fix-bug', jira: 'MAC-9999' },
    });
    mockClaudeSessions = [{ id: 's1' }];

    await cli.run('repair', '--thorough');

    const s = cli.session('s1');
    assert.strictEqual(s?.resources.jira, 'MAC-9999');
  });

  it('backfills cost from transcript (thorough)', async () => {
    await cli.seed({ id: 's1', state: 'closed' });
    mockClaudeSessions = [{ id: 's1' }];
    mockTranscriptPath = '/tmp/fake/s1.jsonl';
    mockTranscriptUsage = { cost_usd: 1.23 };

    await cli.run('repair', '--thorough');

    const s = cli.session('s1');
    assert.strictEqual(s?.cost_usd, 1.23);
    assert.ok(cli.console.logs.some((l) => l.includes('cost $1.23')));
  });

  it('skips cost backfill when cost already set', async () => {
    await cli.seed({ id: 's1', state: 'closed', cost_usd: 5.0 });
    mockClaudeSessions = [{ id: 's1' }];
    mockTranscriptPath = '/tmp/fake/s1.jsonl';
    mockTranscriptUsage = { cost_usd: 1.23 };

    await cli.run('repair', '--thorough');

    const s = cli.session('s1');
    assert.strictEqual(s?.cost_usd, 5.0);
  });

  it('skips cost backfill for non-closed sessions', async () => {
    await cli.seed({ id: 's1', state: 'archived' });
    mockClaudeSessions = [{ id: 's1' }];
    mockTranscriptPath = '/tmp/fake/s1.jsonl';
    mockTranscriptUsage = { cost_usd: 1.23 };

    await cli.run('repair', '--thorough');

    const s = cli.session('s1');
    assert.strictEqual(s?.cost_usd, undefined);
  });

  it('suppresses output with --quiet when no issues', async () => {
    await cli.seed({ id: 's1', state: 'closed' });
    mockClaudeSessions = [{ id: 's1' }];

    await cli.run('repair', '--quiet');

    assert.ok(!cli.console.logs.some((l) => l.includes('No issues found')));
  });
});

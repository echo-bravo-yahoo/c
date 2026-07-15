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
let mockTranscriptCwd: string | null = null;
let mockCustomTitle: string | null = null;
let mockTranscriptUsage: { cost_usd: number } | null = null;
let mockLiveSessionIds: Set<string> = new Set();
let mockPlanExecutionInfoById: Map<string, { slug: string; title: string | null }> = new Map();
let mockPlanContinuationInfoById: Map<string, { slug: string }> = new Map();
let mockInventoryDelta: { reads: Array<{ path: string; turn: number; via: 'Read' | 'Bash' }>; skills: Array<{ name: string; turn: number }>; new_offset: number; new_turn: number } | null = null;

mock.module(resolve('src/util/process.ts'), {
  namedExports: {
    collectLiveSessions: () => new Map([...mockLiveSessionIds].map(id => [id, { status: null }])),
    collectLiveSessionIds: () => mockLiveSessionIds,
    isProcessAlive: (pid: number) => pid === 999,
    isTranscriptOpen: (id: string) => mockLiveSessionIds.has(id),
    signalSession: async () => {},
  },
});

// Mock claude/sessions before any imports that pull it in
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    resetSessionCaches: () => {},
    listClaudeSessions: () => mockClaudeSessions,
    listClaudeSessionSizes: () => new Map(),
    getClaudeSession: () => null,
    getClaudeSessionsForDirectory: () => [],
    findTranscriptPath: () => mockTranscriptPath,
    encodeProjectKey: (dir: string) => dir.replace(/\//g, '-'),
    decodeProjectKey: (key: string) => key.replace(/-/g, '/'),
    readClaudeSessionIndex: () => null,
    getClaudeSessionTitles: () => ({}),
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: (id: string) => mockPlanExecutionInfoById.get(id) ?? null,
    getPlanContinuationInfo: (id: string) => mockPlanContinuationInfoById.get(id) ?? null,
    getCustomTitleFromTranscriptTail: () => mockCustomTitle,
    getCwdFromTranscriptHead: () => mockTranscriptCwd,
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

mock.module(resolve('src/claude/context-inventory.ts'), {
  namedExports: {
    canonicalizePath: (raw: string) => raw,
    extractBashReadPaths: () => [],
    readTranscriptInventory: () => mockInventoryDelta,
    applyInventoryDelta: (inv: { reads: Record<string, number[]>; skills?: Record<string, number[]> }, delta: typeof mockInventoryDelta) => {
      if (!delta) return;
      for (const r of delta.reads) {
        (inv.reads[r.path] ??= []).push(r.turn);
      }
    },
  },
});

const { setupCLI } = await import('../helpers/cli.ts');
import type { CLIHarness } from '../helpers/cli.ts';

let cli: CLIHarness;

beforeEach(() => {
  cli = setupCLI();
  mockClaudeSessions = [];
  mockTranscriptPath = null;
  mockTranscriptCwd = null;
  mockCustomTitle = null;
  mockTranscriptUsage = null;
  mockLiveSessionIds = new Set();
  mockPlanExecutionInfoById = new Map();
  mockPlanContinuationInfoById = new Map();
  mockInventoryDelta = null;
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

  it('heals a mis-decoded directory from the transcript cwd', async () => {
    const realDir = process.cwd(); // a directory that exists
    await cli.seed({ id: 's1', state: 'closed', directory: '/nonexistent/2023/2024/archive/q1/notes' });
    mockClaudeSessions = [{ id: 's1' }];
    mockTranscriptPath = '/tmp/fake/s1.jsonl';
    mockTranscriptCwd = realDir;
    await cli.run('repair');
    const s = cli.session('s1');
    assert.strictEqual(s?.directory, realDir);
    assert.strictEqual(s?.project_key, realDir.replace(/\//g, '-'));
    assert.ok(cli.console.logs.some((l) => l.includes('Healed directory')));
  });

  it('does not heal when the stored directory still exists', async () => {
    const realDir = process.cwd();
    await cli.seed({ id: 's1', state: 'closed', directory: realDir });
    mockClaudeSessions = [{ id: 's1' }];
    mockTranscriptPath = '/tmp/fake/s1.jsonl';
    mockTranscriptCwd = '/some/other/place';
    await cli.run('repair');
    assert.strictEqual(cli.session('s1')?.directory, realDir);
    assert.ok(!cli.console.logs.some((l) => l.includes('Healed directory')));
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

  it('closes stuck sessions with no PID when transcript is not open', async () => {
    await cli.seed({ id: 's1', state: 'busy' });
    await cli.run('repair');
    const s = cli.session('s1');
    assert.strictEqual(s?.state, 'closed');
    assert.ok(cli.console.logs.some((l) => l.includes('stuck')));
  });

  it('leaves active session with no PID alone when transcript is open', async () => {
    mockTranscriptPath = '/tmp/s1.jsonl';
    mockLiveSessionIds = new Set(['s1']);
    await cli.seed({ id: 's1', state: 'idle' });
    await cli.run('repair');
    const s = cli.session('s1');
    assert.strictEqual(s?.state, 'idle');
  });

  it('closes active sessions with no PID even when Claude data exists', async () => {
    await cli.seed({ id: 's1', state: 'idle' });
    mockClaudeSessions = [{ id: 's1' }];
    await cli.run('repair');
    const s = cli.session('s1');
    assert.strictEqual(s?.state, 'closed');
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

  describe('step 10: backfill parent_session_id (thorough)', () => {
    it('links child to the most recent plan-equipped parent in same directory', async () => {
      const dir = '/home/user/proj';
      await cli.seed({
        id: 'parent1',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T10:00:00Z'),
        last_active_at: new Date('2025-06-01T11:00:00Z'),
      });
      await cli.seed({
        id: 'child1',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T11:30:00Z'),
        last_active_at: new Date('2025-06-01T12:00:00Z'),
      });
      mockClaudeSessions = [{ id: 'parent1' }, { id: 'child1' }];
      mockPlanContinuationInfoById.set('child1', { slug: 'impl' });
      mockPlanExecutionInfoById.set('parent1', { slug: 'impl', title: null });

      await cli.run('repair', '--thorough');

      const child = cli.session('child1');
      assert.strictEqual(child?.parent_session_id, 'parent1');
      assert.strictEqual(child?.resources.plan, 'impl');
      assert.ok(cli.console.logs.some((l) => l.includes('Linked')));
    });

    it('does not overwrite existing parent_session_id', async () => {
      const dir = '/home/user/proj';
      await cli.seed({
        id: 'existing-parent',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T09:00:00Z'),
        last_active_at: new Date('2025-06-01T10:00:00Z'),
      });
      await cli.seed({
        id: 'already-linked',
        state: 'closed',
        directory: dir,
        parent_session_id: 'existing-parent',
        created_at: new Date('2025-06-01T10:30:00Z'),
        last_active_at: new Date('2025-06-01T11:00:00Z'),
      });
      mockClaudeSessions = [{ id: 'existing-parent' }, { id: 'already-linked' }];
      mockPlanContinuationInfoById.set('already-linked', { slug: 'plan-a' });
      mockPlanExecutionInfoById.set('existing-parent', { slug: 'plan-a', title: null });

      await cli.run('repair', '--thorough');

      const linked = cli.session('already-linked');
      assert.strictEqual(linked?.parent_session_id, 'existing-parent');
      assert.ok(!cli.console.logs.some((l) => l.includes('Linked') && l.includes('already-linked')));
    });

    it('replaces wrong parent_session_id when a correct parent exists', async () => {
      const dir = '/home/user/proj';
      await cli.seed({
        id: 'session-a',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T09:00:00Z'),
        last_active_at: new Date('2025-06-01T10:00:00Z'),
      });
      await cli.seed({
        id: 'session-b',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T10:00:00Z'),
        last_active_at: new Date('2025-06-01T11:00:00Z'),
      });
      await cli.seed({
        id: 'wrong-linked',
        state: 'closed',
        directory: dir,
        parent_session_id: 'session-a',
        created_at: new Date('2025-06-01T11:30:00Z'),
        last_active_at: new Date('2025-06-01T12:00:00Z'),
      });
      mockClaudeSessions = [{ id: 'session-a' }, { id: 'session-b' }, { id: 'wrong-linked' }];
      mockPlanContinuationInfoById.set('wrong-linked', { slug: 'plan-x' });
      mockPlanExecutionInfoById.set('session-a', { slug: 'plan-y', title: null }); // mismatch
      mockPlanExecutionInfoById.set('session-b', { slug: 'plan-x', title: null }); // correct

      await cli.run('repair', '--thorough');

      const linked = cli.session('wrong-linked');
      assert.strictEqual(linked?.parent_session_id, 'session-b');
      assert.ok(cli.console.logs.some((l) => l.includes('Linked') && l.includes('wrong-li')));
    });

    it('clears wrong parent_session_id when no correct parent exists', async () => {
      const dir = '/home/user/proj';
      await cli.seed({
        id: 'only-parent',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T09:00:00Z'),
        last_active_at: new Date('2025-06-01T10:00:00Z'),
      });
      await cli.seed({
        id: 'stale-linked',
        state: 'closed',
        directory: dir,
        parent_session_id: 'only-parent',
        created_at: new Date('2025-06-01T10:30:00Z'),
        last_active_at: new Date('2025-06-01T11:00:00Z'),
      });
      mockClaudeSessions = [{ id: 'only-parent' }, { id: 'stale-linked' }];
      mockPlanContinuationInfoById.set('stale-linked', { slug: 'plan-x' });
      mockPlanExecutionInfoById.set('only-parent', { slug: 'plan-y', title: null }); // mismatch, no plan-x in index

      await cli.run('repair', '--thorough');

      const linked = cli.session('stale-linked');
      assert.strictEqual(linked?.parent_session_id, undefined);
      assert.ok(cli.console.logs.some((l) => l.includes('Cleared wrong parent link')));
    });

    it('does not link when getPlanContinuationInfo returns null', async () => {
      const dir = '/home/user/proj';
      await cli.seed({
        id: 'plan-parent',
        state: 'closed',
        directory: dir,
        resources: { plan: 'impl' },
        created_at: new Date('2025-06-01T10:00:00Z'),
        last_active_at: new Date('2025-06-01T11:00:00Z'),
      });
      await cli.seed({
        id: 'unrelated-child',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T11:30:00Z'),
        last_active_at: new Date('2025-06-01T12:00:00Z'),
      });
      mockClaudeSessions = [{ id: 'plan-parent' }, { id: 'unrelated-child' }];
      mockPlanExecutionInfoById.set('plan-parent', { slug: 'impl', title: null });
      // No continuation info for unrelated-child — it was not spawned from a plan

      await cli.run('repair', '--thorough');

      const child = cli.session('unrelated-child');
      assert.strictEqual(child?.parent_session_id, undefined);
    });

    it('does not link when slug mismatches', async () => {
      const dir = '/home/user/proj';
      await cli.seed({
        id: 'wrong-parent',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T10:00:00Z'),
        last_active_at: new Date('2025-06-01T11:00:00Z'),
      });
      await cli.seed({
        id: 'slug-child',
        state: 'closed',
        directory: dir,
        created_at: new Date('2025-06-01T11:30:00Z'),
        last_active_at: new Date('2025-06-01T12:00:00Z'),
      });
      mockClaudeSessions = [{ id: 'wrong-parent' }, { id: 'slug-child' }];
      mockPlanContinuationInfoById.set('slug-child', { slug: 'plan-a' });
      mockPlanExecutionInfoById.set('wrong-parent', { slug: 'plan-b', title: null });

      await cli.run('repair', '--thorough');

      const child = cli.session('slug-child');
      assert.strictEqual(child?.parent_session_id, undefined);
      // Plan slug is still set from continuation info
      assert.strictEqual(child?.resources.plan, 'plan-a');
      assert.ok(cli.console.logs.some((l) => l.includes('plan-a') && l.includes('parent not indexed')));
    });

    it('links sessions across different directories when the plan slug matches', async () => {
      await cli.seed({
        id: 'dir-a-parent',
        state: 'closed',
        directory: '/home/user/dir-a',
        created_at: new Date('2025-06-01T10:00:00Z'),
        last_active_at: new Date('2025-06-01T11:00:00Z'),
      });
      await cli.seed({
        id: 'dir-b-child',
        state: 'closed',
        directory: '/home/user/dir-b',
        created_at: new Date('2025-06-01T11:30:00Z'),
        last_active_at: new Date('2025-06-01T12:00:00Z'),
      });
      mockClaudeSessions = [{ id: 'dir-a-parent' }, { id: 'dir-b-child' }];
      mockPlanContinuationInfoById.set('dir-b-child', { slug: 'impl' });
      mockPlanExecutionInfoById.set('dir-a-parent', { slug: 'impl', title: null });

      await cli.run('repair', '--thorough');

      const child = cli.session('dir-b-child');
      assert.strictEqual(child?.parent_session_id, 'dir-a-parent');
      assert.strictEqual(child?.resources.plan, 'impl');
    });
  });

  describe('step 11: rebuild context inventory (thorough)', () => {
    it('populates context.reads for sessions with empty reads', async () => {
      await cli.seed({ id: 's-empty', state: 'closed', directory: '/home/user/proj' });
      mockClaudeSessions = [{ id: 's-empty' }];
      mockTranscriptPath = '/tmp/fake/s-empty.jsonl';
      mockInventoryDelta = {
        reads: [{ path: '/home/user/proj/src/foo.ts', turn: 1, via: 'Read' }],
        skills: [],
        new_offset: 500,
        new_turn: 1,
      };

      await cli.run('repair', '--thorough');

      const s = cli.session('s-empty');
      assert.ok(s?.context?.reads['/home/user/proj/src/foo.ts']);
      assert.strictEqual(s?.meta._inventory_offset, '500');
      assert.strictEqual(s?.meta._inventory_turn, '1');
      assert.ok(cli.console.logs.some((l) => l.includes('Rebuilt context inventory')));
    });

    it('skips sessions that already have context reads', async () => {
      await cli.seed({
        id: 's-has-reads',
        state: 'closed',
        directory: '/home/user/proj',
        context: { reads: { '/home/user/proj/existing.ts': [1] } },
      });
      mockClaudeSessions = [{ id: 's-has-reads' }];
      mockTranscriptPath = '/tmp/fake/s-has-reads.jsonl';
      mockInventoryDelta = {
        reads: [{ path: '/home/user/proj/src/new.ts', turn: 2, via: 'Read' }],
        skills: [],
        new_offset: 200,
        new_turn: 2,
      };

      await cli.run('repair', '--thorough');

      const s = cli.session('s-has-reads');
      assert.ok(s?.context?.reads['/home/user/proj/existing.ts']);
      assert.strictEqual(s?.context?.reads['/home/user/proj/src/new.ts'], undefined);
      assert.ok(!cli.console.logs.some((l) => l.includes('Rebuilt context inventory')));
    });

    it('skips sessions when inventory delta is empty', async () => {
      await cli.seed({ id: 's-no-delta', state: 'closed' });
      mockClaudeSessions = [{ id: 's-no-delta' }];
      mockTranscriptPath = '/tmp/fake/s-no-delta.jsonl';
      mockInventoryDelta = { reads: [], skills: [], new_offset: 0, new_turn: 0 };

      await cli.run('repair', '--thorough');

      assert.ok(!cli.console.logs.some((l) => l.includes('Rebuilt context inventory')));
    });
  });
});

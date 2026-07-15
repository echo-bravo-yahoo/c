/**
 * Tests for c adopt command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

let mockClaudeSession: unknown = null;
let mockClaudeSessionTitles = { customTitle: null as string | null, summary: null as string | null };
let mockClaudeSessionsByDir: unknown[] = [];
let mockLiveSessions: Map<string, { status: string | null }> = new Map();
let mockPlanExecutionInfo: { slug: string; title: string | null } | null = null;
let mockPlanExecutionInfoById: Map<string, { slug: string; title: string | null }> | null = null;
let mockPlanContinuationInfo: { slug: string } | null = null;
let mockPreloadedContext: Record<string, unknown> = {};
let mockTranscriptUsage: { cost_usd: number } | null = null;

mock.module(resolve('src/util/process.ts'), {
  namedExports: {
    collectLiveSessions: () => mockLiveSessions,
    collectLiveSessionIds: () => new Set(mockLiveSessions.keys()),
    isProcessAlive: () => false,
    isTranscriptOpen: (id: string) => mockLiveSessions.has(id),
    signalSession: async () => {},
  },
});

mock.module(resolve('src/detection/pr.ts'), {
  namedExports: {
    listPRs: () => [],
    listOpenPRs: () => [],
    getCurrentPR: () => undefined,
    extractPRFromOutput: () => undefined,
    getPRNumber: () => undefined,
  },
});

mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => mockClaudeSession,
    getClaudeSessionTitles: () => mockClaudeSessionTitles,
    listClaudeSessions: () => [],
    getClaudeSessionsForDirectory: (dir: string) =>
      (mockClaudeSessionsByDir as Array<{ directory: string }>).filter((s) => s.directory === dir),
    readClaudeSessionIndex: () => null,
    findTranscriptPath: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    getCwdFromTranscriptHead: () => null,
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: (id: string) =>
      mockPlanExecutionInfoById ? (mockPlanExecutionInfoById.get(id) ?? null) : mockPlanExecutionInfo,
    getPlanExecutionInfoBefore: (id: string, slug: string, before: Date) => {
      const info = mockPlanExecutionInfoById ? (mockPlanExecutionInfoById.get(id) ?? null) : mockPlanExecutionInfo;
      if (!info || info.slug !== slug) return null;
      const ts = (info as { timestamp?: Date }).timestamp ?? new Date(0);
      if (ts.getTime() > before.getTime()) return null;
      return { title: info.title, timestamp: ts };
    },
    getPlanContinuationInfo: () => mockPlanContinuationInfo,
    extractPlanTitle: () => null,
    resetSessionCaches: () => {},
    decodeProjectKey: (k: string) => k,
    encodeProjectKey: (d: string) => d.replace(/\//g, '-'),
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    listClaudeSessionSizes: () => new Map(),
  },
});

mock.module(resolve('src/claude/preloaded-context.ts'), {
  namedExports: {
    capturePreloadedContext: () => mockPreloadedContext,
  },
});

mock.module(resolve('src/claude/usage.ts'), {
  namedExports: {
    readTranscriptUsage: () => mockTranscriptUsage,
  },
});

const { setupCLI } = await import('../helpers/cli.ts');
import type { CLIHarness } from '../helpers/cli.ts';

const MOCK_DIR = process.cwd();

function makeClaudeSession(id: string, directory = MOCK_DIR) {
  return {
    id,
    projectKey: directory.replace(/\//g, '-'),
    directory,
    transcriptPath: `/tmp/${id}.jsonl`,
    historyPath: '',
    modifiedAt: new Date('2025-06-01T12:00:00Z'),
    fileSize: 100,
  };
}

describe('c', () => {
  describe('adopt', () => {
    let cli: CLIHarness;

    beforeEach(() => {
      cli = setupCLI();
      mockClaudeSession = null;
      mockClaudeSessionTitles = { customTitle: null, summary: null };
      mockClaudeSessionsByDir = [];
      mockLiveSessions = new Map();
      mockPlanExecutionInfo = null;
      mockPlanExecutionInfoById = null;
      mockPlanContinuationInfo = null;
      mockPreloadedContext = {};
      mockTranscriptUsage = null;
    });

    afterEach(() => {
      cli.cleanup();
    });

    it('adopts a session as closed when transcript is not open', async () => {
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
      assert.strictEqual(s.state, 'closed');
      assert.strictEqual(s.directory, '/tmp/project');
      assert.ok(cli.console.logs.some(l => l.includes('Adopted session')));
    });

    it('adopts a session as idle when transcript is open with non-busy status', async () => {
      mockClaudeSession = {
        id: 'ephemeral-running',
        projectKey: '-tmp-project',
        directory: '/tmp/project',
        transcriptPath: '/tmp/transcript.jsonl',
        modifiedAt: new Date('2025-06-01T12:00:00Z'),
      };
      mockLiveSessions.set('ephemeral-running', { status: null });

      await cli.run('adopt', 'ephemeral-running');

      const s = cli.session('ephemeral-running');
      assert.ok(s);
      assert.strictEqual(s.state, 'idle');
    });

    it('adopts a session as busy when transcript is open with busy status', async () => {
      mockClaudeSession = {
        id: 'ephemeral-busy',
        projectKey: '-tmp-project',
        directory: '/tmp/project',
        transcriptPath: '/tmp/transcript.jsonl',
        modifiedAt: new Date('2025-06-01T12:00:00Z'),
      };
      mockLiveSessions.set('ephemeral-busy', { status: 'busy' });

      await cli.run('adopt', 'ephemeral-busy');

      const s = cli.session('ephemeral-busy');
      assert.ok(s);
      assert.strictEqual(s.state, 'busy');
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
      assert.strictEqual(output.state, 'closed');
      assert.strictEqual(output.directory, '/tmp/project');
    });

    describe('--all-here', () => {
      it('prints "no untracked sessions" when CWD has no Claude sessions', async () => {
        mockClaudeSessionsByDir = [];
        await cli.run('adopt', '--all-here');
        assert.ok(cli.console.logs.some(l => l.includes('No untracked sessions')));
        assert.strictEqual(cli.exit.exitCode, null);
      });

      it('adopts a single untracked session in CWD as closed when transcript not open', async () => {
        mockClaudeSessionsByDir = [makeClaudeSession('aaaaaaaa-0000-0000-0000-000000000001')];
        await cli.run('adopt', '--all-here');
        const s = cli.session('aaaaaaaa-0000-0000-0000-000000000001');
        assert.ok(s, 'session should be tracked');
        assert.strictEqual(s!.state, 'closed');
        assert.ok(cli.console.logs.some(l => l.includes('Adopted session')));
      });

      it('adopts a single untracked session in CWD as idle when transcript is open with non-busy status', async () => {
        mockClaudeSessionsByDir = [makeClaudeSession('aaaaaaaa-0000-0000-0000-000000000001')];
        mockLiveSessions.set('aaaaaaaa-0000-0000-0000-000000000001', { status: null });
        await cli.run('adopt', '--all-here');
        const s = cli.session('aaaaaaaa-0000-0000-0000-000000000001');
        assert.ok(s, 'session should be tracked');
        assert.strictEqual(s!.state, 'idle');
      });

      it('adopts multiple untracked sessions in CWD', async () => {
        mockClaudeSessionsByDir = [
          makeClaudeSession('aaaaaaaa-0000-0000-0000-000000000001'),
          makeClaudeSession('aaaaaaaa-0000-0000-0000-000000000002'),
        ];
        await cli.run('adopt', '--all-here');
        assert.ok(cli.session('aaaaaaaa-0000-0000-0000-000000000001'));
        assert.ok(cli.session('aaaaaaaa-0000-0000-0000-000000000002'));
        assert.strictEqual(
          cli.console.logs.filter(l => l.includes('Adopted session')).length,
          2
        );
      });

      it('skips already-tracked sessions without error', async () => {
        await cli.seed({ id: 'aaaaaaaa-0000-0000-0000-000000000001', state: 'busy' });
        mockClaudeSessionsByDir = [
          makeClaudeSession('aaaaaaaa-0000-0000-0000-000000000001'),
          makeClaudeSession('aaaaaaaa-0000-0000-0000-000000000002'),
        ];
        await cli.run('adopt', '--all-here');
        assert.strictEqual(
          cli.console.logs.filter(l => l.includes('Adopted session')).length,
          1
        );
        assert.strictEqual(cli.exit.exitCode, null);
      });

      it('does not adopt sessions from a different directory', async () => {
        mockClaudeSessionsByDir = [makeClaudeSession('aaaaaaaa-0000-0000-0000-000000000001', '/some/other/dir')];
        await cli.run('adopt', '--all-here');
        assert.ok(cli.console.logs.some(l => l.includes('No untracked sessions')));
        assert.strictEqual(cli.session('aaaaaaaa-0000-0000-0000-000000000001'), undefined);
      });

      it('errors when --all-here and session-id are both provided', async () => {
        await cli.run('adopt', '--all-here', 'some-session-id');
        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('cannot be combined')));
      });

      it('errors when --all-here and --name are both provided', async () => {
        await cli.run('adopt', '--all-here', '--name', 'foo');
        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('cannot be combined')));
      });

      it('outputs a JSON array when --all-here --json', async () => {
        mockClaudeSessionsByDir = [makeClaudeSession('aaaaaaaa-0000-0000-0000-000000000001')];
        await cli.run('adopt', '--all-here', '--json');
        const output = JSON.parse(cli.stdout.output.join(''));
        assert.ok(Array.isArray(output));
        assert.strictEqual(output[0].id, 'aaaaaaaa-0000-0000-0000-000000000001');
        assert.strictEqual(output[0].state, 'closed');
      });
    });

    describe('preloaded context', () => {
      it('captures preloaded context at adopt time', async () => {
        mockClaudeSession = makeClaudeSession('ctx-session');
        mockPreloadedContext = { claude_md: ['/home/user/CLAUDE.md'] };
        await cli.run('adopt', 'ctx-session');
        const s = cli.session('ctx-session');
        assert.ok(s);
        assert.deepStrictEqual(s.context?.claude_md, ['/home/user/CLAUDE.md']);
      });
    });

    describe('cost backfill', () => {
      it('sets cost_usd for closed sessions', async () => {
        mockClaudeSession = makeClaudeSession('cost-closed');
        mockLiveSessions = new Map();
        mockTranscriptUsage = { cost_usd: 1.23 };
        await cli.run('adopt', 'cost-closed');
        const s = cli.session('cost-closed');
        assert.ok(s);
        assert.strictEqual(s.state, 'closed');
        assert.strictEqual(s.cost_usd, 1.23);
      });

      it('does not set cost_usd for idle (active) sessions', async () => {
        mockClaudeSession = makeClaudeSession('cost-idle');
        mockLiveSessions.set('cost-idle', { status: null });
        mockTranscriptUsage = { cost_usd: 1.23 };
        await cli.run('adopt', 'cost-idle');
        const s = cli.session('cost-idle');
        assert.ok(s);
        assert.strictEqual(s.state, 'idle');
        assert.strictEqual(s.cost_usd, undefined);
      });
    });

    describe('parent/child lineage', () => {
      it('links child to parent when parent has plan info', async () => {
        const parentDir = '/home/user/proj';
        await cli.seed({
          id: 'parent-session',
          state: 'closed',
          directory: parentDir,
          last_active_at: new Date('2025-06-01T11:00:00Z'),
        });
        mockClaudeSession = {
          ...makeClaudeSession('child-session', parentDir),
          modifiedAt: new Date('2025-06-01T12:00:00Z'),
        };
        mockPlanContinuationInfo = { slug: 'fix-auth' };
        mockPlanExecutionInfoById = new Map([
          ['parent-session', { slug: 'fix-auth', title: 'Fix auth flow' }],
        ]);

        await cli.run('adopt', 'child-session');

        const s = cli.session('child-session');
        assert.ok(s);
        assert.strictEqual(s.parent_session_id, 'parent-session');
        assert.strictEqual(s.resources.plan, 'fix-auth');
        assert.strictEqual(s.name, 'Fix auth flow');
      });

      it('links child to parent in a different directory when the plan slug matches', async () => {
        await cli.seed({
          id: 'other-dir-parent',
          state: 'closed',
          directory: '/home/user/dir-a',
          last_active_at: new Date('2025-06-01T11:00:00Z'),
        });
        mockClaudeSession = {
          ...makeClaudeSession('cross-dir-child', '/home/user/dir-b'),
          modifiedAt: new Date('2025-06-01T12:00:00Z'),
        };
        mockPlanContinuationInfo = { slug: 'fix-auth' };
        mockPlanExecutionInfoById = new Map([
          ['other-dir-parent', { slug: 'fix-auth', title: 'Fix auth flow' }],
        ]);

        await cli.run('adopt', 'cross-dir-child');

        const s = cli.session('cross-dir-child');
        assert.ok(s);
        assert.strictEqual(s.parent_session_id, 'other-dir-parent');
      });

      it('sets resources.plan on self when own plan info exists', async () => {
        mockClaudeSession = makeClaudeSession('parent-adopting');
        mockPlanExecutionInfoById = new Map([
          ['parent-adopting', { slug: 'impl', title: null }],
        ]);

        await cli.run('adopt', 'parent-adopting');

        const s = cli.session('parent-adopting');
        assert.ok(s);
        assert.strictEqual(s.resources.plan, 'impl');
        assert.strictEqual(s.parent_session_id, undefined);
      });

      it('backfills parent resources.plan when child links to it', async () => {
        const dir = '/home/user/proj';
        await cli.seed({
          id: 'plan-parent',
          state: 'closed',
          directory: dir,
          last_active_at: new Date('2025-06-01T11:00:00Z'),
        });
        mockClaudeSession = {
          ...makeClaudeSession('plan-child', dir),
          modifiedAt: new Date('2025-06-01T12:00:00Z'),
        };
        mockPlanContinuationInfo = { slug: 'my-plan' };
        mockPlanExecutionInfoById = new Map([
          ['plan-parent', { slug: 'my-plan', title: 'My Plan' }],
        ]);

        await cli.run('adopt', 'plan-child');

        const parent = cli.session('plan-parent');
        assert.ok(parent);
        assert.strictEqual(parent.resources.plan, 'my-plan');
      });

      it('does not overwrite existing name when --name is provided', async () => {
        const dir = '/home/user/proj';
        await cli.seed({
          id: 'named-parent',
          state: 'closed',
          directory: dir,
          last_active_at: new Date('2025-06-01T11:00:00Z'),
        });
        mockClaudeSession = {
          ...makeClaudeSession('named-child', dir),
          modifiedAt: new Date('2025-06-01T12:00:00Z'),
        };
        mockPlanContinuationInfo = { slug: 'plan-x' };
        mockPlanExecutionInfoById = new Map([
          ['named-parent', { slug: 'plan-x', title: 'Plan Title' }],
        ]);

        await cli.run('adopt', 'named-child', '--name', 'custom-name');

        const s = cli.session('named-child');
        assert.ok(s);
        assert.strictEqual(s.name, 'custom-name');
      });

      it('sets resources.plan from continuation info when no matching parent exists', async () => {
        mockClaudeSession = makeClaudeSession('orphan-child', '/home/user/proj');
        mockPlanContinuationInfo = { slug: 'fix-auth' };
        // No parent in the index with this slug

        await cli.run('adopt', 'orphan-child');

        const s = cli.session('orphan-child');
        assert.ok(s);
        assert.strictEqual(s.resources.plan, 'fix-auth');
        assert.strictEqual(s.parent_session_id, undefined);
      });
    });
  });
});

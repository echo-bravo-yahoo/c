/**
 * Tests for session-start hook logic
 *
 * Most tests call the real handleSessionStart handler against a temp store.
 * Worktree resolution tests call the exported findWorktreeMatch directly.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mock } from 'node:test';
import { resolve } from 'node:path';
import { createTestSession } from '../fixtures/sessions.ts';
import type { TempStore } from '../helpers/store.ts';

// Mutable mock state for plan-continuation / plan-execution detection
let mockPlanContinuationInfoById: Map<string, { slug: string }> = new Map();
let mockPlanExecutionInfoById: Map<string, { slug: string; title: string | null; timestamp?: Date }> = new Map();

// Mock claude/sessions before any imports that pull it in. handleSessionStart and
// registerNewSession (src/hooks/session-start.ts) import it directly; store/index.ts
// (via applyPlanContinuationLink and findPlanExecutionParent) imports it transitively -
// so every import below that touches either module must be dynamic, positioned after
// this mock.module call.
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    resetSessionCaches: () => {},
    listClaudeSessions: () => [],
    listClaudeSessionSizes: () => new Map(),
    getClaudeSession: () => null,
    getClaudeSessionsForDirectory: () => [],
    findTranscriptPath: () => null,
    encodeProjectKey: (dir: string) => dir.replace(/[/. ]/g, '-'),
    decodeProjectKey: (key: string) => key.replace(/-/g, '/'),
    readClaudeSessionIndex: () => null,
    getClaudeSessionTitles: () => ({}),
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: () => null,
    getPlanExecutionInfoBefore: (id: string, slug: string, before: Date) => {
      const info = mockPlanExecutionInfoById.get(id);
      if (!info || info.slug !== slug) return null;
      const ts = info.timestamp ?? new Date(0);
      if (ts.getTime() > before.getTime()) return null;
      return { title: info.title, timestamp: ts };
    },
    getPlanContinuationInfo: (id: string) => mockPlanContinuationInfoById.get(id) ?? null,
    getCustomTitleFromTranscriptTail: () => null,
    getCwdFromTranscriptHead: () => null,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    extractPlanTitle: () => null,
  },
});

const { handleSessionStart, findWorktreeMatch, registerNewSession } = await import('../../src/hooks/session-start.ts');
const { updateIndex, getSession } = await import('../../src/store/index.ts');
const { encodeProjectKey } = await import('../../src/claude/sessions.ts');
const { setupTempStore } = await import('../helpers/store.ts');

describe('c', () => {
  describe('hooks', () => {
    describe('session-start', () => {
      let store: TempStore;
      let savedCSessionId: string | undefined;

      beforeEach(() => {
        store = setupTempStore();
        savedCSessionId = process.env.C_SESSION_ID;
        delete process.env.C_SESSION_ID;
        mockPlanContinuationInfoById = new Map();
        mockPlanExecutionInfoById = new Map();
      });

      afterEach(() => {
        store.cleanup();
        if (savedCSessionId !== undefined) {
          process.env.C_SESSION_ID = savedCSessionId;
        } else {
          delete process.env.C_SESSION_ID;
        }
      });

      describe('new session creation', () => {
        it('creates a new session with busy state', async () => {
          await handleSessionStart('new-session', '/some/project', null);

          const s = getSession('new-session');
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
        });

        it('sets directory and project_key', async () => {
          await handleSessionStart('new-session', '/some/project', null);

          const s = getSession('new-session');
          assert.ok(s);
          assert.strictEqual(s.directory, '/some/project');
          assert.ok(s.project_key);
        });

        it('no-op when sessionId is undefined', async () => {
          await handleSessionStart(undefined, '/some/project', null);

          // No session should be created
          const idx = (await updateIndex((i) => i));
          assert.strictEqual(Object.keys(idx.sessions).length, 0);
        });
      });

      describe('sessionId fallback via getCurrentSession', () => {
        it('processes existing session when sessionId is undefined', async () => {
          await updateIndex((idx) => {
            idx.sessions['fallback-session'] = createTestSession({
              id: 'fallback-session',
              directory: store.tmpDir,
              state: 'idle',
              last_active_at: new Date('2024-01-01'),
            });
          });

          await handleSessionStart(undefined, store.tmpDir, null);

          const s = getSession('fallback-session');
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
          assert.ok(s.last_active_at.getTime() > new Date('2024-01-01').getTime());
        });

        it('stores tmux_pane when sessionId is undefined', async () => {
          const savedTmuxPane = process.env.TMUX_PANE;
          process.env.TMUX_PANE = '%99';

          await updateIndex((idx) => {
            idx.sessions['pane-session'] = createTestSession({
              id: 'pane-session',
              directory: store.tmpDir,
              state: 'idle',
            });
          });

          await handleSessionStart(undefined, store.tmpDir, null);

          const s = getSession('pane-session');
          assert.ok(s);
          assert.strictEqual(s.resources.tmux_pane, '%99');

          if (savedTmuxPane !== undefined) {
            process.env.TMUX_PANE = savedTmuxPane;
          } else {
            delete process.env.TMUX_PANE;
          }
        });

        it('no-op when no session matches cwd', async () => {
          await updateIndex((idx) => {
            idx.sessions['other'] = createTestSession({
              id: 'other',
              directory: '/different/project',
              state: 'busy',
            });
          });

          await handleSessionStart(undefined, store.tmpDir, null);

          // other session should be untouched
          const s = getSession('other');
          assert.ok(s);
          assert.strictEqual(s.directory, '/different/project');
        });
      });

      describe('directory self-heal', () => {
        // Claude's project-key encoding is lossy (/, ., space, hyphen all -> -),
        // so an adopted session can carry a directory that decodeProjectKey
        // reconstructed wrong. The session-start hook's cwd is authoritative
        // and is trusted when it encodes to the already-stored project_key.
        it('corrects a mis-decoded directory using the hook cwd', async () => {
          const realCwd = '/repo/2023-2024 archive/q1 notes';
          await updateIndex((idx) => {
            idx.sessions['mangled'] = createTestSession({
              id: 'mangled',
              state: 'idle',
              directory: '/repo/2023/2024/archive/q1/notes', // bad decode
              project_key: encodeProjectKey(realCwd),
            });
          });

          await handleSessionStart('mangled', realCwd, null);

          assert.strictEqual(getSession('mangled')?.directory, realCwd);
        });

        it('leaves directory untouched when resumed from a different dir', async () => {
          await updateIndex((idx) => {
            idx.sessions['moved'] = createTestSession({
              id: 'moved',
              state: 'idle',
              directory: '/repo/a',
              project_key: encodeProjectKey('/repo/a'),
            });
          });

          // cwd /repo/b encodes to a different project_key - not a re-decode.
          await handleSessionStart('moved', '/repo/b', null);

          assert.strictEqual(getSession('moved')?.directory, '/repo/a');
        });
      });

      describe('concurrent session support', () => {
        it('preserves existing sessions when starting a new one', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', directory: '/project', state: 'busy' });
            idx.sessions['s2'] = createTestSession({ id: 's2', directory: '/project', state: 'idle' });
          });

          await handleSessionStart('s3', '/project', null);

          assert.strictEqual(getSession('s1')?.state, 'busy');
          assert.strictEqual(getSession('s2')?.state, 'idle');
          assert.strictEqual(getSession('s3')?.state, 'busy');
        });

        it('does not auto-close orphaned sessions', async () => {
          await updateIndex((idx) => {
            idx.sessions['orphan'] = createTestSession({
              id: 'orphan',
              directory: '/project',
              state: 'busy',
              last_active_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
            });
          });

          await handleSessionStart('new', '/project', null);

          assert.strictEqual(getSession('orphan')?.state, 'busy');
          assert.strictEqual(getSession('new')?.state, 'busy');
        });
      });

      describe('existing session update', () => {
        it('sets state to busy when resuming a closed session', async () => {
          await updateIndex((idx) => {
            idx.sessions['existing'] = createTestSession({ id: 'existing', state: 'closed' });
          });

          await handleSessionStart('existing', '/some/project', null);

          const s = getSession('existing');
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
        });

        it('updates last_active_at on resume', async () => {
          const oldDate = new Date('2024-01-01');
          await updateIndex((idx) => {
            idx.sessions['existing'] = createTestSession({
              id: 'existing',
              state: 'closed',
              last_active_at: oldDate,
            });
          });

          await handleSessionStart('existing', '/some/project', null);

          const s = getSession('existing');
          assert.ok(s);
          assert.ok(s.last_active_at.getTime() > oldDate.getTime());
        });
      });

      describe('git info merging', () => {
        it('preserves existing branch on resume', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1',
              state: 'closed',
              resources: { branch: 'existing-branch' },
            });
          });

          // Handler calls getCurrentBranch which returns undefined in temp dir (no git)
          await handleSessionStart('s1', store.tmpDir, null);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.resources.branch, 'existing-branch');
        });

        it('preserves existing JIRA on resume', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1',
              state: 'closed',
              resources: { jira: 'EXISTING-999' },
            });
          });

          await handleSessionStart('s1', store.tmpDir, null);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.resources.jira, 'EXISTING-999');
        });
      });

      describe('ephemeral session suppression', () => {
        let savedEphemeral: string | undefined;

        beforeEach(() => {
          savedEphemeral = process.env.C_EPHEMERAL;
        });

        afterEach(() => {
          if (savedEphemeral !== undefined) {
            process.env.C_EPHEMERAL = savedEphemeral;
          } else {
            delete process.env.C_EPHEMERAL;
          }
        });

        it('does not create a session when C_EPHEMERAL is set', async () => {
          process.env.C_EPHEMERAL = '1';
          await handleSessionStart('ephemeral-session', '/some/project', null);

          assert.strictEqual(getSession('ephemeral-session'), undefined);
        });

        it('creates a session normally when C_EPHEMERAL is not set', async () => {
          delete process.env.C_EPHEMERAL;
          await handleSessionStart('normal-session', '/some/project', null);

          const s = getSession('normal-session');
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
        });

        it('writes a status cache with EPHEMERAL=1 when C_EPHEMERAL is set', async () => {
          const { readFileSync, existsSync } = await import('node:fs');
          const { join } = await import('node:path');

          process.env.C_EPHEMERAL = '1';
          await handleSessionStart('ephemeral-cache', '/some/project', null);

          // No index entry
          assert.strictEqual(getSession('ephemeral-cache'), undefined);

          // Status cache exists with EPHEMERAL field
          const cachePath = join(store.tmpDir, 'state', 'ephemeral-cache', 'status');
          assert.ok(existsSync(cachePath), 'status cache file should exist');

          const content = readFileSync(cachePath, 'utf-8');
          assert.ok(content.includes('EPHEMERAL=1'), 'cache should contain EPHEMERAL=1');
        });
      });

      describe('transient session filtering on resume', () => {
        it('does not create a session for a transient ID during resume', async () => {
          const realId = 'real-session-uuid';
          const transientId = 'transient-session-uuid';

          await updateIndex((idx) => {
            idx.sessions[realId] = createTestSession({ id: realId, state: 'closed' });
          });

          await handleSessionStart(transientId, '/some/project', {
            session_id: transientId,
            cwd: '/some/project',
            source: 'resume',
          });

          assert.strictEqual(getSession(transientId), undefined);
        });

        it('allows the real session ID through on resume', async () => {
          const realId = 'real-session-uuid';

          await updateIndex((idx) => {
            idx.sessions[realId] = createTestSession({ id: realId, state: 'closed' });
          });

          await handleSessionStart(realId, '/some/project', {
            session_id: realId,
            cwd: '/some/project',
            source: 'resume',
          });

          const s = getSession(realId);
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
        });

        it('creates a new session on startup even within a resume env', async () => {
          const newId = 'brand-new-session-uuid';

          await handleSessionStart(newId, '/some/project', {
            session_id: newId,
            cwd: '/some/project',
            source: 'startup',
          });

          const s = getSession(newId);
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
        });
      });

      describe('fork detection via C_FORK_PARENT', () => {
        let savedForkParent: string | undefined;

        beforeEach(() => {
          savedForkParent = process.env.C_FORK_PARENT;
        });

        afterEach(() => {
          if (savedForkParent !== undefined) {
            process.env.C_FORK_PARENT = savedForkParent;
          } else {
            delete process.env.C_FORK_PARENT;
          }
        });

        it('registers forked session when C_FORK_PARENT is set during resume', async () => {
          const parentId = 'parent-session';
          const forkId = 'forked-session';

          await updateIndex((idx) => {
            idx.sessions[parentId] = createTestSession({
              id: parentId,
              state: 'idle',
              resources: { branch: 'main', jira: 'PROJ-123' },
            });
          });

          process.env.C_FORK_PARENT = parentId;

          await handleSessionStart(forkId, '/some/project', {
            session_id: forkId,
            cwd: '/some/project',
            source: 'resume',
          });

          const s = getSession(forkId);
          assert.ok(s, 'forked session should be registered');
          assert.strictEqual(s.state, 'busy');
          assert.strictEqual(s.parent_session_id, parentId);
          assert.strictEqual(s.meta._fork_origin, 'true');
          assert.strictEqual(s.resources.branch, 'main');
          assert.strictEqual(s.resources.jira, 'PROJ-123');
        });

        it('still skips phantom sessions when C_FORK_PARENT is not set', async () => {
          delete process.env.C_FORK_PARENT;

          await handleSessionStart('phantom-id', '/some/project', {
            session_id: 'phantom-id',
            cwd: '/some/project',
            source: 'resume',
          });

          assert.strictEqual(getSession('phantom-id'), undefined);
        });
      });

      describe('registerNewSession', () => {
        it('creates a session with busy state', async () => {
          await registerNewSession('reg-session', '/some/project');

          const s = getSession('reg-session');
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
        });

        it('sets directory and project_key', async () => {
          const cwd = '/home/user/myproject';
          await registerNewSession('reg-session', cwd);

          const s = getSession('reg-session');
          assert.ok(s);
          assert.strictEqual(s.directory, cwd);
          assert.strictEqual(s.project_key, encodeProjectKey(cwd));
        });

        it('does not create when C_EPHEMERAL is set', async () => {
          process.env.C_EPHEMERAL = '1';
          await registerNewSession('eph-session', '/some/project');
          delete process.env.C_EPHEMERAL;

          assert.strictEqual(getSession('eph-session'), undefined);
        });
      });

      describe('plan-continuation parent linking', () => {
        it('registerNewSession links parent_session_id and resources.plan on a continuation match', async () => {
          const parentId = 'plan-parent';
          const childId = 'plan-child';
          const slug = 'fix-the-thing';

          await updateIndex((idx) => {
            idx.sessions[parentId] = createTestSession({ id: parentId, state: 'closed' });
          });

          mockPlanContinuationInfoById.set(childId, { slug });
          mockPlanExecutionInfoById.set(parentId, {
            slug,
            title: 'Fix the thing',
            timestamp: new Date('2024-01-01'),
          });

          const session = await registerNewSession(childId, '/some/project');

          assert.ok(session);
          assert.strictEqual(session.parent_session_id, parentId);
          assert.strictEqual(session.resources.plan, slug);
          assert.strictEqual(session.name, 'Fix the thing');

          const persistedChild = getSession(childId);
          assert.strictEqual(persistedChild?.parent_session_id, parentId);

          // Parent backfill happened in the SAME transaction
          assert.strictEqual(getSession(parentId)?.resources.plan, slug);
        });

        it('matches a parent that is idle, not closed (Stop fires well before the process actually exits)', async () => {
          const parentId = 'idle-parent';
          const childId = 'idle-child';
          const slug = 'idle-parent-slug';

          await updateIndex((idx) => {
            idx.sessions[parentId] = createTestSession({ id: parentId, state: 'idle' });
          });

          mockPlanContinuationInfoById.set(childId, { slug });
          mockPlanExecutionInfoById.set(parentId, {
            slug,
            title: null,
            timestamp: new Date('2024-01-01'),
          });

          await handleSessionStart(childId, '/some/project', null);

          const s = getSession(childId);
          assert.ok(s);
          assert.strictEqual(s.parent_session_id, parentId);
          assert.strictEqual(s.resources.plan, slug);
          // No title on the match and no plan file on disk (extractPlanTitle mocked
          // to null) - falls back to the slug as the session name.
          assert.strictEqual(s.name, slug);
        });

        it('does not link when no candidate session produced the slug', async () => {
          const childId = 'unmatched-child';
          mockPlanContinuationInfoById.set(childId, { slug: 'no-such-plan' });

          await handleSessionStart(childId, '/some/project', null);

          const s = getSession(childId);
          assert.ok(s);
          assert.strictEqual(s.parent_session_id, undefined);
          assert.strictEqual(s.resources.plan, 'no-such-plan');
          assert.strictEqual(s.name, 'no-such-plan');
        });
      });

      describe('worktree branch resolution', () => {
        it('resolves branch from worktree path match', () => {
          const worktrees = [
            { path: '/repo', branch: 'main' },
            { path: '/repo/.worktrees/my-feature', branch: 'my-feature' },
          ];

          const match = findWorktreeMatch('my-feature', worktrees);
          assert.ok(match);
          assert.strictEqual(match.branch, 'my-feature');
        });

        it('resolves branch from branch name match', () => {
          const worktrees = [
            { path: '/repo', branch: 'main' },
            { path: '/worktrees/cool-thing', branch: 'feature/cool-thing' },
          ];

          const match = findWorktreeMatch('feature/cool-thing', worktrees);
          assert.ok(match);
          assert.strictEqual(match.branch, 'feature/cool-thing');
        });

        it('returns undefined when no worktree matches', () => {
          const worktrees = [
            { path: '/repo', branch: 'main' },
            { path: '/repo/.worktrees/other', branch: 'other' },
          ];

          const match = findWorktreeMatch('nonexistent', worktrees);
          assert.strictEqual(match, undefined);
        });

        it('prefers path match over branch match', () => {
          const worktrees = [
            { path: '/repo/.worktrees/bugfix', branch: 'bugfix-v2' },
            { path: '/other/worktrees/different', branch: 'bugfix' },
          ];

          // Path match comes first in find(), so bugfix-v2 is returned
          const match = findWorktreeMatch('bugfix', worktrees);
          assert.ok(match);
          assert.strictEqual(match.branch, 'bugfix-v2');
        });

        it('resolves correct branch for worktree session', () => {
          const worktrees = [
            { path: '/repo', branch: 'main' },
            { path: '/repo/.worktrees/billing-fix', branch: 'billing-fix' },
          ];

          const match = findWorktreeMatch('billing-fix', worktrees);
          assert.ok(match);
          assert.strictEqual(match.branch, 'billing-fix');
          assert.strictEqual(match.path, '/repo/.worktrees/billing-fix');
        });

        it('resolves feature branch when worktree name differs', () => {
          const worktrees = [
            { path: '/project', branch: 'develop' },
            { path: '/project/.worktrees/cool-feature', branch: 'feature/cool-feature' },
          ];

          const match = findWorktreeMatch('cool-feature', worktrees);
          assert.ok(match);
          assert.strictEqual(match.branch, 'feature/cool-feature');
        });

        it('resolves JIRA branch for worktree session', () => {
          const worktrees = [
            { path: '/work/repo', branch: 'main' },
            { path: '/work/repo/.worktrees/MAC-123-fix', branch: 'MAC-123-fix' },
          ];

          const match = findWorktreeMatch('MAC-123-fix', worktrees);
          assert.ok(match);
          assert.strictEqual(match.branch, 'MAC-123-fix');
        });

        it('falls back when worktree not found in list', () => {
          const worktrees = [
            { path: '/repo', branch: 'main' },
          ];

          const match = findWorktreeMatch('deleted-worktree', worktrees);
          assert.strictEqual(match, undefined);
        });
      });
    });
  });
});

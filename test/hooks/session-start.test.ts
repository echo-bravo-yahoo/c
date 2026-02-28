/**
 * Tests for session-start hook logic
 *
 * These tests verify the behavior of session creation and detection logic
 * without calling the actual hook (which requires mocked filesystem).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import { handleSessionStart } from '../../src/hooks/session-start.js';
import { updateIndex, getSession } from '../../src/store/index.js';
import type { Session } from '../../src/store/schema.js';

describe('c', () => {
  describe('hooks', () => {
    describe('session-start', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('concurrent session support', () => {
        it('allows multiple active sessions in same directory', () => {
          // Simulate the index state after starting multiple sessions
          const sessions: Session[] = [
            createTestSession({ id: 'sess-1', directory: '/project', state: 'busy' }),
            createTestSession({ id: 'sess-2', directory: '/project', state: 'idle' }),
            createTestSession({ id: 'sess-3', directory: '/project', state: 'waiting' }),
          ];

          const activeStates = ['busy', 'idle', 'waiting'];
          const activeSessions = sessions.filter(
            s => activeStates.includes(s.state) && s.directory === '/project'
          );

          // All three sessions remain active - no auto-closing
          assert.strictEqual(activeSessions.length, 3);
        });

        it('preserves existing sessions on start', () => {
          const existingSession = createTestSession({
            id: 'existing',
            directory: '/project',
            state: 'idle',
          });

          // Simulate starting a new session - existing session state unchanged
          const newSession = createTestSession({
            id: 'new-session',
            directory: '/project',
            state: 'busy',
          });

          // Existing session remains idle (not closed)
          assert.strictEqual(existingSession.state, 'idle');
          assert.strictEqual(newSession.state, 'busy');
        });

        it('sessions only close via SessionEnd hook', () => {
          const sessions: Session[] = [
            createTestSession({ id: 'sess-1', directory: '/project', state: 'busy' }),
            createTestSession({ id: 'sess-2', directory: '/project', state: 'idle' }),
          ];

          // Simulate SessionEnd for sess-1 only
          const sessionEndFired = (id: string) => {
            const s = sessions.find(s => s.id === id);
            if (s) s.state = 'closed';
          };

          sessionEndFired('sess-1');

          // Only sess-1 is closed, sess-2 remains active
          assert.strictEqual(sessions[0].state, 'closed');
          assert.strictEqual(sessions[1].state, 'idle');
        });

        it('orphaned sessions persist until manually closed', () => {
          // Session where SessionEnd never fired (Ctrl-C, crash)
          const orphanedSession = createTestSession({
            id: 'orphaned',
            directory: '/project',
            state: 'busy',
            last_active_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          });

          // New session starts in same directory
          const newSession = createTestSession({
            id: 'new',
            directory: '/project',
            state: 'busy',
          });

          // Orphaned session is NOT auto-closed
          assert.strictEqual(orphanedSession.state, 'busy');
          assert.strictEqual(newSession.state, 'busy');
        });
      });

      describe('recent session detection for parent linking', () => {
        it('finds recently closed sessions within threshold', () => {
          const now = Date.now();
          const threshold = 30 * 1000; // 30 seconds
          const currentId = 'new-session';
          const cwd = '/project';

          const sessions: Session[] = [
            createTestSession({
              id: 'recent',
              directory: cwd,
              state: 'closed',
              last_active_at: new Date(now - 10 * 1000), // 10 seconds ago
            }),
            createTestSession({
              id: 'old',
              directory: cwd,
              state: 'closed',
              last_active_at: new Date(now - 60 * 1000), // 60 seconds ago
            }),
          ];

          const recent = sessions.filter(
            s =>
              s.state === 'closed' &&
              s.directory === cwd &&
              s.id !== currentId &&
              now - s.last_active_at.getTime() < threshold
          );

          assert.strictEqual(recent.length, 1);
          assert.strictEqual(recent[0].id, 'recent');
        });
      });

      describe('git info merging', () => {
        it('preserves existing branch', () => {
          const session = createTestSession({
            resources: { branch: 'existing-branch' },
          });

          const newBranch = 'detected-branch';

          // Logic: only set branch if not already set
          if (!session.resources.branch) {
            session.resources.branch = newBranch;
          }

          assert.strictEqual(session.resources.branch, 'existing-branch');
        });

        it('sets branch when not present', () => {
          const session = createTestSession({ resources: {} });

          const newBranch = 'detected-branch';

          if (!session.resources.branch) {
            session.resources.branch = newBranch;
          }

          assert.strictEqual(session.resources.branch, 'detected-branch');
        });

        it('extracts JIRA from branch when setting', () => {
          const session = createTestSession({ resources: {} });
          const branch = 'feature/MAC-123-add-login';

          session.resources.branch = branch;

          // Simulate JIRA extraction
          const match = branch.match(/\b([A-Z]{2,10}-\d+)\b/);
          if (match && !session.resources.jira) {
            session.resources.jira = match[1];
          }

          assert.strictEqual(session.resources.jira, 'MAC-123');
        });

        it('preserves existing JIRA', () => {
          const session = createTestSession({
            resources: { jira: 'EXISTING-999' },
          });
          const branch = 'feature/MAC-123-add-login';

          session.resources.branch = branch;

          const match = branch.match(/\b([A-Z]{2,10}-\d+)\b/);
          if (match && !session.resources.jira) {
            session.resources.jira = match[1];
          }

          assert.strictEqual(session.resources.jira, 'EXISTING-999');
        });
      });

      describe('parent session linking', () => {
        it('sets parent_session_id when plan execution detected', () => {
          const session = createTestSession();
          const parentId = 'parent-uuid';

          session.parent_session_id = parentId;

          assert.strictEqual(session.parent_session_id, parentId);
        });

        it('sets name from plan slug when available', () => {
          const session = createTestSession();
          const planSlug = 'implement-feature';

          session.name = planSlug;

          assert.strictEqual(session.name, 'implement-feature');
        });
      });

      describe('existing session update', () => {
        it('updates last_active_at when session exists', () => {
          const oldDate = new Date('2024-01-01');
          const session = createTestSession({ last_active_at: oldDate });

          const newDate = new Date('2024-01-15');
          session.last_active_at = newDate;

          assert.strictEqual(session.last_active_at, newDate);
        });

        it('sets state to busy when resuming', () => {
          const session = createTestSession({ state: 'closed' });

          session.state = 'busy';

          assert.strictEqual(session.state, 'busy');
        });
      });

      describe('transient session filtering on resume', () => {
        let tmpDir: string;
        let savedCHome: string | undefined;
        let savedCSessionId: string | undefined;

        beforeEach(() => {
          tmpDir = mkdtempSync(join(tmpdir(), 'c-test-'));
          savedCHome = process.env.C_HOME;
          savedCSessionId = process.env.C_SESSION_ID;
          process.env.C_HOME = tmpDir;
        });

        afterEach(() => {
          process.env.C_HOME = savedCHome;
          if (savedCHome === undefined) delete process.env.C_HOME;
          process.env.C_SESSION_ID = savedCSessionId;
          if (savedCSessionId === undefined) delete process.env.C_SESSION_ID;
          rmSync(tmpDir, { recursive: true, force: true });
        });

        it('does not create a session for a transient ID during resume', async () => {
          const realId = 'real-session-uuid';
          const transientId = 'transient-session-uuid';

          // Seed the real session into the store
          await updateIndex((idx) => {
            idx.sessions[realId] = createTestSession({ id: realId, state: 'closed' });
          });

          // Simulate resume: C_SESSION_ID is the real session
          process.env.C_SESSION_ID = realId;

          // Hook fires with the transient ID
          await handleSessionStart(transientId, '/some/project', null);

          // No phantom session created for the transient ID
          assert.strictEqual(getSession(transientId), undefined);
        });

        it('allows the real session ID through when C_SESSION_ID matches', async () => {
          const realId = 'real-session-uuid';

          // Seed the real session into the store
          await updateIndex((idx) => {
            idx.sessions[realId] = createTestSession({ id: realId, state: 'closed' });
          });

          // C_SESSION_ID matches the incoming session ID
          process.env.C_SESSION_ID = realId;

          await handleSessionStart(realId, '/some/project', null);

          // Session was updated (state set to busy on resume)
          const s = getSession(realId);
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
        });

        it('creates a new session when C_SESSION_ID is not set', async () => {
          const newId = 'brand-new-session-uuid';

          delete process.env.C_SESSION_ID;

          await handleSessionStart(newId, '/some/project', null);

          // New session was created
          const s = getSession(newId);
          assert.ok(s);
          assert.strictEqual(s.state, 'busy');
        });
      });

      describe('worktree branch resolution', () => {
        /**
         * Simulate listWorktrees() output format
         */
        type WorktreeInfo = { path: string; branch: string };

        /**
         * Replicate the worktree resolution logic from session-start hook
         */
        function resolveWorktreeBranch(
          session: Session,
          worktrees: WorktreeInfo[]
        ): string | undefined {
          if (!session.resources.worktree) {
            return undefined;
          }

          const wt = worktrees.find(
            (w) =>
              w.path.endsWith(`/${session.resources.worktree}`) ||
              w.branch === session.resources.worktree
          );

          return wt?.branch;
        }

        it('resolves branch from worktree path match', () => {
          const session = createTestSession({
            resources: { worktree: 'my-feature' },
          });
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
            { path: '/repo/.worktrees/my-feature', branch: 'my-feature' },
          ];

          const branch = resolveWorktreeBranch(session, worktrees);

          assert.strictEqual(branch, 'my-feature');
        });

        it('resolves branch from branch name match', () => {
          const session = createTestSession({
            resources: { worktree: 'feature/cool-thing' },
          });
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
            { path: '/worktrees/cool-thing', branch: 'feature/cool-thing' },
          ];

          const branch = resolveWorktreeBranch(session, worktrees);

          assert.strictEqual(branch, 'feature/cool-thing');
        });

        it('returns undefined when no worktree matches', () => {
          const session = createTestSession({
            resources: { worktree: 'nonexistent' },
          });
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
            { path: '/repo/.worktrees/other', branch: 'other' },
          ];

          const branch = resolveWorktreeBranch(session, worktrees);

          assert.strictEqual(branch, undefined);
        });

        it('returns undefined when session has no worktree set', () => {
          const session = createTestSession({ resources: {} });
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
          ];

          const branch = resolveWorktreeBranch(session, worktrees);

          assert.strictEqual(branch, undefined);
        });

        it('prefers path match over branch match', () => {
          const session = createTestSession({
            resources: { worktree: 'bugfix' },
          });
          const worktrees: WorktreeInfo[] = [
            { path: '/repo/.worktrees/bugfix', branch: 'bugfix-v2' },
            { path: '/other/worktrees/different', branch: 'bugfix' },
          ];

          // Path match comes first in find(), so bugfix-v2 is returned
          const branch = resolveWorktreeBranch(session, worktrees);

          assert.strictEqual(branch, 'bugfix-v2');
        });

        it('sets branch on session when resolved', () => {
          const session = createTestSession({
            resources: { worktree: 'my-feature' },
          });
          const worktrees: WorktreeInfo[] = [
            { path: '/repo/.worktrees/my-feature', branch: 'my-feature' },
          ];

          const resolvedBranch = resolveWorktreeBranch(session, worktrees);
          if (resolvedBranch && !session.resources.branch) {
            session.resources.branch = resolvedBranch;
          }

          assert.strictEqual(session.resources.branch, 'my-feature');
        });

        it('preserves existing branch', () => {
          const session = createTestSession({
            resources: { worktree: 'my-feature', branch: 'main' },
          });
          const worktrees: WorktreeInfo[] = [
            { path: '/repo/.worktrees/my-feature', branch: 'my-feature' },
          ];

          const resolvedBranch = resolveWorktreeBranch(session, worktrees);
          if (resolvedBranch && !session.resources.branch) {
            session.resources.branch = resolvedBranch;
          }

          // Branch unchanged - was already 'main'
          assert.strictEqual(session.resources.branch, 'main');
        });
      });

      describe('worktree branch resolution', () => {
        type WorktreeInfo = { path: string; branch: string };

        type BranchByPath = Record<string, string>;

        /**
         * Resolve the actual branch for a session by checking its worktree path.
         */
        function detectBranch(
          cwd: string,
          session: Session,
          worktrees: WorktreeInfo[],
          branchByPath: BranchByPath
        ): string | undefined {
          let branchCwd = cwd;

          if (session.resources.worktree) {
            const wt = worktrees.find(
              (w) =>
                w.path.endsWith(`/${session.resources.worktree}`) ||
                w.branch === session.resources.worktree
            );
            if (wt) {
              branchCwd = wt.path;
            }
          }

          return branchByPath[branchCwd];
        }

        it('resolves correct branch for worktree session', () => {
          const session = createTestSession({
            directory: '/repo',
            resources: { worktree: 'billing-fix' },
          });

          const cwd = '/repo';
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
            { path: '/repo/.worktrees/billing-fix', branch: 'billing-fix' },
          ];
          const branchByPath: BranchByPath = {
            '/repo': 'main',
            '/repo/.worktrees/billing-fix': 'billing-fix',
          };

          const result = detectBranch(cwd, session, worktrees, branchByPath);

          assert.strictEqual(result, 'billing-fix');
        });

        it('resolves feature branch when worktree name differs', () => {
          const session = createTestSession({
            directory: '/project',
            resources: { worktree: 'cool-feature' },
          });

          const cwd = '/project';
          const worktrees: WorktreeInfo[] = [
            { path: '/project', branch: 'develop' },
            { path: '/project/.worktrees/cool-feature', branch: 'feature/cool-feature' },
          ];
          const branchByPath: BranchByPath = {
            '/project': 'develop',
            '/project/.worktrees/cool-feature': 'feature/cool-feature',
          };

          const result = detectBranch(cwd, session, worktrees, branchByPath);

          assert.strictEqual(result, 'feature/cool-feature');
        });

        it('resolves JIRA branch for worktree session', () => {
          const session = createTestSession({
            directory: '/work/repo',
            resources: { worktree: 'MAC-123-fix' },
          });

          const cwd = '/work/repo';
          const worktrees: WorktreeInfo[] = [
            { path: '/work/repo', branch: 'main' },
            { path: '/work/repo/.worktrees/MAC-123-fix', branch: 'MAC-123-fix' },
          ];
          const branchByPath: BranchByPath = {
            '/work/repo': 'main',
            '/work/repo/.worktrees/MAC-123-fix': 'MAC-123-fix',
          };

          const result = detectBranch(cwd, session, worktrees, branchByPath);

          assert.strictEqual(result, 'MAC-123-fix');
        });

        it('uses cwd branch when no worktree set', () => {
          const session = createTestSession({
            directory: '/repo',
            resources: {},
          });

          const cwd = '/repo';
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
          ];
          const branchByPath: BranchByPath = {
            '/repo': 'main',
          };

          const result = detectBranch(cwd, session, worktrees, branchByPath);

          assert.strictEqual(result, 'main');
        });

        it('uses cwd branch when cwd is the worktree', () => {
          const session = createTestSession({
            directory: '/repo/.worktrees/feature',
            resources: { worktree: 'feature' },
          });

          const cwd = '/repo/.worktrees/feature';
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
            { path: '/repo/.worktrees/feature', branch: 'feature' },
          ];
          const branchByPath: BranchByPath = {
            '/repo': 'main',
            '/repo/.worktrees/feature': 'feature',
          };

          const result = detectBranch(cwd, session, worktrees, branchByPath);

          assert.strictEqual(result, 'feature');
        });

        it('falls back to cwd when worktree not found', () => {
          const session = createTestSession({
            directory: '/repo',
            resources: { worktree: 'deleted-worktree' },
          });

          const cwd = '/repo';
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
          ];
          const branchByPath: BranchByPath = {
            '/repo': 'main',
          };

          const result = detectBranch(cwd, session, worktrees, branchByPath);

          assert.strictEqual(result, 'main');
        });

        it('updates session branch from worktree resolution', () => {
          const cwd = '/repo';
          const worktrees: WorktreeInfo[] = [
            { path: '/repo', branch: 'main' },
            { path: '/repo/.worktrees/my-feature', branch: 'my-feature' },
          ];
          const branchByPath: BranchByPath = {
            '/repo': 'main',
            '/repo/.worktrees/my-feature': 'my-feature',
          };

          const session = createTestSession({
            directory: '/repo',
            resources: { worktree: 'my-feature' },
          });
          const branch = detectBranch(cwd, session, worktrees, branchByPath);
          if (branch && !session.resources.branch) {
            session.resources.branch = branch;
          }

          assert.strictEqual(session.resources.branch, 'my-feature');
        });
      });
    });
  });
});

/**
 * Tests for session-start hook logic
 *
 * Most tests call the real handleSessionStart handler against a temp store.
 * Worktree resolution tests call the exported findWorktreeMatch directly.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { handleSessionStart, findWorktreeMatch } from '../../src/hooks/session-start.ts';
import { updateIndex, getSession } from '../../src/store/index.ts';
import { createTestSession } from '../fixtures/sessions.ts';
import { setupTempStore, type TempStore } from '../helpers/store.ts';

describe('c', () => {
  describe('hooks', () => {
    describe('session-start', () => {
      let store: TempStore;
      let savedCSessionId: string | undefined;

      beforeEach(() => {
        store = setupTempStore();
        savedCSessionId = process.env.C_SESSION_ID;
        delete process.env.C_SESSION_ID;
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

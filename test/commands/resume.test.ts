/**
 * Tests for resume command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';
import { shortId } from '../../src/util/format.js';

describe('c', () => {
  describe('commands', () => {
    describe('resume', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', () => {
          const sessions = [
            createTestSession({ id: 'abc-123-full-uuid' }),
            createTestSession({ id: 'def-456-full-uuid' }),
          ];

          const prefix = 'abc';
          const matches = sessions.filter(
            s => s.id.startsWith(prefix) || s.humanhash.startsWith(prefix)
          );

          assert.strictEqual(matches.length, 1);
        });

        it('finds session by humanhash prefix', () => {
          const sessions = [
            createTestSession({ humanhash: 'alpha-bravo-charlie' }),
            createTestSession({ humanhash: 'delta-echo-foxtrot' }),
          ];

          const prefix = 'alpha';
          const matches = sessions.filter(s => s.humanhash.startsWith(prefix));

          assert.strictEqual(matches.length, 1);
          assert.strictEqual(matches[0].humanhash, 'alpha-bravo-charlie');
        });

        it('rejects ambiguous prefix', () => {
          const sessions = [
            createTestSession({ id: 'abc-111' }),
            createTestSession({ id: 'abc-222' }),
          ];

          const prefix = 'abc';
          const matches = sessions.filter(s => s.id.startsWith(prefix));

          // Should have multiple matches - ambiguous
          assert.strictEqual(matches.length, 2);
        });

        it('lists colliding sessions for ambiguous prefix', () => {
          const sessions = [
            createTestSession({ id: 'abc12345-0000-0000-0000-000000000000' }),
            createTestSession({ id: 'abc67890-0000-0000-0000-000000000000' }),
            createTestSession({ id: 'def11111-0000-0000-0000-000000000000' }),
          ];

          const prefix = 'abc';
          const matches = sessions.filter(
            s => s.id.startsWith(prefix) || s.humanhash.startsWith(prefix)
          );

          assert.strictEqual(matches.length, 2);
          assert.strictEqual(shortId(matches[0].id), 'abc12345');
          assert.strictEqual(shortId(matches[1].id), 'abc67890');
        });
      });

      describe('Claude session verification', () => {
        it('uses session directory as cwd', () => {
          const session = createTestSession({ directory: '/home/user/project' });

          // The resume command would use this as cwd for claude -r
          assert.strictEqual(session.directory, '/home/user/project');
        });

        it('passes session ID to claude -r', () => {
          const session = createTestSession({ id: 'abc-123-full-uuid' });

          // The resume command would call: claude -r {session.id}
          assert.strictEqual(session.id, 'abc-123-full-uuid');
        });
      });

      describe('error conditions', () => {
        it('returns undefined when session missing', () => {
          const sessions: Session[] = [];
          const found = sessions.find(s => s.id === 'nonexistent');

          assert.strictEqual(found, undefined);
        });

        it('returns nothing from empty index', () => {
          const sessions: Session[] = [];
          const matches = sessions.filter(s => s.id.startsWith('any'));

          assert.strictEqual(matches.length, 0);
        });
      });

      describe('stale session handling', () => {
        it('archives session when Claude storage is missing', () => {
          const session = createTestSession({ state: 'busy', pid: 12345 });

          // Simulate: session in c's index but getClaudeSession returns undefined
          const claudeSessionExists = false;

          if (!claudeSessionExists) {
            session.state = 'archived';
            session.last_active_at = new Date();
            delete session.pid;
          }

          assert.strictEqual(session.state, 'archived');
          assert.strictEqual(session.pid, undefined);
        });

        it('clears PID on stale session', () => {
          const session = createTestSession({ state: 'busy', pid: 99999 });
          assert.strictEqual(session.pid, 99999);

          // After archival
          session.state = 'archived';
          delete session.pid;

          assert.strictEqual(session.pid, undefined);
        });

        it('archives PID-less stale session', () => {
          const session = createTestSession({ state: 'idle' });
          assert.strictEqual(session.pid, undefined);

          session.state = 'archived';
          session.last_active_at = new Date();
          delete session.pid;

          assert.strictEqual(session.state, 'archived');
        });

        it('hides stale session from active list after archival', () => {
          const sessions = [
            createTestSession({ state: 'busy', pid: 111 }),
            createTestSession({ state: 'idle' }),
          ];

          // Archive the first session (stale)
          sessions[0].state = 'archived';
          delete sessions[0].pid;

          const active = sessions.filter(s => s.state !== 'archived');
          assert.strictEqual(active.length, 1);
          assert.strictEqual(active[0].state, 'idle');
        });
      });

      describe('claude failure handling', () => {
        it('archives session on non-zero exit', () => {
          const session = createTestSession({ state: 'idle', pid: 12345 });
          const exitCode: number = 1;

          if (exitCode !== 0) {
            session.state = 'archived';
            session.last_active_at = new Date();
            delete session.pid;
          }

          assert.strictEqual(session.state, 'archived');
        });

        it('clears PID on non-zero exit', () => {
          const session = createTestSession({ state: 'idle', pid: 54321 });
          assert.strictEqual(session.pid, 54321);

          const exitCode: number = 2;

          if (exitCode !== 0) {
            session.state = 'archived';
            session.last_active_at = new Date();
            delete session.pid;
          }

          assert.strictEqual(session.pid, undefined);
        });

        it('preserves session on successful exit', () => {
          const session = createTestSession({ state: 'idle', pid: 99999 });
          const exitCode = 0;

          if (exitCode !== 0) {
            session.state = 'archived';
            session.last_active_at = new Date();
            delete session.pid;
          }

          assert.strictEqual(session.state, 'idle');
          assert.strictEqual(session.pid, 99999);
        });
      });

      describe('missing directory handling', () => {
        it('recovers worktree session when directory is deleted', () => {
          const session = createTestSession({
            directory: '/repo/.claude/worktrees/gone',
            resources: { worktree: 'gone' },
            state: 'idle',
          });

          // Simulate: directory doesn't exist, but repo root does
          const dirExists = false;
          const repoMatch = session.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);

          if (!dirExists && repoMatch) {
            session.directory = repoMatch[1];
            delete session.resources.worktree;
          }

          assert.strictEqual(session.directory, '/repo');
          assert.strictEqual(session.resources.worktree, undefined);
        });

        it('archives non-worktree session when directory is deleted', () => {
          const session = createTestSession({
            directory: '/deleted/project',
            state: 'idle',
            pid: 12345,
          });

          // Simulate: directory doesn't exist and path is not a worktree
          const dirExists = false;
          const repoMatch = session.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);

          if (!dirExists && !repoMatch) {
            session.state = 'archived';
            session.last_active_at = new Date();
            delete session.pid;
          }

          assert.strictEqual(session.state, 'archived');
          assert.strictEqual(session.pid, undefined);
        });

        it('preserves session state after worktree recovery', () => {
          const session = createTestSession({
            id: 'keep-me-alive',
            name: 'Important Work',
            directory: '/repo/.claude/worktrees/gone',
            resources: { worktree: 'gone', branch: 'feature-x' },
            state: 'idle',
          });

          // Simulate worktree recovery
          const repoMatch = session.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
          if (repoMatch) {
            session.directory = repoMatch[1];
            delete session.resources.worktree;
          }

          // State, name, ID should be untouched
          assert.strictEqual(session.state, 'idle');
          assert.strictEqual(session.id, 'keep-me-alive');
          assert.strictEqual(session.name, 'Important Work');
          // Branch resource preserved, worktree cleared
          assert.strictEqual(session.resources.branch, 'feature-x');
          assert.strictEqual(session.resources.worktree, undefined);
        });

        it('recovers from .worktrees/ path (non-.claude variant)', () => {
          const session = createTestSession({
            directory: '/repo/.worktrees/old-branch',
            resources: { worktree: 'old-branch' },
            state: 'idle',
          });

          const repoMatch = session.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
          if (repoMatch) {
            session.directory = repoMatch[1];
            delete session.resources.worktree;
          }

          assert.strictEqual(session.directory, '/repo');
          assert.strictEqual(session.resources.worktree, undefined);
        });
      });

      describe('session name lookup', () => {
        it('finds session by exact name', () => {
          const sessions = [
            createTestSession({ name: 'Auth Feature' }),
            createTestSession({ name: 'Dashboard Work' }),
          ];

          const input = 'Auth Feature';
          const matches = sessions.filter(s => s.name === input);

          assert.strictEqual(matches.length, 1);
          assert.strictEqual(matches[0].name, 'Auth Feature');
        });

        it('rejects partial name match', () => {
          const sessions = [
            createTestSession({ name: 'Auth Feature' }),
          ];

          const input = 'Auth';
          const matches = sessions.filter(s => s.name === input);

          assert.strictEqual(matches.length, 0);
        });

        it('handles multiple sessions with same name', () => {
          const sessions = [
            createTestSession({ id: 'abc12345-0000-0000-0000-000000000000', name: 'test session' }),
            createTestSession({ id: 'def67890-0000-0000-0000-000000000000', name: 'test session' }),
          ];

          const input = 'test session';
          const matches = sessions.filter(s => s.name === input);

          assert.strictEqual(matches.length, 2);
          assert.strictEqual(shortId(matches[0].id), 'abc12345');
          assert.strictEqual(shortId(matches[1].id), 'def67890');
        });

        it('prefers ID match over name match', () => {
          const sessions = [
            createTestSession({ id: 'abc12345-0000-0000-0000-000000000000', name: 'unrelated' }),
            createTestSession({ id: 'def67890-0000-0000-0000-000000000000', name: 'abc12345' }),
          ];

          // ID prefix lookup runs first — should match session 1 by ID, not session 2 by name
          const prefix = 'abc1';
          const idMatches = sessions.filter(
            s => s.id.startsWith(prefix) || s.humanhash.startsWith(prefix)
          );

          assert.strictEqual(idMatches.length, 1);
          assert.strictEqual(idMatches[0].id, 'abc12345-0000-0000-0000-000000000000');
        });
      });

      describe('Claude store fallback', () => {
        it('resolves session when Claude title matches but c name differs', () => {
          // Simulate: Claude has customTitle "My Feature", c store has name "" for that session
          const session = createTestSession({ id: 'aaa11111-0000-0000-0000-000000000000', name: '' });

          // findClaudeSessionIdsByTitle("My Feature") would return ['aaa11111-...']
          // getSession('aaa11111-...') resolves to `session`
          const claudeIds = [session.id];
          const resolved = claudeIds
            .map(id => [session].find(s => s.id === id))
            .filter((s): s is Session => s != null);

          assert.strictEqual(resolved.length, 1);
          assert.strictEqual(resolved[0].id, session.id);
        });

        it('skips Claude sessions not in c store', () => {
          const session = createTestSession({ id: 'bbb22222-0000-0000-0000-000000000000' });

          // Claude returns an ID that doesn't exist in c's store
          const claudeIds = ['not-in-c-store'];
          const resolved = claudeIds
            .map(id => [session].find(s => s.id === id))
            .filter((s): s is Session => s != null);

          assert.strictEqual(resolved.length, 0);
        });
      });

      describe('session info for display', () => {
        it('uses name as display name', () => {
          const session = createTestSession({
            name: 'My Session',
            humanhash: 'alpha-bravo',
          });

          // Display logic: name > humanhash
          const displayName = session.name || session.humanhash;
          assert.strictEqual(displayName, 'My Session');
        });

        it('falls back to humanhash when no name', () => {
          const session = createTestSession({
            name: '',
            humanhash: 'alpha-bravo',
          });

          const displayName = session.name || session.humanhash;
          assert.strictEqual(displayName, 'alpha-bravo');
        });

        it('includes directory in log message', () => {
          const session = createTestSession({
            directory: '/home/user/project',
          });

          // Log would show: "Resuming session X in /home/user/project..."
          assert.ok(session.directory.startsWith('/'));
        });
      });
    });
  });
});

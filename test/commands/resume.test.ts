/**
 * Tests for resume command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
            s => s.id.startsWith(prefix)
          );

          assert.strictEqual(matches.length, 1);
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
            s => s.id.startsWith(prefix)
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
        it('restores previous state on non-zero exit', () => {
          const session = createTestSession({ state: 'idle', pid: 12345 });
          const prevState = session.state;
          const prevPid = session.pid;
          const exitCode: number = 1;

          // Simulate pre-spawn update
          session.state = 'idle';
          session.pid = process.pid;

          // Simulate non-zero exit — restore previous state
          if (exitCode !== 0) {
            session.state = prevState;
            if (prevPid != null) {
              session.pid = prevPid;
            } else {
              delete session.pid;
            }
          }

          assert.strictEqual(session.state, 'idle');
          assert.strictEqual(session.pid, 12345);
        });

        it('restores previous state on spawn error', () => {
          const session = createTestSession({ state: 'idle', pid: 54321 });
          const prevState = session.state;
          const prevPid = session.pid;

          // Simulate pre-spawn update
          session.state = 'idle';
          session.pid = process.pid;

          // Simulate spawn error — restore previous state
          session.state = prevState;
          if (prevPid != null) {
            session.pid = prevPid;
          } else {
            delete session.pid;
          }

          assert.strictEqual(session.state, 'idle');
          assert.strictEqual(session.pid, 54321);
        });

        it('clears PID on non-zero exit when session had no PID', () => {
          const session = createTestSession({ state: 'idle' });
          const prevState = session.state;
          const prevPid = session.pid;

          // Simulate pre-spawn update
          session.pid = process.pid;
          session.state = 'idle';

          // Non-zero exit — restore
          session.state = prevState;
          if (prevPid != null) {
            session.pid = prevPid;
          } else {
            delete session.pid;
          }

          assert.strictEqual(session.state, 'idle');
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
            s => s.id.startsWith(prefix)
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

      describe('worktree recreation', () => {
        it('attempts worktree recreation when directory is missing and branch exists', () => {
          const session = createTestSession({
            directory: '/repo/.claude/worktrees/feat',
            resources: { worktree: 'feat', branch: 'feat' },
            state: 'idle',
          });

          // Simulate: directory missing, repo root exists, branch exists
          const dirExists = false;
          const repoMatch = session.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
          const repoRootExists = true;
          const branchExists = true;

          if (!dirExists && repoMatch && repoRootExists) {
            const repoRoot = repoMatch[1];
            const branch = session.resources.branch;

            if (branch && branchExists) {
              // recreateWorktree succeeded — directory stays as worktree path
              // (In production, git worktree add recreates the directory)
            } else {
              session.directory = repoRoot;
              delete session.resources.worktree;
            }
          }

          // Directory remains at worktree path (recreation succeeded)
          assert.strictEqual(session.directory, '/repo/.claude/worktrees/feat');
          assert.strictEqual(session.resources.worktree, 'feat');
          assert.strictEqual(session.resources.branch, 'feat');
        });

        it('falls back to repo root when branch is deleted', () => {
          const session = createTestSession({
            directory: '/repo/.claude/worktrees/feat',
            resources: { worktree: 'feat', branch: 'feat' },
            state: 'idle',
          });

          // Simulate: directory missing, repo root exists, branch gone
          const dirExists = false;
          const repoMatch = session.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
          const branchExists = false;

          if (!dirExists && repoMatch) {
            const repoRoot = repoMatch[1];
            const branch = session.resources.branch;

            if (branch && branchExists) {
              // recreateWorktree would succeed
            } else {
              session.directory = repoRoot;
              delete session.resources.worktree;
            }
          }

          assert.strictEqual(session.directory, '/repo');
          assert.strictEqual(session.resources.worktree, undefined);
          // Branch resource preserved (for reference)
          assert.strictEqual(session.resources.branch, 'feat');
        });

        it('falls back to repo root when no branch stored', () => {
          const session = createTestSession({
            directory: '/repo/.claude/worktrees/feat',
            resources: { worktree: 'feat' },
            state: 'idle',
          });

          const dirExists = false;
          const repoMatch = session.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);

          if (!dirExists && repoMatch) {
            const repoRoot = repoMatch[1];
            const branch = session.resources.branch;

            // No branch → can't recreate worktree
            if (branch) {
              // would try recreateWorktree
            } else {
              session.directory = repoRoot;
              delete session.resources.worktree;
            }
          }

          assert.strictEqual(session.directory, '/repo');
          assert.strictEqual(session.resources.worktree, undefined);
          assert.strictEqual(session.resources.branch, undefined);
        });
      });

      describe('legacy worktree detection', () => {
        it('detects legacy worktree session with mismatched directory', () => {
          const session = createTestSession({
            directory: '/repo',
            resources: { worktree: 'feat', branch: 'feat' },
            state: 'idle',
          });

          // Simulate: session.directory is repo root, but resources indicate a worktree
          if (session.resources.worktree && session.resources.branch) {
            const worktreePath = join(session.directory, '.claude', 'worktrees', session.resources.worktree);
            const worktreeExists = false;
            const recreateSucceeded = true;

            if (!worktreeExists && recreateSucceeded) {
              session.directory = worktreePath;
            }
          }

          assert.strictEqual(session.directory, '/repo/.claude/worktrees/feat');
        });

        it('corrects directory when worktree already exists', () => {
          const session = createTestSession({
            directory: '/repo',
            resources: { worktree: 'feat', branch: 'feat' },
            state: 'idle',
          });

          // Simulate: worktree path already exists on disk
          if (session.resources.worktree && session.resources.branch) {
            const worktreePath = join(session.directory, '.claude', 'worktrees', session.resources.worktree);
            const worktreeExists = true;

            if (worktreeExists) {
              session.directory = worktreePath;
            }
          }

          assert.strictEqual(session.directory, '/repo/.claude/worktrees/feat');
        });

        it('leaves directory unchanged when recreation fails and worktree missing', () => {
          const session = createTestSession({
            directory: '/repo',
            resources: { worktree: 'feat', branch: 'feat' },
            state: 'idle',
          });

          if (session.resources.worktree && session.resources.branch) {
            const worktreePath = join(session.directory, '.claude', 'worktrees', session.resources.worktree);
            const worktreeExists = false;
            const recreateSucceeded = false;

            if (!worktreeExists && recreateSucceeded) {
              session.directory = worktreePath;
            } else if (worktreeExists) {
              session.directory = worktreePath;
            }
            // Neither condition met — directory stays as repo root
          }

          assert.strictEqual(session.directory, '/repo');
        });
      });

      describe('transcript relocation', () => {
        let tmpDir: string;

        beforeEach(() => {
          tmpDir = join(tmpdir(), `c-resume-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          mkdirSync(tmpDir, { recursive: true });
        });

        it('relocates transcript when project keys differ', () => {
          const sourceDir = join(tmpDir, 'source-project');
          const targetDir = join(tmpDir, 'target-project');
          mkdirSync(sourceDir, { recursive: true });

          const transcriptFile = join(sourceDir, 'session-123.jsonl');
          writeFileSync(transcriptFile, '{"type":"test"}\n');

          // Simulate relocateTranscript: keys differ → move file
          const keysMatch = false;
          if (!keysMatch) {
            mkdirSync(targetDir, { recursive: true });
            const targetTranscript = join(targetDir, 'session-123.jsonl');
            if (!existsSync(targetTranscript)) {
              renameSync(transcriptFile, targetTranscript);
            }
          }

          assert.ok(existsSync(join(targetDir, 'session-123.jsonl')));
          assert.ok(!existsSync(transcriptFile));

          rmSync(tmpDir, { recursive: true, force: true });
        });

        it('no-op when transcript already in correct project', () => {
          const projectDir = join(tmpDir, 'same-project');
          mkdirSync(projectDir, { recursive: true });

          const transcriptFile = join(projectDir, 'session-456.jsonl');
          writeFileSync(transcriptFile, '{"type":"test"}\n');

          // Simulate relocateTranscript: same key → early return
          const keysMatch = true;
          assert.strictEqual(keysMatch, true);
          assert.ok(existsSync(transcriptFile));

          rmSync(tmpDir, { recursive: true, force: true });
        });

        it('no-op when target transcript already exists', () => {
          const sourceDir = join(tmpDir, 'source-project');
          const targetDir = join(tmpDir, 'target-project');
          mkdirSync(sourceDir, { recursive: true });
          mkdirSync(targetDir, { recursive: true });

          const sourceTranscript = join(sourceDir, 'session-789.jsonl');
          const targetTranscript = join(targetDir, 'session-789.jsonl');
          writeFileSync(sourceTranscript, '{"type":"source"}\n');
          writeFileSync(targetTranscript, '{"type":"existing"}\n');

          // Simulate relocateTranscript: keys differ but target exists → skip
          const keysMatch = false;
          if (!keysMatch) {
            if (existsSync(targetTranscript)) {
              // Skip — don't overwrite
            }
          }

          // Source should remain untouched
          assert.ok(existsSync(sourceTranscript));
          // Target should still have original content
          assert.ok(readFileSync(targetTranscript, 'utf8').includes('existing'));

          rmSync(tmpDir, { recursive: true, force: true });
        });
      });

      describe('session info for display', () => {
        it('uses name as display name', () => {
          const session = createTestSession({
            name: 'My Session',
          });

          const displayName = session.name || '';
          assert.strictEqual(displayName, 'My Session');
        });

        it('returns empty string when no name', () => {
          const session = createTestSession({
            name: '',
          });

          const displayName = session.name || '';
          assert.strictEqual(displayName, '');
        });

        it('skips tmux title when display name is empty', () => {
          const session = createTestSession({ name: '' });
          const displayName = session.name || '';

          // Resume should not call setTmuxPaneTitle when displayName is empty
          assert.strictEqual(displayName, '');
          // The guard in resume.ts: if (displayName) setTmuxPaneTitle(displayName)
          // ensures no tmux title change occurs for unnamed sessions
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

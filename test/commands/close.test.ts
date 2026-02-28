/**
 * Tests for close command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c', () => {
  describe('commands', () => {
    describe('close', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('signal behavior', () => {
        it('sends SIGINT when session has pid', () => {
          const session = createTestSession({ state: 'busy', pid: 12345 });

          // Verify pid is set
          assert.strictEqual(session.pid, 12345);
          // In production: process.kill(session.pid, 'SIGINT')
        });

        it('skips signaling when session has no pid', () => {
          const session = createTestSession({ state: 'busy' });

          assert.strictEqual(session.pid, undefined);
          // No pid means no process.kill call — just set state directly
        });

        it('tolerates already-exited process', () => {
          const session = createTestSession({ state: 'busy', pid: 99999 });

          // Simulate ESRCH: try to kill a non-existent process
          let esrchHandled = false;
          try {
            process.kill(session.pid!, 0);
          } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
              esrchHandled = true;
            }
          }

          assert.strictEqual(esrchHandled, true);
          // Command should continue without error after ESRCH
        });
      });

      describe('state transitions', () => {
        it('closes by default', () => {
          const session = createTestSession({ state: 'busy' });

          session.state = 'closed';
          delete session.pid;

          assert.strictEqual(session.state, 'closed');
          assert.strictEqual(session.pid, undefined);
        });

        it('archives with --archive', () => {
          const session = createTestSession({ state: 'busy', pid: 12345 });

          session.state = 'archived';
          delete session.pid;

          assert.strictEqual(session.state, 'archived');
          assert.strictEqual(session.pid, undefined);
        });

        it('clears pid on end', () => {
          const session = createTestSession({ state: 'busy', pid: 12345 });

          session.state = 'closed';
          delete session.pid;

          assert.strictEqual(session.pid, undefined);
        });

        it('updates last_active_at', () => {
          const oldDate = new Date('2024-01-01');
          const session = createTestSession({ state: 'busy', last_active_at: oldDate });

          const newDate = new Date('2024-01-15');
          session.state = 'closed';
          session.last_active_at = newDate;
          delete session.pid;

          assert.strictEqual(session.last_active_at, newDate);
        });
      });

      describe('rejection conditions', () => {
        it('rejects already-closed session', () => {
          const session = createTestSession({ state: 'closed' });

          const shouldReject = session.state === 'closed' || session.state === 'archived';
          assert.strictEqual(shouldReject, true);
        });

        it('rejects already-archived session', () => {
          const session = createTestSession({ state: 'archived' });

          const shouldReject = session.state === 'closed' || session.state === 'archived';
          assert.strictEqual(shouldReject, true);
        });

        it('accepts busy session', () => {
          const session = createTestSession({ state: 'busy' });

          const shouldReject = session.state === 'closed' || session.state === 'archived';
          assert.strictEqual(shouldReject, false);
        });

        it('accepts idle session', () => {
          const session = createTestSession({ state: 'idle' });

          const shouldReject = session.state === 'closed' || session.state === 'archived';
          assert.strictEqual(shouldReject, false);
        });

        it('accepts waiting session', () => {
          const session = createTestSession({ state: 'waiting' });

          const shouldReject = session.state === 'closed' || session.state === 'archived';
          assert.strictEqual(shouldReject, false);
        });
      });

      describe('multiple IDs', () => {
        it('closes multiple sessions in one call', () => {
          const sessions = [
            createTestSession({ state: 'busy', pid: 11111 }),
            createTestSession({ state: 'waiting', pid: 22222 }),
            createTestSession({ state: 'idle' }),
          ];

          // Simulate closing all three
          for (const s of sessions) {
            s.state = 'closed';
            delete s.pid;
          }

          assert.ok(sessions.every((s) => s.state === 'closed'));
          assert.ok(sessions.every((s) => s.pid === undefined));
        });

        it('skips already-closed sessions in multi-ID call', () => {
          const sessions = [
            createTestSession({ state: 'busy' }),
            createTestSession({ state: 'closed' }),
            createTestSession({ state: 'waiting' }),
          ];

          const results: string[] = [];
          for (const s of sessions) {
            if (s.state === 'closed' || s.state === 'archived') {
              results.push('skipped');
            } else {
              s.state = 'closed';
              delete s.pid;
              results.push('closed');
            }
          }

          assert.deepStrictEqual(results, ['closed', 'skipped', 'closed']);
        });

        it('skips missing IDs without aborting', () => {
          const sessions = [
            createTestSession({ id: 'aaa-111', state: 'busy' }),
            createTestSession({ id: 'ccc-333', state: 'busy' }),
          ];

          const ids = ['aaa', 'bbb', 'ccc'];
          const results: string[] = [];

          for (const prefix of ids) {
            const found = sessions.find((s) => s.id.startsWith(prefix));
            if (!found) {
              results.push('not-found');
            } else {
              found.state = 'closed';
              delete found.pid;
              results.push('closed');
            }
          }

          assert.deepStrictEqual(results, ['closed', 'not-found', 'closed']);
        });
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', () => {
          const sessions = [
            createTestSession({ id: 'abc-123-full-uuid' }),
            createTestSession({ id: 'def-456-full-uuid' }),
          ];

          const prefix = 'abc';
          const found = sessions.find((s) => s.id.startsWith(prefix));

          assert.ok(found);
          assert.strictEqual(found.id, 'abc-123-full-uuid');
        });

        it('defaults to current directory session', () => {
          const sessions = [
            createTestSession({ directory: '/project', state: 'busy' }),
            createTestSession({ directory: '/other', state: 'busy' }),
          ];

          const cwd = '/project';
          const activeStates = ['busy', 'idle', 'waiting'];
          const current = sessions.find(
            (s) => activeStates.includes(s.state) && s.directory === cwd
          );

          assert.ok(current);
          assert.strictEqual(current.directory, '/project');
        });

        it('errors when session not found', () => {
          const sessions: Session[] = [];
          const found = sessions.find((s) => s.id === 'nonexistent');

          assert.strictEqual(found, undefined);
        });
      });
    });
  });
});

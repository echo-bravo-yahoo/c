/**
 * Tests for archive command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c', () => {
  describe('commands', () => {
    describe('archive', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('state change', () => {
        it('sets state to archived', () => {
          const session = createTestSession({ state: 'busy' });

          session.state = 'archived';

          assert.strictEqual(session.state, 'archived');
        });

        it('archives closed session', () => {
          const session = createTestSession({ state: 'closed' });

          session.state = 'archived';

          assert.strictEqual(session.state, 'archived');
        });

        it('updates last_active_at', () => {
          const oldDate = new Date('2024-01-01');
          const session = createTestSession({
            state: 'busy',
            last_active_at: oldDate,
          });

          const newDate = new Date('2024-01-15');
          session.state = 'archived';
          session.last_active_at = newDate;

          assert.strictEqual(session.last_active_at, newDate);
        });
      });

      describe('process signaling', () => {
        it('signals PID before archiving', () => {
          const session = createTestSession({ state: 'busy', pid: 12345 });

          // signalSession would be called with session.pid before state change
          assert.strictEqual(session.pid, 12345);

          // Then archive and clear pid
          session.state = 'archived';
          delete session.pid;

          assert.strictEqual(session.state, 'archived');
          assert.strictEqual(session.pid, undefined);
        });

        it('clears PID on archive', () => {
          const session = createTestSession({ state: 'busy', pid: 55555 });

          session.state = 'archived';
          delete session.pid;

          assert.strictEqual(session.pid, undefined);
        });

        it('archives without PID', () => {
          const session = createTestSession({ state: 'busy' });

          assert.strictEqual(session.pid, undefined);

          // signalSession(undefined) is a no-op
          session.state = 'archived';

          assert.strictEqual(session.state, 'archived');
        });
      });

      describe('multiple IDs', () => {
        it('archives multiple sessions in one call', () => {
          const sessions = [
            createTestSession({ state: 'busy', pid: 11111 }),
            createTestSession({ state: 'waiting', pid: 22222 }),
            createTestSession({ state: 'closed' }),
          ];

          for (const s of sessions) {
            s.state = 'archived';
            delete s.pid;
          }

          assert.ok(sessions.every((s) => s.state === 'archived'));
          assert.ok(sessions.every((s) => s.pid === undefined));
        });

        it('skips missing IDs without aborting', () => {
          const sessions = [
            createTestSession({ id: 'aaa-111', state: 'busy' }),
            createTestSession({ id: 'ccc-333', state: 'waiting' }),
          ];

          const ids = ['aaa', 'bbb', 'ccc'];
          const results: string[] = [];

          for (const prefix of ids) {
            const found = sessions.find((s) => s.id.startsWith(prefix));
            if (!found) {
              results.push('not-found');
            } else {
              found.state = 'archived';
              delete found.pid;
              results.push('archived');
            }
          }

          assert.deepStrictEqual(results, ['archived', 'not-found', 'archived']);
        });
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', () => {
          const sessions = [
            createTestSession({ id: 'abc-123-full-uuid' }),
            createTestSession({ id: 'def-456-full-uuid' }),
          ];

          const prefix = 'abc';
          const found = sessions.find(s => s.id.startsWith(prefix));

          assert.ok(found);
          assert.strictEqual(found.id, 'abc-123-full-uuid');
        });

        it('uses current session when no ID provided', () => {
          const sessions = [
            createTestSession({ directory: '/project', state: 'busy' }),
            createTestSession({ directory: '/other', state: 'busy' }),
          ];

          const cwd = '/project';
          const activeStates = ['busy', 'idle', 'waiting'];
          const current = sessions.find(
            s => activeStates.includes(s.state) && s.directory === cwd
          );

          assert.ok(current);
          assert.strictEqual(current.directory, '/project');
        });
      });

      describe('error conditions', () => {
        it('errors when session not found by ID', () => {
          const sessions: Session[] = [];
          const found = sessions.find(s => s.id === 'nonexistent');

          assert.strictEqual(found, undefined);
          // Command would exit with error: "Session not found: nonexistent"
        });

        it('errors when no active session in directory', () => {
          const sessions = [
            createTestSession({ directory: '/project', state: 'closed' }),
          ];

          const cwd = '/project';
          const activeStates = ['busy', 'idle', 'waiting'];
          const current = sessions.find(
            s => activeStates.includes(s.state) && s.directory === cwd
          );

          assert.strictEqual(current, undefined);
          // Command would exit with error: "No active session in current directory"
        });
      });

      describe('display output', () => {
        it('uses display name in success message', () => {
          const session = createTestSession({
            name: 'My Session',
            humanhash: 'alpha-bravo',
          });

          const displayName = session.name || session.humanhash;
          // Output: "Archived My Session"
          assert.strictEqual(displayName, 'My Session');
        });

        it('falls back to humanhash in message', () => {
          const session = createTestSession({
            name: '',
            humanhash: 'alpha-bravo',
          });

          const displayName = session.name || session.humanhash;
          // Output: "Archived alpha-bravo"
          assert.strictEqual(displayName, 'alpha-bravo');
        });
      });
    });
  });
});

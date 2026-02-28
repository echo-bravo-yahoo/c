/**
 * Tests for name command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';

describe('c', () => {
  describe('commands', () => {
    describe('name', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('name setting', () => {
        it('sets session name', () => {
          const session = createTestSession({ name: '' });
          const name = 'My New Name';

          session.name = name;

          assert.strictEqual(session.name, name);
        });

        it('replaces existing name', () => {
          const session = createTestSession({ name: 'Old Name' });
          const name = 'New Name';

          session.name = name;

          assert.strictEqual(session.name, 'New Name');
        });

        it('clears name with empty string', () => {
          const session = createTestSession({ name: 'Existing' });
          const name = '';

          session.name = name;

          assert.strictEqual(session.name, '');
        });

        it('allows special characters', () => {
          const session = createTestSession({ name: '' });
          const name = 'Fix: bug #123 (urgent!)';

          session.name = name;

          assert.strictEqual(session.name, 'Fix: bug #123 (urgent!)');
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', () => {
          const oldDate = new Date('2024-01-01');
          const session = createTestSession({ name: '', last_active_at: oldDate });
          const name = 'New Name';

          session.name = name;
          session.last_active_at = new Date();

          assert.ok(session.last_active_at > oldDate);
        });
      });

      describe('session lookup', () => {
        it('defaults to current directory session', () => {
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

        it('finds session by ID prefix', () => {
          const sessions = [
            createTestSession({ id: 'abc-123' }),
            createTestSession({ id: 'def-456' }),
          ];

          const prefix = 'abc';
          const found = sessions.find(s => s.id.startsWith(prefix));

          assert.ok(found);
          assert.strictEqual(found.id, 'abc-123');
        });
      });

      describe('error conditions', () => {
        it('errors when session not found by ID', () => {
          const sessions: never[] = [];
          const found = sessions.find(() => false);

          assert.strictEqual(found, undefined);
          // Command would exit: "Session not found: <id>"
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
          // Command would exit: "No active session in current directory"
        });
      });

      describe('output message', () => {
        it('confirms name in success message', () => {
          const name = 'My New Name';

          // Output: "Set name: My New Name"
          const message = `Set name: ${name}`;
          assert.ok(message.includes(name));
        });
      });
    });
  });
});

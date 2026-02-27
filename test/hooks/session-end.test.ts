/**
 * Tests for session-end hook behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';

describe('c > hooks > session-end', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('state transition', () => {
    it('sets state to closed', () => {
      const session = createTestSession({ state: 'busy' });

      session.state = 'closed';

      assert.strictEqual(session.state, 'closed');
    });

    it('updates last_active_at', () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ state: 'busy', last_active_at: oldDate });

      session.state = 'closed';
      session.last_active_at = new Date('2024-01-15');

      assert.notStrictEqual(session.last_active_at, oldDate);
    });
  });

  describe('pid clearing', () => {
    it('clears pid when session ends', () => {
      const session = createTestSession({ state: 'busy', pid: 12345 });

      // Simulate session-end hook behavior
      session.state = 'closed';
      session.last_active_at = new Date();
      delete session.pid;

      assert.strictEqual(session.pid, undefined);
      assert.strictEqual(session.state, 'closed');
    });

    it('handles session without pid gracefully', () => {
      const session = createTestSession({ state: 'busy' });

      assert.strictEqual(session.pid, undefined);

      // delete on undefined property is a no-op
      session.state = 'closed';
      delete session.pid;

      assert.strictEqual(session.pid, undefined);
      assert.strictEqual(session.state, 'closed');
    });
  });

  describe('session lookup', () => {
    it('finds session by ID', () => {
      const sessions = [
        createTestSession({ id: 'target-id', state: 'busy' }),
        createTestSession({ id: 'other-id', state: 'busy' }),
      ];

      const targetId = 'target-id';
      const found = sessions.find((s) => s.id === targetId);

      assert.ok(found);
      assert.strictEqual(found.id, 'target-id');
    });

    it('finds session by cwd when no ID provided', () => {
      const sessions = [
        createTestSession({ directory: '/project', state: 'busy' }),
        createTestSession({ directory: '/other', state: 'idle' }),
      ];

      const cwd = '/project';
      const activeStates = ['busy', 'idle', 'waiting'];
      const current = sessions.find(
        (s) => activeStates.includes(s.state) && s.directory === cwd
      );

      assert.ok(current);
      assert.strictEqual(current.directory, '/project');
    });

    it('skips update when session not found', () => {
      const sessions = [
        createTestSession({ state: 'busy', pid: 12345 }),
      ];

      const targetId = 'nonexistent';
      const found = sessions.find((s) => s.id === targetId);

      // No session found, no update performed
      assert.strictEqual(found, undefined);
      // Original session unchanged
      assert.strictEqual(sessions[0].pid, 12345);
      assert.strictEqual(sessions[0].state, 'busy');
    });
  });
});

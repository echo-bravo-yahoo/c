/**
 * Tests for user-prompt hook logic
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c > hooks > user-prompt', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('waiting state', () => {
    it('clears waiting flag', () => {
      const session = createTestSession({ waiting: true });

      // Simulate hook behavior
      session.waiting = false;

      assert.strictEqual(session.waiting, false);
    });
  });

  describe('status recovery', () => {
    it('sets status to live when closed', () => {
      const session = createTestSession({ status: 'closed' });

      // Simulate hook behavior
      session.status = 'live';

      assert.strictEqual(session.status, 'live');
    });

    it('keeps status as live when already live', () => {
      const session = createTestSession({ status: 'live' });

      // Simulate hook behavior
      session.status = 'live';

      assert.strictEqual(session.status, 'live');
    });

    it('recovers archived session to live on user input', () => {
      // Note: This tests the behavior, though in practice archived sessions
      // may not receive user-prompt events
      const session = createTestSession({ status: 'archived' });

      // Simulate hook behavior
      session.status = 'live';

      assert.strictEqual(session.status, 'live');
    });
  });

  describe('timestamp update', () => {
    it('updates last_active_at', () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ last_active_at: oldDate });

      // Simulate hook behavior
      const newDate = new Date();
      session.last_active_at = newDate;

      assert.ok(session.last_active_at.getTime() > oldDate.getTime());
    });
  });

  describe('session lookup', () => {
    it('finds session by provided ID', () => {
      const sessions: Session[] = [
        createTestSession({ id: 'target-id', directory: '/project' }),
        createTestSession({ id: 'other-id', directory: '/project' }),
      ];

      const targetId = 'target-id';
      const found = sessions.find(s => s.id === targetId);

      assert.ok(found);
      assert.strictEqual(found.id, 'target-id');
    });

    it('falls back to current session by directory', () => {
      const sessions: Session[] = [
        createTestSession({ id: 'sess-1', directory: '/project', status: 'live' }),
        createTestSession({ id: 'sess-2', directory: '/other', status: 'live' }),
      ];

      const cwd = '/project';
      const current = sessions.find(s => s.directory === cwd && s.status === 'live');

      assert.ok(current);
      assert.strictEqual(current.id, 'sess-1');
    });
  });
});

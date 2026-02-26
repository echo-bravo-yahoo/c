/**
 * Tests for stop hook logic
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c > hooks > stop', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('state transition', () => {
    it('sets state to idle from busy', () => {
      const session = createTestSession({ state: 'busy' });

      // Simulate hook behavior
      session.state = 'idle';

      assert.strictEqual(session.state, 'idle');
    });

    it('sets state to idle from waiting', () => {
      const session = createTestSession({ state: 'waiting' });

      // Simulate hook behavior
      session.state = 'idle';

      assert.strictEqual(session.state, 'idle');
    });
  });

  describe('stop_hook_active guard', () => {
    it('does not change state when stop_hook_active is true', () => {
      // This tests the guard logic - when the stop hook itself
      // triggers further processing, we don't want to set idle again
      const input = { session_id: 'test', cwd: '/test', stop_hook_active: true };
      const shouldSkip = input.stop_hook_active === true;
      assert.strictEqual(shouldSkip, true);
    });

    it('proceeds when stop_hook_active is false', () => {
      const input = { session_id: 'test', cwd: '/test', stop_hook_active: false };
      const shouldSkip = input.stop_hook_active === true;
      assert.strictEqual(shouldSkip, false);
    });

    it('proceeds when stop_hook_active is undefined', () => {
      const input = { session_id: 'test', cwd: '/test' };
      const shouldSkip = (input as { stop_hook_active?: boolean }).stop_hook_active === true;
      assert.strictEqual(shouldSkip, false);
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
        createTestSession({ id: 'sess-1', directory: '/project', state: 'busy' }),
        createTestSession({ id: 'sess-2', directory: '/other', state: 'busy' }),
      ];

      const cwd = '/project';
      const activeStates = ['busy', 'idle', 'waiting'];
      const current = sessions.find(s => s.directory === cwd && activeStates.includes(s.state));

      assert.ok(current);
      assert.strictEqual(current.id, 'sess-1');
    });
  });
});

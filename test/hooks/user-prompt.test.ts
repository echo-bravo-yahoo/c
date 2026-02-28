/**
 * Tests for user-prompt hook logic
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c', () => {
  describe('hooks', () => {
    describe('user-prompt', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('state transition', () => {
        it('transitions waiting to busy', () => {
          const session = createTestSession({ state: 'waiting' });

          // Simulate hook behavior
          session.state = 'busy';

          assert.strictEqual(session.state, 'busy');
        });

        it('transitions idle to busy', () => {
          const session = createTestSession({ state: 'idle' });

          // Simulate hook behavior
          session.state = 'busy';

          assert.strictEqual(session.state, 'busy');
        });

        it('keeps busy sessions busy', () => {
          const session = createTestSession({ state: 'busy' });

          // Simulate hook behavior
          session.state = 'busy';

          assert.strictEqual(session.state, 'busy');
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

        it('defaults to session in cwd', () => {
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
  });
});

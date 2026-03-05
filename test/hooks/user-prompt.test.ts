/**
 * Tests for user-prompt hook behavior
 *
 * Calls the real handleUserPrompt handler against a temp store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { handleUserPrompt } from '../../src/hooks/user-prompt.ts';
import { updateIndex, getSession } from '../../src/store/index.ts';
import { createTestSession } from '../fixtures/sessions.ts';
import { setupTempStore, type TempStore } from '../helpers/store.ts';

describe('c', () => {
  describe('hooks', () => {
    describe('user-prompt', () => {
      let store: TempStore;

      beforeEach(() => { store = setupTempStore(); });
      afterEach(() => { store.cleanup(); });

      it('transitions idle to busy', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle' });
        });

        await handleUserPrompt('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'busy');
      });

      it('transitions waiting to busy', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'waiting' });
        });

        await handleUserPrompt('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'busy');
      });

      it('updates last_active_at', async () => {
        const oldDate = new Date('2024-01-01');
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle', last_active_at: oldDate });
        });

        await handleUserPrompt('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.ok(s.last_active_at.getTime() > oldDate.getTime());
      });

      it('falls back to cwd session lookup', async () => {
        const dir = '/test/project';
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', directory: dir, state: 'idle' });
          idx.sessions['s2'] = createTestSession({ id: 's2', directory: '/other', state: 'idle' });
        });

        await handleUserPrompt(undefined, dir, null);

        const s1 = getSession('s1');
        const s2 = getSession('s2');
        assert.ok(s1);
        assert.ok(s2);
        assert.strictEqual(s1.state, 'busy');
        assert.strictEqual(s2.state, 'idle');
      });

      it('no-op when session not found', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle' });
        });

        await handleUserPrompt('nonexistent', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'idle');
      });
    });
  });
});

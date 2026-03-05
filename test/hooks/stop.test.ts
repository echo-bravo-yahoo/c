/**
 * Tests for stop hook behavior
 *
 * Calls the real handleStop handler against a temp store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { handleStop } from '../../src/hooks/stop.ts';
import { updateIndex, getSession } from '../../src/store/index.ts';
import { createTestSession } from '../fixtures/sessions.ts';
import { setupTempStore, type TempStore } from '../helpers/store.ts';

describe('c', () => {
  describe('hooks', () => {
    describe('stop', () => {
      let store: TempStore;

      beforeEach(() => { store = setupTempStore(); });
      afterEach(() => { store.cleanup(); });

      it('transitions busy to idle', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
        });

        await handleStop('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'idle');
      });

      it('transitions waiting to idle', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'waiting' });
        });

        await handleStop('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'idle');
      });

      it('updates last_active_at', async () => {
        const oldDate = new Date('2024-01-01');
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy', last_active_at: oldDate });
        });

        await handleStop('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.ok(s.last_active_at.getTime() > oldDate.getTime());
      });

      it('skips when stop_hook_active is true', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
        });

        await handleStop('s1', '/tmp', { stop_hook_active: true } as any);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'busy');
      });

      it('proceeds when stop_hook_active is false', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
        });

        await handleStop('s1', '/tmp', { stop_hook_active: false } as any);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'idle');
      });

      it('falls back to cwd session lookup', async () => {
        const dir = '/test/project';
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', directory: dir, state: 'busy' });
          idx.sessions['s2'] = createTestSession({ id: 's2', directory: '/other', state: 'busy' });
        });

        await handleStop(undefined, dir, null);

        const s1 = getSession('s1');
        const s2 = getSession('s2');
        assert.ok(s1);
        assert.ok(s2);
        assert.strictEqual(s1.state, 'idle');
        assert.strictEqual(s2.state, 'busy');
      });

      it('no-op when session not found', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
        });

        await handleStop('nonexistent', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'busy');
      });
    });
  });
});

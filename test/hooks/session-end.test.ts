/**
 * Tests for session-end hook behavior
 *
 * Calls the real handleSessionEnd handler against a temp store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { handleSessionEnd } from '../../src/hooks/session-end.ts';
import { updateIndex, getSession } from '../../src/store/index.ts';
import { writeStatusCache } from '../../src/store/status-cache.ts';
import { createTestSession } from '../fixtures/sessions.ts';
import { setupTempStore, type TempStore } from '../helpers/store.ts';

describe('c', () => {
  describe('hooks', () => {
    describe('session-end', () => {
      let store: TempStore;

      beforeEach(() => { store = setupTempStore(); });
      afterEach(() => { store.cleanup(); });

      it('closes session by explicit ID', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy', pid: 12345 });
        });

        await handleSessionEnd('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'closed');
        assert.strictEqual(s.pid, undefined);
      });

      it('updates last_active_at', async () => {
        const oldDate = new Date('2024-01-01');
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy', last_active_at: oldDate });
        });

        await handleSessionEnd('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.ok(s.last_active_at.getTime() > oldDate.getTime());
      });

      it('falls back to cwd when no explicit ID', async () => {
        const dir = '/test/project';
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', directory: dir, state: 'busy' });
          idx.sessions['s2'] = createTestSession({ id: 's2', directory: '/other', state: 'busy' });
        });

        await handleSessionEnd(undefined, dir, null);

        const s1 = getSession('s1');
        const s2 = getSession('s2');
        assert.ok(s1);
        assert.ok(s2);
        assert.strictEqual(s1.state, 'closed');
        assert.strictEqual(s2.state, 'busy');
      });

      it('no-op when session not found', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy', pid: 12345 });
        });

        await handleSessionEnd('nonexistent', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'busy');
        assert.strictEqual(s.pid, 12345);
      });

      it('deletes status cache file', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
        });
        writeStatusCache('s1', { branch: 'main' });

        const cacheFile = join(store.tmpDir, 'status', 's1');
        assert.ok(existsSync(cacheFile), 'cache file should exist before handler');

        await handleSessionEnd('s1', '/tmp', null);

        assert.ok(!existsSync(cacheFile), 'cache file should be deleted after handler');
      });

      it('closes session that has no pid', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
        });

        await handleSessionEnd('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'closed');
        assert.strictEqual(s.pid, undefined);
      });
    });
  });
});

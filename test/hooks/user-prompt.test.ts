/**
 * Tests for user-prompt hook behavior
 *
 * Calls the real handleUserPrompt handler against a temp store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleUserPrompt } from '../../src/hooks/user-prompt.ts';
import { updateIndex, getSession, resetIndexCache } from '../../src/store/index.ts';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.ts';

describe('c', () => {
  describe('hooks', () => {
    describe('user-prompt', () => {
      let tmpDir: string;
      let savedCHome: string | undefined;

      beforeEach(() => {
        resetSessionCounter();
        tmpDir = mkdtempSync(join(tmpdir(), 'c-test-'));
        savedCHome = process.env.C_HOME;
        process.env.C_HOME = tmpDir;
        resetIndexCache();
      });

      afterEach(() => {
        process.env.C_HOME = savedCHome;
        if (savedCHome === undefined) delete process.env.C_HOME;
        rmSync(tmpDir, { recursive: true, force: true });
        resetIndexCache();
      });

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

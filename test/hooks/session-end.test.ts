/**
 * Tests for session-end hook behavior
 *
 * Calls the real handleSessionEnd handler against a temp store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, writeFileSync } from 'node:fs';
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
      let savedHome: string;

      beforeEach(() => {
        store = setupTempStore();
        savedHome = process.env.HOME!;
        process.env.HOME = store.tmpDir;
      });
      afterEach(() => {
        process.env.HOME = savedHome;
        store.cleanup();
      });

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

      describe('usage tracking', () => {
        function assistantEntry(model: string, stopReason: string, usage: Record<string, number>): string {
          return JSON.stringify({
            type: 'assistant',
            requestId: 'req_test',
            message: { model, stop_reason: stopReason, usage },
          });
        }

        it('persists final cost_usd from transcript', async () => {
          const txPath = join(store.tmpDir, 'transcript.jsonl');
          writeFileSync(txPath, assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 1000, output_tokens: 500,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n');

          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', state: 'busy',
              meta: { _transcript_offset: '0' },
            });
          });

          await handleSessionEnd('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.ok(s.cost_usd != null && s.cost_usd > 0, 'cost_usd should be set');
        });

        it('clears context_pct on close', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', state: 'busy', context_pct: 42,
            });
          });

          await handleSessionEnd('s1', '/tmp', null);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.context_pct, undefined);
        });

        it('cleans up internal meta but preserves offset', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', state: 'busy',
              meta: {
                _transcript_offset: '500',
                _total_input: '1000',
                _total_output: '500',
                _total_cache_write: '0',
                _total_cache_read: '0',
              },
            });
          });

          await handleSessionEnd('s1', '/tmp', null);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.meta._transcript_offset, '500', 'offset preserved as high-water mark');
          assert.strictEqual(s.meta._total_input, undefined);
          assert.strictEqual(s.meta._total_output, undefined);
          assert.strictEqual(s.meta._total_cache_write, undefined);
          assert.strictEqual(s.meta._total_cache_read, undefined);
        });

        it('stop after session-end does not double-count cost', async () => {
          const txPath = join(store.tmpDir, 'transcript.jsonl');
          writeFileSync(txPath, assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 1000, output_tokens: 500,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n');

          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', state: 'busy',
              meta: { _transcript_offset: '0' },
            });
          });

          await handleSessionEnd('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);
          const afterEnd = getSession('s1');
          assert.ok(afterEnd);
          const finalCost = afterEnd.cost_usd!;
          assert.ok(finalCost > 0);

          // Simulate a late stop hook (reactivate session first)
          await updateIndex((idx) => { idx.sessions['s1'].state = 'busy'; });
          const { handleStop } = await import('../../src/hooks/stop.ts');
          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);

          const afterStop = getSession('s1');
          assert.ok(afterStop);
          assert.strictEqual(afterStop.cost_usd, finalCost, 'cost should not increase after session-end + stop');
        });
      });
    });
  });
});

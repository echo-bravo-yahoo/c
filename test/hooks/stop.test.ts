/**
 * Tests for stop hook behavior
 *
 * Calls the real handleStop handler against a temp store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleStop } from '../../src/hooks/stop.ts';
import { updateIndex, getSession } from '../../src/store/index.ts';
import { createTestSession } from '../fixtures/sessions.ts';
import { setupTempStore, type TempStore } from '../helpers/store.ts';

describe('c', () => {
  describe('hooks', () => {
    describe('stop', () => {
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

      describe('usage tracking', () => {
        function assistantEntry(model: string, stopReason: string, usage: Record<string, number>): string {
          return JSON.stringify({
            type: 'assistant',
            requestId: 'req_test',
            message: { model, stop_reason: stopReason, usage },
          });
        }

        it('persists cost_usd from transcript', async () => {
          const txPath = join(store.tmpDir, 'transcript.jsonl');
          writeFileSync(txPath, assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 1000, output_tokens: 500,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n');

          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
          });

          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.ok(s.cost_usd != null && s.cost_usd > 0, 'cost_usd should be set');
        });

        it('persists context_pct from transcript', async () => {
          const txPath = join(store.tmpDir, 'transcript.jsonl');
          writeFileSync(txPath, assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 50000, output_tokens: 500,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n');

          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
          });

          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.ok(typeof s.context_pct === 'number');
          assert.strictEqual(s.context_pct, 5); // 50000/1_000_000 = 5%
        });

        it('stores transcript offset in meta for incremental reads', async () => {
          const txPath = join(store.tmpDir, 'transcript.jsonl');
          writeFileSync(txPath, assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 100, output_tokens: 50,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n');

          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
          });

          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.ok(s.meta._transcript_offset != null, 'should store offset');
          assert.ok(parseInt(s.meta._transcript_offset, 10) > 0);
        });

        it('accumulates cost across multiple stop invocations', async () => {
          const txPath = join(store.tmpDir, 'transcript.jsonl');
          writeFileSync(txPath, assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 1000, output_tokens: 500,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n');

          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
          });

          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);
          const s1 = getSession('s1');
          assert.ok(s1);
          const firstCost = s1.cost_usd!;

          // Append more entries and stop again (session goes busy → idle again)
          await updateIndex((idx) => { idx.sessions['s1'].state = 'busy'; });

          const { appendFileSync } = await import('node:fs');
          appendFileSync(txPath, assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 2000, output_tokens: 1000,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n');

          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);
          const s2 = getSession('s1');
          assert.ok(s2);
          assert.ok(s2.cost_usd! > firstCost, 'cost should increase after second stop');
        });

        it('handles missing transcript_path gracefully', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
          });

          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp' } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.state, 'idle');
        });

        it('does not double-count when offset is at end of file', async () => {
          const txPath = join(store.tmpDir, 'transcript.jsonl');
          const entry = assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 1000, output_tokens: 500,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n';
          writeFileSync(txPath, entry);

          const offset = Buffer.byteLength(entry, 'utf-8');
          const knownCost = 0.0105;

          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', state: 'busy',
              cost_usd: knownCost,
              meta: { _transcript_offset: String(offset) },
            });
          });

          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.cost_usd, knownCost, 'cost should not change when no new data');
        });

        it('handles empty transcript gracefully', async () => {
          const txPath = join(store.tmpDir, 'empty.jsonl');
          writeFileSync(txPath, '');

          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
          });

          await handleStop('s1', '/tmp', { session_id: 's1', cwd: '/tmp', transcript_path: txPath } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.state, 'idle');
          assert.strictEqual(s.cost_usd, undefined);
        });
      });
    });
  });
});

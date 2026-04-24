/**
 * Tests that stop/user-prompt hooks populate session.context from the transcript.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleStop } from '../../src/hooks/stop.ts';
import { handleUserPrompt } from '../../src/hooks/user-prompt.ts';
import { updateIndex, getSession } from '../../src/store/index.ts';
import { createTestSession } from '../fixtures/sessions.ts';
import { setupTempStore, type TempStore } from '../helpers/store.ts';

function userLine(cwd = '/tmp'): string {
  return JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: 'hi' } });
}

function assistantReadLine(file_path: string, cwd = '/tmp'): string {
  return JSON.stringify({
    type: 'assistant',
    cwd,
    requestId: 'req_test',
    message: {
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10, output_tokens: 5,
        cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      },
      content: [{ type: 'tool_use', name: 'Read', input: { file_path } }],
    },
  });
}

describe('c', () => {
  describe('hooks', () => {
    describe('inventory', () => {
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

      it('stop hook populates session.context.reads with turn-indexed paths', async () => {
        const txPath = join(store.tmpDir, 'transcript.jsonl');
        writeFileSync(txPath, [
          userLine(),
          assistantReadLine('/proj/a.md'),
        ].join('\n') + '\n');

        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
        });

        await handleStop('s1', '/tmp', {
          session_id: 's1', cwd: '/tmp', transcript_path: txPath,
        } as never);

        const s = getSession('s1');
        assert.ok(s);
        assert.ok(s.context);
        assert.deepStrictEqual(s.context.reads['/proj/a.md'], [1]);
        assert.ok(s.meta._inventory_offset, 'should store inventory offset');
        assert.strictEqual(s.meta._inventory_turn, '1');
      });

      it('is idempotent on repeated invocations with no new transcript data', async () => {
        const txPath = join(store.tmpDir, 'transcript.jsonl');
        writeFileSync(txPath, [
          userLine(),
          assistantReadLine('/proj/a.md'),
        ].join('\n') + '\n');

        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy' });
        });

        await handleStop('s1', '/tmp', {
          session_id: 's1', cwd: '/tmp', transcript_path: txPath,
        } as never);
        await updateIndex((idx) => { idx.sessions['s1'].state = 'busy'; });
        await handleStop('s1', '/tmp', {
          session_id: 's1', cwd: '/tmp', transcript_path: txPath,
        } as never);

        const s = getSession('s1');
        assert.ok(s?.context);
        assert.deepStrictEqual(s.context.reads['/proj/a.md'], [1], 'no duplicate entries on re-read');
      });

      it('user-prompt hook also accumulates inventory across appended turns', async () => {
        const txPath = join(store.tmpDir, 'transcript.jsonl');
        writeFileSync(txPath, [
          userLine(),
          assistantReadLine('/proj/a.md'),
        ].join('\n') + '\n');

        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle' });
        });

        await handleUserPrompt('s1', '/tmp', {
          session_id: 's1', cwd: '/tmp', transcript_path: txPath,
        } as never);

        appendFileSync(txPath, [
          userLine(),
          assistantReadLine('/proj/b.md'),
          assistantReadLine('/proj/a.md'),
        ].join('\n') + '\n');

        await handleUserPrompt('s1', '/tmp', {
          session_id: 's1', cwd: '/tmp', transcript_path: txPath,
        } as never);

        const s = getSession('s1');
        assert.ok(s?.context);
        assert.deepStrictEqual(s.context.reads['/proj/a.md'], [1, 2]);
        assert.deepStrictEqual(s.context.reads['/proj/b.md'], [2]);
      });
    });
  });
});

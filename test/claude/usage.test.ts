/**
 * Tests for transcript usage reader
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTranscriptUsage } from '../../src/claude/usage.ts';

function assistantEntry(model: string, stopReason: string | null, usage: Record<string, number>): string {
  return JSON.stringify({
    type: 'assistant',
    requestId: `req_${Math.random().toString(36).slice(2)}`,
    message: {
      model,
      stop_reason: stopReason,
      usage,
    },
  });
}

function userEntry(): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } });
}

function progressEntry(): string {
  return JSON.stringify({ type: 'progress', data: {} });
}

describe('c', () => {
  describe('claude', () => {
    describe('usage', () => {
      let tmpDir: string;

      beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'c-usage-test-')); });
      afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

      function writeTx(...lines: string[]): string {
        const p = join(tmpDir, 'transcript.jsonl');
        writeFileSync(p, lines.join('\n') + '\n');
        return p;
      }

      describe('readTranscriptUsage', () => {
        it('sums tokens from final assistant entries only', () => {
          const tx = writeTx(
            // Streaming entries (stop_reason=null) — should be skipped
            assistantEntry('claude-sonnet-4-6', null, { input_tokens: 100, output_tokens: 50 }),
            assistantEntry('claude-sonnet-4-6', null, { input_tokens: 100, output_tokens: 80 }),
            assistantEntry('claude-sonnet-4-6', null, { input_tokens: 100, output_tokens: 100 }),
            // Final entry (stop_reason=tool_use)
            assistantEntry('claude-sonnet-4-6', 'tool_use', {
              input_tokens: 100, output_tokens: 200,
              cache_creation_input_tokens: 500, cache_read_input_tokens: 1000,
            }),
          );

          const result = readTranscriptUsage(tx, 0);
          assert.ok(result);
          assert.strictEqual(result.total_tokens.input_tokens, 100);
          assert.strictEqual(result.total_tokens.output_tokens, 200);
          assert.strictEqual(result.total_tokens.cache_creation_input_tokens, 500);
          assert.strictEqual(result.total_tokens.cache_read_input_tokens, 1000);
        });

        it('skips non-assistant entries', () => {
          const tx = writeTx(
            progressEntry(),
            userEntry(),
            assistantEntry('claude-sonnet-4-6', 'end_turn', {
              input_tokens: 50, output_tokens: 100,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );

          const result = readTranscriptUsage(tx, 0);
          assert.ok(result);
          assert.strictEqual(result.total_tokens.input_tokens, 50);
          assert.strictEqual(result.total_tokens.output_tokens, 100);
        });

        it('accumulates across multiple API calls in one turn', () => {
          const tx = writeTx(
            assistantEntry('claude-sonnet-4-6', 'tool_use', {
              input_tokens: 100, output_tokens: 200,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
            assistantEntry('claude-sonnet-4-6', 'tool_use', {
              input_tokens: 300, output_tokens: 400,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
            assistantEntry('claude-sonnet-4-6', 'end_turn', {
              input_tokens: 500, output_tokens: 100,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );

          const result = readTranscriptUsage(tx, 0);
          assert.ok(result);
          assert.strictEqual(result.total_tokens.input_tokens, 900);
          assert.strictEqual(result.total_tokens.output_tokens, 700);
        });

        it('reads incrementally from byte offset', () => {
          const tx = writeTx(
            assistantEntry('claude-sonnet-4-6', 'tool_use', {
              input_tokens: 100, output_tokens: 200,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );

          const r1 = readTranscriptUsage(tx, 0);
          assert.ok(r1);
          assert.strictEqual(r1.total_tokens.input_tokens, 100);

          // Append more lines
          appendFileSync(tx, assistantEntry('claude-sonnet-4-6', 'end_turn', {
            input_tokens: 300, output_tokens: 50,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          }) + '\n');

          // Read from new offset with existing totals
          const r2 = readTranscriptUsage(tx, r1.new_offset, r1.total_tokens, r1.cost_usd);
          assert.ok(r2);
          assert.strictEqual(r2.total_tokens.input_tokens, 400); // 100 + 300
          assert.strictEqual(r2.total_tokens.output_tokens, 250); // 200 + 50
        });

        it('adds to existing token totals', () => {
          const tx = writeTx(
            assistantEntry('claude-sonnet-4-6', 'end_turn', {
              input_tokens: 50, output_tokens: 100,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );

          const existing = {
            input_tokens: 100,
            output_tokens: 200,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          };
          const result = readTranscriptUsage(tx, 0, existing);
          assert.ok(result);
          assert.strictEqual(result.total_tokens.input_tokens, 150);
          assert.strictEqual(result.total_tokens.output_tokens, 300);
        });

        it('calculates context_pct from last entry', () => {
          const tx = writeTx(
            assistantEntry('claude-sonnet-4-6', 'tool_use', {
              input_tokens: 10000, output_tokens: 100,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
            assistantEntry('claude-sonnet-4-6', 'end_turn', {
              input_tokens: 50000, output_tokens: 100,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );

          const result = readTranscriptUsage(tx, 0);
          assert.ok(result);
          // context_pct based on last entry (sonnet, 1M window): 50000/1_000_000 = 5%
          assert.strictEqual(result.context_pct, 5);
        });

        it('handles multi-model sessions', () => {
          const tx = writeTx(
            assistantEntry('claude-opus-4-6', 'tool_use', {
              input_tokens: 1000, output_tokens: 1000,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
            assistantEntry('claude-haiku-4-5', 'end_turn', {
              input_tokens: 1000, output_tokens: 1000,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );

          const result = readTranscriptUsage(tx, 0);
          assert.ok(result);
          // Opus:  (1000*5 + 1000*25) / 1M = 0.030
          // Haiku: (1000*1 + 1000*5)  / 1M = 0.006
          assert.ok(result.cost_usd > 0.03, 'cost should include opus pricing');
          assert.strictEqual(result.last_model, 'claude-haiku-4-5');
        });

        it('returns null for empty file', () => {
          const tx = join(tmpDir, 'empty.jsonl');
          writeFileSync(tx, '');
          assert.strictEqual(readTranscriptUsage(tx, 0), null);
        });

        it('returns null for nonexistent file', () => {
          assert.strictEqual(readTranscriptUsage(join(tmpDir, 'nope.jsonl'), 0), null);
        });

        it('uses explicit contextWindow for context_pct', () => {
          // Haiku default window is 200k; overriding to 1M must change the result.
          const tx = writeTx(
            assistantEntry('claude-haiku-4-5', 'end_turn', {
              input_tokens: 192000, output_tokens: 1000,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );

          const r1 = readTranscriptUsage(tx, 0);
          assert.ok(r1);
          assert.strictEqual(r1.context_pct, 96);

          const r2 = readTranscriptUsage(tx, 0, undefined, undefined, 1_000_000);
          assert.ok(r2);
          assert.strictEqual(r2.context_pct, 19);
        });

        it('falls back to model default when contextWindow is undefined', () => {
          const tx = writeTx(
            assistantEntry('claude-sonnet-4-6', 'end_turn', {
              input_tokens: 50000, output_tokens: 100,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );

          // Sonnet default window is 1M: 50000 / 1_000_000 = 5%
          const result = readTranscriptUsage(tx, 0, undefined, undefined, undefined);
          assert.ok(result);
          assert.strictEqual(result.context_pct, 5);
        });

        it('handles offset beyond file size gracefully', () => {
          const tx = writeTx(
            assistantEntry('claude-sonnet-4-6', 'end_turn', {
              input_tokens: 100, output_tokens: 100,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
          );
          assert.strictEqual(readTranscriptUsage(tx, 999999), null);
        });

        it('skips malformed JSON lines', () => {
          const tx = writeTx(
            'this is not json',
            assistantEntry('claude-sonnet-4-6', 'end_turn', {
              input_tokens: 100, output_tokens: 200,
              cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            }),
            '{invalid json too',
          );

          const result = readTranscriptUsage(tx, 0);
          assert.ok(result);
          assert.strictEqual(result.total_tokens.input_tokens, 100);
          assert.strictEqual(result.total_tokens.output_tokens, 200);
        });
      });
    });
  });
});

/**
 * Tests for pricing module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getModelPricing, calculateCost, calculateContextPct, type TokenUsage } from '../../src/claude/pricing.ts';

describe('c', () => {
  describe('claude', () => {
    describe('pricing', () => {
      describe('getModelPricing', () => {
        it('returns pricing for claude-opus-4-6', () => {
          const p = getModelPricing('claude-opus-4-6');
          assert.strictEqual(p.input, 15);
          assert.strictEqual(p.output, 75);
        });

        it('returns pricing for claude-sonnet-4-6', () => {
          const p = getModelPricing('claude-sonnet-4-6');
          assert.strictEqual(p.input, 3);
          assert.strictEqual(p.output, 15);
        });

        it('returns pricing for claude-haiku-4-5', () => {
          const p = getModelPricing('claude-haiku-4-5');
          assert.strictEqual(p.input, 0.80);
          assert.strictEqual(p.output, 4);
        });

        it('returns fallback pricing for unknown model', () => {
          const p = getModelPricing('claude-unknown-99');
          const sonnet = getModelPricing('claude-sonnet-4-6');
          assert.deepStrictEqual(p, sonnet);
        });
      });

      describe('calculateCost', () => {
        it('calculates cost for opus with all token types', () => {
          const usage: TokenUsage = {
            input_tokens: 100,
            output_tokens: 500,
            cache_creation_input_tokens: 1000,
            cache_read_input_tokens: 5000,
          };
          // (100*15 + 500*75 + 1000*18.75 + 5000*1.5) / 1_000_000
          const expected = (1500 + 37500 + 18750 + 7500) / 1_000_000;
          assert.strictEqual(calculateCost('claude-opus-4-6', usage), expected);
        });

        it('returns 0 when all token counts are 0', () => {
          const usage: TokenUsage = {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          };
          assert.strictEqual(calculateCost('claude-opus-4-6', usage), 0);
        });

        it('uses model-specific pricing', () => {
          const usage: TokenUsage = {
            input_tokens: 1000,
            output_tokens: 1000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          };
          const opusCost = calculateCost('claude-opus-4-6', usage);
          const haikuCost = calculateCost('claude-haiku-4-5', usage);
          assert.ok(opusCost > haikuCost, 'opus should cost more than haiku');
        });
      });

      describe('calculateContextPct', () => {
        it('calculates percentage from input tokens for 200k window', () => {
          const usage: TokenUsage = {
            input_tokens: 1,
            output_tokens: 0,
            cache_creation_input_tokens: 10000,
            cache_read_input_tokens: 90000,
          };
          // (1 + 10000 + 90000) / 200000 * 100 = 50.0005 → rounds to 50
          assert.strictEqual(calculateContextPct('claude-opus-4-6', usage), 50);
        });

        it('returns 0 when no input tokens', () => {
          const usage: TokenUsage = {
            input_tokens: 0,
            output_tokens: 500,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          };
          assert.strictEqual(calculateContextPct('claude-opus-4-6', usage), 0);
        });

        it('caps at 100', () => {
          const usage: TokenUsage = {
            input_tokens: 250000,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          };
          assert.strictEqual(calculateContextPct('claude-opus-4-6', usage), 100);
        });
      });
    });
  });
});

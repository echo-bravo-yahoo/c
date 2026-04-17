/**
 * Tests for pricing module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getModelPricing, calculateCost, calculateContextPct, parseContextWindow, normalizeModel, type TokenUsage } from '../../src/claude/pricing.ts';

describe('c', () => {
  describe('claude', () => {
    describe('pricing', () => {
      describe('getModelPricing', () => {
        it('returns pricing for claude-opus-4-7', () => {
          const p = getModelPricing('claude-opus-4-7');
          assert.strictEqual(p.input, 5);
          assert.strictEqual(p.output, 25);
          assert.strictEqual(p.cache_write, 6.25);
          assert.strictEqual(p.cache_read, 0.50);
          assert.strictEqual(p.context_window, 1_000_000);
        });

        it('returns pricing for claude-opus-4-6', () => {
          const p = getModelPricing('claude-opus-4-6');
          assert.strictEqual(p.input, 5);
          assert.strictEqual(p.output, 25);
          assert.strictEqual(p.context_window, 1_000_000);
        });

        it('returns pricing for claude-sonnet-4-6', () => {
          const p = getModelPricing('claude-sonnet-4-6');
          assert.strictEqual(p.input, 3);
          assert.strictEqual(p.output, 15);
          assert.strictEqual(p.context_window, 1_000_000);
        });

        it('returns pricing for claude-haiku-4-5', () => {
          const p = getModelPricing('claude-haiku-4-5');
          assert.strictEqual(p.input, 1);
          assert.strictEqual(p.output, 5);
          assert.strictEqual(p.cache_write, 1.25);
          assert.strictEqual(p.cache_read, 0.10);
          assert.strictEqual(p.context_window, 200_000);
        });

        it('resolves full dated haiku ID via normalizer', () => {
          const full = getModelPricing('claude-haiku-4-5-20251001');
          const alias = getModelPricing('claude-haiku-4-5');
          assert.deepStrictEqual(full, alias);
        });

        it('returns zero pricing for <synthetic>', () => {
          const p = getModelPricing('<synthetic>');
          assert.strictEqual(p.input, 0);
          assert.strictEqual(p.output, 0);
          assert.strictEqual(p.cache_write, 0);
          assert.strictEqual(p.cache_read, 0);
        });

        it('returns fallback pricing for unknown model', () => {
          const p = getModelPricing('claude-unknown-99');
          const sonnet = getModelPricing('claude-sonnet-4-6');
          assert.deepStrictEqual(p, sonnet);
        });
      });

      describe('normalizeModel', () => {
        it('strips -YYYYMMDD date suffix', () => {
          assert.strictEqual(normalizeModel('claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
          assert.strictEqual(normalizeModel('claude-sonnet-4-5-20250929'), 'claude-sonnet-4-5');
        });

        it('leaves alias-form IDs unchanged', () => {
          assert.strictEqual(normalizeModel('claude-opus-4-7'), 'claude-opus-4-7');
          assert.strictEqual(normalizeModel('claude-haiku-4-5'), 'claude-haiku-4-5');
        });

        it('leaves <synthetic> unchanged', () => {
          assert.strictEqual(normalizeModel('<synthetic>'), '<synthetic>');
        });
      });

      describe('calculateCost', () => {
        it('calculates cost for opus-4-7 with all token types', () => {
          const usage: TokenUsage = {
            input_tokens: 100,
            output_tokens: 500,
            cache_creation_input_tokens: 1000,
            cache_read_input_tokens: 5000,
          };
          // (100*5 + 500*25 + 1000*6.25 + 5000*0.5) / 1_000_000
          const expected = (500 + 12500 + 6250 + 2500) / 1_000_000;
          assert.strictEqual(calculateCost('claude-opus-4-7', usage), expected);
        });

        it('calculates cost for opus-4-6 with corrected rates', () => {
          const usage: TokenUsage = {
            input_tokens: 100,
            output_tokens: 500,
            cache_creation_input_tokens: 1000,
            cache_read_input_tokens: 5000,
          };
          const expected = (500 + 12500 + 6250 + 2500) / 1_000_000;
          assert.strictEqual(calculateCost('claude-opus-4-6', usage), expected);
        });

        it('calculates cost for haiku via full dated ID', () => {
          const usage: TokenUsage = {
            input_tokens: 100,
            output_tokens: 500,
            cache_creation_input_tokens: 1000,
            cache_read_input_tokens: 5000,
          };
          // (100*1 + 500*5 + 1000*1.25 + 5000*0.10) / 1_000_000
          const expected = (100 + 2500 + 1250 + 500) / 1_000_000;
          assert.strictEqual(calculateCost('claude-haiku-4-5-20251001', usage), expected);
        });

        it('returns 0 for <synthetic> regardless of token counts', () => {
          const usage: TokenUsage = {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_creation_input_tokens: 1_000_000,
            cache_read_input_tokens: 1_000_000,
          };
          assert.strictEqual(calculateCost('<synthetic>', usage), 0);
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
          const opusCost = calculateCost('claude-opus-4-7', usage);
          const haikuCost = calculateCost('claude-haiku-4-5', usage);
          assert.ok(opusCost > haikuCost, 'opus should cost more than haiku');
        });

        it('falls back to sonnet rates for unknown models', () => {
          const usage: TokenUsage = {
            input_tokens: 1000,
            output_tokens: 1000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          };
          assert.strictEqual(
            calculateCost('claude-unknown-99', usage),
            calculateCost('claude-sonnet-4-6', usage),
          );
        });
      });

      describe('calculateContextPct', () => {
        it('calculates percentage from input tokens for 200k window (haiku)', () => {
          const usage: TokenUsage = {
            input_tokens: 1,
            output_tokens: 0,
            cache_creation_input_tokens: 10000,
            cache_read_input_tokens: 90000,
          };
          // (1 + 10000 + 90000) / 200000 * 100 = 50.0005 → rounds to 50
          assert.strictEqual(calculateContextPct('claude-haiku-4-5', usage), 50);
        });

        it('calculates percentage against 1M window (opus-4-7)', () => {
          const usage: TokenUsage = {
            input_tokens: 100_000,
            output_tokens: 0,
            cache_creation_input_tokens: 150_000,
            cache_read_input_tokens: 250_000,
          };
          // 500_000 / 1_000_000 * 100 = 50
          assert.strictEqual(calculateContextPct('claude-opus-4-7', usage), 50);
        });

        it('returns 0 when no input tokens', () => {
          const usage: TokenUsage = {
            input_tokens: 0,
            output_tokens: 500,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          };
          assert.strictEqual(calculateContextPct('claude-opus-4-7', usage), 0);
        });

        it('caps at 100', () => {
          const usage: TokenUsage = {
            input_tokens: 250_000,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          };
          assert.strictEqual(calculateContextPct('claude-haiku-4-5', usage), 100);
        });

        it('uses explicit contextWindow override', () => {
          const usage: TokenUsage = {
            input_tokens: 100000,
            output_tokens: 0,
            cache_creation_input_tokens: 50000,
            cache_read_input_tokens: 50000,
          };
          assert.strictEqual(calculateContextPct('claude-haiku-4-5', usage), 100);
          assert.strictEqual(calculateContextPct('claude-haiku-4-5', usage, 1_000_000), 20);
        });
      });

      describe('parseContextWindow', () => {
        it('returns 1M for [1m] suffix', () => {
          assert.strictEqual(parseContextWindow('opus[1m]'), 1_000_000);
        });

        it('returns value for [Nk] suffix', () => {
          assert.strictEqual(parseContextWindow('opus[200k]'), 200_000);
          assert.strictEqual(parseContextWindow('sonnet[128k]'), 128_000);
        });

        it('is case-insensitive', () => {
          assert.strictEqual(parseContextWindow('opus[1M]'), 1_000_000);
          assert.strictEqual(parseContextWindow('opus[200K]'), 200_000);
        });

        it('returns undefined for alias without suffix', () => {
          assert.strictEqual(parseContextWindow('opus'), undefined);
          assert.strictEqual(parseContextWindow('claude-opus-4-6'), undefined);
        });

        it('returns undefined for null', () => {
          assert.strictEqual(parseContextWindow(null), undefined);
        });
      });
    });
  });
});

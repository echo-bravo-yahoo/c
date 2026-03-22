/**
 * Model pricing table and cost/context calculation
 */

export interface ModelPricing {
  input: number;          // $ per million tokens
  output: number;
  cache_write: number;
  cache_read: number;
  context_window: number; // token count
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6':   { input: 15,   output: 75, cache_write: 18.75, cache_read: 1.50, context_window: 200_000 },
  'claude-sonnet-4-6': { input: 3,    output: 15, cache_write: 3.75,  cache_read: 0.30, context_window: 200_000 },
  'claude-haiku-4-5':  { input: 0.80, output: 4,  cache_write: 1.00,  cache_read: 0.08, context_window: 200_000 },
};

const FALLBACK_MODEL = 'claude-sonnet-4-6';

export function getModelPricing(model: string): ModelPricing {
  return PRICING[model] ?? PRICING[FALLBACK_MODEL];
}

export function calculateCost(model: string, usage: TokenUsage): number {
  const p = getModelPricing(model);
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      usage.cache_creation_input_tokens * p.cache_write +
      usage.cache_read_input_tokens * p.cache_read) /
    1_000_000
  );
}

export function calculateContextPct(model: string, usage: TokenUsage): number {
  const p = getModelPricing(model);
  const contextTokens =
    usage.input_tokens +
    usage.cache_creation_input_tokens +
    usage.cache_read_input_tokens;
  const pct = (contextTokens / p.context_window) * 100;
  return Math.min(Math.round(pct), 100);
}

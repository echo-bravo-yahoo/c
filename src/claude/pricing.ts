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

// Pricing verified 2026-04-17 against https://claude.com/pricing
// Context windows verified against https://platform.claude.com/docs/en/about-claude/models/overview
// cache_write reflects the 5-minute ephemeral cache TTL (1.25x input);
// the 1-hour cache (2x input) is not distinguished in Claude Code transcripts.
const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-7':   { input: 5,    output: 25, cache_write: 6.25,  cache_read: 0.50, context_window: 1_000_000 },
  'claude-opus-4-6':   { input: 5,    output: 25, cache_write: 6.25,  cache_read: 0.50, context_window: 1_000_000 },
  'claude-sonnet-4-6': { input: 3,    output: 15, cache_write: 3.75,  cache_read: 0.30, context_window: 1_000_000 },
  'claude-haiku-4-5':  { input: 1,    output: 5,  cache_write: 1.25,  cache_read: 0.10, context_window: 200_000 },
  '<synthetic>':       { input: 0,    output: 0,  cache_write: 0,     cache_read: 0,    context_window: 200_000 },
};

const FALLBACK_MODEL = 'claude-sonnet-4-6';

/**
 * Normalize a model ID to its alias form by stripping a trailing -YYYYMMDD
 * date snapshot suffix. Transcripts record full IDs like
 * "claude-haiku-4-5-20251001", but the PRICING table is keyed on the alias
 * "claude-haiku-4-5".
 */
export function normalizeModel(model: string): string {
  return model.replace(/-20\d{6}$/, '');
}

export function getModelPricing(model: string): ModelPricing {
  return PRICING[normalizeModel(model)] ?? PRICING[FALLBACK_MODEL];
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

export function calculateContextPct(model: string, usage: TokenUsage, contextWindow?: number): number {
  const window = contextWindow ?? getModelPricing(model).context_window;
  const contextTokens =
    usage.input_tokens +
    usage.cache_creation_input_tokens +
    usage.cache_read_input_tokens;
  const pct = (contextTokens / window) * 100;
  return Math.min(Math.round(pct), 100);
}

/**
 * Parse context window size from a Claude Code model alias.
 * Aliases like "opus[1m]" declare a 1M context window via the suffix.
 * Returns undefined when no suffix is present (callers fall back to PRICING table).
 */
export function parseContextWindow(modelAlias: string | null): number | undefined {
  if (!modelAlias) return undefined;
  const match = modelAlias.match(/\[(\d+)(k|m)\]$/i);
  if (!match) return undefined;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  return unit === 'm' ? num * 1_000_000 : num * 1_000;
}

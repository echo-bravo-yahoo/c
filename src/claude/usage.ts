/**
 * Incremental transcript reader for token usage
 */

import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { calculateCost, calculateContextPct, type TokenUsage } from './pricing.ts';

export type { TokenUsage } from './pricing.ts';

export interface TranscriptUsageResult {
  cost_usd: number;
  context_pct: number;
  total_tokens: TokenUsage;
  last_model: string | null;
  new_offset: number;
}

function emptyTokens(): TokenUsage {
  return { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
}

/**
 * Read transcript from byte offset, parse new assistant entries with stop_reason,
 * sum token usage, calculate cost and context %.
 */
export function readTranscriptUsage(
  transcriptPath: string,
  fromOffset: number,
  existingTokens?: TokenUsage,
  existingCost?: number,
): TranscriptUsageResult | null {
  let fd: number;
  try {
    fd = openSync(transcriptPath, 'r');
  } catch {
    return null;
  }

  try {
    const stat = fstatSync(fd);
    if (fromOffset >= stat.size) return null;

    const buf = Buffer.alloc(stat.size - fromOffset);
    const bytesRead = readSync(fd, buf, 0, buf.length, fromOffset);
    if (bytesRead === 0) return null;

    const chunk = buf.toString('utf-8', 0, bytesRead);
    const lines = chunk.split('\n').filter(Boolean);

    const totals: TokenUsage = existingTokens
      ? { ...existingTokens }
      : emptyTokens();
    let cost = existingCost ?? 0;
    let lastModel: string | null = null;
    let lastInputUsage: TokenUsage | null = null;
    let foundAny = false;

    for (const line of lines) {
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (entry.type !== 'assistant') continue;

      const msg = entry.message as Record<string, unknown> | undefined;
      if (!msg?.stop_reason) continue;

      const usage = msg.usage as Record<string, number> | undefined;
      if (!usage) continue;

      const model = (msg.model as string) ?? null;
      if (model) lastModel = model;

      const input = usage.input_tokens ?? 0;
      const output = usage.output_tokens ?? 0;
      const cacheWrite = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;

      totals.input_tokens += input;
      totals.output_tokens += output;
      totals.cache_creation_input_tokens += cacheWrite;
      totals.cache_read_input_tokens += cacheRead;

      // Per-entry cost using that entry's model
      const entryUsage: TokenUsage = {
        input_tokens: input,
        output_tokens: output,
        cache_creation_input_tokens: cacheWrite,
        cache_read_input_tokens: cacheRead,
      };
      cost += calculateCost(model ?? 'claude-sonnet-4-6', entryUsage);

      // Track last entry's input tokens for context %
      lastInputUsage = entryUsage;
      foundAny = true;
    }

    if (!foundAny) return null;

    const contextPct = lastModel && lastInputUsage
      ? calculateContextPct(lastModel, lastInputUsage)
      : 0;

    return {
      cost_usd: cost,
      context_pct: contextPct,
      total_tokens: totals,
      last_model: lastModel,
      new_offset: fromOffset + bytesRead,
    };
  } finally {
    closeSync(fd);
  }
}

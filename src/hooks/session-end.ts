/**
 * SessionEnd hook - mark session as closed
 */

import { updateIndex, getCurrentSession } from '../store/index.ts';
import { findTranscriptPath } from '../claude/sessions.ts';
import { readTranscriptUsage } from '../claude/usage.ts';
import { deleteStatusCache } from '../store/status-cache.ts';
import { debugLog } from '../util/debug.ts';
import type { HookInput } from './index.ts';
import type { TokenUsage } from '../claude/pricing.ts';

export async function handleSessionEnd(
  sessionId: string | undefined,
  cwd: string,
  input: HookInput | null
): Promise<void> {
  // Find session by ID or by cwd
  const targetId = sessionId ?? getCurrentSession(cwd)?.id;
  debugLog(`[hook] session-end: sessionId=${sessionId} targetId=${targetId}`);

  if (!targetId) {
    return;
  }

  await updateIndex((index) => {
    const s = index.sessions[targetId];
    if (!s) return;

    s.state = 'closed';
    s.last_active_at = new Date();
    delete s.pid;

    // Final cost capture from transcript
    const transcriptPath = input?.transcript_path ?? findTranscriptPath(targetId);
    if (transcriptPath) {
      const offset = parseInt(s.meta._transcript_offset ?? '0', 10);
      const existing: TokenUsage = {
        input_tokens: parseInt(s.meta._total_input ?? '0', 10),
        output_tokens: parseInt(s.meta._total_output ?? '0', 10),
        cache_creation_input_tokens: parseInt(s.meta._total_cache_write ?? '0', 10),
        cache_read_input_tokens: parseInt(s.meta._total_cache_read ?? '0', 10),
      };
      const existingCost = s.cost_usd ?? 0;
      const result = readTranscriptUsage(transcriptPath, offset, existing, existingCost);
      if (result) {
        s.cost_usd = result.cost_usd;
      }
    }

    // Context % is meaningless for closed sessions
    delete s.context_pct;

    // Clean up internal tracking meta
    delete s.meta._transcript_offset;
    delete s.meta._total_input;
    delete s.meta._total_output;
    delete s.meta._total_cache_write;
    delete s.meta._total_cache_read;
  });

  deleteStatusCache(targetId);
}

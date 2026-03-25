/**
 * Stop hook - mark session as idle
 */

import { updateIndex, getCurrentSession } from '../store/index.ts';
import { findTranscriptPath, getCustomTitleFromTranscriptTail, getPlanExecutionInfo } from '../claude/sessions.ts';
import { readTranscriptUsage } from '../claude/usage.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';
import { debugLog } from '../util/debug.ts';
import type { HookInput } from './index.ts';
import type { TokenUsage } from '../claude/pricing.ts';

export async function handleStop(
  sessionId: string | undefined,
  cwd: string,
  input: HookInput | null
): Promise<void> {
  // Don't set idle if this is a continuation from a stop hook
  if (input?.stop_hook_active) {
    debugLog(`[title] stop: skipped — stop_hook_active`);
    return;
  }

  const targetId = sessionId ?? getCurrentSession(cwd)?.id;

  if (!targetId) {
    debugLog(`[title] stop: no targetId (sessionId=${sessionId})`);
    return;
  }

  let newTitle: string | undefined;
  let pane: string | undefined;

  await updateIndex((index) => {
    const s = index.sessions[targetId];
    if (!s) {
      debugLog(`[title] stop: session ${targetId} not in index`);
      return;
    }

    s.state = 'idle';
    s.last_active_at = new Date();
    pane = s.resources.tmux_pane;

    // Sync tmux pane title with /rename changes from the transcript
    const transcriptPath = input?.transcript_path ?? findTranscriptPath(targetId);
    const customTitle = transcriptPath
      ? getCustomTitleFromTranscriptTail(transcriptPath)
      : null;
    debugLog(`[title] stop: transcriptPath=${transcriptPath} customTitle=${JSON.stringify(customTitle)} stored=${JSON.stringify(s.meta._custom_title)} pane=${pane}`);
    if (customTitle && customTitle !== s.meta._custom_title) {
      s.meta._custom_title = customTitle;
      newTitle = customTitle;
      debugLog(`[title] stop: title changed → ${JSON.stringify(newTitle)}`);
    }

    // Detect plan creation (ExitPlanMode in transcript)
    if (!s.resources.plan) {
      const planInfo = getPlanExecutionInfo(targetId);
      if (planInfo) {
        s.resources.plan = planInfo.slug;
        debugLog(`[plan] stop: detected plan ${planInfo.slug}`);
      }
    }

    // Capture usage/cost from transcript
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
        s.context_pct = result.context_pct;
        s.meta._transcript_offset = String(result.new_offset);
        s.meta._total_input = String(result.total_tokens.input_tokens);
        s.meta._total_output = String(result.total_tokens.output_tokens);
        s.meta._total_cache_write = String(result.total_tokens.cache_creation_input_tokens);
        s.meta._total_cache_read = String(result.total_tokens.cache_read_input_tokens);
      }
    }
  });

  if (newTitle) {
    setTmuxPaneTitle(newTitle, pane);
  }
}

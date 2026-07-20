/**
 * SessionEnd hook - mark session as closed
 */

import { updateIndex, getCurrentSession } from '../store/index.ts';
import { findTranscriptPath, getClaudeSessionTitles, getCustomTitleFromTranscriptTail } from '../claude/sessions.ts';
import { readTranscriptUsage } from '../claude/usage.ts';
import { deleteSessionStateDir } from '../store/session-state.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';
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

  let newTitle: string | undefined;
  let pane: string | undefined;

  await updateIndex((index) => {
    const s = index.sessions[targetId];
    if (!s) return;

    s.state = 'closed';
    s.last_active_at = new Date();
    delete s.pid;
    pane = s.resources.tmux_pane;

    const transcriptPath = input?.transcript_path ?? findTranscriptPath(targetId);

    // Sync tmux pane title with /rename changes. Without this, a rename
    // that's the last action before the session closes never reaches c's
    // store — stop/user-prompt are the only other sync points, and neither
    // fires again after this.
    const { customTitle: indexTitle } = getClaudeSessionTitles(targetId, s.project_key);
    const transcriptTitle = !indexTitle && transcriptPath
      ? getCustomTitleFromTranscriptTail(transcriptPath)
      : null;
    const customTitle = indexTitle ?? transcriptTitle;
    if (customTitle && customTitle !== s.meta._custom_title) {
      s.meta._custom_title = customTitle;
      newTitle = customTitle;
    }

    // Final cost capture from transcript
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
        s.meta._transcript_offset = String(result.new_offset);
      }
    }

    // Context % is meaningless for closed sessions
    delete s.context_pct;

    // Clean up internal tracking meta — keep _transcript_offset as a high-water
    // mark so that any hook firing after session-end doesn't re-read from byte 0
    // and double-count costs.
    delete s.meta._total_input;
    delete s.meta._total_output;
    delete s.meta._total_cache_write;
    delete s.meta._total_cache_read;
  });

  if (newTitle) {
    setTmuxPaneTitle(newTitle, pane);
  }

  deleteSessionStateDir(targetId);
}

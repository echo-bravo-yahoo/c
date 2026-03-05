/**
 * Stop hook - mark session as idle
 */

import { updateIndex, getCurrentSession } from '../store/index.ts';
import { findTranscriptPath, getCustomTitleFromTranscriptTail } from '../claude/sessions.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';
import { debugLog } from '../util/debug.ts';
import type { HookInput } from './index.ts';

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
    const transcriptPath = findTranscriptPath(targetId);
    const customTitle = transcriptPath
      ? getCustomTitleFromTranscriptTail(transcriptPath)
      : null;
    debugLog(`[title] stop: transcriptPath=${transcriptPath} customTitle=${JSON.stringify(customTitle)} stored=${JSON.stringify(s.meta._custom_title)} pane=${pane}`);
    if (customTitle && customTitle !== s.meta._custom_title) {
      s.meta._custom_title = customTitle;
      newTitle = customTitle;
      debugLog(`[title] stop: title changed → ${JSON.stringify(newTitle)}`);
    }
  });

  if (newTitle) {
    setTmuxPaneTitle(newTitle, pane);
  }
}

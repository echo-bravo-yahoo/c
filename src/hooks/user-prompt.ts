/**
 * UserPromptSubmit hook - clear waiting state
 */

import { updateIndex, getCurrentSession } from '../store/index.ts';
import { findTranscriptPath, getCustomTitleFromTranscriptTail } from '../claude/sessions.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';
import { debugLog } from '../util/debug.ts';
import type { HookInput } from './index.ts';

export async function handleUserPrompt(
  sessionId: string | undefined,
  cwd: string,
  _input: HookInput | null
): Promise<void> {
  const targetId = sessionId ?? getCurrentSession(cwd)?.id;

  if (!targetId) {
    debugLog(`[title] user-prompt: no targetId (sessionId=${sessionId})`);
    return;
  }

  let newTitle: string | undefined;
  let pane: string | undefined;

  await updateIndex((index) => {
    const s = index.sessions[targetId];
    if (!s) {
      debugLog(`[title] user-prompt: session ${targetId} not in index`);
      return;
    }

    s.state = 'busy';
    s.last_active_at = new Date();

    // Sync tmux pane title with /rename changes since last stop
    const transcriptPath = findTranscriptPath(targetId);
    const customTitle = transcriptPath
      ? getCustomTitleFromTranscriptTail(transcriptPath)
      : null;
    debugLog(`[title] user-prompt: transcriptPath=${transcriptPath} customTitle=${JSON.stringify(customTitle)} stored=${JSON.stringify(s.meta._custom_title)} pane=${s.resources.tmux_pane}`);
    if (customTitle && customTitle !== s.meta._custom_title) {
      s.meta._custom_title = customTitle;
      newTitle = customTitle;
      pane = s.resources.tmux_pane;
      debugLog(`[title] user-prompt: title changed → ${JSON.stringify(newTitle)}`);
    }
  });

  if (newTitle) {
    setTmuxPaneTitle(newTitle, pane);
  }
}

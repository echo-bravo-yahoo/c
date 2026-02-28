/**
 * UserPromptSubmit hook - clear waiting state
 */

import { updateIndex, getCurrentSession } from '../store/index.js';
import { findTranscriptPath, getCustomTitleFromTranscriptTail } from '../claude/sessions.js';
import { setTmuxPaneTitle } from '../util/exec.js';
import type { HookInput } from './index.js';

export async function handleUserPrompt(
  sessionId: string | undefined,
  cwd: string,
  _input: HookInput | null
): Promise<void> {
  const targetId = sessionId ?? getCurrentSession(cwd)?.id;

  if (!targetId) {
    return;
  }

  let newTitle: string | undefined;
  let pane: string | undefined;

  await updateIndex((index) => {
    const s = index.sessions[targetId];
    if (!s) return;

    s.state = 'busy';
    s.last_active_at = new Date();

    // Sync tmux pane title with /rename changes since last stop
    const transcriptPath = findTranscriptPath(targetId);
    const customTitle = transcriptPath
      ? getCustomTitleFromTranscriptTail(transcriptPath)
      : null;
    if (customTitle && customTitle !== s.meta._custom_title) {
      s.meta._custom_title = customTitle;
      newTitle = customTitle;
      pane = s.resources.tmux_pane;
    }
  });

  if (newTitle) {
    setTmuxPaneTitle(newTitle, pane);
  }
}

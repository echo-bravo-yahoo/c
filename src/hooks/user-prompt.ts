/**
 * UserPromptSubmit hook - clear waiting state
 */

import { updateIndex, getCurrentSession } from '../store/index.js';
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

  await updateIndex((index) => {
    if (index.sessions[targetId]) {
      index.sessions[targetId].state = 'busy';
      index.sessions[targetId].last_active_at = new Date();
    }
  });
}

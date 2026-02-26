/**
 * Stop hook - mark session as idle
 */

import { updateIndex, getCurrentSession } from '../store/index.js';
import type { HookInput } from './index.js';

export async function handleStop(
  sessionId: string | undefined,
  cwd: string,
  input: HookInput | null
): Promise<void> {
  // Don't set idle if this is a continuation from a stop hook
  if (input?.stop_hook_active) {
    return;
  }

  const targetId = sessionId ?? getCurrentSession(cwd)?.id;

  if (!targetId) {
    return;
  }

  await updateIndex((index) => {
    if (index.sessions[targetId]) {
      index.sessions[targetId].state = 'idle';
      index.sessions[targetId].last_active_at = new Date();
    }
  });
}

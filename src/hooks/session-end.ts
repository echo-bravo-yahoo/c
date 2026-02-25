/**
 * SessionEnd hook - mark session as closed
 */

import { updateIndex, getCurrentSession } from '../store/index.js';
import type { HookInput } from './index.js';

export async function handleSessionEnd(
  sessionId: string | undefined,
  cwd: string,
  _input: HookInput | null
): Promise<void> {
  // Find session by ID or by cwd
  const targetId = sessionId ?? getCurrentSession(cwd)?.id;

  if (!targetId) {
    return;
  }

  await updateIndex((index) => {
    if (index.sessions[targetId]) {
      index.sessions[targetId].status = 'closed';
      index.sessions[targetId].last_active_at = new Date();
      index.sessions[targetId].waiting = false;
    }
  });
}

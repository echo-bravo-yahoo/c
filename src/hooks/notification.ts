/**
 * Notification hook - detect waiting state
 */

import { updateIndex, getCurrentSession } from '../store/index.ts';
import { debugLog } from '../util/debug.ts';
import type { HookInput } from './index.ts';

export async function handleNotificationWaiting(
  sessionId: string | undefined,
  cwd: string,
  _input: HookInput | null
): Promise<void> {
  const targetId = sessionId ?? getCurrentSession(cwd)?.id;
  debugLog(`[hook] notification-waiting: sessionId=${sessionId} targetId=${targetId}`);

  if (!targetId) {
    return;
  }

  await updateIndex((index) => {
    if (index.sessions[targetId]) {
      index.sessions[targetId].state = 'waiting';
      index.sessions[targetId].last_active_at = new Date();
    }
  });
}

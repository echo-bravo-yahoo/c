/**
 * PostToolUse (Bash) hook - detect PRs and servers
 */

import { updateIndex, getCurrentSession } from '../store/index.js';
import { extractPRFromOutput } from '../detection/pr.js';
import type { HookInput } from './index.js';

export async function handlePostBash(
  sessionId: string | undefined,
  cwd: string,
  input: HookInput | null
): Promise<void> {
  const targetId = sessionId ?? getCurrentSession(cwd)?.id;

  if (!targetId) {
    return;
  }

  const output = input?.tool_output ?? '';
  const command = (input?.tool_input?.command as string) ?? '';

  // Detect PR creation
  const prUrl = extractPRFromOutput(output);

  // Detect dev server starts
  const serverPatterns = [
    /npm (?:run )?start/,
    /npm run dev/,
    /yarn (?:run )?start/,
    /yarn dev/,
    /webpack.*serve/,
    /vite/,
    /next dev/,
  ];

  const isServerStart = serverPatterns.some((p) => p.test(command));

  if (!prUrl && !isServerStart) {
    // Nothing to update
    return;
  }

  await updateIndex((index) => {
    if (!index.sessions[targetId]) return;

    const session = index.sessions[targetId];
    session.last_active_at = new Date();

    if (prUrl && !session.resources.pr) {
      session.resources.pr = prUrl;
    }

    // For server detection, we'd need to track PIDs which is complex
    // For now, just note that a server was started
    if (isServerStart) {
      // Could be enhanced to scan lsof for actual port bindings
    }
  });
}

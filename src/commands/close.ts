/**
 * c close [ids...] - close running sessions
 */

import chalk from 'chalk';
import { getSession, getCurrentSession, updateIndex } from '../store/index.js';
import { getDisplayName } from '../util/format.js';
import { signalSession } from '../util/process.js';

export async function closeCommand(
  idsOrPrefixes?: string[],
  options?: { archive?: boolean }
): Promise<void> {
  const targetState = options?.archive ? 'archived' : 'closed';
  const verb = options?.archive ? 'Archived' : 'Closed';

  // No IDs: fall back to current directory session
  if (!idsOrPrefixes || idsOrPrefixes.length === 0) {
    const session = getCurrentSession();
    if (!session) {
      console.error(chalk.red('No active session in current directory'));
      process.exit(1);
    }

    if (session.state === 'closed' || session.state === 'archived') {
      console.error(chalk.red(`Session is already ${session.state}`));
      process.exit(1);
    }

    await signalSession(session.pid);

    await updateIndex((index) => {
      if (index.sessions[session!.id]) {
        index.sessions[session!.id].state = targetState;
        index.sessions[session!.id].last_active_at = new Date();
        delete index.sessions[session!.id].pid;
      }
    });

    console.log(chalk.green(`${verb} session "${getDisplayName(session)}" (${session.id.slice(0, 8)})`));
    return;
  }

  // Multiple IDs
  for (const idOrPrefix of idsOrPrefixes) {
    const session = getSession(idOrPrefix);

    if (!session) {
      console.error(chalk.red(`Session not found: ${idOrPrefix}`));
      continue;
    }

    if (session.state === 'closed' || session.state === 'archived') {
      console.error(chalk.red(`Session ${getDisplayName(session)} is already ${session.state}`));
      continue;
    }

    await signalSession(session.pid);

    await updateIndex((index) => {
      if (index.sessions[session!.id]) {
        index.sessions[session!.id].state = targetState;
        index.sessions[session!.id].last_active_at = new Date();
        delete index.sessions[session!.id].pid;
      }
    });

    console.log(chalk.green(`${verb} session "${getDisplayName(session)}" (${session.id.slice(0, 8)})`));
  }
}

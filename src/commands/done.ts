/**
 * c done <id> - mark session as done
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.js';
import { getDisplayName } from '../util/format.js';

export async function doneCommand(idOrPrefix?: string): Promise<void> {
  let session;

  if (idOrPrefix) {
    session = getSession(idOrPrefix);
  } else {
    // Use current directory session
    session = getCurrentSession();
  }

  if (!session) {
    const msg = idOrPrefix
      ? `Session not found: ${idOrPrefix}`
      : 'No active session in current directory';
    console.error(chalk.red(msg));
    process.exit(1);
  }

  await updateIndex((index) => {
    if (index.sessions[session!.id]) {
      index.sessions[session!.id].status = 'done';
      index.sessions[session!.id].last_active_at = new Date();
    }
  });

  console.log(chalk.green(`✓ Marked ${getDisplayName(session)} as done`));
}

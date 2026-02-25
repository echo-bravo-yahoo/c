/**
 * c archive <id> - mark session as archived
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.js';
import { getDisplayName } from '../util/format.js';

export async function archiveCommand(idOrPrefix?: string): Promise<void> {
  let session;

  if (idOrPrefix) {
    session = getSession(idOrPrefix);
  } else {
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
      index.sessions[session!.id].status = 'archived';
      index.sessions[session!.id].last_active_at = new Date();
    }
  });

  console.log(chalk.green(`✓ Archived ${getDisplayName(session)}`));
}

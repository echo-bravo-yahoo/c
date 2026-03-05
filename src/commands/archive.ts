/**
 * c archive [ids...] - archive sessions
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.js';
import { getDisplayName, shortId } from '../util/format.js';
import { signalSession } from '../util/process.js';

export async function archiveCommand(idsOrPrefixes?: string[]): Promise<void> {
  // No IDs: fall back to current directory session
  if (!idsOrPrefixes || idsOrPrefixes.length === 0) {
    const session = getCurrentSession();
    if (!session) {
      console.error(chalk.red('No active session in current directory.'));
      process.exit(1);
    }

    await signalSession(session.pid);

    await updateIndex((index) => {
      if (index.sessions[session!.id]) {
        index.sessions[session!.id].state = 'archived';
        index.sessions[session!.id].last_active_at = new Date();
        delete index.sessions[session!.id].pid;
      }
    });

    console.log(chalk.green(`Archived "${getDisplayName(session) || shortId(session.id)}" (${shortId(session.id)}).`));
    return;
  }

  // Multiple IDs
  for (const idOrPrefix of idsOrPrefixes) {
    const session = getSession(idOrPrefix);

    if (!session) {
      console.error(chalk.red(`Session not found: ${idOrPrefix}.`));
      continue;
    }

    await signalSession(session.pid);

    await updateIndex((index) => {
      if (index.sessions[session!.id]) {
        index.sessions[session!.id].state = 'archived';
        index.sessions[session!.id].last_active_at = new Date();
        delete index.sessions[session!.id].pid;
      }
    });

    console.log(chalk.green(`Archived "${getDisplayName(session) || shortId(session.id)}" (${shortId(session.id)}).`));
  }
}

/**
 * c archive [ids...] - archive sessions
 */

import chalk from 'chalk';
import { resolveSession, updateIndex, getCurrentSession } from '../store/index.ts';
import { ambiguityError, getDisplayName, shortId } from '../util/format.ts';
import { signalSession } from '../util/process.ts';

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
    const result = resolveSession(idOrPrefix);

    if (!result.session) {
      console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
      continue;
    }
    const session = result.session;

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

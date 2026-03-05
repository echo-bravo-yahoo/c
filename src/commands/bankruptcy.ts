/**
 * c bankruptcy - archive all sessions at once
 */

import chalk from 'chalk';
import { readIndex, updateIndex, getSession } from '../store/index.ts';
import { signalSession } from '../util/process.ts';

export async function bankruptcyCommand(options: { skip?: string[] }): Promise<void> {
  const index = readIndex();

  // Resolve skip IDs (supports prefixes via getSession)
  const skipIds = new Set<string>();
  if (options.skip) {
    for (const idOrPrefix of options.skip) {
      const session = getSession(idOrPrefix);
      if (session) {
        skipIds.add(session.id);
      } else {
        console.error(chalk.red(`Skip target not found: ${idOrPrefix}.`));
      }
    }
  }

  const active = Object.values(index.sessions)
    .filter(s => s.state !== 'archived' && !skipIds.has(s.id));

  if (active.length === 0) {
    console.log(chalk.dim('No sessions to archive.'));
    return;
  }

  // Signal active processes before archiving
  for (const session of active) {
    if (session.pid) await signalSession(session.pid);
  }

  const now = new Date();
  await updateIndex((idx) => {
    for (const session of active) {
      if (idx.sessions[session.id]) {
        idx.sessions[session.id].state = 'archived';
        idx.sessions[session.id].last_active_at = now;
        delete idx.sessions[session.id].pid;
      }
    }
  });

  console.log(chalk.green(`Archived ${active.length} session${active.length === 1 ? '' : 's'}.`));
}

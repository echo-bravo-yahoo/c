/**
 * c tag <tag> - add tag to session
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.ts';
import { getDisplayName } from '../util/format.ts';

export async function tagCommand(tag: string, idOrPrefix?: string): Promise<void> {
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
    const s = index.sessions[session!.id];
    if (!s) return;

    if (!s.tags.values.includes(tag)) {
      s.tags.values.push(tag);
    }
    s.last_active_at = new Date();
  });

  console.log(chalk.green(`Tagged ${getDisplayName(session)} with: ${tag}.`));
}

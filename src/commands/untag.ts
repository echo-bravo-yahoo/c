/**
 * c untag <tag> - remove tag from session
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.js';
import { getDisplayName } from '../util/format.js';

export async function untagCommand(tag: string, idOrPrefix?: string): Promise<void> {
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

    s.tags.values = s.tags.values.filter((t) => t !== tag);
    s.last_active_at = new Date();
  });

  console.log(chalk.green(`Removed tag from ${getDisplayName(session)}: ${tag}.`));
}

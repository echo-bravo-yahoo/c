/**
 * c untag <tag> - remove tag from session
 */

import chalk from 'chalk';
import { resolveSession, updateIndex, getCurrentSession } from '../store/index.ts';
import { ambiguityError, getDisplayName } from '../util/format.ts';

export async function untagCommand(tag: string, idOrPrefix?: string): Promise<void> {
  let session;

  if (idOrPrefix) {
    const result = resolveSession(idOrPrefix);
    if (!result.session) {
      console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
      process.exit(1);
    }
    session = result.session;
  } else {
    session = getCurrentSession();
    if (!session) {
      console.error(chalk.red('No active session in current directory'));
      process.exit(1);
    }
  }

  await updateIndex((index) => {
    const s = index.sessions[session!.id];
    if (!s) return;

    s.tags.values = s.tags.values.filter((t) => t !== tag);
    s.last_active_at = new Date();
  });

  console.log(chalk.green(`Removed tag from ${getDisplayName(session)}: ${tag}.`));
}

/**
 * c tag <tag> - add tag to session
 */

import chalk from 'chalk';
import { resolveSession, updateIndex, getCurrentSession } from '../store/index.ts';
import { ambiguityError, getDisplayName } from '../util/format.ts';

export async function tagCommand(tag: string, idOrPrefix?: string): Promise<void> {
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

    if (!s.tags.values.includes(tag)) {
      s.tags.values.push(tag);
    }
    s.last_active_at = new Date();
  });

  console.log(chalk.green(`Tagged ${getDisplayName(session)} with: ${tag}.`));
}

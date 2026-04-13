/**
 * c dir [id] - print session directory path
 */

import chalk from 'chalk';
import { resolveSession, getCurrentSession } from '../store/index.ts';
import { ambiguityError } from '../util/format.ts';

export function dirCommand(idOrPrefix?: string): void {
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
      console.error(chalk.red('No active session in current directory.'));
      process.exit(1);
    }
  }

  process.stdout.write(session.directory);
}

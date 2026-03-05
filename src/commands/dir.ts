/**
 * c dir [id] - print session directory path
 */

import chalk from 'chalk';
import { getSession, getCurrentSession } from '../store/index.ts';

export function dirCommand(idOrPrefix?: string): void {
  const session = idOrPrefix
    ? getSession(idOrPrefix)
    : getCurrentSession();

  if (!session) {
    const msg = idOrPrefix
      ? `Session not found: ${idOrPrefix}.`
      : 'No active session in current directory.';
    console.error(chalk.red(msg));
    process.exit(1);
  }

  process.stdout.write(session.directory);
}

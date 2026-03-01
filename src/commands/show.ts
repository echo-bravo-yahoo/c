/**
 * c show <id> - show session details
 */

import chalk from 'chalk';
import { getSession } from '../store/index.js';
import { formatSessionDetails } from '../util/format.js';

export function showCommand(idOrPrefix: string): void {
  const session = getSession(idOrPrefix);

  if (!session) {
    console.error(chalk.red(`Session not found: ${idOrPrefix}.`));
    process.exit(1);
  }

  console.log(formatSessionDetails(session));
}

/**
 * c show <id> - show session details
 */

import chalk from 'chalk';
import { getSession } from '../store/index.js';
import { formatSessionDetails } from '../util/format.js';

export interface ShowOptions {
  json?: boolean;
}

export function showCommand(idOrPrefix: string, options?: ShowOptions): void {
  const session = getSession(idOrPrefix);

  if (!session) {
    console.error(chalk.red(`Session not found: ${idOrPrefix}.`));
    process.exit(1);
  }

  if (options?.json) {
    process.stdout.write(JSON.stringify({
      ...session,
      created_at: session.created_at.toISOString(),
      last_active_at: session.last_active_at.toISOString(),
    }, null, 2) + '\n');
    return;
  }

  console.log(formatSessionDetails(session));
}

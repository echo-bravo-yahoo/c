/**
 * c reopen <id> - mark session as live again
 */

import chalk from 'chalk';
import { updateIndex, getSession } from '../store/index.js';
import { getDisplayName } from '../util/format.js';

export async function reopenCommand(idOrPrefix: string): Promise<void> {
  const session = getSession(idOrPrefix);

  if (!session) {
    console.error(chalk.red(`Session not found: ${idOrPrefix}`));
    process.exit(1);
  }

  await updateIndex((index) => {
    if (index.sessions[session.id]) {
      index.sessions[session.id].status = 'live';
      index.sessions[session.id].last_active_at = new Date();
    }
  });

  console.log(chalk.green(`✓ Reopened ${getDisplayName(session)}`));
}

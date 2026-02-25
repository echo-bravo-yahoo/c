/**
 * c resume <id> - resume a Claude session
 */

import chalk from 'chalk';
import { getSession } from '../store/index.js';
import { execReplace } from '../util/exec.js';

export function resumeCommand(idOrPrefix: string): void {
  const session = getSession(idOrPrefix);

  if (!session) {
    console.error(chalk.red(`Session not found: ${idOrPrefix}`));
    process.exit(1);
  }

  // Use claude -r to resume the session
  console.log(chalk.dim(`Resuming session ${session.humanhash}...`));
  execReplace('claude', ['-r', session.id]);
}

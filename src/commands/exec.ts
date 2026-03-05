/**
 * c exec [id] -- <command> - run a command in session directory
 */

import chalk from 'chalk';
import { getSession, getCurrentSession } from '../store/index.js';
import { spawnInteractive } from '../util/exec.js';

export async function execCommand(
  idOrPrefix: string | undefined,
  command: string[]
): Promise<void> {
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

  if (command.length === 0) {
    console.error(chalk.red('No command specified. Usage: c exec [id] -- <command>'));
    process.exit(1);
  }

  const code = await spawnInteractive(command[0], command.slice(1), {
    cwd: session.directory,
  });
  process.exit(code);
}

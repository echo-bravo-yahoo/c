/**
 * c exec [id] -- <command> - run a command in session directory
 */

import chalk from 'chalk';
import { resolveSession, getCurrentSession } from '../store/index.ts';
import { ambiguityError } from '../util/format.ts';
import { spawnInteractive } from '../util/exec.ts';

export async function execCommand(
  idOrPrefix: string | undefined,
  command: string[]
): Promise<void> {
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

  if (command.length === 0) {
    console.error(chalk.red('No command specified. Usage: c exec [id] -- <command>'));
    process.exit(1);
  }

  const code = await spawnInteractive(command[0], command.slice(1), {
    cwd: session.directory,
  });
  process.exit(code);
}

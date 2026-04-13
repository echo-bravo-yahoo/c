/**
 * c meta key=value - set session metadata
 */

import chalk from 'chalk';
import { resolveSession, updateIndex, getCurrentSession } from '../store/index.ts';
import { ambiguityError, getDisplayName } from '../util/format.ts';

export async function metaCommand(keyValue: string, idOrPrefix?: string): Promise<void> {
  const eqIndex = keyValue.indexOf('=');
  if (eqIndex === -1) {
    console.error(chalk.red('Format: key=value.'));
    process.exit(1);
  }

  const key = keyValue.slice(0, eqIndex);
  const value = keyValue.slice(eqIndex + 1);

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

    if (value) {
      s.meta[key] = value;
    } else {
      delete s.meta[key];
    }
    s.last_active_at = new Date();
  });

  if (value) {
    console.log(chalk.green(`Set ${key}=${value} on ${getDisplayName(session)}.`));
  } else {
    console.log(chalk.green(`Removed ${key} from ${getDisplayName(session)}.`));
  }
}

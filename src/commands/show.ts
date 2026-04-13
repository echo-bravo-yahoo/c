/**
 * c show <id> - show session details
 */

import chalk from 'chalk';
import { resolveSession } from '../store/index.ts';
import { formatSessionDetails, ambiguityError } from '../util/format.ts';

export interface ShowOptions {
  json?: boolean;
}

export function showCommand(idOrPrefix: string, options?: ShowOptions): void {
  const result = resolveSession(idOrPrefix);

  if (!result.session) {
    console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
    process.exit(1);
  }

  const session = result.session;

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

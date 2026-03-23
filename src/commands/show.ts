/**
 * c show <id> - show session details
 */

import chalk from 'chalk';
import { getSession, findSessionsByName, findSessionsByTitle, findSessions } from '../store/index.ts';
import { formatSessionDetails, shortId, highlightId } from '../util/format.ts';

export interface ShowOptions {
  json?: boolean;
}

export function showCommand(idOrPrefix: string, options?: ShowOptions): void {
  let session = getSession(idOrPrefix);

  if (!session) {
    const nameMatches = findSessionsByName(idOrPrefix);
    if (nameMatches.length === 1) {
      session = nameMatches[0];
    } else if (nameMatches.length >= 2) {
      const ids = nameMatches.map(m => shortId(m.id));
      console.error(chalk.red(`Multiple sessions named "${idOrPrefix}": ${ids.join(', ')}.`));
      process.exit(1);
    }
  }

  if (!session) {
    const titleMatches = findSessionsByTitle(idOrPrefix);
    if (titleMatches.length === 1) {
      session = titleMatches[0];
    } else if (titleMatches.length >= 2) {
      const ids = titleMatches.map(m => shortId(m.id));
      console.error(chalk.red(`Multiple sessions titled "${idOrPrefix}": ${ids.join(', ')}.`));
      process.exit(1);
    }
  }

  if (!session) {
    const matches = findSessions(idOrPrefix);
    if (matches.length >= 2) {
      const ids = matches.map(m => highlightId(shortId(m.id), idOrPrefix.length));
      console.error(chalk.red(`Multiple sessions starting with ${idOrPrefix}: ${ids.join(', ')}.`));
    } else {
      console.error(chalk.red(`Session not found: ${idOrPrefix}.`));
    }
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

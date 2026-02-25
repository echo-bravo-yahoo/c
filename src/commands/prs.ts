/**
 * c prs - list PRs across sessions
 */

import chalk from 'chalk';
import { getSessions } from '../store/index.js';
import { getDisplayName, shortId } from '../util/format.js';

export function prsCommand(): void {
  const sessions = getSessions({
    status: ['live', 'closed', 'done'],
  });

  const withPRs = sessions.filter((s) => s.resources.pr);

  if (withPRs.length === 0) {
    console.log(chalk.dim('No PRs linked to sessions.'));
    return;
  }

  console.log(chalk.dim('Session'.padEnd(30) + 'PR'));
  console.log(chalk.dim('─'.repeat(70)));

  for (const session of withPRs) {
    const name = getDisplayName(session);
    const prNum = session.resources.pr!.match(/\/pull\/(\d+)/)?.[1];
    const prDisplay = prNum ? chalk.green(`#${prNum}`) : session.resources.pr!;

    console.log(
      chalk.cyan(shortId(session.id)) +
        '  ' +
        name.padEnd(20) +
        '  ' +
        prDisplay +
        '  ' +
        chalk.dim(session.resources.pr!)
    );
  }
}

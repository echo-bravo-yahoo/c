/**
 * c jira - list JIRA tickets across sessions
 */

import chalk from 'chalk';
import { getSessions } from '../store/index.js';
import { getDisplayName, shortId } from '../util/format.js';

export function jiraCommand(): void {
  const sessions = getSessions({
    status: ['live', 'closed', 'done'],
  });

  const withJira = sessions.filter((s) => s.resources.jira);

  if (withJira.length === 0) {
    console.log(chalk.dim('No JIRA tickets linked to sessions.'));
    return;
  }

  console.log(chalk.dim('Session'.padEnd(30) + 'JIRA'));
  console.log(chalk.dim('─'.repeat(60)));

  for (const session of withJira) {
    const name = getDisplayName(session);

    console.log(
      chalk.cyan(shortId(session.id)) +
        '  ' +
        name.padEnd(20) +
        '  ' +
        chalk.yellow(session.resources.jira!)
    );
  }
}

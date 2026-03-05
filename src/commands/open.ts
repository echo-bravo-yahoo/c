/**
 * c open [id] - open session resources in browser
 */

import chalk from 'chalk';
import { getSession, getCurrentSession } from '../store/index.js';
import { exec } from '../util/exec.js';

export function openCommand(
  idOrPrefix?: string,
  options?: { pr?: boolean; jira?: boolean }
): void {
  const session = idOrPrefix ? getSession(idOrPrefix) : getCurrentSession();
  if (!session) {
    console.error(chalk.red(idOrPrefix ? `Session not found: ${idOrPrefix}.` : 'No active session.'));
    process.exit(1);
  }

  let url: string | undefined;
  if (options?.pr) {
    url = session.resources.pr;
  } else if (options?.jira && session.resources.jira) {
    url = `https://machinify.atlassian.net/browse/${session.resources.jira}`;
  } else {
    url = session.resources.pr
      || (session.resources.jira ? `https://machinify.atlassian.net/browse/${session.resources.jira}` : undefined);
  }

  if (!url) {
    console.error(chalk.red('No resources to open.'));
    process.exit(1);
  }

  exec(`open "${url}"`);
}

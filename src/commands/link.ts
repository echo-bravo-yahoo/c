/**
 * c link - link resources to current session
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.js';
import { getDisplayName } from '../util/format.js';

export interface LinkOptions {
  pr?: string;
  jira?: string;
  branch?: string;
}

export async function linkCommand(options: LinkOptions, idOrPrefix?: string): Promise<void> {
  let session;

  if (idOrPrefix) {
    session = getSession(idOrPrefix);
  } else {
    session = getCurrentSession();
  }

  if (!session) {
    const msg = idOrPrefix
      ? `Session not found: ${idOrPrefix}`
      : 'No active session in current directory';
    console.error(chalk.red(msg));
    process.exit(1);
  }

  if (!options.pr && !options.jira && !options.branch) {
    console.error(chalk.red('Specify at least one: --pr, --jira, or --branch.'));
    process.exit(1);
  }

  await updateIndex((index) => {
    const s = index.sessions[session!.id];
    if (!s) return;

    if (options.pr) s.resources.pr = options.pr;
    if (options.jira) s.resources.jira = options.jira;
    if (options.branch) s.resources.branch = options.branch;

    s.last_active_at = new Date();
  });

  const linked: string[] = [];
  if (options.pr) linked.push(`PR: ${options.pr}`);
  if (options.jira) linked.push(`JIRA: ${options.jira}`);
  if (options.branch) linked.push(`branch: ${options.branch}`);

  console.log(chalk.green(`Linked to ${getDisplayName(session)}: ${linked.join(', ')}.`));
}

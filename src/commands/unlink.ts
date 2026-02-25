/**
 * c unlink - remove resource links from session
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.js';
import { getDisplayName } from '../util/format.js';

export interface UnlinkOptions {
  pr?: boolean;
  jira?: boolean;
  branch?: boolean;
}

export async function unlinkCommand(options: UnlinkOptions, idOrPrefix?: string): Promise<void> {
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
    console.error(chalk.red('Specify at least one: --pr, --jira, or --branch'));
    process.exit(1);
  }

  await updateIndex((index) => {
    const s = index.sessions[session!.id];
    if (!s) return;

    if (options.pr) delete s.resources.pr;
    if (options.jira) delete s.resources.jira;
    if (options.branch) delete s.resources.branch;

    s.last_active_at = new Date();
  });

  const unlinked: string[] = [];
  if (options.pr) unlinked.push('PR');
  if (options.jira) unlinked.push('JIRA');
  if (options.branch) unlinked.push('branch');

  console.log(chalk.green(`✓ Unlinked from ${getDisplayName(session)}: ${unlinked.join(', ')}`));
}

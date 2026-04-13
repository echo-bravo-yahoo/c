/**
 * c unlink - remove resource links from session
 */

import chalk from 'chalk';
import { resolveSession, updateIndex, getCurrentSession } from '../store/index.ts';
import { ambiguityError, getDisplayName } from '../util/format.ts';

export interface UnlinkOptions {
  pr?: boolean;
  jira?: boolean;
  branch?: boolean;
  plan?: boolean;
}

export async function unlinkCommand(options: UnlinkOptions, idOrPrefix?: string): Promise<void> {
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

  if (!options.pr && !options.jira && !options.branch && !options.plan) {
    console.error(chalk.red('Specify at least one: --pr, --jira, --branch, or --plan.'));
    process.exit(1);
  }

  await updateIndex((index) => {
    const s = index.sessions[session!.id];
    if (!s) return;

    if (options.pr) delete s.resources.pr;
    if (options.jira) delete s.resources.jira;
    if (options.branch) delete s.resources.branch;
    if (options.plan) delete s.resources.plan;

    s.last_active_at = new Date();
  });

  const unlinked: string[] = [];
  if (options.pr) unlinked.push('PR');
  if (options.jira) unlinked.push('JIRA');
  if (options.branch) unlinked.push('branch');
  if (options.plan) unlinked.push('plan');

  console.log(chalk.green(`Unlinked from ${getDisplayName(session)}: ${unlinked.join(', ')}.`));
}

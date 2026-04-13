/**
 * c open [id] - open session resources in browser
 */

import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSession, getCurrentSession } from '../store/index.ts';
import { ambiguityError } from '../util/format.ts';
import { PLANS_DIR } from '../claude/sessions.ts';
import { exec } from '../util/exec.ts';

export function openCommand(
  idOrPrefix?: string,
  options?: { pr?: boolean; jira?: boolean; plan?: boolean }
): void {
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
      console.error(chalk.red('No active session.'));
      process.exit(1);
    }
  }

  if (options?.plan) {
    const slug = session.resources.plan;
    if (!slug) {
      console.error(chalk.red('No plan linked.'));
      process.exit(1);
    }
    const planPath = join(PLANS_DIR, `${slug}.md`);
    if (!existsSync(planPath)) {
      console.error(chalk.red(`Plan file not found: ${planPath}`));
      process.exit(1);
    }
    exec(`open "${planPath}"`);
    return;
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

/**
 * c list - list sessions
 */

import chalk from 'chalk';
import { getSessions, reconcileStaleSessions } from '../store/index.js';
import { printSessionTable, getDisplayName, shortId } from '../util/format.js';
import type { SessionState } from '../store/schema.js';

export interface ListOptions {
  all?: boolean;
  archived?: boolean;
  waiting?: boolean;
  prs?: boolean;
  jira?: boolean;
  directory?: string;
  minWidth?: number;
  maxWidth?: number;
}

export async function listCommand(options: ListOptions): Promise<void> {
  // Reconcile stale sessions before listing
  await reconcileStaleSessions();

  // Special views: --prs and --jira
  if (options.prs) {
    listPRs();
    return;
  }
  if (options.jira) {
    listJira();
    return;
  }

  let stateFilter: SessionState[];

  if (options.all) {
    stateFilter = ['busy', 'idle', 'waiting', 'closed', 'archived'];
  } else if (options.archived) {
    stateFilter = ['archived'];
  } else if (options.waiting) {
    stateFilter = ['waiting'];
  } else {
    // Default: show active (busy/idle/waiting) and closed
    stateFilter = ['busy', 'idle', 'waiting', 'closed'];
  }

  const sessions = getSessions({
    state: stateFilter,
    directory: options.directory,
  });

  let terminalWidth = process.stdout.columns || 80;
  if (options.minWidth != null) terminalWidth = Math.max(terminalWidth, options.minWidth);
  if (options.maxWidth != null) terminalWidth = Math.min(terminalWidth, options.maxWidth);

  printSessionTable(sessions, terminalWidth);
}

function listPRs(): void {
  const sessions = getSessions({
    state: ['busy', 'idle', 'waiting', 'closed', 'archived'],
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

function listJira(): void {
  const sessions = getSessions({
    state: ['busy', 'idle', 'waiting', 'closed', 'archived'],
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

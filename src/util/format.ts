/**
 * Output formatting utilities
 */

import chalk from 'chalk';
import { Session } from '../store/schema.js';
import { getClaudeSessionTitles } from '../claude/sessions.js';

/**
 * Format a relative time string
 */
export function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

/**
 * Get display name for a session
 * Priority: Claude's customTitle > c's name > Claude's summary > humanhash
 */
export function getDisplayName(session: Session): string {
  // Check Claude's session index for titles
  const { customTitle, summary } = getClaudeSessionTitles(session.id, session.project_key);

  // customTitle = user explicitly renamed via /rename (highest priority)
  if (customTitle) return customTitle;

  // c's name = user explicitly renamed via `c title`
  if (session.name) return session.name;

  // summary = Claude-generated summary
  if (summary) return summary;

  // fallback to humanhash
  return session.humanhash;
}

/**
 * Get short ID (first 8 chars)
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Format session status with color
 */
export function formatStatus(session: Session): string {
  if (session.waiting) {
    return chalk.yellow('waiting');
  }

  switch (session.status) {
    case 'live':
      return chalk.green('live');
    case 'closed':
      return chalk.gray('closed');
    case 'done':
      return chalk.blue('done');
    case 'archived':
      return chalk.dim('archived');
    default:
      return session.status;
  }
}

/**
 * Format a session as a single line for list views
 */
export function formatSessionLine(session: Session): string {
  const parts: string[] = [];

  // ID and name
  const name = getDisplayName(session);
  parts.push(chalk.cyan(shortId(session.id)));
  parts.push(chalk.bold(name.padEnd(20)));

  // Status
  parts.push(formatStatus(session).padEnd(12));

  // Resources
  const resources: string[] = [];
  if (session.resources.branch) {
    resources.push(chalk.magenta(session.resources.branch));
  }
  if (session.resources.pr) {
    const prNum = session.resources.pr.match(/\/pull\/(\d+)/)?.[1];
    if (prNum) {
      resources.push(chalk.green(`#${prNum}`));
    }
  }
  if (session.resources.jira) {
    resources.push(chalk.yellow(session.resources.jira));
  }
  parts.push(resources.join(' ') || chalk.dim('-'));

  // Time
  parts.push(chalk.dim(relativeTime(session.last_active_at)));

  return parts.join('  ');
}

/**
 * Format session details for show command
 */
export function formatSessionDetails(session: Session): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Session: ') + getDisplayName(session));
  lines.push(chalk.dim('ID: ') + session.id);
  lines.push(chalk.dim('Humanhash: ') + session.humanhash);
  lines.push('');
  lines.push(chalk.bold('Status: ') + formatStatus(session));
  lines.push(chalk.dim('Directory: ') + session.directory);
  lines.push(chalk.dim('Created: ') + session.created_at.toLocaleString());
  lines.push(chalk.dim('Last active: ') + session.last_active_at.toLocaleString());

  // Resources
  lines.push('');
  lines.push(chalk.bold('Resources:'));
  if (session.resources.branch) {
    lines.push('  Branch: ' + chalk.magenta(session.resources.branch));
  }
  if (session.resources.worktree) {
    lines.push('  Worktree: ' + session.resources.worktree);
  }
  if (session.resources.pr) {
    lines.push('  PR: ' + chalk.green(session.resources.pr));
  }
  if (session.resources.jira) {
    lines.push('  JIRA: ' + chalk.yellow(session.resources.jira));
  }
  if (Object.keys(session.resources).length === 0) {
    lines.push(chalk.dim('  (none)'));
  }

  // Servers
  if (Object.keys(session.servers).length > 0) {
    lines.push('');
    lines.push(chalk.bold('Servers:'));
    for (const [pidPort, cmd] of Object.entries(session.servers)) {
      lines.push(`  ${pidPort}: ${cmd}`);
    }
  }

  // Tags
  if (session.tags.values.length > 0) {
    lines.push('');
    lines.push(chalk.bold('Tags: ') + session.tags.values.map((t) => chalk.cyan(t)).join(', '));
  }

  // Meta
  if (Object.keys(session.meta).length > 0) {
    lines.push('');
    lines.push(chalk.bold('Meta:'));
    for (const [key, value] of Object.entries(session.meta)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

/**
 * Print a table of sessions
 */
export function printSessionTable(sessions: Session[]): void {
  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    return;
  }

  // Header
  console.log(
    chalk.dim(
      'ID'.padEnd(10) +
        'Name'.padEnd(22) +
        'Status'.padEnd(14) +
        'Resources'.padEnd(30) +
        'Last Active'
    )
  );
  console.log(chalk.dim('─'.repeat(90)));

  for (const session of sessions) {
    console.log(formatSessionLine(session));
  }
}

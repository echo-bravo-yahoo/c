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
 * Truncate or pad a string to exact width (for column alignment)
 */
function fixedWidth(str: string, width: number): string {
  if (str.length > width) {
    return str.slice(0, width - 1) + '…';
  }
  return str.padEnd(width);
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

// Column widths (including trailing space)
const COL_ID = 12;
const COL_NAME = 34;
const COL_STATUS = 10;
const COL_RESOURCES = 40;

/**
 * Format a session as a single line for list views
 */
export function formatSessionLine(session: Session): string {
  // ID column (with optional tree prefix for child sessions)
  const id = shortId(session.id);
  const idCol = session.parent_session_id
    ? chalk.dim('└ ') + chalk.cyan(id) + '  '
    : '  ' + chalk.cyan(id) + '  ';

  // Name column
  const name = getDisplayName(session);
  const nameCol = chalk.bold(fixedWidth(name, COL_NAME));

  // Status column
  const statusText = session.waiting ? 'waiting' : session.status;
  const statusPad = ' '.repeat(Math.max(1, COL_STATUS - statusText.length));
  const statusCol = formatStatus(session) + statusPad;

  // Resources column
  const resourceParts: string[] = [];
  if (session.resources.branch) {
    resourceParts.push(session.resources.branch);
  }
  if (session.resources.pr) {
    const prNum = session.resources.pr.match(/\/pull\/(\d+)/)?.[1];
    if (prNum) {
      resourceParts.push(`#${prNum}`);
    }
  }
  if (session.resources.jira) {
    resourceParts.push(session.resources.jira);
  }
  const resourceText = resourceParts.join(' ') || '-';
  const resourceColored = resourceParts.length > 0
    ? [
        session.resources.branch ? chalk.magenta(session.resources.branch) : '',
        session.resources.pr ? chalk.green(`#${session.resources.pr.match(/\/pull\/(\d+)/)?.[1]}`) : '',
        session.resources.jira ? chalk.yellow(session.resources.jira) : '',
      ].filter(Boolean).join(' ')
    : chalk.dim('-');
  const resourceCol = resourceColored + ' '.repeat(Math.max(0, COL_RESOURCES - resourceText.length));

  // Time column
  const timeCol = chalk.dim(relativeTime(session.last_active_at));

  return `${idCol}${nameCol}${statusCol}${resourceCol}${timeCol}`;
}

/**
 * Format session details for show command
 */
export function formatSessionDetails(session: Session): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Session: ') + getDisplayName(session));
  lines.push(chalk.dim('ID: ') + session.id);
  lines.push(chalk.dim('Humanhash: ') + session.humanhash);
  if (session.parent_session_id) {
    lines.push(chalk.dim('Parent: ') + chalk.cyan(session.parent_session_id.slice(0, 8)));
  }
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

  const totalWidth = COL_ID + COL_NAME + COL_STATUS + COL_RESOURCES + 10;

  // Header (2-space indent to match data rows)
  console.log(
    chalk.dim(
      '  ' +
        fixedWidth('ID', COL_ID - 2) +
        fixedWidth('Name', COL_NAME) +
        fixedWidth('Status', COL_STATUS) +
        fixedWidth('Resources', COL_RESOURCES) +
        'Last Active'
    )
  );
  console.log(chalk.dim('─'.repeat(totalWidth)));

  for (const session of sessions) {
    console.log(formatSessionLine(session));
  }
}

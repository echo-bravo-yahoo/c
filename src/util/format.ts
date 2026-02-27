/**
 * Output formatting utilities
 */

import chalk from 'chalk';
import { Session } from '../store/schema.js';
import { getClaudeSessionTitles } from '../claude/sessions.js';
import { getAllSessions } from '../store/index.js';
import { getGitHubUsername, matchesUsernamePrefix } from '../detection/github.js';
import { computeColumnLayout, type ColumnKey, type ColumnLayout } from './layout.js';

const USER_ICON = '󰇘';

/**
 * Abbreviate branch name by replacing username prefix with icon
 */
export function abbreviateBranch(branch: string): string {
  const username = getGitHubUsername();
  if (!username) return branch;

  const { matches, prefix } = matchesUsernamePrefix(branch, username);
  if (matches) {
    return USER_ICON + branch.slice(prefix.length);
  }
  return branch;
}

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
 * Calculate visual display width of a string
 * Accounts for surrogate pairs (like 󰇘) that have length 2 but width 1
 */
export function displayWidth(str: string): number {
  // Spread handles surrogate pairs correctly (1 visual char = 1 array element)
  return [...str].length;
}

/**
 * Truncate or pad a string to exact visual width (for column alignment)
 */
export function fixedWidth(str: string, width: number): string {
  const visualWidth = displayWidth(str);
  if (visualWidth >= width) {
    // Truncate: need to count visual chars, not bytes
    let truncated = '';
    let w = 0;
    for (const char of str) {
      if (w >= width - 2) break;
      truncated += char;
      w += 1;
    }
    return truncated + '… ';
  }
  return str + ' '.repeat(width - visualWidth);
}

/**
 * Format session state with color
 */
export function formatStatus(session: Session): string {
  switch (session.state) {
    case 'busy':
      return chalk.green('busy');
    case 'idle':
      return chalk.blue('idle');
    case 'waiting':
      return chalk.yellow('waiting');
    case 'closed':
      return chalk.gray('closed');
    case 'archived':
      return chalk.dim('archived');
    default:
      return session.state;
  }
}

/**
 * Build resource text for a session (PR number, JIRA ticket, first tag)
 */
export function buildResourceText(session: Session): string {
  const parts: string[] = [];
  if (session.resources.pr) {
    const prNum = session.resources.pr.match(/\/pull\/(\d+)/)?.[1];
    if (prNum) parts.push(`#${prNum}`);
  }
  if (session.resources.jira) parts.push(session.resources.jira);
  if (session.tags.values.length > 0) parts.push(session.tags.values[0]);
  return parts.join(' ') || '-';
}

/**
 * Measure max content width per column across all sessions
 */
export function measureColumns(sessions: Session[]): Map<ColumnKey, number> {
  const widths = new Map<ColumnKey, number>();

  for (const session of sessions) {
    // +1 on each measurement accounts for minimum inter-column spacing

    // idName = ID (12) + name + trailing space
    const nameWidth = displayWidth(getDisplayName(session));
    const idNameWidth = 12 + nameWidth + 1;
    widths.set('idName', Math.max(widths.get('idName') ?? 0, idNameWidth));

    // status
    const statusWidth = session.state.length + 1;
    widths.set('status', Math.max(widths.get('status') ?? 0, statusWidth));

    // repo
    const repoWidth = displayWidth(getRepoName(session.directory)) + 1;
    widths.set('repo', Math.max(widths.get('repo') ?? 0, repoWidth));

    // branch
    const branchWidth = displayWidth(getBranchDisplay(session).text) + 1;
    widths.set('branch', Math.max(widths.get('branch') ?? 0, branchWidth));

    // time
    const timeWidth = relativeTime(session.last_active_at).length + 1;
    widths.set('time', Math.max(widths.get('time') ?? 0, timeWidth));

    // resources
    const resourceWidth = displayWidth(buildResourceText(session)) + 1;
    widths.set('resources', Math.max(widths.get('resources') ?? 0, resourceWidth));
  }

  return widths;
}

/**
 * Get repo name from session directory
 * - If in a worktree (path contains .worktrees/), use the original repo's directory name
 * - Otherwise, use the directory's basename
 */
export function getRepoName(directory: string): string {
  const home = process.env.HOME || '';
  // Session dir is $HOME itself
  if (home && (directory === home || directory === home + '/')) {
    return '~';
  }
  // Match .worktrees/ or .claude/worktrees/
  const worktreeMatch = directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
  if (worktreeMatch) {
    const originalRepo = worktreeMatch[1];
    return originalRepo.split('/').pop() || originalRepo;
  }
  return directory.split('/').pop() || directory;
}

/**
 * Get branch/worktree display for a session
 * Priority: worktree > branch > directory basename fallback
 */
export function getBranchDisplay(session: Session): { text: string; color: 'cyan' | 'magenta' | 'dim' } {
  if (session.resources.worktree) {
    return { text: session.resources.worktree, color: 'cyan' };
  }
  if (session.resources.branch) {
    return { text: abbreviateBranch(session.resources.branch), color: 'magenta' };
  }
  return { text: '', color: 'dim' };
}

/**
 * Format a session as a single line for list views
 */
export function formatSessionLine(session: Session, layout: ColumnLayout, depth = 0): string {
  const parts: string[] = [];

  // ID column (always visible when idName is visible)
  if (layout.visible.has('idName')) {
    const id = shortId(session.id);
    const indent = '  '.repeat(depth);
    const idCol = depth > 0
      ? indent + chalk.dim('└ ') + chalk.cyan(id) + '  '
      : '  ' + chalk.cyan(id) + '  ';
    parts.push(idCol);

    // Name column (shrink by indent to maintain alignment)
    const name = getDisplayName(session);
    const nameWidth = layout.name - (depth * 2);
    parts.push(chalk.bold(fixedWidth(name, nameWidth)));
  }

  // Status column
  if (layout.visible.has('status')) {
    const statusText = session.state;
    const statusPad = ' '.repeat(Math.max(1, layout.status - statusText.length));
    parts.push(formatStatus(session) + statusPad);
  }

  // Repo column
  if (layout.visible.has('repo')) {
    const repoName = getRepoName(session.directory);
    parts.push(chalk.blue(fixedWidth(repoName, layout.repo)));
  }

  // Worktree/Branch column
  if (layout.visible.has('branch')) {
    const branch = getBranchDisplay(session);
    const branchCol = branch.color === 'dim'
      ? chalk.dim(fixedWidth(branch.text, layout.branch))
      : chalk[branch.color](fixedWidth(branch.text, layout.branch));
    parts.push(branchCol);
  }

  // Resources column
  if (layout.visible.has('resources')) {
    const resourceText = buildResourceText(session);
    const resourceParts = resourceText === '-' ? [] : resourceText.split(' ');

    let resourceCol: string;
    if (resourceParts.length === 0) {
      resourceCol = chalk.dim(fixedWidth('-', layout.resources));
    } else {
      const truncated = fixedWidth(resourceText, layout.resources);
      if (truncated.includes('…')) {
        resourceCol = chalk.dim(truncated);
      } else {
        const prNum = session.resources.pr?.match(/\/pull\/(\d+)/)?.[1];
        const coloredParts = [
          prNum ? chalk.green(`#${prNum}`) : '',
          session.resources.jira ? chalk.yellow(session.resources.jira) : '',
          session.tags.values.length > 0 ? chalk.cyan(session.tags.values[0]) : '',
        ].filter(Boolean).join(' ');
        resourceCol = coloredParts + ' '.repeat(Math.max(0, layout.resources - displayWidth(resourceText)));
      }
    }
    parts.push(resourceCol);
  }

  // Time column
  if (layout.visible.has('time')) {
    parts.push(chalk.dim(relativeTime(session.last_active_at)));
  }

  return parts.join('');
}

/**
 * Format session details for show command
 */
export function formatSessionDetails(session: Session): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Session: ') + getDisplayName(session));
  lines.push(chalk.dim('  ID: ') + session.id);
  lines.push(chalk.dim('  Humanhash: ') + session.humanhash);
  if (session.parent_session_id) {
    lines.push(chalk.dim('  Parent: ') + chalk.cyan(session.parent_session_id.slice(0, 8)));
  }
  lines.push('');
  lines.push(chalk.bold('Status: ') + formatStatus(session));
  lines.push(chalk.dim('  Directory: ') + session.directory);
  lines.push(chalk.dim('  PID: ') + (session.pid != null ? String(session.pid) : '–'));
  lines.push(chalk.dim('  Created: ') + session.created_at.toLocaleString());
  lines.push(chalk.dim('  Last active: ') + session.last_active_at.toLocaleString());

  // Resources
  lines.push('');
  lines.push(chalk.bold('Resources:'));
  if (session.resources.branch) {
    lines.push('  Branch: ' + chalk.magenta(abbreviateBranch(session.resources.branch)));
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

type OutputRow =
  | { type: 'session'; session: Session; depth: number }
  | { type: 'gap'; count: number; depth: number };

/**
 * Order sessions so children appear under their parents, with gap markers
 * for hidden (archived) ancestors in the chain.
 */
function orderSessionsWithChildren(visibleSessions: Session[]): OutputRow[] {
  // Get all sessions to trace ancestry through hidden sessions
  const allSessions = getAllSessions();
  const allById = new Map(allSessions.map((s) => [s.id, s]));
  const visibleIds = new Set(visibleSessions.map((s) => s.id));

  // For each visible session, find nearest visible ancestor and count hidden sessions between
  type SessionMeta = { visibleParentId: string | null; hiddenCount: number };
  const meta = new Map<string, SessionMeta>();

  for (const session of visibleSessions) {
    let hiddenCount = 0;
    let current: Session | undefined = session;

    while (current?.parent_session_id) {
      const parent = allById.get(current.parent_session_id);
      if (!parent) break;

      if (visibleIds.has(parent.id)) {
        meta.set(session.id, { visibleParentId: parent.id, hiddenCount });
        break;
      }
      hiddenCount++;
      current = parent;
    }

    if (!meta.has(session.id)) {
      meta.set(session.id, { visibleParentId: null, hiddenCount });
    }
  }

  // Group by visible parent
  const byParent = new Map<string | null, Session[]>();
  for (const session of visibleSessions) {
    const m = meta.get(session.id)!;
    const children = byParent.get(m.visibleParentId) || [];
    children.push(session);
    byParent.set(m.visibleParentId, children);
  }

  // Sort each group by last_active_at descending
  for (const children of byParent.values()) {
    children.sort((a, b) => b.last_active_at.getTime() - a.last_active_at.getTime());
  }

  const result: OutputRow[] = [];

  function addChildren(parentId: string | null, parentDepth: number): void {
    const children = byParent.get(parentId) || [];
    if (children.length === 0) return;

    const childDepth = parentDepth + 1;

    for (const child of children) {
      // Show gap marker only for children that actually have hidden ancestors
      const childMeta = meta.get(child.id)!;
      if (childMeta.hiddenCount > 0) {
        result.push({
          type: 'gap',
          count: childMeta.hiddenCount,
          depth: childDepth,
        });
      }
      result.push({ type: 'session', session: child, depth: childDepth });
      addChildren(child.id, childDepth);
    }
  }

  // Start with roots (sessions with no visible parent)
  const roots = byParent.get(null) || [];
  for (const root of roots) {
    const rootMeta = meta.get(root.id)!;

    // Check if this "root" is actually an orphan with hidden ancestors
    if (rootMeta.hiddenCount > 0) {
      // Show gap marker at depth 0, but session at depth 1 (as child of hidden ancestors)
      result.push({ type: 'gap', count: rootMeta.hiddenCount, depth: 0 });
      result.push({ type: 'session', session: root, depth: 1 });
      addChildren(root.id, 1);
    } else {
      result.push({ type: 'session', session: root, depth: 0 });
      addChildren(root.id, 0);
    }
  }

  return result;
}

/**
 * Format a gap marker line (indicates hidden ancestors)
 */
function formatGapLine(count: number, depth: number): string {
  const indent = '  '.repeat(depth);
  const label = count === 1 ? '1 hidden' : `${count} hidden`;
  return indent + chalk.dim(`  ⋮ (${label})`);
}

/**
 * Print a table of sessions
 */
export function printSessionTable(sessions: Session[], terminalWidth?: number): void {
  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    return;
  }

  const width = terminalWidth ?? (process.stdout.columns || 80);

  // Measure content and compute layout
  const contentWidths = measureColumns(sessions);
  const layout = computeColumnLayout(contentWidths, width);

  // Reorder so children appear under their parents, with gap markers
  const ordered = orderSessionsWithChildren(sessions);

  // Build header from visible columns
  const headerParts: string[] = [];
  if (layout.visible.has('idName')) {
    headerParts.push('  ' + fixedWidth('ID', layout.id - 2) + fixedWidth('Name', layout.name));
  }
  if (layout.visible.has('status')) {
    headerParts.push(fixedWidth('Status', layout.status));
  }
  if (layout.visible.has('repo')) {
    headerParts.push(fixedWidth('Repo', layout.repo));
  }
  if (layout.visible.has('branch')) {
    headerParts.push(fixedWidth('Worktree/Branch', layout.branch));
  }
  if (layout.visible.has('resources')) {
    headerParts.push(fixedWidth('Resources', layout.resources));
  }
  if (layout.visible.has('time')) {
    headerParts.push('Last Active');
  }

  console.log(chalk.dim(headerParts.join('')));
  console.log(chalk.dim('─'.repeat(layout.totalWidth)));

  for (const row of ordered) {
    if (row.type === 'gap') {
      console.log(formatGapLine(row.count, row.depth));
    } else if (row.type === 'session') {
      console.log(formatSessionLine(row.session, layout, row.depth));
    }
  }
}

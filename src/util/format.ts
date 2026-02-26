/**
 * Output formatting utilities
 */

import chalk from 'chalk';
import { Session } from '../store/schema.js';
import { getClaudeSessionTitles } from '../claude/sessions.js';
import { getAllSessions } from '../store/index.js';
import { getGitHubUsername, matchesUsernamePrefix } from '../detection/github.js';

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
function fixedWidth(str: string, width: number): string {
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

// Column widths (including trailing space)
const COL_ID = 12;
const COL_NAME = 28;
const COL_STATUS = 10;
const COL_REPO = 14;
const COL_RESOURCES = 36;

/**
 * Get repo name from session directory
 * - If in a worktree (path contains .worktrees/), use the original repo's directory name
 * - Otherwise, use the directory's basename
 */
function getRepoName(directory: string): string {
  const worktreeMatch = directory.match(/^(.+)\/\.worktrees\//);
  if (worktreeMatch) {
    // Extract basename of the original repo
    const originalRepo = worktreeMatch[1];
    return originalRepo.split('/').pop() || originalRepo;
  }
  // Just use the directory's basename
  return directory.split('/').pop() || directory;
}

/**
 * Format a session as a single line for list views
 */
export function formatSessionLine(session: Session, depth = 0): string {
  // ID column (with optional tree prefix for child sessions)
  const id = shortId(session.id);
  const indent = '  '.repeat(depth);
  const idCol = depth > 0
    ? indent + chalk.dim('└ ') + chalk.cyan(id) + '  '
    : '  ' + chalk.cyan(id) + '  ';

  // Name column (shrink by indent to maintain alignment)
  const name = getDisplayName(session);
  const nameWidth = COL_NAME - (depth * 2);
  const nameCol = chalk.bold(fixedWidth(name, nameWidth));

  // Status column
  const statusText = session.state;
  const statusPad = ' '.repeat(Math.max(1, COL_STATUS - statusText.length));
  const statusCol = formatStatus(session) + statusPad;

  // Repo column
  const repoName = getRepoName(session.directory);
  const repoCol = chalk.blue(fixedWidth(repoName, COL_REPO));

  // Resources column - build plain text first, then truncate, then colorize
  const resourceParts: string[] = [];
  const displayBranch = session.resources.branch ? abbreviateBranch(session.resources.branch) : '';
  if (displayBranch) {
    resourceParts.push(displayBranch);
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

  // Truncate if needed, then colorize
  let resourceCol: string;
  if (resourceParts.length === 0) {
    resourceCol = chalk.dim(fixedWidth('-', COL_RESOURCES));
  } else {
    const truncated = fixedWidth(resourceText, COL_RESOURCES);
    // Re-colorize the truncated text (simplified: just color the whole thing if branch is primary)
    if (truncated.includes('…')) {
      // Truncated - use magenta for branch-heavy display
      resourceCol = chalk.magenta(truncated);
    } else {
      // Not truncated - apply individual colors
      const coloredParts = [
        displayBranch ? chalk.magenta(displayBranch) : '',
        session.resources.pr ? chalk.green(`#${session.resources.pr.match(/\/pull\/(\d+)/)?.[1]}`) : '',
        session.resources.jira ? chalk.yellow(session.resources.jira) : '',
      ].filter(Boolean).join(' ');
      resourceCol = coloredParts + ' '.repeat(Math.max(0, COL_RESOURCES - displayWidth(resourceText)));
    }
  }

  // Time column
  const timeCol = chalk.dim(relativeTime(session.last_active_at));

  return `${idCol}${nameCol}${statusCol}${repoCol}${resourceCol}${timeCol}`;
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

    // Check if we need a gap marker (first child has hidden ancestors)
    const firstMeta = meta.get(children[0].id)!;
    if (firstMeta.hiddenCount > 0) {
      result.push({
        type: 'gap',
        count: firstMeta.hiddenCount,
        depth: parentDepth + 1,
      });
    }

    const childDepth = parentDepth + 1;

    for (const child of children) {
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
      result.push({ type: 'gap', count: rootMeta.hiddenCount, depth: 0 });
    }

    result.push({ type: 'session', session: root, depth: 0 });
    addChildren(root.id, 0);
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
export function printSessionTable(sessions: Session[]): void {
  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    return;
  }

  // Reorder so children appear under their parents, with gap markers
  const ordered = orderSessionsWithChildren(sessions);

  const totalWidth = COL_ID + COL_NAME + COL_STATUS + COL_REPO + COL_RESOURCES + 10;

  // Header (2-space indent to match data rows)
  console.log(
    chalk.dim(
      '  ' +
        fixedWidth('ID', COL_ID - 2) +
        fixedWidth('Name', COL_NAME) +
        fixedWidth('Status', COL_STATUS) +
        fixedWidth('Repo', COL_REPO) +
        fixedWidth('Resources', COL_RESOURCES) +
        'Last Active'
    )
  );
  console.log(chalk.dim('─'.repeat(totalWidth)));

  for (const row of ordered) {
    if (row.type === 'gap') {
      console.log(formatGapLine(row.count, row.depth));
    } else if (row.type === 'session') {
      console.log(formatSessionLine(row.session, row.depth));
    }
  }
}

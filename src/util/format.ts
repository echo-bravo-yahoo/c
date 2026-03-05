/**
 * Output formatting utilities
 */

import chalk from 'chalk';
import type { Session, SessionState } from '../store/schema.ts';
import { getClaudeSessionTitles, getClaudeSession, listClaudeSessions, readClaudeSessionIndex } from '../claude/sessions.ts';
import { getAllSessions, getSession } from '../store/index.ts';
import { getGitHubUsername, matchesUsernamePrefix } from '../detection/github.ts';
import { getRepoSlug } from '../detection/git.ts';
import { buildJiraUrl } from '../detection/jira.ts';
import { hyperlink } from './hyperlink.ts';
import { computeColumnLayout, ID_FIXED_WIDTH, type ColumnKey, type ColumnLayout } from './layout.ts';

const USER_ICON = '󰇘';

// --- Sort types and logic ---

export interface SortSpec {
  field: string;
  desc: boolean;
}

export interface TableOptions {
  flat?: boolean;
  bottomUp?: boolean;
  sortSpecs?: SortSpec[];
  sizeMap?: Map<string, number>;
}

const STATE_PRIORITY: Record<SessionState, number> = {
  waiting: 0, idle: 1, busy: 2, closed: 3, archived: 4,
};

export function sortSessions(
  sessions: Session[],
  specs: SortSpec[],
  sizeMap?: Map<string, number>
): Session[] {
  return [...sessions].sort((a, b) => {
    for (const { field, desc } of specs) {
      let cmp = 0;
      switch (field) {
        case 'active':  cmp = a.last_active_at.getTime() - b.last_active_at.getTime(); break;
        case 'created': cmp = a.created_at.getTime() - b.created_at.getTime(); break;
        case 'name':    cmp = getDisplayName(a).localeCompare(getDisplayName(b)); break;
        case 'size':    cmp = (sizeMap?.get(a.id) ?? 0) - (sizeMap?.get(b.id) ?? 0); break;
        case 'status':  cmp = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state]; break;
        case 'repo':    cmp = getRepoName(a.directory).localeCompare(getRepoName(b.directory)); break;
      }
      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return 0;
  });
}

// --- Format helpers ---

/**
 * Format a file size in bytes to human-readable form
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
 * Format duration in milliseconds to human-readable form
 */
export function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours < 24) return remainMins ? `${hours}h ${remainMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours ? `${days}d ${remainHours}h` : `${days}d`;
}

/**
 * Get display name for a session
 * Priority: Claude's customTitle > c's name > Claude's summary
 */
export function getDisplayName(session: Session): string {
  // Check Claude's session index for titles
  const { customTitle, summary } = getClaudeSessionTitles(session.id, session.project_key);

  // customTitle = user explicitly renamed via /rename (highest priority)
  if (customTitle) return customTitle;

  // c's name = user explicitly renamed via `c name`
  if (session.name) return session.name;

  // summary = Claude-generated summary
  if (summary) return summary;

  return '';
}

/**
 * Get short ID (first 8 chars)
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Compute the minimum prefix length needed to uniquely identify target among allIds
 */
export function computeUniquePrefixLength(target: string, allIds: string[]): number {
  for (let len = 1; len < target.length; len++) {
    const prefix = target.slice(0, len);
    if (allIds.filter(id => id.startsWith(prefix)).length <= 1) return len;
  }
  return target.length;
}

/**
 * Render an ID with the unique prefix in cyan and the remainder dim
 */
export function highlightId(id: string, prefixLength: number): string {
  return chalk.cyan(id.slice(0, prefixLength)) + chalk.dim(id.slice(prefixLength));
}

/**
 * Pre-compute unique prefix lengths for a list of sessions (keyed by full session ID).
 * When allSessions is provided, uniqueness is computed against that full set
 * so highlighted prefixes remain valid for resolution across the entire store.
 */
export function buildPrefixMap(sessions: Session[], allSessions?: Session[]): Map<string, number> {
  const allShorts = (allSessions ?? sessions).map(s => shortId(s.id));
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.id, computeUniquePrefixLength(shortId(s.id), allShorts));
  }
  return map;
}

/**
 * Calculate visual display width of a string
 * Accounts for surrogate pairs (like 󰇘) that have length 2 but width 1
 * Strips ANSI escape sequences and OSC 8 hyperlink sequences before counting
 */
export function displayWidth(str: string): number {
  // Strip OSC 8 hyperlink sequences: \x1b]8;;URL\x1b\\ ... \x1b]8;;\x1b\\
  const stripped = str.replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, '');
  // Spread handles surrogate pairs correctly (1 visual char = 1 array element)
  return [...stripped].length;
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
export function measureColumns(sessions: Session[], sizeMap?: Map<string, number>): Map<ColumnKey, number> {
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

    // size
    if (sizeMap) {
      const fileSize = sizeMap.get(session.id);
      if (fileSize != null) {
        const sizeWidth = formatFileSize(fileSize).length + 1;
        widths.set('size', Math.max(widths.get('size') ?? 0, sizeWidth));
      }
    }

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
export function formatSessionLine(session: Session, layout: ColumnLayout, depth = 0, prefixMap?: Map<string, number>, repoSlug?: string, sizeMap?: Map<string, number>, bottomUp?: boolean): string {
  const parts: string[] = [];

  // ID column (always visible when idName is visible)
  if (layout.visible.has('idName')) {
    const id = shortId(session.id);
    const prefixLen = prefixMap?.get(session.id) ?? id.length;
    const styledId = highlightId(id, prefixLen);
    const indent = '  '.repeat(depth);
    const connector = bottomUp ? '┌' : '└';
    const idCol = depth > 0
      ? indent + chalk.dim(connector + ' ') + styledId + '  '
      : '  ' + styledId + '  ';
    parts.push(idCol);

    // Name column (shrink by indent to maintain alignment)
    const name = getDisplayName(session);
    const nameWidth = layout.name - (depth * 2);
    const nameCol = name
      ? chalk.whiteBright(fixedWidth(name, nameWidth))
      : chalk.dim(fixedWidth(name, nameWidth));
    parts.push(nameCol);
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
    const repoFixed = fixedWidth(repoName, layout.repo);
    const repoText = repoSlug
      ? hyperlink(`https://github.com/${repoSlug}`, repoFixed)
      : repoFixed;
    parts.push(chalk.blue(repoText));
  }

  // Worktree/Branch column
  if (layout.visible.has('branch')) {
    const branch = getBranchDisplay(session);
    const branchFixed = fixedWidth(branch.text, layout.branch);
    const branchFormatted = (branch.text && repoSlug && session.resources.branch)
      ? hyperlink(`https://github.com/${repoSlug}/tree/${session.resources.branch}`, branchFixed)
      : branchFixed;
    const branchCol = branch.color === 'dim'
      ? chalk.dim(branchFormatted)
      : chalk[branch.color](branchFormatted);
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
          prNum ? chalk.green(hyperlink(session.resources.pr!, `#${prNum}`)) : '',
          session.resources.jira ? chalk.yellow(hyperlink(buildJiraUrl(session.resources.jira), session.resources.jira)) : '',
          session.tags.values.length > 0 ? chalk.cyan(session.tags.values[0]) : '',
        ].filter(Boolean).join(' ');
        resourceCol = coloredParts + ' '.repeat(Math.max(0, layout.resources - displayWidth(resourceText)));
      }
    }
    parts.push(resourceCol);
  }

  // Size column
  if (layout.visible.has('size') && sizeMap) {
    const fileSize = sizeMap.get(session.id);
    if (fileSize != null) {
      const sizeText = formatFileSize(fileSize);
      parts.push(chalk.dim(fixedWidth(sizeText, layout.size)));
    } else {
      parts.push(fixedWidth('', layout.size));
    }
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
  const allSessions = getAllSessions();
  const allShortIds = allSessions.map(s => shortId(s.id));
  if (session.parent_session_id) {
    const parent = getSession(session.parent_session_id);
    const parentShort = shortId(session.parent_session_id);
    const prefixLen = computeUniquePrefixLength(parentShort, allShortIds);
    const parentId = highlightId(parentShort, prefixLen);
    const parentLabel = parent
      ? `${parentId} ${getDisplayName(parent)} (${parent.state})`
      : parentId;
    lines.push(chalk.dim('  Parent: ') + parentLabel);
  }
  const children = allSessions.filter(s => s.parent_session_id === session.id);
  if (children.length > 0) {
    lines.push(chalk.dim('  Children: ') + children.map(c => {
      const cShort = shortId(c.id);
      const cPrefix = computeUniquePrefixLength(cShort, allShortIds);
      return `${highlightId(cShort, cPrefix)} ${getDisplayName(c)}`;
    }).join(', '));
  }
  lines.push('');
  lines.push(chalk.bold('Status: ') + formatStatus(session));
  lines.push(chalk.dim('  Directory: ') + hyperlink(`file://${session.directory}`, session.directory));
  lines.push(chalk.dim('  PID: ') + (session.pid != null ? String(session.pid) : '–'));
  lines.push(chalk.dim('  Pane: ') + (session.resources.tmux_pane ?? '–'));
  lines.push(chalk.dim('  Created: ') + session.created_at.toLocaleString());
  lines.push(chalk.dim('  Last active: ') + session.last_active_at.toLocaleString());

  // Duration
  const duration = session.last_active_at.getTime() - session.created_at.getTime();
  lines.push(chalk.dim('  Duration: ') + formatDuration(duration));

  const claudeSession = getClaudeSession(session.id);
  if (claudeSession) {
    lines.push(chalk.dim('  Session size: ') + formatFileSize(claudeSession.fileSize));
  }

  // Message count and first prompt from Claude's index
  const claudeIndex = readClaudeSessionIndex(session.project_key);
  const indexEntry = claudeIndex?.entries.find(e => e.sessionId === session.id);
  if (indexEntry?.messageCount) {
    lines.push(chalk.dim('  Messages: ') + String(indexEntry.messageCount));
  }
  if (!session.name && indexEntry?.firstPrompt) {
    lines.push(chalk.dim(`  "${indexEntry.firstPrompt.slice(0, 80)}"`));
  }

  // Resources
  lines.push('');
  lines.push(chalk.bold('Resources:'));
  const slug = getRepoSlug(session.directory);
  if (session.resources.branch) {
    const branchDisplay = abbreviateBranch(session.resources.branch);
    const branchLinked = slug
      ? hyperlink(`https://github.com/${slug}/tree/${session.resources.branch}`, branchDisplay)
      : branchDisplay;
    lines.push('  Branch: ' + chalk.magenta(branchLinked));
  }
  if (session.resources.worktree) {
    lines.push('  Worktree: ' + session.resources.worktree);
  }
  if (session.resources.pr) {
    lines.push('  PR: ' + chalk.green(hyperlink(session.resources.pr, session.resources.pr)));
  }
  if (session.resources.jira) {
    lines.push('  JIRA: ' + chalk.yellow(hyperlink(buildJiraUrl(session.resources.jira), session.resources.jira)));
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
function orderSessionsWithChildren(visibleSessions: Session[], options?: TableOptions): OutputRow[] {
  const bottomUp = options?.bottomUp ?? false;

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

  // Sort each group: use provided sort specs or default to last_active_at desc
  if (options?.sortSpecs) {
    for (const children of byParent.values()) {
      children.splice(0, children.length, ...sortSessions(children, options.sortSpecs, options.sizeMap));
    }
  } else {
    for (const children of byParent.values()) {
      children.sort((a, b) => b.last_active_at.getTime() - a.last_active_at.getTime());
    }
  }

  const result: OutputRow[] = [];

  function addChildren(parentId: string | null, parentDepth: number): void {
    const children = byParent.get(parentId) || [];
    if (children.length === 0) return;

    const childDepth = parentDepth + 1;

    for (const child of children) {
      const childMeta = meta.get(child.id)!;

      // In bottom-up: recurse first (deepest children first)
      if (bottomUp) addChildren(child.id, childDepth);

      if (childMeta.hiddenCount > 0) {
        result.push({
          type: 'gap',
          count: childMeta.hiddenCount,
          depth: childDepth,
        });
      }
      result.push({ type: 'session', session: child, depth: childDepth });

      // In top-down (default): recurse after
      if (!bottomUp) addChildren(child.id, childDepth);
    }
  }

  // Start with roots (sessions with no visible parent)
  const roots = byParent.get(null) || [];
  for (const root of roots) {
    const rootMeta = meta.get(root.id)!;

    if (rootMeta.hiddenCount > 0) {
      if (bottomUp) {
        addChildren(root.id, 1);
        result.push({ type: 'gap', count: rootMeta.hiddenCount, depth: 0 });
        result.push({ type: 'session', session: root, depth: 1 });
      } else {
        result.push({ type: 'gap', count: rootMeta.hiddenCount, depth: 0 });
        result.push({ type: 'session', session: root, depth: 1 });
        addChildren(root.id, 1);
      }
    } else {
      if (bottomUp) {
        addChildren(root.id, 0);
        result.push({ type: 'session', session: root, depth: 0 });
      } else {
        result.push({ type: 'session', session: root, depth: 0 });
        addChildren(root.id, 0);
      }
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
export function printSessionTable(sessions: Session[], terminalWidth?: number, allSessions?: Session[], options?: TableOptions): void {
  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    return;
  }

  const width = terminalWidth ?? (process.stdout.columns || 80);

  // Pre-compute unique prefix lengths for ID highlighting
  const prefixMap = buildPrefixMap(sessions, allSessions);

  // Build size map from Claude's session files
  const sizeMap = new Map<string, number>();
  const claudeSessions = listClaudeSessions();
  for (const cs of claudeSessions) {
    sizeMap.set(cs.id, cs.fileSize);
  }

  // Apply sorting before ordering
  let sortedSessions = sessions;
  if (options?.sortSpecs) {
    sortedSessions = sortSessions(sessions, options.sortSpecs, sizeMap);
  }

  // Reorder so children appear under their parents, with gap markers
  const ordered = options?.flat
    ? sortedSessions.map(s => ({ type: 'session' as const, session: s, depth: 0 }))
    : orderSessionsWithChildren(sortedSessions, { ...options, sizeMap });

  // Measure content and compute layout, accounting for nesting depth
  const contentWidths = measureColumns(sessions, sizeMap);
  for (const row of ordered) {
    if (row.type !== 'session') continue;
    const nameLen = displayWidth(getDisplayName(row.session));
    const idNameWidth = ID_FIXED_WIDTH + nameLen + 1 + row.depth * 2;
    contentWidths.set('idName', Math.max(contentWidths.get('idName') ?? 0, idNameWidth));
  }
  const layout = computeColumnLayout(contentWidths, width);

  // Build header from visible columns
  const headerParts: string[] = [];
  if (layout.visible.has('idName')) {
    headerParts.push('  ' + fixedWidth('ID', layout.id - 2) + fixedWidth('Name', layout.name));
  }
  if (layout.visible.has('status')) {
    headerParts.push(fixedWidth('State', layout.status));
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
  if (layout.visible.has('size')) {
    headerParts.push(fixedWidth('Size', layout.size));
  }
  if (layout.visible.has('time')) {
    headerParts.push('Last Active');
  }

  console.log(chalk.dim(headerParts.join('')));
  console.log(chalk.dim('─'.repeat(layout.totalWidth)));

  // Cache repo slugs by directory to avoid repeated git calls
  const slugCache = new Map<string, string | undefined>();
  function getSlug(dir: string): string | undefined {
    if (!slugCache.has(dir)) slugCache.set(dir, getRepoSlug(dir));
    return slugCache.get(dir);
  }

  const bottomUp = options?.bottomUp ?? false;
  for (const row of ordered) {
    if (row.type === 'gap') {
      console.log(formatGapLine(row.count, row.depth));
    } else if (row.type === 'session') {
      console.log(formatSessionLine(row.session, layout, row.depth, prefixMap, getSlug(row.session.directory), sizeMap, bottomUp));
    }
  }
}

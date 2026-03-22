/**
 * c list - list sessions
 */

import chalk from 'chalk';
import { getSessions, getAllSessions, reconcileStaleSessions } from '../store/index.ts';
import { printSessionTable, getDisplayName, shortId, highlightId, buildPrefixMap, getRepoName, relativeTime, sortSessions } from '../util/format.ts';
import { hyperlink } from '../util/hyperlink.ts';
import { buildJiraUrl } from '../detection/jira.ts';
import type { SessionState } from '../store/schema.ts';
import type { SortSpec, TableOptions } from '../util/format.ts';
import { loadConfig, mergeOptions } from '../config.ts';

export interface ListOptions {
  state?: string;
  prs?: boolean;
  jira?: boolean;
  repos?: boolean;
  directory?: string;
  branch?: string;
  repo?: string;
  tag?: string;
  name?: string;
  worktree?: string;
  sort?: string;
  flat?: boolean;
  bottomUp?: boolean;
  json?: boolean;
  minWidth?: number;
  maxWidth?: number;
}

const DEFAULT_STATES: SessionState[] = ['busy', 'idle', 'waiting', 'closed'];
const ALL_STATES: SessionState[] = ['busy', 'idle', 'waiting', 'closed', 'archived'];

// Default direction per field: true = desc
const DEFAULT_DESC: Record<string, boolean> = {
  active: true, created: true, size: true,
  name: false, status: false, repo: false,
};

export function parseSortSpecs(raw: string): SortSpec[] {
  return raw.split(',').map(s => {
    const hasExplicitPrefix = s.startsWith('-') || s.startsWith('+');
    const desc = s.startsWith('-');
    const field = hasExplicitPrefix ? s.slice(1) : s;
    return {
      field,
      desc: hasExplicitPrefix ? desc : (DEFAULT_DESC[field] ?? false),
    };
  });
}

export async function listCommand(rawOptions: ListOptions): Promise<void> {
  const config = loadConfig();
  const options = mergeOptions(config.list, rawOptions);

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
  if (options.repos) {
    listRepos(options);
    return;
  }

  const stateFilter: SessionState[] = options.state
    ? (options.state === 'all' ? ALL_STATES : options.state.split(',') as SessionState[])
    : DEFAULT_STATES;

  let sessions = getSessions({
    state: stateFilter,
  });

  // Post-filters
  if (options.directory) {
    const home = process.env.HOME || '';
    const expanded = home ? options.directory.replace(/^~(?=$|\/)/, home) : options.directory;
    const q = expanded.toLowerCase();
    sessions = sessions.filter(s => s.directory.toLowerCase().includes(q));
  }
  if (options.branch) {
    const q = options.branch.toLowerCase();
    sessions = sessions.filter(s => s.resources.branch?.toLowerCase().includes(q));
  }
  if (options.repo) {
    const q = options.repo.toLowerCase();
    sessions = sessions.filter(s => getRepoName(s.directory).toLowerCase().includes(q));
  }
  if (options.tag) {
    sessions = sessions.filter(s => s.tags.values.includes(options.tag!));
  }
  if (options.name) {
    const q = options.name.toLowerCase();
    sessions = sessions.filter(s => getDisplayName(s).toLowerCase().includes(q));
  }
  if (options.worktree) {
    const q = options.worktree.toLowerCase();
    sessions = sessions.filter(s => s.resources.worktree?.toLowerCase().includes(q));
  }

  // Parse sort specs
  const sortSpecs = options.sort ? parseSortSpecs(options.sort) : undefined;

  // JSON output
  if (options.json) {
    // Apply sorting for JSON output too
    let sorted = sessions;
    if (sortSpecs) {
      sorted = sortSessions(sessions, sortSpecs);
    }
    const output = sorted.map(s => ({
      ...s,
      created_at: s.created_at.toISOString(),
      last_active_at: s.last_active_at.toISOString(),
    }));
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }

  let terminalWidth = process.stdout.columns || 80;
  if (options.minWidth != null) terminalWidth = Math.max(terminalWidth, options.minWidth);
  if (options.maxWidth != null) terminalWidth = Math.min(terminalWidth, options.maxWidth);

  const tableOptions: TableOptions = {
    flat: options.flat,
    bottomUp: options.bottomUp,
    sortSpecs,
    skipTranscript: true,
  };

  printSessionTable(sessions, terminalWidth, getAllSessions(), tableOptions);
}

// --- Special views ---

function listPRs(): void {
  const sessions = getSessions({
    state: ALL_STATES,
  });

  const withPRs = sessions.filter((s) => s.resources.pr);

  if (withPRs.length === 0) {
    console.log(chalk.dim('No PRs linked to sessions.'));
    return;
  }

  const prefixMap = buildPrefixMap(withPRs, getAllSessions());

  console.log(chalk.dim('Session'.padEnd(30) + 'PR'));
  console.log(chalk.dim('─'.repeat(70)));

  for (const session of withPRs) {
    const name = getDisplayName(session);
    const prNum = session.resources.pr!.match(/\/pull\/(\d+)/)?.[1];
    const prDisplay = prNum
      ? chalk.green(hyperlink(session.resources.pr!, `#${prNum}`))
      : hyperlink(session.resources.pr!, session.resources.pr!);
    const id = shortId(session.id);

    console.log(
      highlightId(id, prefixMap.get(session.id) ?? id.length) +
        '  ' +
        name.padEnd(20) +
        '  ' +
        prDisplay +
        '  ' +
        chalk.dim(hyperlink(session.resources.pr!, session.resources.pr!))
    );
  }
}

function listJira(): void {
  const sessions = getSessions({
    state: ALL_STATES,
  });

  const withJira = sessions.filter((s) => s.resources.jira);

  if (withJira.length === 0) {
    console.log(chalk.dim('No JIRA tickets linked to sessions.'));
    return;
  }

  const prefixMap = buildPrefixMap(withJira, getAllSessions());

  console.log(chalk.dim('Session'.padEnd(30) + 'JIRA'));
  console.log(chalk.dim('─'.repeat(60)));

  for (const session of withJira) {
    const name = getDisplayName(session);
    const id = shortId(session.id);

    console.log(
      highlightId(id, prefixMap.get(session.id) ?? id.length) +
        '  ' +
        name.padEnd(20) +
        '  ' +
        chalk.yellow(hyperlink(buildJiraUrl(session.resources.jira!), session.resources.jira!))
    );
  }
}

function listRepos(options: ListOptions): void {
  const stateFilter: SessionState[] = options.state
    ? (options.state === 'all' ? ALL_STATES : options.state.split(',') as SessionState[])
    : DEFAULT_STATES;

  const sessions = getSessions({ state: stateFilter });

  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions.'));
    return;
  }

  // Group by repo root (collapse worktrees into their parent repo)
  const repos = new Map<string, { name: string; directory: string; total: number; active: number; lastActive: Date }>();

  for (const s of sessions) {
    const name = getRepoName(s.directory);
    // Resolve worktree paths to their parent repo directory
    const worktreeMatch = s.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
    const key = worktreeMatch ? worktreeMatch[1] : s.directory;
    const existing = repos.get(key);
    const isActive = ['busy', 'idle', 'waiting'].includes(s.state);

    if (existing) {
      existing.total++;
      if (isActive) existing.active++;
      if (s.last_active_at > existing.lastActive) existing.lastActive = s.last_active_at;
    } else {
      repos.set(key, {
        name,
        directory: key,
        total: 1,
        active: isActive ? 1 : 0,
        lastActive: s.last_active_at,
      });
    }
  }

  const sorted = [...repos.values()].sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());

  if (options.json) {
    const output = sorted.map(r => ({
      name: r.name,
      directory: r.directory,
      active: r.active,
      total: r.total,
      last_active_at: r.lastActive.toISOString(),
    }));
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }

  for (const repo of sorted) {
    const counts = repo.active
      ? `${repo.active} active, ${repo.total} total`
      : `${repo.total} total`;
    const ago = relativeTime(repo.lastActive);
    console.log(`${chalk.bold(repo.name)}  ${chalk.dim(counts)}  ${chalk.dim(ago)}`);
    console.log(`  ${chalk.dim(repo.directory)}`);
  }
}

export { sortSessions };

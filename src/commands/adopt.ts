/**
 * c adopt <session-id> - promote an ephemeral session to tracked
 */

import chalk from 'chalk';
import { getSession, updateIndex } from '../store/index.ts';
import { createSession } from '../store/schema.ts';
import { getClaudeSession, getClaudeSessionTitles, getClaudeSessionsForDirectory } from '../claude/sessions.ts';
import { getCurrentBranch, getWorktreeInfo, getRepoSlug } from '../detection/git.ts';
import { extractJiraFromBranch } from '../detection/jira.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';
import { writeStatusCache } from '../store/status-cache.ts';
import type { StatusCacheData } from '../store/status-cache.ts';
import type { Session } from '../store/schema.ts';
import type { ClaudeSession } from '../claude/sessions.ts';
import { shortId } from '../util/format.ts';

export interface AdoptOptions {
  name?: string;
  json?: boolean;
  allHere?: boolean;
}

async function adoptOne(claudeSession: ClaudeSession, options: AdoptOptions): Promise<Session> {
  const cwd = claudeSession.directory;
  const { id, projectKey } = claudeSession;

  const session = createSession(id, cwd, projectKey, claudeSession.modifiedAt);
  session.state = 'busy';

  if (options.name) session.name = options.name;

  // Git detection
  const branch = getCurrentBranch(cwd);
  if (branch) {
    session.resources.branch = branch;
    const jira = extractJiraFromBranch(branch);
    if (jira) session.resources.jira = jira;
  }

  const worktree = getWorktreeInfo(cwd);
  if (worktree) session.resources.worktree = worktree.name;

  if (process.env.TMUX_PANE) session.resources.tmux_pane = process.env.TMUX_PANE;

  const { customTitle } = getClaudeSessionTitles(id, projectKey);
  if (customTitle) session.meta._custom_title = customTitle;

  await updateIndex((index) => {
    index.sessions[session.id] = session;
  });

  const displayTitle = customTitle || options.name || shortId(id);
  setTmuxPaneTitle(displayTitle, session.resources.tmux_pane);

  const repo = getRepoSlug(cwd);
  const cache: StatusCacheData = {
    branch: session.resources.branch,
    repo,
    jira: session.resources.jira,
    jira_base: session.resources.jira ? 'https://machinify.atlassian.net' : undefined,
    worktree: session.resources.worktree,
    worktree_path: worktree?.path,
    name: session.name || undefined,
    state: session.state,
  };
  writeStatusCache(session.id, cache);

  return session;
}

export async function adoptCommand(sessionId: string | undefined, options: AdoptOptions = {}): Promise<void> {
  // Validate mutually exclusive options
  if (options.allHere && sessionId) {
    console.error(chalk.red('--all-here cannot be combined with a session ID.'));
    process.exit(1);
  }
  if (options.allHere && options.name) {
    console.error(chalk.red('--all-here cannot be combined with --name.'));
    process.exit(1);
  }
  if (!options.allHere && !sessionId) {
    console.error(chalk.red('Provide a session ID or use --all-here.'));
    process.exit(1);
  }

  if (options.allHere) {
    const cwd = process.cwd();
    const candidates = getClaudeSessionsForDirectory(cwd);
    const untracked = candidates.filter((s) => !getSession(s.id));

    if (untracked.length === 0) {
      console.log(chalk.dim('No untracked sessions found in current directory.'));
      return;
    }

    const adopted: Session[] = [];
    for (const cs of untracked) {
      const session = await adoptOne(cs, options);
      adopted.push(session);
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(adopted.map((s) => ({
        ...s,
        created_at: s.created_at.toISOString(),
        last_active_at: s.last_active_at.toISOString(),
      }))) + '\n');
      return;
    }

    for (const s of adopted) {
      console.log(chalk.green(`Adopted session ${shortId(s.id)}.`));
    }
    return;
  }

  // Single-session path
  const existing = getSession(sessionId!);
  if (existing) {
    console.error(chalk.red(`Session ${shortId(sessionId!)} is already tracked.`));
    process.exit(1);
  }

  const claudeSession = getClaudeSession(sessionId!);
  if (!claudeSession) {
    console.error(chalk.red(`Session not found in Claude's storage: ${sessionId}`));
    process.exit(1);
  }

  const session = await adoptOne(claudeSession, options);

  if (options.json) {
    process.stdout.write(JSON.stringify({
      ...session,
      created_at: session.created_at.toISOString(),
      last_active_at: session.last_active_at.toISOString(),
    }, null, 2) + '\n');
    return;
  }

  console.log(chalk.green(`Adopted session ${shortId(session.id)}.`));
}

/**
 * c adopt <session-id> - promote an ephemeral session to tracked
 */

import chalk from 'chalk';
import { getSession, updateIndex } from '../store/index.ts';
import { createSession } from '../store/schema.ts';
import { getClaudeSession, getClaudeSessionTitles } from '../claude/sessions.ts';
import { getCurrentBranch, getWorktreeInfo } from '../detection/git.ts';
import { extractJiraFromBranch } from '../detection/jira.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';
import { writeStatusCache } from '../store/status-cache.ts';
import { getRepoSlug } from '../detection/git.ts';
import type { StatusCacheData } from '../store/status-cache.ts';
import { shortId } from '../util/format.ts';

export interface AdoptOptions {
  name?: string;
  json?: boolean;
}

export async function adoptCommand(sessionId: string, options?: AdoptOptions): Promise<void> {
  // Check if already tracked
  const existing = getSession(sessionId);
  if (existing) {
    console.error(chalk.red(`Session ${shortId(sessionId)} is already tracked.`));
    process.exit(1);
  }

  // Find in Claude's storage
  const claudeSession = getClaudeSession(sessionId);
  if (!claudeSession) {
    console.error(chalk.red(`Session not found in Claude's storage: ${sessionId}`));
    process.exit(1);
  }

  const cwd = claudeSession.directory;
  const projectKey = claudeSession.projectKey;

  // Create index entry
  const session = createSession(claudeSession.id, cwd, projectKey, claudeSession.modifiedAt);
  session.state = 'busy';

  // Set name
  if (options?.name) {
    session.name = options.name;
  }

  // Git detection
  const branch = getCurrentBranch(cwd);
  if (branch) {
    session.resources.branch = branch;
    const jira = extractJiraFromBranch(branch);
    if (jira) session.resources.jira = jira;
  }

  const worktree = getWorktreeInfo(cwd);
  if (worktree) {
    session.resources.worktree = worktree.name;
  }

  // Store tmux pane
  if (process.env.TMUX_PANE) {
    session.resources.tmux_pane = process.env.TMUX_PANE;
  }

  // Read custom title from Claude's index
  const { customTitle } = getClaudeSessionTitles(claudeSession.id, projectKey);
  if (customTitle) {
    session.meta._custom_title = customTitle;
  }

  // Save to index
  await updateIndex((index) => {
    index.sessions[session.id] = session;
  });

  // Set tmux pane title
  const displayTitle = customTitle || options?.name || shortId(session.id);
  setTmuxPaneTitle(displayTitle, session.resources.tmux_pane);

  // Write status cache
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

  if (options?.json) {
    process.stdout.write(JSON.stringify({
      ...session,
      created_at: session.created_at.toISOString(),
      last_active_at: session.last_active_at.toISOString(),
    }, null, 2) + '\n');
    return;
  }

  console.log(chalk.green(`Adopted session ${shortId(session.id)}.`));
}

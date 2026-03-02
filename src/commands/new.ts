/**
 * Create a new Claude session with optional name and metadata
 */

import { randomUUID } from 'node:crypto';
import chalk from 'chalk';
import { updateIndex } from '../store/index.js';
import { createSession } from '../store/schema.js';
import { encodeProjectKey } from '../claude/sessions.js';
import { shortId } from '../util/format.js';
import { execReplace, setTmuxPaneTitle } from '../util/exec.js';
import { getGitRoot } from '../detection/git.js';

export interface NewOptions {
  jira?: string;
  pr?: string;
  branch?: string;
  note?: string;
  meta?: string[];
  noWorktree?: boolean;
  model?: string;
  permissionMode?: string;
  effort?: string;
  agent?: string;
  passthroughArgs?: string[];
}

export async function newCommand(name: string | undefined, options: NewOptions): Promise<void> {
  const sessionId = randomUUID();
  const cwd = process.cwd();
  const projectKey = encodeProjectKey(cwd);

  const session = createSession(sessionId, cwd, projectKey);
  if (name) session.name = name;

  // Populate resources
  if (options.jira) session.resources.jira = options.jira;
  if (options.pr) session.resources.pr = options.pr;
  if (options.branch) session.resources.branch = options.branch;

  const inGitRepo = !!getGitRoot(cwd);
  const useWorktree = name && !options.noWorktree && inGitRepo;

  if (useWorktree) {
    session.resources.worktree = name;
  } else if (name && !options.noWorktree && !inGitRepo) {
    console.log(chalk.dim('Not in a git repository. Skipping worktree creation.'));
  }

  // Populate meta
  if (options.note) session.meta.note = options.note;
  if (options.meta) {
    for (const kv of options.meta) {
      const eq = kv.indexOf('=');
      if (eq !== -1) {
        session.meta[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    }
  }

  // Save to c's index
  await updateIndex((index) => {
    index.sessions[sessionId] = session;
    index.sessions[sessionId].pid = process.pid;
    if (process.env.TMUX_PANE) {
      index.sessions[sessionId].resources.tmux_pane = process.env.TMUX_PANE;
    }
  });

  const displayName = name || shortId(sessionId);
  console.log(chalk.dim(`Starting session: ${displayName}.`));
  setTmuxPaneTitle(displayName);

  const args = ['--session-id', sessionId];
  if (useWorktree) {
    args.push('--worktree', name);
  }
  if (options.model) args.push('--model', options.model);
  if (options.permissionMode) args.push('--permission-mode', options.permissionMode);
  if (options.effort) args.push('--effort', options.effort);
  if (options.agent) args.push('--agent', options.agent);
  if (options.passthroughArgs) args.push(...options.passthroughArgs);

  let exitCode: number;
  try {
    exitCode = await execReplace('claude', args, { cwd });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to launch Claude: ${msg}.`));
    process.exit(1);
  }
  process.exit(exitCode);
}

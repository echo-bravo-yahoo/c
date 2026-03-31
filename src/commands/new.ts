/**
 * Create a new Claude session with optional name and metadata
 */

import { randomUUID } from 'node:crypto';
import chalk from 'chalk';
import { updateIndex } from '../store/index.ts';
import { createSession } from '../store/schema.ts';
import { encodeProjectKey } from '../claude/sessions.ts';
import { shortId } from '../util/format.ts';
import { execReplace, setTmuxPaneTitle } from '../util/exec.ts';
import { getGitRoot, hasCommits } from '../detection/git.ts';
import { sanitizeWorktreeName } from '../util/sanitize.ts';
import type { SessionMeta } from '../store/schema.ts';

export interface NewOptions {
  jira?: string;
  pr?: string;
  branch?: string;
  note?: string;
  meta?: string[];
  noWorktree?: boolean;
  ephemeral?: boolean;
  model?: string;
  permissionMode?: string;
  effort?: string;
  agent?: string;
  passthroughArgs?: string[];
}

/**
 * Parse --meta key=value pairs and --note into a SessionMeta object.
 */
export function parseMeta(meta: string[] | undefined, note: string | undefined): SessionMeta {
  const result: SessionMeta = {};
  if (note) result.note = note;
  if (meta) {
    for (const kv of meta) {
      const eq = kv.indexOf('=');
      if (eq !== -1) {
        result[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    }
  }
  return result;
}

/**
 * Determine whether to use a worktree and compute the sanitized name.
 */
export function resolveWorktreeConfig(
  name: string | undefined,
  noWorktree: boolean,
  cwd: string
): { useWorktree: boolean; worktreeName: string | undefined } {
  const inGitRepo = !!getGitRoot(cwd);
  const repoHasCommits = inGitRepo && hasCommits(cwd);
  const useWorktree = !!(name && !noWorktree && repoHasCommits);
  const worktreeName = useWorktree ? sanitizeWorktreeName(name!) : undefined;
  return { useWorktree, worktreeName };
}

/**
 * Build the Claude CLI argument array for a new session.
 */
export function buildNewArgs(
  sessionId: string,
  useWorktree: boolean,
  worktreeName: string | undefined,
  options: Pick<NewOptions, 'model' | 'permissionMode' | 'effort' | 'agent' | 'passthroughArgs'>
): string[] {
  const args = ['--session-id', sessionId];
  if (useWorktree && worktreeName) {
    args.push('--worktree', worktreeName);
  }
  if (options.model) args.push('--model', options.model);
  if (options.permissionMode) args.push('--permission-mode', options.permissionMode);
  if (options.effort) args.push('--effort', options.effort);
  if (options.agent) args.push('--agent', options.agent);
  if (options.passthroughArgs) args.push(...options.passthroughArgs);
  return args;
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

  const { useWorktree, worktreeName } = resolveWorktreeConfig(name, !!options.noWorktree || !!options.ephemeral, cwd);

  if (useWorktree && !worktreeName) {
    console.error(chalk.red(`Name "${name}" cannot be used as a worktree name. Use --no-worktree or choose a different name.`));
    process.exit(1);
  }

  if (useWorktree) {
    session.resources.worktree = worktreeName;
  } else if (name && !options.noWorktree && !getGitRoot(cwd)) {
    console.log(chalk.dim('Not in a git repository. Skipping worktree creation.'));
  } else if (name && !options.noWorktree && !hasCommits(cwd)) {
    console.log(chalk.dim('Repository has no commits. Skipping worktree creation.'));
  }

  // Populate meta
  const meta = parseMeta(options.meta, options.note);
  Object.assign(session.meta, meta);

  // Save to c's index (skip for ephemeral sessions)
  if (!options.ephemeral) {
    await updateIndex((index) => {
      index.sessions[sessionId] = session;
      index.sessions[sessionId].pid = process.pid;
      if (process.env.TMUX_PANE) {
        index.sessions[sessionId].resources.tmux_pane = process.env.TMUX_PANE;
      }
    });
  }

  const displayName = name || shortId(sessionId);
  const label = options.ephemeral ? 'ephemeral session' : `session: ${displayName}`;
  console.log(chalk.dim(`Starting ${label}.`));
  setTmuxPaneTitle(displayName);

  const args = buildNewArgs(sessionId, useWorktree, worktreeName, options);

  if (options.ephemeral) {
    process.env.C_EPHEMERAL = '1';
  }

  let exitCode: number;
  try {
    exitCode = await execReplace('claude', args, { cwd });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to launch Claude: ${msg}.`));
    if (!options.ephemeral) {
      await updateIndex((index) => {
        delete index.sessions[sessionId];
      });
    }
    process.exit(1);
  }
  if (exitCode !== 0 && !options.ephemeral) {
    await updateIndex((index) => {
      delete index.sessions[sessionId];
    });
  }
  process.exit(exitCode);
}

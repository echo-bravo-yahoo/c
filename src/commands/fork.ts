/**
 * c fork <id> - fork a session (new ID with copied transcript)
 */

import chalk from 'chalk';
import { getClaudeSession } from '../claude/sessions.ts';
import { spawnInteractive, setTmuxPaneTitle } from '../util/exec.ts';
import { getDisplayName, shortId } from '../util/format.ts';
import { resolveSessionForResume, buildResumeArgs } from './resume.ts';
import type { ResumeOptions } from './resume.ts';

export interface ForkOptions {
  name?: string;
  worktree?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  agent?: string;
  passthroughArgs?: string[];
}

export async function forkCommand(idOrPrefix: string, options: ForkOptions = {}): Promise<void> {
  const session = await resolveSessionForResume(idOrPrefix);
  if (!session) return;

  const displayName = getDisplayName(session);

  // Verify session exists in Claude's storage
  const claudeSession = getClaudeSession(session.id);
  if (!claudeSession) {
    console.error(chalk.red(`Session ${displayName || shortId(session.id)} no longer exists in Claude's storage.`));
    process.exit(1);
  }

  const cwd = session.directory;

  // Set fork parent env var so session-start hook registers the forked session
  process.env.C_FORK_PARENT = session.id;

  const resumeOpts: ResumeOptions = {
    forkSession: true,
    model: options.model,
    permissionMode: options.permissionMode,
    effort: options.effort,
    agent: options.agent,
    passthroughArgs: options.passthroughArgs,
  };
  const args = buildResumeArgs(session.id, resumeOpts);

  console.log(chalk.dim(`Forking session ${displayName || shortId(session.id)}...`));
  if (displayName) setTmuxPaneTitle(`${displayName} (fork)`);

  let exitCode: number;
  try {
    exitCode = await spawnInteractive('claude', args, { cwd });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to launch Claude: ${msg}.`));
    delete process.env.C_FORK_PARENT;
    process.exit(1);
  }

  delete process.env.C_FORK_PARENT;

  // Restore parent session title on tmux pane after fork exits
  if (displayName) setTmuxPaneTitle(displayName);

  process.exit(exitCode);
}

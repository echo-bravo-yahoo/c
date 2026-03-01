/**
 * c resume <id> - resume a Claude session
 */

import { existsSync } from 'node:fs';
import chalk from 'chalk';
import { getSession, findSessions, findSessionsByName, updateIndex } from '../store/index.js';
import { getClaudeSession, findClaudeSessionIdsByTitle } from '../claude/sessions.js';
import { spawnInteractive, setTmuxPaneTitle } from '../util/exec.js';
import { getDisplayName, shortId, highlightId } from '../util/format.js';
import { getGitRoot } from '../detection/git.js';

export interface ResumeOptions {
  model?: string;
  permissionMode?: string;
  effort?: string;
  agent?: string;
  forkSession?: boolean;
  worktree?: string | true;
  passthroughArgs?: string[];
}

export async function resumeCommand(idOrPrefix: string, options: ResumeOptions = {}): Promise<void> {
  let session = getSession(idOrPrefix);

  if (!session) {
    // Try exact name match in c's store
    const nameMatches = findSessionsByName(idOrPrefix);
    if (nameMatches.length === 1) {
      session = nameMatches[0];
    } else if (nameMatches.length >= 2) {
      const ids = nameMatches.map(m => shortId(m.id));
      console.error(chalk.red(`Multiple sessions named "${idOrPrefix}": ${ids.join(', ')}.`));
      process.exit(1);
    }

    // Try Claude's customTitle fallback
    if (!session) {
      const claudeIds = findClaudeSessionIdsByTitle(idOrPrefix);
      const resolved = claudeIds
        .map(id => getSession(id))
        .filter((s): s is NonNullable<typeof s> => s != null);

      if (resolved.length === 1) {
        session = resolved[0];
      } else if (resolved.length >= 2) {
        const ids = resolved.map(m => shortId(m.id));
        console.error(chalk.red(`Multiple sessions named "${idOrPrefix}": ${ids.join(', ')}.`));
        process.exit(1);
      }
    }

    // No match found — show prefix collision or not-found error
    if (!session) {
      const matches = findSessions(idOrPrefix);
      if (matches.length >= 2) {
        const ids = matches.map(m => highlightId(shortId(m.id), idOrPrefix.length));
        console.error(chalk.red(`Multiple sessions starting with ${idOrPrefix}: ${ids.join(', ')}.`));
      } else {
        console.error(chalk.red(`Session not found: ${idOrPrefix}.`));
      }
      process.exit(1);
    }
  }

  const displayName = getDisplayName(session);

  // Verify session exists in Claude's storage
  const claudeSession = getClaudeSession(session.id);
  if (!claudeSession) {
    await updateIndex((index) => {
      if (index.sessions[session!.id]) {
        index.sessions[session!.id].state = 'archived';
        index.sessions[session!.id].last_active_at = new Date();
        delete index.sessions[session!.id].pid;
      }
    });
    console.error(chalk.red(`Session ${displayName} no longer exists in Claude's storage.`));
    console.error(chalk.dim(`Archived stale session. Run ${chalk.cyan('c new')} to start fresh.`));
    process.exit(1);
  }

  // Validate session directory still exists
  if (!existsSync(session.directory)) {
    const repoMatch = session.directory.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
    if (repoMatch && existsSync(repoMatch[1])) {
      const repoRoot = repoMatch[1];
      console.error(chalk.yellow(`Worktree directory no longer exists: ${session.directory}.`));
      console.error(chalk.dim(`Resuming from ${repoRoot} instead.`));
      await updateIndex((index) => {
        const s = index.sessions[session!.id];
        if (s) {
          s.directory = repoRoot;
          delete s.resources.worktree;
        }
      });
      session.directory = repoRoot;
      delete session.resources.worktree;
    } else {
      await updateIndex((index) => {
        const s = index.sessions[session!.id];
        if (s) {
          s.state = 'archived';
          s.last_active_at = new Date();
          delete s.pid;
        }
      });
      console.error(chalk.red(`Session directory no longer exists: ${session.directory}.`));
      console.error(chalk.dim(`Archived stale session. Run ${chalk.cyan('c new')} to start fresh.`));
      process.exit(1);
    }
  }

  // Store PID before exec replaces this process
  await updateIndex((index) => {
    if (index.sessions[session!.id]) {
      index.sessions[session!.id].pid = process.pid;
      index.sessions[session!.id].state = 'idle';
      if (process.env.TMUX_PANE) {
        index.sessions[session!.id].resources.tmux_pane = process.env.TMUX_PANE;
      }
    }
  });
  console.log(chalk.dim(`Resuming session ${displayName} in ${session.directory}...`));
  setTmuxPaneTitle(displayName);
  process.env.C_SESSION_ID = session.id;

  const resumeArgs = ['-r', session.id];
  if (options.model) resumeArgs.push('--model', options.model);
  if (options.permissionMode) resumeArgs.push('--permission-mode', options.permissionMode);
  if (options.effort) resumeArgs.push('--effort', options.effort);
  if (options.agent) resumeArgs.push('--agent', options.agent);
  if (options.forkSession) resumeArgs.push('--fork-session');
  if (options.worktree) {
    const inGitRepo = !!getGitRoot(session.directory);
    if (inGitRepo) {
      const wtName = typeof options.worktree === 'string'
        ? options.worktree
        : session.resources.worktree;
      if (wtName) {
        resumeArgs.push('--worktree', wtName);
      } else {
        resumeArgs.push('--worktree');
      }
    } else {
      console.log(chalk.dim('Not in a git repository. Skipping worktree creation.'));
    }
  }
  if (options.passthroughArgs) resumeArgs.push(...options.passthroughArgs);

  let exitCode: number;
  try {
    exitCode = await spawnInteractive('claude', resumeArgs, { cwd: session.directory });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to launch Claude: ${msg}.`));
    await updateIndex((index) => {
      const s = index.sessions[session!.id];
      if (s) {
        s.state = 'archived';
        s.last_active_at = new Date();
        delete s.pid;
      }
    });
    process.exit(1);
  }

  if (exitCode !== 0) {
    await updateIndex((index) => {
      if (index.sessions[session!.id]) {
        index.sessions[session!.id].state = 'archived';
        index.sessions[session!.id].last_active_at = new Date();
        delete index.sessions[session!.id].pid;
      }
    });
    console.error(chalk.dim(`Archived stale session. Run ${chalk.cyan('c new')} to start fresh.`));
  }

  process.exit(exitCode);
}

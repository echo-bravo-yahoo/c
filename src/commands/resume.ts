/**
 * c resume <id> - resume a Claude session
 */

import { existsSync, mkdirSync, renameSync, cpSync } from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { resolveSession, getSession, updateIndex } from '../store/index.ts';
import { getClaudeSession, findClaudeSessionIdsByTitle, encodeProjectKey, PROJECTS_DIR } from '../claude/sessions.ts';
import { extractRepoRoot } from '../detection/git.ts';
import { createSession } from '../store/schema.ts';
import { exec, spawnInteractive, setTmuxPaneTitle } from '../util/exec.ts';
import { getDisplayName, shortId, ambiguityError } from '../util/format.ts';
import type { Session } from '../store/schema.ts';

export interface ResumeOptions {
  model?: string;
  permissionMode?: string;
  effort?: string;
  agent?: string;
  forkSession?: boolean;
  passthroughArgs?: string[];
}

/**
 * Multi-fallback session lookup: getSession (id/prefix/name/title) → Claude title → Claude storage adoption.
 * Returns the resolved session or undefined. Calls process.exit(1) on ambiguous matches.
 */
export async function resolveSessionForResume(idOrPrefix: string): Promise<Session | undefined> {
  const result = resolveSession(idOrPrefix);
  let session = result.session;

  // Report ambiguity from store-level resolution
  if (!session && result.ambiguity) {
    console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
    process.exit(1);
  }

  // Try Claude's customTitle fallback (reads Claude's on-disk session files)
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

  // Fall back to Claude's storage for sessions not in c's index
  if (!session) {
    const claudeFallback = getClaudeSession(idOrPrefix);
    if (claudeFallback) {
      const newSession = createSession(
        claudeFallback.id,
        claudeFallback.directory,
        claudeFallback.projectKey,
        claudeFallback.modifiedAt
      );
      newSession.state = 'idle';
      await updateIndex((index) => {
        index.sessions[newSession.id] = newSession;
      });
      session = newSession;
      console.error(chalk.dim(`Adopted session from Claude's storage.`));
    }
  }

  // No match found
  if (!session) {
    console.error(chalk.red(`Session not found: ${idOrPrefix}.`));
    process.exit(1);
  }

  return session;
}

/**
 * Build the Claude CLI argument array for resuming a session.
 */
export function buildResumeArgs(sessionId: string, options: ResumeOptions): string[] {
  const args = ['-r', sessionId];
  if (options.model) args.push('--model', options.model);
  if (options.permissionMode) args.push('--permission-mode', options.permissionMode);
  if (options.effort) args.push('--effort', options.effort);
  if (options.agent) args.push('--agent', options.agent);
  if (options.forkSession) args.push('--fork-session');
  if (options.passthroughArgs) args.push(...options.passthroughArgs);
  return args;
}

/**
 * Move a Claude transcript from one project directory to another.
 * Used when a worktree is deleted and the session falls back to the repo root.
 */
export function relocateTranscript(
  claudeSession: { id: string; transcriptPath: string; projectKey: string },
  targetDirectory: string
): void {
  const targetProjectKey = encodeProjectKey(targetDirectory);
  if (claudeSession.projectKey === targetProjectKey) return;

  const targetProjectDir = path.join(PROJECTS_DIR, targetProjectKey);
  const targetTranscript = path.join(targetProjectDir, `${claudeSession.id}.jsonl`);

  if (existsSync(targetTranscript)) return;

  try {
    mkdirSync(targetProjectDir, { recursive: true });

    // Move transcript file
    renameSync(claudeSession.transcriptPath, targetTranscript);

    // Move companion directory (contains history.jsonl) if it exists
    const sourceCompanionDir = path.join(path.dirname(claudeSession.transcriptPath), claudeSession.id);
    const targetCompanionDir = path.join(targetProjectDir, claudeSession.id);
    if (existsSync(sourceCompanionDir)) {
      cpSync(sourceCompanionDir, targetCompanionDir, { recursive: true });
    }
  } catch {
    // Non-fatal — resume will still attempt to launch
  }
}

/**
 * Recreate a deleted git worktree from the session's branch.
 * Returns true if the worktree was successfully recreated.
 */
export function recreateWorktree(repoRoot: string, worktreePath: string, branch: string): boolean {
  // Verify the branch still exists (outputs SHA on success, '' on failure)
  if (!exec(`git rev-parse --verify "refs/heads/${branch}"`, { cwd: repoRoot })) return false;

  // git worktree add outputs to stderr; check directory existence after
  exec(`git worktree add "${worktreePath}" "${branch}"`, { cwd: repoRoot });
  return existsSync(worktreePath);
}

export async function resumeCommand(idOrPrefix: string, options: ResumeOptions = {}): Promise<void> {
  const session = await resolveSessionForResume(idOrPrefix);
  if (!session) return; // resolveSessionForResume exits on failure

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
    const repoRoot = extractRepoRoot(session.directory);
    if (repoRoot && existsSync(repoRoot)) {
      const branch = session.resources.branch;

      // Try to recreate the worktree from the session's branch
      if (branch && recreateWorktree(repoRoot, session.directory, branch)) {
        console.error(chalk.yellow(`Worktree was deleted. Recreated from branch ${chalk.cyan(branch)}.`));
      } else {
        // Branch gone or worktree add failed — fall back to repo root
        console.error(chalk.yellow(`Worktree directory no longer exists: ${session.directory}.`));
        console.error(chalk.dim(`Resuming from ${repoRoot} instead.`));
        relocateTranscript(claudeSession, repoRoot);
        await updateIndex((index) => {
          const s = index.sessions[session!.id];
          if (s) {
            s.directory = repoRoot;
            s.project_key = encodeProjectKey(repoRoot);
            delete s.resources.worktree;
          }
        });
        session.directory = repoRoot;
        delete session.resources.worktree;
      }
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

  // Handle legacy worktree sessions where directory was never updated to the
  // worktree path (pre-fix sessions). The transcript lives under the worktree's
  // project key, but session.directory points to the repo root.
  // Recreate the worktree so Claude resumes with the correct code on disk.
  if (session.resources.worktree && session.resources.branch) {
    const worktreeName = session.resources.worktree;
    const branch = session.resources.branch;
    const worktreePath = path.join(session.directory, '.claude', 'worktrees', worktreeName);

    if (!existsSync(worktreePath) && recreateWorktree(session.directory, worktreePath, branch)) {
      console.error(chalk.yellow(`Worktree was deleted. Recreated from branch ${chalk.cyan(branch)}.`));
      await updateIndex((index) => {
        const s = index.sessions[session!.id];
        if (s) {
          s.directory = worktreePath;
          s.project_key = encodeProjectKey(worktreePath);
        }
      });
      session.directory = worktreePath;
    } else if (existsSync(worktreePath)) {
      // Worktree exists but directory wasn't updated — fix it
      await updateIndex((index) => {
        const s = index.sessions[session!.id];
        if (s) {
          s.directory = worktreePath;
          s.project_key = encodeProjectKey(worktreePath);
        }
      });
      session.directory = worktreePath;
    }
  }

  // Ensure transcript is in the project directory matching session.directory.
  // Worktree sessions may have transcripts under the worktree's project key
  // while session.directory points to the repo root.
  relocateTranscript(claudeSession, session.directory);

  // Save previous state for rollback on spawn failure
  const prevState = session.state;
  const prevPid = session.pid;

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
  if (displayName) setTmuxPaneTitle(displayName);

  // Set fork parent env var so session-start hook registers the forked session
  if (options.forkSession) {
    process.env.C_FORK_PARENT = session.id;
  }

  const resumeArgs = buildResumeArgs(session.id, options);

  let exitCode: number;
  try {
    exitCode = await spawnInteractive('claude', resumeArgs, { cwd: session.directory });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to launch Claude: ${msg}.`));
    await updateIndex((index) => {
      const s = index.sessions[session!.id];
      if (s) {
        s.state = prevState;
        if (prevPid != null) {
          s.pid = prevPid;
        } else {
          delete s.pid;
        }
      }
    });
    process.exit(1);
  }

  delete process.env.C_FORK_PARENT;

  if (exitCode !== 0) {
    await updateIndex((index) => {
      const s = index.sessions[session!.id];
      if (s) {
        s.state = prevState;
        if (prevPid != null) {
          s.pid = prevPid;
        } else {
          delete s.pid;
        }
      }
    });
  }

  process.exit(exitCode);
}

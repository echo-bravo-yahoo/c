/**
 * c repair [id] - auto-fix inconsistent session state
 */

import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { readIndex, updateIndex, getSession } from '../store/index.ts';
import { listStatusCacheIds, deleteStatusCache } from '../store/status-cache.ts';
import { getCurrentBranch } from '../detection/git.ts';
import { getDisplayName, shortId } from '../util/format.ts';
import { listClaudeSessions } from '../claude/sessions.ts';
import type { Session } from '../store/schema.ts';

/**
 * Check if a process is alive via kill(pid, 0).
 * Returns true if alive (or EPERM), false if dead (ESRCH).
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true; // alive (or EPERM — not ours but exists)
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

export async function repairCommand(idOrPrefix?: string): Promise<void> {
  const fixes: string[] = [];

  // If ID provided, scope to that session only
  let targetSession: Session | undefined;
  if (idOrPrefix) {
    targetSession = getSession(idOrPrefix);
    if (!targetSession) {
      console.error(chalk.red(`Session not found: ${idOrPrefix}.`));
      process.exit(1);
    }
  }

  const claudeSessions = listClaudeSessions();
  const claudeIds = new Set(claudeSessions.map((s) => s.id));

  // Fix index issues in a single updateIndex call
  await updateIndex((index) => {
    const sessions = targetSession
      ? { [targetSession.id]: index.sessions[targetSession.id] }
      : index.sessions;

    for (const [id, session] of Object.entries(sessions)) {
      if (!session) continue;
      const label = `${shortId(id)} ${getDisplayName(session) || '(unnamed)'}`;

      // 1. Stale PIDs — process no longer exists
      if (session.pid != null && !isProcessAlive(session.pid)) {
        fixes.push(`Cleared stale PID ${session.pid} on ${label}`);
        delete session.pid;
        if (['busy', 'idle', 'waiting'].includes(session.state)) {
          session.state = 'closed';
          fixes.push(`Closed ${label} (process dead)`);
        }
      }

      // 2. Stuck active states — no PID and no Claude session
      if (
        ['busy', 'idle', 'waiting'].includes(session.state) &&
        session.pid == null &&
        !claudeIds.has(id)
      ) {
        session.state = 'closed';
        fixes.push(`Closed stuck ${label} (no PID, no Claude data)`);
      }

      // 3. Missing branches — re-detect for active sessions
      if (
        ['busy', 'idle', 'waiting'].includes(session.state) &&
        !session.resources.branch &&
        existsSync(session.directory)
      ) {
        const branch = getCurrentBranch(session.directory);
        if (branch) {
          session.resources.branch = branch;
          fixes.push(`Detected branch ${branch} for ${label}`);
        }
      }
    }
  });

  // 4. Stale status cache — only when repairing all sessions
  if (!targetSession) {
    const index = readIndex();
    const indexIds = new Set(Object.keys(index.sessions));
    const cacheIds = listStatusCacheIds();
    for (const cacheId of cacheIds) {
      if (!indexIds.has(cacheId)) {
        deleteStatusCache(cacheId);
        fixes.push(`Deleted stale status cache for ${shortId(cacheId)}`);
      }
    }
  }

  if (fixes.length === 0) {
    console.log(chalk.green('No issues found.'));
  } else {
    for (const fix of fixes) {
      console.log(chalk.yellow(`Fixed: ${fix}`));
    }
    console.log(chalk.green(`\n${fixes.length} issue${fixes.length === 1 ? '' : 's'} fixed.`));
  }
}

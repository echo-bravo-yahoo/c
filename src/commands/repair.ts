/**
 * c repair [id] - auto-fix inconsistent session state
 */

import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { readIndex, updateIndex, getSession } from '../store/index.ts';
import { listStatusCacheIds, deleteStatusCache } from '../store/status-cache.ts';
import { getCurrentBranch, getRepoSlug } from '../detection/git.ts';
import { extractJiraFromBranch } from '../detection/jira.ts';
import { listPRs } from '../detection/pr.ts';
import { getDisplayName, shortId } from '../util/format.ts';
import { listClaudeSessions, findTranscriptPath, getCustomTitleFromTranscriptTail } from '../claude/sessions.ts';
import { readTranscriptUsage } from '../claude/usage.ts';
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

export interface RepairOptions {
  thorough?: boolean;
  quiet?: boolean;
}

export async function repairCommand(idOrPrefix?: string, options: RepairOptions = {}): Promise<void> {
  const { thorough = false, quiet = false } = options;
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

      // --- Thorough-only steps (4-6) ---
      if (!thorough) continue;

      // 4. Backfill _custom_title from transcript when missing
      if (!session.meta._custom_title) {
        const transcriptPath = findTranscriptPath(id);
        if (transcriptPath) {
          const title = getCustomTitleFromTranscriptTail(transcriptPath);
          if (title) {
            session.meta._custom_title = title;
            fixes.push(`Backfilled title "${title}" for ${label}`);
          }
        }
      }

      // 5. Backfill JIRA from branch name
      if (session.resources.branch && !session.resources.jira) {
        const jira = extractJiraFromBranch(session.resources.branch);
        if (jira) {
          session.resources.jira = jira;
          fixes.push(`Detected JIRA ${jira} from branch for ${label}`);
        }
      }

      // 6. Backfill branch for closed sessions
      if (
        session.state === 'closed' &&
        !session.resources.branch &&
        existsSync(session.directory)
      ) {
        const branch = getCurrentBranch(session.directory);
        if (branch) {
          session.resources.branch = branch;
          fixes.push(`Detected branch ${branch} for closed ${label}`);
        }
      }
    }
  });

  // Stale status cache — only when repairing all sessions
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

  // --- Phase 2: Thorough-only steps requiring network/disk outside the lock ---
  if (thorough) {
    const index = readIndex();
    const sessions = targetSession
      ? { [targetSession.id]: index.sessions[targetSession.id] }
      : index.sessions;

    // 7. Backfill PR from GitHub — group by repo, one API call per repo
    const needsPR = new Map<string, { cwd: string; sessionIds: string[] }>();
    for (const [id, session] of Object.entries(sessions)) {
      if (!session || session.resources.pr || !session.resources.branch) continue;
      if (!existsSync(session.directory)) continue;
      const slug = getRepoSlug(session.directory);
      if (!slug) continue;
      const group = needsPR.get(slug);
      if (group) {
        group.sessionIds.push(id);
      } else {
        needsPR.set(slug, { cwd: session.directory, sessionIds: [id] });
      }
    }

    const prFixes: Array<{ id: string; pr: string }> = [];
    for (const [, { cwd, sessionIds }] of needsPR) {
      const prs = listPRs(cwd, 'all');
      const branchToPR = new Map(prs.map((pr) => [pr.branch, pr.url]));
      for (const id of sessionIds) {
        const session = sessions[id];
        if (!session) continue;
        const prUrl = branchToPR.get(session.resources.branch!);
        if (prUrl) prFixes.push({ id, pr: prUrl });
      }
    }

    // 8. Backfill cost from transcript
    const costFixes: Array<{ id: string; cost_usd: number }> = [];
    for (const [id, session] of Object.entries(sessions)) {
      if (!session || session.state !== 'closed') continue;
      if (session.cost_usd != null && session.cost_usd > 0) continue;
      const transcriptPath = findTranscriptPath(id);
      if (!transcriptPath) continue;
      const result = readTranscriptUsage(transcriptPath, 0);
      if (result && result.cost_usd > 0) {
        costFixes.push({ id, cost_usd: result.cost_usd });
      }
    }

    // Apply phase 2 fixes in a single updateIndex call
    if (prFixes.length > 0 || costFixes.length > 0) {
      await updateIndex((idx) => {
        for (const { id, pr } of prFixes) {
          const session = idx.sessions[id];
          if (!session) continue;
          session.resources.pr = pr;
          const label = `${shortId(id)} ${getDisplayName(session) || '(unnamed)'}`;
          fixes.push(`Linked PR ${pr} for ${label}`);
        }
        for (const { id, cost_usd } of costFixes) {
          const session = idx.sessions[id];
          if (!session) continue;
          session.cost_usd = cost_usd;
          const label = `${shortId(id)} ${getDisplayName(session) || '(unnamed)'}`;
          fixes.push(`Computed cost $${cost_usd.toFixed(2)} for ${label}`);
        }
      });
    }
  }

  if (fixes.length === 0) {
    if (!quiet) console.log(chalk.green('No issues found.'));
  } else {
    for (const fix of fixes) {
      console.log(chalk.yellow(`Fixed: ${fix}`));
    }
    console.log(chalk.green(`\n${fixes.length} issue${fixes.length === 1 ? '' : 's'} fixed.`));
  }
}

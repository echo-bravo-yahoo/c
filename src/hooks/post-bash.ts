/**
 * PostToolUse (Bash) hook - detect branches, PRs, and servers
 */

import { updateIndex, getCurrentSession, getSession } from '../store/index.ts';
import { extractPRFromOutput } from '../detection/pr.ts';
import { writeStatusCache } from '../store/status-cache.ts';
import { getCurrentBranch, getRepoSlug, getWorktreeInfo } from '../detection/git.ts';
import type { StatusCacheData } from '../store/status-cache.ts';
import type { HookInput } from './index.ts';

export async function handlePostBash(
  sessionId: string | undefined,
  cwd: string,
  input: HookInput | null
): Promise<void> {
  const targetId = sessionId ?? getCurrentSession(cwd)?.id;

  if (!targetId) {
    return;
  }

  const output = input?.tool_output ?? '';
  const command = (input?.tool_input?.command as string) ?? '';

  // Detect branch
  const branch = getCurrentBranch(cwd);

  // Detect PR creation
  const prUrl = extractPRFromOutput(output);

  // Detect dev server starts
  const serverPatterns = [
    /npm (?:run )?start/,
    /npm run dev/,
    /yarn (?:run )?start/,
    /yarn dev/,
    /webpack.*serve/,
    /vite/,
    /next dev/,
  ];

  const isServerStart = serverPatterns.some((p) => p.test(command));

  if (!branch && !prUrl && !isServerStart) {
    return;
  }

  let branchChanged = false;

  await updateIndex((index) => {
    if (!index.sessions[targetId]) return;

    const session = index.sessions[targetId];
    session.last_active_at = new Date();

    if (branch && session.resources.branch !== branch) {
      session.resources.branch = branch;
      branchChanged = true;
    }

    if (prUrl && !session.resources.pr) {
      session.resources.pr = prUrl;
    }

    // For server detection, we'd need to track PIDs which is complex
    // For now, just note that a server was started
    if (isServerStart) {
      // Could be enhanced to scan lsof for actual port bindings
    }
  });

  // Update status cache when PR or branch changes
  if (prUrl || branchChanged) {
    const session = getSession(targetId);
    if (session) {
      const repo = getRepoSlug(cwd);
      const worktreeInfo = getWorktreeInfo(cwd);
      const cache: StatusCacheData = {
        branch: session.resources.branch,
        repo,
        jira: session.resources.jira,
        jira_base: session.resources.jira ? 'https://machinify.atlassian.net' : undefined,
        pr: session.resources.pr,
        worktree: session.resources.worktree,
        worktree_path: worktreeInfo?.path,
      };
      writeStatusCache(targetId, cache);
    }
  }
}

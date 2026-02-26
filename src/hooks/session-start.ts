/**
 * SessionStart hook - register new session
 */

import { updateIndex, getSession, getSessions } from '../store/index.js';
import { createSession } from '../store/schema.js';
import { generateHumanhash } from '../util/humanhash.js';
import { getCurrentBranch, getWorktreeInfo, listWorktrees } from '../detection/git.js';
import { extractJiraFromBranch } from '../detection/jira.js';
import { encodeProjectKey, getPlanExecutionInfo } from '../claude/sessions.js';
import type { HookInput } from './index.js';

export async function handleSessionStart(
  sessionId: string | undefined,
  cwd: string,
  input: HookInput | null
): Promise<void> {
  if (!sessionId) {
    // Cannot register without session ID
    return;
  }

  let parentSessionId: string | undefined;
  let planSlug: string | undefined;
  let planTitle: string | undefined;

  // Check recently closed sessions for plan execution (ExitPlanMode)
  const recentThreshold = 30 * 1000; // 30 seconds
  const recentSessions = getSessions({ state: ['closed'], directory: cwd }).filter(
    (s) =>
      s.id !== sessionId && Date.now() - new Date(s.last_active_at).getTime() < recentThreshold
  );

  for (const session of recentSessions) {
    const planInfo = getPlanExecutionInfo(session.id);
    if (planInfo) {
      parentSessionId = session.id;
      planSlug = planInfo.slug;
      planTitle = planInfo.title ?? undefined;
      break;
    }
  }

  // Check if session already exists (e.g., created by `c new`)
  const existing = getSession(sessionId);
  if (existing) {
    await updateIndex((index) => {
      const s = index.sessions[sessionId];
      if (!s) return;

      s.last_active_at = new Date();
      s.state = 'busy';

      // Resolve worktree path if session was created with --worktree
      // The cwd from hook may be the original repo, not the worktree
      let branchCwd = cwd;
      if (s.resources.worktree) {
        const worktrees = listWorktrees(cwd);
        // Match by worktree name in path or by branch name
        const wt = worktrees.find(
          (w) => w.path.endsWith(`/${s.resources.worktree}`) || w.branch === s.resources.worktree
        );
        if (wt) {
          branchCwd = wt.path;
          // Also set the branch directly from worktree info
          if (!s.resources.branch) {
            s.resources.branch = wt.branch;
          }
        }
      }

      // Merge git info if not already set by user
      const branch = getCurrentBranch(branchCwd);
      if (branch && !s.resources.branch) {
        s.resources.branch = branch;
        if (!s.resources.jira) {
          const jira = extractJiraFromBranch(branch);
          if (jira) s.resources.jira = jira;
        }
      }

      const worktree = getWorktreeInfo(branchCwd);
      if (worktree && !s.resources.worktree) {
        s.resources.worktree = worktree.name;
      }
    });
    return;
  }

  // Create new session
  const now = new Date();
  const humanhash = generateHumanhash(sessionId);
  const projectKey = encodeProjectKey(cwd);

  const session = createSession(sessionId, cwd, projectKey, humanhash, now);

  // Link to parent session if this is a plan execution
  if (parentSessionId) {
    session.parent_session_id = parentSessionId;
  }

  // Use plan title as session name if available, fall back to slug
  if (planTitle) {
    session.name = planTitle;
  } else if (planSlug) {
    session.name = planSlug;
  }

  // Detect git info
  const branch = getCurrentBranch(cwd);
  if (branch) {
    session.resources.branch = branch;

    // Try to extract JIRA from branch
    const jira = extractJiraFromBranch(branch);
    if (jira) {
      session.resources.jira = jira;
    }
  }

  // Check for worktree
  const worktree = getWorktreeInfo(cwd);
  if (worktree) {
    session.resources.worktree = worktree.name;
  }

  // Save to index
  await updateIndex((index) => {
    index.sessions[sessionId] = session;
  });
}

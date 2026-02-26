/**
 * SessionStart hook - register new session
 */

import { updateIndex, getSession, getSessions } from '../store/index.js';
import { createSession } from '../store/schema.js';
import { generateHumanhash } from '../util/humanhash.js';
import { getCurrentBranch, getWorktreeInfo } from '../detection/git.js';
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

  // Close any stale "live" sessions in the same directory
  // This handles cases where SessionEnd didn't fire (e.g., Ctrl-C, crash)
  const staleSessions = getSessions({ status: ['live'], directory: cwd }).filter(
    (s) => s.id !== sessionId
  );

  let parentSessionId: string | undefined;
  let planSlug: string | undefined;
  let planTitle: string | undefined;

  // Check recently closed sessions for plan execution (ExitPlanMode)
  // SessionEnd may have already marked the planning session as closed
  const recentThreshold = 30 * 1000; // 30 seconds
  const recentSessions = getSessions({ status: ['closed'], directory: cwd }).filter(
    (s) =>
      s.id !== sessionId && Date.now() - new Date(s.last_active_at).getTime() < recentThreshold
  );

  for (const session of [...staleSessions, ...recentSessions]) {
    const planInfo = getPlanExecutionInfo(session.id);
    if (planInfo) {
      parentSessionId = session.id;
      planSlug = planInfo.slug;
      planTitle = planInfo.title ?? undefined;
      break;
    }
  }

  if (staleSessions.length > 0) {
    await updateIndex((index) => {
      for (const stale of staleSessions) {
        if (index.sessions[stale.id]) {
          index.sessions[stale.id].status = 'closed';
        }
      }
    });
  }

  // Check if session already exists (e.g., created by `c new`)
  const existing = getSession(sessionId);
  if (existing) {
    await updateIndex((index) => {
      const s = index.sessions[sessionId];
      if (!s) return;

      s.last_active_at = new Date();
      s.status = 'live';

      // Merge git info if not already set by user
      const branch = getCurrentBranch(cwd);
      if (branch && !s.resources.branch) {
        s.resources.branch = branch;
        if (!s.resources.jira) {
          const jira = extractJiraFromBranch(branch);
          if (jira) s.resources.jira = jira;
        }
      }

      const worktree = getWorktreeInfo(cwd);
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

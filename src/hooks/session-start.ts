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
  // Also detect plan execution (ExitPlanMode) to link parent/child sessions
  const staleSessions = getSessions({ status: ['live'], directory: cwd }).filter(
    (s) => s.id !== sessionId
  );

  let parentSessionId: string | undefined;
  let planSlug: string | undefined;

  if (staleSessions.length > 0) {
    // Check if any stale session ended with ExitPlanMode (plan execution)
    for (const stale of staleSessions) {
      const planInfo = getPlanExecutionInfo(stale.id);
      if (planInfo) {
        parentSessionId = stale.id;
        planSlug = planInfo.slug;
        break;
      }
    }

    await updateIndex((index) => {
      for (const stale of staleSessions) {
        if (index.sessions[stale.id]) {
          index.sessions[stale.id].status = 'closed';
        }
      }
    });
  }

  // Check if session already exists
  const existing = getSession(sessionId);
  if (existing) {
    // Session already registered, just update last_active
    await updateIndex((index) => {
      if (index.sessions[sessionId]) {
        index.sessions[sessionId].last_active_at = new Date();
        index.sessions[sessionId].status = 'live';
      }
    });
    return;
  }

  // Create new session
  const now = new Date();
  const humanhash = generateHumanhash(now);
  const projectKey = encodeProjectKey(cwd);

  const session = createSession(sessionId, cwd, projectKey, humanhash, now);

  // Link to parent session if this is a plan execution
  if (parentSessionId) {
    session.parent_session_id = parentSessionId;
  }

  // Use plan slug as session name if available
  if (planSlug) {
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

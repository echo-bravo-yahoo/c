/**
 * SessionStart hook - register new session
 */

import { updateIndex, getSession } from '../store/index.js';
import { createSession } from '../store/schema.js';
import { generateHumanhash } from '../util/humanhash.js';
import { getCurrentBranch, getWorktreeInfo } from '../detection/git.js';
import { extractJiraFromBranch } from '../detection/jira.js';
import { encodeProjectKey } from '../claude/sessions.js';
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

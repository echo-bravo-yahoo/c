/**
 * SessionStart hook - register new session
 */

import { updateIndex, getSession, getSessions } from '../store/index.ts';
import { createSession } from '../store/schema.ts';
import { getCurrentBranch, getWorktreeInfo, getRepoSlug, listWorktrees } from '../detection/git.ts';
import { extractJiraFromBranch } from '../detection/jira.ts';
import { encodeProjectKey, getPlanExecutionInfo, findTranscriptPath, getCustomTitleFromTranscriptTail, readClaudeSessionIndex } from '../claude/sessions.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';
import { writeStatusCache } from '../store/status-cache.ts';
import type { StatusCacheData } from '../store/status-cache.ts';
import { debugLog } from '../util/debug.ts';
import type { HookInput } from './index.ts';

/**
 * Find a worktree entry matching a session's worktree name.
 * Matches by path suffix or branch name.
 */
export function findWorktreeMatch(
  worktreeName: string,
  worktrees: { path: string; branch: string }[]
): { path: string; branch: string } | undefined {
  return worktrees.find(
    (w) => w.path.endsWith(`/${worktreeName}`) || w.branch === worktreeName
  );
}

export async function handleSessionStart(
  sessionId: string | undefined,
  cwd: string,
  input: HookInput | null
): Promise<void> {
  if (!sessionId) {
    debugLog(`[title] session-start: no sessionId`);
    return;
  }

  // During resume, Claude may fire SessionStart with a transient UUID before
  // switching to the real session. Skip unknown sessions during resume to
  // avoid phantom index entries. New sessions (source="startup") are always
  // registered, even when started from within a resumed session's environment.
  if (input?.source === 'resume' && !getSession(sessionId)) {
    debugLog(`[title] session-start: skipping unknown session ${sessionId} during resume`);
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

  debugLog(`[title] session-start: sessionId=${sessionId} planTitle=${JSON.stringify(planTitle)} planSlug=${JSON.stringify(planSlug)} parentSessionId=${parentSessionId}`);

  // Check if session already exists (e.g., created by `c new`)
  const existing = getSession(sessionId);
  if (existing) {
    debugLog(`[title] session-start: existing session path`);
    const updatedIndex = await updateIndex((index) => {
      const s = index.sessions[sessionId];
      if (!s) return;

      s.last_active_at = new Date();
      s.state = 'busy';

      // Resolve worktree path if session was created with --worktree
      // The cwd from hook may be the original repo, not the worktree
      let branchCwd = cwd;
      if (s.resources.worktree) {
        const worktrees = listWorktrees(cwd);
        const wt = findWorktreeMatch(s.resources.worktree, worktrees);
        if (wt) {
          branchCwd = wt.path;
          // Update directory to worktree path so resume uses the correct CWD
          // (Claude stores the transcript under the worktree's project key)
          s.directory = wt.path;
          s.project_key = encodeProjectKey(wt.path);
          // Also set the branch directly from worktree info
          if (!s.resources.branch) {
            s.resources.branch = wt.branch;
          }
        }
      }

      // Store tmux pane if not already set
      if (process.env.TMUX_PANE && !s.resources.tmux_pane) {
        s.resources.tmux_pane = process.env.TMUX_PANE;
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

      // Seed _custom_title baseline to prevent stop hook from treating
      // a pre-existing /rename title as new on the first stop after resume
      const transcriptPath = findTranscriptPath(sessionId);
      const customTitle = transcriptPath
        ? getCustomTitleFromTranscriptTail(transcriptPath)
        : null;
      if (customTitle) {
        s.meta._custom_title = customTitle;
      }
      debugLog(`[title] session-start: seeded _custom_title=${JSON.stringify(customTitle)} tmux_pane=${s.resources.tmux_pane}`);
    });

    const s = updatedIndex.sessions[sessionId];
    if (s) {
      writeCacheFromSession(sessionId, s, cwd);
    }
    return;
  }

  // Skip creation for ephemeral sessions (launched with c new --ephemeral)
  if (process.env.C_EPHEMERAL === '1') {
    debugLog(`[hook] session-start: skipping creation for ephemeral session ${sessionId}`);
    return;
  }

  const session = await registerNewSession(sessionId, cwd);
  if (!session) return;

  // Link to parent session if this is a plan execution
  if (parentSessionId) {
    session.parent_session_id = parentSessionId;
  }

  // Store plan slug as resource on the execution session
  if (planSlug) {
    session.resources.plan = planSlug;
  }

  // Use plan title as session name if available, fall back to slug
  if (planTitle) {
    session.name = planTitle;
  } else if (planSlug) {
    session.name = planSlug;
  }

  // Set tmux pane title for plan child sessions
  if (session.name) {
    setTmuxPaneTitle(session.name, session.resources.tmux_pane);
  }

  // Save plan-specific fields and backfill parent
  if (parentSessionId || planSlug || planTitle) {
    await updateIndex((index) => {
      const s = index.sessions[sessionId];
      if (!s) return;
      if (parentSessionId) s.parent_session_id = parentSessionId;
      if (planSlug) s.resources.plan = planSlug;
      if (planTitle) s.name = planTitle;
      else if (planSlug) s.name = planSlug;

      if (parentSessionId && planSlug) {
        const parent = index.sessions[parentSessionId];
        if (parent && !parent.resources.plan) {
          parent.resources.plan = planSlug;
        }
      }
    });
  }

  writeCacheFromSession(sessionId, session, cwd);
}

/**
 * Register a new session in the index with git detection.
 * Extracted so user-prompt can call it as a deferred fallback
 * when SessionStart has no stdin payload.
 */
export async function registerNewSession(
  sessionId: string,
  cwd: string,
): Promise<ReturnType<typeof createSession> | undefined> {
  if (process.env.C_EPHEMERAL === '1') {
    debugLog(`[hook] registerNewSession: skipping ephemeral session ${sessionId}`);
    return undefined;
  }

  debugLog(`[hook] registerNewSession: creating session ${sessionId} — TMUX_PANE=${process.env.TMUX_PANE ?? 'unset'}`);
  const now = new Date();
  const projectKey = encodeProjectKey(cwd);

  const session = createSession(sessionId, cwd, projectKey, now);

  // Store tmux pane for title updates from subsequent hooks
  if (process.env.TMUX_PANE) {
    session.resources.tmux_pane = process.env.TMUX_PANE;
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

  return session;
}

function writeCacheFromSession(
  sessionId: string,
  session: {
    name?: string;
    state?: string;
    resources: { branch?: string; worktree?: string; pr?: string; jira?: string; plan?: string };
  },
  cwd: string
): void {
  const cacheId = sessionId;
  const repo = getRepoSlug(cwd);
  const worktreeInfo = getWorktreeInfo(cwd);

  // Read Claude's session index for message count and first prompt
  const projectKey = encodeProjectKey(cwd);
  const claudeIndex = readClaudeSessionIndex(projectKey);
  const indexEntry = claudeIndex?.entries.find(e => e.sessionId === sessionId);

  const cache: StatusCacheData = {
    branch: session.resources.branch,
    repo,
    jira: session.resources.jira,
    jira_base: session.resources.jira ? 'https://machinify.atlassian.net' : undefined,
    pr: session.resources.pr,
    worktree: session.resources.worktree,
    worktree_path: worktreeInfo?.path,
    name: session.name || undefined,
    state: session.state,
    message_count: indexEntry?.messageCount != null ? String(indexEntry.messageCount) : undefined,
    first_prompt: indexEntry?.firstPrompt || undefined,
    plan: session.resources.plan,
  };
  writeStatusCache(cacheId, cache);
}

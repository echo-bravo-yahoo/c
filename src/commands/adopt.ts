/**
 * c adopt <session-id> - promote an ephemeral session to tracked
 */

import chalk from 'chalk';
import { getSession, readIndex, updateIndex } from '../store/index.ts';
import { createSession } from '../store/schema.ts';
import { getClaudeSession, getClaudeSessionTitles, getClaudeSessionsForDirectory, getPlanExecutionInfo, getPlanContinuationInfo, extractPlanTitle } from '../claude/sessions.ts';
import { getCurrentBranch, getWorktreeInfo, getRepoSlug } from '../detection/git.ts';
import { extractJiraFromBranch } from '../detection/jira.ts';
import { listPRs } from '../detection/pr.ts';
import { collectLiveSessions } from '../util/process.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';
import { writeStatusCache } from '../store/status-cache.ts';
import type { StatusCacheData } from '../store/status-cache.ts';
import type { Session } from '../store/schema.ts';
import type { ClaudeSession } from '../claude/sessions.ts';
import { shortId } from '../util/format.ts';
import { capturePreloadedContext } from '../claude/preloaded-context.ts';
import { readTranscriptUsage } from '../claude/usage.ts';

export interface AdoptOptions {
  name?: string;
  json?: boolean;
  allHere?: boolean;
}

async function adoptOne(claudeSession: ClaudeSession, options: AdoptOptions): Promise<Session> {
  const cwd = claudeSession.directory;
  const { id, projectKey } = claudeSession;

  const session = createSession(id, cwd, projectKey, claudeSession.modifiedAt);
  const liveEntry = collectLiveSessions().get(id);
  if (liveEntry) {
    session.state = liveEntry.status === 'busy' ? 'busy' : 'idle';
  } else {
    session.state = 'closed';
  }

  if (options.name) session.name = options.name;

  // Fix 2: Preloaded context (CLAUDE.md hierarchy, MCP servers, memory index)
  const preloaded = capturePreloadedContext(cwd, projectKey);
  session.context = { reads: {}, ...preloaded };

  // Fix 3: Cost for closed sessions (no future hook will compute it)
  if (session.state === 'closed') {
    const usage = readTranscriptUsage(claudeSession.transcriptPath, 0);
    if (usage && usage.cost_usd > 0) session.cost_usd = usage.cost_usd;
  }

  // Git detection
  const branch = getCurrentBranch(cwd);
  if (branch) {
    session.resources.branch = branch;
    const jira = extractJiraFromBranch(branch);
    if (jira) session.resources.jira = jira;

    try {
      const prs = listPRs(cwd, 'all');
      const pr = prs.find((p) => p.branch === branch);
      if (pr) session.resources.pr = pr.url;
    } catch { /* gh CLI unavailable or network error */ }
  }

  const worktree = getWorktreeInfo(cwd);
  if (worktree) session.resources.worktree = worktree.name;

  if (process.env.TMUX_PANE) session.resources.tmux_pane = process.env.TMUX_PANE;

  const { customTitle } = getClaudeSessionTitles(id, projectKey);
  if (customTitle) session.meta._custom_title = customTitle;

  // Check if this session is a plan-execution child.
  // The child's transcript carries origin.kind === "auto-continuation" and the exact slug,
  // so match by slug rather than a bare temporal scan.
  const continuationInfo = getPlanContinuationInfo(id);
  if (continuationInfo) {
    const indexedCandidates = Object.entries(readIndex().sessions)
      .filter(([sid, s]) => sid !== id && s.directory === cwd)
      .map(([sid, s]) => ({ id: sid, lastActive: new Date(s.last_active_at) }));
    const untrackedCandidates = getClaudeSessionsForDirectory(cwd)
      .filter((cs) => cs.id !== id && !getSession(cs.id))
      .map((cs) => ({ id: cs.id, lastActive: cs.modifiedAt }));
    const candidates = [...indexedCandidates, ...untrackedCandidates]
      .filter((c) => c.lastActive <= claudeSession.modifiedAt)
      .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());

    for (const candidate of candidates) {
      const planInfo = getPlanExecutionInfo(candidate.id);
      if (planInfo && planInfo.slug === continuationInfo.slug) {
        session.parent_session_id = candidate.id;
        session.resources.plan = planInfo.slug;
        if (!session.name) session.name = planInfo.title ?? planInfo.slug;
        break;
      }
    }
    // Even if no parent was found, record the plan slug from the child transcript.
    if (!session.resources.plan) {
      session.resources.plan = continuationInfo.slug;
      if (!session.name) {
        session.name = extractPlanTitle(continuationInfo.slug) ?? continuationInfo.slug;
      }
    }
  }

  // Self-check: is this session itself a plan-execution parent?
  if (!session.resources.plan) {
    const ownPlanInfo = getPlanExecutionInfo(id);
    if (ownPlanInfo) session.resources.plan = ownPlanInfo.slug;
  }

  await updateIndex((index) => {
    index.sessions[session.id] = session;
    // Backfill parent's resources.plan if we linked to it
    if (session.parent_session_id && session.resources.plan) {
      const parent = index.sessions[session.parent_session_id];
      if (parent && !parent.resources.plan) parent.resources.plan = session.resources.plan;
    }
  });

  const displayTitle = customTitle || options.name || shortId(id);
  setTmuxPaneTitle(displayTitle, session.resources.tmux_pane);

  const repo = getRepoSlug(cwd);
  const cache: StatusCacheData = {
    branch: session.resources.branch,
    repo,
    jira: session.resources.jira,
    jira_base: session.resources.jira ? 'https://machinify.atlassian.net' : undefined,
    worktree: session.resources.worktree,
    worktree_path: worktree?.path,
    name: session.name || undefined,
    state: session.state,
  };
  writeStatusCache(session.id, cache);

  return session;
}

export async function adoptCommand(sessionId: string | undefined, options: AdoptOptions = {}): Promise<void> {
  // Validate mutually exclusive options
  if (options.allHere && sessionId) {
    console.error(chalk.red('--all-here cannot be combined with a session ID.'));
    process.exit(1);
  }
  if (options.allHere && options.name) {
    console.error(chalk.red('--all-here cannot be combined with --name.'));
    process.exit(1);
  }
  if (!options.allHere && !sessionId) {
    console.error(chalk.red('Provide a session ID or use --all-here.'));
    process.exit(1);
  }

  if (options.allHere) {
    const cwd = process.cwd();
    const candidates = getClaudeSessionsForDirectory(cwd);
    const untracked = candidates.filter((s) => !getSession(s.id));

    if (untracked.length === 0) {
      console.log(chalk.dim('No untracked sessions found in current directory.'));
      return;
    }

    const adopted: Session[] = [];
    for (const cs of untracked) {
      const session = await adoptOne(cs, options);
      adopted.push(session);
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(adopted.map((s) => ({
        ...s,
        created_at: s.created_at.toISOString(),
        last_active_at: s.last_active_at.toISOString(),
      }))) + '\n');
      return;
    }

    for (const s of adopted) {
      console.log(chalk.green(`Adopted session ${shortId(s.id)}.`));
    }
    return;
  }

  // Single-session path
  const existing = getSession(sessionId!);
  if (existing) {
    console.error(chalk.red(`Session ${shortId(sessionId!)} is already tracked.`));
    process.exit(1);
  }

  const claudeSession = getClaudeSession(sessionId!);
  if (!claudeSession) {
    console.error(chalk.red(`Session not found in Claude's storage: ${sessionId}`));
    process.exit(1);
  }

  const session = await adoptOne(claudeSession, options);

  if (options.json) {
    process.stdout.write(JSON.stringify({
      ...session,
      created_at: session.created_at.toISOString(),
      last_active_at: session.last_active_at.toISOString(),
    }, null, 2) + '\n');
    return;
  }

  console.log(chalk.green(`Adopted session ${shortId(session.id)}.`));
}

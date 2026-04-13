/**
 * Scout phase: discover missing resource links for a session.
 */

import { existsSync } from 'node:fs';
import { updateIndex } from '../store/index.ts';
import { extractJiraFromBranch, extractJiraTicket, buildJiraUrl } from '../detection/jira.ts';
import { exec } from '../util/exec.ts';
import { debugLog } from '../util/debug.ts';
import type { Session } from '../store/schema.ts';

export interface ScoutResult {
  pr?: string;
  jira?: string;
}

/** Branches that are never meaningful as PR head refs. */
const SKIP_BRANCHES = new Set(['main', 'master', 'develop', 'dev']);

/**
 * Try to find a PR URL from the first non-empty JSON array result.
 */
function parsePRUrl(output: string): string | undefined {
  if (!output) return undefined;
  try {
    const prs = JSON.parse(output) as Array<{ url: string }>;
    return prs[0]?.url;
  } catch {
    return undefined;
  }
}

/**
 * Discover missing PR and Jira links for a session, persisting any found.
 */
export async function scoutLinks(session: Session): Promise<ScoutResult> {
  const result: ScoutResult = {};
  const branch = session.resources.branch;
  const dirExists = existsSync(session.directory);

  // --- Discover PR ---
  if (!session.resources.pr && dirExists) {
    let prUrl: string | undefined;

    // Strategy 1: search by feature branch (skip main/master/etc.)
    if (branch && !SKIP_BRANCHES.has(branch)) {
      const output = exec(
        `gh pr list --head ${branch} --state all --json url --limit 1 2>/dev/null`,
        { cwd: session.directory },
      );
      prUrl = parsePRUrl(output);
      if (prUrl) debugLog(`[refresh:scout] discovered PR ${prUrl} via branch ${branch}`);
    }

    // Strategy 2: search by Jira ticket in PR title
    if (!prUrl) {
      const jiraRef = session.resources.jira ?? (branch ? extractJiraFromBranch(branch) : undefined);
      const ticketId = jiraRef ? extractJiraTicket(jiraRef) : undefined;
      if (ticketId) {
        const output = exec(
          `gh pr list --search "${ticketId} in:title" --state all --json url --limit 1 2>/dev/null`,
          { cwd: session.directory },
        );
        prUrl = parsePRUrl(output);
        if (prUrl) debugLog(`[refresh:scout] discovered PR ${prUrl} via Jira ticket ${ticketId}`);
      }
    }

    // Strategy 3: search by session name (may contain ticket or descriptive text)
    if (!prUrl && session.name) {
      const nameTicket = extractJiraTicket(session.name);
      if (nameTicket) {
        const output = exec(
          `gh pr list --search "${nameTicket} in:title" --state all --json url --limit 1 2>/dev/null`,
          { cwd: session.directory },
        );
        prUrl = parsePRUrl(output);
        if (prUrl) debugLog(`[refresh:scout] discovered PR ${prUrl} via session name ticket ${nameTicket}`);
      }
    }

    if (prUrl) result.pr = prUrl;
  }

  // --- Discover Jira from branch name ---
  if (!session.resources.jira && branch) {
    const ticketId = extractJiraFromBranch(branch);
    if (ticketId) {
      result.jira = buildJiraUrl(ticketId);
      debugLog(`[refresh:scout] discovered Jira ${ticketId} from branch ${branch}`);
    }
  }

  // --- Persist discovered links ---
  if (result.pr || result.jira) {
    await updateIndex((index) => {
      const s = index.sessions[session.id];
      if (!s) return;
      if (result.pr) s.resources.pr = result.pr;
      if (result.jira) s.resources.jira = result.jira;
    });
  }

  return result;
}

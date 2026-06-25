/**
 * c repair [id] - auto-fix inconsistent session state
 */

import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { readIndex, resolveSession, updateIndex } from '../store/index.ts';
import { listSessionStateIds, deleteSessionStateDir } from '../store/session-state.ts';
import { getCurrentBranch, getRepoSlug } from '../detection/git.ts';
import { extractJiraFromBranch } from '../detection/jira.ts';
import { listPRs } from '../detection/pr.ts';
import { ambiguityError, getDisplayName, shortId } from '../util/format.ts';
import { collectLiveSessionIds, isProcessAlive } from '../util/process.ts';
import { findTranscriptPath, getCwdFromTranscriptHead, getCustomTitleFromTranscriptTail, getPlanExecutionInfo, getPlanContinuationInfo, encodeProjectKey } from '../claude/sessions.ts';
import { readTranscriptUsage } from '../claude/usage.ts';
import { readTranscriptInventory, applyInventoryDelta } from '../claude/context-inventory.ts';
import { reconcileDirectory } from './resume.ts';
import type { Session, SessionContextInventory } from '../store/schema.ts';


export interface RepairOptions {
  thorough?: boolean;
  quiet?: boolean;
}

/**
 * Repair session index inconsistencies.
 *
 * Fast mode (default): < 1s, no network, no transcript reads. Fixes structural
 * invariants only — stale PIDs, stuck active states, branches detectable from
 * live git. Safe to run automatically (e.g. on a schedule).
 *
 * Thorough mode (--thorough): slow, reads every reachable transcript, hits the
 * GitHub API. Rebuilds ALL derived fields from primary sources. The goal is that
 * `repair --thorough` should restore a session index to a fully-correct state
 * given only the raw Claude transcript files. When adding a new derived field to
 * the session schema, add its backfill here so --thorough remains the canonical
 * "restore from scratch" command.
 */
export async function repairCommand(idOrPrefix?: string, options: RepairOptions = {}): Promise<void> {
  const { thorough = false, quiet = false } = options;
  const fixes: string[] = [];

  // If ID provided, scope to that session only
  let targetSession: Session | undefined;
  if (idOrPrefix) {
    const result = resolveSession(idOrPrefix);
    if (!result.session) {
      console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
      process.exit(1);
    }
    targetSession = result.session;
  }


  const liveSessionIds = collectLiveSessionIds();

  // Fix index issues in a single updateIndex call
  await updateIndex((index) => {
    const sessions = targetSession
      ? { [targetSession.id]: index.sessions[targetSession.id] }
      : index.sessions;

    for (const [id, session] of Object.entries(sessions)) {
      if (!session) continue;
      const label = `${shortId(id)} ${getDisplayName(session) || '(unnamed)'}`;

      // 0. Stale/mis-decoded directory — heal from the transcript's recorded cwd.
      // Runs first so the enrichment steps below act on the corrected path. The
      // findTranscriptPath scan is gated on the directory actually being missing,
      // so clean sessions pay no extra I/O.
      if (!existsSync(session.directory)) {
        const transcriptPath = findTranscriptPath(id);
        const claudeDir = transcriptPath ? getCwdFromTranscriptHead(transcriptPath) ?? undefined : undefined;
        const healedDir = reconcileDirectory(session.directory, claudeDir);
        if (healedDir) {
          session.directory = healedDir;
          session.project_key = encodeProjectKey(healedDir);
          fixes.push(`Healed directory for ${label} → ${healedDir}`);
        }
      }

      // 1. Stale PIDs — process no longer exists
      if (session.pid != null && !isProcessAlive(session.pid)) {
        fixes.push(`Cleared stale PID ${session.pid} on ${label}`);
        delete session.pid;
        if (['busy', 'idle', 'waiting'].includes(session.state)) {
          session.state = 'closed';
          fixes.push(`Closed ${label} (process dead)`);
        }
      }

      // 2. Stuck active states — no PID
      if (['busy', 'idle', 'waiting'].includes(session.state) && session.pid == null) {
        if (!liveSessionIds.has(id)) {
          session.state = 'closed';
          fixes.push(`Closed stuck ${label} (no PID, no running process)`);
        }
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

      // 6. Backfill plan slug from transcript
      if (!session.resources.plan) {
        const planInfo = getPlanExecutionInfo(id);
        if (planInfo) {
          session.resources.plan = planInfo.slug;
          fixes.push(`Detected plan ${planInfo.slug} for ${label}`);
        }
      }

      // 7. Backfill branch for closed sessions
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

  // Stale per-session state dir — only when repairing all sessions
  if (!targetSession) {
    const index = readIndex();
    const indexIds = new Set(Object.keys(index.sessions));
    for (const stateId of listSessionStateIds()) {
      if (!indexIds.has(stateId)) {
        deleteSessionStateDir(stateId);
        fixes.push(`Deleted stale state dir for ${shortId(stateId)}`);
      }
    }
  }

  // --- Phase 2: Thorough-only steps requiring network/disk outside the lock ---
  if (thorough) {
    const index = readIndex();
    const sessions = targetSession
      ? { [targetSession.id]: index.sessions[targetSession.id] }
      : index.sessions;

    // 8. Backfill PR from GitHub — group by repo, one API call per repo
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

    // 9. Backfill cost from transcript
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

    // 10. Backfill parent_session_id for plan-execution children.
    // A session is a child iff its own transcript says origin.kind === "auto-continuation".
    // Match parent by slug (same slug the parent's ExitPlanMode call recorded).
    // Re-verifies existing links so wrong links are replaced or cleared.
    const parentLinkFixes: Array<{ id: string; parentId: string; slug: string }> = [];
    const parentClearFixes: string[] = [];
    const slugOnlyFixes: Array<{ id: string; slug: string }> = [];

    for (const [id, session] of Object.entries(sessions)) {
      if (!session) continue;

      const continuationInfo = getPlanContinuationInfo(id);
      if (!continuationInfo) continue;  // not a continuation — leave any parent link alone

      const targetSlug = session.resources.plan ?? continuationInfo.slug;

      // Verify any existing link before re-searching.
      if (session.parent_session_id) {
        const existingExec = getPlanExecutionInfo(session.parent_session_id);
        if (existingExec?.slug === targetSlug) continue;  // correct link, nothing to do
        // Wrong link — fall through to find the correct parent.
      }

      const potentialParents = Object.entries(sessions)
        .filter(([pid, ps]) => pid !== id && ps?.directory === session.directory)
        .filter(([, ps]) => new Date(ps!.last_active_at) <= new Date(session.created_at))
        .sort(([, a], [, b]) => new Date(b!.last_active_at).getTime() - new Date(a!.last_active_at).getTime());

      let found = false;
      for (const [parentId] of potentialParents) {
        const planInfo = getPlanExecutionInfo(parentId);
        if (planInfo && planInfo.slug === targetSlug) {
          parentLinkFixes.push({ id, parentId, slug: targetSlug });
          found = true;
          break;
        }
      }
      if (!found) {
        if (session.parent_session_id) {
          // Had a wrong link and no correct replacement in the index — clear it.
          parentClearFixes.push(id);
        }
        if (!session.resources.plan) {
          slugOnlyFixes.push({ id, slug: continuationInfo.slug });
        }
      }
    }

    // 11. Rebuild context reads/skills inventory from transcript for sessions
    // where it was never accumulated (e.g. adopted sessions).
    const inventoryFixes: Array<{ id: string; context: SessionContextInventory; offset: string; turn: string }> = [];
    for (const [id, session] of Object.entries(sessions)) {
      if (!session) continue;
      if (session.context?.reads && Object.keys(session.context.reads).length > 0) continue;
      if (session.meta?._inventory_offset) continue; // already processed (may have 0 reads)
      const transcriptPath = findTranscriptPath(id);
      if (!transcriptPath) continue;
      const delta = readTranscriptInventory(transcriptPath, 0, 0, session.directory);
      if (!delta || (delta.reads.length === 0 && delta.skills.length === 0)) continue;
      const { claude_md, claude_md_imports, memory_index, mcp_servers } = session.context ?? {};
      const freshContext: SessionContextInventory = { reads: {}, claude_md, claude_md_imports, memory_index, mcp_servers };
      applyInventoryDelta(freshContext, delta);
      inventoryFixes.push({ id, context: freshContext, offset: String(delta.new_offset), turn: String(delta.new_turn) });
    }

    // Apply phase 2 fixes in a single updateIndex call
    if (prFixes.length > 0 || costFixes.length > 0 || parentLinkFixes.length > 0 || parentClearFixes.length > 0 || slugOnlyFixes.length > 0 || inventoryFixes.length > 0) {
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
        for (const { id, parentId, slug } of parentLinkFixes) {
          const s = idx.sessions[id];
          if (!s) continue;
          s.parent_session_id = parentId;
          if (!s.resources.plan) s.resources.plan = slug;
          const label = `${shortId(id)} ${getDisplayName(s) || '(unnamed)'}`;
          fixes.push(`Linked ${label} → parent ${shortId(parentId)}`);
        }
        for (const id of parentClearFixes) {
          const s = idx.sessions[id];
          if (!s) continue;
          delete s.parent_session_id;
          const label = `${shortId(id)} ${getDisplayName(s) || '(unnamed)'}`;
          fixes.push(`Cleared wrong parent link for ${label}`);
        }
        for (const { id, slug } of slugOnlyFixes) {
          const s = idx.sessions[id];
          if (!s) continue;
          s.resources.plan = slug;
          const label = `${shortId(id)} ${getDisplayName(s) || '(unnamed)'}`;
          fixes.push(`Set plan slug ${slug} for ${label} (parent not indexed)`);
        }
        for (const { id, context, offset, turn } of inventoryFixes) {
          const s = idx.sessions[id];
          if (!s) continue;
          s.context = context;
          s.meta._inventory_offset = offset;
          s.meta._inventory_turn = turn;
          const label = `${shortId(id)} ${getDisplayName(s) || '(unnamed)'}`;
          fixes.push(`Rebuilt context inventory for ${label} (${Object.keys(context.reads).length} reads)`);
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

/**
 * Branch health check: existence, ahead/behind, conflicts, touched files.
 */

import { exec } from '../../util/exec.ts';
import type { BranchHealth, Finding } from '../types.ts';

/**
 * Detect the default branch (main or master) for the repo.
 */
function getDefaultBranch(cwd: string): string {
  // Check remote HEAD
  const remote = exec('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null', { cwd });
  if (remote) {
    const match = remote.match(/refs\/remotes\/origin\/(.+)/);
    if (match) return match[1];
  }
  // Fallback: check if main exists, else master
  const mainExists = exec('git rev-parse --verify refs/remotes/origin/main 2>/dev/null', { cwd });
  return mainExists ? 'main' : 'master';
}

export function checkBranch(branch: string, cwd: string): { health: BranchHealth; findings: Finding[] } {
  const findings: Finding[] = [];
  const defaultBranch = getDefaultBranch(cwd);

  // Check if branch exists locally
  const localExists = !!exec(`git rev-parse --verify refs/heads/${branch} 2>/dev/null`, { cwd });
  // Check if branch exists on remote
  const remoteExists = !!exec(`git ls-remote --heads origin ${branch} 2>/dev/null`, { cwd });
  const exists = localExists || remoteExists;

  if (!exists) {
    findings.push({
      key: 'branch_deleted',
      severity: 'action',
      summary: `Branch "${branch}" no longer exists locally or on remote`,
    });
    return {
      health: { exists: false, ahead: 0, behind: 0, hasConflict: false, touchedFiles: [] },
      findings,
    };
  }

  // Use local ref if available, otherwise remote tracking ref
  const ref = localExists ? branch : `origin/${branch}`;

  // Ahead/behind relative to default branch
  let ahead = 0;
  let behind = 0;
  const countOutput = exec(
    `git rev-list --left-right --count ${ref}...origin/${defaultBranch} 2>/dev/null`,
    { cwd },
  );
  if (countOutput) {
    const parts = countOutput.split(/\s+/);
    ahead = parseInt(parts[0], 10) || 0;
    behind = parseInt(parts[1], 10) || 0;
  }

  // Conflict detection via merge-tree (git 2.38+)
  let hasConflict = false;
  let conflictFiles: string[] | undefined;

  // Try modern merge-tree first
  const mergeBase = exec(`git merge-base origin/${defaultBranch} ${ref} 2>/dev/null`, { cwd });
  if (mergeBase) {
    // Old 3-arg form works across git versions
    const mergeTree = exec(
      `git merge-tree ${mergeBase} origin/${defaultBranch} ${ref} 2>/dev/null`,
      { cwd },
    );
    if (mergeTree && mergeTree.includes('<<<<<<<')) {
      hasConflict = true;
      // Extract conflicting file names from merge-tree output
      const fileMatches = mergeTree.matchAll(/^changed in both\n\s+base\s+\d+ \S+ \S+\n\s+our\s+\d+ \S+ \S+\n\s+their\s+\d+ \S+ (\S+)/gm);
      conflictFiles = [...fileMatches].map((m) => m[1]).filter(Boolean);
      if (conflictFiles.length === 0) {
        // Fallback: try to extract from conflict markers
        conflictFiles = undefined;
      }
    }
  }

  // Touched files
  const diffOutput = exec(
    `git diff --name-only origin/${defaultBranch}...${ref} 2>/dev/null`,
    { cwd },
  );
  const touchedFiles = diffOutput ? diffOutput.split('\n').filter(Boolean) : [];

  // Generate findings
  if (behind > 20) {
    findings.push({
      key: 'branch_behind',
      severity: 'warn',
      summary: `Branch is ${behind} commits behind ${defaultBranch}`,
    });
  }

  if (hasConflict) {
    findings.push({
      key: 'branch_conflict',
      severity: 'action',
      summary: `Branch has merge conflicts with ${defaultBranch}`,
      detail: conflictFiles?.length ? `Conflicting files: ${conflictFiles.join(', ')}` : undefined,
    });
  }

  if (ahead > 0 && behind > 0) {
    findings.push({
      key: 'branch_diverged',
      severity: 'info',
      summary: `Branch is ${ahead} ahead, ${behind} behind ${defaultBranch}`,
    });
  }

  return {
    health: { exists, ahead, behind, hasConflict, conflictFiles, touchedFiles },
    findings,
  };
}

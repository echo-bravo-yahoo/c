/**
 * Git branch and worktree detection
 */

import { exec } from '../util/exec.js';

/**
 * Get the current git branch for a directory
 */
export function getCurrentBranch(cwd?: string): string | undefined {
  const result = exec('git rev-parse --abbrev-ref HEAD', { cwd });
  return result || undefined;
}

/**
 * Get the git root directory
 */
export function getGitRoot(cwd?: string): string | undefined {
  const result = exec('git rev-parse --show-toplevel', { cwd });
  return result || undefined;
}

/**
 * Check if the directory is a worktree
 */
export function isWorktree(cwd?: string): boolean {
  const gitDir = exec('git rev-parse --git-dir', { cwd });
  return gitDir.includes('.worktrees') || gitDir.includes('worktrees');
}

/**
 * Get worktree info if in a worktree
 */
export function getWorktreeInfo(cwd?: string): { name: string; path: string } | undefined {
  if (!isWorktree(cwd)) {
    return undefined;
  }

  const root = getGitRoot(cwd);
  if (!root) return undefined;

  // Extract worktree name from path (.worktrees/ or .claude/worktrees/)
  const match = root.match(/\.(?:claude\/)?worktrees\/([^/]+)/);
  if (match) {
    return { name: match[1], path: root };
  }

  return undefined;
}

/**
 * Get all worktrees for a repository
 */
export function listWorktrees(cwd?: string): Array<{ path: string; branch: string }> {
  const output = exec('git worktree list --porcelain', { cwd });
  if (!output) return [];

  const worktrees: Array<{ path: string; branch: string }> = [];
  let currentPath = '';

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice(9);
    } else if (line.startsWith('branch ') && currentPath) {
      const branch = line.slice(7).replace('refs/heads/', '');
      worktrees.push({ path: currentPath, branch });
      currentPath = '';
    }
  }

  return worktrees;
}

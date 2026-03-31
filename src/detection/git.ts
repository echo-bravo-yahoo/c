/**
 * Git branch and worktree detection
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import TOML from '@iarna/toml';
import { exec } from '../util/exec.ts';
import { getStoreDir } from '../store/index.ts';

// Process-level cache for getRepoSlug (avoids repeated git calls)
const _repoSlugCache = new Map<string, string | undefined>();

// --- Persistent disk cache for repo slugs ---

const SLUG_CACHE_PATH = path.join(getStoreDir(), 'repo-slugs.toml');
const SLUG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SlugCacheEntry {
  slug: string; // empty string means "no slug" (non-GitHub or missing dir)
  timestamp: number;
}

let _slugDiskCache: Map<string, SlugCacheEntry> | null = null;
let _slugDiskCacheDirty = false;

function loadSlugDiskCache(): Map<string, SlugCacheEntry> {
  if (_slugDiskCache) return _slugDiskCache;
  _slugDiskCache = new Map();

  try {
    if (fs.existsSync(SLUG_CACHE_PATH)) {
      const content = fs.readFileSync(SLUG_CACHE_PATH, 'utf-8');
      const raw = TOML.parse(content) as Record<string, unknown>;
      const entries = (raw.entries ?? {}) as Record<string, Record<string, unknown>>;
      const now = Date.now();
      for (const [dir, entry] of Object.entries(entries)) {
        const timestamp = Number(entry.timestamp ?? 0);
        if (now - timestamp < SLUG_CACHE_TTL_MS) {
          _slugDiskCache.set(dir, {
            slug: String(entry.slug ?? ''),
            timestamp,
          });
        }
      }
    }
  } catch {
    // Ignore corrupt cache
  }

  return _slugDiskCache;
}

function saveSlugDiskCache(): void {
  if (!_slugDiskCacheDirty || !_slugDiskCache) return;

  const entries: Record<string, Record<string, unknown>> = {};
  for (const [dir, entry] of _slugDiskCache) {
    entries[dir] = { slug: entry.slug, timestamp: entry.timestamp };
  }

  try {
    fs.writeFileSync(SLUG_CACHE_PATH, TOML.stringify({ entries } as TOML.JsonMap));
    _slugDiskCacheDirty = false;
  } catch {
    // Ignore write errors
  }
}

// Flush disk cache on process exit
process.on('exit', saveSlugDiskCache);

/**
 * Reset git caches (for testing)
 */
export function resetGitCaches(): void {
  _repoSlugCache.clear();
  _slugDiskCache = null;
  _slugDiskCacheDirty = false;
}

/**
 * Get the current git branch for a directory
 */
export function getCurrentBranch(cwd?: string): string | undefined {
  const result = exec('git rev-parse --abbrev-ref HEAD', { cwd });
  return result || undefined;
}

/**
 * Check if a git repo has at least one commit (HEAD is resolvable)
 */
export function hasCommits(cwd?: string): boolean {
  return !!exec('git rev-parse HEAD', { cwd });
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
 * Extract the parent repository root from a worktree path.
 * Recognizes both .worktrees/ and .claude/worktrees/ layouts.
 * Returns null if the path is not inside a worktree.
 */
export function extractRepoRoot(dir: string): string | null {
  const match = dir.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
  return match ? match[1] : null;
}

/**
 * Get the org/repo slug from the GitHub remote URL.
 * Uses a persistent disk cache to avoid spawning git subprocesses on every invocation.
 */
export function getRepoSlug(cwd?: string): string | undefined {
  const key = cwd ?? '';
  if (_repoSlugCache.has(key)) return _repoSlugCache.get(key);

  // Resolve worktree paths to parent repo to avoid redundant git calls
  const repoRoot = extractRepoRoot(key);
  if (repoRoot) {
    const slug = getRepoSlug(repoRoot);
    _repoSlugCache.set(key, slug);
    return slug;
  }

  // Check persistent disk cache before spawning git
  const diskCache = loadSlugDiskCache();
  const cached = diskCache.get(key);
  if (cached) {
    const slug = cached.slug || undefined;
    _repoSlugCache.set(key, slug);
    return slug;
  }

  // Skip git call if directory doesn't exist (deleted worktrees, etc.)
  if (key && !fs.existsSync(key)) {
    _repoSlugCache.set(key, undefined);
    diskCache.set(key, { slug: '', timestamp: Date.now() });
    _slugDiskCacheDirty = true;
    return undefined;
  }

  const url = exec('git remote get-url origin', { cwd });
  if (!url) {
    _repoSlugCache.set(key, undefined);
    diskCache.set(key, { slug: '', timestamp: Date.now() });
    _slugDiskCacheDirty = true;
    return undefined;
  }

  // HTTPS: https://github.com/org/repo.git
  // SSH: git@github.com:org/repo.git
  const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  const slug = match?.[1];
  _repoSlugCache.set(key, slug);
  diskCache.set(key, { slug: slug ?? '', timestamp: Date.now() });
  _slugDiskCacheDirty = true;
  return slug;
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

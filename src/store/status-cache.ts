/**
 * Per-session status cache for the statusline script
 *
 * Writes a sourceable key=value file per session at ~/.c/status/{sessionId}.
 * The statusline script sources this file instead of parsing TOML.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function getStoreDir(): string {
  return process.env.C_HOME || path.join(os.homedir(), '.c');
}

function getStatusDir(): string {
  return path.join(getStoreDir(), 'status');
}

function getCachePath(sessionId: string): string {
  return path.join(getStatusDir(), sessionId);
}

/**
 * Shell-escape a value for safe sourcing
 */
function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export interface StatusCacheData {
  branch?: string;
  repo?: string;
  jira?: string;
  jira_base?: string;
  pr?: string;
  worktree?: string;
  worktree_path?: string;
}

/**
 * Write a sourceable status cache file for a session
 */
export function writeStatusCache(sessionId: string, data: StatusCacheData): void {
  const dir = getStatusDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = [];
  const fields: Array<[string, string | undefined]> = [
    ['BRANCH', data.branch],
    ['REPO', data.repo],
    ['JIRA', data.jira],
    ['JIRA_BASE', data.jira_base],
    ['PR', data.pr],
    ['WORKTREE', data.worktree],
    ['WORKTREE_PATH', data.worktree_path],
  ];

  for (const [key, value] of fields) {
    if (value) {
      lines.push(`${key}=${shellEscape(value)}`);
    }
  }

  fs.writeFileSync(getCachePath(sessionId), lines.join('\n') + '\n');
}

/**
 * Delete the status cache file for a session
 */
export function deleteStatusCache(sessionId: string): void {
  try {
    fs.unlinkSync(getCachePath(sessionId));
  } catch {
    // Silent on ENOENT or missing directory
  }
}

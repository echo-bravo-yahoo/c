/**
 * Per-session status cache for the statusline script
 *
 * Writes a sourceable key=value file at ${state-dir}/status. The statusline
 * script sources this file instead of parsing TOML.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureSessionStateDir } from './session-state.ts';

function getCachePath(sessionId: string): string {
  return path.join(ensureSessionStateDir(sessionId), 'status');
}

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
  name?: string;
  state?: string;
  message_count?: string;
  first_prompt?: string;
  plan?: string;
  ephemeral?: string;
}

export function writeStatusCache(sessionId: string, data: StatusCacheData): void {
  const lines: string[] = [];
  const fields: Array<[string, string | undefined]> = [
    ['BRANCH', data.branch],
    ['REPO', data.repo],
    ['JIRA', data.jira],
    ['JIRA_BASE', data.jira_base],
    ['PR', data.pr],
    ['WORKTREE', data.worktree],
    ['WORKTREE_PATH', data.worktree_path],
    ['NAME', data.name],
    ['STATE', data.state],
    ['MESSAGE_COUNT', data.message_count],
    ['FIRST_PROMPT', data.first_prompt],
    ['PLAN', data.plan],
    ['EPHEMERAL', data.ephemeral],
  ];

  for (const [key, value] of fields) {
    if (value) {
      lines.push(`${key}=${shellEscape(value)}`);
    }
  }

  fs.writeFileSync(getCachePath(sessionId), lines.join('\n') + '\n');
}

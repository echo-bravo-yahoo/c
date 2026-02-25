/**
 * Read Claude's session data from ~/.claude/projects/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

export interface ClaudeSession {
  id: string;
  projectKey: string;
  directory: string;
  transcriptPath: string;
  historyPath: string;
  modifiedAt: Date;
}

/**
 * Decode Claude's project key to a directory path
 * Claude encodes paths by replacing / with -
 */
export function decodeProjectKey(projectKey: string): string {
  // Handle the leading dash that represents root /
  if (projectKey.startsWith('-')) {
    return '/' + projectKey.slice(1).replace(/-/g, '/');
  }
  return projectKey.replace(/-/g, '/');
}

/**
 * Encode a directory path to Claude's project key format
 * Claude replaces both / and . with -
 */
export function encodeProjectKey(directory: string): string {
  return directory.replace(/[/.]/g, '-');
}

/**
 * List all Claude sessions
 */
export function listClaudeSessions(): ClaudeSession[] {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }

  const sessions: ClaudeSession[] = [];

  for (const projectKey of fs.readdirSync(PROJECTS_DIR)) {
    const projectDir = path.join(PROJECTS_DIR, projectKey);
    const stat = fs.statSync(projectDir);

    if (!stat.isDirectory()) continue;

    // Look for session files (UUIDs ending in .jsonl)
    for (const file of fs.readdirSync(projectDir)) {
      if (!file.endsWith('.jsonl')) continue;

      const sessionId = file.replace('.jsonl', '');
      // Validate it looks like a UUID
      if (!/^[0-9a-f-]{36}$/.test(sessionId)) continue;

      const transcriptPath = path.join(projectDir, file);
      const historyPath = path.join(projectDir, sessionId, 'history.jsonl');

      const fileStat = fs.statSync(transcriptPath);

      sessions.push({
        id: sessionId,
        projectKey,
        directory: decodeProjectKey(projectKey),
        transcriptPath,
        historyPath: fs.existsSync(historyPath) ? historyPath : '',
        modifiedAt: fileStat.mtime,
      });
    }
  }

  // Sort by modified time descending
  return sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}

/**
 * Get a specific Claude session by ID
 */
export function getClaudeSession(sessionId: string): ClaudeSession | undefined {
  const sessions = listClaudeSessions();
  return sessions.find((s) => s.id === sessionId || s.id.startsWith(sessionId));
}

/**
 * Get Claude sessions for a specific directory
 */
export function getClaudeSessionsForDirectory(directory: string): ClaudeSession[] {
  const sessions = listClaudeSessions();
  return sessions.filter((s) => s.directory === directory);
}

export interface ClaudeSessionIndex {
  version: number;
  entries: ClaudeSessionIndexEntry[];
  originalPath: string;
}

export interface ClaudeSessionIndexEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  customTitle?: string;
  summary?: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch?: string;
  projectPath: string;
  isSidechain: boolean;
}

/**
 * Read Claude's sessions-index.json for a project
 */
export function readClaudeSessionIndex(projectKey: string): ClaudeSessionIndex | null {
  const indexPath = path.join(PROJECTS_DIR, projectKey, 'sessions-index.json');
  if (!fs.existsSync(indexPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(indexPath, 'utf-8');
    return JSON.parse(content) as ClaudeSessionIndex;
  } catch {
    return null;
  }
}

/**
 * Get session titles from Claude's index
 * Returns { customTitle, summary } so caller can decide priority
 * Searches all project directories since project_key encoding may vary
 */
export function getClaudeSessionTitles(
  sessionId: string,
  _projectKey: string
): { customTitle: string | null; summary: string | null } {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return { customTitle: null, summary: null };
  }

  // Search all project directories for the session
  for (const projectDir of fs.readdirSync(PROJECTS_DIR)) {
    const index = readClaudeSessionIndex(projectDir);
    if (!index) continue;

    const entry = index.entries.find((e) => e.sessionId === sessionId);
    if (entry) {
      return {
        customTitle: entry.customTitle || null,
        summary: entry.summary || null,
      };
    }
  }

  return { customTitle: null, summary: null };
}

export { CLAUDE_DIR, PROJECTS_DIR };

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
 * Get custom title from transcript file by finding the last custom-title entry
 * Claude writes these immediately on /rename, before updating sessions-index.json
 */
function getCustomTitleFromTranscript(transcriptPath: string): string | null {
  if (!fs.existsSync(transcriptPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Search from end to find the most recent custom-title entry
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'custom-title' && entry.customTitle) {
          return entry.customTitle;
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File read error
  }

  return null;
}

/**
 * Get session titles from Claude's index
 * Returns { customTitle, summary } so caller can decide priority
 * Searches all project directories since project_key encoding may vary
 * Falls back to reading custom-title from transcript if not in index
 */
export function getClaudeSessionTitles(
  sessionId: string,
  _projectKey: string
): { customTitle: string | null; summary: string | null } {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return { customTitle: null, summary: null };
  }

  let transcriptPath: string | null = null;

  // Search all project directories for the session
  for (const projectDir of fs.readdirSync(PROJECTS_DIR)) {
    // Check if transcript file exists for this session
    const possibleTranscript = path.join(PROJECTS_DIR, projectDir, `${sessionId}.jsonl`);
    if (fs.existsSync(possibleTranscript)) {
      transcriptPath = possibleTranscript;
    }

    const index = readClaudeSessionIndex(projectDir);
    if (!index) continue;

    const entry = index.entries.find((e) => e.sessionId === sessionId);
    if (entry) {
      // If index has customTitle, use it; otherwise check transcript
      let customTitle = entry.customTitle || null;
      if (!customTitle && transcriptPath) {
        customTitle = getCustomTitleFromTranscript(transcriptPath);
      }
      return {
        customTitle,
        summary: entry.summary || null,
      };
    }
  }

  // Session not in index - check transcript directly for custom title
  if (transcriptPath) {
    return {
      customTitle: getCustomTitleFromTranscript(transcriptPath),
      summary: null,
    };
  }

  return { customTitle: null, summary: null };
}

/**
 * Check if a session ended with ExitPlanMode (plan execution)
 * Returns the plan slug if found, null otherwise
 */
export function getPlanExecutionInfo(sessionId: string): { slug: string } | null {
  const session = getClaudeSession(sessionId);
  if (!session) return null;

  try {
    const content = fs.readFileSync(session.transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Check the last ~10 lines for ExitPlanMode
    const tailLines = lines.slice(-10);
    for (const line of tailLines.reverse()) {
      try {
        const entry = JSON.parse(line);
        // Look for assistant message with ExitPlanMode tool use
        if (
          entry.type === 'assistant' &&
          entry.message?.content &&
          Array.isArray(entry.message.content)
        ) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use' && block.name === 'ExitPlanMode') {
              // Found it - return the slug from the entry
              if (entry.slug) {
                return { slug: entry.slug };
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File read error
  }

  return null;
}

export { CLAUDE_DIR, PROJECTS_DIR };

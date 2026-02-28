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
 * Claude encodes paths by replacing both / and . with -
 * Since the encoding is lossy, we try to find an existing path
 */
export function decodeProjectKey(projectKey: string): string {
  // Handle the leading dash that represents root /
  const withoutLeading = projectKey.startsWith('-') ? projectKey.slice(1) : projectKey;
  const parts = withoutLeading.split('-');

  // Try to reconstruct the path by checking which interpretation exists
  // Start with root /
  let current = '/';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // Try appending as a new path segment first
    const asSegment = path.join(current, part);
    if (fs.existsSync(asSegment)) {
      current = asSegment;
      continue;
    }

    // Try appending with a dot (e.g., "ashton" + "eby" -> "ashton.eby")
    if (current !== '/') {
      const withDot = current + '.' + part;
      if (fs.existsSync(withDot)) {
        current = withDot;
        continue;
      }
    }

    // Neither exists yet, default to path segment
    current = asSegment;
  }

  return current;
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
 * Find session IDs across all projects whose customTitle matches exactly
 */
export function findClaudeSessionIdsByTitle(title: string): string[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const ids: string[] = [];
  for (const projectDir of fs.readdirSync(PROJECTS_DIR)) {
    const index = readClaudeSessionIndex(projectDir);
    if (!index) continue;
    for (const entry of index.entries) {
      if (entry.customTitle === title) ids.push(entry.sessionId);
    }
  }
  return ids;
}

const PLANS_DIR = path.join(CLAUDE_DIR, 'plans');

/**
 * Extract the H1 title from a plan file
 * Plan files start with "# Plan: <title>" or just "# <title>"
 */
function extractPlanTitle(slug: string): string | null {
  const planPath = path.join(PLANS_DIR, `${slug}.md`);
  if (!fs.existsSync(planPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(planPath, 'utf-8');
    const firstLine = content.split('\n')[0];
    // Match "# Plan: Title" or "# Title"
    const match = firstLine.match(/^#\s+(?:Plan:\s*)?(.+)$/);
    if (match) {
      return match[1].trim();
    }
  } catch {
    // File read error
  }

  return null;
}

/**
 * Check if a session ended with ExitPlanMode (plan execution)
 * Returns the plan title (extracted from file) and slug if found
 */
export function getPlanExecutionInfo(sessionId: string): { slug: string; title: string | null } | null {
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
              // Found it - return the slug and title from the plan file
              if (entry.slug) {
                const title = extractPlanTitle(entry.slug);
                return { slug: entry.slug, title };
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

/**
 * Find the transcript path for a session ID by scanning PROJECTS_DIR
 */
export function findTranscriptPath(sessionId: string): string | null {
  if (!fs.existsSync(PROJECTS_DIR)) return null;

  for (const projectDir of fs.readdirSync(PROJECTS_DIR)) {
    const candidate = path.join(PROJECTS_DIR, projectDir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Search backward through a transcript file for the most recent custom-title entry.
 * Reads 16KB chunks working from the end of the file to avoid loading entire transcripts
 * (which can be 500KB+ with thinking blocks and signatures).
 */
export function getCustomTitleFromTranscriptTail(transcriptPath: string): string | null {
  const CHUNK_SIZE = 16384;

  let fd: number;
  try {
    fd = fs.openSync(transcriptPath, 'r');
  } catch {
    return null;
  }

  try {
    const size = fs.fstatSync(fd).size;
    if (size === 0) return null;

    let pos = size;
    let leftover = '';

    while (pos > 0) {
      const readSize = Math.min(CHUNK_SIZE, pos);
      pos -= readSize;
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, pos);

      const chunk = buf.toString('utf-8') + leftover;
      const lines = chunk.split('\n');

      // First line may be partial (split at chunk boundary) — save for next iteration
      leftover = lines[0];

      // Search backward through complete lines
      for (let i = lines.length - 1; i >= 1; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        // Fast check before JSON.parse
        if (!line.includes('"custom-title"')) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'custom-title' && entry.customTitle) {
            return entry.customTitle;
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Check leftover (first line of file)
    if (leftover.trim() && leftover.includes('"custom-title"')) {
      try {
        const entry = JSON.parse(leftover.trim());
        if (entry.type === 'custom-title' && entry.customTitle) {
          return entry.customTitle;
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Read error
  } finally {
    fs.closeSync(fd);
  }

  return null;
}

export { CLAUDE_DIR, PROJECTS_DIR };

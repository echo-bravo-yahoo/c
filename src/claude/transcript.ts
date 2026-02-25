/**
 * Parse Claude's transcript.jsonl files
 */

import * as fs from 'node:fs';

export interface TranscriptEntry {
  type: string;
  timestamp: string;
  message?: {
    role: string;
    content: unknown;
  };
  sessionId?: string;
  cwd?: string;
  // Tool use entries
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
}

/**
 * Read and parse a transcript file
 */
export function readTranscript(transcriptPath: string): TranscriptEntry[] {
  if (!fs.existsSync(transcriptPath)) {
    return [];
  }

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const entries: TranscriptEntry[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;

    try {
      entries.push(JSON.parse(line) as TranscriptEntry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Get the first timestamp from a transcript (session start)
 */
export function getSessionStartTime(transcriptPath: string): Date | undefined {
  const entries = readTranscript(transcriptPath);

  for (const entry of entries) {
    if (entry.timestamp) {
      return new Date(entry.timestamp);
    }
  }

  return undefined;
}

/**
 * Get the last timestamp from a transcript (last activity)
 */
export function getSessionLastActivity(transcriptPath: string): Date | undefined {
  const entries = readTranscript(transcriptPath);

  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].timestamp) {
      return new Date(entries[i].timestamp);
    }
  }

  return undefined;
}

/**
 * Extract branch from git commands in transcript
 */
export function extractBranchFromTranscript(transcriptPath: string): string | undefined {
  const entries = readTranscript(transcriptPath);

  // Look for git branch info in Bash tool outputs
  for (const entry of entries) {
    if (entry.toolName === 'Bash' && entry.toolOutput) {
      // Look for branch patterns
      const branchMatch = entry.toolOutput.match(/On branch ([^\s\n]+)/);
      if (branchMatch) {
        return branchMatch[1];
      }

      // Look for checkout patterns
      const checkoutMatch = entry.toolOutput.match(/Switched to branch '([^']+)'/);
      if (checkoutMatch) {
        return checkoutMatch[1];
      }
    }
  }

  return undefined;
}

/**
 * Extract PR URLs from transcript
 */
export function extractPRsFromTranscript(transcriptPath: string): string[] {
  const entries = readTranscript(transcriptPath);
  const prs = new Set<string>();

  for (const entry of entries) {
    if (entry.toolOutput) {
      // Match GitHub PR URLs
      const prMatches = entry.toolOutput.matchAll(
        /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/g
      );
      for (const match of prMatches) {
        prs.add(match[0]);
      }
    }
  }

  return Array.from(prs);
}

/**
 * Extract JIRA ticket IDs from transcript
 */
export function extractJiraFromTranscript(transcriptPath: string): string[] {
  const entries = readTranscript(transcriptPath);
  const tickets = new Set<string>();

  for (const entry of entries) {
    // Check tool outputs and message content
    const text = entry.toolOutput ?? JSON.stringify(entry.message?.content ?? '');

    // Match JIRA ticket patterns (e.g., MAC-1234, PROJ-567)
    const ticketMatches = text.matchAll(/\b([A-Z]{2,10}-\d+)\b/g);
    for (const match of ticketMatches) {
      tickets.add(match[1]);
    }
  }

  return Array.from(tickets);
}

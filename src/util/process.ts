/**
 * Process signaling utilities for session management
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

/** Shape of ~/.claude/sessions/<pid>.json written by Claude Code. */
export interface ClaudeSessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  entrypoint: string;
  kind: string;
  name: string | null;
  peerProtocol: number | null;
  procStart: string | null;
  status: string | null;
  statusUpdatedAt: number | null;
  updatedAt: number | null;
  version: string | null;
  waitingFor: string | null;
}

/**
 * Check if a process is alive via kill(pid, 0).
 * Returns true if alive (or EPERM), false if dead (ESRCH).
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** Returns a Map<sessionId, ClaudeSessionFile> for all live Claude Code sessions. */
export function collectLiveSessions(): Map<string, ClaudeSessionFile> {
  const sessions = new Map<string, ClaudeSessionFile>();
  const sessionsDir = join(homedir(), '.claude', 'sessions');
  try {
    for (const file of readdirSync(sessionsDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const entry = JSON.parse(readFileSync(join(sessionsDir, file), 'utf-8')) as ClaudeSessionFile;
        if (entry.sessionId && isProcessAlive(entry.pid)) sessions.set(entry.sessionId, entry);
      } catch { /* malformed file or process check failed */ }
    }
  } catch { /* directory missing or unreadable */ }
  return sessions;
}

/**
 * Collect session IDs of all live Claude Code sessions by reading
 * ~/.claude/sessions/<pid>.json and checking each PID is still alive.
 */
export function collectLiveSessionIds(): Set<string> {
  return new Set(collectLiveSessions().keys());
}

/**
 * Check if a Claude Code session is still running.
 * Use collectLiveSessionIds() when checking multiple sessions.
 */
export function isTranscriptOpen(sessionId: string): boolean {
  return collectLiveSessions().has(sessionId);
}

/**
 * Wait for a process to exit by polling kill(pid, 0).
 * Returns true if the process exited, false on timeout.
 */
async function waitForExit(pid: number, timeoutMs = 5000, intervalMs = 100): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0);
      await new Promise((r) => setTimeout(r, intervalMs));
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Send SIGINT to a session process and wait for exit.
 * No-ops when pid is undefined. Handles ESRCH (already dead).
 */
export async function signalSession(pid: number | undefined): Promise<void> {
  if (!pid) return;
  try {
    process.kill(pid, 'SIGINT');
    const exited = await waitForExit(pid);
    if (!exited) {
      console.log(chalk.yellow(`Process ${pid} did not exit within timeout.`));
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
  }
}
